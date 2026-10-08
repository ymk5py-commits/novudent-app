import type { Page } from "@playwright/test";
import { test, expect, entrarDemo, leerDB, sinScrollHorizontal, USUARIOS_DEMO } from "./soporte";
import { sumarDias, tituloFecha } from "../lib/tareas";

/* Tareas de gestión con paridad Dentalink: bandeja por día, "Finalizar ▾ →
   Volver a contactar en…", personalizadas desde la ficha y roles v3.

   El seed arma las citas alrededor del lunes de la semana en curso, así que lo
   que "vence hoy" cambia según el día en que corre la prueba. Cada prueba arma
   su propio caso en el estado local de la demo y no depende del día. */

const main = (page: Page) => page.locator("main");
const titulo = (page: Page) => page.getByRole("heading", { level: 1 });
/** El selector de fecha de la bandeja (exacto: el de "Nueva fecha" también dice fecha). */
const fechaBandeja = (page: Page) => page.getByLabel("Fecha", { exact: true });
/** Una fila de la bandeja por su nombre accesible: "Tipo — Paciente — estado". */
const fila = (page: Page, tipo: string, paciente: string, estado: "pendiente" | "completada") =>
  main(page).getByRole("button", { name: new RegExp(`^${tipo} — ${paciente} — ${estado}`) });

/** Cambia el estado local de la demo (lo que la app usa con Firebase cortado). */
async function conDemo(page: Page, cambiar: (db: any, hoy: string) => void) {
  await page.evaluate(`(() => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4"));
    const d = new Date();
    const hoy = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    (${cambiar.toString()})(db, hoy);
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  })()`);
}

