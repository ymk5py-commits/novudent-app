/**
 * Puente para transcribir test/firestore-rules.test.mjs caso por caso: las mismas operaciones (getDoc, setDoc, updateDoc, deleteDoc,
 * getDocs) con las mismas rutas de Firestore, ejecutadas contra Postgres como lo haría el adaptador de la fase C, y las mismas dos
 * afirmaciones (`permitido` = assertSucceeds, `denegado` = assertFails).
 *
 * Qué cambia al pasar de Firestore a Postgres (spec del 9-oct §5.2), y cómo se mide «denegado»:
 *   • setDoc sin merge → `guardar` (rpc); con merge → un update que fusiona (o `mezclar_clinica` en el documento de la clínica);
 *     updateDoc de un campo → `fijar_campo`. Denegado = Postgres rechaza con un error (42501…).
 *   • getDoc: la RLS no falla, FILTRA. Denegado = la fila existe (se comprueba saltando RLS) y la sesión no la ve. Una prueba de
 *     «denegado» sobre un documento que no existe no prueba nada, y acá falla.
 *   • deleteDoc → `quitar`. Un borrado bloqueado por la política de lectura no da error, afecta 0 filas: denegado = el documento
 *     sigue ahí.
 *   • getDocs: Firestore falla entero si la consulta incluye algo no permitido; Postgres devuelve solo lo permitido. Esas pruebas
 *     se transcriben como «devuelve exactamente lo propio» (marcadas en CASOS.md como diferencia intencional).
 *   • Las cuentas de Firebase eran el id del documento de usuario; ahora la sesión es un uuid de GoTrue y el documento lo apunta con
 *     `authUid` (uuidDe(nombre)). `authed("dentA")` → la sesión de quien tiene ese authUid.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { admin, como, intentar, leerComoAdmin, pool, sembrar, sesiones, TODAS_LAS_TABLAS, TABLAS_CLINICA, uuidDe, RAIZ } from "./entorno.mjs";

export { uuidDe, TABLAS_CLINICA };

/** Equivale a deleteField() de Firestore. */
export const BORRAR = Symbol("deleteField");

// ───────────────────────────── sesiones ─────────────────────────────
/** authed("dentA"): quien tiene ese authUid. "svc1" es el usuario de servicio de las reglas: ahora, la clave service_role. */
export const authed = (nombre) => (nombre === "svc1" ? sesiones.servicio : sesiones.usuario(nombre));
/** anon(): la clave pública SIN sesión (unauthenticatedContext). */
export const anon = () => sesiones.anon;

// ───────────────────────────── rutas ─────────────────────────────
const RAIZ_CON_TABLA = ["subscriptions", "webhookEvents", "leads", "checkoutTokens"];

/** "clinics/clA/patients/p1" → { tabla: "patients", clinicId: "clA", id: "p1" }. Las colecciones sin tabla (directory, serviceAccounts, las
 *  que no existen) quedan con `tabla` pero no en TODAS_LAS_TABLAS. */
export function ruta(p) {
  const s = p.split("/");
  if (s[0] === "clinics") {
    if (s.length === 1) return { tabla: "clinics", clinicId: null, id: null };
    if (s.length === 2) return { tabla: "clinics", clinicId: null, id: s[1] };
    if (s.length === 3) return { tabla: s[2], clinicId: s[1], id: null };
    if (s.length === 4) return { tabla: s[2], clinicId: s[1], id: s[3] };
  }
  if (RAIZ_CON_TABLA.includes(s[0]) || s[0] === "directory" || s[0] === "serviceAccounts") return { tabla: s[0], clinicId: null, id: s[1] ?? null };
  throw new Error(`ruta no entendida: ${p}`);
}
const hayTabla = (tabla) => TODAS_LAS_TABLAS.includes(tabla);
const esRaiz = (r) => r.clinicId === null;
const T = (r) => `public."${r.tabla}"`;

// ───────────────────────────── registro para CASOS.md ─────────────────────────────
const casos = [];
let actual = null;

export function caso(nombre, opciones, fn) {
  if (typeof opciones === "function") { fn = opciones; opciones = {}; }
  const c = { n: casos.length + 1, nombre, ...opciones, pasos: [] };
  casos.push(c);
  return test(`${String(c.n).padStart(3, "0")} · ${nombre}`, async () => {
    actual = c;
    await fn();
  });
}

function registrar(desc, esperado, r) {
  const obtenido = r.ok ? "permitido" : "denegado";
  let mecanismo = "";
  if (!r.ok) mecanismo = r.error ? `error ${r.codigo ?? ""}`.trim() : r.motivo ?? "";
  actual?.pasos.push({ desc, esperado, obtenido, mecanismo });
}

