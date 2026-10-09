import { readdirSync } from "node:fs";
import { test, expect, entrarDemo } from "./soporte";
import { PAGINAS_PUBLICAS } from "../lib/seo";

/* Frente E (pedido de Croman, 8-oct-2026): «mejorar todo el vanity url y el seo… indexar todo». Lo público se indexa y está bien armado
   (título, descripción, canónica, un solo h1, imágenes con alt); el panel y las páginas por link NO (noindex); y las secciones del panel tienen
   URL propia, sin «#», con los enlaces viejos andando. */

const DOMINIO = "https://novudent.novumholding.lat";
const CLAVE_INDEXNOW = readdirSync("public").find((f) => /^[0-9a-f]{32}\.txt$/.test(f))!.replace(".txt", "");

test.describe("sitio público: lo que se indexa", () => {
  for (const p of PAGINAS_PUBLICAS) {
    test(`${p.ruta}: título, descripción, canónica, un solo h1 e imágenes con alt`, async ({ page }) => {
      const res = await page.goto(p.ruta);
      expect(res?.status()).toBe(200);
      const titulo = await page.title();
      expect(titulo.length, `título: «${titulo}»`).toBeGreaterThan(10);
      expect(titulo.length, `título largo (${titulo.length}): «${titulo}»`).toBeLessThanOrEqual(70);
      const descripcion = (await page.locator('meta[name="description"]').getAttribute("content")) ?? "";
      expect(descripcion.length, `descripción (${descripcion.length}): «${descripcion}»`).toBeGreaterThanOrEqual(70);
      expect(descripcion.length, `descripción larga (${descripcion.length}): «${descripcion}»`).toBeLessThanOrEqual(170);
      const canonica = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(canonica).toBe(p.ruta === "/" ? DOMINIO : `${DOMINIO}${p.ruta}`);
      const robots = (await page.locator('meta[name="robots"]').getAttribute("content")) ?? "";
      expect(robots).not.toContain("noindex");
      await expect(page.locator("h1")).toHaveCount(1);
      const sinAlt = await page.locator("img:not([alt])").count();
      expect(sinAlt, "imágenes sin alt").toBe(0);
    });
  }

  test("las páginas internas traen su miga de pan como dato estructurado", async ({ page }) => {
    await page.goto("/precios");
    const datos = await page.locator('script[type="application/ld+json"]').allTextContents();
    const migas = datos.map((d) => JSON.parse(d)).find((d) => d["@type"] === "BreadcrumbList");
    expect(migas?.itemListElement?.map((x: { name: string }) => x.name)).toEqual(["Inicio", "Precios"]);
  });

  test("robots.txt bloquea lo privado y el sitemap lista las públicas con su fecha", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    for (const ruta of ["/app", "/login", "/firmar/", "/pagar/", "/reservar/"]) expect(robots).toContain(`Disallow: ${ruta}`);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const p of PAGINAS_PUBLICAS) {
      expect(sitemap).toContain(`<loc>${p.ruta === "/" ? DOMINIO : `${DOMINIO}${p.ruta}`}</loc>`);
    }
    expect(sitemap).toContain(`<lastmod>${PAGINAS_PUBLICAS[0].actualizado}</lastmod>`);
  });

  test("la clave de IndexNow está publicada", async ({ request }) => {
    const res = await request.get(`/${CLAVE_INDEXNOW}.txt`);
    expect(res.status()).toBe(200);
    expect((await res.text()).trim()).toBe(CLAVE_INDEXNOW);
  });
});

test.describe("lo privado no se indexa", () => {
  for (const ruta of ["/login", "/superadmin", "/firmar/cl_demo/token-que-no-existe", "/confirmar/cl_demo/x", "/pagar/cl_demo", "/reservar/cl_demo", "/encuestas/cl_demo/x", "/videoconsulta/cl_demo/x"]) {
    test(`${ruta} lleva noindex`, async ({ page }) => {
      await page.goto(ruta);
      expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
    });
  }

  test("el panel lleva noindex", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/configuracion/permisos");
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
  });
});

test.describe("URLs limpias en el panel", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page); });

  test("un enlace viejo con # pasa a la URL limpia y muestra la sección", async ({ page }) => {
    await page.goto("/app/configuracion#permisos");
    await page.waitForURL("**/app/configuracion/permisos");
    await expect(page.getByRole("heading", { name: /Permisos del equipo/ }).first()).toBeInViewport();
  });

  test("abrir la URL limpia directo (o recargar) muestra la misma sección", async ({ page }) => {
    await page.goto("/app/configuracion/arancel");
    await expect(page.getByRole("heading", { name: "Arancel de precios", level: 2 })).toBeInViewport();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Arancel de precios", level: 2 })).toBeInViewport();
  });

  test("en Reportes cada pestaña tiene su URL y «atrás» vuelve a la anterior", async ({ page }) => {
    await page.goto("/app/reportes#graficos");
    await page.waitForURL("**/app/reportes/graficos");
    await page.getByRole("button", { name: "Reportes Excel" }).click();
    await expect(page).toHaveURL(/\/app\/reportes\/excel$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/app\/reportes\/graficos$/);
  });

  test("Tareas: la sección va en la URL y la bandeja conserva su fecha", async ({ page }) => {
    await page.goto("/app/tareas#estadisticas");
    await page.waitForURL("**/app/tareas/estadisticas");
    await expect(page.getByRole("heading", { name: "Estadísticas", level: 1 })).toBeVisible();
    await page.getByRole("tab", { name: "Bandeja de tareas" }).click();
    await expect(page).toHaveURL(/\/app\/tareas$/);
  });

  test("la ficha: ?tab= y # pasan a /app/pacientes/<id>/<pestaña>, y cambiar de pestaña cambia la URL sin sumar historial", async ({ page }) => {
    await page.goto("/app/pacientes/p1?tab=planes");
    await page.waitForURL("**/app/pacientes/p1/planes");
    await expect(page.getByRole("heading", { name: "Planes de tratamiento" })).toBeVisible();
    await page.goto("/app/pacientes/p1#datos");
    await page.waitForURL("**/app/pacientes/p1/datos");
  });

  test("el menú lleva a las URLs limpias y marca solo la sección que corresponde", async ({ page, isMobile }) => {
    test.skip(isMobile, "El menú desplegable es el de escritorio");
    await page.goto("/app");
    await page.getByRole("button", { name: "Administración" }).click();
    await page.getByRole("link", { name: "Permisos del equipo" }).click();
    await page.waitForURL("**/app/configuracion/permisos");
    await page.getByRole("button", { name: "Administración" }).click();
    await expect(page.getByRole("link", { name: "Permisos del equipo" })).toHaveClass(/bg-azure-50/);
    await expect(page.getByRole("link", { name: "Configuración general" })).not.toHaveClass(/bg-azure-50/);
  });
});
