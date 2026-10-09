import { test, expect, entrarDemo, sinScrollHorizontal, USUARIOS_DEMO } from "./soporte";
import type { Page } from "@playwright/test";

/* Campana de pendientes (revisión de Novum, 6-oct-2026): antes decía «3 pendientes» y llevaba a la
   lista de pacientes sin decir cuáles. Ahora abre un panel con cada paciente y su documento, y
   cada fila lleva directo a resolverlo. */

const campana = (page: Page) => page.getByRole("button", { name: /^(Ver pendientes|Sin pendientes)/ });
const panel = (page: Page) => page.getByRole("menu", { name: "Pendientes" });
const main = (page: Page) => page.locator("main");

test.describe("Campana de pendientes", () => {
  test("el panel dice cuáles son los pendientes y cada fila lleva a resolverlo", async ({ page }) => {
    await entrarDemo(page);
    await campana(page).click();
    await expect(panel(page)).toContainText("Documentos clínicos pendientes (3)"); // p1 y p2 (documentos) y p4 (formulario viejo)
    const documentos = panel(page).getByRole("region", { name: "Documentos clínicos pendientes" });
    for (const nombre of ["María González", "Juan Ríos", "Andrés Mejía"]) {
      await expect(documentos.getByRole("menuitem", { name: new RegExp(nombre) })).toBeVisible();
    }
    await expect(panel(page)).toContainText(/Retenciones de facturación \(\d+\)/);

    await documentos.getByRole("menuitem", { name: /Juan Ríos/ }).click();
    await page.waitForURL("**/app/pacientes/p2/documentos");
    await expect(page.getByRole("heading", { name: "Documentos clínicos" })).toBeVisible();
    await expect(panel(page)).toHaveCount(0); // se cerró al elegir
  });

  test("Escape cierra el panel y el número de la campana es el de la lista", async ({ page }) => {
    await entrarDemo(page);
    const etiqueta = (await campana(page).getAttribute("aria-label")) ?? "";
    const n = Number(/\((\d+)\)/.exec(etiqueta)?.[1]);
    await campana(page).click();
    const filas = await panel(page).getByRole("menuitem").filter({ hasNotText: /Ver (todos|todas)/ }).count();
    expect(filas).toBe(n); // una fila por paciente con documentos + una por reclamo en retención
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
  });

  test("«Ver todos» abre la lista de pacientes con documentos pendientes y el filtro se quita", async ({ page }) => {
    await entrarDemo(page);
    await campana(page).click();
    await panel(page).getByRole("menuitem", { name: /Ver todos en la lista de pacientes/ }).click();
    await page.waitForURL("**/app/pacientes?pendientes=documentos");
    await expect(main(page).getByText("Con documentos pendientes")).toBeVisible();
    await expect(main(page).getByRole("link", { name: /Juan Ríos/ })).toBeVisible();
    await expect(main(page).getByRole("link", { name: /Camila Ortega/ })).toHaveCount(0); // no tiene nada pendiente

    await main(page).getByRole("button", { name: "Quitar filtro" }).click();
    await expect(main(page).getByRole("link", { name: /Camila Ortega/ })).toBeVisible();
    await expect(main(page).getByText("Con documentos pendientes")).toHaveCount(0);
    await expect(page).toHaveURL(/\/app\/pacientes$/);
  });

  test("la tarjeta «Documentos pendientes» de Inicio abre esa misma lista filtrada", async ({ page }) => {
    await entrarDemo(page);
    await page.getByRole("link", { name: /Documentos pendientes/ }).click();
    await page.waitForURL("**/app/pacientes?pendientes=documentos");
    await expect(main(page).getByText("Con documentos pendientes")).toBeVisible();
  });

  test("las retenciones llevan a Facturación ya filtrada por «En retención»", async ({ page }) => {
    await entrarDemo(page);
    await campana(page).click();
    await panel(page).getByRole("menuitem", { name: /Ver todas en Facturación/ }).click();
    await page.waitForURL("**/app/facturacion?filtro=en-retencion");
    await expect(page.getByRole("button", { name: "En retención" })).toHaveClass(/bg-azure-600/);
  });

  test("la tarjeta «Reclamos en retención» de Inicio también abre Facturación filtrada", async ({ page }) => {
    await entrarDemo(page);
    await page.getByRole("link", { name: /Reclamos en retención/ }).click();
    await page.waitForURL("**/app/facturacion?filtro=en-retencion");
    await expect(page.getByRole("button", { name: "En retención" })).toHaveClass(/bg-azure-600/);
  });

  test("quien no gestiona documentos ni ve montos ve «Todo al día»", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    await page.getByRole("button", { name: "Sin pendientes" }).click();
    await expect(panel(page)).toContainText("Todo al día");
  });

  test("la recepción ve los documentos pendientes pero no las retenciones (son plata)", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await campana(page).click();
    await expect(panel(page)).toContainText("Documentos clínicos pendientes");
    await expect(panel(page)).not.toContainText("Retenciones de facturación");
  });

  test("en el celular el panel entra en la pantalla", async ({ page, isMobile }) => {
    test.skip(!isMobile, "solo tiene sentido con el ancho del celular");
    await entrarDemo(page);
    await campana(page).click();
    await expect(panel(page)).toBeVisible();
    const caja = await panel(page).boundingBox();
    const vista = page.viewportSize()!;
    expect(caja!.x).toBeGreaterThanOrEqual(0);
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(vista.width);
    await sinScrollHorizontal(page);
  });
});
