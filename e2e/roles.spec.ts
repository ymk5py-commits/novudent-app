import { test, expect, entrarDemo, leerDB, USUARIOS_DEMO } from "./soporte";

/* Roles v3 (27/9/2026): Administrador · Recepción y caja · Recepcionista ·
   Dentista · Asistente de doctores. Lo clínico no ve plata ni datos personales;
   la recepción no ve plata; solo la caja y el admin cobran. */

const menu = (page: import("@playwright/test").Page) => page.locator("aside");
const main = (page: import("@playwright/test").Page) => page.locator("main");
/** Un monto formateado en guaraníes (Gs. 420.000). */
const MONTO = /Gs\.?\s?\d/;

async function denegadas(page: import("@playwright/test").Page, rutas: string[]) {
  for (const ruta of rutas) {
    await page.goto(ruta);
    await expect(main(page), ruta).toContainText("Acceso denegado");
  }
}

test.describe("Dentista", () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile, "el menú lateral se prueba en escritorio");
    await entrarDemo(page, USUARIOS_DEMO.dentista);
  });

  test("no maneja plata: sin caja, facturación, informes, laboratorios ni configuración", async ({ page }) => {
    await expect(menu(page)).not.toContainText("Cajas");
    await expect(menu(page)).not.toContainText("Facturación");
    await denegadas(page, ["/app/caja", "/app/facturacion", "/app/reportes", "/app/laboratorios", "/app/configuracion"]);
  });

  test("trabaja la ficha de sus pacientes sin datos personales", async ({ page }) => {
    await page.goto("/app/pacientes/p1");
    await expect(main(page)).toContainText("María González");
    await expect(main(page).getByRole("button", { name: "Ficha clínica" })).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Datos personales" })).toHaveCount(0);
    await expect(main(page)).not.toContainText("981 111 111");
  });

  test("ve sus planes de tratamiento sin precios", async ({ page }) => {
    await page.goto("/app/pacientes/p1");
    await main(page).getByRole("button", { name: "Planes de tratamiento" }).click();
    const plan = main(page).getByRole("button", { name: /#g1: Plan dental integral/ });
    await expect(plan).toBeVisible();
    await expect(main(page)).not.toContainText(MONTO);
    await plan.click();
    await expect(main(page)).toContainText("Avance del plan");
    await expect(main(page)).not.toContainText(MONTO);
  });
});

test.describe("Asistente de doctores", () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile, "el menú lateral se prueba en escritorio");
    await entrarDemo(page, USUARIOS_DEMO.asistente);
  });

  test("no cobra ni ve plata", async ({ page }) => {
    await expect(menu(page)).not.toContainText("Cajas");
    await denegadas(page, ["/app/caja", "/app/facturacion", "/app/reportes", "/app/configuracion"]);
    await page.goto("/app/gastos");
    await expect(main(page)).toContainText("no tiene acceso a Gastos");
  });

  test("solo ve la agenda y los pacientes de su doctora", async ({ page }) => {
    await page.goto("/app/agenda");
    await expect(main(page)).not.toContainText("Diego Martínez");
    // Lucía Ferreira solo tiene cita con el Dr. Martínez.
    await page.goto("/app/pacientes/p5");
    await expect(main(page)).toContainText("Este paciente no está entre tus pacientes");
    await page.goto("/app/pacientes/p1");
    await expect(main(page)).toContainText("María González");
    await expect(main(page)).not.toContainText("981 111 111");
  });

  test("el aviso de Reportes no le dice que es de la Asistente", async ({ page }) => {
    await page.goto("/app/reportes");
    await expect(main(page)).toContainText("Acceso denegado");
    await expect(main(page)).not.toContainText("la Asistente");
  });
});

test.describe("Recepcionista", () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile, "el menú lateral se prueba en escritorio");
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
  });

  test("agenda y datos del paciente, sin plata", async ({ page }) => {
    await expect(menu(page)).not.toContainText("Cajas");
    await denegadas(page, ["/app/caja", "/app/facturacion", "/app/reportes", "/app/configuracion"]);
    await page.goto("/app/pacientes");
    await expect(main(page)).toContainText("González"); // nombre y apellido van en columnas separadas
    await expect(main(page)).not.toContainText("Deudas");
  });

  test("abre los datos del paciente pero no la ficha clínica", async ({ page }) => {
    await page.goto("/app/pacientes/p1");
    await expect(main(page).getByRole("button", { name: "Datos personales" })).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Ficha clínica" })).toHaveCount(0);
    await expect(main(page).getByRole("button", { name: "Planes de tratamiento" })).toHaveCount(0);
    await expect(main(page).getByRole("button", { name: "Recibir pago" })).toHaveCount(0);
    // El brief de «Preparar consulta» resume la ficha clínica: no es para la recepción.
    await expect(main(page).getByRole("button", { name: "Preparar consulta" })).toHaveCount(0);
  });
});

test.describe("Recepción y caja", () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile, "el menú lateral se prueba en escritorio");
    await entrarDemo(page, USUARIOS_DEMO.caja);
  });

  test("cobra y hace arqueo, pero no ve los números del negocio", async ({ page }) => {
    await expect(menu(page)).toContainText("Cajas");
    for (const ruta of ["/app/caja", "/app/facturacion"]) {
      await page.goto(ruta);
      await expect(main(page), ruta).not.toContainText("Acceso denegado");
    }
    await denegadas(page, ["/app/reportes", "/app/liquidaciones", "/app/laboratorios", "/app/configuracion"]);
    await page.goto("/app/gastos");
    await expect(main(page)).toContainText("no tiene acceso a Gastos");
  });
});

test.describe("Administrador", () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile, "el menú lateral se prueba en escritorio");
    await entrarDemo(page, USUARIOS_DEMO.admin);
  });

  test("asigna los doctores de cada asistente", async ({ page }) => {
    await page.goto("/app/configuracion");
    const grupo = page.getByRole("group", { name: `Doctores a los que asiste ${USUARIOS_DEMO.asistente}` });
    const diego = grupo.getByRole("button", { name: "Dr. Diego Martínez" });
    await expect(diego).toHaveAttribute("aria-pressed", "false");
    await diego.click();
    await expect(diego).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await leerDB(page))?.users.find((u: { id: string }) => u.id === "u3")?.asiste).toEqual(["u2", "u4"]);
  });
});
