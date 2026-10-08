import { test, expect, entrarDemo, leerDB, USUARIOS_DEMO } from "./soporte";
import type { Page } from "@playwright/test";

/* Listado de pacientes según la revisión de Novum (27/9/2026): código interno, CI o RUC,
   nombre, apellido, tratamientos y deudas; menú ⋮ con opciones por rol; habilitados y
   deshabilitados; «Análisis de estudios específicos». */

const main = (page: Page) => page.locator("main");
const menuDe = (page: Page, nombre: string) => page.getByRole("menu", { name: `Acciones de ${nombre}` });

test.describe("recepcionista", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page, USUARIOS_DEMO.recepcionista); await page.goto("/app/pacientes"); });

  test("ve código, CI, nombre, apellido y tratamientos, sin deudas ni íconos sueltos", async ({ page, isMobile }) => {
    if (isMobile) {
      await expect(main(page).getByRole("link", { name: "María González" })).toBeVisible();
      await expect(main(page)).toContainText("3.456.789");
      await expect(main(page)).toContainText("Tratamientos");
    } else {
      const encabezados = main(page).locator("thead th");
      await expect(encabezados).toContainText(["Código", "CI o RUC", "Nombre", "Apellido", "Tratamientos"]);
      await expect(main(page).locator("thead")).not.toContainText("Deudas");
      await expect(main(page).getByRole("row", { name: /María/ }).first()).toContainText("3.456.789");
    }
    await expect(main(page)).not.toContainText("Deudas");
    await expect(main(page).locator("[data-tip*='formulario']")).toHaveCount(0);
  });

  test("el menú ⋮ ofrece datos personales, tratamientos y deshabilitar, no pagos", async ({ page }) => {
    await main(page).getByRole("button", { name: "Acciones de María González" }).click();
    const menu = menuDe(page, "María González");
    await expect(menu.getByRole("menuitem", { name: "Ir a datos personales" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Ir a tratamientos" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Deshabilitar paciente" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /pagos|recaudación/i })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Ir a datos personales" }).click();
    await page.waitForURL(/\/app\/pacientes\/[^/]+\/datos$/);
    await expect(main(page).getByText("Datos requeridos")).toBeVisible();
  });

  test("deshabilitar saca al paciente de la lista y aparece en «Deshabilitados»", async ({ page, isMobile }) => {
    const ficha = isMobile
      ? main(page).getByRole("link", { name: "Lucía Ferreira" })
      : main(page).getByRole("link", { name: "Abrir la ficha de Lucía Ferreira" });
    page.on("dialog", (d) => d.accept());
    await main(page).getByRole("button", { name: "Acciones de Lucía Ferreira" }).click();
    await menuDe(page, "Lucía Ferreira").getByRole("menuitem", { name: "Deshabilitar paciente" }).click();
    await expect(ficha).toHaveCount(0);
    expect((await leerDB(page)).patients.find((p: { id: string }) => p.id === "p5")?.disabled).toBe(true);
    await main(page).getByLabel("Mostrar pacientes").selectOption("deshabilitados");
    await expect(ficha).toBeVisible();
    await expect(main(page)).toContainText("Deshabilitado");
  });
});

test.describe("administrador", () => {
  test("el menú ⋮ suma pagos recibidos y recaudación", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.admin);
    await page.goto("/app/pacientes");
    await main(page).getByRole("button", { name: "Acciones de María González" }).click();
    const menu = menuDe(page, "María González");
    await expect(menu.getByRole("menuitem", { name: "Ir a pagos recibidos" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Ir a recaudación" })).toBeVisible();
  });

  test("los pacientes tienen código interno y el alta asigna el siguiente", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.admin);
    const db = await leerDB(page);
    const codigos = db.patients.map((p: { code?: number }) => p.code);
    expect(codigos.every((c: number | undefined) => typeof c === "number")).toBe(true);
    await page.goto("/app/pacientes/nuevo");
    await expect(main(page)).toContainText(`Código interno: ${Math.max(...codigos) + 1}`);
  });
});

test.describe("análisis de estudios específicos", () => {
  test("reemplaza a «Pacientes de Ortodoncia» y filtra por tipo de estudio", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.admin);
    await page.goto("/app/pacientes");
    await expect(main(page).getByRole("button", { name: /Pacientes de Ortodoncia/ })).toHaveCount(0);
    await main(page).getByRole("button", { name: "Análisis de estudios específicos" }).click();
    const grupo = main(page).getByRole("group", { name: "Tipo de estudio" });
    for (const v of ["Vista general", "Ortodoncia", "Rehabilitación oral", "Odontología estética"]) await expect(grupo.getByRole("button", { name: v })).toBeVisible();
    await expect(main(page)).toContainText("Pacientes en vista general");
    await grupo.getByRole("button", { name: "Ortodoncia" }).click();
    await expect(main(page)).toContainText("Marco Giménez"); // el paciente con ortodoncia activa de la demo
  });
});
