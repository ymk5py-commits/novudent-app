import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it, expect } from "vitest";

/** Solo estos archivos pueden hablar con el SDK de Firebase (más las pruebas con el emulador, que arman una instancia de Firestore para
 *  probar la implementación). El resto de la app usa `lib/backend` (la interfaz), así el día que la base sea otra (Supabase) no hay que
 *  tocar pantallas ni la tienda. */
const PERMITIDOS = new Set(["lib/firebase.ts", "lib/backend/firestore.ts"]);
const esPruebaConEmulador = (ruta: string) => ruta.startsWith("lib/backend/") && ruta.endsWith(".emulador.test.ts");
const RAIZ = join(__dirname, "..", "..");
const CARPETAS = ["app", "components", "lib"];
const IMPORTA_FIREBASE = /(from\s+["']firebase(\/[a-z-]+)?["'])|(import\(\s*["']firebase(\/[a-z-]+)?["']\s*\))|(require\(\s*["']firebase)/;

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (nombre === "node_modules" || nombre === ".next") return [];
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
  });
}

describe("aislamiento de Firebase", () => {
  it("solo lib/firebase.ts y lib/backend/firestore.ts (y sus pruebas con el emulador) importan el SDK de Firebase", () => {
    const infractores = CARPETAS.flatMap((c) => archivos(join(RAIZ, c)))
      .map((ruta) => relative(RAIZ, ruta).split(sep).join("/"))
      .filter((ruta) => !PERMITIDOS.has(ruta) && !esPruebaConEmulador(ruta))
      .filter((ruta) => IMPORTA_FIREBASE.test(readFileSync(join(RAIZ, ruta), "utf8")));
    expect(infractores).toEqual([]);
  });

  it("la lista de permitidos existe (si se renombra un archivo, este test lo avisa)", () => {
    for (const ruta of PERMITIDOS) expect(() => statSync(join(RAIZ, ruta))).not.toThrow();
  });
});
