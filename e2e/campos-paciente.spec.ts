import { test, expect, entrarDemo, leerDB, USUARIOS_DEMO } from "./soporte";
import type { Page } from "@playwright/test";

/* Campos del paciente por contexto (paridad Dentalink): Pacientes → Configuración decide
   qué datos se piden y cuáles son obligatorios en el alta, al agendar y en la reserva
   online. Sin configuración, la app pide lo mismo que antes. */

const main = (page: Page) => page.locator("main");
const dialogo = (page: Page) => page.getByRole("dialog");

async function abrirNuevoPaciente(page: Page) {
  await page.goto("/app/pacientes");
  await main(page).getByRole("button", { name: "Nuevo paciente" }).click();
  await expect(dialogo(page)).toBeVisible();
}

test.describe("alta de paciente", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page, USUARIOS_DEMO.admin); });

  test("sin configuración pide lo de siempre", async ({ page }) => {
    await abrirNuevoPaciente(page);
    for (const campo of ["Nombre legal *", "Apellidos *", "Cédula / DNI *", "Teléfono móvil *", "Email", "Convenio"]) {
      await expect(dialogo(page).getByText(campo, { exact: true })).toBeVisible();
    }
    await expect(dialogo(page).getByText("Fecha de nacimiento")).toHaveCount(0);
  });

  test("la configuración de la clínica cambia lo que pide el alta", async ({ page }) => {
    await page.goto("/app/pacientes");
    await main(page).getByRole("button", { name: "Configuración" }).click();
    // Nombre y apellidos no se pueden apagar.
    await expect(main(page).getByLabel("Nombre legal: presente en Nuevo paciente")).toBeDisabled();
    await main(page).getByLabel("Fecha de nacimiento: requerido en Nuevo paciente").check();
    await expect(main(page).getByLabel("Fecha de nacimiento: presente en Nuevo paciente")).toBeChecked(); // requerido ⇒ presente
    await main(page).getByLabel("Email: presente en Nuevo paciente").uncheck();
    await expect(main(page).getByRole("status")).toContainText("cambios sin guardar");
    await main(page).getByRole("button", { name: "Guardar" }).click();
    await expect.poll(async () => (await leerDB(page))?.clinics[0].config.patientFields?.fechaNacimiento?.required?.nuevo).toBe(true);

    await main(page).getByRole("button", { name: "Pacientes", exact: true }).click();
    await main(page).getByRole("button", { name: "Nuevo paciente" }).click();
    const d = dialogo(page);
    await expect(d.getByText("Email", { exact: true })).toHaveCount(0);
    const nacimiento = d.getByLabel("Fecha de nacimiento *");
    await expect(nacimiento).toHaveAttribute("required", "");

    await d.getByLabel("Nombre legal *").fill("Rosa");
    await d.getByLabel("Apellidos *").fill("Campos");
    await d.getByLabel("Cédula / DNI *").fill("7.777.777");
    await d.getByLabel("Teléfono móvil *").fill("0981 777 777");
    await nacimiento.fill("1991-05-20");
    await d.getByRole("button", { name: "Crear paciente" }).click();
    await expect(d).toHaveCount(0);
    await expect.poll(async () => (await leerDB(page))?.patients.find((p: { document: string }) => p.document === "7.777.777")).toMatchObject({
      firstName: "Rosa", lastName: "Campos", phone: "0981 777 777", birthDate: "1991-05-20",
    });
  });
});

