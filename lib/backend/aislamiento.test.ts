import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, it, expect } from "vitest";

/** Solo `lib/backend/firestore.ts` habla con Firebase. El resto de la app (pantallas, componentes, la tienda) usa `lib/backend` (la interfaz),
 *  así el día que la base sea otra (Supabase) no hay que tocar nada de eso y, con `NEXT_PUBLIC_BACKEND=supabase`, ninguna pantalla le pide
 *  nada a Firebase.
 *
 *  Hay tres formas de hablar con Firebase y las tres se vigilan:
 *   A. Importar el SDK (`firebase/…`, `@firebase/…`). Lo permiten `lib/firebase.ts` (que lo inicializa), `lib/backend/firestore.ts` y las
 *      pruebas con el emulador (arman una instancia de Firestore para probar la implementación).
 *   B. Importar el envoltorio `lib/firebase.ts` (`@/lib/firebase`, `./firebase`, `../firebase`…). Solo lo permite `lib/backend/firestore.ts`.
 *   C. Importar el módulo `lib/backend/firestore` (`@/lib/backend/firestore`, `./firestore`…). Solo lo permiten `lib/backend/index.ts` (que lo elige
 *      según `NEXT_PUBLIC_BACKEND`) y las `lib/backend/*.emulador.test.ts`: cualquier otro se saltaría el selector y seguiría hablando con Firestore
 *      aunque la app esté configurada para otra base. */
const PERMITIDOS_SDK = new Set(["lib/firebase.ts", "lib/backend/firestore.ts"]);
const PERMITIDOS_ENVOLTORIO = new Set(["lib/backend/firestore.ts"]);
const PERMITIDOS_BACKEND_FIRESTORE = new Set(["lib/backend/index.ts"]);
const esPruebaConEmulador = (ruta: string) => ruta.startsWith("lib/backend/") && ruta.endsWith(".emulador.test.ts");
const RAIZ = join(__dirname, "..", "..");
const ENVOLTORIO = join(RAIZ, "lib", "firebase");
const BACKEND_FIRESTORE = join(RAIZ, "lib", "backend", "firestore");
const CARPETAS = ["app", "components", "lib"];

/** Todo lo que se importa: `from "x"`, `import "x"`, `import("x")` y `require("x")`, con comillas simples o dobles. */
const ESPECIFICADOR = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(["'])([^"'\n]+)\1/g;
const ES_SDK = /^(@firebase|firebase)(\/|$)/;

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (nombre === "node_modules" || nombre === ".next") return [];
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
  });
}

function especificadores(texto: string): string[] {
  return [...texto.matchAll(ESPECIFICADOR)].map((m) => m[2]);
}

/** ¿Este especificador, escrito en `rutaAbsoluta`, apunta al módulo `destino` (ruta absoluta sin extensión)? (con o sin extensión, con o sin `/index`) */
function apuntaA(especificador: string, rutaAbsoluta: string, destino: string): boolean {
  const sinExtension = (r: string) => r.replace(/\.(ts|tsx|js|mjs)$/, "").replace(/[\\/]index$/, "");
  if (especificador.startsWith("@/")) return sinExtension(resolve(RAIZ, especificador.slice(2))) === destino;
  if (especificador.startsWith(".")) return sinExtension(resolve(dirname(rutaAbsoluta), especificador)) === destino;
  return false;
}
const apuntaAlEnvoltorio = (especificador: string, rutaAbsoluta: string) => apuntaA(especificador, rutaAbsoluta, ENVOLTORIO);
const apuntaAlBackendFirestore = (especificador: string, rutaAbsoluta: string) => apuntaA(especificador, rutaAbsoluta, BACKEND_FIRESTORE);

const TODOS = CARPETAS.flatMap((c) => archivos(join(RAIZ, c))).map((absoluta) => ({
  absoluta,
  ruta: relative(RAIZ, absoluta).split(sep).join("/"),
  imports: especificadores(readFileSync(absoluta, "utf8")),
}));