/** assertSucceeds */
export async function permitido(desc, promesa) {
  const r = await promesa;
  registrar(desc, "permitido", r);
  assert.ok(r.ok, `${desc}: Firestore lo permite y Postgres lo denegó (${r.codigo ?? ""} ${r.error ?? r.motivo ?? ""})`);
  return r;
}

/** assertFails */
export async function denegado(desc, promesa) {
  const r = await promesa;
  registrar(desc, "denegado", r);
  if (r.vacio) assert.fail(`${desc}: prueba vacía — ${r.vacio}`);
  assert.ok(!r.ok, `${desc}: Firestore lo deniega y Postgres lo permitió`);
  return r;
}

// ───────────────────────────── operaciones ─────────────────────────────
const json = (x) => JSON.stringify(x);

/** getDoc: `ok` = la fila existe y la sesión la ve. Si no la ve pero existe, `motivo: "no ve la fila"`. */
export async function getDoc(S, p) {
  const r = ruta(p);
  if (!hayTabla(r.tabla)) return { ok: false, lectura: true, motivo: `la colección ${r.tabla} no tiene tabla`, error: null, sinTabla: true };
  const existe = (await leerComoAdmin(r.tabla, r.clinicId, r.id)) !== null;
  const q = esRaiz(r)
    ? await intentar(S, `select data from ${T(r)} where id = $1`, [r.id])
    : await intentar(S, `select data from ${T(r)} where clinic_id = $1 and id = $2`, [r.clinicId, r.id]);
  const data = q.filas[0]?.data ?? null;
  const ok = q.ok && data !== null;
  return {
    ok, data, existe, lectura: true,
    error: q.error, codigo: q.codigo,
    motivo: ok ? "" : q.ok ? "no ve la fila" : "sin permiso sobre la tabla",
    vacio: existe ? null : `el documento ${p} no existe: «no lo ve» no prueba nada`,
  };
}

/** getDocs: devuelve `docs` (lo que la sesión ve) y `existentes` (los ids que hay de verdad, saltando RLS). `filtro` opcional:
 *  { participante: id } ≈ where("participants", "array-contains", id); { campo, valor } ≈ where(campo, "==", valor);
 *  { rango: [campo, desde, hasta] } ≈ where(campo, ">=", desde) + where(campo, "<", hasta). */
export async function getDocs(S, p, filtro = null) {
  const r = ruta(p);
  if (!hayTabla(r.tabla)) return { ok: false, docs: [], existentes: [], motivo: `la colección ${r.tabla} no tiene tabla`, sinTabla: true };
  const params = [];
  const donde = [];
  if (!esRaiz(r)) { params.push(r.clinicId); donde.push(`clinic_id = $${params.length}`); }
  if (filtro?.participante) { params.push(filtro.participante); donde.push(`data -> 'participants' ? $${params.length}`); }
  if (filtro?.campo) { params.push(filtro.valor); donde.push(`data ->> '${filtro.campo}' = $${params.length}`); }
  if (filtro?.rango) { const [c, d, h] = filtro.rango; params.push(d, h); donde.push(`data ->> '${c}' >= $${params.length - 1} and data ->> '${c}' < $${params.length}`); }
  const sql = `select id, data from ${T(r)}${donde.length ? ` where ${donde.join(" and ")}` : ""} order by id`;
  const q = await intentar(S, sql, params);
  const todos = await admin(`select id from ${T(r)}${esRaiz(r) ? "" : " where clinic_id = $1"} order by id`, esRaiz(r) ? [] : [r.clinicId]);
  return {
    ok: q.ok, docs: q.filas, ids: q.filas.map((d) => d.id), existentes: todos.map((d) => d.id),
    error: q.error, codigo: q.codigo, motivo: q.ok ? "" : "sin permiso sobre la tabla",
  };
}

/** setDoc. Con `{ merge: true }` fusiona; sin él reemplaza el documento entero. En los documentos de usuario conserva el `authUid` (el
 *  documento de Firestore no lo tenía: es el vínculo con la cuenta y no forma parte de lo que cada prueba quiere cambiar). */
export async function setDoc(S, p, data, opciones = {}) {
  const r = ruta(p);
  if (r.tabla === "users" && data && typeof data === "object" && !("authUid" in data)) data = { ...data, authUid: uuidDe(r.id) };
  if (opciones.merge) return fusionar(S, r, data);
  return intentar(S, `select public.guardar($1, $2, $3, $4::jsonb)`, [r.tabla, r.clinicId, r.id, json(data)]);
}

