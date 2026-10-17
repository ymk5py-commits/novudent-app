/** Lee una exportación de Firestore (la carpeta que deja `exportar-firestore.mjs`: un JSONL por colección y clínica + `manifiesto.json`), la valida
 *  contra su manifiesto y entrega los documentos de a uno. Solo lectura. Nunca copia el contenido de un documento en un mensaje de error: son datos de
 *  pacientes. */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Colecciones de la raíz que se exportan pero NO se cargan: `directory` desaparece (el enrutamiento uid → clínica sale de `users.authUid`, spec §5.1)
 *  y `serviceAccounts` es la lista de usuarios de servicio de Firebase (en Supabase es la clave `service_role`). */
export const NO_SE_CARGA = ["directory", "serviceAccounts"];

export class ErrorDeExportacion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ErrorDeExportacion";
  }
}

/** La raíz de ESTE repositorio (donde está este script), no el directorio desde donde se lo corre. */
const RAIZ_DEL_REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** La ruta con los enlaces simbólicos resueltos, también si todavía no existe (se resuelve el ancestro más profundo que sí existe). Es la misma
 *  comprobación que hace el exportador al escribir: una exportación tiene datos de pacientes y no puede estar dentro del repositorio. */
export function rutaReal(ruta) {
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

/** ¿`hijo` es `padre` o está adentro? Con rutas absolutas ya resueltas (`..export` es un nombre de carpeta, no «subir un nivel»). */
export function estaAdentro(padre, hijo) {
  const r = relative(padre, hijo);
  return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r));
}

/** Se niega a tocar `ruta` si cae dentro del repositorio (se subiría a Git con un `git add .`). */
export function exigirFueraDelRepo(ruta, { raizDelRepo = RAIZ_DEL_REPO, que = "La exportación" } = {}) {
  if (estaAdentro(rutaReal(raizDelRepo), rutaReal(ruta))) {
    throw new Error(`${que} tiene datos de pacientes: no la leas ni la escribas dentro del repositorio (${resolve(ruta)}). Usá una carpeta de afuera, por ejemplo ~/novudent-export.`);
  }
}

const tieneManifiesto = (carpeta) => existsSync(join(carpeta, "manifiesto.json"));

/** La carpeta de la exportación. `dir` null = `~/novudent-export`; si ahí no está el manifiesto, se toma la subcarpeta más nueva (por nombre, que es la
 *  fecha) que sí lo tenga: una exportación que no terminó no deja `manifiesto.json`. */
export function ubicarExportacion(dir, { casa = homedir(), directorioActual = process.cwd(), raizDelRepo = RAIZ_DEL_REPO } = {}) {
  const base = resolve(directorioActual, dir ?? join(casa, "novudent-export"));
  exigirFueraDelRepo(base, { raizDelRepo });
  let carpeta = null;
  if (tieneManifiesto(base)) carpeta = base;
  else if (existsSync(base) && statSync(base).isDirectory()) {
    const candidatas = readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory() || d.isSymbolicLink())
      .map((d) => d.name)
      .sort()
      .reverse();
    const elegida = candidatas.find((nombre) => tieneManifiesto(join(base, nombre)));
    if (elegida) carpeta = join(base, elegida);
  }
  if (!carpeta) throw new Error(`No encuentro una exportación en ${base} (falta manifiesto.json). Corré antes: npm run migracion:exportar`);
  exigirFueraDelRepo(carpeta, { raizDelRepo }); // una subcarpeta puede ser un enlace que sale (o entra) por otro lado
  return carpeta;
}

export function leerManifiesto(carpeta) {
  let manifiesto;
  try {
    manifiesto = JSON.parse(readFileSync(join(carpeta, "manifiesto.json"), "utf8"));
  } catch (e) {
    throw new ErrorDeExportacion(`No pude leer manifiesto.json (${e instanceof SyntaxError ? "no es JSON válido" : e.code ?? e.message}).`);
  }
  return manifiesto;
}

const segura = (nombre) => encodeURIComponent(nombre);
const archivoDeRaiz = (coleccion) => `raiz/${segura(coleccion)}.jsonl`;
const archivoDeClinica = (clinica, coleccion) => `clinicas/${segura(clinica)}/${segura(coleccion)}.jsonl`;

const esObjeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

/**
 * El plan de lo que se carga: una entrada por colección y clínica, en este orden: `clinics`, el resto de la raíz y después cada clínica. Valida el manifiesto
 * (si la exportación sirve para migrar) y que cada archivo sea el que corresponde a su nombre.
 *
 * @param {any} manifiesto
 * @param {{ porClinica: string[], raiz: string[], noSeMigra?: string[] }} colecciones  `lib/backend/colecciones.json`: la lista blanca
 * @param {{ permitirIncompleto?: boolean, ignorarDesconocidas?: boolean }} [opciones]
 * @returns {{ entradas: Array<{ clinica: string | null, coleccion: string, archivo: string, docs: number, bytes: number, sha256: string }>, advertencias: string[] }}
 */
