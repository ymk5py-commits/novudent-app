import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { test, expect, entrarDemo, leerDB, sinScrollHorizontal, USUARIOS_DEMO } from "./soporte";

/* Pacientes › Análisis de estudios específicos (pedido de Camila, 8-oct-2026): las cifras «Con próxima cita» y «Sin próxima cita» se tocan
   y dejan en la tabla solo esos pacientes; la tabla muestra todos sus datos; y a quien hay que dejar de perseguir se lo quita de la lista
   con un motivo (y vuelve solo si se atiende de nuevo y no se le agenda otra cita).

   Cada prueba arma su caso en el estado local de la demo —con fechas relativas a hoy— y no depende del día en que corre. */

type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** El caso (ocho pacientes que se ven; el noveno está deshabilitado):
 *   p1 María González   atendida hace 10 días (estética), plan presentado, sin cita            → EN LA LISTA («hace 10 días»)
 *   p2 Juan Ríos        atendido hace 3 días y con una cita confirmada dentro de 5 días        → con próxima cita
 *   p3 Camila Ortega    atendida hace 40 días y su único plan está completado                  → plan finalizado
 *   p4 Andrés Mejía     solo una cita «No asiste» hace 6 días                                  → sin asistencias
 *   p5 Lucía Ferreira   sin citas y con un plan en borrador de hace 12 días                    → EN LA LISTA (desde el plan)
 *   p6 Marco Giménez    atendido hace 20 días y quitado a mano hace 5 días («No quiere continuar») → quitado
 *   p7 Rosa Benítez     atendida hace 100 días (rehabilitación oral), sin plan                 → EN LA LISTA («hace 100 días»)
 *   p9 Pedro Otro       atendido hace 8 días por el Dr. Martínez (u4)                          → EN LA LISTA (el dentista de la Dra. Sofía no lo ve)
 *   p8 Diego Deshabilitado  atendido hace 15 días pero deshabilitado                           → no aparece
 *  Administrador: 8 en la tabla, 1 con próxima cita, 4 sin próxima cita, 1 quitado. */
async function conCaso(page: Page, ir = true) {
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
    const en = (dias: number, h = 10, m = 0) => { const d = new Date(); d.setDate(d.getDate() + dias); d.setHours(h, m, 0, 0); return d.toISOString(); };
    const paciente = (id: string, code: number, firstName: string, lastName: string, extra: Record<string, unknown> = {}) => ({
      id, clinicId: "cl_demo", code, firstName, lastName, document: `${code}.000.000`, phone: `+595 98${code} ${code}${code}${code} ${code}${code}${code}`,
      forms: [], historyUpdatePending: false, emr: [], ...extra,
    });
    const cita = (id: string, patientId: string, start: string, status: string, extra: Record<string, unknown> = {}) => ({
      id, clinicId: "cl_demo", patientId, dentistId: "u2", title: "Consulta", start, end: start, status, amount: 0, discount: 0, ...extra,
    });
    const plan = (id: string, patientId: string, createdAt: string, status: string, name: string, extra: Record<string, unknown> = {}) => ({
      id, clinicId: "cl_demo", patientId, dentistId: "u2", createdAt, status, name, history: [],
      items: [{ id: `${id}_i1`, cpt: "D0120", description: "Evaluación", price: 100000, status: status === "completado" ? "realizado" : "pendiente" }], ...extra,
    });
    const porId = (id: string) => db.patients.find((p: Fila) => p.id === id);
    porId("p1").email = "maria@example.com"; // el resto de la demo ya trae los suyos
    porId("p2").email = "";
    porId("p6").seguimiento = { cerradoAt: en(-5, 11), motivo: "No quiere continuar", por: "Laura Recepción" };
    db.patients.push(
      paciente("p7", 7, "Rosa", "Benítez", { email: "rosa@example.com" }),
      paciente("p8", 8, "Diego", "Deshabilitado", { disabled: true }),
      paciente("p9", 9, "Pedro", "Otro"),
    );
    db.appointments = [
      cita("c1", "p1", en(-10), "completada", { tipoConsulta: "estetica" }),
      cita("c2", "p2", en(-3), "completada"), cita("c3", "p2", en(5, 10, 30), "confirmada"),
      cita("c4", "p3", en(-40), "completada"),
      cita("c5", "p4", en(-6), "ausente"),
      cita("c6", "p6", en(-20), "completada"),
      cita("c7", "p7", en(-100), "completada", { tipoConsulta: "rehabilitacion" }),
      cita("c8", "p8", en(-15), "completada"),
      cita("c9", "p9", en(-8), "completada", { dentistId: "u4" }),
    ];
    db.budgets = [
      plan("g1", "p1", en(-30), "presentado", "Plan dental integral"),
      plan("g3", "p3", en(-60), "completado", "Blanqueamiento dental"),
      plan("g5", "p5", en(-12, 9), "borrador", "Rehabilitación superior"),
      plan("g9", "p9", en(-8), "anulado", "Presupuesto descartado", { dentistId: "u4" }),
    ];
    db.payments = [];
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  });
  if (ir) await abrirAnalisis(page);
}

