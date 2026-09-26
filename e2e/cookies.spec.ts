import { test, expect, sinScrollHorizontal } from "./soporte";

const CLAVE = "novudent.consentimiento.v1";
const leer = (page: import("@playwright/test").Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), CLAVE);

test.describe("Aviso de cookies — primera visita", () => {
  test.use({ consentimiento: "sin-decidir" });

  test("aparece, y Aceptar y Rechazar pesan lo mismo", async ({ page }) => {
    await page.goto("/");
    const aviso = page.getByRole("region", { name: "Aviso de cookies" });
    await expect(aviso).toBeVisible();
    const [rechazar, aceptar] = [aviso.getByRole("button", { name: "Rechazar" }), aviso.getByRole("button", { name: "Aceptar" })];
    const estilo = (l: typeof rechazar) =>
      l.evaluate((b) => {
        const s = getComputedStyle(b);
        return { w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), bg: s.backgroundColor, color: s.color, peso: s.fontWeight };
      });
    expect(await estilo(rechazar)).toEqual(await estilo(aceptar));
    await sinScrollHorizontal(page);
  });

  test("rechazar guarda la elección, cierra el aviso y no vuelve a preguntar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("region", { name: "Aviso de cookies" }).getByRole("button", { name: "Rechazar" }).click();
    await expect(page.getByRole("region", { name: "Aviso de cookies" })).toHaveCount(0);
    expect(await leer(page)).toMatchObject({ version: 1, analitica: false });
    await page.reload();
    await expect(page.getByRole("region", { name: "Aviso de cookies" })).toHaveCount(0);
  });

  test("antes de decidir no se pide nada de Google Analytics", async ({ page }) => {
    const pedidos: string[] = [];
    page.on("request", (r) => { if (/googletagmanager|google-analytics/.test(r.url())) pedidos.push(r.url()); });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(pedidos).toEqual([]);
  });

  test("Configurar permite activar solo la analítica", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("region", { name: "Aviso de cookies" }).getByRole("button", { name: "Configurar" }).click();
    const dialogo = page.getByRole("dialog", { name: "Preferencias de cookies" });
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole("checkbox").check();
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo).toBeHidden();
    expect(await leer(page)).toMatchObject({ analitica: true });
  });
});

test("«Configurar cookies» del pie reabre las preferencias con la elección actual", async ({ page }) => {
  await page.goto("/cookies");
  await page.getByRole("contentinfo").getByRole("button", { name: "Configurar cookies" }).click();
  const dialogo = page.getByRole("dialog", { name: "Preferencias de cookies" });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole("checkbox")).not.toBeChecked(); // la prueba arranca con la analítica rechazada
  await page.keyboard.press("Escape");
  await expect(dialogo).toBeHidden();
});

test("el pie enlaza las tres páginas legales", async ({ page }) => {
  await page.goto("/");
  const pie = page.getByRole("contentinfo");
  for (const [nombre, ruta] of [["Privacidad", "/privacidad"], ["Términos de uso", "/terminos"], ["Cookies", "/cookies"]] as const) {
    await expect(pie.getByRole("link", { name: nombre, exact: true })).toHaveAttribute("href", ruta);
  }
});

test("la página pública no nombra a la competencia", async ({ page }) => {
  for (const ruta of ["/", "/precios", "/acceso", "/como-se-trabaja", "/capacidades", "/odontograma", "/privacidad"]) {
    await page.goto(ruta);
    await expect(page.locator("body"), ruta).not.toContainText(/dentalink/i);
    expect(await page.content(), `${ruta} (HTML)`).not.toMatch(/dentalink/i);
  }
});
