#!/usr/bin/env node
/**
 * Generador del esquema de Postgres (Supabase) a partir del manifiesto de colecciones: lib/backend/colecciones.json.
 * Escribe supabase/migrations/*.sql. Spec: docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md §5 y §6.
 *
 *   node scripts/supabase/generar-esquema.mjs              escribe las migraciones
 *   node scripts/supabase/generar-esquema.mjs --verificar  no escribe: sale con 1 si las que están en el repositorio no coinciden
 *   node scripts/supabase/generar-esquema.mjs --salida DIR escribe en otra carpeta
 *
 * Las migraciones son IDEMPOTENTES (`if not exists`, `create or replace`, `drop policy if exists`): scripts/supabase/aplicar-esquema.sh
 * las aplica todas, en orden, cada vez; sumar una colección al manifiesto y volver a generar crea la tabla nueva y deja las demás.
 * Las tablas se crean con permisos mínimos y RLS activado; lo que se abre, se abre con una política (ver 0004_rls_politicas).
 *
 * No se escribe SQL a mano en supabase/migrations: se cambia este generador (o sus plantillas) y se vuelve a generar.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../..");
const MANIFIESTO_RUTA = path.join(RAIZ, "lib/backend/colecciones.json");

/** Colecciones del manifiesto que NO tienen tabla. `directory` se reemplaza por el índice de `users.data->>'authUid'` y
 *  `serviceAccounts` (y el manifiesto la lista en `noSeMigra`) por la clave service_role de Supabase. */
const SIN_TABLA_ADEMAS = ["directory"];

/** Las que el navegador escucha en vivo (spec §7): entran en la publicación supabase_realtime con replica identity full. */
export const ESCUCHADAS = ["subscriptions", "clinics", "outbox", "directMessages", "teamMessages"];

const q = (s) => `"${s}"`;
const lit = (s) => `'${s.replaceAll("'", "''")}'`;
const lista = (xs) => xs.map(lit).join(", ");

/** Índices que no son la clave primaria. `expr` es la expresión indexada; `donde` un índice parcial. */
const INDICES = {
  users: [
    // Un authUid pertenece a UNA sola clínica real: reemplaza al `directory` (que no dejaba pisar una entrada existente) y evita
    // que un admin agregue a su clínica a una persona que ya es de otra. La demo queda afuera: cualquiera con sesión planta usuarios ahí.
    { nombre: "users_authuid_unico", unico: true, expr: `(data ->> 'authUid')`, donde: `clinic_id <> 'cl_demo' and data ? 'authUid'` },
    // isMember / mi_usuario: «¿es esta persona de esta clínica?»
    { nombre: "users_clinic_authuid", expr: `clinic_id, (data ->> 'authUid')` },
  ],
  // Las consultas del servidor (reserva online, firma remota, confirmación de cita por link, Botika).
  appointments: [
    { nombre: "appointments_start", expr: `clinic_id, (data ->> 'start')` },
    { nombre: "appointments_confirmtoken", expr: `clinic_id, (data ->> 'confirmToken')`, donde: `data ? 'confirmToken'` },
  ],
  agendaBlocks: [{ nombre: "agendablocks_start", expr: `clinic_id, (data ->> 'start')` }],
  signatures: [{ nombre: "signatures_token", expr: `clinic_id, (data ->> 'token')`, donde: `data ? 'token'` }],
  patients: [{ nombre: "patients_document", expr: `clinic_id, (data ->> 'document')`, donde: `data ? 'document'` }],
  outbox: [{ nombre: "outbox_status", expr: `clinic_id, (data ->> 'status')` }],
  // directMessages por participante (el chat: `participants` contiene mi id).
  directMessages: [{ nombre: "directmessages_participants", usando: "gin", expr: `(data -> 'participants')` }],
};

function cabecera(descripcion) {
  return `-- GENERADO por scripts/supabase/generar-esquema.mjs a partir de lib/backend/colecciones.json. NO editar a mano:
-- se cambia el generador (o scripts/supabase/plantillas/) y se vuelve a generar con \`node scripts/supabase/generar-esquema.mjs\`.
-- ${descripcion}
`;
}