const main = (page: Page) => page.locator("main");

async function abrirAnalisis(page: Page) {
  await page.goto("/app/pacientes");
  await main(page).getByRole("button", { name: "Análisis de estudios específicos" }).click();
  await expect(main(page).getByRole("group", { name: "Filtrar pacientes" })).toBeVisible();
}

/** Las tres cifras, que son botones. */
const cifra = (page: Page, cual: "todos" | "con" | "sin") =>
  main(page).getByRole("group", { name: "Filtrar pacientes" }).getByRole("button", { name: { todos: /^\d+ Pacientes en /, con: /Con próxima cita/, sin: /Sin próxima cita/ }[cual] });

/** El renglón de un paciente (por su nombre, que es el único enlace que se llama exactamente así). */
const renglon = (page: Page, nombre: string): Locator =>
  main(page).locator("tbody tr").filter({ has: page.getByRole("link", { name: nombre, exact: true }) });

const renglones = (page: Page) => main(page).locator("tbody tr");

/** Los nombres de la tabla, ordenados, para comparar sin depender del orden. */
const nombresEnTabla = async (page: Page) => (await main(page).locator("tbody tr td:first-child a").allInnerTexts()).map((t) => t.trim()).sort();

/** La celda de un renglón bajo el título de columna indicado. */
async function celda(page: Page, fila: Locator, columna: string): Promise<Locator> {
  const titulos = (await main(page).locator("thead th").allTextContents()).map((t) => t.trim());
  const i = titulos.indexOf(columna);
  expect(i, `no hay una columna «${columna}» entre ${titulos.join(" | ")}`).toBeGreaterThanOrEqual(0);
  return fila.getByRole("cell").nth(i);
}

/** Cambia la ficha de un paciente en el estado local y recarga la tabla. */
async function cambiarFicha(page: Page, id: string, cambios: Record<string, unknown>) {
  await page.evaluate(([pid, c]) => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
    Object.assign(db.patients.find((p: { id: string }) => p.id === pid), c);
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  }, [id, cambios] as const);
}

test.describe("las cifras filtran la tabla", () => {
  test.beforeEach(async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.admin);
    await conCaso(page);
  });

  test("las tres cifras son botones; sin tocar ninguna se ve a todos, como siempre", async ({ page }) => {
    await expect(cifra(page, "todos")).toContainText("8");
    await expect(cifra(page, "con")).toContainText("1");
    await expect(cifra(page, "sin")).toContainText("4");
    await expect(cifra(page, "todos")).toHaveAttribute("aria-pressed", "true");
    await expect(cifra(page, "con")).toHaveAttribute("aria-pressed", "false");
    await expect(cifra(page, "sin")).toHaveAttribute("aria-pressed", "false");
    await expect(main(page)).toContainText("Pacientes en vista general");
    await expect(renglones(page)).toHaveCount(8);
    await expect(main(page).getByText(/Mostrando \d+ de \d+/)).toHaveCount(0);
    await expect(main(page).getByRole("button", { name: "Quitar filtro" })).toHaveCount(0);
    // El deshabilitado no está.
    await expect(renglon(page, "Diego Deshabilitado")).toHaveCount(0);
  });

  test("«Sin próxima cita» deja solo a quienes hay que volver a llamar", async ({ page }) => {
    await cifra(page, "sin").click();
    await expect(cifra(page, "sin")).toHaveAttribute("aria-pressed", "true");
    await expect(cifra(page, "todos")).toHaveAttribute("aria-pressed", "false");
    await expect(main(page).getByText("Mostrando 4 de 8")).toBeVisible();
    expect(await nombresEnTabla(page)).toEqual(["Lucía Ferreira", "María González", "Pedro Otro", "Rosa Benítez"]);
    // Quedan afuera: con cita (Juan), plan terminado (Camila), sin asistencias (Andrés) y quitado (Marco).
    for (const afuera of ["Juan Ríos", "Camila Ortega", "Andrés Mejía", "Marco Giménez"]) await expect(renglon(page, afuera)).toHaveCount(0);
  });

  test("«Con próxima cita» deja solo a quienes ya tienen una cita que viene", async ({ page }) => {
    await cifra(page, "con").click();
    await expect(main(page).getByText("Mostrando 1 de 8")).toBeVisible();
    expect(await nombresEnTabla(page)).toEqual(["Juan Ríos"]);
    // La fecha de la cita lleva la hora (10:30) y el título «Sin cita desde» no aparece: no tiene sentido entre quienes ya tienen cita.
    await expect(await celda(page, renglon(page, "Juan Ríos"), "Próxima cita")).toContainText("10:30");
    await expect(main(page).locator("thead th", { hasText: "Sin cita desde" })).toHaveCount(0);
  });

  test("«Quitar filtro» y volver a tocar la cifra devuelven a todos", async ({ page }) => {
    await cifra(page, "sin").click();
    await main(page).getByRole("button", { name: "Quitar filtro" }).click();
    await expect(renglones(page)).toHaveCount(8);
    await expect(cifra(page, "todos")).toHaveAttribute("aria-pressed", "true");

    await cifra(page, "con").click();
    await expect(renglones(page)).toHaveCount(1);
    await cifra(page, "con").click(); // tocar de nuevo la que está activa la apaga
    await expect(renglones(page)).toHaveCount(8);

    await cifra(page, "sin").click();
    await cifra(page, "todos").click(); // y la primera cifra también es «todos»
    await expect(renglones(page)).toHaveCount(8);
    await expect(main(page).getByText(/Mostrando \d+ de \d+/)).toHaveCount(0);
  });

  test("las cifras se recuentan con cada vista por tipo de consulta", async ({ page }) => {
    const grupo = main(page).getByRole("group", { name: "Tipo de estudio" });
    await grupo.getByRole("button", { name: "Rehabilitación oral" }).click();
    await expect(cifra(page, "todos")).toContainText("1");
    await expect(main(page)).toContainText("Pacientes en rehabilitación oral");
    await cifra(page, "sin").click();
    expect(await nombresEnTabla(page)).toEqual(["Rosa Benítez"]);

    // El filtro sigue activo al cambiar de vista; en estética solo está María.
    await grupo.getByRole("button", { name: "Odontología estética" }).click();
    await expect(cifra(page, "sin")).toHaveAttribute("aria-pressed", "true");
    expect(await nombresEnTabla(page)).toEqual(["María González"]);

    // Vista sin pacientes con ese filtro: el aviso explica y «Quitar filtro» sigue ahí.
    await grupo.getByRole("button", { name: "Vista general" }).click();
    await cifra(page, "con").click();
    expect(await nombresEnTabla(page)).toEqual(["Juan Ríos"]);
  });
});

