import { test, expect, entrarDemo, USUARIOS_DEMO } from "./soporte";

const menu = (page: import("@playwright/test").Page) => page.locator("aside");

test.describe("Dentista", () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile, "el menú lateral se prueba en escritorio");
    await entrarDemo(page, USUARIOS_DEMO.dentista);
  });
  test("no maneja plata: sin caja, ni informes financieros, ni configuración", async ({ page }) => {
    await expect(menu(page)).not.toContainText("Cajas");
    for (const ruta of ["/app/caja", "/app/reportes", "/app/configuracion"]) {
      await page.goto(ruta);
      await expect(page.locator("main")).toContainText("Acceso denegado");
    }
  });
  test("sí trabaja la ficha clínica", async ({ page }) => {
    await page.goto("/app/pacientes/p1");
    await expect(page.locator("main")).toContainText("María González");
    await expect(page.locator("main")).not.toContainText("Acceso denegado");
  });
});

test.describe("Asistente", () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile, "el menú lateral se prueba en escritorio");
    await entrarDemo(page, USUARIOS_DEMO.asistente);
  });
  test("cobra y hace arqueo, pero no ve los números del negocio", async ({ page }) => {
    await expect(menu(page)).toContainText("Cajas");
    await page.goto("/app/caja");
    await expect(page.locator("main")).not.toContainText("Acceso denegado");
    await page.goto("/app/reportes");
    await expect(page.locator("main")).toContainText("Acceso denegado");
    await page.goto("/app/gastos");
    await expect(page.locator("main")).toContainText("no tiene acceso a Gastos");
    await page.goto("/app/configuracion");
    await expect(page.locator("main")).toContainText("Acceso denegado");
  });

  test.fixme("el aviso de Reportes no le dice que es de la Asistente", async ({ page }) => {
    /* BUG de texto: a la asistente se le niega Reportes con "Los informes financieros son del
       Administrador y la Asistente". La matriz RBAC (billing.reports) dice solo Administrador. */
    await page.goto("/app/reportes");
    await expect(page.locator("main")).not.toContainText("la Asistente");
  });
});
