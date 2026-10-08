import { test, expect, entrarDemo, leerDB, sinScrollHorizontal, USUARIOS_DEMO } from "./soporte";
import type { Locator, Page } from "@playwright/test";

/* Defectos de la ficha del paciente y de textos sueltos que dejó el manual (hallazgos B1–B9, 8-oct-2026).
   Cada bloque falla con el código anterior y pasa con el arreglo. */

const main = (page: Page) => page.locator("main");

/** La tarjeta (div con `p-5`) cuyo título es `titulo`. */
const tarjeta = (page: Page, titulo: string): Locator =>
  page.getByRole("heading", { name: titulo, exact: true }).locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' p-5 ')][1]");

/** Cambia la copia local de la demo (la app trabaja sin Firebase en los e2e); hay que abrir la pantalla DESPUÉS. */
const cambiarDemo = (page: Page, cambios: { usuarios?: Record<string, object>; config?: object }) =>
  page.evaluate((c) => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
    if (c.usuarios) db.users = db.users.map((u: { id: string }) => (c.usuarios![u.id] ? { ...u, ...c.usuarios![u.id] } : u));
    if (c.config) db.clinics[0].config = { ...db.clinics[0].config, ...c.config };
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  }, cambios);

type Paciente = { id: string; document: string; phone: string; firstName: string; lastName: string };
const pacientes = async (page: Page) => (await leerDB(page)).patients as Paciente[];

/** Completa los obligatorios del alta (nombre, apellido, CI, nacimiento, sexo, género, teléfono y email). */
async function completarObligatorios(zona: Locator, d: { nombre: string; apellido: string; ci: string; tel: string; email?: string }) {
  await zona.getByLabel("Nombre legal *").fill(d.nombre);
  await zona.getByLabel("Apellidos *").fill(d.apellido);
  await zona.getByLabel("Cédula / DNI *").fill(d.ci);
  await zona.getByLabel("Fecha de nacimiento *").fill("1990-05-20");
  await zona.getByLabel("Sexo *").selectOption("F");
  await zona.getByLabel("Género *").selectOption("nd");
  await zona.getByLabel("Teléfono móvil *").fill(d.tel);
  await zona.getByLabel("Email *").fill(d.email ?? "paciente@correo.com");
}

/** «Dar cita» → «Crear nuevo paciente»: devuelve las dos ventanas. */
async function abrirCrearPaciente(page: Page) {
  await page.goto("/app/agenda");
  await main(page).getByRole("button", { name: "Dar cita" }).click();
  const cita = page.getByRole("dialog", { name: "Dar cita" });
  await cita.getByRole("combobox", { name: "Paciente" }).click();
  await cita.getByRole("option", { name: "Crear nuevo paciente" }).click();
  return { cita, ficha: page.getByRole("dialog", { name: "Nuevo paciente" }) };
}

/* ═══════════════════════ B1 · Datos personales y alta de pacientes ═══════════════════════ */