test.describe("todos los datos de cada paciente", () => {
  test.beforeEach(async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.admin);
    await conCaso(page);
  });

  test("teléfono, correo, última cita con su estado, plan y desde cuándo están sin cita", async ({ page }) => {
    await cifra(page, "sin").click();
    const maria = renglon(page, "María González");
    await expect(await celda(page, maria, "Paciente")).toContainText("CI 3.456.789");
    await expect(await celda(page, maria, "Contacto")).toContainText("+595 981 111 111");
    await expect(await celda(page, maria, "Contacto")).toContainText("maria@example.com");
    await expect(await celda(page, maria, "Profesional")).toContainText("Dra. Sofía Benítez");
    await expect(await celda(page, maria, "Última cita")).toContainText("Atendido");
    await expect(await celda(page, maria, "Próxima cita")).toContainText("Sin cita");
    await expect(await celda(page, maria, "Plan de tratamiento")).toContainText("Plan dental integral");
    await expect(await celda(page, maria, "Plan de tratamiento")).toContainText("Presentado");
    await expect(await celda(page, maria, "Sin cita desde")).toContainText("hace 10 días");
    await expect(await celda(page, maria, "Citas")).toHaveText("1");
    await expect(await celda(page, maria, "Planes")).toHaveText("1");

    // Quien nunca vino pero tiene un plan en borrador: cuenta desde que se armó el plan, y no tiene última cita.
    const lucia = renglon(page, "Lucía Ferreira");
    await expect(await celda(page, lucia, "Sin cita desde")).toContainText("hace 12 días");
    await expect(await celda(page, lucia, "Sin cita desde")).toContainText("plan del");
    await expect(await celda(page, lucia, "Plan de tratamiento")).toContainText("Rehabilitación superior");
    await expect(await celda(page, lucia, "Plan de tratamiento")).toContainText("Borrador");
    await expect(await celda(page, lucia, "Última cita")).toHaveText("—");
    await expect(await celda(page, lucia, "Contacto")).toContainText("+595 985 555 555");
    await expect(await celda(page, lucia, "Contacto")).not.toContainText("@"); // la demo no le cargó correo

    await expect(await celda(page, renglon(page, "Rosa Benítez"), "Sin cita desde")).toContainText("hace 100 días");
  });

  test("en la vista de todos, cada paciente dice por qué está o no en la lista", async ({ page }) => {
    const seguimiento = async (nombre: string) => celda(page, renglon(page, nombre), "Seguimiento");
    await expect(await seguimiento("María González")).toContainText("A recontactar");
    await expect(await seguimiento("María González")).toContainText("hace 10 días"); // viendo a todos, desde cuándo va en la misma celda
    await expect(main(page).locator("thead th", { hasText: "Sin cita desde" })).toHaveCount(0);
    await expect(await seguimiento("Juan Ríos")).toContainText("Con próxima cita");
    await expect(await seguimiento("Camila Ortega")).toContainText("Plan finalizado");
    await expect(await seguimiento("Andrés Mejía")).toContainText("Sin asistencias");
    await expect(await seguimiento("Marco Giménez")).toContainText("Quitado de la lista");
    await expect(await seguimiento("Marco Giménez")).toContainText("No quiere continuar");
    // La última cita de quien faltó es «No asiste».
    await expect(await celda(page, renglon(page, "Andrés Mejía"), "Última cita")).toContainText("No asiste");
    // Al filtrar, esa columna (siempre igual) se va.
    await cifra(page, "sin").click();
    await expect(main(page).locator("thead th", { hasText: "Seguimiento" })).toHaveCount(0);
  });

  test("«Ver ficha» abre la ficha del paciente", async ({ page }) => {
    await cifra(page, "sin").click();
    await renglon(page, "María González").getByRole("link", { name: "Ver ficha de María González" }).click();
    await page.waitForURL(/\/app\/pacientes\/p1/);
  });

  test("«WhatsApp» abre el chat con el número del paciente, en otra pestaña", async ({ page }) => {
    await cifra(page, "sin").click();
    const wa = renglon(page, "María González").getByRole("link", { name: "WhatsApp a María González" });
    await expect(wa).toHaveAttribute("href", "https://wa.me/595981111111");
    await expect(wa).toHaveAttribute("target", "_blank");
    await expect(wa).toHaveAttribute("rel", /noopener/);
    await expect(wa).toHaveAttribute("rel", /noreferrer/);
  });

  test("sin teléfono cargado, el botón de WhatsApp no aparece", async ({ page }) => {
    await cambiarFicha(page, "p1", { phone: "" });
    await abrirAnalisis(page);
    await cifra(page, "sin").click();
    await expect(renglon(page, "María González")).toBeVisible();
    await expect(renglon(page, "María González").getByRole("link", { name: /WhatsApp/ })).toHaveCount(0);
    await expect(renglon(page, "Lucía Ferreira").getByRole("link", { name: /WhatsApp/ })).toHaveCount(1);
  });

  test("lo que pasó hace un rato cuenta: quien se atendió recién y no tiene otra cita aparece «hoy»", async ({ page }) => {
    const palabra = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
      const d = new Date(Date.now() - 60_000); // hace un minuto: la cita ya empezó sin importar a qué hora se corra la prueba
      db.appointments.push({ id: "c_hoy", clinicId: "cl_demo", patientId: "p4", dentistId: "u2", title: "Consulta", start: d.toISOString(), end: d.toISOString(), status: "completada", amount: 0, discount: 0 });
      localStorage.setItem("novudent.db.v4", JSON.stringify(db));
      return d.getDate() === new Date().getDate() ? "hoy" : "ayer"; // en el primer minuto después de la medianoche, hace un minuto fue ayer
    });
    await abrirAnalisis(page);
    await cifra(page, "sin").click();
    await expect(await celda(page, renglon(page, "Andrés Mejía"), "Sin cita desde")).toContainText(palabra);
  });
});

