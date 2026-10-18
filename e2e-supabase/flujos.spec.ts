import type { Browser, Page } from "@playwright/test";
import { test, expect, ingresar } from "./soporte";
import { escribirDoc, leerDoc, rest } from "../lib/server/stack-de-prueba";

/* Los flujos del día a día con NEXT_PUBLIC_BACKEND=supabase. Cada uno comprueba DOS cosas: lo que muestra la pantalla y lo que quedó de verdad en
 * Postgres (se mira con la clave de servicio, no con el caché del navegador). Después de escribir se borra el caché local y se recarga, para probar que lo
 * que se ve viene de la base. */

const campo = (page: Page, etiqueta: RegExp, control = "input, select, textarea") =>
  page.getByRole("dialog").locator("label").filter({ hasText: etiqueta }).locator(control).first();
/** Otro navegador (contexto nuevo, sin caché ni sesión) que entra con esa cuenta: lo que ve viene de la base, no de lo que quedó en el primero. */
async function otroNavegador(browser: Browser, persona: { email: string; password: string }): Promise<{ page: Page; cerrar: () => Promise<void> }> {
  const ctx = await browser.newContext({ locale: "es-PY" });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("novudent.consentimiento.v1", JSON.stringify({ version: 1, analitica: false, fecha: new Date().toISOString() })));
  await ingresar(page, persona.email, persona.password);
  return { page, cerrar: () => ctx.close() };
}
type Fila = { id: string; data: Record<string, any> };
const filas = (tabla: string, cid: string, extra: Record<string, string> = {}): Promise<Fila[]> => rest(tabla, "GET", { select: "id,data", clinic_id: `eq.${cid}`, ...extra });

