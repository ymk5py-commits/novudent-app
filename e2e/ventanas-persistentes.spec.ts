import { test, expect, entrarDemo, leerDB, USUARIOS_DEMO } from "./soporte";
import type { Page } from "@playwright/test";

/* Pedido de Croman (8-oct-2026): «las ventanas deben ser persistentes y que se cierren con cancelar o con la X de arriba, para evitar
   que se cierren» + «todo esto mejorar y cada detalle tener en cuenta» (sobre «Dar cita»). Un clic afuera o Escape ya no cierran una
   ventana a medio llenar; la X y «Cancelar» sí. */

async function abrirDarCita(page: Page) {
  await page.goto("/app/agenda");
  await page.locator("main").getByRole("button", { name: "Dar cita" }).click();
  const cita = page.getByRole("dialog", { name: "Dar cita" });
  await expect(cita).toBeVisible();
  return cita;
}

test.describe("ventanas persistentes", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page, USUARIOS_DEMO.recepcionista); });

  test("un clic afuera o Escape no cierran «Dar cita» ni borran lo escrito", async ({ page }) => {
    const cita = await abrirDarCita(page);
    await cita.getByLabel("Comentario (opcional)").fill("Trae estudios");
    await page.mouse.click(4, 4); // el fondo oscuro, fuera de la ventana
    await expect(cita).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(cita).toBeVisible();
    await expect(cita.getByLabel("Comentario (opcional)")).toHaveValue("Trae estudios");
  });

  test("la X de arriba y «Cancelar» sí cierran", async ({ page }) => {
    let cita = await abrirDarCita(page);
    await cita.getByRole("button", { name: "Cerrar" }).click();
    await expect(cita).toHaveCount(0);
    cita = await abrirDarCita(page);
    await cita.getByRole("button", { name: "Cancelar" }).click();
    await expect(cita).toHaveCount(0);
  });

  test("al abrir, el foco no queda sobre la X (un Enter no la cierra)", async ({ page }) => {
    const cita = await abrirDarCita(page);
    await expect(cita.getByRole("button", { name: "Cerrar" })).not.toBeFocused();
    await page.keyboard.press("Enter");
    await expect(cita).toBeVisible();
  });

  test("con la ventana abajo de todo, el título con la X y los botones de guardar siguen a la vista", async ({ page }) => {
    const cita = await abrirDarCita(page);
    await cita.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(cita.getByRole("button", { name: "Cerrar" })).toBeInViewport();
    await expect(cita.getByRole("button", { name: "Crear cita" })).toBeInViewport();
    await cita.evaluate((el) => el.scrollTo(0, 0));
    await expect(cita.getByRole("button", { name: "Crear cita" })).toBeInViewport();
  });

  test("un clic afuera marca la X, para que se vea por dónde se cierra", async ({ page }) => {
    const cita = await abrirDarCita(page);
    await page.mouse.click(4, 4);
    await expect(cita.getByRole("button", { name: "Cerrar" })).toHaveAttribute("data-aviso", "si");
    await expect(cita.getByText("Para cerrar, tocá la X o «Cancelar»")).toBeVisible();
    await expect(cita.getByText("Para cerrar, tocá la X o «Cancelar»")).toHaveCount(0, { timeout: 4000 }); // se va solo
  });
});

test.describe("«Dar cita»: cada detalle", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page, USUARIOS_DEMO.recepcionista); });

  test("la duración es una sola lista de 15 en 15 minutos y la grilla la usa", async ({ page }) => {
    const cita = await abrirDarCita(page);
    const duracion = cita.getByLabel("Duración");
    await expect(duracion).toHaveValue("30");
    await duracion.selectOption({ label: "1 h 30 min" });
    await expect(cita.getByText(/entra una consulta de 1 h 30 min/)).toBeVisible();
    await cita.getByRole("combobox", { name: "Paciente" }).fill("3.456.789");
    await cita.getByRole("option", { name: "3.456.789 | MARÍA GONZÁLEZ" }).click();
    await cita.locator("button[aria-pressed='false']:not([disabled])").first().click();
    await cita.getByRole("button", { name: "Crear cita" }).click();
    await expect(cita).toHaveCount(0);
    const nueva = (await leerDB(page)).appointments.filter((a: { patientId: string }) => a.patientId === "p1").at(-1);
    expect(Date.parse(nueva.end) - Date.parse(nueva.start)).toBe(90 * 60_000);
  });

  test("el pie dice qué horario se eligió, junto al botón", async ({ page }) => {
    const cita = await abrirDarCita(page);
    const pie = cita.getByTestId("pie-dar-cita");
    await expect(pie).toContainText("Elegí un horario");
    await cita.locator("button[aria-pressed='false']:not([disabled])").first().click();
    await expect(pie).toContainText(/Horario elegido: .+ \d\d:\d\d/);
  });

  test("un día sin horarios dice por qué (el domingo, «No atiende»)", async ({ page }) => {
    const cita = await abrirDarCita(page);
    // La semana que se muestra siempre tiene un domingo: la demo atiende de lunes a sábado.
    await expect(cita.getByText("No atiende").first()).toBeVisible();
  });

  test("la grilla de horarios tiene un solo scroll, no uno por día", async ({ page }) => {
    const cita = await abrirDarCita(page);
    const conScroll = await cita.locator("[aria-labelledby='dc-grilla'] *").evaluateAll((els) =>
      els.filter((el) => { const s = getComputedStyle(el); return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight; }).length,
    );
    expect(conScroll).toBeLessThanOrEqual(1);
  });
});