test.describe("quitar de la lista", () => {
  test.beforeEach(async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.admin);
    await conCaso(page);
    await cifra(page, "sin").click();
  });

  const modal = (page: Page) => page.getByRole("dialog", { name: "Quitar de la lista" });
  const quitarDe = (page: Page, nombre: string) => renglon(page, nombre).getByRole("button", { name: `Quitar de la lista: ${nombre}` });
  const fichaGuardada = async (page: Page, id: string) => (await leerDB(page)).patients.find((p: Fila) => p.id === id);

  test("pide el motivo, lo guarda en la ficha y saca al paciente de la lista", async ({ page }) => {
    await quitarDe(page, "María González").click();
    await expect(modal(page)).toBeVisible();
    await expect(modal(page)).toContainText("María González");
    for (const m of ["Terminó su tratamiento", "Se atiende en otra clínica", "No quiere continuar", "No se lo puede ubicar", "Otro"]) {
      await expect(modal(page).getByRole("radio", { name: m, exact: true })).toBeVisible();
    }

    // Sin elegir un motivo no se quita.
    await modal(page).getByRole("button", { name: "Quitar de la lista" }).click();
    await expect(modal(page).getByRole("alert")).toHaveText("Elegí un motivo.");
    expect((await fichaGuardada(page, "p1")).seguimiento).toBeUndefined();

    await modal(page).getByRole("radio", { name: "Se atiende en otra clínica" }).check();
    await expect(modal(page).getByRole("alert")).toHaveCount(0); // elegir un motivo limpia el aviso
    const antes = Date.now();
    await modal(page).getByRole("button", { name: "Quitar de la lista" }).click();
    await expect(modal(page)).toHaveCount(0);

    // Sale de la lista, las cifras se actualizan y el aviso confirma.
    await expect(renglon(page, "María González")).toHaveCount(0);
    await expect(main(page).getByText("Mostrando 3 de 8")).toBeVisible();
    await expect(cifra(page, "sin")).toContainText("3");
    await expect(main(page).getByRole("status")).toContainText("Quitaste a María González de la lista");
    const guardada = await fichaGuardada(page, "p1");
    expect(guardada.seguimiento).toMatchObject({ motivo: "Se atiende en otra clínica", por: "Carlos Admin" });
    expect(Date.parse(guardada.seguimiento.cerradoAt)).toBeGreaterThanOrEqual(antes - 2_000);
    expect(Date.parse(guardada.seguimiento.cerradoAt)).toBeLessThanOrEqual(Date.now() + 2_000);
    // El resto de la ficha queda como estaba (se guarda entera).
    expect(guardada).toMatchObject({ firstName: "María", lastName: "González", phone: "+595 981 111 111" });
  });

  test("«Otro» pide el texto, y ese texto es el motivo", async ({ page }) => {
    await quitarDe(page, "Pedro Otro").click();
    await modal(page).getByRole("radio", { name: "Otro", exact: true }).check();
    await modal(page).getByRole("button", { name: "Quitar de la lista" }).click();
    await expect(modal(page).getByRole("alert")).toHaveText("Escribí el motivo.");
    await modal(page).getByLabel("¿Cuál es el motivo?").fill("   ");
    await modal(page).getByRole("button", { name: "Quitar de la lista" }).click();
    await expect(modal(page).getByRole("alert")).toHaveText("Escribí el motivo.");
    expect((await fichaGuardada(page, "p9")).seguimiento).toBeUndefined();

    await modal(page).getByLabel("¿Cuál es el motivo?").fill("Se mudó a Encarnación");
    await expect(modal(page).getByRole("alert")).toHaveCount(0);
    await modal(page).getByRole("button", { name: "Quitar de la lista" }).click();
    await expect(renglon(page, "Pedro Otro")).toHaveCount(0);
    expect((await fichaGuardada(page, "p9")).seguimiento).toMatchObject({ motivo: "Se mudó a Encarnación", por: "Carlos Admin" });
  });

  test("cancelar (o Escape) no cambia nada", async ({ page }) => {
    await quitarDe(page, "María González").click();
    await modal(page).getByRole("radio", { name: "No quiere continuar" }).check();
    await modal(page).getByRole("button", { name: "Cancelar" }).click();
    await expect(modal(page)).toHaveCount(0);
    await expect(renglon(page, "María González")).toBeVisible();
    expect((await fichaGuardada(page, "p1")).seguimiento).toBeUndefined();

    await quitarDe(page, "María González").click();
    // El diálogo escucha Escape cuando termina de montarse y se queda con el foco: se espera a eso (una persona no aprieta la tecla en 5 ms).
    await expect(modal(page).getByRole("button", { name: "Cerrar" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);
    await expect(renglon(page, "María González")).toBeVisible();
    expect((await fichaGuardada(page, "p1")).seguimiento).toBeUndefined();
  });

  test("«Ver quitados» lista a los quitados con su motivo, quién y cuándo; «Volver a incluir» los devuelve", async ({ page }) => {
    const verQuitados = main(page).getByRole("switch", { name: /Ver quitados/ });
    await expect(verQuitados).toHaveAccessibleName("Ver quitados (1)");
    await expect(verQuitados).toHaveAttribute("aria-checked", "false");

    // Se quita a María y ahora son dos.
    await quitarDe(page, "María González").click();
    await modal(page).getByRole("radio", { name: "No se lo puede ubicar" }).check();
    await modal(page).getByRole("button", { name: "Quitar de la lista" }).click();
    await expect(verQuitados).toHaveAccessibleName("Ver quitados (2)");

    await verQuitados.click();
    await expect(verQuitados).toHaveAttribute("aria-checked", "true");
    // Mientras se miran los quitados, ninguna cifra figura como activa.
    for (const c of ["todos", "con", "sin"] as const) await expect(cifra(page, c)).toHaveAttribute("aria-pressed", "false");
    await expect(main(page).getByRole("heading", { name: /Quitados de la lista/ })).toBeVisible();
    expect(await nombresEnTabla(page)).toEqual(["Marco Giménez", "María González"]);
    const marco = renglon(page, "Marco Giménez");
    await expect(await celda(page, marco, "Motivo")).toContainText("No quiere continuar");
    await expect(await celda(page, marco, "Quitado por")).toContainText("Laura Recepción");
    await expect(await celda(page, marco, "Quitado el")).not.toHaveText("—");
    await expect(await celda(page, renglon(page, "María González"), "Quitado por")).toContainText("Carlos Admin");
    await expect(await celda(page, renglon(page, "María González"), "Motivo")).toContainText("No se lo puede ubicar");

    await renglon(page, "Marco Giménez").getByRole("button", { name: "Volver a incluir: Marco Giménez" }).click();
    await expect(renglon(page, "Marco Giménez")).toHaveCount(0);
    await expect(main(page).getByRole("status")).toContainText("Marco Giménez volvió a la lista");
    await expect(verQuitados).toHaveAccessibleName("Ver quitados (1)");
    expect((await fichaGuardada(page, "p6")).seguimiento, "volver a incluir borra el registro de la ficha").toBeUndefined();
    expect("seguimiento" in (await fichaGuardada(page, "p6"))).toBe(false);

    // Marco atendido hace 20 días, sin cita: está de nuevo en «Sin próxima cita». Tocar la cifra desde los quitados la elige (no la apaga).
    await cifra(page, "sin").click();
    await expect(cifra(page, "sin")).toHaveAttribute("aria-pressed", "true");
    await expect(verQuitados).toHaveAttribute("aria-checked", "false");
    await expect(renglon(page, "Marco Giménez")).toBeVisible();
    await expect(await celda(page, renglon(page, "Marco Giménez"), "Sin cita desde")).toContainText("hace 20 días");
  });

  test("sin quitados, la vista lo dice y se vuelve con el mismo interruptor", async ({ page }) => {
    await cambiarFicha(page, "p6", { seguimiento: undefined });
    await abrirAnalisis(page);
    const verQuitados = main(page).getByRole("switch", { name: /Ver quitados/ });
    await expect(verQuitados).toHaveAccessibleName("Ver quitados (0)");
    await verQuitados.click();
    await expect(main(page).getByText("Nadie fue quitado de la lista")).toBeVisible();
    await verQuitados.click();
    await expect(main(page).getByRole("heading", { name: "Vista general" })).toBeVisible();
    await expect(renglones(page)).toHaveCount(8);
  });

  test("si el paciente vuelve a atenderse después de que lo quitaron y no tiene otra cita, vuelve solo a la lista", async ({ page }) => {
    // Marco (p6) fue quitado hace 5 días. Hoy lo atienden… pero la cita queda para ayer, después de la quita.
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
      const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(15, 0, 0, 0);
      db.appointments.push({ id: "c_vuelve", clinicId: "cl_demo", patientId: "p6", dentistId: "u2", title: "Consulta", start: d.toISOString(), end: d.toISOString(), status: "completada", amount: 0, discount: 0 });
      localStorage.setItem("novudent.db.v4", JSON.stringify(db));
    });
    await abrirAnalisis(page);
    await cifra(page, "sin").click();
    await expect(renglon(page, "Marco Giménez")).toBeVisible();
    await expect(await celda(page, renglon(page, "Marco Giménez"), "Sin cita desde")).toContainText("ayer");
    await expect(main(page).getByRole("switch", { name: /Ver quitados/ })).toHaveAccessibleName("Ver quitados (0)");
    // Y se puede volver a quitar.
    await quitarDe(page, "Marco Giménez").click();
    await modal(page).getByRole("radio", { name: "Terminó su tratamiento" }).check();
    await modal(page).getByRole("button", { name: "Quitar de la lista" }).click();
    await expect(renglon(page, "Marco Giménez")).toHaveCount(0);
    expect((await fichaGuardada(page, "p6")).seguimiento.motivo).toBe("Terminó su tratamiento");
  });

  test("si agendan una cita a alguien que estaba en la lista, sale de ella; y si la anulan, vuelve", async ({ page }) => {
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
      const d = new Date(); d.setDate(d.getDate() + 4); d.setHours(11, 0, 0, 0);
      db.appointments.push({ id: "c_nueva", clinicId: "cl_demo", patientId: "p1", dentistId: "u2", title: "Control", start: d.toISOString(), end: d.toISOString(), status: "pendiente", amount: 0, discount: 0 });
      localStorage.setItem("novudent.db.v4", JSON.stringify(db));
    });
    await abrirAnalisis(page);
    await cifra(page, "sin").click();
    await expect(renglon(page, "María González")).toHaveCount(0);
    await expect(main(page).getByText("Mostrando 3 de 8")).toBeVisible();

    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
      db.appointments.find((a: { id: string }) => a.id === "c_nueva").status = "cancelada";
      localStorage.setItem("novudent.db.v4", JSON.stringify(db));
    });
    await abrirAnalisis(page);
    await cifra(page, "sin").click();
    await expect(renglon(page, "María González")).toBeVisible();
  });
});

