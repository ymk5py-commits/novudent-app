import { test, expect, USUARIOS_DEMO } from "./soporte";
import type { Page } from "@playwright/test";

/* Pedido de Croman (9-oct-2026): «arreglá lo del aviso de cookies que tapa los botones». El aviso es una tarjeta fija abajo a la derecha
   (en el celular, de lado a lado): tapaba los botones de guardar de las ventanas, el botón de ayuda y el final de la página hasta que
   la persona elegía. Ahora queda debajo de las ventanas, el botón de ayuda se corre encima, y la página deja lugar para llegar a todo. */

const CLAVE = "novudent.consentimiento.v1";
const aviso = (page: Page) => page.getByRole("region", { name: "Aviso de cookies" });

test.describe("el aviso de cookies sin decidir, dentro del panel", () => {
  // La demo se abre decidida; después se borra la elección y se recarga, para ver el panel con el aviso pendiente.
  test.use({ consentimiento: "sin-decidir" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((k) => {
      try { if (location.pathname === "/login") localStorage.setItem(k, JSON.stringify({ version: 1, analitica: false, fecha: new Date().toISOString() })); } catch { /* sin almacenamiento */ }
    }, CLAVE);
    await page.goto("/login?demo=1");
    await page.getByRole("button", { name: "Ver demo" }).click();
    await page.getByRole("button", { name: new RegExp(USUARIOS_DEMO.recepcionista) }).click();
    await page.waitForURL("**/app");
    await page.evaluate((k) => localStorage.removeItem(k), CLAVE);
    await page.goto("/app/agenda");
    await expect(aviso(page)).toBeVisible();
  });

  test("una ventana abierta queda por encima del aviso: sus botones se pueden tocar", async ({ page }) => {
    await page.locator("main").getByRole("button", { name: "Dar cita" }).click();
    const cita = page.getByRole("dialog", { name: "Dar cita" });
    await expect(cita).toBeVisible();
    for (const nombre of ["Cancelar", "Crear cita", "Cerrar"]) {
      const boton = cita.getByRole("button", { name: nombre, exact: true });
      await boton.scrollIntoViewIfNeeded();
      const tapado = await boton.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const arriba = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(arriba === el || el.contains(arriba));
      });
      expect(tapado, `«${nombre}» está tapado`).toBe(false);
    }
    // Y se puede tocar de verdad (no solo verlo).
    await cita.getByRole("button", { name: "Cancelar" }).click();
    await expect(cita).toHaveCount(0);
  });

  test("el botón de ayuda y el aviso no se pisan", async ({ page }) => {
    const ayuda = page.getByRole("button", { name: "Ayuda de Novum" });
    await expect(ayuda).toBeVisible();
    const [a, b] = await Promise.all([ayuda.boundingBox(), aviso(page).boundingBox()]);
    expect(a && b).toBeTruthy();
    const seSuperponen = a!.x < b!.x + b!.width && a!.x + a!.width > b!.x && a!.y < b!.y + b!.height && a!.y + a!.height > b!.y;
    expect(seSuperponen, "el botón de ayuda y el aviso se superponen").toBe(false);
  });

  test("al final de la página queda lugar para ver todo el contenido por encima del aviso", async ({ page }) => {
    await expect(page.locator(".app-workspace main")).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })); // la hoja tiene scroll suave: sin esto el valor se lee antes de llegar
    const finDelPanel = await page.evaluate(() => document.querySelector(".app-workspace")!.getBoundingClientRect().bottom);
    const arriba = (await aviso(page).boundingBox())!.y;
    expect(finDelPanel, "el final de la página queda detrás del aviso").toBeLessThanOrEqual(arriba + 1);
  });

  test("al elegir, el lugar reservado se libera", async ({ page }) => {
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom))).toBeGreaterThan(40);
    await aviso(page).getByRole("button", { name: "Rechazar" }).click();
    await expect(aviso(page)).toHaveCount(0);
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom))).toBe(0);
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--cookies-alto"))).toBe("");
  });
});
