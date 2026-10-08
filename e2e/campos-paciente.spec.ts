import { test, expect, entrarDemo, leerDB, USUARIOS_DEMO } from "./soporte";
import type { Page } from "@playwright/test";

/* Campos del paciente por contexto (paridad Dentalink): Pacientes → Configuración decide
   qué datos se piden y cuáles son obligatorios en el alta, al agendar y en la reserva
   online. Sin configuración, la app pide lo mismo que antes. */

const main = (page: Page) => page.locator("main");

/** Obligatorios por defecto (revisión de Novum): nombre, apellido, CI, fecha de nacimiento,
 *  sexo, género, teléfono y email (este último desde el 7/10/2026: los avisos salen por correo). */
async function completarObligatorios(zona: import("@playwright/test").Locator, datos: { nombre: string; apellido: string; ci: string; tel: string; nacimiento?: string; email?: string | null }) {
  await zona.getByLabel("Nombre legal *").fill(datos.nombre);
  await zona.getByLabel("Apellidos *").fill(datos.apellido);
  await zona.getByLabel("Cédula / DNI *").fill(datos.ci);
  await zona.getByLabel("Fecha de nacimiento *").fill(datos.nacimiento ?? "1990-05-20");
  await zona.getByLabel("Sexo *").selectOption("F");
  await zona.getByLabel("Género *").selectOption("nd");
  await zona.getByLabel("Teléfono móvil *").fill(datos.tel);
  if (datos.email !== null) await zona.getByLabel("Email *").fill(datos.email ?? "paciente@correo.com"); // null: la clínica apagó el campo
}

test.describe("alta de paciente (página completa)", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page, USUARIOS_DEMO.admin); });

  test("sin configuración pide lo de la revisión de Novum", async ({ page }) => {
    await page.goto("/app/pacientes");
    await main(page).getByRole("button", { name: "Nuevo paciente" }).click();
    await page.waitForURL("**/app/pacientes/nuevo");
    for (const campo of ["Nombre legal *", "Apellidos *", "Cédula / DNI *", "Fecha de nacimiento *", "Sexo *", "Género *", "Teléfono móvil *", "Email *", "Barrio", "RUC", "Razón social", "Referido por (de quién)"]) {
      await expect(main(page).getByText(campo, { exact: true })).toBeVisible();
    }
    await expect(main(page).getByLabel("Género *").locator("option", { hasText: "Prefiero no decirlo" })).toHaveCount(1);
  });

  test("la configuración de la clínica cambia lo que pide el alta", async ({ page }) => {
    await page.goto("/app/pacientes");
    await main(page).getByRole("button", { name: "Configuración" }).click();
    await expect(main(page).getByLabel("Nombre legal: presente en Nuevo paciente")).toBeDisabled(); // no se puede apagar
    await main(page).getByLabel("Empleador: requerido en Nuevo paciente").check();
    await expect(main(page).getByLabel("Empleador: presente en Nuevo paciente")).toBeChecked(); // requerido ⇒ presente
    await main(page).getByLabel("Email: presente en Nuevo paciente").uncheck();
    await expect(main(page).getByRole("status")).toContainText("cambios sin guardar");
    await main(page).getByRole("button", { name: "Guardar" }).click();
    await expect.poll(async () => (await leerDB(page))?.clinics[0].config.patientFields?.empleador?.required?.nuevo).toBe(true);

    await page.goto("/app/pacientes/nuevo");
    await expect(main(page).getByText("Email", { exact: true })).toHaveCount(0);
    await expect(main(page).getByLabel("Empleador *")).toHaveAttribute("required", "");
    await completarObligatorios(main(page), { nombre: "Rosa", apellido: "Campos", ci: "7.777.777", tel: "0981 777 777", email: null }); // este test apagó el email
    await main(page).getByLabel("Empleador *").fill("Clínica Sur");
    await main(page).locator("#foto-paciente").setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") });
    await expect(main(page).getByAltText("Foto del paciente")).toBeVisible();
    await main(page).getByRole("button", { name: "Crear paciente" }).click();
    await page.waitForURL(/\/app\/pacientes\/p_/);
    await expect.poll(async () => (await leerDB(page))?.patients.find((p: { document: string }) => p.document === "7.777.777")).toMatchObject({
      firstName: "Rosa", lastName: "Campos", phone: "0981 777 777", birthDate: "1990-05-20", sex: "F", gender: "nd", employer: "Clínica Sur",
    });
  });

  test("si es menor de edad pide el responsable", async ({ page }) => {
    await page.goto("/app/pacientes/nuevo");
    await completarObligatorios(main(page), { nombre: "Leo", apellido: "Chico", ci: "9.999.999", tel: "0981 999 999", nacimiento: "2016-03-10" });
    await expect(main(page).getByText("El paciente es menor de edad")).toBeVisible();
    await expect(main(page).getByLabel("Responsable *", { exact: true })).toHaveAttribute("required", "");
    await main(page).getByLabel("Responsable *", { exact: true }).fill("Ana Chico");
    await main(page).getByLabel("CI del responsable *").fill("1.111.111");
    await main(page).getByLabel("Qué es del paciente *").fill("Madre");
    await main(page).getByRole("button", { name: "Crear paciente" }).click();
    await page.waitForURL(/\/app\/pacientes\/p_/);
    await expect.poll(async () => (await leerDB(page))?.patients.find((p: { document: string }) => p.document === "9.999.999")).toMatchObject({
      guardian: "Ana Chico", legalRepDoc: "1.111.111", parentesco: "Madre",
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
    await completarObligatorios(ficha, { nombre: "Tomás", apellido: "Agenda", ci: "8.888.888", tel: "0982 888 888" });
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
    await expect(ficha).toBeVisible(); // la revisión del alta frena el envío (faltan CI y teléfono) y lo avisa: ver ficha-y-textos.spec.ts
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
