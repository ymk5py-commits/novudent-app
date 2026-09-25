import { test, expect, sinScrollHorizontal } from "./soporte";

test.describe("Landing", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/"); });

  test("el hero dice qué es y lleva a pedir acceso", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("La clínica entera");
    const cta = page.getByRole("link", { name: /Solicitar acceso/ }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /\/acceso|#/);
  });

  test("SEO básico: título, descripción, canónica y imagen para compartir", async ({ page }) => {
    await expect(page).toHaveTitle(/Novudent/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{50,}/);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  });

  test("el odontograma de muestra es interactivo: se marca una pieza", async ({ page }) => {
    const pieza = page.getByRole("button", { name: /^Pieza 18 — / });
    await expect(pieza).toHaveAccessibleName("Pieza 18 — sana");
    await pieza.click();
    const editor = page.getByRole("dialog");
    await expect(editor).toContainText("Pieza 18");
    await editor.getByRole("button", { name: "Caries" }).click();
    await expect(editor.getByText(/Tocá las superficies afectadas/)).toBeVisible();
    await editor.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("button", { name: /^Pieza 18 — / })).toHaveAccessibleName("Pieza 18 — Caries");
  });

  test("precios: los tres planes con su precio", async ({ page }) => {
    await expect(page.getByText("$129").first()).toBeVisible();
    await expect(page.getByText(/\$45/).first()).toBeVisible();
    await expect(page.getByText("A medida").first()).toBeVisible();
  });

  test("preguntas frecuentes: se abren y muestran la respuesta", async ({ page }) => {
    const preguntas = page.locator("details.lp-faq");
    await expect(preguntas).toHaveCount(5);
    const primera = preguntas.first();
    await primera.locator("summary").click();
    await expect(primera).toHaveAttribute("open", "");
  });

  test("no obliga a scrollear de costado", async ({ page }) => {
    await sinScrollHorizontal(page);
  });
});

test.describe("Formulario «Solicitar acceso»", () => {
  const form = (page: import("@playwright/test").Page) => page.locator("form").filter({ has: page.locator('input[name="email"]') });

  test("sin nombre ni email muestra el error del servidor", async ({ page }) => {
    // Mismo 400 que devuelve /api/contacto: el formulario tiene noValidate y no valida antes de enviar.
    await page.route("**/api/contacto", (r) => r.fulfill({ status: 400, json: { ok: false, error: "Necesitamos tu nombre y tu email." } }));
    await page.goto("/");
    await form(page).locator('input[name="nombre"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Necesitamos tu nombre y tu email.")).toBeVisible();
  });

  test.fixme("valida en el navegador antes de enviar", async ({ page }) => {
    /* PENDIENTE (etapa landing): hoy un pedido vacío o con el email mal escrito viaja al servidor, y
       /api/contacto acepta 5 por hora por IP: cada error gasta un intento. Quien se equivoca 5 veces
       queda una hora sin poder dejar sus datos. Esta prueba pasa cuando el formulario valide antes. */
    let enviado = false;
    await page.route("**/api/contacto", (r) => { enviado = true; return r.fulfill({ json: { ok: true } }); });
    await page.goto("/");
    await form(page).locator('input[name="nombre"]').focus();
    await page.keyboard.press("Enter");
    expect(enviado).toBe(false);
  });

  test("envía el pedido y confirma (sin mandar nada real)", async ({ page }) => {
    let cuerpo: Record<string, unknown> = {};
    await page.route("**/api/contacto", async (r) => { cuerpo = r.request().postDataJSON(); await r.fulfill({ json: { ok: true } }); });
    await page.goto("/");
    const f = form(page);
    await f.locator('input[name="nombre"]').fill("Dra. Prueba E2E");
    await f.locator('input[name="clinica"]').fill("Consultorio de pruebas");
    await f.locator('input[name="email"]').fill("e2e@example.com");
    await f.getByRole("button", { name: "Solicitar acceso" }).click();
    await expect(page.getByRole("heading", { name: "Recibimos tu pedido" })).toBeVisible();
    expect(cuerpo).toMatchObject({ nombre: "Dra. Prueba E2E", email: "e2e@example.com" });
    expect(cuerpo.website ?? "").toBe(""); // la trampa para bots queda vacía
  });

  test("si el servidor falla, lo dice y deja reintentar", async ({ page }) => {
    await page.route("**/api/contacto", (r) => r.fulfill({ status: 503, json: { ok: false, error: "Servicio no disponible" } }));
    await page.goto("/");
    const f = form(page);
    await f.locator('input[name="nombre"]').fill("Dra. Prueba E2E");
    await f.locator('input[name="email"]').fill("e2e@example.com");
    await f.getByRole("button", { name: "Solicitar acceso" }).click();
    await expect(page.getByText("Servicio no disponible")).toBeVisible();
    await expect(f.getByRole("button", { name: "Solicitar acceso" })).toBeEnabled();
  });

  test("la trampa para bots no la ve una persona", async ({ page }) => {
    await page.goto("/");
    const trampa = form(page).locator('input[name="website"]');
    await expect(trampa).toHaveAttribute("tabindex", "-1");
    await expect(trampa).not.toBeInViewport();
  });
});
