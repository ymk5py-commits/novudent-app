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

/* ═══ Configuración ═══ */

test("Configuración › Documentos clínicos: «Guardar plantillas» guarda y saca la barra de cambios", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/configuracion#documentos-clinicos");
  const tarjeta = page.getByRole("heading", { name: "Documentos clínicos", level: 2 }).locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
  const guardar = tarjeta.getByRole("button", { name: "Guardar plantillas" });
  const descartar = tarjeta.getByRole("button", { name: "Descartar", exact: true });
  await expect(guardar).toHaveCount(0); // recién abierta no hay nada que guardar

  await tarjeta.getByRole("row", { name: /Cuidados postoperatorios de exodoncia/ }).getByRole("button", { name: "Desactivar", exact: true }).click();
  await expect(guardar).toBeVisible();
  await expect(descartar).toBeVisible();

  await guardar.click();
  // Los cambios se guardan: la barra se va y aparece la confirmación.
  await expect(tarjeta.getByRole("status").filter({ hasText: "Plantillas guardadas" })).toBeVisible();
  await expect(guardar).toHaveCount(0);
  await expect(descartar).toHaveCount(0);
  await expect.poll(async () => {
    const plantillas = (await leerDB(page)).clinics[0].config.plantillasDocumento as { id: string; inactiva?: boolean }[];
    return plantillas?.find((p) => p.id === "cuidados_exodoncia")?.inactiva;
  }).toBe(true);

  // Y sigue guardado al recargar, sin la barra.
  await page.reload();
  await expect(tarjeta.getByRole("row", { name: /Cuidados postoperatorios de exodoncia/ }).getByText("Inactiva")).toBeVisible();
  await expect(guardar).toHaveCount(0);
});

test.describe("Administración: los atajos a Configuración", () => {
  test.skip(({ isMobile }) => isMobile, "es el menú de escritorio; el cajón del celular usa la misma lista");

  const barra = (page: Page) => page.getByRole("banner").getByRole("navigation");
  const abrirAdministracion = (page: Page) => barra(page).getByRole("button", { name: "Administración", exact: true }).click();

  test("todos llevan a una tarjeta que existe (antes «Documentos y consentimientos» iba a un ancla inexistente)", async ({ page }) => {
    await entrarDemo(page);
    await abrirAdministracion(page);
    const hrefs = await page.getByRole("banner").locator("a[href^='/app/configuracion#']").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThan(8);
    expect(hrefs).toContain("/app/configuracion#consentimientos");
    for (const href of new Set(hrefs)) {
      const ancla = href.split("#")[1];
      await page.goto(href);
      await expect(page.locator(`[id="${ancla}"]`), `el atajo ${href} no tiene a dónde llegar`).toHaveCount(1);
    }
  });

  test("«Documentos y consentimientos» lleva a las plantillas de consentimiento", async ({ page }) => {
    await entrarDemo(page);
    await abrirAdministracion(page);
    await barra(page).getByRole("link", { name: "Documentos y consentimientos", exact: true }).click();
    await page.waitForURL("**/app/configuracion#consentimientos");
    await expect(page.getByRole("heading", { name: "Plantillas de consentimiento", level: 2 })).toBeInViewport();
  });
});
