#!/usr/bin/env node
/** Carga una exportación de Firestore (la de `exportar-firestore.mjs`) en el Postgres de Supabase y verifica que quedó IDÉNTICA. Fase P5 del spec del 9-oct-2026 (§11.2).
 *
 *    # simulacro: no escribe nada; dice qué insertaría/actualizaría y cuántas cuentas de GoTrue crearía
 *    NOVUDENT_CARGA_DB_URL=postgres://… NOVUDENT_CARGA_GOTRUE_URL=https://…/auth/v1 NOVUDENT_CARGA_SERVICE_KEY=… \
 *      node scripts/migracion/cargar-postgres.mjs --dry-run
 *    # carga de verdad (upsert idempotente + cuentas de GoTrue + authUid reescrito) y comparación completa al final
 *    node scripts/migracion/cargar-postgres.mjs
 *    # solo comparar la base con la exportación (abre la base en solo lectura)
 *    node scripts/migracion/cargar-postgres.mjs --solo-verificar
 *
 *  La base y GoTrue NO tienen valor por defecto: hay que decir a cuáles apuntar. Código de salida: 0 todo bien · 2 hay diferencias (o documentos que no se
 *  pudieron cargar) · 1 error (la exportación no sirve, falta algo, la base no está lista…). Los datos de pacientes se leen de una carpeta FUERA del repositorio. */
import { chmodSync, existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crearAlmacenPostgres, describirDestino } from "./carga/almacen.mjs";
import { ejecutarCarga } from "./carga/cargar.mjs";
import { exigirFueraDelRepo, ubicarExportacion } from "./carga/exportacion.mjs";
import { crearClienteGoTrue } from "./carga/gotrue.mjs";
import { armarInforme } from "./carga/informe.mjs";

const AYUDA = `Uso: node scripts/migracion/cargar-postgres.mjs [opciones]
  --exportacion DIR       carpeta de la exportación (por defecto ~/novudent-export; si ahí hay carpetas por fecha, la más nueva). Tiene que estar FUERA del repositorio
  --url-base URL          Postgres de destino, postgres://usuario:clave@host:puerto/base  (o la variable NOVUDENT_CARGA_DB_URL, mejor: la clave no queda en el historial)
  --url-gotrue URL        GoTrue de destino, con su prefijo, p. ej. https://api-novudent.novumholding.lat/auth/v1  (o NOVUDENT_CARGA_GOTRUE_URL)
                          la clave de servicio (service_role) va SOLO en la variable NOVUDENT_CARGA_SERVICE_KEY
  --dry-run               simulacro: no escribe nada (ni documentos ni cuentas) y cuenta qué haría. Sin --url-base ni --url-gotrue solo valida la exportación
  --solo-verificar        no escribe nada: compara la base con la exportación, documento por documento (SHA-256)
  --permitir-incompleto   acepta una exportación parcial o con colecciones sin leer (para pruebas)
  --ignorar-desconocidas  sigue aunque la exportación traiga colecciones que no están en lib/backend/colecciones.json (esos datos NO se cargan)
  --lote N                documentos por consulta (por defecto 200)
  --informe RUTA          dónde guardar el informe (por defecto <exportación>/informe-de-carga-<fecha>.md; con --dry-run no se guarda salvo que lo pidas)
  --ayuda                 esta ayuda
Salida: 0 todo bien · 2 hay diferencias · 1 error.`;

/** @param {string[]} argv @param {Record<string, string | undefined>} [env] */
export function leerArgumentos(argv, env = process.env) {
  const o = {
    exportacion: null,
    urlBase: env.NOVUDENT_CARGA_DB_URL || null,
    urlGotrue: env.NOVUDENT_CARGA_GOTRUE_URL || null,
    claveServicio: env.NOVUDENT_CARGA_SERVICE_KEY || null,
    dryRun: false, soloVerificar: false, permitirIncompleto: false, ignorarDesconocidas: false,
    tamanoDeLote: 200, informe: null, ayuda: false,
  };
  const valor = (i, nombre) => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error(`Falta el valor de ${nombre}.\n${AYUDA}`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--exportacion") o.exportacion = valor(i++, a);
    else if (a === "--url-base") o.urlBase = valor(i++, a);
    else if (a === "--url-gotrue") o.urlGotrue = valor(i++, a);
    else if (a === "--informe") o.informe = valor(i++, a);
    else if (a === "--lote") {
      const n = Number(valor(i++, a));
      if (!Number.isInteger(n) || n < 1 || n > 5000) throw new Error("--lote tiene que ser un número entero entre 1 y 5000.");
      o.tamanoDeLote = n;
    } else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--solo-verificar") o.soloVerificar = true;
    else if (a === "--permitir-incompleto") o.permitirIncompleto = true;
    else if (a === "--ignorar-desconocidas") o.ignorarDesconocidas = true;
    else if (a === "--ayuda" || a === "-h") o.ayuda = true;
    else throw new Error(`Opción desconocida: ${a}\n${AYUDA}`);
  }
  if (o.dryRun && o.soloVerificar) throw new Error("--dry-run y --solo-verificar no se combinan: uno simula la carga y el otro compara lo que ya hay.");
  return o;
}