test.describe("ficha, cita y pago", () => {
  test.describe.configure({ mode: "serial" }); // cada paso usa lo que dejó el anterior (el paciente, su cita)
  const ci = String(8_000_000 + Math.floor(Math.random() * 999_999));

  test("pacientes: dar de alta un paciente queda en Postgres y lo ve quien entra desde otro navegador", async ({ browser, page, mundo }) => {
    const ana = mundo.clinica.personas.admin;
    await ingresar(page, ana.email, ana.password);
    await page.goto("/app/pacientes");
    await page.getByRole("button", { name: "Nuevo paciente" }).click();
    await page.waitForURL("**/app/pacientes/nuevo");
    const m = page.locator("main");
    await m.getByLabel("Nombre legal *").fill("Prueba");
    await m.getByLabel("Apellidos *").fill("Supabase");
    await m.getByLabel("Cédula / DNI *").fill(ci);
    await m.getByLabel("Fecha de nacimiento *").fill("1985-01-15");
    await m.getByLabel("Sexo *").selectOption("M");
    await m.getByLabel("Género *").selectOption("M");
    await m.getByLabel("Teléfono móvil *").fill("+595 981 000 000");
    await m.getByLabel("Email *").fill("prueba.supabase@correo.com");
    await m.getByRole("button", { name: "Crear paciente" }).click();
    await page.waitForURL(/\/app\/pacientes\/p_/);

    await expect.poll(async () => (await filas("patients", mundo.clinica.cid, { "data->>document": `eq.${ci}` })).length).toBe(1);
    const paciente = (await filas("patients", mundo.clinica.cid, { "data->>document": `eq.${ci}` }))[0].data;
    expect(paciente).toMatchObject({ firstName: "Prueba", lastName: "Supabase", clinicId: mundo.clinica.cid });
    // La Historia Clínica queda pendiente (crearPaciente del store) y también se guarda.
    await expect.poll(async () => (await filas("clinicalDocs", mundo.clinica.cid)).length).toBeGreaterThan(0);

    const otro = await otroNavegador(browser, ana);
    await otro.page.goto("/app/pacientes");
    await otro.page.getByPlaceholder(/Buscar por nombre, CI/).fill(ci);
    await expect(otro.page.locator("main").getByRole("link", { name: /Prueba Supabase/ }).first()).toBeVisible();
    await otro.cerrar();
  });

  test("agenda: dar una cita a ese paciente la guarda en appointments y la ve quien entra desde otro navegador", async ({ browser, page, mundo }) => {
    const rita = mundo.clinica.personas.recep;
    await ingresar(page, rita.email, rita.password);
    await page.goto("/app/agenda");
    await page.getByRole("button", { name: "Dar cita" }).first().click();
    const dialogo = page.getByRole("dialog", { name: "Dar cita" });
    await dialogo.getByRole("combobox", { name: "Paciente" }).fill("Supabase");
    await dialogo.getByRole("option", { name: /PRUEBA SUPABASE/i }).click();
    await dialogo.locator("button[aria-pressed]").first().click();
    await dialogo.getByRole("button", { name: "Crear cita" }).click();
    await expect(dialogo).toBeHidden();

    await expect.poll(async () => (await filas("appointments", mundo.clinica.cid)).length).toBe(1);
    const cita = (await filas("appointments", mundo.clinica.cid))[0].data;
    expect(cita).toMatchObject({ status: "pendiente", clinicId: mundo.clinica.cid });
    const otro = await otroNavegador(browser, rita);
    await expect.poll(() => otro.page.evaluate(() => JSON.parse(localStorage.getItem("novudent.db.v4") || "null")?.appointments?.length)).toBe(1);
    await otro.cerrar();
  });

  test("caja: registrar un pago lo guarda en payments y se ve en los movimientos", async ({ browser, page, mundo }) => {
    const ana = mundo.clinica.personas.admin;
    await ingresar(page, ana.email, ana.password);
    await page.goto("/app/caja");
    // La caja se abre primero (cashSessions) y después se registran los movimientos.
    await page.getByRole("button", { name: "Abrir caja" }).first().click();
    await page.getByRole("dialog", { name: "Abrir caja" }).getByRole("button", { name: "Abrir caja" }).click();
    await expect.poll(async () => (await filas("cashSessions", mundo.clinica.cid)).length).toBe(1);
    await page.locator("main").getByRole("button", { name: "Registrar pago" }).first().click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Registrar pago");
    await expect(page.getByRole("dialog").getByRole("combobox").first()).toHaveValue(/.+/); // el paciente de arriba (el único con ficha) viene elegido
    await campo(page, /monto/i).fill("150000");
    await campo(page, /m[eé]todo/i, "select").selectOption({ label: "Efectivo" });
    await campo(page, /concepto/i).fill("Pago E2E Supabase");
    await dialogo.getByRole("button", { name: /^Registrar Gs/ }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.locator("main").getByText("Pago E2E Supabase").first()).toBeVisible();

    await expect.poll(async () => (await filas("payments", mundo.clinica.cid)).length).toBe(1);
    expect((await filas("payments", mundo.clinica.cid))[0].data).toMatchObject({ amount: 150000, method: "efectivo", concept: "Pago E2E Supabase" });
    const otro = await otroNavegador(browser, ana);
    await otro.page.goto("/app/caja");
    await expect(otro.page.locator("main").getByText("Pago E2E Supabase").first()).toBeVisible();
    await otro.cerrar();
  });

  test("lo que un rol escribe lo ve otro de la misma clínica, y el dentista no recibe los gastos (RLS: son del administrador)", async ({ browser, mundo }) => {
    await escribirDoc("expenses", "g1", { id: "g1", concept: "Alquiler", amount: 5_000_000, date: "2026-10-01" }, mundo.clinica.cid);
    const ctx = await browser.newContext({ locale: "es-PY" });
    const dr = await ctx.newPage();
    await dr.addInitScript(() => localStorage.setItem("novudent.consentimiento.v1", JSON.stringify({ version: 1, analitica: false, fecha: new Date().toISOString() })));
    const d = mundo.clinica.personas.dr;
    await ingresar(dr, d.email, d.password);
    const dbLocal = () => dr.evaluate(() => JSON.parse(localStorage.getItem("novudent.db.v4") || "null"));
    await expect.poll(async () => ((await dbLocal())?.patients ?? []).some((p: { document: string }) => p.document === ci)).toBe(true);
    expect((await dbLocal()).expenses).toEqual([]); // la base no se los entrega: no hace falta que la pantalla los esconda
    await ctx.close();
  });
});

