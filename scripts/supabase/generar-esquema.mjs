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

// ───────────────────────────── armado ─────────────────────────────

export function generar() {
  const m = leerManifiesto();
  return [
    { archivo: "20261017000100_tablas.sql", sql: migracionTablas(m) },
    { archivo: "20261017000200_funciones_datos.sql", sql: migracionFuncionesDeDatos(m) },
    { archivo: "20261017000300_rls_funciones.sql", sql: migracionRlsFunciones() },
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
