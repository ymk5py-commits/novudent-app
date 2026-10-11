import { test, expect, entrarDemo, USUARIOS_DEMO } from "./soporte";

test("el asistente de ayuda responde y prepara el correo de soporte", async ({ page, isMobile }) => {
  await entrarDemo(page, USUARIOS_DEMO.recepcionista);
  if (isMobile) {
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.locator("aside").getByRole("button", { name: "Ayuda" }).click();
  } else {
    await page.locator("header").getByRole("button", { name: "Ayuda" }).click();
  }
  const panel = page.getByRole("dialog", { name: "Ayuda de Novum" });
  await expect(panel).toContainText("Soy el asistente de Novudent");
  await panel.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(panel.getByRole("link", { name: "Abrir Agenda" })).toBeVisible();
  const correo = panel.getByRole("link", { name: "Preparar correo a hola@novumholding.lat" });
  await expect(correo).toBeVisible();
  const href = await correo.getAttribute("href");
  expect(href).toContain("mailto:hola@novumholding.lat?");
  expect(new URLSearchParams(href!.split("?")[1]).get("body")).toContain("Agenda");

  await panel.getByRole("textbox", { name: "Escribí tu consulta" }).fill("No veo mi agenda");
  await panel.getByRole("button", { name: "Consultar al asistente" }).click();
  await expect(panel).toContainText("No veo mi agenda");
  const nuevoHref = await correo.getAttribute("href");
  expect(new URLSearchParams(nuevoHref!.split("?")[1]).get("body")).toContain("No veo mi agenda");
  await panel.getByRole("button", { name: "Cerrar" }).click();
  await expect(panel).toBeHidden();
});
