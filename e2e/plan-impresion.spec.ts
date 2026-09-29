import { test, expect, entrarDemo, sinScrollHorizontal, USUARIOS_DEMO } from "./soporte";

for (const [rol, usuario] of [["admin", USUARIOS_DEMO.admin], ["dentista", USUARIOS_DEMO.dentista]] as const) {
  test(`el plan de tratamiento imprime un documento con membrete para ${rol}`, async ({ page }) => {
    await entrarDemo(page, usuario);
    await page.goto("/app/pacientes/p1?tab=planes");
    await page.getByRole("button", { name: /Plan dental integral/ }).click();
    await sinScrollHorizontal(page);

    const documento = page.getByTestId("plan-print-document");
    await expect(documento).toBeHidden();
    await page.evaluate(() => {
      (window as typeof window & { __printCalled?: boolean }).__printCalled = false;
      window.print = () => { (window as typeof window & { __printCalled?: boolean }).__printCalled = true; };
    });
    await page.getByRole("button", { name: "Imprimir plan de tratamiento" }).click();
    expect(await page.evaluate(() => (window as typeof window & { __printCalled?: boolean }).__printCalled)).toBe(true);

    await page.emulateMedia({ media: "print" });
    await expect(documento).toBeVisible();
    await expect(documento.getByRole("img", { name: "Novudent", includeHidden: true })).toHaveCount(1);
    await expect(documento).toContainText("Plan dental integral");
    await expect(documento).toContainText("Clínica Demo Asunción");
    await expect(documento).toContainText("María González");
    await expect(documento).toContainText("Resina compuesta");
    await expect(documento).toContainText("Profilaxis");
    await expect(page.locator("main")).toBeHidden();

    if (rol === "admin") {
      await expect(documento).toContainText("Total del plan");
      await expect(documento).toContainText("3.456.789");
    } else {
      await expect(documento).not.toContainText("Total del plan");
      await expect(documento).not.toContainText("3.456.789");
      await expect(documento).not.toContainText("Gs ");
    }
  });
}
