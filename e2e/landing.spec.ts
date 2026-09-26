import { test, expect, sinScrollHorizontal } from "./soporte";

test.describe("Landing", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/"); });

  test("el hero dice qué es y lleva a pedir una demo", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("La clínica entera");
    const cta = page.getByRole("main").getByRole("link", { name: /Pedir una demo/ }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /\/acceso/);
  });

  test("el botón de un plan lleva al formulario con ese plan elegido", async ({ page }) => {
    await page.locator("#precios").getByRole("link", { name: /Pedir una demo del Plan Clínica/ }).click();
    await page.waitForURL("**/acceso?plan=clinica");
    await expect(page.locator('select[name="plan"]')).toHaveValue("clinica");
  });

  test("el recorrido tiene sus cinco etapas en orden", async ({ page }) => {
    const etapas = page.locator('article[id^="etapa-"]');
    await expect(etapas).toHaveCount(5);
    await expect(etapas.locator("h3")).toHaveText([
      "Agendá, confirmá y llená los huecos de tu semana",
      "Registrá todo el proceso clínico, pieza por pieza",
      "Presupuestos claros y cobros en cuotas, sin planillas",
      "Pacientes que vuelven a la silla",
      "Sabé qué pasa en cada área de tu clínica",
    ]);
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

  test("precios: los tres planes en guaraníes, mensual y anual", async ({ page }) => {
    const precios = page.locator("#precios");
    for (const p of ["Gs. 330.000", "Gs. 620.000", "Gs. 980.000"]) await expect(precios.getByText(p, { exact: true })).toBeVisible();
    const anual = precios.getByRole("radio", { name: "Anual" });
    await anual.scrollIntoViewIfNeeded(); // Playwright acerca el control antes de tocarlo: medir después de eso
    const antes = await page.evaluate(() => scrollY);
    await anual.check();
    for (const p of ["Gs. 3.300.000", "Gs. 6.200.000", "Gs. 9.000.000"]) await expect(precios.getByText(p, { exact: true })).toBeVisible();
    expect(Math.abs((await page.evaluate(() => scrollY)) - antes), "cambiar a anual no mueve la página").toBeLessThan(2);
    await expect(precios.getByText(/Gs\. 1\.500\.000, pago único/)).toBeVisible();
  });

  test("preguntas frecuentes: se abren y muestran la respuesta", async ({ page }) => {
    const preguntas = page.locator("details.lp-faq");
    await expect(preguntas).toHaveCount(6);
    const primera = preguntas.first();
    await primera.locator("summary").click();
    await expect(primera).toHaveAttribute("open", "");
  });

  test("no obliga a scrollear de costado", async ({ page }) => {
    await sinScrollHorizontal(page);
  });
});

test.describe("Formulario «Pedí tu demo»", () => {
  const form = (page: import("@playwright/test").Page) => page.locator("form").filter({ has: page.locator('input[name="email"]') });

  test("si el servidor rechaza el pedido, muestra su mensaje", async ({ page }) => {
    await page.route("**/api/contacto", (r) => r.fulfill({ status: 400, json: { ok: false, error: "Ese email no parece válido." } }));
    await page.goto("/");
    const f = form(page);
    await f.locator('input[name="nombre"]').fill("Dra. Prueba E2E");
    await f.locator('input[name="email"]').fill("e2e@example.com");
    await f.getByRole("button", { name: "Pedir la demo" }).click();
    await expect(page.getByText("Ese email no parece válido.")).toBeVisible();
  });

  test("valida en el navegador antes de enviar (no gasta intentos)", async ({ page }) => {
    /* /api/contacto acepta 5 pedidos por hora por IP: un error de tipeo no puede gastar uno. */
    let enviado = false;
    await page.route("**/api/contacto", (r) => { enviado = true; return r.fulfill({ json: { ok: true } }); });
    await page.goto("/");
    const f = form(page);
    await f.getByRole("button", { name: "Pedir la demo" }).click();
    await expect(f.getByText("Escribí tu nombre y apellido.")).toBeVisible();
    await expect(f.locator('input[name="nombre"]')).toBeFocused();
    await f.locator('input[name="nombre"]').fill("Dra. Prueba E2E");
    await f.locator('input[name="email"]').fill("sin-arroba.com");
    await f.getByRole("button", { name: "Pedir la demo" }).click();
    await expect(f.getByText(/Revisá el email/)).toBeVisible();
    await expect(f.locator('input[name="email"]')).toHaveAttribute("aria-invalid", "true");
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
    await f.getByRole("button", { name: "Pedir la demo" }).click();
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
    await f.getByRole("button", { name: "Pedir la demo" }).click();
    await expect(page.getByText("Servicio no disponible")).toBeVisible();
    await expect(f.getByRole("button", { name: "Pedir la demo" })).toBeEnabled();
  });

  test("la trampa para bots no la ve una persona", async ({ page }) => {
    await page.goto("/");
    const trampa = form(page).locator('input[name="website"]');
    await expect(trampa).toHaveAttribute("tabindex", "-1");
    await expect(trampa).not.toBeInViewport();
  });
});

test.describe("Anchos de celular y tablet", () => {
  for (const ancho of [320, 375, 414, 768]) {
    test(`${ancho}px: sin scroll lateral y ningún botón en dos renglones`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 800 });
      for (const ruta of ["/", "/precios", "/acceso"]) {
        await page.goto(ruta);
        await sinScrollHorizontal(page);
        const partidos = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("main a, main button, header a, header button, footer a, footer button")]
            // un enlace dentro de un párrafo es texto corrido: ese sí puede cortar renglón
            .filter((el) => el.offsetParent !== null && el.textContent?.trim() && !el.closest("p"))
            .filter((el) => {
              const r = el.getClientRects();
              const lineas = Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || "0"));
              return r.length > 1 || (getComputedStyle(el).display.startsWith("inline") && lineas > 2);
            })
            .map((el) => el.textContent!.trim().slice(0, 40)),
        );
        expect(partidos, `${ruta} a ${ancho}px`).toEqual([]);
      }
    });
  }
});

test("/precios compara los tres planes función por función", async ({ page }) => {
  await page.goto("/precios");
  const tabla = page.getByRole("table", { name: "Qué incluye cada plan" });
  await expect(tabla).toBeVisible();
  const fila = tabla.getByRole("row", { name: /CRM de pacientes/ });
  await expect(fila.getByLabel("Incluido", { exact: true })).toHaveCount(1); // solo Multi
  await expect(tabla.getByRole("row", { name: /Reservas online/ }).getByLabel("Incluido", { exact: true })).toHaveCount(3);
});
