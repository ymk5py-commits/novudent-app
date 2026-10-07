import type { Page } from "@playwright/test";
import { test, expect, entrarDemo, leerDB, sinScrollHorizontal } from "./soporte";

/* Pedido de Camila (7-oct-2026): «no se guardó lo que escribí en el link» y «mejorar el acceso a la agenda online».
   Pago online: antes el link se guardaba al salir del campo, sin avisar, y uno sin https:// quedaba guardado pero la
   página de pago del paciente lo ignoraba. Agenda online: el link, el QR y la anticipación, juntos y a un clic del menú. */

const tarjeta = (page: Page, titulo: string) => page.getByRole("heading", { name: titulo, level: 2, exact: true }).locator("xpath=ancestor::*[contains(@class,'p-5')][1]");

async function irAConfiguracion(page: Page) {
  await page.goto("/app/configuracion");
  await expect(page.getByRole("heading", { name: "Configuración", level: 1 })).toBeVisible();
}

test.describe("Configuración › Pago online", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page); await irAConfiguracion(page); });

  test("guarda con el botón, avisa «Guardado» y le agrega https:// si falta", async ({ page }) => {
    const pago = tarjeta(page, "Pago online");
    await pago.getByLabel("Link de checkout de tu pasarela").fill("link.mercadopago.com.py/mi-clinica");
    await expect(pago.getByText("Hay cambios sin guardar.")).toBeVisible();
    await pago.getByRole("button", { name: "Guardar" }).click();

    await expect(pago.getByText("Guardado", { exact: true })).toBeVisible();
    await expect(pago.getByLabel("Link de checkout de tu pasarela")).toHaveValue("https://link.mercadopago.com.py/mi-clinica");
    expect((await leerDB(page)).clinics[0].config.payments.checkoutUrl).toBe("https://link.mercadopago.com.py/mi-clinica");
  });

  test("lo guardado sigue ahí al volver a la pantalla", async ({ page }) => {
    const pago = tarjeta(page, "Pago online");
    await pago.getByLabel("Link de checkout de tu pasarela").fill("https://pagos.mi-clinica.com.py/checkout");
    await pago.getByLabel("Datos de transferencia (opcional)").fill("Banco Itaú · Cta. 123456");
    await pago.getByRole("button", { name: "Guardar" }).click();
    await expect(pago.getByText("Guardado", { exact: true })).toBeVisible();

    await page.reload();
    const otraVez = tarjeta(page, "Pago online");
    await expect(otraVez.getByLabel("Link de checkout de tu pasarela")).toHaveValue("https://pagos.mi-clinica.com.py/checkout");
    await expect(otraVez.getByLabel("Datos de transferencia (opcional)")).toHaveValue("Banco Itaú · Cta. 123456");
    await expect(otraVez.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  test("un link con http:// o con espacios se explica y no se deja guardar", async ({ page }) => {
    const pago = tarjeta(page, "Pago online");
    const campo = pago.getByLabel("Link de checkout de tu pasarela");
    await campo.fill("http://pagos.mi-clinica.com.py");
    await expect(pago.getByRole("alert")).toContainText("https");
    await expect(pago.getByRole("button", { name: "Guardar" })).toBeDisabled();

    await campo.fill("pagos mi clinica");
    await expect(pago.getByRole("alert")).toBeVisible();
    await expect(pago.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect((await leerDB(page)).clinics[0].config.payments?.checkoutUrl ?? "").toBe("");
  });

  test("borrar el link y guardar lo borra de verdad", async ({ page }) => {
    const pago = tarjeta(page, "Pago online");
    const campo = pago.getByLabel("Link de checkout de tu pasarela");
    await campo.fill("https://pagos.mi-clinica.com.py");
    await pago.getByRole("button", { name: "Guardar" }).click();
    await expect(pago.getByText("Guardado", { exact: true })).toBeVisible();

    await campo.fill("");
    await pago.getByRole("button", { name: "Guardar" }).click();
    await expect(pago.getByText("Guardado", { exact: true })).toBeVisible();
    expect((await leerDB(page)).clinics[0].config.payments.checkoutUrl).toBe("");
    await page.reload();
    await expect(tarjeta(page, "Pago online").getByLabel("Link de checkout de tu pasarela")).toHaveValue("");
  });
});

test.describe("Configuración › Agenda online", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page); await irAConfiguracion(page); });

  test("muestra el link, el QR y la anticipación en la misma tarjeta", async ({ page }) => {
    const agenda = tarjeta(page, "Agenda online");
    await expect(agenda.locator("code")).toContainText("/reservar/");
    await expect(agenda.getByRole("button", { name: "Copiar link" })).toBeVisible();
    await expect(agenda.getByRole("link", { name: /Abrir/ })).toHaveAttribute("href", /\/reservar\//);
    await expect(agenda.getByRole("img", { name: "Código QR de la agenda online" })).toBeVisible();
    await expect(agenda.getByRole("link", { name: /Descargar QR/ })).toHaveAttribute("download", "agenda-online-qr.png");
    await expect(agenda.getByLabel("Anticipación mínima")).toHaveValue("12");
    await sinScrollHorizontal(page);
  });

  test("«Copiar link» deja el link de la agenda en el portapapeles", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const agenda = tarjeta(page, "Agenda online");
    await agenda.getByRole("button", { name: "Copiar link" }).click();
    await expect(agenda.getByRole("button", { name: "Copiado" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/reservar\/cl_demo$/);
  });

  test("cambiar la anticipación se guarda", async ({ page }) => {
    const agenda = tarjeta(page, "Agenda online");
    await agenda.getByLabel("Anticipación mínima").selectOption("24");
    expect((await leerDB(page)).clinics[0].config.onlineBooking.minLeadHoras).toBe(24);
    await page.reload();
    await expect(tarjeta(page, "Agenda online").getByLabel("Anticipación mínima")).toHaveValue("24");
  });

  test("ya no quedan las dos tarjetas sueltas de antes", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Agendamiento online" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Reserva online" })).toHaveCount(0);
  });

  test("avisa dónde se eligen los datos que se piden al reservar", async ({ page }) => {
    await tarjeta(page, "Agenda online").getByRole("link", { name: "Campos del paciente" }).click();
    await page.waitForURL("**/app/pacientes#configuracion");
    await expect(page.getByRole("heading", { name: "Configuración de campos del paciente" })).toBeVisible();
  });
});
