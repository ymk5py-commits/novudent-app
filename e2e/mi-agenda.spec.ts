import type { Locator, Page } from "@playwright/test";
import { test, expect, entrarDemo, leerDB, sinScrollHorizontal, USUARIOS_DEMO } from "./soporte";
import { sumarDias } from "../lib/tareas";

/* «Mi agenda» en Inicio (pedido de Novum, 6-oct-2026): lo que me toca hoy y esta semana — mis tareas,
   las automáticas que me asignaron y la rutina del día, que se tacha sola cuando se resuelve — más la
   IA (dictar la semana y el resumen semanal), que acá se simula: ninguna prueba gasta Gemini.

   El seed arma las citas alrededor del lunes de la semana en curso, así que cada prueba arma su propio
   caso en el estado local de la demo y no depende del día en que corre. */

const lista = (page: Page, ambito: "hoy" | "semana" = "hoy") =>
  page.getByRole("tabpanel", { name: ambito === "hoy" ? "Agenda de hoy" : "Agenda de la semana" });
const pendientes = (page: Page) => lista(page).getByRole("region", { name: "Pendientes" });
const hechas = (page: Page) => lista(page).getByRole("region", { name: "Hechas" });
const avance = (page: Page) => page.getByRole("progressbar", { name: "Avance de la agenda" });
const hechasDe = (page: Page, de: number, total: number) => expect(avance(page)).toHaveAttribute("aria-valuetext", `${de} de ${total} hechas`);