test.describe("quién puede qué", () => {
  test("la recepcionista ve el contacto, escribe por WhatsApp y puede quitar de la lista", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await conCaso(page);
    await cifra(page, "sin").click();
    const maria = renglon(page, "María González");
    await expect(await celda(page, maria, "Contacto")).toContainText("+595 981 111 111");
    await expect(maria.getByRole("link", { name: "WhatsApp a María González" })).toBeVisible();
    await expect(maria.getByRole("button", { name: "Quitar de la lista: María González" })).toBeVisible();
    await maria.getByRole("button", { name: "Quitar de la lista: María González" }).click();
    await page.getByRole("dialog").getByRole("radio", { name: "No quiere continuar" }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Quitar de la lista" }).click();
    await expect(renglon(page, "María González")).toHaveCount(0);
    expect((await leerDB(page)).patients.find((p: Fila) => p.id === "p1").seguimiento).toMatchObject({ motivo: "No quiere continuar", por: "Laura Recepción" });
  });

  test("la dentista ve solo a sus pacientes, sin datos personales ni WhatsApp, y puede quitar de la lista", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    await conCaso(page);
    await expect(cifra(page, "todos")).toContainText("7"); // Pedro Otro es del Dr. Martínez
    await expect(renglon(page, "Pedro Otro")).toHaveCount(0);
    await cifra(page, "sin").click();
    await expect(main(page).locator("thead th", { hasText: "Contacto" })).toHaveCount(0);
    await expect(main(page)).not.toContainText(/CI \d/);
    await expect(main(page).getByRole("link", { name: /WhatsApp/ })).toHaveCount(0);
    await expect(main(page)).not.toContainText("+595 981 111 111");
    await expect(main(page)).not.toContainText("maria@example.com");
    // Lo clínico sí: plan y última cita.
    await expect(await celda(page, renglon(page, "María González"), "Plan de tratamiento")).toContainText("Plan dental integral");
    await expect(renglon(page, "María González").getByRole("button", { name: "Quitar de la lista: María González" })).toBeVisible();
  });

  test("la asistente de doctores mira pero no cambia: sin datos personales, sin WhatsApp y sin «Quitar de la lista»", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.asistente);
    await conCaso(page);
    await cifra(page, "sin").click();
    await expect(renglon(page, "María González")).toBeVisible();
    await expect(main(page).getByRole("button", { name: /Quitar de la lista/ })).toHaveCount(0);
    await expect(main(page).getByRole("link", { name: /WhatsApp/ })).toHaveCount(0);
    await expect(main(page)).not.toContainText("+595 981 111 111");
    await expect(renglon(page, "María González").getByRole("link", { name: "Ver ficha de María González" })).toBeVisible();

    // Los quitados se pueden mirar, pero no devolver.
    await main(page).getByRole("switch", { name: /Ver quitados/ }).click();
    await expect(renglon(page, "Marco Giménez")).toBeVisible();
    await expect(main(page).getByRole("button", { name: /Volver a incluir/ })).toHaveCount(0);
  });
});

