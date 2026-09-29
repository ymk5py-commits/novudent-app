import { test, expect, entrarDemo, leerDB } from "./soporte";

test("CRM no declara un correo enviado al abrir un borrador y respeta los destinatarios elegidos", async ({ page }) => {
  await entrarDemo(page);
  const db = await leerDB(page);
  db.campaigns.push({ id: "camp-e2e", name: "Control E2E", channel: "email", message: "Te esperamos", audience: "Solo María", createdAt: new Date().toISOString() });
  await page.evaluate((value) => localStorage.setItem("novudent.db.v4", JSON.stringify(value)), db);
  await page.goto("/app/crm");
  await page.getByRole("button", { name: "Campañas de Marketing" }).click();

  await expect(page.getByText("Borrador · sin envío confirmado")).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir borrador" })).toHaveCount(0);
  await page.getByRole("button", { name: "Elegir destinatarios" }).click();
  const dialog = page.getByRole("dialog", { name: "Destinatarios · Control E2E" });
  await dialog.getByRole("checkbox", { name: /María González/ }).check();
  await dialog.getByRole("button", { name: "Guardar destinatarios" }).click();

  const href = await page.getByRole("link", { name: "Abrir borrador" }).getAttribute("href");
  expect(href).toContain("maria%40example.com");
  expect(href).not.toContain("cami%40example.com");
  expect((await leerDB(page)).campaigns.find((c: { id: string }) => c.id === "camp-e2e").sentAt).toBeUndefined();

  page.once("dialog", (prompt) => prompt.accept());
  await page.getByRole("button", { name: "Registrar envío externo" }).click();
  await expect(page.getByText("Envío declarado: 1", { exact: false })).toBeVisible();
});

test("la simulación de Botika está identificada como demo", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/integraciones");
  await expect(page.getByText("Modo demo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simular respuesta" }).click();
  await expect.poll(async () => (await leerDB(page)).outbox.find((t: { id: string }) => t.id === "t4")?.status).toBe("respondido");
});
