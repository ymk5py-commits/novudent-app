import { test, expect, sinScrollHorizontal } from "./soporte";

const PUBLICAS = ["/capacidades", "/como-se-trabaja", "/en-accion", "/precios", "/odontograma", "/acceso", "/login"];

for (const ruta of PUBLICAS) {
  test(`${ruta} carga sin errores y entra en la pantalla`, async ({ page }) => {
    const r = await page.goto(ruta);
    expect(r?.status()).toBe(200);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await sinScrollHorizontal(page);
  });
}

test("una ruta que no existe devuelve 404", async ({ page }) => {
  const r = await page.goto("/esta-pagina-no-existe");
  expect(r?.status()).toBe(404);
});

test("robots.txt y sitemap.xml responden", async ({ request }) => {
  expect((await request.get("/robots.txt")).status()).toBe(200);
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("<urlset");
});