function leerManifiesto() {
  const m = JSON.parse(readFileSync(MANIFIESTO_RUTA, "utf8"));
  const sinTabla = new Set([...SIN_TABLA_ADEMAS, ...(m.noSeMigra ?? [])]);
  const clinica = [...m.porClinica];
  const raiz = m.raiz.filter((t) => !sinTabla.has(t));
  const todas = [...clinica, ...raiz];
  for (const t of todas) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(t)) throw new Error(`Nombre de colección inválido en el manifiesto: ${t}`);
  }
  if (new Set(todas).size !== todas.length) throw new Error("Hay una colección repetida en lib/backend/colecciones.json");
  for (const t of ESCUCHADAS) if (!todas.includes(t)) throw new Error(`ESCUCHADAS trae ${t}, que no está en el manifiesto`);
  for (const t of Object.keys(INDICES)) if (!todas.includes(t)) throw new Error(`INDICES trae ${t}, que no está en el manifiesto`);
  return { clinica, raiz, todas };
}

function plantilla(nombre, valores = {}) {
  let sql = readFileSync(path.join(AQUI, "plantillas", nombre), "utf8");
  for (const [k, v] of Object.entries(valores)) sql = sql.replaceAll(`{{${k}}}`, v);
  const sobra = sql.match(/\{\{[A-Z_]+\}\}/);
  if (sobra) throw new Error(`${nombre}: quedó sin reemplazar ${sobra[0]}`);
  return sql;
}

// ───────────────────────────── 0001 · tablas ─────────────────────────────

function sqlTabla(t, esDeClinica) {
  const columnas = esDeClinica
    ? `  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint ${q(`${t}_pkey`)} primary key (clinic_id, id),
  constraint ${q(`${t}_data_objeto`)} check (jsonb_typeof(data) = 'object')`
    : `  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint ${q(`${t}_pkey`)} primary key (id),
  constraint ${q(`${t}_data_objeto`)} check (jsonb_typeof(data) = 'object')`;
  // Los permisos por defecto de Supabase le dan TODO a anon y authenticated sobre las tablas nuevas de `public`. Se los quita al crearla
  // (y solo entonces: volver a aplicar la migración sobre una base en uso no puede cerrar el acceso un instante). El acceso se vuelve
  // a abrir, fila por fila, con las políticas del 0004.
  return `do $$
begin
  if to_regclass('public.${q(t)}') is null then
    create table public.${q(t)} (
${columnas}
    );
    revoke all on table public.${q(t)} from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.${q(t)}'::regclass and conname = ${lit(`${t}_data_tamano`)}) then
    alter table public.${q(t)} add constraint ${q(`${t}_data_tamano`)} check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public.${q(t)} enable row level security;
grant all on table public.${q(t)} to service_role;
create or replace trigger ${q(`${t}_al_actualizar`)} before update on public.${q(t)}
  for each row execute function interno.${esDeClinica ? "al_actualizar_clinica" : "al_actualizar_raiz"}();
`;
}

function sqlIndices(t) {
  return (INDICES[t] ?? [])
    .map((i) => `create ${i.unico ? "unique " : ""}index if not exists ${q(i.nombre)} on public.${q(t)}${i.usando ? ` using ${i.usando}` : ""} (${i.expr})${i.donde ? ` where ${i.donde}` : ""};`)
    .join("\n");
}