async function fusionar(S, r, data) {
  if (r.tabla === "clinics") return intentar(S, `select public.mezclar_clinica($1, $2::jsonb)`, [r.id, json(data)]);
  try {
    const n = await como(S, async (c) => {
      const act = esRaiz(r)
        ? await c.query(`update ${T(r)} set data = interno.fusion_profunda(data, $2::jsonb) where id = $1`, [r.id, json(data)])
        : await c.query(`update ${T(r)} set data = interno.fusion_profunda(data, $3::jsonb) where clinic_id = $1 and id = $2`, [r.clinicId, r.id, json(data)]);
      if (act.rowCount > 0) return act.rowCount;
      const ins = esRaiz(r)
        ? await c.query(`insert into ${T(r)} (id, data) values ($1, $2::jsonb) on conflict do nothing`, [r.id, json(data)])
        : await c.query(`insert into ${T(r)} (clinic_id, id, data) values ($1, $2, $3::jsonb) on conflict do nothing`, [r.clinicId, r.id, json(data)]);
      return ins.rowCount;
    });
    return n > 0 ? { ok: true } : { ok: false, motivo: "sin efecto (0 filas)", error: null };
  } catch (e) {
    return { ok: false, error: e.message, codigo: e.code ?? null };
  }
}

/** updateDoc. Los campos de primer nivel van por `fijar_campo`; si hay varios, o rutas con punto ("config.permisos"), un solo update
 *  del documento con todos los cambios a la vez. BORRAR = deleteField(). */
export async function updateDoc(S, p, campos) {
  const r = ruta(p);
  const claves = Object.keys(campos);
  if (claves.length === 1 && !claves[0].includes(".")) {
    const valor = campos[claves[0]];
    return intentar(S, `select public.fijar_campo($1, $2, $3, $4, $5::jsonb, $6)`, [r.tabla, r.clinicId, r.id, claves[0], valor === BORRAR ? null : json(valor), valor === BORRAR]);
  }
  if (!hayTabla(r.tabla)) return { ok: false, error: `no existe la tabla ${r.tabla}`, codigo: "42P01" };
  let expr = "data";
  const params = esRaiz(r) ? [r.id] : [r.clinicId, r.id];
  for (const k of claves) {
    const v = campos[k];
    const camino = `{${k.split(".").map((x) => `"${x.replaceAll('"', '\\"')}"`).join(",")}}`;
    params.push(camino);
    const i = params.length;
    if (v === BORRAR) expr = `(${expr} #- $${i}::text[])`;
    else { params.push(json(v)); expr = `jsonb_set(${expr}, $${i}::text[], $${params.length}::jsonb, true)`; }
  }
  try {
    const n = await como(S, async (c) => (await c.query(
      `update ${T(r)} set data = ${expr} where ${esRaiz(r) ? "id = $1" : "clinic_id = $1 and id = $2"}`, params)).rowCount);
    return n > 0 ? { ok: true } : { ok: false, motivo: "sin efecto (0 filas)", error: null };
  } catch (e) {
    return { ok: false, error: e.message, codigo: e.code ?? null };
  }
}

/** deleteDoc. Denegado = el documento sigue ahí (con RLS un borrado bloqueado por la política de lectura no da error: afecta 0 filas). */
export async function deleteDoc(S, p) {
  const r = ruta(p);
  if (!hayTabla(r.tabla)) return { ok: false, error: `no existe la tabla ${r.tabla}`, codigo: "42P01" };
  const antes = (await leerComoAdmin(r.tabla, r.clinicId, r.id)) !== null;
  const q = await intentar(S, `select public.quitar($1, $2, $3) as n`, [r.tabla, r.clinicId, r.id]);
  const despues = (await leerComoAdmin(r.tabla, r.clinicId, r.id)) !== null;
  if (!q.ok) return { ok: false, error: q.error, codigo: q.codigo };
  if (antes && despues) return { ok: false, motivo: "sin efecto (0 filas)", error: null };
  return { ok: true };
}

