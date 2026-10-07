/** Saca las capturas de los procedimientos (uno por prueba, en paralelo). Para una parte:
 *    MANUAL_SOLO=recepcion npm run manual:capturas                 (los módulos de contenido/ que nombres, separados por coma)
 *    npm run manual:capturas -- --grep dar-una-cita                (un procedimiento)
 *  Antes de sacar nada se valida el texto: si algo está mal, la corrida falla con la lista de problemas. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "../../e2e/soporte";
import { CaptorPW, SALIDA } from "./captor";
import { cargarCapitulos } from "./contenido/cargar";
import { validar } from "./montar";
import { ROLE_LABEL } from "../../lib/rbac";
import type { RolId } from "./contenido/tipos";

const { capitulos, parcial } = cargarCapitulos();

test("el texto del manual no tiene problemas", () => {
  const problemas = validar(capitulos, { ignorarReferencias: parcial });
  if (problemas.length) throw new Error(`El contenido tiene ${problemas.length} problema(s):\n- ${problemas.join("\n- ")}`);
});

for (const p of capitulos.flatMap((c) => c.procedimientos)) {
  if (!p.capturar) continue;
  test(`capturas: ${p.id}`, async ({ page }) => {
    await p.capturar!(new CaptorPW(page, p.id));
  });
}

/** El menú de arriba que ve cada rol, para la hoja «Tu rol» de cada capítulo (sale de la app, no se tipea a mano). */
test("capturas: menú de cada rol", async ({ page }) => {
  test.skip(parcial, "solo en la corrida completa");
  const roles: RolId[] = ["receptionist", "cashier", "dentist", "assistant", "admin"];
  const menus: Partial<Record<RolId, string[]>> = {};
  for (const rol of roles) {
    const c = new CaptorPW(page, "_menus");
    await c.entrar(rol);
    menus[rol] = await c.menu();
    await page.evaluate(() => { localStorage.clear(); });
    await page.goto("/login?demo=1");
  }
  mkdirSync(SALIDA, { recursive: true });
  writeFileSync(join(SALIDA, "menus.json"), JSON.stringify(menus, null, 2));
  console.log(roles.map((r) => `${ROLE_LABEL[r]}: ${menus[r]!.join(" · ")}`).join("\n"));
});
