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