test.describe("B1 · Datos personales de la ficha", () => {
  test("«Datos requeridos» es lo que pide el alta: sexo y género sí; el tipo no", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/p2?tab=datos");
    const requeridos = tarjeta(page, "Datos requeridos");
    const opcionales = tarjeta(page, "Datos opcionales");
    for (const campo of ["Nombre legal", "Apellidos", "Cédula identidad / DNI", "Fecha de nacimiento", "Sexo", "Género", "Teléfono móvil", "Email"]) {
      await expect(requeridos.getByLabel(campo), `${campo} tiene que estar en «Datos requeridos»`).toHaveCount(1);
    }
    await expect(requeridos.getByLabel("Tipo", { exact: true })).toHaveCount(0);
    await expect(opcionales.getByLabel("Tipo", { exact: true })).toHaveCount(1);
    for (const campo of ["Sexo", "Género", "Email"]) await expect(opcionales.getByLabel(campo), `${campo} no es opcional`).toHaveCount(0);
  });

  test("si la clínica cambia lo obligatorio, la ficha lo sigue", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await cambiarDemo(page, { config: { patientFields: { email: { required: { nuevo: false } }, empleador: { present: { nuevo: true }, required: { nuevo: true } } } } });
    await page.goto("/app/pacientes/p2?tab=datos");
    await expect(tarjeta(page, "Datos requeridos").getByLabel("Empleador")).toHaveCount(1);
    await expect(tarjeta(page, "Datos requeridos").getByLabel("Email")).toHaveCount(0);
    await expect(tarjeta(page, "Datos opcionales").getByLabel("Email")).toHaveCount(1);
  });

  test("«Guardar datos» no deja vaciar la CI ni el teléfono", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/p1?tab=datos");
    const requeridos = tarjeta(page, "Datos requeridos");
    await requeridos.getByLabel("Cédula identidad / DNI").fill("");
    await requeridos.getByLabel("Teléfono móvil").fill("");
    await main(page).getByRole("button", { name: "Guardar datos" }).click();
    const aviso = main(page).getByRole("alert");
    await expect(aviso).toContainText("No se guardó");
    await expect(aviso).toContainText("Cédula / DNI");
    await expect(aviso).toContainText("Teléfono móvil");
    expect((await pacientes(page)).find((p) => p.id === "p1")).toMatchObject({ document: "3.456.789", phone: "+595 981 111 111" });
  });

  test("si se escribe la CI de otro paciente, la ficha avisa (sin impedir guardar)", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/p2?tab=datos");
    await tarjeta(page, "Datos requeridos").getByLabel("Cédula identidad / DNI").fill("3456789"); // la de María González
    await expect(main(page).getByText("Otro paciente tiene esta misma CI")).toBeVisible();
    await expect(main(page).getByRole("link", { name: "María González" })).toHaveAttribute("href", "/app/pacientes/p1");
    await expect(main(page).getByRole("button", { name: "Guardar datos" })).toBeEnabled();
    await tarjeta(page, "Datos requeridos").getByLabel("Cédula identidad / DNI").fill("4.567.890"); // la suya: no es una repetida
    await expect(main(page).getByText("Otro paciente tiene esta misma CI")).toHaveCount(0);
  });

  test("un dato requerido que el paciente nunca tuvo no impide corregir otro", async ({ page }) => {
    // Juan Ríos se cargó cuando el email no era obligatorio: cambiarle el teléfono tiene que poder guardarse.
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/p2?tab=datos");
    await expect(main(page)).toContainText("Faltan datos requeridos: Email");
    await tarjeta(page, "Datos requeridos").getByLabel("Teléfono móvil").fill("+595 982 999 000");
    await main(page).getByRole("button", { name: "Guardar datos" }).click();
    await expect.poll(async () => (await pacientes(page)).find((p) => p.id === "p2")?.phone).toBe("+595 982 999 000");
    await expect(main(page).getByRole("alert")).toHaveCount(0);
  });
});

