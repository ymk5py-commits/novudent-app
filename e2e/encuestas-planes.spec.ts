import { test, expect, entrarDemo, sinScrollHorizontal } from "./soporte";
import { PLANES, gs } from "../lib/landing/precios";

test("el texto de cada pregunta se puede leer y editar en escritorio y móvil", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/encuestas");
  await page.getByRole("button", { name: "Nueva encuesta" }).click();

  const dialogo = page.getByRole("dialog", { name: "Nueva encuesta" });
  const textos = dialogo.getByRole("textbox", { name: "Texto de la pregunta" });
  await expect(textos).toHaveCount(2);
  await expect(textos.nth(0)).toHaveValue("Atención del personal");
  await expect(textos.nth(1)).toHaveValue("Comentarios");
  for (let i = 0; i < 2; i++) {
    const ancho = (await textos.nth(i).boundingBox())?.width ?? 0;
    expect(ancho, `la pregunta ${i + 1} quedó demasiado angosta`).toBeGreaterThan(180);
  }
  await sinScrollHorizontal(page);

  await dialogo.getByRole("textbox", { name: "Título" }).fill("Encuesta de prueba");
  await dialogo.getByRole("button", { name: "+ Texto" }).click();
  await dialogo.getByRole("button", { name: "Guardar encuesta" }).click();
  await expect(dialogo.getByRole("alert")).toHaveText("Escribí el texto de todas las preguntas.");
  await dialogo.getByRole("textbox", { name: "Texto de la pregunta" }).nth(2).fill("¿Qué mejorarías?");
  await dialogo.getByRole("button", { name: "Guardar encuesta" }).click();
  await expect(dialogo).toHaveCount(0);
  await expect(page.getByText("Encuesta de prueba", { exact: true }).first()).toBeVisible();
});

test("Suscripción muestra los mismos planes y precios de la landing", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/suscripcion");
  for (const plan of PLANES) {
    const tarjeta = page.locator("main").getByRole("heading", { name: `Plan ${plan.nombre}`, exact: true }).last().locator("xpath=../..");
    await expect(tarjeta).toContainText(gs(plan.mensualGs));
    await expect(tarjeta).toContainText(plan.profesionales);
    for (const beneficio of plan.incluye) await expect(tarjeta).toContainText(beneficio);
  }
  await expect(page.locator("main")).not.toContainText("USD");
  await expect(page.locator("main")).not.toContainText("Plan Cadena");
  await page.getByRole("button", { name: "Anual" }).click();
  for (const plan of PLANES) await expect(page.locator("main")).toContainText(gs(plan.anualGs));
  await expect(page.getByRole("link", { name: "Solicitar Plan Solo" })).toHaveAttribute("href", "/acceso?plan=solo");
  await sinScrollHorizontal(page);
});
