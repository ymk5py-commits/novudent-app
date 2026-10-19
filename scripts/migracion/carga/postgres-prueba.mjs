/** Ayudas para las pruebas que usan una base Postgres de verdad (`NOVUDENT_PRUEBA_DB_URL`, ver `stack-de-prueba.sh`): cada prueba crea su propio
 *  esquema con las tablas de la forma del spec §5.1 (o, cuando exista, con el SQL de la fase B) y lo borra al terminar. */
import { randomBytes } from "node:crypto";
import { aSnake } from "./almacen.mjs";

/** El módulo `pg` (CommonJS): su export por defecto. */
export const clientePg = async () => (await import("pg")).default;

export const URL_DE_PRUEBA = process.env.NOVUDENT_PRUEBA_DB_URL;
export const GOTRUE_DE_PRUEBA = process.env.NOVUDENT_PRUEBA_GOTRUE_URL;
export const CLAVE_DE_PRUEBA = process.env.NOVUDENT_PRUEBA_SERVICE_KEY;

const ident = (s) => `"${s.replaceAll('"', '""')}"`;

/** Crea un esquema nuevo con una tabla por colección: `(clinic_id, id, data, updated_at)` las de clínica y `(id, data, updated_at)` las de la raíz. */
/** @param {{ porClinica: string[], raiz: string[] }} colecciones @param {{ estilo?: "camel" | "snake", sinTabla?: string[] }} [opciones] */
export async function crearEsquemaDePrueba(colecciones, { estilo = "camel", sinTabla = [] } = {}) {
  const { Client } = await clientePg();
  const admin = new Client({ connectionString: URL_DE_PRUEBA });
  await admin.connect();
  const esquema = `t_${randomBytes(5).toString("hex")}`;
  await admin.query(`create schema ${ident(esquema)}`);
  const nombre = (c) => (estilo === "snake" ? aSnake(c) : c);
  for (const c of colecciones.porClinica.filter((x) => !sinTabla.includes(x))) {
    await admin.query(`create table ${ident(esquema)}.${ident(nombre(c))} (clinic_id text not null, id text not null, data jsonb not null, updated_at timestamptz not null default now(), primary key (clinic_id, id))`);
  }
  for (const c of colecciones.raiz.filter((x) => !sinTabla.includes(x))) {
    await admin.query(`create table ${ident(esquema)}.${ident(nombre(c))} (id text primary key, data jsonb not null, updated_at timestamptz not null default now())`);
  }
  return {
    esquema,
    /** Una consulta directa a la base (para preparar o alterar datos en las pruebas). */
    consultar: (sql, params) => admin.query(sql, params),
    nombre,
    async borrar() {
      await admin.query(`drop schema ${ident(esquema)} cascade`).catch(() => {});
      await admin.end();
    },
  };
}