test.describe("B1 · CI repetida al crear un paciente", () => {
  test("el alta avisa, enlaza la ficha existente y pide confirmar que es otra persona", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/nuevo");
    const antes = (await pacientes(page)).length;
    // 3456789 es la CI de María González (3.456.789): sin puntos es la misma persona.
    await completarObligatorios(main(page), { nombre: "Otra", apellido: "Persona", ci: "3456789", tel: "0981 000 111" });
    await expect(main(page).getByText("Ya hay un paciente con esa CI")).toBeVisible();
    await expect(main(page).getByRole("link", { name: "María González" })).toHaveAttribute("href", "/app/pacientes/p1");

    await main(page).getByRole("button", { name: "Crear paciente" }).click();
    await expect(main(page).getByRole("alert")).toContainText("Ya hay un paciente con esa CI");
    expect(page.url()).toContain("/app/pacientes/nuevo");
    expect((await pacientes(page)).length).toBe(antes);

    await main(page).getByLabel(/Es otra persona/).check();
    await main(page).getByRole("button", { name: "Crear paciente" }).click();
    await page.waitForURL(/\/app\/pacientes\/p_/);
    await expect.poll(async () => (await pacientes(page)).filter((p) => p.document.replace(/\D/g, "") === "3456789").length).toBe(2);
  });

  test("una CI que no es de nadie no molesta", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/nuevo");
    await completarObligatorios(main(page), { nombre: "Nueva", apellido: "Persona", ci: "9.123.456", tel: "0981 000 222" });
    await expect(main(page).getByText("Ya hay un paciente con esa CI")).toHaveCount(0);
    await main(page).getByRole("button", { name: "Crear paciente" }).click();
    await page.waitForURL(/\/app\/pacientes\/p_/);
  });

  test("al dar una cita, el popup de paciente nuevo ofrece usar al que ya existe", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    const { cita, ficha } = await abrirCrearPaciente(page);
    await completarObligatorios(ficha, { nombre: "Otra", apellido: "Persona", ci: "3.456.789", tel: "0981 000 333" });
    await expect(ficha.getByText("Ya hay un paciente con esa CI")).toBeVisible();
    const antes = (await pacientes(page)).length;
    await ficha.getByRole("button", { name: "Crear paciente" }).click();
    await expect(ficha.getByRole("alert")).toContainText("Ya hay un paciente con esa CI");
    expect((await pacientes(page)).length).toBe(antes);
    await ficha.getByRole("button", { name: "Usar a María González" }).click();
    await expect(ficha).toHaveCount(0);
    await expect(cita.getByRole("combobox", { name: "Paciente" })).toHaveValue("3.456.789 | MARÍA GONZÁLEZ");
    expect((await pacientes(page)).length).toBe(antes);
  });
});

/* ═══════════════════════ B8 · Avisos propios en vez del globito del navegador ═══════════════════════ */

test.describe("B8 · «Completá: …» aparece de verdad", () => {
  test("el alta lista todo lo que falta, marca los campos y lleva el foco al primero", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/nuevo");
    const antes = (await pacientes(page)).length;
    await main(page).getByRole("button", { name: "Crear paciente" }).click();
    await expect(main(page).getByRole("alert")).toContainText("Completá: Nombre legal, Apellidos, Cédula / DNI, Fecha de nacimiento, Sexo, Género, Teléfono móvil, Email.");
    await expect(main(page).getByLabel("Nombre legal *")).toBeFocused();
    await expect(main(page).getByLabel("Nombre legal *")).toHaveAttribute("aria-invalid", "true");
    await expect(main(page).getByLabel("Cédula / DNI *")).toHaveAttribute("aria-invalid", "true");
    expect(page.url()).toContain("/app/pacientes/nuevo");
    expect((await pacientes(page)).length).toBe(antes);
  });

  test("solo espacios en la CI y un correo sin dominio tampoco pasan", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/nuevo");
    await completarObligatorios(main(page), { nombre: "Ana", apellido: "Prueba", ci: "   ", tel: "0981 000 444", email: "ana@correo" });
    await main(page).getByRole("button", { name: "Crear paciente" }).click();
    await expect(main(page).getByRole("alert")).toContainText("Completá: Cédula / DNI.");
    await expect(main(page).getByRole("alert")).toContainText("Revisá: Email.");
    await expect(main(page).getByLabel("Email *")).toHaveAttribute("aria-invalid", "true");
    await expect(main(page).getByLabel("Cédula / DNI *")).toBeFocused();
  });

  test("al dar una cita pasa lo mismo en el popup de paciente nuevo", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    const { ficha } = await abrirCrearPaciente(page);
    const antes = (await pacientes(page)).length;
    await ficha.getByLabel("Nombre legal *").fill("Sin");
    await ficha.getByLabel("Apellidos *").fill("Cédula");
    await ficha.getByRole("button", { name: "Crear paciente" }).click();
    await expect(ficha.getByRole("alert")).toContainText("Completá: Cédula / DNI, Fecha de nacimiento, Sexo, Género, Teléfono móvil, Email.");
    await expect(ficha.getByLabel("Cédula / DNI *")).toBeFocused();
    expect((await pacientes(page)).length).toBe(antes);
  });
});

