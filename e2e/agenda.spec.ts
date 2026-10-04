import { test, expect, entrarDemo, leerDB, USUARIOS_DEMO } from "./soporte";
import type { Page } from "@playwright/test";

/* Agenda según la revisión de Novum (27/9/2026): «Dar cita» con buscador por CI, duración,
   multiconsulta y lista de espera; estados nuevos con «Notificar por mail»; menús que no se
   cortan; comentario por cita; filtros en todas las vistas; impresión; y la agenda del
   dentista en solo lectura. */

const main = (page: Page) => page.locator("main");
const COMENTARIO = "Traer la radiografía panorámica";

/** Agrega a la demo una cita de hoy a las 10:00 (María González con la Dra. Sofía) y abre la agenda. */
async function conCitaDeHoy(page: Page) {
  await page.evaluate((nota) => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4") || "null");
    const ini = new Date(); ini.setHours(10, 0, 0, 0);
    const fin = new Date(ini); fin.setHours(11);
    db.appointments.push({ id: "a_e2e_hoy", clinicId: db.clinics[0].id, patientId: "p1", dentistId: "u2", title: "Control E2E", start: ini.toISOString(), end: fin.toISOString(), status: "pendiente", amount: 0, discount: 0, notes: nota });
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  }, COMENTARIO);
  await page.goto("/app/agenda");
}

async function abrirDarCita(page: Page) {
  await page.goto("/app/agenda");
  await main(page).getByRole("button", { name: "Dar cita" }).click();
  return page.getByRole("dialog", { name: "Dar cita" });
}

test.describe("Dar cita", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page, USUARIOS_DEMO.recepcionista); });

  test("busca por CI y con multiconsulta crea una cita por cada horario elegido", async ({ page }) => {
    const antes = (await leerDB(page)).appointments.filter((a: { patientId: string }) => a.patientId === "p1").length;
    const cita = await abrirDarCita(page);
    await cita.getByRole("combobox", { name: "Paciente" }).fill("3.456.789");
    await cita.getByRole("option", { name: "3.456.789 | MARÍA GONZÁLEZ" }).click();
    await cita.getByLabel("Duración: horas").selectOption("1");
    await cita.getByLabel("Minutos").fill("0");
    await cita.getByText("Multiconsulta").click();
    const libres = cita.locator("button[aria-pressed='false']:not([disabled])");
    await libres.first().click();
    await libres.first().click(); // el siguiente libre que no pisa al primero
    await cita.getByRole("button", { name: "Crear 2 citas" }).click();
    await expect(cita).toHaveCount(0);
    const nuevas = (await leerDB(page)).appointments.filter((a: { patientId: string }) => a.patientId === "p1");
    expect(nuevas.length).toBe(antes + 2);
    for (const a of nuevas.slice(-2)) {
      expect(a.status).toBe("pendiente");
      expect(Date.parse(a.end) - Date.parse(a.start)).toBe(60 * 60_000);
    }
  });

  test("sin horario elegido puede dejar al paciente en la lista de espera", async ({ page }) => {
    const cita = await abrirDarCita(page);
    await cita.getByRole("combobox", { name: "Paciente" }).fill("Ferreira");
    await cita.getByRole("option", { name: /LUCÍA FERREIRA/ }).click();
    await cita.getByText("Agregar a la lista de espera").click();
    await cita.getByLabel("Preferencia horaria").fill("martes a la tarde");
    await cita.getByRole("button", { name: "Agregar a la lista de espera" }).click();
    await expect(cita).toHaveCount(0);
    expect((await leerDB(page)).waitlist.some((w: { patientId: string; preference: string }) => w.patientId === "p5" && w.preference === "martes a la tarde")).toBe(true);
  });

  test("no tiene estado, importe ni descuento: la cita nace «No confirmado»", async ({ page }) => {
    const cita = await abrirDarCita(page);
    for (const campo of ["Estado", "Importe (Gs)", "Descuento (Gs)", "Título"]) await expect(cita.getByText(campo, { exact: true })).toHaveCount(0);
  });
});