// ───────────────────────────── barridos y consultas ─────────────────────────────
/** Corre `fn(elemento)` sobre cada elemento y exige que TODOS den `esperado` (el `fugas()` de las pruebas de Firestore, pero afirmando). */
export async function barrido(desc, esperado, elementos, fn) {
  const malos = [];
  const mecanismos = new Set();
  for (const e of elementos) {
    const r = await fn(e);
    if (r.vacio) assert.fail(`${desc} · ${etiqueta(e)}: prueba vacía — ${r.vacio}`);
    if (!r.ok && (r.error || r.motivo)) mecanismos.add(r.error ? `error ${r.codigo ?? ""}`.trim() : r.motivo);
    if ((esperado === "denegado") === Boolean(r.ok)) malos.push(`${etiqueta(e)}${r.ok ? "" : ` (${r.codigo ?? r.motivo ?? "denegado"})`}`);
  }
  actual?.pasos.push({ desc: `${desc} (${elementos.length})`, esperado, obtenido: malos.length ? "distinto" : esperado, mecanismo: [...mecanismos].join(", ") });
  assert.deepEqual(malos, [], `${desc}: Firestore da «${esperado}» y Postgres dio otra cosa en: ${malos.join(", ")}`);
}
const etiqueta = (e) => (typeof e === "string" ? e : Array.isArray(e) ? String(e[0]) : JSON.stringify(e));

/** «Consulta filtrada» (spec §5.2): lo que Firestore rechazaba entero, Postgres lo contesta con lo permitido. Para una prueba de «denegado»:
 *  ok = la consulta trajo algo que NO es de esa sesión. Hay que haber algo ajeno que traer (si no, no prueba nada). */
export function consultaFiltrada(r, esPropio, ajenosEsperados = true) {
  if (!r.ok) return { ok: false, error: r.error, codigo: r.codigo, motivo: r.motivo };
  const ajenos = r.docs.filter((d) => !esPropio(d));
  if (ajenosEsperados && r.existentes.length === 0) return { ok: false, vacio: "no hay nada en la colección que la sesión no deba ver" };
  return { ok: ajenos.length > 0, ajenos: ajenos.map((d) => d.id), motivo: "consulta filtrada (lista solo lo propio)" };
}

/** public.mi_directorio(): lo que reemplaza a directory/{uid}. ok = la sesión tiene clínica. */
export async function directorio(S) {
  const q = await intentar(S, `select clinic_id, user_id from public.mi_directorio()`);
  return { ok: q.ok && q.filas.length > 0, filas: q.filas, motivo: "sin clínica asignada", error: q.error, codigo: q.codigo };
}

/** Una colección entera, sin filtrar por clínica (el `collectionGroup` de Firestore): devuelve (clinic_id, id) de todo lo que la sesión ve. */
export async function getTodas(S, tabla) {
  const q = await intentar(S, `select ${TABLAS_CLINICA.includes(tabla) ? "clinic_id," : ""} id from public."${tabla}"`);
  return { ok: q.ok, filas: q.filas, error: q.error, codigo: q.codigo, motivo: q.ok ? "" : "sin permiso sobre la tabla" };
}

// ───────────────────────────── siembra ─────────────────────────────
/** setDoc con las reglas desactivadas (withSecurityRulesDisabled): salta RLS y las reglas por campo. Los usuarios llevan su authUid. */
export async function sembrarRuta(p, data) {
  const r = ruta(p);
  if (!hayTabla(r.tabla)) return; // directory y serviceAccounts no existen
  if (r.tabla === "users" && !("authUid" in data)) data = { ...data, authUid: uuidDe(r.id) };
  await sembrar(r.tabla, r.clinicId, r.id, data);
}

/** merge de la siembra (setDoc con { merge: true } sin reglas). */
export async function sembrarFusion(p, data) {
  const r = ruta(p);
  await pool.query(`select public.mezclar_clinica($1, $2::jsonb)`, [r.id, json(data)]);
}

export async function actualizarComoAdmin(p, campos) {
  const r = ruta(p);
  for (const [k, v] of Object.entries(campos)) {
    await pool.query(`update ${T(r)} set data = jsonb_set(data, $3::text[], $4::jsonb) where clinic_id = $1 and id = $2`, [r.clinicId, r.id, `{${k}}`, json(v)]);
  }
}

// ───────────────────────────── informe ─────────────────────────────
const TOTAL_ESPERADO = 143;

