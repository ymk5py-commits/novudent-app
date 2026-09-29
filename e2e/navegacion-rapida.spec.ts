import { test, expect, entrarDemo } from "./soporte";

test("menú, ficha y logo navegan sin reiniciar la app ni recargar Firebase", async ({ page, isMobile }) => {
  await entrarDemo(page);
  await page.evaluate(() => { (window as typeof window & { __navMarker?: string }).__navMarker = "sigue-en-memoria"; });

  if (isMobile) {
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.getByRole("complementary", { name: "Menú" }).getByRole("link", { name: "Pacientes", exact: true }).click();
  } else {
    await page.locator("header nav").getByRole("link", { name: "Pacientes", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/app\/pacientes$/);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __navMarker?: string }).__navMarker)).toBe("sigue-en-memoria");

  await page.locator('main a[href="/app/pacientes/p1"]:visible').first().click();
  await expect(page).toHaveURL(/\/app\/pacientes\/p1$/);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __navMarker?: string }).__navMarker)).toBe("sigue-en-memoria");

  await page.getByRole("link", { name: "Novudent, inicio" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __navMarker?: string }).__navMarker)).toBe("sigue-en-memoria");
});