describe("aislamiento de Firebase", () => {
  it("solo lib/firebase.ts y lib/backend/firestore.ts (y sus pruebas con el emulador) importan el SDK de Firebase", () => {
    const infractores = TODOS
      .filter(({ ruta }) => !PERMITIDOS_SDK.has(ruta) && !esPruebaConEmulador(ruta))
      .flatMap(({ ruta, imports }) => imports.filter((e) => ES_SDK.test(e)).map((e) => `${ruta} importa el SDK «${e}»`));
    expect(infractores).toEqual([]);
  });

  it("solo lib/backend/firestore.ts importa el envoltorio lib/firebase.ts: el resto pasa por lib/backend", () => {
    const infractores = TODOS
      .filter(({ ruta }) => !PERMITIDOS_ENVOLTORIO.has(ruta))
      .flatMap(({ ruta, absoluta, imports }) => imports.filter((e) => apuntaAlEnvoltorio(e, absoluta)).map((e) => `${ruta} importa el envoltorio «${e}»`));
    expect(infractores).toEqual([]);
  });

  it("solo lib/backend/index.ts (y las lib/backend/*.emulador.test.ts) importan lib/backend/firestore: el resto pasa por el selector NEXT_PUBLIC_BACKEND", () => {
    const infractores = TODOS
      .filter(({ ruta }) => !PERMITIDOS_BACKEND_FIRESTORE.has(ruta) && !esPruebaConEmulador(ruta))
      .flatMap(({ ruta, absoluta, imports }) => imports.filter((e) => apuntaAlBackendFirestore(e, absoluta)).map((e) => `${ruta} importa el backend de Firestore «${e}» sin pasar por lib/backend/index.ts`));
    expect(infractores).toEqual([]);
  });

  it("la lista de permitidos existe (si se renombra un archivo, este test lo avisa)", () => {
    for (const ruta of new Set([...PERMITIDOS_SDK, ...PERMITIDOS_ENVOLTORIO, ...PERMITIDOS_BACKEND_FIRESTORE])) expect(() => statSync(join(RAIZ, ruta))).not.toThrow();
  });

  it("el lector de imports entiende las formas que se usan (y no se confunde con texto)", () => {
    const texto = [
      'import { a } from "x1";', "import b from 'x2';", 'import "x3";', 'const c = await import("x4");', "const d = require('x5');",
      'export * from "x6";', 'import type { T } from "x7";', 'const sinImportar = "firebase/auth";',
    ].join("\n");
    expect(especificadores(texto)).toEqual(["x1", "x2", "x3", "x4", "x5", "x6", "x7"]);
    expect(ES_SDK.test("firebase/firestore/lite")).toBe(true);
    expect(ES_SDK.test("@firebase/rules-unit-testing")).toBe(true);
    expect(ES_SDK.test("firebase-admin")).toBe(false);
    const desdeLib = join(RAIZ, "lib", "avisoCita.ts");
    const desdeBackend = join(RAIZ, "lib", "backend", "firestore.ts");
    expect(apuntaAlEnvoltorio("@/lib/firebase", desdeLib)).toBe(true);
    expect(apuntaAlEnvoltorio("./firebase", desdeLib)).toBe(true);
    expect(apuntaAlEnvoltorio("../firebase", desdeBackend)).toBe(true);
    expect(apuntaAlEnvoltorio("../firebase.ts", desdeBackend)).toBe(true);
    expect(apuntaAlEnvoltorio("./firebase", desdeBackend)).toBe(false); // lib/backend/firebase no existe: no es el envoltorio
    expect(apuntaAlEnvoltorio("@/lib/backend", desdeLib)).toBe(false);
    // y el módulo del backend de Firestore, escrito de todas las formas
    const desdeIndex = join(RAIZ, "lib", "backend", "index.ts");
    const desdeUnComponente = join(RAIZ, "components", "Shell.tsx");
    expect(apuntaAlBackendFirestore("@/lib/backend/firestore", desdeUnComponente)).toBe(true);
    expect(apuntaAlBackendFirestore("@/lib/backend/firestore.ts", desdeUnComponente)).toBe(true);
    expect(apuntaAlBackendFirestore("./backend/firestore", desdeLib)).toBe(true);
    expect(apuntaAlBackendFirestore("../lib/backend/firestore", desdeUnComponente)).toBe(true);
    expect(apuntaAlBackendFirestore("./firestore", desdeIndex)).toBe(true);
    expect(apuntaAlBackendFirestore("@/lib/backend", desdeUnComponente)).toBe(false); // el índice (el selector) es lo que SÍ se importa
    expect(apuntaAlBackendFirestore("@/lib/backend/index", desdeUnComponente)).toBe(false);
    expect(apuntaAlBackendFirestore("./firestore.contrato.emulador.test", desdeIndex)).toBe(false);
    expect(apuntaAlBackendFirestore("./firestore", desdeLib)).toBe(false); // lib/firestore no existe: no es el backend
  });
});