function migracionTablas({ clinica, raiz }) {
  const partes = [cabecera("Tablas: una por colección. (clinic_id, id, data jsonb, updated_at); las raíz sin clinic_id. RLS activado y sin permisos para anon/authenticated.")];
  partes.push(`create schema if not exists interno;
revoke all on schema interno from public;
grant usage on schema interno to anon, authenticated, service_role;

-- Un documento no cambia de clave (ni de clínica ni de id) y su updated_at lo mantiene la base, no quien escribe.
create or replace function interno.al_actualizar_clinica()
returns trigger
language plpgsql
as $$
begin
  if new.clinic_id is distinct from old.clinic_id or new.id is distinct from old.id then
    raise exception 'la clave de un documento no se cambia (%/%)', old.clinic_id, old.id using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function interno.al_actualizar_raiz()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'la clave de un documento no se cambia (%)', old.id using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
`);
  partes.push(`-- ── Colecciones de cada clínica (${clinica.length}) ──────────────────────────────────────────`);
  for (const t of clinica) partes.push(sqlTabla(t, true));
  partes.push(`-- ── Colecciones de primer nivel (${raiz.length}) ──────────────────────────────────────────────`);
  for (const t of raiz) partes.push(sqlTabla(t, false));
  partes.push(`-- ── Índices ─────────────────────────────────────────────────────────────────────────────`);
  for (const t of [...clinica, ...raiz]) {
    const s = sqlIndices(t);
    if (s) partes.push(s);
  }
  partes.push(`
-- ── Tiempo real (spec §7) ───────────────────────────────────────────────────────────────
-- Las tablas que el navegador escucha entran en la publicación de Realtime con replica identity full (para que los delete lleguen con
-- sus datos). Realtime aplica la RLS de cada suscriptor.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
`);
  for (const t of ESCUCHADAS) {
    partes.push(`alter table public.${q(t)} replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = ${lit(t)}) then
    alter publication supabase_realtime add table public.${q(t)};
  end if;
end $$;`);
  }
  return partes.join("\n") + "\n";
}

// ───────────────────────────── 0002 · funciones de datos ─────────────────────────────

function migracionFuncionesDeDatos({ clinica, raiz }) {
  return cabecera("Operaciones de datos: guardar, quitar, fijar_campo, mezclar_clinica y lote.") +
    plantilla("funciones_datos.sql", { TABLAS_CLINICA_SQL: lista(clinica), TABLAS_RAIZ_SQL: lista(raiz) });
}

// ───────────────────────────── 0003 · funciones de permisos ─────────────────────────────

function migracionRlsFunciones() {
  return cabecera("Funciones auxiliares de los permisos (las de firestore.rules): isMember, isAdmin, mi_usuario, tienePermiso, canWrite…") +
    plantilla("rls_funciones.sql");
}


// ───────────────────────────── 0004 · políticas (RLS) ─────────────────────────────
//
// Cada colección con sus reglas, traducidas de firestore.rules (el comentario de cada una dice de qué bloque `match` sale). Las funciones son las
// de la migración 0003, con los nombres de las reglas. Denegar por defecto: lo que no figura acá no se puede ni leer ni escribir; y un
// comando sin política (p. ej. `delete` de `payments`… sí tiene; `delete` de subscriptions no) queda denegado.
//
// `isService()` no aparece: la clave service_role salta RLS. `isDemo` es lectura de la demo sin sesión (el rol `anon` también la ve);
// `isDemoRW` es escribir en la demo y exige sesión (la anónima de GoTrue es el rol authenticated).
// Lo que depende de qué cambió dentro del documento (old contra new) no se puede expresar en una política: vive en 0005 (disparadores).

const M = (c) => `interno."isMember"(${c})`;
const A = (c) => `interno."isAdmin"(${c})`;
const D = (c) => `interno."isDemo"(${c})`;
const DRW = (c) => `interno."isDemoRW"(${c})`;
const SA = (c) => `interno."subActive"(${c})`;
const CW = (c) => `interno."canWrite"(${c})`;
const CWP = (c, planes) => `interno."canWritePremium"(${c}, array[${lista(planes)}])`;
const PLANES_CLINICA = ["clinica", "cadena"];
const CLINICOS = ["emr", "odontogram", "prescriptions", "ortho", "perio"]; // patientClinicalFields() de firestore.rules

/** Colecciones SIN política: las lee y escribe solo el servidor (service_role). Son las que en firestore.rules dicen `allow read, write: if isService()`. */
const SOLO_SERVIDOR = ["webhookEvents", "leads", "checkoutTokens"];

