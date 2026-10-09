/** Exporta Firestore a archivos JSONL (uno por colección y clínica) y arma el manifiesto con cantidades, tamaños y SHA-256. Solo lectura.
 *  La lógica está acá, sin tocar el disco ni la red directamente, para probarla; `exportar-firestore.mjs` es la línea de comandos. */
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { ErrorDeLectura } from "./cliente.mjs";
import { decodificarDocumento, nuevosHallazgos } from "./valores.mjs";

/** Escribe los archivos de la exportación (permisos 700/600: son datos de pacientes). */
export function crearEscritorDeArchivos(raiz) {
  return {
    abrir(rutaRelativa) {
      const ruta = join(raiz, rutaRelativa);
      mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
      const fd = openSync(ruta, "w", 0o600);
      return { escribir: (texto) => writeSync(fd, texto), cerrar: () => closeSync(fd) };
    },
  };
}

/** No escribe nada (`--solo-medir`): cuenta y calcula igual. */
export const escritorNulo = { abrir: () => ({ escribir() {}, cerrar() {} }) };

/**
 * @typedef {{ archivo: string, docs: number, bytes: number, sha256: string, mayor: { id: string, bytes: number } | null, incompleta: boolean }} EstadisticaDeColeccion
 * @typedef {{ sinDocumento: boolean, documentos: number, bytes: number, colecciones: Record<string, EstadisticaDeColeccion> }} RegistroDeClinica
 * @typedef {{
 *   generado: string,
 *   clinicasFiltradas: string[] | null,
 *   totales: { documentos: number, bytes: number },
 *   raiz: Record<string, EstadisticaDeColeccion>,
 *   clinicas: Record<string, RegistroDeClinica>,
 *   desconocidas: { raiz: string[], clinicas: Record<string, string[]> },
 *   noLeidas: Array<{ ruta: string, estado: number | null, permiso: boolean }>,
 *   noMigradas: string[],
 *   documentosFantasma: string[],
 *   mayores: Array<{ ruta: string, id: string, bytes: number }>,
 *   hallazgos: ReturnType<typeof nuevosHallazgos>,
 * }} Manifiesto
 */

const segura = (nombre) => encodeURIComponent(nombre);
const MAYORES = 10;

/**
 * @param {{
 *   cliente: ReturnType<typeof import("./cliente.mjs").crearCliente>,
 *   colecciones: { porClinica: string[], raiz: string[], noSeMigra: string[] },
 *   escritor: { abrir(ruta: string): { escribir(t: string): void, cerrar(): void } },
 *   clinicas?: string[] | null,
 *   alAvanzar?: (mensaje: string) => void,
 *   ahora?: () => Date,
 * }} opciones
 * @returns {Promise<Manifiesto>}
 */