test.describe("Exportar CSV", () => {
  async function descargar(page: Page) {
    const [descarga] = await Promise.all([page.waitForEvent("download"), main(page).getByRole("button", { name: "Exportar CSV" }).click()]);
    const texto = readFileSync((await descarga.path())!, "utf8").replace(/^﻿/, "");
    const filas = texto.split("\n").map((l) => l.split(";").map((c) => c.replace(/^"|"$/g, "").replaceAll('""', '"')));
    return { nombre: descarga.suggestedFilename(), encabezado: filas[0], filas: filas.slice(1) };
  }

  test("lleva las mismas columnas y los mismos pacientes que la tabla, con el filtro aplicado", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.admin);
    await conCaso(page);
    await cifra(page, "sin").click();
    const titulosDeLaTabla = (await main(page).locator("thead th").allTextContents()).map((t) => t.trim()).filter((t) => t !== "Acciones");

    const csv = await descargar(page);
    expect(csv.nombre).toBe("estudios-general-sin-proxima-cita.csv");
    // Cada dato de la tabla va en su columna del archivo (la celda «Paciente» lleva también la CI y la de «Contacto», teléfono y correo).
    expect(csv.encabezado).toEqual(["Paciente", "CI", "Teléfono", "Correo", "Profesional", "Última cita", "Próxima cita", "Plan de tratamiento", "Sin cita desde", "Citas", "Planes"]);
    expect(titulosDeLaTabla).toEqual(["Paciente", "Contacto", "Profesional", "Última cita", "Próxima cita", "Plan de tratamiento", "Sin cita desde", "Citas", "Planes"]);
    expect(csv.filas.map((f) => f[0]).sort()).toEqual(["Lucía Ferreira", "María González", "Pedro Otro", "Rosa Benítez"]);
    const maria = csv.filas.find((f) => f[0] === "María González")!;
    const col = (nombre: string) => csv.encabezado.indexOf(nombre);
    expect(maria[col("Teléfono")]).toBe("+595 981 111 111");
    expect(maria[col("Correo")]).toBe("maria@example.com");
    expect(maria[col("Última cita")]).toMatch(/· Atendido$/);
    expect(maria[col("Próxima cita")]).toBe("Sin cita");
    expect(maria[col("Plan de tratamiento")]).toBe("Plan dental integral · Presentado");
    expect(maria[col("Sin cita desde")]).toMatch(/^hace 10 días · desde el /);
  });

  test("sin filtro lleva a todos y suma la columna de seguimiento; los quitados se exportan aparte", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.admin);
    await conCaso(page);
    const todos = await descargar(page);
    expect(todos.nombre).toBe("estudios-general.csv");
    expect(todos.filas).toHaveLength(8);
    expect(todos.encabezado).toEqual(expect.arrayContaining(["Seguimiento", "Sin cita desde"]));
    const seg = todos.encabezado.indexOf("Seguimiento");
    const desde = todos.encabezado.indexOf("Sin cita desde");
    expect(todos.filas.find((f) => f[0] === "Camila Ortega")![seg]).toBe("Plan finalizado");
    expect(todos.filas.find((f) => f[0] === "Marco Giménez")![seg]).toBe("Quitado: No quiere continuar");
    expect(todos.filas.find((f) => f[0] === "María González")![seg]).toBe("A recontactar");
    expect(todos.filas.find((f) => f[0] === "María González")![desde]).toMatch(/^hace 10 días · desde el /);
    expect(todos.filas.find((f) => f[0] === "Juan Ríos")![desde]).toBe("—");

    await main(page).getByRole("switch", { name: /Ver quitados/ }).click();
    const quitados = await descargar(page);
    expect(quitados.nombre).toBe("estudios-general-quitados.csv");
    expect(quitados.encabezado).toEqual(expect.arrayContaining(["Paciente", "Quitado el", "Motivo", "Quitado por"]));
    expect(quitados.filas).toHaveLength(1);
    expect(quitados.filas[0][0]).toBe("Marco Giménez");
  });

  test("la recepcionista exporta el teléfono y el correo", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await conCaso(page);
    const csv = await descargar(page);
    expect(csv.encabezado).toEqual(expect.arrayContaining(["CI", "Teléfono", "Correo"]));
    expect(csv.filas.find((f) => f[0] === "María González")![csv.encabezado.indexOf("Teléfono")]).toBe("+595 981 111 111");
  });

  test("la dentista exporta sin datos personales, igual que ve la tabla", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    await conCaso(page);
    const csv = await descargar(page);
    for (const dato of ["CI", "Teléfono", "Correo"]) expect(csv.encabezado).not.toContain(dato);
    expect(csv.filas.flat().join("|")).not.toContain("+595");
    expect(csv.filas.flat().join("|")).not.toContain("@");
    expect(csv.filas).toHaveLength(7); // sin Pedro Otro, que es del Dr. Martínez
  });
});

