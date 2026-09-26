import { test, expect } from "./soporte";

/* @visual — capturas de referencia de las pantallas de venta. Sirven para ver el antes y el después
   del rediseño de la landing: un cambio visual hace fallar la prueba y el reporte muestra la
   diferencia. Si el cambio es buscado:  npx playwright test --grep @visual --update-snapshots
   No corren en la CI todavía: las fuentes del sistema cambian entre máquinas y darían falsas alarmas. */
test.describe("@visual", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  const listo = async (page: import("@playwright/test").Page) => {
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: ".lp-marquee{animation:none!important} video{visibility:hidden!important}" });
  };

  test("landing: hero", async ({ page }) => {
    await page.goto("/");
    await listo(page);
    await expect(page).toHaveScreenshot("landing-hero.png");
  });

  test("landing: precios", async ({ page }) => {
    await page.goto("/");
    await listo(page);
    const precios = page.locator("#precios");
    await precios.scrollIntoViewIfNeeded();
    await expect(precios).toHaveScreenshot("landing-precios.png");
  });

  test("landing: formulario de acceso", async ({ page }) => {
    await page.goto("/");
    await listo(page);
    const form = page.locator("form").filter({ has: page.locator('input[name="email"]') });
    await form.scrollIntoViewIfNeeded();
    await expect(form).toHaveScreenshot("landing-formulario.png");
  });

  test("login", async ({ page }) => {
    await page.goto("/login");
    await listo(page);
    await expect(page).toHaveScreenshot("login.png");
  });
});