export async function exportarFirestore({ cliente, colecciones, escritor, clinicas = null, alAvanzar = () => {}, ahora = () => new Date() }) {
  const hallazgos = nuevosHallazgos();
  /** El filtro de `--clinica` (sin repetidos); `null` = todas las clínicas. Una lista vacía es «sin filtro», no «ninguna». */
  const filtro = clinicas?.length ? [...new Set(clinicas)] : null;
  /** @type {Manifiesto} */
  const manifiesto = {
    generado: ahora().toISOString(),
    clinicasFiltradas: filtro,
    totales: { documentos: 0, bytes: 0 },
    raiz: {},
    clinicas: {},
    desconocidas: { raiz: [], clinicas: {} },
    noLeidas: [],
    noMigradas: [],
    documentosFantasma: [],
    mayores: [],
    hallazgos,
  };

  const anotarMayor = (ruta, id, bytes) => {
    manifiesto.mayores.push({ ruta, id, bytes });
    manifiesto.mayores.sort((a, b) => b.bytes - a.bytes);
    manifiesto.mayores.length = Math.min(manifiesto.mayores.length, MAYORES);
  };

  /** Una lectura que la base niega o que no se puede completar se anota y se sigue con lo demás (el informe la muestra). */
  async function leerOAnotar(accion, ruta, porDefecto) {
    try {
      return await accion();
    } catch (e) {
      if (!(e instanceof ErrorDeLectura)) throw e;
      manifiesto.noLeidas.push({ ruta, estado: e.estado ?? null, permiso: e.permiso });
      return porDefecto;
    }
  }

  /** Vuelca una colección a un archivo. Devuelve sus números y los documentos que encontró (también los «fantasma»). */
  async function volcar(rutaPadre, coleccion, archivo) {
    const ruta = [rutaPadre, coleccion].filter(Boolean).join("/");
    const salida = escritor.abrir(archivo);
    const hash = createHash("sha256");
    /** @type {EstadisticaDeColeccion} */
    const estadistica = { archivo, docs: 0, bytes: 0, sha256: "", mayor: null, incompleta: false };
    const encontrados = [];
    try {
      for await (const documento of cliente.listarDocumentos(rutaPadre, coleccion)) {
        const d = decodificarDocumento(documento, hallazgos);
        encontrados.push({ id: d.id, fantasma: d.fantasma });
        if (d.fantasma) { manifiesto.documentosFantasma.push(`${ruta}/${d.id}`); continue; }
        const linea = `${JSON.stringify({ id: d.id, data: d.data })}\n`;
        const bytes = Buffer.byteLength(linea);
        salida.escribir(linea);
        hash.update(linea);
        estadistica.docs++;
        estadistica.bytes += bytes;
        if (!estadistica.mayor || bytes > estadistica.mayor.bytes) estadistica.mayor = { id: d.id, bytes };
        anotarMayor(ruta, d.id, bytes);
      }
    } catch (e) {
      // Una lectura que la base niega o que no se puede completar se anota y se sigue con lo demás (el informe la muestra).
      if (!(e instanceof ErrorDeLectura)) throw e;
      manifiesto.noLeidas.push({ ruta, estado: e.estado ?? null, permiso: e.permiso });
      estadistica.incompleta = true;
    } finally {
      salida.cerrar();
    }
    estadistica.sha256 = hash.digest("hex");
    manifiesto.totales.documentos += estadistica.docs;
    manifiesto.totales.bytes += estadistica.bytes;
    alAvanzar(`${ruta}: ${estadistica.docs} documentos${estadistica.incompleta ? " (INCOMPLETA)" : ""}`);
    return { estadistica, encontrados };
  }

  // 1. Colecciones de primer nivel.
  const enLaBase = await leerOAnotar(() => cliente.listarColecciones(""), "(raíz)", []);
  const conocidas = new Set([...colecciones.raiz, ...colecciones.noSeMigra]);
  manifiesto.desconocidas.raiz = enLaBase.filter((c) => !conocidas.has(c));
  manifiesto.noMigradas = enLaBase.filter((c) => colecciones.noSeMigra.includes(c));
  const deLaRaiz = [...colecciones.raiz.filter((c) => c !== "clinics" && enLaBase.includes(c)), ...manifiesto.desconocidas.raiz];
  for (const coleccion of deLaRaiz) manifiesto.raiz[coleccion] = (await volcar("", coleccion, `raiz/${segura(coleccion)}.jsonl`)).estadistica;

  // 2. Las clínicas: su documento y cada una de sus subcolecciones.
  const { estadistica: docsDeClinicas, encontrados } = await volcar("", "clinics", "raiz/clinics.jsonl");
  manifiesto.raiz.clinics = docsDeClinicas;
  // Un id de --clinica que no existe es casi seguro un error de tipeo: sin esto la exportación saldría vacía y con código 0.
  // (Si la lista de clínicas no se pudo leer ya quedó anotada como «no leída»: no se puede decir que el id no existe.)
  if (filtro && !docsDeClinicas.incompleta) {
    const hay = encontrados.map((c) => c.id);
    const faltan = filtro.filter((cid) => !hay.includes(cid));
    if (faltan.length) throw new Error(`Clínicas que no existen en Firestore: ${faltan.join(", ")}. Las que hay: ${hay.join(", ") || "(ninguna)"}`);
  }
  for (const { id: cid, fantasma } of encontrados) {
    if (filtro && !filtro.includes(cid)) continue;
    const subcolecciones = await leerOAnotar(() => cliente.listarColecciones(`clinics/${cid}`), `clinics/${cid}`, []);
    const desconocidas = subcolecciones.filter((c) => !colecciones.porClinica.includes(c));
    if (desconocidas.length) manifiesto.desconocidas.clinicas[cid] = desconocidas;
    /** @type {RegistroDeClinica} */
    const registro = { sinDocumento: fantasma, documentos: 0, bytes: 0, colecciones: {} };
    for (const coleccion of subcolecciones) {
      const { estadistica } = await volcar(`clinics/${cid}`, coleccion, `clinicas/${segura(cid)}/${segura(coleccion)}.jsonl`);
      registro.colecciones[coleccion] = estadistica;
      registro.documentos += estadistica.docs;
      registro.bytes += estadistica.bytes;
    }
    manifiesto.clinicas[cid] = registro;
  }
  return manifiesto;
}