test.describe("en el celular", () => {
  test("la tabla ancha se recorre de costado, el nombre queda a la vista y la página no se ensancha", async ({ page, isMobile }) => {
    test.skip(!isMobile, "solo tiene sentido en la pantalla del celular");
    await entrarDemo(page, USUARIOS_DEMO.admin);
    await conCaso(page);
    await cifra(page, "sin").click();
    const anchoInicial = await page.evaluate(() => innerWidth);
    await sinScrollHorizontal(page);

    const contenedor = main(page).locator("div.overflow-x-auto").first();
    const medidas = await contenedor.evaluate((el) => ({ visible: el.clientWidth, total: el.scrollWidth }));
    expect(medidas.total, "la tabla tiene que ser más ancha que la pantalla para que haga falta recorrerla").toBeGreaterThan(medidas.visible);

    // Al final de la tabla están las acciones y se pueden tocar.
    const quitar = renglon(page, "María González").getByRole("button", { name: "Quitar de la lista: María González" });
    await quitar.scrollIntoViewIfNeeded();
    await expect(quitar).toBeInViewport();
    expect(await contenedor.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    // El nombre sigue a la vista mientras tanto.
    const nombre = renglon(page, "María González").getByRole("link", { name: "María González", exact: true });
    await expect(nombre).toBeInViewport();
    expect(await page.evaluate(() => innerWidth), "la ventana no se ensancha").toBe(anchoInicial);

    // Y el modal cabe en la pantalla.
    await quitar.click();
    const botonConfirmar = page.getByRole("dialog").getByRole("button", { name: "Quitar de la lista" });
    await expect(botonConfirmar).toBeInViewport();
    expect(await page.evaluate(() => innerWidth)).toBe(anchoInicial);
  });

  test("en escritorio la tabla de la lista entra sin esconder las acciones", async ({ page, isMobile }) => {
    test.skip(isMobile, "solo escritorio");
    await entrarDemo(page, USUARIOS_DEMO.admin);
    await conCaso(page);
    await cifra(page, "sin").click();
    const quitar = renglon(page, "María González").getByRole("button", { name: "Quitar de la lista: María González" });
    await quitar.scrollIntoViewIfNeeded();
    await expect(quitar).toBeInViewport();
  });
});