export function planDeCarga(manifiesto, colecciones, { permitirIncompleto = false, ignorarDesconocidas = false } = {}) {
  if (!esObjeto(manifiesto) || !esObjeto(manifiesto.raiz) || !esObjeto(manifiesto.clinicas) || !esObjeto(manifiesto.totales)) {
    throw new ErrorDeExportacion("El manifiesto no tiene la forma que deja el exportador (raiz, clinicas, totales): ¿es de otra versión?");
  }
  if (manifiesto.soloMedir) {
    throw new ErrorDeExportacion("Esa exportación se hizo con --solo-medir: no tiene los datos (solo cantidades). Exportá de nuevo sin --solo-medir.");
  }
  const advertencias = [];
  if (Array.isArray(manifiesto.clinicasFiltradas)) {
    const m = `exportación PARCIAL (solo las clínicas ${manifiesto.clinicasFiltradas.join(", ")}): no sirve para migrar`;
    if (!permitirIncompleto) throw new ErrorDeExportacion(`Es una ${m}. Exportá todas las clínicas (o usá --permitir-incompleto para una prueba).`);
    advertencias.push(`⚠️ ${m}.`);
  }
  if (Array.isArray(manifiesto.noLeidas) && manifiesto.noLeidas.length) {
    const m = `la exportación está incompleta: ${manifiesto.noLeidas.length} colección(es) no se pudieron leer (${manifiesto.noLeidas.slice(0, 5).map((n) => n.ruta).join(", ")})`;
    if (!permitirIncompleto) throw new ErrorDeExportacion(`${m[0].toUpperCase()}${m.slice(1)}. Volvé a exportar (o usá --permitir-incompleto para una prueba).`);
    advertencias.push(`⚠️ ${m}.`);
  }

  const noSeCarga = new Set([...NO_SE_CARGA, ...(colecciones.noSeMigra ?? [])]);
  const raizPermitida = colecciones.raiz.filter((c) => !noSeCarga.has(c));
  const desconocidas = [];
  const entradas = [];

  /** @param {string | null} clinica @param {string} coleccion @param {any} est @param {string} esperado */
  const agregar = (clinica, coleccion, est, esperado) => {
    if (!esObjeto(est) || typeof est.archivo !== "string" || !Number.isSafeInteger(est.docs) || !Number.isSafeInteger(est.bytes) || typeof est.sha256 !== "string") {
      throw new ErrorDeExportacion(`El manifiesto no describe bien ${clinica ? `clinics/${clinica}/` : ""}${coleccion} (faltan archivo, docs, bytes o sha256).`);
    }
    if (est.archivo !== esperado) throw new ErrorDeExportacion(`El manifiesto manda leer el archivo «${est.archivo}» para ${clinica ? `clinics/${clinica}/` : ""}${coleccion}, y no es el que corresponde («${esperado}»): lo ignoro por seguridad.`);
    if (est.incompleta) {
      const m = `${clinica ? `clinics/${clinica}/` : ""}${coleccion} se exportó incompleta`;
      if (!permitirIncompleto) throw new ErrorDeExportacion(`${m}. Volvé a exportar.`);
      advertencias.push(`⚠️ ${m}.`);
    }
    entradas.push({ clinica, coleccion, archivo: est.archivo, docs: est.docs, bytes: est.bytes, sha256: est.sha256 });
  };

  // La raíz: `clinics` primero, después las demás en el orden del manifiesto de colecciones.
  const enLaRaiz = Object.keys(manifiesto.raiz);
  for (const c of enLaRaiz) {
    if (noSeCarga.has(c)) advertencias.push(`«${c}» se exportó pero NO se carga (${c === "directory" ? "el enrutamiento uid → clínica sale de users.authUid" : "no existe en Supabase"}).`);
    else if (!raizPermitida.includes(c)) desconocidas.push(c);
  }
  for (const c of ["clinics", ...raizPermitida.filter((x) => x !== "clinics")]) {
    if (enLaRaiz.includes(c)) agregar(null, c, manifiesto.raiz[c], archivoDeRaiz(c));
  }
  for (const c of manifiesto.noMigradas ?? []) advertencias.push(`«${c}» no se migra (lo dice el manifiesto).`);

  for (const [clinica, registro] of Object.entries(manifiesto.clinicas)) {
    if (!esObjeto(registro) || !esObjeto(registro.colecciones)) throw new ErrorDeExportacion(`El manifiesto no describe bien la clínica ${clinica}.`);
    if (registro.sinDocumento) advertencias.push(`La clínica «${clinica}» no tiene documento (existe solo por sus subcolecciones, sin documento): sus datos se cargan igual.`);
    for (const [coleccion, est] of Object.entries(registro.colecciones)) {
      if (!colecciones.porClinica.includes(coleccion)) desconocidas.push(`clinics/${clinica}/${coleccion}`);
      else agregar(clinica, coleccion, est, archivoDeClinica(clinica, coleccion));
    }
  }
  for (const f of manifiesto.documentosFantasma ?? []) advertencias.push(`Documento fantasma (no existe pero tiene subcolecciones): ${f}.`);

  if (desconocidas.length) {
    const lista = desconocidas.join(", ");
    if (!ignorarDesconocidas) {
      throw new ErrorDeExportacion(`Hay colecciones que no están en lib/backend/colecciones.json (y por eso no tienen tabla): ${lista}. Sin cargarlas se perderían esos datos. Sumalas al manifiesto de colecciones y al esquema, o usá --ignorar-desconocidas si sabés que no hacen falta.`);
    }
    advertencias.push(`⚠️ NO se cargan estas colecciones (no están en lib/backend/colecciones.json): ${lista}.`);
  }
  return { entradas, advertencias };
}

