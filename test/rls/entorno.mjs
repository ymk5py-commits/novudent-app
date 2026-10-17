/**
 * Entorno común de las pruebas contra Postgres real (stack de Supabase).
 *
 * Necesita `RLS_PG_URL`: una conexión de superusuario (supabase_admin) al Postgres de prueba. Lo arma scripts/supabase/probar-rls.sh
 * (contenedor descartable en el servidor + túnel SSH); a mano: ver test/rls/README.md.
 *
 * Cómo se simula lo que hace PostgREST en cada pedido: una transacción con `set local role <rol del JWT>` y los claims del JWT en
 * `request.jwt.claims`. El rol y los claims valen solo para esa transacción. `servicio` es el rol service_role (salta RLS), `anon` es
 * la clave pública sin sesión y `usuario(nombre)` es una sesión de GoTrue (rol authenticated con un `sub` uuid).
 */
import pg from "pg";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CARPETA_MIGRACIONES = path.join(RAIZ, "supabase/migrations");
export const MANIFIESTO = JSON.parse(readFileSync(path.join(RAIZ, "lib/backend/colecciones.json"), "utf8"));

/** Colecciones de primer nivel que NO tienen tabla: `directory` se reemplaza por `users.data->>'authUid'` y `serviceAccounts` por la clave service_role. */
export const SIN_TABLA = ["directory", ...MANIFIESTO.noSeMigra];
export const TABLAS_CLINICA = MANIFIESTO.porClinica;
export const TABLAS_RAIZ = MANIFIESTO.raiz.filter((t) => !SIN_TABLA.includes(t));
export const TODAS_LAS_TABLAS = [...TABLAS_CLINICA, ...TABLAS_RAIZ];
/** Las que Realtime tiene que publicar: las que el navegador escucha en vivo (spec del 9-oct §7). */
export const TABLAS_ESCUCHADAS = ["subscriptions", "clinics", "outbox", "directMessages", "teamMessages"];

if (!process.env.RLS_PG_URL) {
  throw new Error("Falta RLS_PG_URL (conexión de superusuario al Postgres de prueba). Corré scripts/supabase/probar-rls.sh o mirá test/rls/README.md.");
}

export const pool = new pg.Pool({ connectionString: process.env.RLS_PG_URL, max: 4 });

/** El uuid de GoTrue de una persona de las pruebas: determinístico, para poder escribirlo en el `authUid` de su documento de usuario. */
export function uuidDe(nombre) {
  const h = createHash("sha1").update(`novudent-rls:${nombre}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const sesiones = {
  /** La clave pública sin sesión (el navegador mirando la demo). */
  anon: { rol: "anon", claims: { role: "anon" } },
  /** La clave de servicio: salta RLS (el servidor de Novudent, Botika, el cargador de datos). */
  servicio: { rol: "service_role", claims: { role: "service_role" } },
  /** Una sesión de GoTrue (con email y contraseña, o anónima de la demo). */
  usuario: (nombre, extra = {}) => ({
    rol: "authenticated",
    claims: { sub: uuidDe(nombre), role: "authenticated", aud: "authenticated", ...extra },
  }),
  /** La sesión anónima de la demo: rol authenticated, `is_anonymous` y ninguna membresía. */
  visitante: (nombre = "visitante") => sesiones.usuario(nombre, { is_anonymous: true }),
};

/** Ejecuta `fn(client)` como esa sesión, dentro de una transacción (commit si sale bien, rollback si falla). */
export async function como(sesion, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${sesion.rol}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(sesion.claims)]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Una sola consulta como esa sesión; devuelve las filas. Lanza si Postgres la rechaza. */
export const ejecutar = (sesion, sql, params = []) => como(sesion, async (c) => (await c.query(sql, params)).rows);

/** Igual, pero no lanza: `{ ok, filas, error, codigo }`. Sirve para afirmar que algo se rechaza (y por qué código). */
export async function intentar(sesion, sql, params = []) {
  try {
    const r = await como(sesion, (c) => c.query(sql, params));
    return { ok: true, filas: r.rows, cuantas: r.rowCount, error: null, codigo: null };
  } catch (e) {
    return { ok: false, filas: [], cuantas: 0, error: e.message, codigo: e.code ?? null };
  }
}

/** Una consulta como superusuario (siembra y verificaciones). Salta RLS y las reglas por campo. */
export async function admin(sql, params = []) {
  return (await pool.query(sql, params)).rows;
}

export function archivosDeMigracion() {
  return readdirSync(CARPETA_MIGRACIONES).filter((f) => f.endsWith(".sql")).sort();
}

/** Aplica TODAS las migraciones, en orden, cada una en su transacción y como `postgres` (el dueño que usa aplicar-esquema.sh). */
export async function aplicarMigraciones() {
  const archivos = archivosDeMigracion();
  if (archivos.length === 0) throw new Error(`No hay migraciones en ${CARPETA_MIGRACIONES}`);
  const c = await pool.connect();
  try {
    for (const f of archivos) {
      const sql = readFileSync(path.join(CARPETA_MIGRACIONES, f), "utf8");
      await c.query("begin");
      try {
        await c.query("set local role postgres");
        await c.query(sql);
        await c.query("commit");
      } catch (e) {
        await c.query("rollback").catch(() => {});
        e.message = `${f}: ${e.message}`;
        throw e;
      }
    }
  } finally {
    c.release();
  }
  return archivos;
}

/** Deja la base como recién creada (sin nada de Novudent) para empezar cada archivo de pruebas desde cero. */
export async function limpiarBase() {
  await pool.query(`
    do $$
    declare r record;
    begin
      for r in select format('%I.%I', schemaname, tablename) as t from pg_tables where schemaname = 'public' loop
        execute 'drop table if exists ' || r.t || ' cascade';
      end loop;
      for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'interno') loop
        execute 'drop function if exists ' || r.f || ' cascade';
      end loop;
      drop schema if exists interno cascade;
    end $$;`);
}

/** Base limpia + todas las migraciones. */
export async function prepararBase() {
  await limpiarBase();
  return aplicarMigraciones();
}

/** Siembra un documento saltando RLS y las reglas por campo (para armar el estado de partida de una prueba). */
export async function sembrar(tabla, clinicId, id, data) {
  if (clinicId === null) {
    await pool.query(`insert into public."${tabla}" (id, data) values ($1, $2) on conflict (id) do update set data = excluded.data`, [id, JSON.stringify(data)]);
  } else {
    await pool.query(`insert into public."${tabla}" (clinic_id, id, data) values ($1, $2, $3) on conflict (clinic_id, id) do update set data = excluded.data`, [clinicId, id, JSON.stringify(data)]);
  }
}

/** Lee un documento saltando RLS (la verdad de lo que hay guardado). `null` si no existe. */
export async function leerComoAdmin(tabla, clinicId, id) {
  const r = clinicId === null
    ? await pool.query(`select data from public."${tabla}" where id = $1`, [id])
    : await pool.query(`select data from public."${tabla}" where clinic_id = $1 and id = $2`, [clinicId, id]);
  return r.rows[0]?.data ?? null;
}

export async function cerrar() {
  await pool.end();
}