test.describe("chat en vivo (Realtime)", () => {
  test("un mensaje directo llega al otro sin recargar, queda guardado con sus participantes y se marca leído", async ({ browser, page, mundo }) => {
    const ana = mundo.clinica.personas.admin;
    const d = mundo.clinica.personas.dr;
    await ingresar(page, ana.email, ana.password);
    await page.goto("/app/chat");

    const ctx = await browser.newContext({ locale: "es-PY" });
    const dr = await ctx.newPage();
    await dr.addInitScript(() => localStorage.setItem("novudent.consentimiento.v1", JSON.stringify({ version: 1, analitica: false, fecha: new Date().toISOString() })));
    await ingresar(dr, d.email, d.password);
    await dr.goto("/app/chat");
    const lista = dr.getByRole("navigation", { name: "Conversaciones" });
    await expect(lista).toBeVisible();

    // Ana le escribe al dentista…
    await page.getByRole("navigation", { name: "Conversaciones" }).getByRole("button", { name: /^Dr\. Diego Dentista/ }).click();
    const conv = page.getByRole("region", { name: "Conversación con Dr. Diego Dentista" });
    const texto = `Hola Diego ${Date.now()}`;
    await conv.getByRole("textbox").fill(texto);
    await conv.getByRole("button", { name: "Enviar" }).click();
    await expect(conv.getByRole("log")).toContainText(texto);

    // …y le llega SIN que recargue: aparece como mensaje sin leer en su lista.
    const deAna = lista.getByRole("button", { name: /^Ana Admin/ });
    await expect(deAna).toContainText("1 mensaje sin leer", { timeout: 20_000 });

    const guardado = (await filas("directMessages", mundo.clinica.cid)).find((f) => f.data.text === texto)!;
    expect(guardado.data).toMatchObject({ fromId: "u_admin_migrado", toId: "u_dr_migrado", participants: ["u_admin_migrado", "u_dr_migrado"] });

    // Abrirla lo marca leído en la base (fijar_campo sobre readAt) y Ana se entera en vivo.
    await deAna.click();
    await expect(dr.getByRole("region", { name: "Conversación con Ana Admin" }).getByRole("log")).toContainText(texto);
    await expect.poll(async () => (await leerDoc("directMessages", guardado.id, mundo.clinica.cid))?.readAt).toBeTruthy();
    await ctx.close();
  });

  test("un mensaje que otro cliente escribe directo en la base (Botika, un script) también aparece en vivo", async ({ page, mundo }) => {
    const ana = mundo.clinica.personas.admin;
    await ingresar(page, ana.email, ana.password);
    await page.goto("/app/chat");
    await expect(page.getByRole("navigation", { name: "Conversaciones" })).toBeVisible();
    const texto = `Desde la base ${Date.now()}`;
    await escribirDoc("directMessages", `dm_ext_${Date.now()}`, {
      id: `dm_ext_${Date.now()}`, clinicId: mundo.clinica.cid, fromId: "u_dr_migrado", toId: "u_admin_migrado", participants: ["u_dr_migrado", "u_admin_migrado"],
      text: texto, createdAt: new Date().toISOString(),
    }, mundo.clinica.cid);
    await expect(page.getByRole("navigation", { name: "Conversaciones" }).getByRole("button", { name: /^Dr\. Diego Dentista/ })).toContainText("sin leer", { timeout: 20_000 });
  });
});

test.describe("reserva online (página pública) → agenda", () => {
  test("el paciente reserva sin cuenta; la cita queda en la base y aparece en la agenda de la recepción", async ({ browser, page, mundo }) => {
    // Un paciente cualquiera, sin sesión, en otro navegador.
    const ctx = await browser.newContext({ locale: "es-PY" });
    const paciente = await ctx.newPage();
    await paciente.goto(`/reservar/${mundo.clinica.cid}`);
    await paciente.getByRole("button", { name: /^(lun|mar|mié|jue|vie|sáb)/i }).first().click();
    await paciente.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
    await paciente.getByPlaceholder("Nombre", { exact: true }).fill("Lía");
    await paciente.getByPlaceholder("Apellido", { exact: true }).fill("Online");
    await paciente.getByPlaceholder("Cédula (CI)").fill("5550123");
    await paciente.getByPlaceholder("WhatsApp (09xx xxx xxx)").fill("0983 555 555");
    await paciente.getByPlaceholder("Email", { exact: true }).fill("lia@correo.com");
    await paciente.getByRole("button", { name: "Confirmar reserva" }).click();
    await expect(paciente.getByText("¡Reserva recibida!")).toBeVisible();
    await ctx.close();

    const citas = (await filas("appointments", mundo.clinica.cid)).filter((f) => f.data.source === "online");
    expect(citas).toHaveLength(1);
    expect(citas[0].data).toMatchObject({ status: "pendiente", dentistId: "u_dr_migrado" });
    const pacientes = await filas("patients", mundo.clinica.cid, { "data->>document": "eq.5550123" });
    expect(pacientes).toHaveLength(1);

    // La recepción la ve en su agenda.
    const rita = mundo.clinica.personas.recep;
    await ingresar(page, rita.email, rita.password);
    const db = await page.evaluate(() => JSON.parse(localStorage.getItem("novudent.db.v4") || "null"));
    expect(db.appointments.some((a: { source?: string }) => a.source === "online")).toBe(true);
  });
});
