import type { Page } from "@playwright/test";
import { test, expect, entrarDemo, leerDB, sinScrollHorizontal, USUARIOS_DEMO } from "./soporte";
import { DEFAULT_TEMPLATES } from "../lib/botika";
import { ESTADOS_DEFAULT } from "../lib/estadosCita";

/* Defectos de pantallas y flujos que salieron al armar el manual (docs/manual/hallazgos-de-la-app.md, «Abiertos — pantallas y
   flujos»). Cada prueba reproduce el recorrido que ahí se describe y falla si el defecto vuelve.

   El seed arma las citas alrededor del LUNES de la semana en curso, así que las pruebas que dependen de la fecha arman su propio
   caso en el estado local de la demo (que es lo que la app usa con Firebase cortado) y no dependen del día en que corren. */

const main = (page: Page) => page.locator("main");

/** Cambia el estado local de la demo y recarga. `cambiar` corre en el navegador: no puede usar nada de afuera, solo `db` y `arg`. */
async function conDemo<A = null>(page: Page, cambiar: (db: any, arg: A) => void, arg?: A) {
  await page.evaluate(`(() => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4"));
    (${cambiar.toString()})(db, ${JSON.stringify(arg ?? null)});
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  })()`);
  await page.reload();
}

/** `yyyy-mm-dd` de hoy más `dias`, en la zona del navegador (la de la clínica). */
const fechaEn = (page: Page, dias: number) => page.evaluate((n) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}, dias);

/* ═══ Presupuestos ═══ */

test("presupuestos: la tarjeta del presupuesto recién creado se ve sin recargar la página", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/presupuestos");
  const tarjetas = main(page).locator("div.grid.gap-4.lg\\:grid-cols-2 > div");
  await expect(tarjetas.first()).toBeVisible(); // la lista ya se dibujó (si no, el conteo de abajo da 0)
  const antes = await tarjetas.count();

  await main(page).getByRole("button", { name: "Nuevo presupuesto" }).click();
  const dialogo = page.getByRole("dialog", { name: "Nuevo presupuesto" });
  await dialogo.getByRole("button", { name: "Agregar" }).click();
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(dialogo).toBeHidden();

  await expect(tarjetas).toHaveCount(antes + 1);
  // El más nuevo va primero. Existir no alcanza: antes quedaba en opacity 0 (invisible) hasta recargar.
  await expect(tarjetas.first()).toHaveCSS("opacity", "1");
  await expect(tarjetas.first()).toContainText("Borrador");
  await expect(tarjetas.first().getByRole("button", { name: "Presentar" })).toBeVisible();
});