function reglasDe(c) {
  const lectura = `${M(c)} or ${D(c)}`;
  const operativa = { leer: lectura, escribir: CW(c) };
  return {
    // clinics/{cid}: el admin edita la config pero no `plan` (disparador 0005). Alta y baja de clínicas: solo el servidor (y la demo).
    clinics: { c: "id", leer: `${M("id")} or ${D("id")}`, crear: DRW("id"), actualizar: `${A("id")} or ${DRW("id")}`, borrar: DRW("id") },
    // subscriptions/{cid}: la fuente de verdad del plan; la escribe SOLO el servidor.
    subscriptions: { c: "id", leer: `${M("id")} or ${D("id")}` },
    // Equipo: solo el admin crea y borra usuarios. Un usuario edita SU documento, solo name y color (disparador 0005).
    users: { leer: lectura, crear: `${A(c)} or ${DRW(c)}`, actualizar: `${A(c)} or ${DRW(c)} or id = interno.mi_usuario(${c})`, borrar: `${A(c)} or ${DRW(c)}` },
    // Paciente: lee todo miembro, aunque la suscripción esté vencida (historia clínica). El alta no trae campos clínicos si no se es rol clínico;
    // el update, lo mismo pero sobre lo que cambió (disparador 0005). Borrar: solo el admin.
    patients: {
      leer: lectura,
      crear: `${DRW(c)} or (${M(c)} and ${SA(c)} and (interno."isClinical"(${c}) or not (data ?| array[${lista(CLINICOS)}])))`,
      actualizar: `${DRW(c)} or (${M(c)} and ${SA(c)})`,
      borrar: `${DRW(c)} or (${A(c)} and ${SA(c)})`,
    },
    appointments: operativa,
    agendaBlocks: operativa,
    billing: operativa,
    budgets: operativa,
    waitlist: operativa,
    slotLocks: operativa,
    recoveryMonitors: operativa,
    patientNotes: operativa,
    sterilizationCycles: operativa,
    teamMessages: operativa,
    surveys: operativa,
    mgmtTasks: operativa,
    environmentalLogs: operativa,
    eduVideos: operativa,
    branches: operativa,
    // practice.config = solo admin: el precio del catálogo define lo que se le cobra al paciente.
    procedures: { leer: lectura, escribir: `(${A(c)} and ${SA(c)}) or ${DRW(c)}` },
    // Dinero: el dentista NO maneja dinero.
    payments: { leer: lectura, escribir: `(interno."isCaja"(${c}) and ${SA(c)}) or ${DRW(c)}` },
    // Gastos = costos del negocio: también la LECTURA es de quien tiene expenses.manage (la demo, solo con sesión).
    expenses: { leer: `interno."puedeGastos"(${c}) or ${DRW(c)}`, escribir: `(interno."puedeGastos"(${c}) and ${SA(c)}) or ${DRW(c)}` },
    // stock se LEE con isDemoRW (no isDemo): sin sesión no se ve el inventario de la demo.
    stock: { leer: `${M(c)} or ${DRW(c)}`, escribir: CWP(c, PLANES_CLINICA) },
    stockMoves: { leer: lectura, escribir: CWP(c, PLANES_CLINICA) },
    outbox: { leer: lectura, escribir: CWP(c, PLANES_CLINICA) },
    // Radiografía = ficha clínica: además del plan, emr.write.
    radiographs: { leer: lectura, escribir: `${CWP(c, PLANES_CLINICA)} and (interno."isClinical"(${c}) or ${DRW(c)})` },
    // Una firma emitida es prueba legal: se crea y se edita (recepción), nunca se borra desde el cliente.
    signatures: {
      leer: lectura,
      crear: `${CWP(c, PLANES_CLINICA)} and (interno."isRecepcion"(${c}) or ${DRW(c)})`,
      actualizar: `${CWP(c, PLANES_CLINICA)} and (interno."isRecepcion"(${c}) or ${DRW(c)})`,
      borrar: DRW(c),
    },
    // Documentos clínicos: los edita engagement.forms o emr.write; nunca se borran (se anulan).
    clinicalDocs: {
      leer: lectura,
      crear: `${DRW(c)} or (${SA(c)} and (interno."isRecepcion"(${c}) or interno."isClinical"(${c})))`,
      actualizar: `${DRW(c)} or (${SA(c)} and (interno."isRecepcion"(${c}) or interno."isClinical"(${c})))`,
      borrar: DRW(c),
    },
    // Rutina del administrador: solo el admin tilda y destilda.
    routineChecks: { leer: lectura, escribir: `${DRW(c)} or (${A(c)} and ${SA(c)})` },
    crmCards: { leer: lectura, escribir: CWP(c, ["cadena"]) },
    campaigns: { leer: lectura, escribir: CWP(c, ["cadena"]) },
    labOrders: { leer: lectura, escribir: CWP(c, PLANES_CLINICA) },
    // Liquidaciones = cuánto gana cada profesional (dato salarial).
    settlements: {
      leer: `interno."puedeLiquidaciones"(${c}) or ${D(c)}`,
      escribir: `(interno."puedeLiquidaciones"(${c}) and ${CWP(c, PLANES_CLINICA)}) or ${DRW(c)}`,
    },
    boxes: { leer: lectura, escribir: CWP(c, PLANES_CLINICA) },
    // Documentos fiscales: los emite la caja; se anulan, y el borrado es del admin.
    fiscalDocs: {
      leer: lectura,
      crear: `(interno."isCaja"(${c}) and ${SA(c)}) or ${DRW(c)}`,
      actualizar: `(interno."isCaja"(${c}) and ${SA(c)}) or ${DRW(c)}`,
      borrar: `${A(c)} or ${DRW(c)}`,
    },
    // Caja: además de rol, el plan (`caja` es de Clínica+).
    cashSessions: { leer: lectura, escribir: `(interno."isCaja"(${c}) and ${SA(c)} and interno."effectivePlan"(${c}) = any (array[${lista(PLANES_CLINICA)}])) or ${DRW(c)}` },
    // Mensajes directos: de sus dos participantes y del admin. El alta se valida en un disparador (directoValido), y marcar leído
    // (solo el destinatario, solo readAt) también. Un mensaje no se borra, ni el admin; la demo sí, para reiniciarla.
    directMessages: {
      leer: `${D(c)} or (${M(c)} and ((data -> 'participants') ? interno.mi_usuario(${c}) or ${A(c)}))`,
      crear: `${DRW(c)} or (${M(c)} and ${SA(c)})`,
      actualizar: `${DRW(c)} or (${M(c)} and interno.mi_usuario(${c}) = (data ->> 'toId'))`,
      borrar: DRW(c),
    },
    // Respuestas de encuestas: el alta pública entra por una ruta del servidor.
    surveyResponses: { leer: lectura, escribir: DRW(c) },
  };
}