const rutaDe = (carpeta, entrada) => join(carpeta, entrada.archivo);

/** Lee el archivo completo, en streaming, y entrega cada línea (sin el salto) y su largo en bytes. */
async function* lineasDe(ruta) {
  let resto = Buffer.alloc(0);
  for await (const trozo of createReadStream(ruta)) {
    let desde = 0;
    for (let i = trozo.indexOf(10, desde); i !== -1; i = trozo.indexOf(10, desde)) {
      const linea = resto.length ? Buffer.concat([resto, trozo.subarray(desde, i)]) : trozo.subarray(desde, i);
      resto = Buffer.alloc(0);
      yield { texto: linea.toString("utf8"), bytes: linea.length + 1 };
      desde = i + 1;
    }
    if (desde < trozo.length) resto = Buffer.concat([resto, trozo.subarray(desde)]);
  }
  if (resto.length) yield { texto: resto.toString("utf8"), bytes: resto.length, sinSalto: true };
}

/** Recorre cada archivo una vez y compara su SHA-256, su tamaño y su cantidad de documentos con lo que dice el manifiesto. Devuelve los problemas
 *  (vacío = la exportación está íntegra). Hay que correrla ANTES de escribir nada en la base.
 *  @returns {Promise<Array<{ clinica: string | null, coleccion: string, archivo: string, motivo: string }>>} */
export async function verificarArchivos(carpeta, entradas, { alAvanzar = () => {} } = {}) {
  const problemas = [];
  for (const entrada of entradas) {
    const ruta = rutaDe(carpeta, entrada);
    const problema = (motivo) => problemas.push({ clinica: entrada.clinica, coleccion: entrada.coleccion, archivo: entrada.archivo, motivo });
    if (!existsSync(ruta)) { problema("el archivo no está en la carpeta de la exportación"); continue; }
    const hash = createHash("sha256");
    let bytes = 0;
    let docs = 0;
    for await (const trozo of createReadStream(ruta)) {
      hash.update(trozo);
      bytes += trozo.length;
      for (let i = trozo.indexOf(10); i !== -1; i = trozo.indexOf(10, i + 1)) docs++;
    }
    const motivos = [];
    if (hash.digest("hex") !== entrada.sha256) motivos.push("su SHA-256 no coincide con el del manifiesto");
    if (bytes !== entrada.bytes) motivos.push(`tiene ${bytes} bytes y el manifiesto dice ${entrada.bytes}`);
    if (docs !== entrada.docs) motivos.push(`tiene ${docs} documentos y el manifiesto dice ${entrada.docs}`);
    if (motivos.length) problema(motivos.join("; "));
    alAvanzar(`${entrada.clinica ? `clinics/${entrada.clinica}/` : ""}${entrada.coleccion}: archivo ${motivos.length ? "CON PROBLEMAS" : "íntegro"}`);
  }
  return problemas;
}

/** Los documentos de un archivo, en orden: `{ id, data, bytes }` (`bytes` = lo que pesa su línea). Valida cada línea (JSON, id no vacío, `data` un objeto, ids no repetidos) y, si falla, dice
 *  la línea pero no copia su contenido. */
export async function* leerDocumentos(carpeta, entrada) {
  const ids = new Set();
  let n = 0;
  const falla = (motivo) => new ErrorDeExportacion(`${entrada.archivo}, línea ${n}: ${motivo}`);
  for await (const { texto, bytes } of lineasDe(rutaDe(carpeta, entrada))) {
    n++;
    let documento;
    try {
      documento = JSON.parse(texto);
    } catch {
      throw falla("no es JSON válido");
    }
    if (!esObjeto(documento) || typeof documento.id !== "string" || documento.id === "") throw falla("el documento no tiene id");
    if (!esObjeto(documento.data)) throw falla("los datos del documento no son un objeto");
    if (ids.has(documento.id)) throw falla("id repetido en el mismo archivo");
    ids.add(documento.id);
    yield { id: documento.id, data: documento.data, bytes };
  }
}