/** Cambia el estado local de la demo (lo que la app usa con Firebase cortado) y recarga. */
async function conDemo<A = null>(page: Page, cambiar: (db: any, hoy: string, arg: A) => void, arg?: A) {
  await page.evaluate(`(() => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4"));
    const d = new Date();
    const hoy = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    (${cambiar.toString()})(db, hoy, ${JSON.stringify(arg ?? null)});
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  })()`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Mi agenda" })).toBeVisible();
}

/** Hace clic y espera su efecto, y si no pasó nada vuelve a intentar. Justo al entrar, la página todavía se
 *  mueve (la tarjeta sube con su animación de entrada y el scroll es suave): Playwright mide la posición del
 *  botón, la página sigue corriendo y el clic cae en el hueco de al lado. En una persona no pasa; en la
 *  prueba, una de cada ~60 veces. */
async function clicHasta(boton: Locator, efecto: Locator) {
  await expect(async () => {
    await boton.click({ timeout: 4_000 });
    await expect(efecto).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
}
const abrirDictado = (page: Page) => clicHasta(page.getByRole("button", { name: "Dictar la semana" }), page.getByRole("dialog"));
const abrirConPaciente = (page: Page) => clicHasta(page.getByRole("button", { name: "Con paciente…" }), page.getByRole("dialog"));
const abrirResumen = (page: Page) => clicHasta(page.getByRole("button", { name: "Resumen semanal" }), page.getByRole("region", { name: "Resumen de la semana" }));

const hoyDe = (page: Page) => page.evaluate(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});
/** El domingo de la semana de `hoy` (lunes a domingo): una fecha que cae en la semana aunque hoy sea cualquier día. */
const domingoDe = (hoy: string) => { const dow = new Date(`${hoy}T00:00:00Z`).getUTCDay(); return dow === 0 ? hoy : sumarDias(hoy, 7 - dow); };

async function agregar(page: Page, texto: string, fecha?: string) {
  await page.getByLabel("Nueva tarea").fill(texto);
  if (fecha) await page.getByLabel("Día de la tarea").fill(fecha);
  // El campo se vacía cuando la tarea se agregó (ver `clicHasta`).
  await expect(async () => {
    await page.getByRole("button", { name: "Agregar", exact: true }).click({ timeout: 4_000 });
    await expect(page.getByLabel("Nueva tarea")).toHaveValue("", { timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
}

/** El estado de la demo con la rutina armada a mano: mañana hay dos citas (una sin confirmar) y entró una reserva online. */
const conRutina = (db: any) => {
  const en = (dias: number, h: number) => { const d = new Date(); d.setDate(d.getDate() + dias); d.setHours(h, 0, 0, 0); return d.toISOString(); };
  const cita = (id: string, patientId: string, dias: number, h: number, status: string, extra: object = {}) => ({
    id, clinicId: "cl_demo", patientId, dentistId: "u2", title: "Consulta", start: en(dias, h), end: en(dias, h + 1), status, amount: 0, discount: 0, ...extra,
  });
  db.appointments = [
    cita("e2e_m1", "p1", 1, 9, "pendiente"), cita("e2e_m2", "p3", 1, 11, "confirmada"),
    cita("e2e_o1", "p2", 2, 10, "pendiente", { source: "online" }),
  ];
};

test.describe("Mi agenda — administrador", () => {
  test("la rutina del día dice qué falta y se tacha sola cuando se resuelve", async ({ page }) => {
    await entrarDemo(page);
    await conDemo(page, conRutina);

    const faltan = ["Confirmar las citas de mañana", "Validar las reservas online", "Completar los documentos clínicos pendientes", "Cerrar la caja", "Reponer el stock bajo"];
    for (const t of faltan) await expect(pendientes(page).getByRole("link", { name: t, exact: true })).toBeVisible();
    await expect(pendientes(page)).toContainText("1 de 2 sin confirmar");
    await expect(pendientes(page)).toContainText("1 por validar");
    await expect(pendientes(page)).toContainText(/2 insumos: .*Anestesia.*Hipoclorito/);
    await expect(hechas(page)).toHaveCount(0);
    await hechasDe(page, 0, 5);

    // Se confirman las citas de mañana y se valida la reserva: la rutina se tacha sola, sin tocar la agenda.
    await conDemo(page, (db) => { for (const a of db.appointments) a.status = "confirmada"; });
    await expect(hechas(page).getByText("Confirmar las citas de mañana")).toBeVisible();
    await expect(hechas(page)).toContainText("Las 2 citas de mañana están confirmadas");
    await expect(hechas(page).getByText("Validar las reservas online")).toBeVisible();
    await expect(pendientes(page).getByText("Confirmar las citas de mañana")).toHaveCount(0);
    await hechasDe(page, 2, 5);
  });

  test("agregar una tarea, tildarla y destildarla; es la misma tarea de la bandeja", async ({ page }) => {
    await entrarDemo(page);
    await conDemo(page, conRutina);
    await agregar(page, "Llamar al laboratorio por la prótesis");
    await expect(page.getByRole("status").filter({ hasText: "Tarea agregada." })).toBeVisible();
    await expect(pendientes(page).getByText("Llamar al laboratorio por la prótesis")).toBeVisible();
    await hechasDe(page, 0, 6);

    await page.getByRole("button", { name: "Marcar como hecha: Llamar al laboratorio por la prótesis" }).click();
    await expect(hechas(page).getByText("Llamar al laboratorio por la prótesis")).toBeVisible();
    await expect(pendientes(page).getByText("Llamar al laboratorio por la prótesis")).toHaveCount(0);
    await hechasDe(page, 1, 6);
    const hecha = (await leerDB(page)).mgmtTasks.find((t: any) => t.title === "Llamar al laboratorio por la prótesis");
    expect(hecha).toMatchObject({ type: "personalizada", createdBy: "u1", status: "cerrada", resolution: "ejecutada" });

    // Sobrevive a recargar.
    await page.reload();
    await expect(hechas(page).getByText("Llamar al laboratorio por la prótesis")).toBeVisible();

    await page.getByRole("button", { name: "Marcar como pendiente: Llamar al laboratorio por la prótesis" }).click();
    await expect(pendientes(page).getByText("Llamar al laboratorio por la prótesis")).toBeVisible();
    await hechasDe(page, 0, 6);
    expect((await leerDB(page)).mgmtTasks.find((t: any) => t.title === "Llamar al laboratorio por la prótesis")).toMatchObject({ status: "pendiente", gestiones: [] });

    // La bandeja de tareas la ve: no hay una segunda lista.
    await page.goto("/app/tareas");
    await expect(page.locator("main").getByText("Llamar al laboratorio por la prótesis")).toBeVisible();
  });

  test("eliminar una tarea propia pide confirmar; la rutina y las automáticas no se eliminan", async ({ page }) => {
    await entrarDemo(page);
    await agregar(page, "Tarea que me equivoqué al escribir");
    const eliminar = page.getByRole("button", { name: "Eliminar la tarea: Tarea que me equivoqué al escribir" });
    // Se cancela: la tarea sigue.
    page.once("dialog", (d) => d.dismiss());
    await eliminar.click();
    await expect(pendientes(page).getByText("Tarea que me equivoqué al escribir")).toBeVisible();
    // Se confirma: desaparece de la agenda y de la bandeja.
    page.once("dialog", (d) => { expect(d.message()).toContain("Tarea que me equivoqué al escribir"); void d.accept(); });
    await eliminar.click();
    await expect(page.getByText("Tarea que me equivoqué al escribir")).toHaveCount(0);
    expect((await leerDB(page)).mgmtTasks.some((t: any) => t.title === "Tarea que me equivoqué al escribir")).toBe(false);
    // La rutina no tiene botón de eliminar.
    await expect(page.getByRole("button", { name: /^Eliminar la tarea: Cerrar la caja/ })).toHaveCount(0);
  });

  test("una tarea de otro día está en «Semana»; una atrasada se ve hoy y cuenta en el avance", async ({ page }) => {
    await entrarDemo(page);
    const hoy = await hoyDe(page);
    const domingo = domingoDe(hoy);
    await agregar(page, "Pedir guantes y anestesia", domingo);

    await page.getByRole("tab", { name: "Semana" }).click();
    const semana = lista(page, "semana");
    await expect(semana.getByRole("region", { name: /^Domingo/ }).getByText("Pedir guantes y anestesia")).toBeVisible();
    await page.getByRole("tab", { name: "Hoy" }).click();
    if (domingo !== hoy) await expect(lista(page).getByText("Pedir guantes y anestesia")).toHaveCount(0);

    // Una de ayer, pendiente: atrasada.
    await conDemo(page, (db, h) => {
      const d = new Date(`${h}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
      db.mgmtTasks.push({ id: "mt_e2e_vieja", clinicId: "cl_demo", type: "personalizada", title: "Renovar la matrícula", status: "pendiente", createdBy: "u1", dueDate: d.toISOString().slice(0, 10), createdAt: new Date().toISOString() });
    });
    await expect(pendientes(page).getByText("Renovar la matrícula")).toBeVisible();
    await expect(pendientes(page).getByText(/Atrasada · /)).toBeVisible();
    await expect(page.getByText(/· 1 atrasada/)).toBeVisible();
    await page.getByRole("tab", { name: "Semana" }).click();
    await expect(lista(page, "semana").getByRole("region", { name: "Atrasadas" }).getByText("Renovar la matrícula")).toBeVisible();
  });

  test("una tarea con paciente se tacha sola cuando paga, y se reabre si el pago se anula", async ({ page }) => {
    await entrarDemo(page);
    await abrirConPaciente(page);
    await page.getByLabel("Buscar paciente").fill("Juan");
    await page.getByRole("button", { name: "Juan Ríos" }).click();
    await page.getByLabel("Detalle *").fill("Avisarle que su saldo está pendiente");
    await page.getByLabel("Se tacha sola cuando el paciente…").selectOption({ label: "Registre un pago" });
    await page.getByRole("button", { name: "Crear tarea" }).click();

    const fila = pendientes(page).getByRole("listitem").filter({ hasText: "Avisarle que su saldo está pendiente" });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText("Juan Ríos");
    await expect(fila).toContainText("Se tacha sola cuando registre un pago");
    // La tilda a mano también se puede, pero acá esperamos que se tache sola: la dejamos pendiente.
    expect((await leerDB(page)).mgmtTasks.find((t: any) => t.title === "Avisarle que su saldo está pendiente").autoCierre).toMatchObject({ evento: "pago" });

    // Juan paga: la tarea queda hecha por el sistema, sin que nadie la toque.
    await conDemo(page, (db) => {
      db.payments.push({ id: "pay_e2e", clinicId: "cl_demo", patientId: "p2", date: new Date().toISOString(), amount: 100000, method: "efectivo", concept: "Abono", receivedBy: "u1" });
    });
    const hecha = hechas(page).getByRole("listitem").filter({ hasText: "Avisarle que su saldo está pendiente" });
    await expect(hecha).toBeVisible();
    await expect(hecha).toContainText("Se tachó sola");
    await expect(hecha.getByRole("button", { name: /^Marcar como/ })).toHaveCount(0); // sin casillero: no se destilda a mano

    // La bandeja la muestra como completada por el sistema (en «Tareas del día»: «Todas las pendientes», que es la que abre, solo trae pendientes).
    await page.goto("/app/tareas");
    await page.getByRole("tab", { name: /Tareas del día/ }).click();
    await page.getByLabel("Esconder tareas completadas por sistema").uncheck();
    await expect(page.locator("main").getByText("Avisarle que su saldo está pendiente")).toBeVisible();

    // El pago se anula: la tarea vuelve a pendiente.
    await page.goto("/app");
    await conDemo(page, (db) => { db.payments.find((p: any) => p.id === "pay_e2e").voidedAt = new Date().toISOString(); });
    await expect(pendientes(page).getByText("Avisarle que su saldo está pendiente")).toBeVisible();
  });

  test("«Acepte el presupuesto» solo ofrece los presentados y la tarea se tacha cuando lo acepta", async ({ page }) => {
    await entrarDemo(page);
    await abrirConPaciente(page);
    await page.getByLabel("Buscar paciente").fill("María");
    await page.getByRole("button", { name: "María González" }).click();
    await page.getByLabel("Detalle *").fill("Llamar por el plan dental integral");
    await page.getByLabel("Se tacha sola cuando el paciente…").selectOption({ label: "Acepte el presupuesto" });
    // Sin elegir cuál, no deja crear.
    await page.getByRole("button", { name: "Crear tarea" }).click();
    await expect(page.getByRole("dialog").getByText(/Elegí qué presupuesto/)).toBeVisible();
    await page.getByLabel("¿Qué presupuesto tiene que aceptar? *").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Crear tarea" }).click();
    await expect(pendientes(page).getByText("Llamar por el plan dental integral")).toBeVisible();
    await expect(pendientes(page)).toContainText("Se tacha sola cuando acepte el presupuesto");

    await conDemo(page, (db) => { db.budgets.find((b: any) => b.id === "g1").status = "aceptado"; });
    await expect(hechas(page).getByText("Llamar por el plan dental integral")).toBeVisible();
  });
});

test.describe("Mi agenda — teclado", () => {
  // El detalle de las tres pestañas (con vuelta, Inicio y Fin) está en e2e/tareas-todas.spec.ts.
  test("las pestañas Hoy, Semana y Todas se mueven con las flechas", async ({ page }) => {
    await entrarDemo(page);
    const hoyTab = page.getByRole("tab", { name: "Hoy" });
    const semanaTab = page.getByRole("tab", { name: "Semana" });
    const todasTab = page.getByRole("tab", { name: "Todas", exact: true });
    await expect(hoyTab).toHaveAttribute("aria-selected", "true");
    await expect(hoyTab).toHaveAttribute("tabindex", "0");
    await expect(semanaTab).toHaveAttribute("tabindex", "-1"); // la que no está elegida no entra con Tab
    await hoyTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(semanaTab).toHaveAttribute("aria-selected", "true");
    await expect(semanaTab).toBeFocused();
    await expect(lista(page, "semana")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(todasTab).toHaveAttribute("aria-selected", "true");
    await expect(todasTab).toBeFocused();
    await expect(page.getByRole("tabpanel", { name: "Todas las pendientes" })).toBeVisible();
    await page.keyboard.press("Home");
    await expect(hoyTab).toBeFocused();
    await expect(lista(page)).toBeVisible();
    // La pestaña controla un panel que existe.
    const panel = await hoyTab.getAttribute("aria-controls");
    expect(await page.locator(`[id="${panel}"]`).count()).toBe(1);
  });
});

test.describe("Mi agenda — lo que ve cada rol", () => {
  test("el dentista no tiene rutina de recepción, caja ni stock", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    await conDemo(page, conRutina);
    await expect(page.getByRole("heading", { name: "Mi agenda" })).toBeVisible();
    await expect(lista(page)).toContainText("No tenés nada para hoy.");
    for (const t of ["Cerrar la caja", "Reponer el stock bajo", "Confirmar las citas de mañana", "Completar los documentos clínicos pendientes", "Validar las reservas online"]) {
      await expect(page.getByText(t)).toHaveCount(0);
    }
  });

  test("la recepción confirma citas y documentos, pero no ve caja ni stock", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await conDemo(page, conRutina);
    await expect(pendientes(page).getByRole("link", { name: "Confirmar las citas de mañana" })).toBeVisible();
    await expect(pendientes(page).getByRole("link", { name: "Completar los documentos clínicos pendientes" })).toBeVisible();
    await expect(page.getByText("Cerrar la caja")).toHaveCount(0);
    await expect(page.getByText("Reponer el stock bajo")).toHaveCount(0);
  });

  test("la caja cierra su caja pero no repone stock", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.caja);
    await expect(pendientes(page).getByRole("link", { name: "Cerrar la caja" })).toBeVisible();
    await expect(page.getByText("Reponer el stock bajo")).toHaveCount(0);
  });

  test("las tareas de una persona no aparecen en la agenda de otra", async ({ page }) => {
    await entrarDemo(page);
    await agregar(page, "Tarea privada del administrador");
    await expect(pendientes(page).getByText("Tarea privada del administrador")).toBeVisible();
    // Se cambia la sesión a la de Paola sin pasar por el login (que reinicia la demo y borraría la tarea).
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("novudent.session.v1")!);
      localStorage.setItem("novudent.session.v1", JSON.stringify({ ...s, userId: "u3", role: "assistant", name: "Paola Asistente" }));
    });
    await page.reload();
    // Paola tiene asignada una del seed y no ve la del administrador.
    await expect(pendientes(page).getByText("Llamar para confirmar control de ortodoncia")).toBeVisible();
    await expect(page.getByText("Tarea privada del administrador")).toHaveCount(0);
  });
});

test.describe("Mi agenda — IA (simulada)", () => {
  test("dictar la semana con texto: se revisa antes de guardar y el paciente se empareja sin salir del navegador", async ({ page }) => {
    await entrarDemo(page);
    const hoy = await hoyDe(page);
    const domingo = domingoDe(hoy);
    let pedido: any = null;
    await page.route("**/api/ia/agenda-semana", async (route) => {
      pedido = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, transcripcion: "", tareas: [
        { titulo: "Llamar a Juan Ríos por su presupuesto", fecha: hoy, paciente: "Juan Ríos" },
        { titulo: "Pedir guantes y anestesia", fecha: domingo },
        { titulo: "Avisar a Ana Inexistente", fecha: hoy, paciente: "Ana Inexistente" },
      ] } });
    });

    await abrirDictado(page);
    await page.getByLabel("Lo que tenés que hacer").fill("Hoy llamar a Juan Ríos por su presupuesto; el domingo pedir guantes y anestesia; avisar a Ana Inexistente");
    await page.getByRole("button", { name: "Armar las tareas" }).click();

    // Revisión: nada se guardó todavía.
    await expect(page.getByText("Revisá las tareas antes de guardarlas")).toBeVisible();
    expect((await leerDB(page)).mgmtTasks.filter((t: any) => t.createdBy === "u1")).toHaveLength(0);
    await expect(page.getByText("Juan Ríos", { exact: true }).first()).toBeVisible(); // se emparejó con su ficha
    await expect(page.getByText("«Ana Inexistente» no está en tus fichas")).toBeVisible();

    await page.getByRole("checkbox", { name: "Guardar esta tarea: Pedir guantes y anestesia" }).uncheck();
    await page.getByLabel("Texto de la tarea").first().fill("Llamar a Juan Ríos por el plan");
    await page.getByRole("button", { name: "Guardar 2 tareas" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Guardé 2 tareas." })).toBeVisible();

    const guardadas = (await leerDB(page)).mgmtTasks.filter((t: any) => t.createdBy === "u1");
    expect(guardadas).toHaveLength(2);
    expect(guardadas.find((t: any) => t.title === "Llamar a Juan Ríos por el plan")).toMatchObject({ patientId: "p2", patientName: "Juan Ríos", dueDate: hoy, type: "personalizada" });
    expect(guardadas.find((t: any) => t.title === "Avisar a Ana Inexistente")).not.toHaveProperty("patientId");
    expect(new Set(guardadas.map((t: any) => t.id)).size).toBe(2); // ids distintos aunque se crearon juntas
    await expect(pendientes(page).getByText("Llamar a Juan Ríos por el plan")).toBeVisible();

    // A la IA viajó el dictado y la fecha de hoy, y nada más.
    expect(Object.keys(pedido).sort()).toEqual(["hoy", "texto"]);
    expect(pedido.hoy).toBe(hoy);
  });

  test("dictar con la voz manda el audio y deja revisar lo que entendió", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => ({ getTracks: () => [{ stop() {} }] }) });
      class GrabadoraFalsa {
        static isTypeSupported() { return true; }
        state = "inactive"; stream: unknown; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
        constructor(stream: unknown) { this.stream = stream; }
        start() { this.state = "recording"; this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" }) }); }
        stop() { this.state = "inactive"; this.onstop?.(); }
      }
      (window as any).MediaRecorder = GrabadoraFalsa;
    });
    await entrarDemo(page);
    const hoy = await hoyDe(page);
    let pedido: any = null;
    await page.route("**/api/ia/agenda-semana", async (route) => {
      pedido = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, transcripcion: "pedir guantes hoy", tareas: [{ titulo: "Pedir guantes", fecha: hoy }] } });
    });

    await abrirDictado(page);
    await page.getByRole("button", { name: "Dictar con la voz" }).click();
    await expect(page.getByRole("timer")).toBeVisible();
    await page.getByRole("button", { name: "Detener y armar las tareas" }).click();
    await expect(page.getByText("«pedir guantes hoy»")).toBeVisible(); // lo que entendió, para que se vea
    await expect(page.getByLabel("Texto de la tarea")).toHaveValue("Pedir guantes");
    expect(pedido.audio).toBe("AQIDBA=="); // [1,2,3,4] en base64
    expect(pedido.mimeType).toMatch(/^audio\/webm/);
    expect(pedido).not.toHaveProperty("texto");
  });

  test("si la IA no encuentra tareas lo dice y se puede reintentar", async ({ page }) => {
    await entrarDemo(page);
    await page.route("**/api/ia/agenda-semana", (route) =>
      route.fulfill({ status: 422, json: { ok: false, error: "No encontré tareas en lo que dijiste. Probá con algo como: «el jueves llamar a María López por su presupuesto»." } }));
    await abrirDictado(page);
    await page.getByLabel("Lo que tenés que hacer").fill("hola");
    await page.getByRole("button", { name: "Armar las tareas" }).click();
    await expect(page.getByRole("dialog").getByText(/No encontré tareas/)).toBeVisible();
    await expect(page.getByLabel("Lo que tenés que hacer")).toHaveValue("hola"); // no se pierde lo escrito
  });

  test("en la demo pública la IA contesta 403: se explica que ahí está apagada, no «tu cuenta no está asignada»", async ({ page }) => {
    await entrarDemo(page);
    const sinClinica = { status: 403, json: { ok: false, error: "Tu cuenta no está asignada a ninguna clínica." } };
    await page.route("**/api/ia/agenda-semana", (r) => r.fulfill(sinClinica));
    await page.route("**/api/ia/agenda-resumen", (r) => r.fulfill(sinClinica));
    await abrirDictado(page);
    await page.getByLabel("Lo que tenés que hacer").fill("el jueves pedir guantes");
    await page.getByRole("button", { name: "Armar las tareas" }).click();
    await expect(page.getByRole("dialog").getByText(/La IA no está activa en la demo pública/)).toBeVisible();
    await expect(page.getByText(/no está asignada/)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await abrirResumen(page);
    await expect(page.getByRole("region", { name: "Resumen de la semana" }).getByText(/La IA no está activa en la demo pública/)).toBeVisible();
  });

  test("el resumen semanal manda solo conteos: ni nombres de pacientes ni textos de tareas", async ({ page }) => {
    await entrarDemo(page);
    await agregar(page, "Llamar a Juan Ríos por su presupuesto");
    let pedido: any = null;
    await page.route("**/api/ia/agenda-resumen", async (route) => {
      pedido = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, resumen: "• Vas 0 de 6 tareas.\n• Cerrá la caja antes de irte." } });
    });
    await abrirResumen(page);
    const panel = page.getByRole("region", { name: "Resumen de la semana" });
    await expect(panel).toContainText("Vas 0 de 6 tareas.");
    await expect(panel).toContainText("Cerrá la caja antes de irte.");

    expect(pedido.datos.misTareas).toMatchObject({ total: 1, hechas: 0, pendientes: 1 });
    expect(pedido.datos.semana.desde <= pedido.datos.hoy && pedido.datos.hoy <= pedido.datos.semana.hasta).toBe(true);
    expect(typeof pedido.datos.produccionSemanaGs).toBe("number"); // el administrador ve reportes financieros
    const enviado = JSON.stringify(pedido);
    for (const prohibido of ["Juan", "Ríos", "Llamar a", "María"]) expect(enviado).not.toContain(prohibido);
  });

  test("a quien no ve reportes financieros no le viaja la producción", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    let pedido: any = null;
    await page.route("**/api/ia/agenda-resumen", async (route) => {
      pedido = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, resumen: "• Todo en orden." } });
    });
    await abrirResumen(page);
    await expect(page.getByRole("region", { name: "Resumen de la semana" })).toContainText("Todo en orden.");
    expect(pedido.datos).not.toHaveProperty("produccionSemanaGs");
  });

  test("sin el plan con IA no hay botones de IA", async ({ page }) => {
    await entrarDemo(page);
    await conDemo(page, (db) => { db.clinics[0].plan = "solo"; db.subscription = undefined; });
    await expect(page.getByRole("heading", { name: "Mi agenda" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dictar la semana" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Resumen semanal" })).toHaveCount(0);
  });
});

test.describe("Mi agenda — pantalla chica", () => {
  test("a 320 px no hay scroll de costado, ni con el dictado abierto", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await entrarDemo(page);
    await conDemo(page, conRutina);
    await agregar(page, "Una tarea con un texto bastante largo para ver cómo se parte en la pantalla del celular");
    await sinScrollHorizontal(page);
    await page.getByRole("tab", { name: "Semana" }).click();
    await sinScrollHorizontal(page);
    await page.getByRole("tab", { name: "Todas", exact: true }).click();
    await sinScrollHorizontal(page);
    await abrirDictado(page);
    await expect(page.getByLabel("Lo que tenés que hacer")).toBeVisible();
    await sinScrollHorizontal(page);
  });
});