test.describe("Bandeja de tareas (administrador)", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page); });

  test("navegar de fecha: Anterior, Siguiente, el calendario y Hoy", async ({ page }) => {
    await conDemo(page, (db, hoy) => {
      const d = new Date(`${hoy}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 2);
      db.mgmtTasks.push({
        id: "mt_e2e_nav", clinicId: "cl_demo", type: "personalizada", patientId: "p3",
        title: "Llamar por el blanqueamiento", status: "pendiente", dueDate: d.toISOString().slice(0, 10), createdAt: new Date().toISOString(),
      });
    });
    await page.goto("/app/tareas");
    const hoy = await fechaBandeja(page).inputValue();
    await expect(titulo(page)).toHaveText(`Tareas - ${tituloFecha(hoy, hoy)}`);
    const atrasadas = (await main(page).getByRole("tab", { name: /Tareas atrasadas/ }).textContent()) ?? "";
    const personalizada = fila(page, "Personalizada", "Camila Ortega", "pendiente");
    await expect(personalizada).toHaveCount(0);

    await main(page).getByRole("button", { name: "Siguiente" }).click();
    await expect(fechaBandeja(page)).toHaveValue(sumarDias(hoy, 1));
    await expect(titulo(page)).toHaveText(`Tareas - ${tituloFecha(sumarDias(hoy, 1), hoy)}`);
    await expect(personalizada).toHaveCount(0);

    await main(page).getByRole("button", { name: "Siguiente" }).click();
    await expect(fechaBandeja(page)).toHaveValue(sumarDias(hoy, 2));
    await expect(personalizada).toBeVisible();
    // El contador de atrasadas se mide contra hoy: navegar no lo cambia.
    await expect(main(page).getByRole("tab", { name: /Tareas atrasadas/ })).toHaveText(atrasadas);

    await main(page).getByRole("button", { name: "Anterior" }).click();
    await main(page).getByRole("button", { name: "Anterior" }).click();
    await main(page).getByRole("button", { name: "Anterior" }).click();
    await expect(fechaBandeja(page)).toHaveValue(sumarDias(hoy, -1));

    await fechaBandeja(page).fill(sumarDias(hoy, 2));
    await expect(titulo(page)).toHaveText(`Tareas - ${tituloFecha(sumarDias(hoy, 2), hoy)}`);
    await expect(personalizada).toBeVisible();

    await main(page).getByRole("button", { name: "Hoy", exact: true }).click();
    await expect(fechaBandeja(page)).toHaveValue(hoy);
    await expect(personalizada).toHaveCount(0);
    await sinScrollHorizontal(page);
  });

  test("Volver a contactar en una fecha elegida: la tarea se va de hoy y aparece ese día", async ({ page }) => {
    // Juan Ríos faltó hoy a su única cita: la tarea de cita (re-agenda) vence hoy.
    await conDemo(page, (db) => {
      const ini = new Date(); ini.setHours(10, 0, 0, 0);
      const fin = new Date(ini); fin.setMinutes(40);
      db.appointments = db.appointments.filter((a: { patientId: string }) => a.patientId !== "p2");
      db.appointments.push({
        id: "a_e2e_ausente", clinicId: "cl_demo", patientId: "p2", dentistId: "u2", title: "Consulta E2E",
        start: ini.toISOString(), end: fin.toISOString(), status: "ausente", amount: 0, discount: 0,
      });
    });
    await page.goto("/app/tareas");
    const hoy = await fechaBandeja(page).inputValue();
    const nueva = sumarDias(hoy, 10);

    await fila(page, "Cita", "Juan Ríos", "pendiente").click();
    const panel = main(page).getByRole("heading", { name: "Juan Ríos" });
    await expect(panel).toBeVisible();
    await main(page).getByRole("button", { name: /^Finalizar/ }).click();
    await page.getByRole("menuitem", { name: /Volver a contactar en/ }).click();
    await page.getByRole("radio", { name: "Elegí una fecha" }).check();
    await page.getByLabel("Nueva fecha").fill(nueva);
    await page.getByRole("button", { name: "Finalizar y generar nueva tarea" }).click();

    // Hoy queda con su ✓ (como en Dentalink) y ya no está pendiente.
    await expect(fila(page, "Cita", "Juan Ríos", "pendiente")).toHaveCount(0);
    await expect(fila(page, "Cita", "Juan Ríos", "completada")).toBeVisible();
    await expect(main(page).getByRole("status").filter({ hasText: "Tarea completada" })).toContainText("Paciente será contactado nuevamente");

    // Ese día vuelve a estar pendiente.
    await fechaBandeja(page).fill(nueva);
    await expect(titulo(page)).toHaveText(`Tareas - ${tituloFecha(nueva, hoy)}`);
    await expect(fila(page, "Cita", "Juan Ríos", "pendiente")).toBeVisible();

    // Lo que se guarda es el override de la derivada, con la gestión.
    const db = await leerDB(page);
    const ov = db.mgmtTasks.find((t: { derivedKey?: string }) => t.derivedKey === "cita:a_e2e_ausente");
    expect(ov).toMatchObject({ patientId: "p2", snoozedUntil: nueva, status: "pendiente" });
    expect(ov.gestiones.at(-1)).toMatchObject({ fecha: hoy, accion: "recontactar", hasta: nueva, by: "u1", instancia: "ausente:a_e2e_ausente" });

    // Y sobrevive a la recarga.
    await page.reload();
    await expect(fila(page, "Cita", "Juan Ríos", "completada")).toBeVisible();
    await expect(fila(page, "Cita", "Juan Ríos", "pendiente")).toHaveCount(0);
    await sinScrollHorizontal(page);
  });

  test("una tarea personalizada creada desde la ficha del paciente", async ({ page }) => {
    await page.goto("/app/pacientes/p1");
    await main(page).getByRole("button", { name: "Datos personales", exact: true }).click();
    await main(page).getByRole("button", { name: "Tareas de gestión" }).click();
    await expect(main(page).getByRole("heading", { name: "Tareas de gestión" })).toBeVisible();

    await main(page).getByRole("button", { name: "Nueva tarea personalizada" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Nueva tarea personalizada");
    const hoy = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
    const fecha = sumarDias(hoy, 5);
    await dialogo.getByLabel(/Detalle/).fill("Agendar cita para evaluación de prótesis");
    await dialogo.getByLabel(/Fecha/).fill(fecha);
    await dialogo.getByLabel("Presupuesto de referencia").selectOption("g1");
    await dialogo.getByRole("button", { name: "Crear tarea" }).click();
    await expect(dialogo).toBeHidden();

    const lista = main(page).getByRole("list", { name: "Tareas del paciente" });
    const suya = lista.getByRole("listitem").filter({ hasText: "Agendar cita para evaluación de prótesis" });
    await expect(suya).toBeVisible();
    const db = await leerDB(page);
    expect(db.mgmtTasks.find((t: { title: string }) => t.title === "Agendar cita para evaluación de prótesis"))
      .toMatchObject({ type: "personalizada", patientId: "p1", dueDate: fecha, budgetId: "g1", status: "pendiente", createdBy: "u1" });

    // "Ver en la bandeja" lleva a ese día, con la tarea abierta en el panel.
    await suya.getByRole("link", { name: /Ver en la bandeja/ }).click();
    await page.waitForURL(/\/app\/tareas\?fecha=/);
    await expect(fechaBandeja(page)).toHaveValue(fecha);
    await expect(fila(page, "Personalizada", "María González", "pendiente")).toBeVisible();
    await expect(main(page).getByRole("heading", { name: "María González" })).toBeVisible();
    await expect(main(page)).toContainText("Plan #g1");
    await sinScrollHorizontal(page);
  });

  test("estadísticas y plazos: solo del administrador, y los plazos se guardan", async ({ page }) => {
    await page.goto("/app/tareas");
    await main(page).getByRole("tab", { name: "Estadísticas" }).click();
    await expect(titulo(page)).toHaveText("Estadísticas");
    for (const c of ["Deudas cobradas", "Presupuestos capturados", "Controles agendados", "Citas re-agendadas"]) await expect(main(page)).toContainText(c);
    await main(page).getByRole("tab", { name: "Plazos de las tareas" }).click();
    await main(page).getByRole("radiogroup", { name: "Plazo de la tarea de cita" }).getByRole("radio", { name: "1 día" }).click();
    await expect(main(page).getByRole("alert")).toContainText("hay cambios no guardados");
    await main(page).getByRole("button", { name: "Guardar" }).click();
    await expect.poll(async () => (await leerDB(page)).clinics[0].config.taskDeadlines?.cita).toEqual({ kind: "dias", n: 1 });
    await sinScrollHorizontal(page);
  });
});

test.describe("Roles v3 en la bandeja", () => {
  test("la administración ve la cobranza de Marco Giménez (el caso existe)", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.admin);
    await page.goto("/app/tareas");
    await main(page).getByRole("tab", { name: /Tareas atrasadas/ }).click();
    await fila(page, "Cobranza", "Marco Giménez", "pendiente").click();
    await expect(main(page)).toContainText("Paciente tiene deuda");
  });

  test("la dentista no ve cobranza, cheques, deudas, montos ni teléfonos", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    // Marco Giménez es paciente de la Dra. Sofía y debe su ortodoncia: la cobranza existe.
    const db = await leerDB(page);
    expect(db.budgets.find((b: { id: string }) => b.id === "g2")).toMatchObject({ patientId: "p6", dentistId: "u2", status: "aceptado" });

    await page.goto("/app/tareas");
    // Ni estadísticas ni configuración.
    await expect(main(page).getByRole("tablist", { name: "Secciones de tareas" })).toHaveCount(0);
    for (const lista of [/Tareas del día/, /Tareas atrasadas/]) {
      await main(page).getByRole("tab", { name: lista }).click();
      await expect(main(page).getByRole("button", { name: /^(Cobranza|Cheque) —/ })).toHaveCount(0);
      await expect(main(page)).not.toContainText(/Gs\.?\s?\d/);
    }
    await main(page).getByRole("button", { name: /Filtrar por/ }).click();
    await expect(page.getByRole("menuitem", { name: "Cobranza" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Cheque" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Sí ve la tarea personalizada de su paciente, sin deuda ni datos personales.
    await main(page).getByRole("tab", { name: /Tareas del día/ }).click();
    await fila(page, "Personalizada", "Marco Giménez", "pendiente").click();
    await expect(main(page).getByRole("heading", { name: "Marco Giménez" })).toBeVisible();
    await expect(main(page)).not.toContainText("Paciente tiene deuda");
    await expect(main(page)).not.toContainText("986 666 666");
    await expect(main(page).getByRole("tab", { name: "Comentarios" })).toHaveCount(0);
    await main(page).getByRole("tab", { name: "Presupuestos" }).click();
    await expect(main(page)).toContainText("Plan #g2");
    await expect(main(page)).not.toContainText(/Gs\.?\s?\d/);

    // En la ficha, las tareas de gestión van en la ficha clínica y tampoco traen la cobranza.
    await page.goto("/app/pacientes/p6");
    await main(page).getByRole("button", { name: "Tareas de gestión" }).click();
    await expect(main(page).getByRole("list", { name: "Tareas del paciente" })).toBeVisible();
    await expect(main(page).getByRole("list", { name: "Tareas del paciente" })).not.toContainText(/Cobranza|Cheque|Saldo pendiente/i);
  });
});