function sqlPoliticasDe(t, esDeClinica) {
  const r = reglasDe("clinic_id")[t];
  if (!r) return null;
  const c = r.c ?? "clinic_id";
  const crear = r.crear ?? r.escribir;
  const actualizar = r.actualizar ?? r.escribir;
  const borrar = r.borrar ?? r.escribir;
  const q = (cmd) => `${t}_${cmd}`;
  const partes = [];
  const anon = r.leer && r.leer.includes('"isDemo"(');
  const grants = [];
  if (r.leer) {
    partes.push(`create policy ${qq(q("leer"))} on public.${qq(t)} for select to ${anon ? "anon, authenticated" : "authenticated"}\n  using (${r.leer});`);
    grants.push(`grant select on table public.${qq(t)} to ${anon ? "anon, authenticated" : "authenticated"};`);
  }
  if (crear) partes.push(`create policy ${qq(q("crear"))} on public.${qq(t)} for insert to authenticated\n  with check (${crear});`);
  if (actualizar) partes.push(`create policy ${qq(q("actualizar"))} on public.${qq(t)} for update to authenticated\n  using (${actualizar})\n  with check (${actualizar});`);
  if (borrar) partes.push(`create policy ${qq(q("borrar"))} on public.${qq(t)} for delete to authenticated\n  using (${borrar});`);
  const dml = [crear && "insert", actualizar && "update", borrar && "delete"].filter(Boolean);
  if (dml.length) grants.push(`grant ${dml.join(", ")} on table public.${qq(t)} to authenticated;`);
  return { sql: partes.join("\n"), grants: grants.join("\n"), esDeClinica };
}
const qq = (s) => `"${s}"`;

