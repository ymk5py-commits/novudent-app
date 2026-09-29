import { test, expect, entrarDemo, leerDB } from "./soporte";

test("el consentimiento firmado muestra membrete en la vista y en la impresión", async ({ page }) => {
  await entrarDemo(page);
  const db = await leerDB(page);
  db.signatures.push({
    id: "consent-print-e2e", patientId: "p4", clinicId: "cl_demo",
    title: "Consentimiento para tratamiento odontológico",
    body: "Declaro que recibí información sobre el tratamiento.\n\nAcepto el procedimiento indicado.",
    status: "firmado", token: "test-token", createdBy: "u1",
    createdAt: "2026-09-28T10:00:00.000Z", signedAt: "2026-09-28T10:05:00.000Z",
    signedByName: "Andrés Mejía", channel: "consultorio",
  });
  await page.evaluate((value) => localStorage.setItem("novudent.db.v4", JSON.stringify(value)), db);
  await page.goto("/app/pacientes/p4?tab=consentimientos");
  await page.getByRole("button", { name: "Ver / imprimir" }).click();

  const dialogo = page.getByRole("dialog", { name: "Consentimiento firmado" });
  await expect(dialogo.getByRole("img", { name: "Novudent" })).toBeVisible();
  await expect(dialogo).toContainText("Clínica Demo Asunción");

  const documento = page.getByTestId("consent-print-document");
  await expect(documento).toBeHidden();
  await page.evaluate(() => {
    (window as typeof window & { __printCalled?: boolean }).__printCalled = false;
    window.print = () => { (window as typeof window & { __printCalled?: boolean }).__printCalled = true; };
  });
  await dialogo.getByRole("button", { name: "Imprimir" }).click();
  expect(await page.evaluate(() => (window as typeof window & { __printCalled?: boolean }).__printCalled)).toBe(true);

  await page.emulateMedia({ media: "print" });
  await expect(documento).toBeVisible();
  await expect(documento).toContainText("CONSENTIMIENTO INFORMADO");
  await expect(documento).toContainText("Consentimiento para tratamiento odontológico");
  await expect(documento).toContainText("Andrés Mejía");
  await expect(documento).toContainText("Acepto el procedimiento indicado.");
  await expect(page.locator("main")).toBeHidden();
});
