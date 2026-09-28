import { test, expect, sinScrollHorizontal } from "./soporte";

test("alta de clínica: indica cómo ingresar y cargar usuarios", async ({ page }, testInfo) => {
  await page.route("**/api/clinicas", async (route) => {
    const data = route.request().postDataJSON();
    expect(data.adminEmail).toBe("admin@prueba.test");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true, clinicId: "cl_prueba", clinicName: "Clínica Prueba", plan: "clinica",
        admin: { name: "Ana Prueba", email: "admin@prueba.test" },
        bookingUrl: "/reservar/cl_prueba",
      }),
    });
  });
  await page.goto("/superadmin");
  await page.locator('input[name="owner-key"]').fill("clave-de-prueba");
  await page.locator('input[name="clinic-name"]').fill("Clínica Prueba");
  await page.locator('input[name="admin-name"]').fill("Ana Prueba");
  await page.locator('input[name="admin-email"]').fill("admin@prueba.test");
  await page.locator('input[name="admin-temp-password"]').fill("Temporal123");
  await page.getByRole("button", { name: /Crear clínica y cuenta admin/ }).click();
  await expect(page.getByRole("heading", { name: "¡Clínica creada!" })).toBeVisible();
  await expect(page.getByText("Siguiente paso: cargar el equipo")).toBeVisible();
  await expect(page.getByRole("link", { name: /Ingresar como administrador/ })).toHaveAttribute("href", "/login");
  await sinScrollHorizontal(page);
  await page.screenshot({ path: testInfo.outputPath("alta-clinica.png"), fullPage: true });
});
