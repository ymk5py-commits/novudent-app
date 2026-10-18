/**
 * `DatosDeServidor` sobre Supabase: PostgREST con la clave `service_role` (se salta RLS; solo vive en el servidor, nunca en el navegador).
 *
 * Es el reemplazo de `firestore-rest.ts`: las mismas 8 operaciones y firmas, con los mismos paths de Firestore
 * (`clinics/{cid}/patients/{id}`, `subscriptions/{cid}`…), que acá se traducen a tablas (`lib/backend/supabase-esquema.ts`).
 *
 * Seguridad (el que consulta es la clave de servicio, que lee y escribe TODO):
 *  - Las tablas salen de una lista blanca (el manifiesto de colecciones y las colecciones de primer nivel que se migran): un path no puede
 *    apuntar a `auth.users` ni a ninguna otra tabla. Los segmentos `.` / `..` y los vacíos se rechazan, igual que en `firestore-rest.ts`.
 *  - Los ids y los valores viajan como VALOR de un parámetro (`id=eq.<valor>`), armados con URLSearchParams: un `&`, un `#` o un `)` en un
 *    id queda dentro del valor, no agrega filtros. Los nombres de campo (que van en el nombre del parámetro) deben ser identificadores simples.
 *
 * Diferencias con Firestore que esta capa esconde:
 *  - `directory/{uid}` no existe: se deriva de `users.data->>'authUid'` (lectura y `createIfAbsent`); escribirlo no hace nada.
 *  - `patchFields` no tiene `updateMask`: lee la fila y la reescribe solo si `updated_at` no cambió (control optimista, con reintentos).
 *  - PostgREST corta cada respuesta en 1000 filas (`db-max-rows`): `listCollection` y las consultas paginan solas.
 */
import { CLINICA_DEMO } from "../backend/constantes";
import { esTablaDeClinica, esTablaRaiz } from "../backend/supabase-esquema";
import type { DatosDeServidor, Fila } from "./datos";

export interface ConfigDeDatosSupabase {
  /** URL de Kong (`https://api-novudent….`). Por defecto `SUPABASE_URL` o, si no está, `NEXT_PUBLIC_SUPABASE_URL`. */
  url?: string;
  /** Clave `service_role`. Por defecto `SUPABASE_SERVICE_ROLE_KEY`. */
  serviceKey?: string;
  fetch?: typeof fetch;
}

const PAGINA = 1000; // db-max-rows de PostgREST
const REINTENTOS_PATCH = 6;
const CAMPO_SIMPLE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TIEMPO_MAXIMO_MS = 15_000;

/** Un documento de Firestore traducido a su tabla. */
type Ref = { tabla: string; clinicId?: string; id: string };

function segmentos(path: string): string[] {
  const s = path.split("/");
  for (const x of s) if (x === "" || x === "." || x === "..") throw new Error(`Path inválido (segmento «${x}»): ${path}`);
  return s;
}

/** `directory/{uid}` → `{ directorio: uid }`; el resto, la tabla y las claves del documento. */
function parsearDocumento(path: string): Ref | { directorio: string } {
  const s = segmentos(path);
  if (s[0] === "directory" && s.length === 2) return { directorio: s[1] };
  if (s[0] === "clinics" && s.length === 2) return { tabla: "clinics", id: s[1] };
  if (s[0] === "clinics" && s.length === 4 && esTablaDeClinica(s[2])) return { tabla: s[2], clinicId: s[1], id: s[3] };
  if (s[0] !== "clinics" && s.length === 2 && esTablaRaiz(s[0])) return { tabla: s[0], id: s[1] };
  throw new Error(`Path no admitido: ${path}`);
}

function soloDocumento(path: string): Ref {
  const r = parsearDocumento(path);
  if ("directorio" in r) throw new Error(`Operación no admitida sobre directory: ${path}`);
  return r;
}

function parsearColeccion(parentPath: string, coleccion: string): { tabla: string; clinicId: string } {
  const s = parentPath === "" ? [] : segmentos(parentPath);
  if (s.length !== 2 || s[0] !== "clinics" || !esTablaDeClinica(coleccion)) throw new Error(`Colección no admitida: ${parentPath}/${coleccion}`);
  return { tabla: coleccion, clinicId: s[1] };
}

function campoValido(campo: string): string {
  if (!CAMPO_SIMPLE.test(campo)) throw new Error(`Nombre de campo no válido: ${JSON.stringify(campo)}`);
  return campo;
}

/** El valor como lo compara `data->>campo` (texto). */
function comoTexto(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  throw new Error("El valor de la consulta tiene que ser un texto, un número o un booleano.");
}