after(() => {
  if (casos.length === 0) return;
  assert.equal(casos.length, TOTAL_ESPERADO, `se esperaban ${TOTAL_ESPERADO} casos transcriptos`);
  // Si algún caso no llegó a correr (o se corrió una parte con --test-name-pattern) no se pisa el informe.
  if (process.env.RLS_MUTACION) return; // una prueba de mutación (se rompe algo a propósito): no es el informe
  const completo = casos.length === TOTAL_ESPERADO && casos.every((c) => c.pasos.length > 0);
  if (!completo) return;
  const estadoDe = (c) => (c.noAplica ? "no aplica" : c.diferencia || c.pasos.some((x) => x.mecanismo.startsWith("consulta filtrada")) ? "diferencia intencional" : "igual");
  const filas = casos.map((c) => {
    const p = c.pasos;
    const permitidos = p.filter((x) => x.esperado === "permitido").length;
    const denegados = p.filter((x) => x.esperado === "denegado").length;
    const mecanismos = [...new Set(p.filter((x) => x.mecanismo).map((x) => x.mecanismo))].join(", ");
    const filtrada = p.some((x) => x.mecanismo.startsWith("consulta filtrada"));
    const estado = estadoDe(c);
    const nota = (c.noAplica ?? c.diferencia ?? (filtrada ? "La consulta se contesta con lo permitido en vez de fallar entera (spec §5.2): «denegado» = no trae nada ajeno." : "")).replaceAll("|", "\\|");
    return `| ${c.n} | ${c.nombre.replaceAll("|", "\\|")} | ${permitidos} / ${denegados} | ${estado} | ${mecanismos || "—"} | ${nota} |`;
  });
  const iguales = casos.filter((c) => estadoDe(c) === "igual").length;
  const md = `# Pruebas de reglas: Firestore → Postgres (caso por caso)

Generado por \`test/rls/reglas.test.mjs\` (\`scripts/supabase/probar-rls.sh\`). **No editar a mano.**
Fuente: \`test/firestore-rules.test.mjs\` (${casos.length} casos, en el mismo orden y con los mismos nombres).

**Criterio de aceptación:** cada \`assertSucceeds\` de Firestore es \`permitido\` en Postgres y cada \`assertFails\` es \`denegado\`.
Si un solo paso difiere, la prueba falla. «Permitidos / denegados» cuenta los pasos de cada caso (lo que dice Firestore, y lo que dio Postgres: es lo mismo).

| | Casos |
|---|---|
| Mismo resultado, sin más | ${iguales} |
| Mismo permitido/denegado, pero el mecanismo cambia (consulta filtrada en vez de fallar entera, etc.) | ${casos.filter((c) => estadoDe(c) === "diferencia intencional").length} |
| No aplica (la colección ya no existe) y lo que lo reemplaza | ${casos.filter((c) => estadoDe(c) === "no aplica").length} |

**Cómo se ve un «denegado» en Postgres** (columna «cómo se deniega»): \`error 42501\` = la base rechaza la operación (política o regla por campo);
\`no ve la fila\` = la RLS la filtra (la fila existe y la sesión no la ve; Firestore fallaba la lectura); \`sin efecto (0 filas)\` = un borrado que la política
no deja pasar no da error, no borra nada; \`la colección … no tiene tabla\` = nada que leer o escribir.

| # | Caso (nombre en Firestore) | Pasos permitidos / denegados | Estado | Cómo se deniega | Nota |
|---|---|---|---|---|---|
${filas.join("\n")}

## Diferencias que no son de un caso en particular

- **Consulta entera contra consulta filtrada (spec §5.2).** Firestore rechaza una consulta que incluye algo que no se puede leer; la RLS contesta con lo permitido. Los casos que dependían de eso se transcriben como «no trae nada ajeno» (estado «diferencia intencional»). El cliente puede pedir \`directMessages\` completa y recibe lo suyo.
- **Un update o delete bloqueado por la política no da error: afecta 0 filas.** Las funciones \`guardar\`, \`quitar\`, \`fijar_campo\` y \`lote\` sí devuelven \`42501\`; un \`update\`/\`delete\` directo de PostgREST no.
- **\`service_role\` (el servidor) se salta RLS y las reglas por campo.** En Firestore el usuario de servicio era una cuenta más con su lista de permitidos: por ejemplo, no podía leer \`directMessages\` (ningún proceso del servidor los necesita). Ahora puede: la clave de servicio nunca sale del servidor.
- **Siembra de documentos que el original solo nombraba** (marcada en la nota de cada caso): leer un documento que no existe devuelve vacío con cualquier regla, así que «no lo ve» no probaría nada.
- **\`directory\` y \`serviceAccounts\` ya no existen** (${casos.filter((c) => estadoDe(c) === "no aplica").length} casos). Su función la cumplen \`users.data->>'authUid'\` (único entre clínicas reales; \`mi_directorio()\`) y la clave \`service_role\`.
- **Casos nuevos** (no están en el original, están en \`extras.test.mjs\` y \`sin-membresia.test.mjs\`): editar el nombre de otro usuario, la clave inmutable de cada tabla, los campos clínicos con \`null\`, lo que puede el servidor, y una batería completa de quien no tiene membresía (la clave pública, la sesión anónima de la demo, una cuenta sin clínica, un JWT sin uid y un empleado dado de baja) contra las 41 tablas.
`;
  writeFileSync(path.join(RAIZ, "test/rls/CASOS.md"), md);
});