test.describe("paciente nuevo al agendar", () => {
  /** Abre «Dar cita» y, desde el buscador de pacientes, «Crear nuevo paciente». */
  async function abrirCrearPaciente(page: Page) {
    await page.goto("/app/agenda");
    await main(page).getByRole("button", { name: "Dar cita" }).click();
    const cita = page.getByRole("dialog", { name: "Dar cita" });
    await cita.getByRole("combobox", { name: "Paciente" }).click();
    await cita.getByRole("option", { name: "Crear nuevo paciente" }).click();
    return { cita, ficha: page.getByRole("dialog", { name: "Nuevo paciente" }) };
  }

  test("la recepción crea el paciente desde la cita", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    const { cita, ficha } = await abrirCrearPaciente(page);
    await ficha.getByLabel("Nombre legal *").fill("Tomás");
    await ficha.getByLabel("Apellidos *").fill("Agenda");
    await ficha.getByLabel("Cédula / DNI *").fill("8.888.888");
    await ficha.getByLabel("Teléfono móvil *").fill("0982 888 888");
    await ficha.getByRole("button", { name: "Crear paciente" }).click();
    await expect(ficha).toHaveCount(0);
    await expect(cita.getByRole("combobox", { name: "Paciente" })).toHaveValue("8.888.888 | TOMÁS AGENDA");
    await cita.locator("button[aria-pressed]").first().click();
    await cita.getByRole("button", { name: "Crear cita" }).click();
    await expect(cita).toHaveCount(0);

    const db = await leerDB(page);
    const paciente = db.patients.find((p: { document: string }) => p.document === "8.888.888");
    expect(paciente).toMatchObject({ firstName: "Tomás", lastName: "Agenda", phone: "0982 888 888" });
    expect(db.appointments.some((a: { patientId: string }) => a.patientId === paciente.id)).toBe(true);
  });

  test("sin completar los obligatorios no crea nada", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    const { ficha } = await abrirCrearPaciente(page);
    await expect(ficha.getByLabel("Cédula / DNI *")).toHaveAttribute("required", "");
    const antes = (await leerDB(page)).patients.length;
    await ficha.getByLabel("Nombre legal *").fill("Sin");
    await ficha.getByLabel("Apellidos *").fill("Cédula");
    await ficha.getByRole("button", { name: "Crear paciente" }).click();
    await expect(ficha).toBeVisible(); // el navegador frena el envío: faltan CI y teléfono
    expect((await leerDB(page)).patients.length).toBe(antes);
  });

  test("el dentista no da citas ni crea pacientes: su agenda es de solo lectura", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    await page.goto("/app/agenda");
    await expect(main(page)).toContainText("Agenda");
    await expect(main(page).getByRole("button", { name: "Dar cita" })).toHaveCount(0);
  });
});

test.describe("reserva online", () => {
  test("pide los extras que configuró la clínica y los manda al reservar", async ({ page }) => {
    let enviado: Record<string, unknown> | null = null;
    // La API se simula: sin el usuario de servicio local, la de verdad no llega a Firestore.
    await page.route("**/api/reservas**", async (route) => {
      if (route.request().method() === "POST") {
        enviado = route.request().postDataJSON();
        return route.fulfill({ json: { ok: true, appointmentId: "a_x", botikaQueued: false } });
      }
      return route.fulfill({
        json: {
          ok: true, clinic: { name: "Clínica Demo" }, dentists: [{ id: "u2", name: "Dra. Sofía Benítez" }],
          slots: { u2: ["11:00", "11:30"] }, minLeadHoras: 2,
          campos: [
            { key: "email", label: "Email", tipo: "email", requerido: true },
            { key: "ciudad", label: "Ciudad", tipo: "texto", requerido: false },
          ],
        },
      });
    });
    await page.goto("/reservar/cl_demo");
    await page.getByRole("button", { name: /^(lun|mar|mié|jue|vie|sáb)/i }).first().click();
    await page.getByRole("button", { name: "11:00" }).click();
    await page.getByPlaceholder("Nombre", { exact: true }).fill("Lía");
    await page.getByPlaceholder("Apellido", { exact: true }).fill("Online");
    await page.getByPlaceholder("Cédula (CI)").fill("5555555");
    await page.getByPlaceholder("WhatsApp (09xx xxx xxx)").fill("0983 555 555");
    await expect(page.getByPlaceholder("Email", { exact: true })).toHaveAttribute("required", "");
    await page.getByPlaceholder("Email", { exact: true }).fill("lia@correo.com");
    await page.getByPlaceholder("Ciudad (opcional)").fill("Luque");
    await page.getByRole("button", { name: "Confirmar reserva" }).click();
    await expect(page.getByText("¡Reserva recibida!")).toBeVisible();
    expect(enviado).toMatchObject({ nombre: "Lía", ci: "5555555", extras: { email: "lia@correo.com", ciudad: "Luque" } });
  });
});
