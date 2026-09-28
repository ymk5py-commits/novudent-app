import { test, expect, entrarDemo, sinScrollHorizontal } from "./soporte";

test("el formulario de usuarios cabe en 320 px y no crea cuentas sin una clínica conectada", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await entrarDemo(page);
  await page.goto("/app/configuracion");
  await page.getByRole("button", { name: "Agregar usuario" }).click();
  await expect(page.getByText("El alta de cuentas está disponible al ingresar como administrador de una clínica con conexión.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear usuario" })).toBeDisabled();
  await sinScrollHorizontal(page);
});
