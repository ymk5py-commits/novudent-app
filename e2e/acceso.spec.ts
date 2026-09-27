import { test, expect, entrarDemo, cerrarSesion, USUARIOS_DEMO } from "./soporte";

test("el login público no ofrece la demo", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver demo" })).toHaveCount(0);
});

test("/login?demo=1 muestra los usuarios de la demo", async ({ page }) => {
  await page.goto("/login?demo=1");
  await page.getByRole("button", { name: "Ver demo" }).click();
  for (const u of Object.values(USUARIOS_DEMO)) await expect(page.getByRole("button", { name: new RegExp(u) })).toBeVisible();
});

test("entrar a la demo lleva al tablero", async ({ page }) => {
  await entrarDemo(page);
  await expect(page.getByRole("heading", { name: /Hola, Carlos/ })).toBeVisible();
});

test("sin sesión, /app manda al login", async ({ page }) => {
  await page.goto("/app/agenda");
  await page.waitForURL("**/login**");
});

test("cerrar sesión vuelve al login y borra los datos de pacientes del navegador", async ({ page }) => {
  await entrarDemo(page);
  await cerrarSesion(page);
  await page.waitForURL("**/login**");
  const claves = await page.evaluate(() => Object.keys(localStorage));
  expect(claves).not.toContain("novudent.session.v1");
  expect(claves, "el caché con datos de pacientes tiene que borrarse al salir").not.toContain("novudent.db.v4");
});

test("un email o contraseña mal escritos no entran", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("vos@tuclinica.com").fill("nadie@example.com");
  await page.getByPlaceholder("••••••••").fill("incorrecta");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/login/);
});
