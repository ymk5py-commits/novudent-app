#!/usr/bin/env node
/** Exporta TODO Firestore (solo lectura) a archivos JSONL y entrega el informe de volumen que decide el tamaño del servidor.
 *
 *    npm run migracion:exportar -- --solo-medir                      # mide, no guarda datos de pacientes
 *    npm run migracion:exportar -- --salida ~/novudent-export/hoy    # exporta (los archivos tienen datos de pacientes: 700/600)
 *
 *  Opciones: --salida DIR · --credencial firebase-cli|servicio|entorno · --proyecto ID · --base URL (el emulador) · --clinica ID (repetible)
 *            --solo-medir · --permitir-incompleto · --ayuda
 *  Código de salida: 0 completa · 2 hay colecciones que no se pudieron leer (la exportación NO sirve para migrar) · 1 error. */
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crearCliente } from "./cliente.mjs";
import { MODOS, resolverToken } from "./credenciales.mjs";
import { crearEscritorDeArchivos, escritorNulo, exportarFirestore } from "./exportar.mjs";
import { armarInforme } from "./informe.mjs";

const AYUDA = `Uso: node scripts/migracion/exportar-firestore.mjs [opciones]
  --salida DIR            carpeta de la exportación (por defecto ~/novudent-export/<fecha>; no puede estar dentro del repositorio y tiene que estar vacía o no existir)
  --credencial MODO       ${MODOS.join(" | ")} (por defecto firebase-cli)
  --proyecto ID           proyecto de Firebase (por defecto FIREBASE_PROJECT_ID o novudent-664f3)
  --base URL              API de Firestore alternativa (el emulador). Solo con --credencial entorno, o apuntando a este equipo
  --clinica ID            solo las subcolecciones de esa clínica (se puede repetir)
  --solo-medir            cuenta y mide sin guardar los datos
  --permitir-incompleto   no fallar si alguna colección no se pudo leer
  --ayuda                 esta ayuda`;

/** @param {string[]} argv @param {Record<string, string | undefined>} [env] */
export function leerArgumentos(argv, env = process.env) {
  const opciones = {
    salida: null, credencial: "firebase-cli", proyecto: env.FIREBASE_PROJECT_ID || "novudent-664f3", base: null,
    clinicas: [], soloMedir: false, permitirIncompleto: false, ayuda: false,
  };
  const valor = (i, nombre) => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error(`Falta el valor de ${nombre}.\n${AYUDA}`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--salida") opciones.salida = valor(i++, a);
    else if (a === "--credencial") opciones.credencial = valor(i++, a);
    else if (a === "--proyecto") opciones.proyecto = valor(i++, a);
    else if (a === "--base") opciones.base = valor(i++, a);
    else if (a === "--clinica") opciones.clinicas.push(valor(i++, a));
    else if (a === "--solo-medir") opciones.soloMedir = true;
    else if (a === "--permitir-incompleto") opciones.permitirIncompleto = true;
    else if (a === "--ayuda" || a === "-h") opciones.ayuda = true;
    else throw new Error(`Opción desconocida: ${a}\n${AYUDA}`);
  }
  if (!MODOS.includes(opciones.credencial)) throw new Error(`--credencial debe ser una de: ${MODOS.join(", ")}.`);
  return opciones;
}

/** La raíz de ESTE repositorio (donde está este script), no el directorio desde donde se lo corre. */
const RAIZ_DEL_REPO = fileURLToPath(new URL("../../", import.meta.url));

/** La ruta con los enlaces simbólicos ya resueltos, también si la carpeta todavía no existe: se resuelve el ancestro más profundo que SÍ existe
 *  y se le agregan los tramos que faltan. Si no se puede resolver nada, queda la ruta tal cual. */
function rutaReal(ruta) {
  const faltan = [];
  let actual = resolve(ruta);
  for (;;) {
    try {
      return join(realpathSync(actual), ...faltan.reverse());
    } catch {
      const padre = dirname(actual);
      if (padre === actual) return resolve(ruta);
      faltan.push(basename(actual));
      actual = padre;
    }
  }
}

/** ¿`hijo` es `padre` o está adentro? Con rutas absolutas ya resueltas; `..export` o `...x` son nombres de carpeta, no «subir un nivel». */
function estaAdentro(padre, hijo) {
  const r = relative(padre, hijo);
  return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r));
}

/** Los hosts que son «este equipo»: ahí vive el emulador y el token no sale de la máquina. */
const HOSTS_DE_ESTE_EQUIPO = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** `--base` cambia el servidor al que se le manda la credencial. Con la sesión del CLI de Firebase (`cloud-platform` del dueño, 1 hora) o el usuario de
 *  servicio, solo se acepta apuntando a este equipo (el emulador): si no, ese token real viajaría a la dirección que se haya tipeado, en claro si es
 *  `http`. Con `--credencial entorno` la persona puso el token a propósito, así que vale cualquier servidor. Se llama ANTES de resolver el token.
 *  @param {string | null | undefined} base @param {string} credencial */
