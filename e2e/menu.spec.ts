import type { Page } from "@playwright/test";
import { test, expect, entrarDemo, sinScrollHorizontal, USUARIOS_DEMO } from "./soporte";

/* El menú de arriba (pedido de Camila, 7-oct-2026): «Liquidaciones» estaba dos veces (Cobranza y Administración); «Encuestas y NPS»
   tiene que ir con el CRM; «Videos 3D» tiene que estar a mano y no dentro de Administración; «Campos del paciente» llevaba a una
   pantalla donde no están; y faltaban la agenda online y los bancos. Es el menú de escritorio: en el celular el cajón usa la misma lista. */

test.skip(({ isMobile }) => isMobile, "el menú de escritorio; el cajón del celular usa la misma lista");

const barra = (page: Page) => page.getByRole("banner").getByRole("navigation");
/** Abre un desplegable de la barra y devuelve los textos de sus enlaces. */
async function desplegable(page: Page, nombre: string): Promise<string[]> {
  await barra(page).getByRole("button", { name: nombre, exact: true }).click();
  const panel = barra(page).getByRole("button", { name: nombre, exact: true }).locator("xpath=following-sibling::div[1]");
  await expect(panel).toBeVisible();
  return (await panel.getByRole("link").allInnerTexts()).map((t) => t.trim());
}
const enlaceSuelto = (page: Page, nombre: string) => barra(page).getByRole("link", { name: nombre, exact: true });

test.describe("Menú — administrador", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page); });

  test("«Liquidaciones» está una sola vez: en Administración, no en Cobranza", async ({ page }) => {
    expect(await desplegable(page, "Cobranza")).not.toContain("Liquidaciones");
    expect((await desplegable(page, "Administración")).filter((t) => t === "Liquidaciones")).toHaveLength(1);
  });

  test("«Encuestas y NPS» va en el CRM y no en Administración", async ({ page }) => {
    expect(await desplegable(page, "Administración")).not.toContain("Encuestas y NPS");
    const crm = await desplegable(page, "CRM");
    expect(crm).toEqual(["Seguimiento de pacientes", "Encuestas y NPS"]);
    await barra(page).getByRole("link", { name: "Encuestas y NPS", exact: true }).click();
    await page.waitForURL("**/app/encuestas");
    await expect(page.getByRole("heading", { name: "Encuestas y NPS", level: 1 })).toBeVisible();
  });

  test("el CRM sigue llevando al seguimiento de pacientes", async ({ page }) => {
    await desplegable(page, "CRM");
    await barra(page).getByRole("link", { name: "Seguimiento de pacientes", exact: true }).click();
    await page.waitForURL("**/app/crm");
    await expect(page.getByRole("heading", { name: "CRM", level: 1 })).toBeVisible();
  });

  test("«Videos 3D» está a mano, fuera de Administración", async ({ page }) => {
    expect(await desplegable(page, "Administración")).not.toContain("Videos 3D");
    await enlaceSuelto(page, "Videos 3D").click();
    await page.waitForURL("**/app/videos");
    await expect(page.getByRole("heading", { name: "Videos 3D", level: 1 })).toBeVisible();
  });

  test("«Campos del paciente» lleva a donde están los campos", async ({ page }) => {
    await desplegable(page, "Administración");
    await barra(page).getByRole("link", { name: "Campos del paciente", exact: true }).click();
    await page.waitForURL("**/app/pacientes#configuracion");
    await expect(page.getByRole("heading", { name: "Configuración de campos del paciente" })).toBeVisible();
  });

  test("«Agenda online» está en el menú y lleva a su link", async ({ page }) => {
    expect(await desplegable(page, "Administración")).toContain("Agenda online");
    await barra(page).getByRole("link", { name: "Agenda online", exact: true }).click();
    await page.waitForURL("**/app/configuracion#agendamiento");
    await expect(page.getByRole("heading", { name: "Agenda online", level: 2 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar link" })).toBeVisible();
  });

  test("«Arancel de precios» y «Bancos y entidades financieras» están en Administración y llevan a su tarjeta", async ({ page }) => {
    expect(await desplegable(page, "Administración")).toEqual(expect.arrayContaining(["Arancel de precios", "Bancos y entidades financieras"]));
    await barra(page).getByRole("link", { name: "Bancos y entidades financieras", exact: true }).click();
    await page.waitForURL("**/app/configuracion#bancos");
    await expect(page.getByRole("heading", { name: "Bancos y entidades financieras", level: 2 })).toBeVisible();
    await desplegable(page, "Administración");
    await barra(page).getByRole("link", { name: "Arancel de precios", exact: true }).click();
    await page.waitForURL("**/app/configuracion#arancel");
    await expect(page.getByRole("heading", { name: "Arancel de precios", level: 2 })).toBeVisible();
  });

  for (const ancho of [1024, 1100, 1280, 1440]) {
    test(`a ${ancho} px los diez ítems de la barra se ven enteros, en un renglón`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 800 });
      await page.reload();
      await expect(barra(page)).toBeVisible();
      await sinScrollHorizontal(page);
      // La página recorta lo que sobresale (overflow clip): sin esta medición, un ítem fuera de la pantalla pasaría desapercibido.
      const cajas = await barra(page).locator("> *").evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { texto: (e.textContent ?? "").trim().slice(0, 14), derecha: Math.round(b.right), alto: Math.round(b.height) }; }));
      expect(cajas.map((c) => c.texto.replace(/\d+,.*$/, "").trim())).toEqual(["Agenda", "Pacientes", "Videos 3D", "Cajas", "Cobranza", "Administración", "Reportes", "Tareas", "CRM", "Chat"]);
      for (const c of cajas) {
        expect(c.derecha, `«${c.texto}» termina en ${c.derecha}px y la pantalla mide ${ancho}`).toBeLessThanOrEqual(ancho);
        expect(c.alto, `«${c.texto}» ocupa dos renglones`).toBeLessThan(48);
      }
    });
  }
});

test.describe("Menú — otros roles", () => {
  for (const [rol, usuario, videos] of [
    ["dentista", USUARIOS_DEMO.dentista, true],
    ["asistente", USUARIOS_DEMO.asistente, true],
    ["recepcionista", USUARIOS_DEMO.recepcionista, false],
    ["caja", USUARIOS_DEMO.caja, false],
  ] as const) {
    test(`${rol}: ${videos ? "ve" : "no ve"} «Videos 3D» y no ve Administración`, async ({ page }) => {
      await entrarDemo(page, usuario);
      await expect(enlaceSuelto(page, "Videos 3D")).toHaveCount(videos ? 1 : 0);
      await expect(barra(page).getByRole("button", { name: "Administración", exact: true })).toHaveCount(0);
    });
  }

  test("la recepción ve el CRM, pero no las encuestas (son de la administración)", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    expect(await desplegable(page, "CRM")).toEqual(["Seguimiento de pacientes"]);
  });
});
