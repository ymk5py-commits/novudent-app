import { test, expect, entrarDemo, leerDB, USUARIOS_DEMO, sinScrollHorizontal } from "./soporte";
import type { Page, Locator } from "@playwright/test";

/* Pedido de Camila (8-oct-2026), frente A · Agenda:
   «En la agenda semanal debe aparecer la opción de sobreagendamiento, en cada box, como en Dentalink. En cada espacio de horario de la
   agenda, debemos tener la opción de dar "cita presencial", "dar múltiples citas" y también la opción de "bloquear espacio". Al dar cita
   falta la opción de agregar fechas tipo calendario. Cómo se define qué procedimiento se va a realizar el paciente para que aparezca en la
   agenda si al dar la cita no existe esa opción.»
   Spec: docs/superpowers/specs/2026-10-08-pedidos-de-camila-agenda-ficha-plan-tareas.md (A1 a A7). Todo se arma en la semana que viene,
   que la demo deja libre, para que las pruebas no dependan del día ni de la hora en que se corren. */

const main = (page: Page) => page.locator("main");

/** Cambia la demo guardada en el navegador (modo local) y recarga. */
async function conDemo<A = null>(page: Page, cambiar: (db: any, arg: A) => void, arg?: A) {
  await page.evaluate(`(() => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4"));
    (${cambiar.toString()})(db, ${JSON.stringify(arg ?? null)});
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  })()`);
  await page.reload();
}

/** Instante ISO del día `dia` (0 = lunes) de la semana que viene, a la hora local `hh:mm`. */
const enSemana = (page: Page, dia: number, hh: number, mm = 0) =>
  page.evaluate(([d, h, m]) => {
    const x = new Date();
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7 + d);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  }, [dia, hh, mm] as const);

/** AAAA-MM-DD (hora local) del día `dia` (0 = lunes) de la semana que viene. */
const fechaEnSemana = (page: Page, dia: number) =>
  page.evaluate((d) => {
    const x = new Date();
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7 + d);
    return x.toLocaleDateString("en-CA");
  }, dia);

