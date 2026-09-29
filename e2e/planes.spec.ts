import { test, expect, entrarDemo } from "./soporte";
import { PLANES, gs } from "../lib/landing/precios";

/** Cambia algo del estado local de la demo y recarga (así se simula otro plan o un usuario nuevo). */
async function conDemo(page: import("@playwright/test").Page, cambiar: string) {
  await page.evaluate(cambiar);
  await page.goto("/app");
}

test("plan Solo: esconde los módulos que no incluye y ofrece mejorar", async ({ page, isMobile }) => {
  await entrarDemo(page);
  await conDemo(page, `(() => { const db = JSON.parse(localStorage.getItem("novudent.db.v4")); db.clinics[0].plan = "solo"; localStorage.setItem("novudent.db.v4", JSON.stringify(db)); })()`);
  if (!isMobile) for (const oculto of ["Caja", "Inventario", "Reportes", "Integraciones"]) await expect(page.locator("aside")).not.toContainText(oculto);
  await page.goto("/app/caja");
  await expect(page.locator("main")).toContainText("Mejorar mi plan");
  await page.goto("/app/suscripcion");
  await expect(page.locator("main")).toContainText("Plan Solo");
  await expect(page.locator("main")).toContainText(gs(PLANES[0].mensualGs));
});

test("usuario nuevo: tiene que crear su contraseña antes de ver nada", async ({ page }) => {
  await entrarDemo(page);
  await conDemo(page, `(() => { const db = JSON.parse(localStorage.getItem("novudent.db.v4")); const ses = JSON.parse(localStorage.getItem("novudent.session.v1")); const yo = db.users.find((u) => u.id === ses.userId) || db.users[0]; yo.mustChangePassword = true; localStorage.setItem("novudent.db.v4", JSON.stringify(db)); })()`);
  await expect(page.getByText("Creá tu contraseña")).toBeVisible();
  await expect(page.getByText("Producción de la semana")).toHaveCount(0);
});