function migracionPoliticas({ clinica, raiz }) {
  const todas = [...clinica, ...raiz];
  for (const t of todas) {
    if (!SOLO_SERVIDOR.includes(t) && !reglasDe("clinic_id")[t]) throw new Error(`La colección ${t} no tiene reglas en generar-esquema.mjs: decidí quién la lee y quién la escribe (o ponela en SOLO_SERVIDOR)`);
  }
  for (const t of Object.keys(reglasDe("clinic_id"))) if (!todas.includes(t)) throw new Error(`reglasDe() trae ${t}, que no está en el manifiesto`);
  const partes = [cabecera("Políticas de RLS, una por comando, traducidas de firestore.rules. Denegar por defecto: lo que no figura acá no se lee ni se escribe.")];
  partes.push(`-- Se borran TODAS las políticas del esquema public y se vuelven a crear en esta misma transacción: el resultado es exactamente lo de abajo,
-- aunque antes hubiera otra cosa, y no queda ninguna abierta por olvido.
do $$
declare
  r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;
`);
  for (const t of todas) {
    if (SOLO_SERVIDOR.includes(t)) {
      partes.push(`-- ${t}: solo el servidor (service_role). Sin políticas y sin permisos para anon ni authenticated.\nrevoke all on table public.${qq(t)} from anon, authenticated;\n`);
      continue;
    }
    const p = sqlPoliticasDe(t, clinica.includes(t));
    // Los permisos de tabla se ajustan a lo que las políticas abren: nada de más.
    partes.push(`-- ${t}\nrevoke all on table public.${qq(t)} from anon, authenticated;\n${p.grants}\n${p.sql}\n`);
  }
  return partes.join("\n");
}

// ───────────────────────────── 0005 · disparadores de campos ─────────────────────────────

function migracionDisparadores() {
  return cabecera("Las 5 reglas por campo de firestore.rules (spec del 9-oct §6.2): lo que una política no puede expresar porque depende de qué cambió dentro del documento.") +
    plantilla("rls_disparadores.sql", { CLINICOS_SQL: lista(CLINICOS) });
}

// ───────────────────────────── armado ─────────────────────────────

export function generar() {
  const m = leerManifiesto();
  return [
    { archivo: "20261017000100_tablas.sql", sql: migracionTablas(m) },
    { archivo: "20261017000200_funciones_datos.sql", sql: migracionFuncionesDeDatos(m) },
    { archivo: "20261017000300_rls_funciones.sql", sql: migracionRlsFunciones() },
    { archivo: "20261017000400_rls_politicas.sql", sql: migracionPoliticas(m) },
    { archivo: "20261017000500_rls_disparadores.sql", sql: migracionDisparadores() },
  ];
}

function main() {
  const args = process.argv.slice(2);
  const verificar = args.includes("--verificar");
  const i = args.indexOf("--salida");
  const salida = path.resolve(i >= 0 ? args[i + 1] : path.join(RAIZ, "supabase/migrations"));
  const archivos = generar();

  if (verificar) {
    const problemas = [];
    for (const { archivo, sql } of archivos) {
      const ruta = path.join(salida, archivo);
      if (!existsSync(ruta)) problemas.push(`falta ${archivo}`);
      else if (readFileSync(ruta, "utf8") !== sql) problemas.push(`${archivo} no coincide con lo que genera el generador`);
    }
    if (existsSync(salida)) {
      const esperados = new Set(archivos.map((a) => a.archivo));
      for (const f of readdirSync(salida)) if (f.endsWith(".sql") && !esperados.has(f)) problemas.push(`${f} sobra (no lo genera el generador)`);
    }
    if (problemas.length) {
      console.error(`Las migraciones no están al día:\n  - ${problemas.join("\n  - ")}\nCorré: node scripts/supabase/generar-esquema.mjs`);
      process.exit(1);
    }
    console.log(`Migraciones al día (${archivos.length} archivos).`);
    return;
  }

  mkdirSync(salida, { recursive: true });
  const esperados = new Set(archivos.map((a) => a.archivo));
  for (const f of readdirSync(salida)) if (f.endsWith(".sql") && !esperados.has(f)) rmSync(path.join(salida, f));
  for (const { archivo, sql } of archivos) writeFileSync(path.join(salida, archivo), sql);
  console.log(`Escribí ${archivos.length} migraciones en ${path.relative(process.cwd(), salida) || "."}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