/** El nombre del espacio de la grilla semanal: «Lun 12 oct · 09:30» (día `dia` de la semana que viene). */
const etiquetaEspacio = (page: Page, dia: number, hora: string) =>
  page.evaluate(([d, h]) => {
    const x = new Date();
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7 + d);
    const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${dias[x.getDay()]} ${x.getDate()} ${meses[x.getMonth()]} · ${h}`;
  }, [dia, hora] as const);

/** Una cita de la demo en la semana que viene. */
async function conCitas(page: Page, citas: { id: string; dia: number; desde: [number, number]; hasta: [number, number]; patientId?: string; dentistId?: string; boxId?: string; title: string; sobrecupo?: boolean }[]) {
  const armadas = [];
  for (const c of citas) {
    armadas.push({
      id: c.id, patientId: c.patientId ?? "p3", dentistId: c.dentistId ?? "u2", title: c.title, status: "pendiente", amount: 0, discount: 0,
      start: await enSemana(page, c.dia, ...c.desde), end: await enSemana(page, c.dia, ...c.hasta),
      ...(c.boxId ? { boxId: c.boxId } : {}), ...(c.sobrecupo ? { sobrecupo: true } : {}),
    });
  }
  await conDemo(page, (db: any, lista: any[]) => { for (const a of lista) db.appointments.push({ clinicId: db.clinics[0].id, ...a }); }, armadas);
}

/** Abre la vista Semanal en la semana que viene. */
async function semanaQueViene(page: Page) {
  await page.goto("/app/agenda");
  await main(page).getByRole("button", { name: "Semanal" }).click();
  await main(page).getByRole("button", { name: "Semana siguiente" }).click();
}

/** Toca un espacio de la grilla y devuelve su menú. */
async function menuDeEspacio(page: Page, dia: number, hora: string): Promise<Locator> {
  const etiqueta = await etiquetaEspacio(page, dia, hora);
  await main(page).getByRole("button", { name: etiqueta, exact: true }).click();
  const menu = page.getByRole("menu", { name: etiqueta });
  await expect(menu).toBeVisible();
  return menu;
}

const dialogo = (page: Page, nombre: string) => page.getByRole("dialog", { name: nombre });

/* ═══ A1 · El menú de cada espacio de la semanal ═══ */

test.describe("A1 · menú de cada espacio de la semanal", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page, USUARIOS_DEMO.recepcionista); });

  test("la grilla va de a 30 minutos y cada espacio abre un menú con su día y hora y las cinco opciones", async ({ page }) => {
    await semanaQueViene(page);
    // Hay un espacio a las 09:00 y otro a las 09:30.
    await expect(main(page).getByRole("button", { name: await etiquetaEspacio(page, 0, "09:00"), exact: true })).toHaveCount(1);
    const menu = await menuDeEspacio(page, 0, "09:30");
    await expect(menu).toContainText(await etiquetaEspacio(page, 0, "09:30"));
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Dar cita presencial", "Dar cita por videoconsulta", "Dar múltiples citas", "Sobreagendar en este horario", "Bloquear espacio",
    ]);
    await sinScrollHorizontal(page);
  });

  test("«Dar cita presencial» abre «Dar cita» con ese día y esa hora elegidos", async ({ page }) => {
    await semanaQueViene(page);
    const menu = await menuDeEspacio(page, 1, "10:30");
    await menu.getByRole("menuitem", { name: "Dar cita presencial" }).click();
    const cita = dialogo(page, "Dar cita");
    await expect(cita.getByRole("status")).toContainText("10:30");
    await expect(cita.getByRole("button", { name: /^martes, .*10:30$/ })).toHaveAttribute("aria-pressed", "true");
    await expect(cita.getByRole("checkbox", { name: /Videoconsulta/ })).not.toBeChecked();
    await expect(cita.getByRole("checkbox", { name: /Multiconsulta/ })).not.toBeChecked();
    await expect(cita.getByRole("checkbox", { name: /Sobreagendar/ })).not.toBeChecked();
  });

  test("«Dar cita por videoconsulta» la abre con «Videoconsulta» tildada", async ({ page }) => {
    await semanaQueViene(page);
    const menu = await menuDeEspacio(page, 2, "11:00");
    await menu.getByRole("menuitem", { name: "Dar cita por videoconsulta" }).click();
    const cita = dialogo(page, "Dar cita");
    await expect(cita.getByRole("checkbox", { name: /Videoconsulta/ })).toBeChecked();
    await expect(cita.getByRole("status")).toContainText("11:00");
  });

  test("con dos o más boxes, Semanal y Diaria filtran por box, y lo elegido viaja a «Dar cita»", async ({ page }) => {
    await conCitas(page, [
      { id: "a_box1", dia: 0, desde: [10, 0], hasta: [10, 30], boxId: "box1", title: "Cita del box 1" },
      { id: "a_box2", dia: 0, desde: [11, 0], hasta: [11, 30], boxId: "box2", title: "Cita del box 2" },
    ]);
    await semanaQueViene(page);
    await main(page).getByLabel("Filtrar por box").selectOption({ label: "Box 2" });
    await expect(main(page).getByRole("button", { name: /Cita del box 2/ })).toBeVisible();
    await expect(main(page).getByRole("button", { name: /Cita del box 1/ })).toHaveCount(0);
    await main(page).getByLabel("Filtrar por profesional").selectOption({ label: "Dr. Diego Martínez" });
    const menu = await menuDeEspacio(page, 3, "09:00");
    await menu.getByRole("menuitem", { name: "Dar cita presencial" }).click();
    const cita = dialogo(page, "Dar cita");
    await expect(cita.getByLabel("Box")).toHaveValue("box2");
    await expect(cita.getByLabel("Profesional")).toHaveValue("u4");
    await cita.getByRole("button", { name: "Cerrar" }).click();

    await main(page).getByRole("button", { name: "Diaria", exact: true }).click();
    await expect(main(page).getByLabel("Filtrar por box")).toHaveValue("box2");
  });
});

/* ═══ A2 · Citas superpuestas ═══ */

test.describe("A2 · citas superpuestas", () => {
  test("dos citas en el mismo horario se ven una al lado de la otra, no una encima de la otra", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await conCitas(page, [
      { id: "a_sup1", dia: 0, desde: [10, 0], hasta: [11, 0], title: "Primera superpuesta" },
      { id: "a_sup2", dia: 0, desde: [10, 0], hasta: [11, 0], dentistId: "u4", patientId: "p5", title: "Segunda superpuesta" },
    ]);
    await semanaQueViene(page);
    const a = (await main(page).getByRole("button", { name: /Primera superpuesta/ }).boundingBox())!;
    const b = (await main(page).getByRole("button", { name: /Segunda superpuesta/ }).boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    const [izq, der] = a.x < b.x ? [a, b] : [b, a];
    expect(izq.x + izq.width).toBeLessThanOrEqual(der.x + 1);
  });
});

/* ═══ A3 · Sobreagendar ═══ */

test.describe("A3 · sobreagendar", () => {
  test.beforeEach(async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await conCitas(page, [{ id: "a_origen", dia: 1, desde: [10, 0], hasta: [10, 30], boxId: "box2", title: "Cita de origen" }]);
  });

  test("el «+» de una cita abre «Dar cita» sobreagendando, con el día, la hora, el profesional y el box de esa cita; se guarda como sobrecupo", async ({ page, isMobile }) => {
    await semanaQueViene(page);
    const tarjeta = main(page).getByRole("button", { name: /Cita de origen/ });
    if (!isMobile) await tarjeta.hover(); // en el celular el «+» ya se ve
    await tarjeta.locator("..").getByRole("button", { name: "Sobreagendar en este horario" }).click();
    const cita = dialogo(page, "Dar cita");
    await expect(cita.getByRole("checkbox", { name: /Sobreagendar/ })).toBeChecked();
    await expect(cita.getByLabel("Profesional")).toHaveValue("u2");
    await expect(cita.getByLabel("Box")).toHaveValue("box2");
    const diez = cita.getByRole("button", { name: /^martes, .*10:00$/ });
    await expect(diez).toHaveAttribute("aria-pressed", "true");
    await expect(diez).toHaveAttribute("title", "Ya hay 1 cita");

    await cita.getByRole("combobox", { name: "Paciente" }).fill("Ferreira");
    await cita.getByRole("option", { name: /LUCÍA FERREIRA/ }).click();
    await cita.getByRole("button", { name: "Crear cita" }).click();
    await expect(cita).toHaveCount(0);
    // Lucía Ferreira (p5) ya tenía una cita en la demo (a5): la nueva es la otra.
    const nueva = (await leerDB(page)).appointments.find((a: { patientId: string; id: string }) => a.patientId === "p5" && a.id !== "a5");
    expect(nueva).toMatchObject({ dentistId: "u2", boxId: "box2", sobrecupo: true, start: await enSemana(page, 1, 10, 0) });

    // Se ve «Sobrecupo» en la tarjeta semanal, en la Diaria y en «Ver».
    await expect(main(page).getByRole("button", { name: /Sobrecupo/ })).toBeVisible();
    await main(page).getByRole("button", { name: "Diaria", exact: true }).click();
    await page.getByLabel("Elegir fecha").fill(await fechaEnSemana(page, 1));
    const fila = main(page).getByRole("row", { name: /Lucía Ferreira/ });
    await expect(fila.getByText("Sobrecupo", { exact: true })).toBeVisible();
    await fila.getByRole("button", { name: "Acciones de la cita" }).click();
    await page.getByRole("menuitem", { name: "Ver" }).click();
    await expect(page.getByRole("dialog").getByText("Sobrecupo", { exact: true })).toBeVisible();
  });

  test("sin «Sobreagendar» un horario ocupado no se ofrece; con «Sobreagendar», sí, marcado «Ya hay 1 cita»", async ({ page }) => {
    await semanaQueViene(page);
    // El espacio de las 10:00 lo tapa la cita: se abre desde el de las 10:30.
    const menu = await menuDeEspacio(page, 1, "10:30");
    await menu.getByRole("menuitem", { name: "Dar cita presencial" }).click();
    const cita = dialogo(page, "Dar cita");
    await cita.getByLabel("Box").selectOption("box2");
    await expect(cita.getByRole("button", { name: /^martes, .*10:00$/ })).toHaveCount(0);
    await cita.getByRole("checkbox", { name: /Sobreagendar/ }).check();
    await expect(cita.getByRole("button", { name: /^martes, .*10:00$/ })).toHaveAttribute("title", "Ya hay 1 cita");
    await expect(cita.getByRole("button", { name: /^martes, .*11:00$/ })).not.toHaveAttribute("title", /Ya hay/);
  });

  test("«Sobreagendar en este horario» del menú de un espacio abre «Dar cita» sobreagendando ese horario", async ({ page }) => {
    await semanaQueViene(page);
    // El espacio de las 10:00 del martes está tapado por la cita: se toca el de las 10:30 y se elige el de las 10:00 en el formulario.
    const menu = await menuDeEspacio(page, 1, "10:30");
    await menu.getByRole("menuitem", { name: "Sobreagendar en este horario" }).click();
    const cita = dialogo(page, "Dar cita");
    await expect(cita.getByRole("checkbox", { name: /Sobreagendar/ })).toBeChecked();
    await expect(cita.getByRole("button", { name: /^martes, .*10:30$/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("en la Diaria, el ⋮ de una cita y el modal «Ver» también sobreagendan", async ({ page }) => {
    await page.goto("/app/agenda");
    await page.getByLabel("Elegir fecha").fill(await fechaEnSemana(page, 1));
    const fila = main(page).getByRole("row", { name: /Camila Ortega/ });
    await fila.getByRole("button", { name: "Acciones de la cita" }).click();
    await page.getByRole("menuitem", { name: "Sobreagendar en este horario" }).click();
    let cita = dialogo(page, "Dar cita");
    await expect(cita.getByRole("checkbox", { name: /Sobreagendar/ })).toBeChecked();
    await expect(cita.getByRole("button", { name: /^martes, .*10:00$/ })).toHaveAttribute("aria-pressed", "true");
    await cita.getByRole("button", { name: "Cerrar" }).click();

    await fila.getByRole("button", { name: "Acciones de la cita" }).click();
    await page.getByRole("menuitem", { name: "Ver" }).click();
    await page.getByRole("dialog", { name: "Cita de origen" }).getByRole("button", { name: "Sobreagendar en este horario" }).click();
    cita = dialogo(page, "Dar cita");
    await expect(cita.getByRole("checkbox", { name: /Sobreagendar/ })).toBeChecked();
  });

  test("en el celular el «+» de la tarjeta se ve sin pasar el mouse, y al imprimir no sale", async ({ page, isMobile }) => {
    await semanaQueViene(page);
    const mas = main(page).getByRole("button", { name: /Cita de origen/ }).locator("..").getByRole("button", { name: "Sobreagendar en este horario" });
    if (isMobile) {
      await expect.poll(() => mas.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    } else {
      await expect.poll(() => mas.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
    }
    await page.emulateMedia({ media: "print" });
    await expect(mas).toBeHidden();
    await expect(main(page).getByRole("button", { name: /Cita de origen/ })).toBeVisible();
  });
});

/* ═══ A4 · Dar múltiples citas ═══ */

test("A4 · «Dar múltiples citas» abre «Dar cita» con «Multiconsulta (varias citas)» tildada y ese horario elegido", async ({ page }) => {
  await entrarDemo(page, USUARIOS_DEMO.recepcionista);
  await semanaQueViene(page);
  const menu = await menuDeEspacio(page, 0, "09:00");
  await menu.getByRole("menuitem", { name: "Dar múltiples citas" }).click();
  const cita = dialogo(page, "Dar cita");
  await expect(cita.getByRole("checkbox", { name: /Multiconsulta \(varias citas\)/ })).toBeChecked();
  await expect(cita.getByRole("button", { name: /^lunes, .*09:00$/ })).toHaveAttribute("aria-pressed", "true");
  await cita.getByRole("button", { name: /^miércoles, .*09:00$/ }).click();
  await expect(cita.getByRole("button", { name: "Crear 2 citas" })).toBeVisible();
});

/* ═══ A5 · Bloquear espacio ═══ */

test.describe("A5 · bloquear espacio", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page, USUARIOS_DEMO.recepcionista); });

  /** Bloquea desde el menú del espacio (día `dia` de la semana que viene) con lo que se le pase. */
  async function bloquear(page: Page, dia: number, hora: string, datos: { profesional?: string; hasta?: string; motivo?: string; repetir?: string; repetirHasta?: string } = {}) {
    const menu = await menuDeEspacio(page, dia, hora);
    await menu.getByRole("menuitem", { name: "Bloquear espacio" }).click();
    const modal = dialogo(page, "Bloquear espacio");
    await expect(modal.getByLabel("Fecha")).toHaveValue(await fechaEnSemana(page, dia));
    await expect(modal.getByLabel("Desde")).toHaveValue(hora);
    if (datos.profesional) await modal.getByLabel("Profesional").selectOption({ label: datos.profesional });
    if (datos.hasta) await modal.getByLabel("Hasta", { exact: true }).selectOption(datos.hasta);
    if (datos.motivo) await modal.getByRole("button", { name: datos.motivo, exact: true }).click();
    if (datos.repetir) await modal.getByLabel("Repetir", { exact: true }).selectOption({ label: datos.repetir });
    if (datos.repetirHasta) await modal.getByLabel("Repetir hasta").fill(datos.repetirHasta);
    return modal;
  }

  test("bloquea el horario: se dibuja rayado con el motivo, sale en la Diaria y «Dar cita» no lo ofrece (ni sobreagendando)", async ({ page }) => {
    await semanaQueViene(page);
    const modal = await bloquear(page, 2, "12:00", { profesional: "Dra. Sofía Benítez", hasta: "13:00", motivo: "Almuerzo" });
    await expect(modal.getByLabel("Motivo (opcional)")).toHaveValue("Almuerzo");
    await modal.getByRole("button", { name: "Bloquear", exact: true }).click();
    await expect(modal).toHaveCount(0);

    const bloqueos = (await leerDB(page)).agendaBlocks;
    expect(bloqueos).toHaveLength(1);
    expect(bloqueos[0]).toMatchObject({ dentistId: "u2", reason: "Almuerzo", start: await enSemana(page, 2, 12), end: await enSemana(page, 2, 13), createdBy: "Laura Recepción" });
    await expect(main(page).getByRole("button", { name: /^Bloqueado 12:00–13:00 · Almuerzo/ })).toBeVisible();

    // «Dar cita» con la Dra. Sofía ese día: ni las 12:00 ni las 12:30, tampoco sobreagendando.
    const menu = await menuDeEspacio(page, 2, "11:00");
    await menu.getByRole("menuitem", { name: "Dar cita presencial" }).click();
    const cita = dialogo(page, "Dar cita");
    await cita.getByLabel("Profesional").selectOption("u2");
    await expect(cita.getByRole("button", { name: /^miércoles, .*11:30$/ })).toBeVisible();
    await expect(cita.getByRole("button", { name: /^miércoles, .*12:00$/ })).toHaveCount(0);
    await cita.getByRole("checkbox", { name: /Sobreagendar/ }).check();
    await expect(cita.getByRole("button", { name: /^miércoles, .*12:30$/ })).toHaveCount(0);
    await expect(cita.getByRole("button", { name: /^miércoles, .*13:00$/ })).toBeVisible();
    // Con otro profesional el horario está libre.
    await cita.getByLabel("Profesional").selectOption("u4");
    await expect(cita.getByRole("button", { name: /^miércoles, .*12:00$/ })).toBeVisible();
    await cita.getByRole("button", { name: "Cerrar" }).click();

    await main(page).getByRole("button", { name: "Diaria", exact: true }).click();
    await page.getByLabel("Elegir fecha").fill(await fechaEnSemana(page, 2));
    await expect(main(page).getByRole("region", { name: "Espacios bloqueados" })).toContainText("12:00–13:00 Almuerzo · Dra. Sofía Benítez");
  });

  test("tocar el bloqueo ofrece «Quitar este bloqueo», y lo quita", async ({ page }) => {
    await semanaQueViene(page);
    const modal = await bloquear(page, 3, "15:00", { profesional: "Todos los profesionales", motivo: "Reunión" });
    await modal.getByRole("button", { name: "Bloquear", exact: true }).click();
    await main(page).getByRole("button", { name: /^Bloqueado 15:00–15:30 · Reunión/ }).click();
    const menu = page.getByRole("menu", { name: "Espacio bloqueado" });
    await expect(menu).toContainText("Todos los profesionales");
    await expect(menu.getByRole("menuitem")).toHaveText(["Quitar este bloqueo"]);
    await menu.getByRole("menuitem", { name: "Quitar este bloqueo" }).click();
    await expect(main(page).getByRole("button", { name: /^Bloqueado/ })).toHaveCount(0);
    expect((await leerDB(page)).agendaBlocks).toHaveLength(0);
  });

  test("«Repetir» todas las semanas crea un bloqueo por semana con la misma serie, y «Quitar toda la serie» los saca todos (con confirmación)", async ({ page }) => {
    await semanaQueViene(page);
    const hasta = await page.evaluate(async (f) => { const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + 21); return d.toLocaleDateString("en-CA"); }, await fechaEnSemana(page, 0));
    const modal = await bloquear(page, 0, "08:00", { profesional: "Dr. Diego Martínez", hasta: "09:00", motivo: "Capacitación", repetir: "Todas las semanas", repetirHasta: hasta });
    await expect(modal.getByRole("status").filter({ hasText: "4 bloqueos" })).toBeVisible();
    await modal.getByRole("button", { name: "Bloquear", exact: true }).click();
    const bloqueos = (await leerDB(page)).agendaBlocks;
    expect(bloqueos).toHaveLength(4);
    expect(new Set(bloqueos.map((b: { serieId: string }) => b.serieId)).size).toBe(1);

    await main(page).getByRole("button", { name: /^Bloqueado 08:00–09:00 · Capacitación/ }).click();
    const menu = page.getByRole("menu", { name: "Espacio bloqueado" });
    page.once("dialog", (d) => { expect(d.message()).toMatch(/4 bloqueos/); void d.accept(); });
    await menu.getByRole("menuitem", { name: /Quitar toda la serie/ }).click();
    await expect.poll(async () => (await leerDB(page)).agendaBlocks.length).toBe(0);
  });

  test("bloquear encima de citas que ya existen avisa y las deja en la agenda", async ({ page }) => {
    await conCitas(page, [{ id: "a_pisada", dia: 3, desde: [12, 0], hasta: [12, 30], title: "Cita que ya estaba" }]);
    await semanaQueViene(page);
    const modal = await bloquear(page, 3, "12:30", { profesional: "Todos los profesionales" });
    await modal.getByLabel("Desde").selectOption("12:00");
    await modal.getByLabel("Hasta", { exact: true }).selectOption("13:00");
    await expect(modal.getByRole("status").filter({ hasText: "Ya hay 1 cita en ese horario; siguen en la agenda." })).toBeVisible();
    await modal.getByRole("button", { name: "Bloquear", exact: true }).click();
    const db = await leerDB(page);
    expect(db.agendaBlocks).toHaveLength(1);
    expect(db.appointments.some((a: { id: string }) => a.id === "a_pisada")).toBe(true);
    await expect(main(page).getByRole("button", { name: /Cita que ya estaba/ })).toBeVisible();
  });

  test("«Hasta» tiene que ser después de «Desde»", async ({ page }) => {
    await semanaQueViene(page);
    const modal = await bloquear(page, 4, "10:00", { profesional: "Dra. Sofía Benítez" });
    await modal.getByLabel("Hasta", { exact: true }).selectOption("10:00");
    await modal.getByRole("button", { name: "Bloquear", exact: true }).click();
    await expect(modal.getByRole("alert")).toContainText("«Hasta» tiene que ser después de «Desde»");
    expect((await leerDB(page)).agendaBlocks).toHaveLength(0);
  });

  test("la Diaria global muestra el bloqueo como tarjeta gris en la columna del profesional", async ({ page }) => {
    const ini = await enSemana(page, 4, 9);
    const fin = await enSemana(page, 4, 10);
    await conDemo(page, (db: any, a: { ini: string; fin: string }) => {
      db.agendaBlocks.push({ id: "bl_global", clinicId: db.clinics[0].id, dentistId: "u4", start: a.ini, end: a.fin, reason: "Vacaciones", createdAt: a.ini, createdBy: "Laura Recepción" });
    }, { ini, fin });
    await page.goto("/app/agenda");
    await main(page).getByRole("button", { name: "Diaria global" }).click();
    await page.getByLabel("Elegir fecha").fill(await fechaEnSemana(page, 4));
    await expect(main(page).getByRole("button", { name: /^Bloqueado 09:00–10:00 · Vacaciones/ })).toBeVisible();
  });
});

/* ═══ Solo lectura ═══ */

test("el dentista ve la semanal en solo lectura: los espacios no abren menú, las citas no tienen «+» y los bloqueos se ven", async ({ page }) => {
  await entrarDemo(page, USUARIOS_DEMO.dentista);
  const ini = await enSemana(page, 2, 12);
  const fin = await enSemana(page, 2, 13);
  await conDemo(page, (db: any, a: { ini: string; fin: string }) => {
    db.agendaBlocks.push({ id: "bl_ro", clinicId: db.clinics[0].id, dentistId: "*", start: a.ini, end: a.fin, reason: "Almuerzo", createdAt: a.ini, createdBy: "Laura Recepción" });
  }, { ini, fin });
  await conCitas(page, [{ id: "a_ro", dia: 1, desde: [10, 0], hasta: [10, 30], title: "Cita para mirar" }]);
  await semanaQueViene(page);
  await expect(main(page).getByRole("button", { name: /Cita para mirar/ })).toBeVisible();
  await expect(main(page).getByRole("button", { name: await etiquetaEspacio(page, 0, "09:00"), exact: true })).toHaveCount(0);
  await expect(main(page).getByRole("button", { name: "Sobreagendar en este horario" })).toHaveCount(0);
  await expect(main(page).getByText("Almuerzo").first()).toBeVisible();
  await expect(main(page).getByRole("button", { name: /^Bloqueado/ })).toHaveCount(0);
});

/* ═══ A6 · Fecha en el calendario al dar cita ═══ */

test("A6 · «Ir a la fecha» lleva la agenda disponible a ese día, y lo elegido en otra semana se conserva", async ({ page }) => {
  await entrarDemo(page, USUARIOS_DEMO.recepcionista);
  await semanaQueViene(page);
  const menu = await menuDeEspacio(page, 0, "09:00");
  await menu.getByRole("menuitem", { name: "Dar múltiples citas" }).click();
  const cita = dialogo(page, "Dar cita");
  const ir = cita.getByLabel("Ir a la fecha");
  await expect(ir).toHaveAttribute("min", await page.evaluate(() => new Date().toLocaleDateString("en-CA")));
  const destino = await page.evaluate(async (f) => { const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + 23); return d.toLocaleDateString("en-CA"); }, await fechaEnSemana(page, 0));
  await ir.fill(destino);
  const [, mes, dia] = destino.split("-").map(Number);
  await expect(cita.locator(".grid-cols-7 > div").first()).toContainText(`${dia}/${mes}`);
  await cita.locator("button[aria-pressed='false']:not([disabled])").first().click();
  await expect(cita.getByRole("status")).toContainText("2 horarios elegidos");
  await expect(cita.getByRole("button", { name: "Crear 2 citas" })).toBeVisible();
});

/* ═══ A7 · Qué procedimiento se hace ═══ */

test.describe("A7 · procedimiento a realizar", () => {
  test("se tildan prestaciones del plan del paciente, se suma una del arancel y otro motivo, y se ven en la agenda", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await semanaQueViene(page);
    const menu = await menuDeEspacio(page, 0, "10:00");
    await menu.getByRole("menuitem", { name: "Dar cita presencial" }).click();
    const cita = dialogo(page, "Dar cita");
    await cita.getByRole("combobox", { name: "Paciente" }).fill("3.456.789");
    await cita.getByRole("option", { name: "3.456.789 | MARÍA GONZÁLEZ" }).click();

    const proc = cita.getByRole("group", { name: "Procedimiento a realizar" });
    const plan = proc.getByRole("group", { name: "Plan dental integral" });
    await expect(plan.getByRole("checkbox")).toHaveCount(3);
    await plan.getByRole("checkbox", { name: "Resina compuesta — 1 superficie · pieza 16" }).check();

    const buscador = proc.getByRole("combobox", { name: "Agregar otra prestación" });
    await buscador.fill("Blanqueamiento");
    const opcion = proc.getByRole("option", { name: /Blanqueamiento dental/ });
    await expect(opcion).not.toContainText("900"); // la recepción no ve precios
    await opcion.click();
    await proc.getByLabel("Otro motivo").fill("Control de sensibilidad");
    await proc.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(proc.getByRole("listitem")).toHaveCount(2); // las que no son del plan, con su «Quitar»

    await cita.getByRole("button", { name: "Crear cita" }).click();
    await expect(cita).toHaveCount(0);
    const nueva = (await leerDB(page)).appointments.find((a: any) => a.prestaciones?.length);
    expect(nueva.title).toBe("Resina compuesta — 1 superficie +2");
    expect(nueva.budgetId).toBe("g1");
    expect(nueva.prestaciones).toEqual([
      { cpt: "D2330", description: "Resina compuesta — 1 superficie", tooth: "16", budgetId: "g1", itemId: "gi1" },
      { cpt: "D9972", description: "Blanqueamiento dental (arcada)" },
      { description: "Control de sensibilidad" },
    ]);

    await expect(main(page).getByRole("button", { name: /Resina compuesta — 1 superficie \+2/ })).toBeVisible();
    await main(page).getByRole("button", { name: "Diaria", exact: true }).click();
    await page.getByLabel("Elegir fecha").fill(await fechaEnSemana(page, 0));
    const fila = main(page).getByRole("row", { name: /María González/ });
    await expect(fila).toContainText("Resina compuesta — 1 superficie · pieza 16");
    await fila.getByRole("button", { name: "Acciones de la cita" }).click();
    await page.getByRole("menuitem", { name: "Ver" }).click();
    const ver = page.getByRole("dialog", { name: "Resina compuesta — 1 superficie +2" });
    await expect(ver.getByRole("listitem")).toHaveText(["Resina compuesta — 1 superficie · pieza 16", "Blanqueamiento dental (arcada)", "Control de sensibilidad"]);
  });

  test("con «Ver montos» (comercial) el buscador del arancel muestra los precios", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.comercial);
    await page.goto("/app/agenda");
    await main(page).getByRole("button", { name: "Dar cita" }).click();
    const proc = dialogo(page, "Dar cita").getByRole("group", { name: "Procedimiento a realizar" });
    await proc.getByRole("combobox", { name: "Agregar otra prestación" }).fill("Blanqueamiento");
    await expect(proc.getByRole("option", { name: /Blanqueamiento dental/ })).toContainText("900");
  });
});
