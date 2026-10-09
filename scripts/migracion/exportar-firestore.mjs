#!/usr/bin/env node
/** Exporta TODO Firestore (solo lectura) a archivos JSONL y entrega el informe de volumen que decide el tamaño del servidor.
 *
 *    npm run migracion:exportar -- --solo-medir                      # mide, no guarda datos de pacientes
 *    npm run migracion:exportar -- --salida ~/novudent-export/hoy    # exporta (los archivos tienen datos de pacientes: 700/600)
 *
 *  Opciones: --salida DIR · --credencial firebase-cli|servicio|entorno · --proyecto ID · --base URL (el emulador) · --clinica ID (repetible)
 *            --solo-medir · --permitir-incompleto · --ayuda
 *  Código de salida: 0 completa · 2 hay colecciones que no se pudieron leer (la exportación NO sirve para migrar) · 1 error. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { crearCliente } from "./cliente.mjs";
import { MODOS, resolverToken } from "./credenciales.mjs";
import { crearEscritorDeArchivos, escritorNulo, exportarFirestore } from "./exportar.mjs";
import { armarInforme } from "./informe.mjs";

const AYUDA = `Uso: node scripts/migracion/exportar-firestore.mjs [opciones]
  --salida DIR            carpeta de la exportación (por defecto ~/novudent-export/<fecha>; no puede estar dentro del repositorio)
  --credencial MODO       ${MODOS.join(" | ")} (por defecto firebase-cli)
  --proyecto ID           proyecto de Firebase (por defecto FIREBASE_PROJECT_ID o novudent-664f3)
  --base URL              API de Firestore alternativa (el emulador)
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

/** La exportación tiene datos de pacientes: no puede terminar dentro del repositorio (se subiría con un `git add .`). */
export function carpetaDeSalida(salida, { hoy = new Date(), directorioActual = process.cwd(), casa = homedir() } = {}) {
  const carpeta = resolve(salida ?? join(casa, "novudent-export", hoy.toISOString().slice(0, 10)));
  const relativa = relative(directorioActual, carpeta);
  if (relativa === "" || (!relativa.startsWith("..") && !isAbsolute(relativa))) {
    throw new Error(`La exportación contiene datos de pacientes: no la guardes dentro del repositorio (${carpeta}). Usá una carpeta fuera, por ejemplo ~/novudent-export.`);
  }
  return carpeta;
}

async function principal() {
  const opciones = leerArgumentos(process.argv.slice(2));
  if (opciones.ayuda) { console.log(AYUDA); return 0; }
  const carpeta = carpetaDeSalida(opciones.salida);
  const colecciones = JSON.parse(readFileSync(new URL("../../lib/backend/colecciones.json", import.meta.url), "utf8"));

  const { token, cuenta } = await resolverToken({ modo: opciones.credencial });
  console.error(`Proyecto ${opciones.proyecto} · credencial ${opciones.credencial} (${cuenta})${opciones.soloMedir ? " · solo medir" : ""}`);
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });

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

// Solo corre como programa (no cuando lo importan las pruebas).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().then((codigo) => process.exit(codigo), (e) => { console.error(`Error: ${e.message}`); process.exit(1); });
}
