import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/** Los textos que mandan a la gente a un lugar del menú tienen que nombrar un lugar que existe.
 *  El menú real es «Administración › Usuarios y profesionales» (components/Shell.tsx): no hay una «Configuración → Usuarios».
 *  Esto recorre el código de la app (no las pruebas ni los documentos) y falla si vuelve a aparecer. */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const CARPETAS = ["app", "components", "lib"];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (nombre === "node_modules" || nombre === ".next" || nombre === "odontogram-engine") return [];
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\.ts$/.test(nombre) ? [ruta] : [];
  });
}

describe("textos que nombran un lugar del menú", () => {
  const todos = CARPETAS.flatMap((c) => archivos(join(RAIZ, c)));
  const MAL = /Configuraci[óo]n\s*(→|›|>|&gt;|-&gt;)\s*Usuarios/;

  it("hay código para recorrer", () => {
    expect(todos.length).toBeGreaterThan(100);
  });

  it("ninguno manda a «Configuración → Usuarios» (el menú dice «Administración › Usuarios y profesionales»)", () => {
    const culpables = todos.filter((f) => MAL.test(readFileSync(f, "utf8"))).map((f) => f.replace(RAIZ, ""));
    expect(culpables).toEqual([]);
  });

  it("el lugar al que ahora mandan existe en el menú", () => {
    const shell = readFileSync(join(RAIZ, "components/Shell.tsx"), "utf8");
    expect(shell).toContain('label: "Administración"');
    expect(shell).toContain('label: "Usuarios y profesionales"');
  });
});