/** Lo que hace falta para cada modo. Nunca repite una URL ni una clave en el mensaje. */
export function validarDestino(o) {
  const escribeOVerifica = !o.dryRun;
  if (escribeOVerifica || o.urlBase) {
    if (!o.urlBase) throw new Error("Falta la URL de la base de destino: pasala con --url-base (o NOVUDENT_CARGA_DB_URL). No hay valor por defecto a propósito.");
    let u = null;
    try { u = new URL(o.urlBase); } catch { /* se informa abajo */ }
    if (!u || (u.protocol !== "postgres:" && u.protocol !== "postgresql:")) throw new Error("La URL de la base tiene que ser postgres://usuario:clave@host:puerto/base.");
  }
  if (escribeOVerifica || o.urlGotrue || o.claveServicio) {
    if (!o.urlGotrue) throw new Error("Falta la URL de GoTrue: pasala con --url-gotrue (o NOVUDENT_CARGA_GOTRUE_URL), por ejemplo http://127.0.0.1:8000/auth/v1.");
    let u = null;
    try { u = new URL(o.urlGotrue); } catch { /* se informa abajo */ }
    if (!u || (u.protocol !== "http:" && u.protocol !== "https:")) throw new Error("La URL de GoTrue tiene que empezar con http:// o https://.");
    if (!o.claveServicio) throw new Error("Falta la clave de servicio (service_role) de GoTrue: ponela en la variable de entorno NOVUDENT_CARGA_SERVICE_KEY (no se acepta por la línea de comandos).");
  }
}

const dos = (n) => String(n).padStart(2, "0");
const marcaDeTiempo = (d = new Date()) => `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}`;

/** Tapa con *** las claves que pudieran haber quedado en un mensaje. */
function taparSecretos(texto, secretos) {
  let t = String(texto);
  for (const s of secretos) if (s) t = t.split(s).join("***");
  return t;
}

const COLECCIONES = () => JSON.parse(readFileSync(new URL("../../lib/backend/colecciones.json", import.meta.url), "utf8"));

/**
 * @returns {Promise<number>} el código de salida
 * @param {string[]} argv
 * @param {{ env?: Record<string, string | undefined>, colecciones?: any, crearAlmacen?: Function, crearGoTrue?: Function, escribir?: (t: string) => void,
 *           avisar?: (t: string) => void, entorno?: { casa?: string, directorioActual?: string, raizDelRepo?: string } }} [dependencias]
 */
export async function principal(argv, { env = process.env, colecciones, crearAlmacen = crearAlmacenPostgres, crearGoTrue = crearClienteGoTrue, escribir = (t) => console.log(t), avisar = (t) => console.error(t), entorno = {} } = {}) {
  let almacen = null;
  let secretos = [];
  const decir = (t) => escribir(taparSecretos(t, secretos));
  const avisarSeguro = (t) => avisar(taparSecretos(t, secretos));
  try {
    const o = leerArgumentos(argv, env);
    if (o.ayuda) { escribir(AYUDA); return 0; }
    validarDestino(o);
    let clave = null;
    try { clave = o.urlBase ? decodeURIComponent(new URL(o.urlBase).password) : null; } catch { /* ya validada */ }
    secretos = [o.claveServicio, clave, o.urlBase].filter(Boolean);
    const modo = o.dryRun ? "simulacro" : o.soloVerificar ? "solo-verificar" : "cargar";

    const carpeta = ubicarExportacion(o.exportacion, entorno);
    // El informe se valida ANTES de empezar: no se hace una carga larga para descubrir al final que no se puede guardar el informe.
    let rutaDelInforme = null;
    if (o.informe) {
      rutaDelInforme = resolve(entorno.directorioActual ?? process.cwd(), o.informe);
      exigirFueraDelRepo(rutaDelInforme, { raizDelRepo: entorno.raizDelRepo, que: "El informe" });
    } else if (modo !== "simulacro") {
      rutaDelInforme = join(carpeta, `informe-de-carga-${marcaDeTiempo()}.md`);
    }

    avisarSeguro(`Exportación: ${carpeta}`);
    avisarSeguro(`Modo: ${modo}${modo === "simulacro" ? " (no se escribe nada)" : modo === "solo-verificar" ? " (solo lectura)" : ""}`);
    if (o.urlBase) avisarSeguro(`Destino: ${describirDestino(o.urlBase)}`);
    if (o.urlGotrue) avisarSeguro(`GoTrue: ${new URL(o.urlGotrue).origin}${new URL(o.urlGotrue).pathname}`);

    if (o.urlBase) almacen = await crearAlmacen({ url: o.urlBase, soloLectura: modo !== "cargar" });
    const gotrue = o.urlGotrue ? crearGoTrue({ url: o.urlGotrue, clave: o.claveServicio }) : null;

    const informe = await ejecutarCarga({
      carpeta, colecciones: colecciones ?? COLECCIONES(), almacen, gotrue, modo,
      permitirIncompleto: o.permitirIncompleto, ignorarDesconocidas: o.ignorarDesconocidas, tamanoDeLote: o.tamanoDeLote,
      alAvanzar: (m) => avisarSeguro(m),
    });
    const texto = armarInforme(informe);
    decir(texto);
    if (rutaDelInforme) {
      mkdirSync(dirname(rutaDelInforme), { recursive: true, mode: 0o700 });
      writeFileSync(rutaDelInforme, texto, { mode: 0o600 });
      chmodSync(rutaDelInforme, 0o600);
      avisarSeguro(`Informe guardado en ${rutaDelInforme}`);
    }
    return informe.ok ? 0 : 2;
  } catch (e) {
    avisarSeguro(`Error: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  } finally {
    await almacen?.cerrar().catch(() => {});
  }
}

/** ¿Se está corriendo este archivo como programa (y no importado por las pruebas)? Compara rutas reales: también vale si lo llaman por un enlace simbólico. */
function esElPrograma() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (esElPrograma()) {
  principal(process.argv.slice(2)).then((codigo) => process.exit(codigo), (e) => { console.error(`Error: ${e.message}`); process.exit(1); });
}