const comillas = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export function crearDatosSupabase(config: ConfigDeDatosSupabase = {}): DatosDeServidor {
  const base = () => (config.url ?? (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")).replace(/\/+$/, "");
  const clave = () => config.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const estaConfigurado = () => !!base() && !!clave();

  /** Un pedido a PostgREST. Rechaza con el estado y el mensaje de la base si no es 2xx. */
  async function pedir(
    etiqueta: string,
    metodo: "GET" | "POST" | "PATCH",
    tabla: string,
    params: URLSearchParams,
    opciones: { cuerpo?: unknown; prefer?: string } = {},
  ): Promise<unknown> {
    if (!estaConfigurado()) throw new Error("Servidor sin configurar: faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
    const k = clave();
    const res = await (config.fetch ?? fetch)(`${base()}/rest/v1/${encodeURIComponent(tabla)}${params.size ? `?${params}` : ""}`, {
      method: metodo,
      headers: {
        apikey: k,
        Authorization: `Bearer ${k}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(opciones.prefer ? { Prefer: opciones.prefer } : {}),
      },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    const texto = await res.text().catch(() => "");
    if (!res.ok) {
      let detalle = texto.slice(0, 160);
      try { detalle = String((JSON.parse(texto) as { message?: unknown }).message ?? detalle).slice(0, 160); } catch { /* texto plano */ }
      throw new Error(`${etiqueta} falló (${res.status}): ${detalle}`);
    }
    if (!texto) return null;
    try { return JSON.parse(texto); } catch { return null; }
  }

  const filasDe = (r: unknown): Array<Record<string, unknown>> => (Array.isArray(r) ? (r as Array<Record<string, unknown>>) : []);

  /* ---------- directory/{uid}: sale de users.authUid ---------- */

  /* La demo (`cl_demo`) NO cuenta: cualquiera con una sesión anónima puede escribir ahí (es la demo pública), así que podría plantar una ficha de administrador con su
   * propio authUid y pasar por miembro de una clínica (IA, correos, checkout). `mi_directorio()` de la fase B hace lo mismo: nunca devuelve la demo. */
  async function usuarioPorAuthUid(uid: string): Promise<{ clinic_id: string; id: string; data: Record<string, unknown> } | null> {
    const params = new URLSearchParams({ select: "clinic_id,id,data", "data->>authUid": `eq.${uid}`, clinic_id: `neq.${CLINICA_DEMO}`, order: "clinic_id.asc,id.asc", limit: "1" });
    const filas = filasDe(await pedir(`directory/${uid}`, "GET", "users", params));
    return (filas[0] as { clinic_id: string; id: string; data: Record<string, unknown> } | undefined) ?? null;
  }

  /** Una fila de `clinics`: comprueba la red, la clave y que el esquema esté aplicado. */
  async function ping() {
    await pedir("ping", "GET", "clinics", new URLSearchParams({ select: "id", limit: "1" }));
  }

  /* ---------- lecturas ---------- */

  /** Filas `(id, data)` de una subcolección de la clínica, con filtros extra, hasta `limit` (pagina de a 1000). */
  async function filasDeColeccion(etiqueta: string, parentPath: string, coleccion: string, filtros: Array<[string, string]>, limit: number): Promise<Fila[]> {
    const { tabla, clinicId } = parsearColeccion(parentPath, coleccion);
    const salida: Fila[] = [];
    for (let offset = 0; salida.length < limit; offset += PAGINA) {
      const n = Math.min(PAGINA, limit - salida.length);
      const params = new URLSearchParams({ select: "id,data", clinic_id: `eq.${clinicId}` });
      for (const [k, v] of filtros) params.append(k, v);
      params.set("order", "id.asc");
      params.set("limit", String(n));
      params.set("offset", String(offset));
      const pagina = filasDe(await pedir(etiqueta, "GET", tabla, params));
      for (const f of pagina) salida.push({ id: String(f.id), data: (f.data ?? {}) as Record<string, unknown> });
      if (pagina.length < n) break;
    }
    return salida;
  }

  async function getDocument(path: string) {
    const ref = parsearDocumento(path);
    if ("directorio" in ref) {
      const u = await usuarioPorAuthUid(ref.directorio);
      if (!u) return null;
      return { clinicId: u.clinic_id, userId: u.id, email: u.data.email };
    }
    const params = new URLSearchParams({ select: "data", id: `eq.${ref.id}`, limit: "1" });
    if (ref.clinicId !== undefined) params.set("clinic_id", `eq.${ref.clinicId}`);
    const filas = filasDe(await pedir(`get ${path}`, "GET", ref.tabla, params));
    return filas.length ? ((filas[0].data ?? {}) as Record<string, unknown>) : null;
  }

  // `async` a propósito: un path o un campo inválido llega como rechazo, nunca como excepción síncrona.
  const listCollection = async (parentPath: string, coleccion: string, limit = 300) =>
    filasDeColeccion(`query ${coleccion}`, parentPath, coleccion, [], limit);

  const queryWhere = async (parentPath: string, coleccion: string, field: string, value: unknown, limit = 10) =>
    filasDeColeccion(`query ${coleccion}.${field}`, parentPath, coleccion, [[`data->>${campoValido(field)}`, `eq.${comoTexto(value)}`]], limit);

  async function queryRange(parentPath: string, coleccion: string, field: string, desde: string, hasta: string, limit = 500) {
    const campo = campoValido(field);
    const filas = await filasDeColeccion(`query ${coleccion}.${field}`, parentPath, coleccion, [[`data->>${campo}`, `gte.${desde}`], [`data->>${campo}`, `lt.${hasta}`]], limit);
    // El orden de texto de la base depende de su «collation»; Firestore compara byte a byte. Se vuelve a comprobar el rango acá.
    return filas.filter((f) => typeof f.data[campo] === "string" && (f.data[campo] as string) >= desde && (f.data[campo] as string) < hasta);
  }

  async function queryIn(parentPath: string, coleccion: string, field: string, valores: unknown[], limit = 10) {
    if (valores.length === 0) return [];
    const lista = valores.map((v) => comillas(comoTexto(v))).join(",");
    return filasDeColeccion(`query ${coleccion}.${field}`, parentPath, coleccion, [[`data->>${campoValido(field)}`, `in.(${lista})`]], limit);
  }

  /* ---------- escrituras ---------- */

  const claves = (ref: Ref) => (ref.clinicId !== undefined ? { clinic_id: ref.clinicId, id: ref.id } : { id: ref.id });
  const conflicto = (ref: Ref) => (ref.clinicId !== undefined ? "clinic_id,id" : "id");

  async function setDocument(path: string, value: Record<string, unknown>) {
    const ref = parsearDocumento(path);
    if ("directorio" in ref) return; // el documento de usuario (con su authUid) ES el índice: no hay nada que escribir
    await pedir(`set ${path}`, "POST", ref.tabla, new URLSearchParams({ on_conflict: conflicto(ref) }), {
      cuerpo: { ...claves(ref), data: value },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }

  async function createIfAbsent(path: string, value: Record<string, unknown>) {
    const ref = parsearDocumento(path);
    if ("directorio" in ref) return (await usuarioPorAuthUid(ref.directorio)) === null;
    const insertadas = filasDe(await pedir(`createIfAbsent ${path}`, "POST", ref.tabla, new URLSearchParams({ on_conflict: conflicto(ref) }), {
      cuerpo: { ...claves(ref), data: value },
      prefer: "resolution=ignore-duplicates,return=representation",
    }));
    return insertadas.length > 0;
  }

  /* PostgREST no sabe «cambiá estas claves del jsonb»: se lee la fila y se la reescribe SOLO si `updated_at` sigue siendo el que se leyó
   * (si otro escribió en el medio, el PATCH no toca ninguna fila y se vuelve a empezar). Es el equivalente al `updateMask` de Firestore:
   * los campos que no se nombran no se pierden por una escritura concurrente. */
  async function patchFields(path: string, fields: Record<string, unknown>) {
    const ref = soloDocumento(path);
    const aplicar = (data: Record<string, unknown>) => {
      const salida = { ...data };
      for (const [k, v] of Object.entries(fields)) { if (v === undefined) delete salida[k]; else salida[k] = v; }
      return salida;
    };
    for (let intento = 0; intento < REINTENTOS_PATCH; intento++) {
      const filtro = new URLSearchParams({ id: `eq.${ref.id}` });
      if (ref.clinicId !== undefined) filtro.set("clinic_id", `eq.${ref.clinicId}`);
      const leidas = filasDe(await pedir(`patchFields ${path}`, "GET", ref.tabla, new URLSearchParams({ select: "data,updated_at", ...Object.fromEntries(filtro), limit: "1" })));
      if (leidas.length === 0) {
        const creada = filasDe(await pedir(`patchFields ${path}`, "POST", ref.tabla, new URLSearchParams({ on_conflict: conflicto(ref) }), {
          cuerpo: { ...claves(ref), data: aplicar({}) },
          prefer: "resolution=ignore-duplicates,return=representation",
        }));
        if (creada.length > 0) return;
        continue; // otro lo creó justo ahora: se lee de nuevo
      }
      filtro.set("updated_at", `eq.${String(leidas[0].updated_at)}`);
      const tocadas = filasDe(await pedir(`patchFields ${path}`, "PATCH", ref.tabla, filtro, {
        cuerpo: { data: aplicar((leidas[0].data ?? {}) as Record<string, unknown>), updated_at: new Date().toISOString() },
        prefer: "return=representation",
      }));
      if (tocadas.length > 0) return;
    }
    throw new Error(`patchFields ${path} falló: demasiada concurrencia sobre el mismo documento`);
  }

  return { tipo: "supabase", estaConfigurado, ping, getDocument, listCollection, queryWhere, queryRange, queryIn, setDocument, patchFields, createIfAbsent };
}

/** La instancia de la app: lee la URL y la clave del entorno en cada llamada. */
export const datosSupabase: DatosDeServidor = crearDatosSupabase();