test.describe("agenda del día", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page, USUARIOS_DEMO.recepcionista); await conCitaDeHoy(page); });

  test("el menú de estado se ve entero sobre la tabla y arriba tiene «Notificar por mail»", async ({ page }) => {
    await main(page).getByRole("button", { name: "No confirmado" }).first().click();
    const menu = page.getByRole("menu", { name: "Estado de la cita" });
    await expect(menu).toBeVisible();
    // Va en un portal sobre <body> (envuelto en .app-portal, que le da la forma del panel):
    // no lo corta el scroll de la tabla.
    expect(await menu.evaluate((el) => el.closest(".app-portal")?.parentElement === document.body)).toBe(true);
    const items = menu.getByRole("menuitem");
    await expect(items.first()).toContainText("Notificar por mail");
    for (const estado of ["No confirmado", "Confirmado", "Atendido", "Atendiéndose", "En sala de espera", "No asiste", "Anulado"]) {
      await expect(menu).toContainText(estado);
    }
    await items.first().click();
    await expect(page.getByRole("status").filter({ hasText: "En la demo no se envían correos" })).toBeVisible();

    await main(page).getByRole("button", { name: "No confirmado" }).first().click();
    await page.getByRole("menu", { name: "Estado de la cita" }).getByRole("menuitem", { name: "En sala de espera" }).click();
    await expect.poll(async () => (await leerDB(page)).appointments.find((a: { id: string }) => a.id === "a_e2e_hoy")?.status).toBe("en_sala");
  });

  test("la demo no marca como enviado un correo que no salió", async ({ page }) => {
    const antes = (await leerDB(page)).appointments.map((a: { id: string; reminderSent?: boolean }) => [a.id, a.reminderSent]);
    await main(page).getByRole("button", { name: "Acciones de la cita" }).first().click();
    await page.getByRole("menuitem", { name: "Ver" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Enviar al correo" }).click();
    await expect(page.getByText("En la demo no se envían correos; la cita no se marcó como notificada.")).toBeVisible();
    expect((await leerDB(page)).appointments.map((a: { id: string; reminderSent?: boolean }) => [a.id, a.reminderSent])).toEqual(antes);
  });

  test("el comentario de la cita se ve en un globo", async ({ page }) => {
    await main(page).getByRole("button", { name: "Ver el comentario de la cita" }).first().click();
    await expect(page.getByRole("menu", { name: "Comentario de la cita" })).toContainText(COMENTARIO);
  });

  test("ya no hay exportación .ics ni «Agregar al calendario», y «Ver» manda al correo", async ({ page }) => {
    await expect(main(page).getByRole("button", { name: /Exportar/ })).toHaveCount(0);
    await main(page).getByRole("button", { name: "Acciones de la cita" }).first().click();
    await page.getByRole("menuitem", { name: "Ver" }).click();
    const ver = page.getByRole("dialog");
    await expect(ver.getByRole("button", { name: "Enviar al correo" })).toBeVisible();
    await expect(ver.getByRole("button", { name: /Agregar al calendario/ })).toHaveCount(0);
    await expect(ver).not.toContainText("WhatsApp");
  });

  test("imprimir muestra la agenda (antes salía la hoja en blanco)", async ({ page }) => {
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".print-area")).toBeVisible();
    await expect(page.getByText(/Agenda diaria/)).toBeVisible();
    await expect(page.locator(".print-area").getByText("María González").first()).toBeVisible();
  });
});

test.describe("filtros", () => {
  test("la semanal filtra por profesional y muestra la sucursal", async ({ page, isMobile }) => {
    test.skip(isMobile, "la grilla semanal se prueba en escritorio");
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/agenda");
    await main(page).getByRole("button", { name: "Semanal" }).click();
    await expect(main(page).getByLabel("Filtrar por sucursal")).toBeEnabled(); // la demo tiene dos sedes
    await main(page).getByLabel("Filtrar por profesional").selectOption({ label: "Dr. Diego Martínez" });
    await expect(main(page)).toContainText("Control + limpieza");
    await expect(main(page)).not.toContainText("Resina pieza 16");
  });
});

test.describe("solo lectura", () => {
  test("el dentista ve su agenda pero no cambia estados ni edita", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    await conCitaDeHoy(page);
    await expect(main(page).getByRole("button", { name: "Dar cita" })).toHaveCount(0);
    await expect(main(page).getByText("No confirmado").first()).toBeVisible();
    await expect(main(page).getByRole("button", { name: "No confirmado" })).toHaveCount(0);
    await main(page).getByRole("button", { name: "Acciones de la cita" }).first().click();
    await expect(page.getByRole("menuitem", { name: "Ver" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Editar" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Eliminar" })).toHaveCount(0);
  });
});
