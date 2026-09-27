import type { Page } from "@playwright/test";
import { test, expect, entrarDemo, leerDB } from "./soporte";

/** Un campo de un diálogo por el texto de su etiqueta (las etiquetas envuelven al control). */
const campo = (page: Page, etiqueta: RegExp, control = "input, select, textarea") =>
  page.getByRole("dialog").locator("label").filter({ hasText: etiqueta }).locator(control).first();

test.beforeEach(async ({ page }) => { await entrarDemo(page); });

test("agenda: dar una cita y que siga ahí al recargar", async ({ page }) => {
  await page.goto("/app/agenda");
  await page.getByRole("button", { name: "Dar cita" }).first().click();
  const dialogo = page.getByRole("dialog", { name: "Dar cita" });
  await dialogo.getByRole("combobox", { name: "Paciente" }).fill("Ríos");
  await dialogo.getByRole("option", { name: /JUAN RÍOS/ }).click();
  await dialogo.getByLabel("Tipo de consulta").selectOption({ label: "Ortodoncia" });
  /* El primer horario libre depende de qué día y a qué hora corre la prueba: se toma el
     primero que ofrezca la grilla, sea hoy o más adelante. */
  await dialogo.locator("button[aria-pressed]").first().click();
  await dialogo.getByRole("button", { name: "Crear cita" }).click();
  await expect(dialogo).toBeHidden();
  const nueva = (db: { appointments: { patientId: string; title: string; status: string }[] }) =>
    db.appointments.find((a) => a.patientId === "p2" && a.title === "Ortodoncia");
  expect(nueva(await leerDB(page))).toMatchObject({ status: "pendiente" });
  await page.reload();
  expect(nueva(await leerDB(page))).toBeTruthy();
});

test("pacientes: dar de alta un paciente y encontrarlo por su CI", async ({ page }) => {
  const ci = String(9_000_000 + Math.floor(Math.random() * 999_999));
  await page.goto("/app/pacientes");
  await page.getByRole("button", { name: "Nuevo paciente" }).click();
  const dialogo = page.getByRole("dialog");
  await campo(page, /^nombre/i).fill("Prueba");
  await campo(page, /^apellido/i).fill("Automática");
  await campo(page, /^c[eé]dula/i).fill(ci);
  await campo(page, /tel[eé]fono/i).fill("+595 981 000 000");
  await dialogo.getByRole("button", { name: "Crear paciente" }).click();
  await expect(dialogo).toBeHidden();
  await page.goto("/app/pacientes");
  await page.getByPlaceholder(/Buscar por nombre, CI/).fill(ci);
  await expect(page.locator("main").getByRole("row", { name: /Abrir la ficha de Prueba Automática/ })).toBeVisible();
});

test("presupuestos: presentar el borrador y aceptarlo", async ({ page }) => {
  await page.goto("/app/presupuestos");
  // en el HTML dicen "borrador (1)": la mayúscula la pone el CSS (capitalize)
  const filtro = (n: string) => page.locator("main").getByRole("button", { name: new RegExp(`^${n}\\s*\\(\\d+\\)`, "i") });
  await expect(filtro("Borrador")).toHaveText(/Borrador\s*\(1\)/i);
  await page.locator("main").getByRole("button", { name: "Presentar" }).first().click();
  await expect(filtro("Borrador")).toHaveText(/Borrador\s*\(0\)/i);
  await expect(filtro("Presentado")).toHaveText(/Presentado\s*\(2\)/i);
  await page.locator("main").getByRole("button", { name: "Marcar aceptado" }).first().click();
  await expect(filtro("Aceptado")).toHaveText(/Aceptado\s*\(2\)/i);
  await page.reload();
  await expect(filtro("Aceptado")).toHaveText(/Aceptado\s*\(2\)/i);
});

test("caja: registrar un pago y verlo en los movimientos", async ({ page }) => {
  await page.goto("/app/caja");
  await page.locator("main").getByRole("button", { name: "Registrar pago" }).first().click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("Registrar pago");
  await campo(page, /monto/i).fill("150000");
  await campo(page, /m[eé]todo/i, "select").selectOption({ label: "Efectivo" });
  await campo(page, /concepto/i).fill("Pago E2E");
  await dialogo.getByRole("button", { name: "Registrar" }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.locator("main").getByText("Pago E2E").first()).toBeVisible();
});

test("caja: el cierre muestra el arqueo y deja la caja cerrada", async ({ page }) => {
  await page.goto("/app/caja");
  await page.locator("main").getByRole("button", { name: "Cerrar caja" }).first().click();
  const dialogo = page.getByRole("dialog");
  for (const t of ["Saldo inicial", "Ingresos en efectivo", "Egresos", "Efectivo esperado"]) await expect(dialogo).toContainText(t);
  await dialogo.getByRole("button", { name: "Cerrar caja" }).click();
  await expect(page.locator("main").getByText("No tenés una caja abierta")).toBeVisible();
});

test("ficha: se recorren todas las pestañas sin errores", async ({ page }) => {
  await page.goto("/app/pacientes/p1");
  await expect(page.locator("main")).toContainText("María González");
  for (const pestaña of ["Datos personales", "Planes de tratamiento", "Facturación y pagos", "Ficha clínica"]) {
    await page.locator("main").getByRole("button", { name: pestaña, exact: true }).click();
  }
  for (const pestaña of ["Evoluciones", "Antecedentes médicos", "Odontograma", "Periodoncia", "Historial", "Radiografías", "Recetas", "Resumen"]) {
    await page.locator("main").getByRole("button", { name: pestaña, exact: true }).click();
  }
});