export function validarBase(base, credencial) {
  if (base == null) return;
  let url;
  try {
    url = new URL(base);
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error("--base no es una URL válida: tiene que empezar con http:// o https:// (por ejemplo http://127.0.0.1:8080/v1/projects/mi-proyecto/databases/(default)/documents).");
  }
  if (credencial !== "entorno" && !HOSTS_DE_ESTE_EQUIPO.has(url.hostname)) {
    throw new Error("--base solo se acepta con --credencial entorno, o apuntando a este equipo (el emulador): no mandamos un token real a otro servidor.");
  }
}

const dosDigitos = (n) => String(n).padStart(2, "0");

/** La exportación tiene datos de pacientes: no puede terminar dentro del repositorio (se subiría con un `git add .`). Se comparan las rutas
 *  REALES (con los enlaces simbólicos resueltos) y contra la raíz del repositorio, venga de donde venga el comando. */
export function carpetaDeSalida(salida, { hoy = new Date(), directorioActual = process.cwd(), casa = homedir(), raizDelRepo = RAIZ_DEL_REPO } = {}) {
  const fecha = `${hoy.getFullYear()}-${dosDigitos(hoy.getMonth() + 1)}-${dosDigitos(hoy.getDate())}`; // el día local, no el de UTC
  const carpeta = resolve(directorioActual, salida ?? join(casa, "novudent-export", fecha));
  if (estaAdentro(rutaReal(raizDelRepo), rutaReal(carpeta))) {
    throw new Error(`La exportación contiene datos de pacientes: no la guardes dentro del repositorio (${carpeta}). Usá una carpeta fuera, por ejemplo ~/novudent-export.`);
  }
  return carpeta;
}

async function principal() {
  const opciones = leerArgumentos(process.argv.slice(2));
  if (opciones.ayuda) { console.log(AYUDA); return 0; }
  validarBase(opciones.base, opciones.credencial); // antes de pedir el token: un token real no se manda a cualquier lado
  const carpeta = carpetaDeSalida(opciones.salida);
  // Una exportación nueva no se mezcla con una vieja: los .jsonl que sobraran quedarían al lado de un manifiesto que no los lista.
  if (existsSync(carpeta) && readdirSync(carpeta).length > 0) {
    throw new Error(`La carpeta ya tiene archivos: ${carpeta}. Usá otra (--salida) o borrala antes: una exportación nueva no se mezcla con una vieja.`);
  }
  const colecciones = JSON.parse(readFileSync(new URL("../../lib/backend/colecciones.json", import.meta.url), "utf8"));

  const { token, cuenta } = await resolverToken({ modo: opciones.credencial });
  console.error(`Proyecto ${opciones.proyecto} · credencial ${opciones.credencial} (${cuenta})${opciones.soloMedir ? " · solo medir" : ""}`);
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  chmodSync(carpeta, 0o700); // `mkdir` no cambia el modo de una carpeta que ya existía (vacía): son datos de pacientes

  const cliente = crearCliente({ proyecto: opciones.proyecto, token, base: opciones.base ?? undefined });
  const manifiesto = await exportarFirestore({
    cliente,
    colecciones,
    escritor: opciones.soloMedir ? escritorNulo : crearEscritorDeArchivos(carpeta),
    clinicas: opciones.clinicas.length ? opciones.clinicas : null,
    alAvanzar: (mensaje) => console.error(mensaje),
  });

  writeFileSync(join(carpeta, "manifiesto.json"), `${JSON.stringify({ proyecto: opciones.proyecto, credencial: cuenta, soloMedir: opciones.soloMedir, ...manifiesto }, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(join(carpeta, "informe-de-volumen.md"), armarInforme(manifiesto, { proyecto: opciones.proyecto, credencial: cuenta }), { mode: 0o600 });
  console.error(`\nListo: ${manifiesto.totales.documentos} documentos, ${(manifiesto.totales.bytes / 1024 / 1024).toFixed(1)} MB → ${carpeta}`);

  if (manifiesto.noLeidas.length && !opciones.permitirIncompleto) {
    console.error(`\n⚠️  ${manifiesto.noLeidas.length} colección(es) NO se pudieron leer: la exportación está incompleta (mirá el informe).`);
    return 2;
  }
  return 0;
}

/** ¿Se está corriendo este archivo como programa (y no importado por las pruebas)? Compara rutas reales: también vale si lo llaman por un enlace
 *  simbólico (si no, no correría nada y saldría con 0, y un cron creería que salió bien). */
function esElPrograma() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (esElPrograma()) {
  principal().then((codigo) => process.exit(codigo), (e) => { console.error(`Error: ${e.message}`); process.exit(1); });
}
