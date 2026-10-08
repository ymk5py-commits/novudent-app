import type { Locator, Page } from "@playwright/test";
import { test, expect, entrarDemo, leerDB, sinScrollHorizontal, USUARIOS_DEMO } from "./soporte";
import { fechaCorta, sumarDias, tituloFecha } from "../lib/tareas";

/* «Todas las pendientes» (pedido de Camila, 8-oct-2026: «Debe salir todas las tareas, no solo las del día
   seleccionado»): la bandeja de Tareas abre con TODO lo que falta, de cualquier fecha.

   El seed arma las citas alrededor del lunes de la semana en curso, así que lo que «vence hoy» cambia según el día
   en que corre la prueba. Por eso estas pruebas dejan la demo sin citas, planes ni pagos (no hay tareas
   automáticas que dependan del día) y arman a mano las tareas propias que cada caso necesita. */

const main = (page: Page) => page.locator("main");
const titulo = (page: Page) => main(page).getByRole("heading", { level: 1 });
const pestana = (page: Page, nombre: RegExp) => main(page).getByRole("tab", { name: nombre });
const TODAS = /^Todas las pendientes/;
const DEL_DIA = /^Tareas del día/;
const ATRASADAS = /^Tareas atrasadas/;
const fechaBandeja = (page: Page) => page.getByLabel("Fecha", { exact: true });
const lista = (page: Page, nombre = "Todas las pendientes") => main(page).getByRole("list", { name: nombre });
const filas = (page: Page, nombre?: string) => lista(page, nombre).getByRole("listitem");
const filaDe = (page: Page, texto: string) => filas(page).filter({ hasText: texto });
/** El botón principal de cada fila: su nombre accesible es «Tipo — Paciente — estado …». */
const botonesDeFila = (page: Page, nombre?: string) => lista(page, nombre).getByRole("button", { name: / — / });
/** La fecha de una fila, la que se ve (hay una para el celular y otra para la pantalla ancha). */
const fechaVisible = (fila: Locator, texto: string) => fila.getByText(texto, { exact: true }).filter({ visible: true });
/** `text-state-err` (#C81E1E): el rojo de lo atrasado. */
const ROJO = "rgb(200, 30, 30)";
const NO_ROJO = /^(?!rgb\(200, 30, 30\)$)/;

/** Que nada de la bandeja se salga de la pantalla. En el celular, lo que se sale NO siempre hace scrollear: Chrome ensancha la ventana
 *  (`scrollWidth <= innerWidth` no lo ve, crecen juntos) o directamente lo recorta (la raíz mide lo de la ventana, el `body` lo que de verdad
 *  ocupa). Por eso se mira también el ancho con el que se abrió la página y el del `body`. */
async function sinEnsancharLaVentana(page: Page) {
  const { ancho, cuerpo } = await page.evaluate(() => ({ ancho: innerWidth, cuerpo: document.body.scrollWidth }));
  expect(ancho, "la ventana se ensanchó: algo de la página se sale de la pantalla").toBe(page.viewportSize()!.width);
  expect(cuerpo, `la página ocupa ${cuerpo}px y la ventana ${ancho}px: algo se sale de la pantalla y queda recortado`).toBeLessThanOrEqual(ancho);
  await sinScrollHorizontal(page);
}

const hoyDe = (page: Page) => page.evaluate(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});
/** El número que acompaña a una pestaña: «Tareas atrasadas3» → 3. */
async function contador(tab: Locator) {
  return Number(/(\d+)$/.exec((await tab.textContent()) ?? "")?.[1]);
}

interface Tarea {
  id: string;
  title: string;
  /** Días desde hoy (negativo = atrasada). `null` = sin fecha (dato viejo: flota en hoy). */
  dias: number | null;
  /** Ya hecha hoy con «Cerrar el caso»: figura con su ✓ en «Tareas del día» y no es pendiente. */
  hecha?: true;
  extra?: Record<string, unknown>;
}

/** Deja la demo sin citas, planes ni pagos y con estas tareas propias (de Carlos Admin, `u1`, salvo que se pida otro creador o `extra` diga otra cosa). */
async function conTareas(page: Page, tareas: Tarea[], creador = "u1") {
  await page.evaluate(`(() => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4"));
    const d = new Date();
    const hoy = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const mas = (n) => { const x = new Date(hoy + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    db.appointments = []; db.budgets = []; db.payments = [];
    db.mgmtTasks = ${JSON.stringify(tareas)}.map((t) => ({
      clinicId: "cl_demo", type: "personalizada", status: "pendiente", createdBy: ${JSON.stringify(creador)}, createdAt: new Date().toISOString(),
      ...(t.dias == null ? {} : { dueDate: mas(t.dias) }),
      ...(t.hecha ? { status: "cerrada", resolution: "ejecutada", gestiones: [{ fecha: hoy, at: new Date().toISOString(), by: ${JSON.stringify(creador)}, byName: "Quien la hizo", accion: "cerrar" }] } : {}),
      ...t.extra, id: t.id, title: t.title,
    }));
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  })()`);
}

/** El caso de casi todas las pruebas: seis pendientes de fechas muy distintas (una de Paola) y una ya hecha. */
const PENDIENTES: Tarea[] = [
  { id: "t_vieja", title: "Renovar la matrícula", dias: -20 },
  { id: "t_ayer", title: "Llamar al laboratorio por la prótesis", dias: -1 },
  { id: "t_hoy", title: "Pedir guantes y anestesia", dias: 0 },
  { id: "t_manana", title: "Llevar la factura al contador", dias: 1 },
  { id: "t_paola", title: "Confirmar el turno del escáner", dias: 3, extra: { assigneeId: "u3" } },
  { id: "t_lejana", title: "Renovar el seguro del consultorio", dias: 75 },
];
const CASO: Tarea[] = [
  // Desordenadas a propósito: el orden de la lista no puede depender del orden en que se guardaron.
  PENDIENTES[5], PENDIENTES[2], PENDIENTES[0], PENDIENTES[4], PENDIENTES[1], PENDIENTES[3],
  { id: "t_hecha", title: "Tarea que ya se hizo", dias: 2, hecha: true },
];

/** Entra como administrador, arma el caso y abre la página. Devuelve «hoy» (el de la clínica). */
async function abrir(page: Page, tareas: Tarea[] = CASO, url = "/app/tareas") {
  await entrarDemo(page);
  await conTareas(page, tareas);
  await page.goto(url);
  return hoyDe(page);
}

test.describe("Bandeja de tareas — «Todas las pendientes»", () => {
  test("abre con todas las pendientes de cualquier fecha, de la más vieja a la más nueva, con la fecha en cada fila", async ({ page }) => {
    const hoy = await abrir(page);

    // Es la primera pestaña y la que está elegida.
    const tabs = main(page).getByRole("tablist", { name: "Listas de tareas" }).getByRole("tab");
    await expect(tabs.first()).toHaveAccessibleName(/^Todas las pendientes\s*6$/);
    await expect(tabs).toHaveCount(3);
    expect(await contador(tabs.first())).toBe(6);
    await expect(pestana(page, TODAS)).toHaveAttribute("aria-selected", "true");
    await expect(pestana(page, DEL_DIA)).toHaveAttribute("aria-selected", "false");
    await expect(titulo(page)).toHaveText("Tareas pendientes");
    // Sin navegación por día: no hay a qué día ir.
    await expect(fechaBandeja(page)).toHaveCount(0);
    await expect(main(page).getByRole("button", { name: "Anterior" })).toHaveCount(0);
    await expect(main(page).getByRole("button", { name: "Siguiente" })).toHaveCount(0);

    // Las seis pendientes —atrasadas, de hoy y futuras— en orden; la que ya se hizo no.
    await expect(filas(page)).toHaveCount(6);
    await expect(filas(page)).toContainText(PENDIENTES.map((t) => t.title));
    await expect(main(page)).not.toContainText("Tarea que ya se hizo");

    // La fecha está en cada fila; las atrasadas, en rojo.
    for (const t of PENDIENTES) {
      const fecha = fechaVisible(filaDe(page, t.title), fechaCorta(sumarDias(hoy, t.dias!), hoy));
      await expect(fecha, t.title).toHaveCount(1);
      await expect(fecha, t.title).toHaveCSS("color", t.dias! < 0 ? ROJO : NO_ROJO);
    }
    // Y quien lee con un lector de pantalla las oye: «atrasada, fecha» o la fecha de la que viene.
    await expect(botonesDeFila(page).nth(0)).toHaveAccessibleName(new RegExp(`pendiente \\(atrasada, ${fechaCorta(sumarDias(hoy, -20), hoy)}\\)$`));
    await expect(botonesDeFila(page).nth(3)).toHaveAccessibleName(new RegExp(`pendiente \\(${fechaCorta(sumarDias(hoy, 1), hoy)}\\)$`));
    await sinEnsancharLaVentana(page);
  });

  test("«Tareas del día» y «Tareas atrasadas» siguen siendo lo que eran, y se vuelve a «Todas» sin perder nada", async ({ page }) => {
    const hoy = await abrir(page);

    await pestana(page, DEL_DIA).click();
    await expect(pestana(page, DEL_DIA)).toHaveAttribute("aria-selected", "true");
    await expect(titulo(page)).toHaveText(`Tareas - ${tituloFecha(hoy, hoy)}`);
    await expect(fechaBandeja(page)).toHaveValue(hoy);
    // Hoy: la que vence hoy (pendiente) y la que se hizo hoy (✓). Nada de otros días.
    await expect(filas(page, "Tareas del día")).toHaveCount(2);
    await expect(filas(page, "Tareas del día")).toContainText(["Pedir guantes y anestesia", "Tarea que ya se hizo"]);
    await expect(main(page).getByLabel("Esconder tareas completadas por sistema")).toBeVisible();

    await pestana(page, ATRASADAS).click();
    await expect(filas(page, "Tareas atrasadas")).toHaveCount(2);
    await expect(filas(page, "Tareas atrasadas")).toContainText(["Renovar la matrícula", "Llamar al laboratorio por la prótesis"]);
    expect(await contador(pestana(page, ATRASADAS))).toBe(2);

    await pestana(page, TODAS).click();
    await expect(titulo(page)).toHaveText("Tareas pendientes");
    await expect(fechaBandeja(page)).toHaveCount(0);
    await expect(filas(page)).toHaveCount(6);
    // «Esconder tareas completadas por sistema» solo tiene sentido en «Tareas del día»: acá no hay ninguna que esconder.
    await expect(main(page).getByLabel("Esconder tareas completadas por sistema")).toHaveCount(0);
    expect(await contador(pestana(page, TODAS))).toBe(6);
    await sinEnsancharLaVentana(page);
  });

  test("el contador de la pestaña cuenta lo que se ve con los filtros", async ({ page }) => {
    await abrir(page);
    const filtrar = main(page).getByRole("button", { name: /Filtrar por/ });

    await filtrar.click();
    await page.getByRole("menuitem", { name: "Sin asignar" }).click();
    await expect(filas(page)).toHaveCount(5);
    await expect(main(page)).not.toContainText("Confirmar el turno del escáner");
    expect(await contador(pestana(page, TODAS))).toBe(5);

    await filtrar.click();
    await page.getByRole("menuitem", { name: "Asignadas a mí" }).click();
    await expect(main(page).getByText("No hay tareas pendientes.")).toBeVisible();
    expect(await contador(pestana(page, TODAS))).toBe(0);

    await filtrar.click();
    await page.getByRole("menuitem", { name: "Todas" }).last().click();
    await expect(filas(page)).toHaveCount(6);
    expect(await contador(pestana(page, TODAS))).toBe(6);
  });

  test("una postergada («Volver a contactar en…») sigue pendiente en su fecha de regreso, marcada «Postergada»", async ({ page }) => {
    const hoy = await abrir(page);
    const nueva = sumarDias(hoy, 20);

    await filaDe(page, "Llevar la factura al contador").getByRole("button", { name: /^Personalizada — / }).click();
    await main(page).getByRole("button", { name: /^Finalizar/ }).click();
    await page.getByRole("menuitem", { name: /Volver a contactar en/ }).click();
    await page.getByRole("radio", { name: "Elegí una fecha" }).check();
    await page.getByLabel("Nueva fecha").fill(nueva);
    await page.getByRole("button", { name: "Finalizar y generar nueva tarea" }).click();
    await expect(main(page).getByRole("status").filter({ hasText: "Tarea completada" })).toContainText("Paciente será contactado nuevamente");

    // Sigue en «Todas las pendientes» —no desaparece—, ahora en su fecha de regreso y con la marca. La ✓ de hoy no cuenta.
    await expect(filas(page)).toHaveCount(6);
    await expect(filas(page)).toContainText([
      "Renovar la matrícula", "Llamar al laboratorio por la prótesis", "Pedir guantes y anestesia",
      "Confirmar el turno del escáner", "Llevar la factura al contador", "Renovar el seguro del consultorio",
    ]);
    const postergada = filaDe(page, "Llevar la factura al contador");
    await expect(fechaVisible(postergada, fechaCorta(nueva, hoy))).toHaveCount(1);
    await expect(postergada.getByText("Postergada").filter({ visible: true })).toHaveCount(1);
    await expect(postergada.getByRole("button", { name: / — / })).toHaveAccessibleName(new RegExp(`pendiente \\(postergada, ${fechaCorta(nueva, hoy)}\\)$`));
    // Las demás no la llevan: una tarea que simplemente vence más adelante no es una postergada.
    await expect(main(page).getByText("Postergada").filter({ visible: true })).toHaveCount(1);
    expect(await contador(pestana(page, TODAS))).toBe(6);

    // «Tareas atrasadas» no la cuenta, y en «Tareas del día» de la fecha nueva está, sin marca.
    await pestana(page, DEL_DIA).click();
    await fechaBandeja(page).fill(nueva);
    await expect(filas(page, "Tareas del día")).toContainText(["Llevar la factura al contador"]);
    await expect(main(page).getByText("Postergada")).toHaveCount(0);
    expect(await contador(pestana(page, ATRASADAS))).toBe(2);

    // Se guardó como siempre: la fecha nueva y la gestión.
    const guardada = (await leerDB(page)).mgmtTasks.find((t: { id: string }) => t.id === "t_manana");
    expect(guardada).toMatchObject({ status: "pendiente", dueDate: nueva });
    expect(guardada.gestiones.at(-1)).toMatchObject({ accion: "recontactar", hasta: nueva });
  });

  test("trabajar una tarea desde la lista la saca de las pendientes y baja el contador", async ({ page }) => {
    await abrir(page);
    await filaDe(page, "Pedir guantes y anestesia").getByRole("button", { name: /^Personalizada — / }).click();
    await expect(main(page).getByRole("heading", { name: "Tarea interna" })).toBeVisible();
    await main(page).getByRole("button", { name: /^Finalizar/ }).click();
    await page.getByRole("menuitem", { name: "Cerrar el caso" }).click();

    await expect(main(page).getByRole("status").filter({ hasText: "Tarea completada" })).toContainText("la tarea se ejecutó");
    await expect(filas(page)).toHaveCount(5);
    await expect(lista(page)).not.toContainText("Pedir guantes y anestesia");
    expect(await contador(pestana(page, TODAS))).toBe(5);

    await page.reload();
    await expect(filas(page)).toHaveCount(5);
    await expect(lista(page)).not.toContainText("Pedir guantes y anestesia");
  });

  test("el «OK» de una personalizada la deja pendiente para la semana que viene: se reacomoda en la lista, sin marca de postergada", async ({ page }) => {
    const hoy = await abrir(page);
    await filaDe(page, "Pedir guantes y anestesia").getByRole("button", { name: /^Personalizada — / }).click();
    await main(page).getByRole("button", { name: /^Finalizar/ }).click();
    await page.getByRole("menuitem", { name: "El paciente dice OK" }).click();

    await expect(filas(page)).toHaveCount(6);
    await expect(filas(page)).toContainText([
      "Renovar la matrícula", "Llamar al laboratorio por la prótesis", "Llevar la factura al contador",
      "Confirmar el turno del escáner", "Pedir guantes y anestesia", "Renovar el seguro del consultorio",
    ]);
    await expect(fechaVisible(filaDe(page, "Pedir guantes y anestesia"), fechaCorta(sumarDias(hoy, 7), hoy))).toHaveCount(1);
    await expect(main(page).getByText("Postergada")).toHaveCount(0);
  });

  test("los enlaces con ?fecha=…&tarea=… siguen abriendo «Tareas del día» de ese día, con la tarea elegida", async ({ page }) => {
    const hoy = await abrir(page);
    const manana = sumarDias(hoy, 1);
    await page.goto(`/app/tareas?fecha=${manana}&tarea=t_manana`);

    await expect(pestana(page, DEL_DIA)).toHaveAttribute("aria-selected", "true");
    await expect(fechaBandeja(page)).toHaveValue(manana);
    await expect(titulo(page)).toHaveText(`Tareas - ${tituloFecha(manana, hoy)}`);
    await expect(filas(page, "Tareas del día")).toContainText(["Llevar la factura al contador"]);
    await expect(botonesDeFila(page, "Tareas del día").first()).toHaveAttribute("aria-current", "true");
    await expect(main(page).getByRole("button", { name: /^Finalizar/ })).toBeVisible();

    // Y desde ahí se pasa a «Todas» cuando se quiere ver el panorama.
    await pestana(page, TODAS).click();
    await expect(titulo(page)).toHaveText("Tareas pendientes");
    await expect(filas(page)).toHaveCount(6);
  });

  test("sin fecha, o con una fecha que no existe, el enlace no cambia de lista: abre «Todas las pendientes»", async ({ page }) => {
    await abrir(page);
    await page.goto("/app/tareas?tarea=t_ayer");
    await expect(pestana(page, TODAS)).toHaveAttribute("aria-selected", "true");
    await expect(botonesDeFila(page).nth(1)).toHaveAttribute("aria-current", "true"); // la tarea elegida se ve en la lista
    await expect(main(page).getByRole("button", { name: /^Finalizar/ })).toBeVisible();

    await page.goto("/app/tareas?fecha=2026-02-31&tarea=t_ayer");
    await expect(pestana(page, TODAS)).toHaveAttribute("aria-selected", "true");
    await expect(titulo(page)).toHaveText("Tareas pendientes");
  });

  test("al entrar por un enlace de la ficha (navegación sin recargar) se abre el día del enlace, sin pintar antes «Todas las pendientes»", async ({ page }) => {
    const hoy = await abrir(page, [{ id: "t_ficha", title: "Agendar la evaluación de la prótesis", dias: 5, extra: { patientId: "p1", patientName: "María González" } }], "/app/pacientes/p1");
    await main(page).getByRole("button", { name: "Datos personales", exact: true }).click();
    await main(page).getByRole("button", { name: "Tareas de gestión" }).click();
    const enlace = main(page).getByRole("link", { name: /Ver en la bandeja/ });
    await expect(enlace).toHaveAttribute("href", `/app/tareas?fecha=${sumarDias(hoy, 5)}&tarea=t_ficha`); // el enlace de siempre: no cambió
    // Se anota qué pestaña está elegida en cada cuadro que pinta el navegador mientras se navega.
    await page.evaluate(() => {
      const w = window as unknown as { __cuadros: string[]; __raf: number };
      w.__cuadros = [];
      const mirar = () => {
        const elegida = document.querySelector('[role="tablist"][aria-label="Listas de tareas"] [role="tab"][aria-selected="true"]');
        if (elegida) w.__cuadros.push(elegida.textContent ?? "");
        w.__raf = requestAnimationFrame(mirar);
      };
      w.__raf = requestAnimationFrame(mirar);
    });
    await enlace.click();
    await page.waitForURL(/\/app\/tareas\?fecha=/);
    await expect(pestana(page, DEL_DIA)).toHaveAttribute("aria-selected", "true");
    await expect(fechaBandeja(page)).toHaveValue(sumarDias(hoy, 5));
    await expect(filas(page, "Tareas del día")).toContainText(["Agendar la evaluación de la prótesis"]);
    await page.waitForTimeout(300); // unos cuadros más, por si algo se movía después
    const cuadros = await page.evaluate(() => {
      const w = window as unknown as { __cuadros: string[]; __raf: number };
      cancelAnimationFrame(w.__raf);
      return w.__cuadros;
    });
    expect(cuadros.length, "se llegaron a pintar cuadros con las pestañas").toBeGreaterThan(0);
    expect(cuadros.filter((c) => /^Todas/.test(c)), "se pintó «Todas las pendientes» antes del día del enlace").toEqual([]);
  });

  test("un texto largo sin cortes no ensancha la página, ni en la lista ni con el panel abierto", async ({ page }) => {
    await abrir(page, [
      { id: "t_larga", title: "Llamar_a_la_Dra_Sofía_Benítez_para_coordinar_la_entrega_de_la_prótesis_total_superior_del_paciente_Marco_Giménez", dias: 40 },
      { id: "t_vieja", title: "Renovar la matrícula", dias: -400 },
      { id: "t_lejana", title: "Renovar el seguro", dias: 400 },
    ]);
    await expect(filas(page)).toHaveCount(3);
    await sinEnsancharLaVentana(page);
    await filaDe(page, "Llamar_a_la_Dra").getByRole("button", { name: /^Personalizada — / }).click();
    await expect(main(page).getByRole("button", { name: /^Finalizar/ })).toBeVisible();
    await sinEnsancharLaVentana(page);
  });
});

test.describe("Bandeja de tareas — «Todas las pendientes» con las automáticas", () => {
  test("incluye lo atrasado, lo de hoy y lo que viene, y trae todas las atrasadas que ya mostraba «Tareas atrasadas»", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/tareas");
    await expect(pestana(page, TODAS)).toHaveAttribute("aria-selected", "true");
    const total = await contador(pestana(page, TODAS));
    const atrasadas = await contador(pestana(page, ATRASADAS));
    expect(total).toBeGreaterThanOrEqual(atrasadas);
    expect(atrasadas).toBeGreaterThan(0); // la demo trae la cobranza de Marco Giménez, vencida
    await expect(filas(page)).toHaveCount(total);

    const deTodas = await botonesDeFila(page).evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
    await pestana(page, ATRASADAS).click();
    const deAtrasadas = await botonesDeFila(page, "Tareas atrasadas").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
    expect(deAtrasadas).toHaveLength(atrasadas);
    for (const a of deAtrasadas) expect(deTodas).toContain(a);
    // Y las atrasadas son las primeras de la lista: va de la más vieja a la más nueva.
    expect(deTodas.slice(0, atrasadas).sort()).toEqual([...deAtrasadas].sort());
    await sinEnsancharLaVentana(page);
  });

  test("una automática postergada con «Volver a contactar en…» queda en su fecha de regreso, marcada «Postergada»", async ({ page }) => {
    await entrarDemo(page);
    // Juan Ríos faltó hoy a su única cita: la tarea de cita (re-agenda) vence hoy.
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
      const ini = new Date(); ini.setHours(10, 0, 0, 0);
      const fin = new Date(ini); fin.setMinutes(40);
      db.appointments = db.appointments.filter((a: { patientId: string }) => a.patientId !== "p2");
      db.appointments.push({
        id: "a_e2e_ausente", clinicId: "cl_demo", patientId: "p2", dentistId: "u2", title: "Consulta E2E",
        start: ini.toISOString(), end: fin.toISOString(), status: "ausente", amount: 0, discount: 0,
      });
      localStorage.setItem("novudent.db.v4", JSON.stringify(db));
    });
    await page.goto("/app/tareas");
    const hoy = await hoyDe(page);
    const nueva = sumarDias(hoy, 10);
    const antes = await contador(pestana(page, TODAS));

    await main(page).getByRole("button", { name: /^Cita — Juan Ríos — pendiente/ }).click();
    await main(page).getByRole("button", { name: /^Finalizar/ }).click();
    await page.getByRole("menuitem", { name: /Volver a contactar en/ }).click();
    await page.getByRole("radio", { name: "Elegí una fecha" }).check();
    await page.getByLabel("Nueva fecha").fill(nueva);
    await page.getByRole("button", { name: "Finalizar y generar nueva tarea" }).click();

    const fila = filas(page).filter({ hasText: "Juan Ríos" });
    await expect(fila).toHaveCount(1);
    await expect(fechaVisible(fila, fechaCorta(nueva, hoy))).toHaveCount(1);
    await expect(fila.getByText("Postergada").filter({ visible: true })).toHaveCount(1);
    expect(await contador(pestana(page, TODAS))).toBe(antes); // no se perdió ni se duplicó nada
    await sinEnsancharLaVentana(page);
  });
});

test.describe("Bandeja de tareas — «Todas las pendientes» según el rol", () => {
  test("la dentista no ve cobranza, cheques ni montos en la lista nueva", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    await page.goto("/app/tareas");
    await expect(pestana(page, TODAS)).toHaveAttribute("aria-selected", "true");
    await expect(titulo(page)).toHaveText("Tareas pendientes");
    await expect(main(page).getByRole("button", { name: /^(Cobranza|Cheque) —/ })).toHaveCount(0);
    await expect(main(page)).not.toContainText(/Gs\.?\s?\d/);
    // Lo suyo sí está: la tarea sobre su paciente Marco Giménez.
    await expect(main(page).getByRole("button", { name: /^Personalizada — Marco Giménez — pendiente/ })).toBeVisible();
    await sinEnsancharLaVentana(page);
  });
});

/* ═══════════════════════════ Mi agenda (Inicio) · pestaña «Todas» ═══════════════════════════ */

const tabAgenda = (page: Page, nombre: "Hoy" | "Semana" | "Todas") => page.getByRole("tab", { name: nombre, exact: true });
const panelAgenda = (page: Page, nombre: "Agenda de hoy" | "Agenda de la semana" | "Todas las pendientes") => page.getByRole("tabpanel", { name: nombre });
const avanceAgenda = (page: Page) => page.getByRole("progressbar", { name: "Avance de la agenda" });
/** Un renglón de Mi agenda por su texto. */
const renglon = (panel: Locator, texto: string) => panel.getByRole("listitem").filter({ hasText: texto });
/** Lo que se ve del renglón en orden: los títulos de todos los renglones del panel. */
const titulosDe = (panel: Locator) => panel.getByRole("listitem").locator("p.font-semibold");
const TITULO_SECCION = "h3";

/** Entra como `usuario`, arma las tareas de `creador` y abre Inicio. Devuelve «hoy» (el de la clínica). */
async function abrirAgenda(page: Page, usuario: string, creador: string, tareas: Tarea[]) {
  await entrarDemo(page, usuario);
  await conTareas(page, tareas, creador);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Mi agenda" })).toBeVisible();
  return hoyDe(page);
}

/** El caso de la dentista: mis pendientes de cualquier fecha, una hecha hoy y una de otra persona. */
const DE_LA_DENTISTA: Tarea[] = [
  { id: "d_lejana", title: "Renovar el seguro del consultorio", dias: 200 },
  { id: "d_hoy", title: "Pedir guantes y anestesia", dias: 0 },
  { id: "d_vieja", title: "Renovar la matrícula", dias: -30 },
  { id: "d_diez", title: "Llevar el equipo a calibrar", dias: 10 },
  { id: "d_ayer", title: "Llamar al laboratorio por la prótesis", dias: -1 },
  { id: "d_manana", title: "Confirmar el turno del escáner", dias: 1 },
  { id: "d_hecha", title: "Tarea que ya hice", dias: 0, hecha: true },
  { id: "d_ajena", title: "Tarea de otra persona", dias: 2, extra: { createdBy: "u1" } },
];

test.describe("Mi agenda — pestaña «Todas»", () => {
  test("junta mis pendientes de cualquier fecha: las atrasadas primero y después cada día; sin las hechas ni las de otros", async ({ page }) => {
    const hoy = await abrirAgenda(page, USUARIOS_DEMO.dentista, "u2", DE_LA_DENTISTA);

    // «Hoy» sigue igual: lo de hoy, lo atrasado y lo que ya hice, con su avance.
    await expect(tabAgenda(page, "Hoy")).toHaveAttribute("aria-selected", "true");
    await expect(avanceAgenda(page)).toHaveAttribute("aria-valuetext", "1 de 4 hechas");

    await tabAgenda(page, "Todas").click();
    await expect(tabAgenda(page, "Todas")).toHaveAttribute("aria-selected", "true");
    const panel = panelAgenda(page, "Todas las pendientes");
    await expect(panel).toBeVisible();

    // Seis pendientes —dos atrasadas— en orden. No está la que hice ni la de otra persona.
    await expect(titulosDe(panel)).toHaveText([
      "Renovar la matrícula", "Llamar al laboratorio por la prótesis", "Pedir guantes y anestesia",
      "Confirmar el turno del escáner", "Llevar el equipo a calibrar", "Renovar el seguro del consultorio",
    ]);
    await expect(panel).not.toContainText("Tarea que ya hice");
    await expect(panel).not.toContainText("Tarea de otra persona");
    await expect(page.getByText(/^6 pendientes/)).toContainText("· 2 atrasadas");

    // Atrasadas aparte, y después un grupo por día con su fecha.
    await expect(panel.getByRole("region", { name: "Atrasadas" }).getByRole("listitem")).toHaveCount(2);
    await expect(panel.getByRole("region", { name: tituloFecha(hoy, hoy) }).getByRole("listitem")).toHaveCount(1);
    await expect(panel.getByRole("region", { name: tituloFecha(sumarDias(hoy, 1), hoy) })).toContainText("Confirmar el turno del escáner");
    await expect(panel.getByRole("region", { name: tituloFecha(sumarDias(hoy, 10), hoy) })).toContainText("Llevar el equipo a calibrar");
    await expect(panel.getByRole("region", { name: tituloFecha(sumarDias(hoy, 200), hoy) })).toContainText("Renovar el seguro del consultorio");
    await expect(panel.locator(TITULO_SECCION)).toHaveCount(5); // atrasadas + 4 días

    // Seis es menos que el tope: no hace falta mandar a ningún lado.
    await expect(page.getByRole("link", { name: "Ver todas en Tareas" })).toHaveCount(0);
  });

  test("el avance de «Todas» cuenta solo pendientes: no hay barra ni «X de Y hechas», y tildar una la saca de la lista", async ({ page }) => {
    await abrirAgenda(page, USUARIOS_DEMO.dentista, "u2", DE_LA_DENTISTA);
    await tabAgenda(page, "Todas").click();
    const panel = panelAgenda(page, "Todas las pendientes");

    await expect(page.getByText(/^6 pendientes/)).toBeVisible();
    await expect(avanceAgenda(page)).toHaveCount(0);
    await expect(page.getByText(/ hechas/)).toHaveCount(0);

    await page.getByRole("button", { name: "Marcar como hecha: Pedir guantes y anestesia" }).click();
    await expect(page.getByText(/^5 pendientes/)).toContainText("· 2 atrasadas");
    await expect(panel).not.toContainText("Pedir guantes y anestesia");
    await expect(panel.locator("button[aria-pressed=true]")).toHaveCount(0); // nada hecho a la vista

    // La tarea quedó hecha de verdad: en «Hoy» está entre las hechas, y el avance de «Hoy» la cuenta.
    await tabAgenda(page, "Hoy").click();
    await expect(avanceAgenda(page)).toHaveAttribute("aria-valuetext", "2 de 4 hechas");
    await expect(panelAgenda(page, "Agenda de hoy").getByRole("region", { name: "Hechas" })).toContainText("Pedir guantes y anestesia");
  });

  test("con más de 10 pendientes muestra las primeras 10 y un enlace «Ver todas en Tareas» que abre «Todas las pendientes»", async ({ page }) => {
    const muchas: Tarea[] = [
      ...[-40, -20, -3].map((d, i) => ({ id: `m_a${i}`, title: `Atrasada ${String(i + 1).padStart(2, "0")}`, dias: d })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `m_f${i}`, title: `Futura ${String(i + 1).padStart(2, "0")}`, dias: i + 1 })),
    ];
    await abrirAgenda(page, USUARIOS_DEMO.dentista, "u2", muchas);
    await tabAgenda(page, "Todas").click();
    const panel = panelAgenda(page, "Todas las pendientes");

    await expect(page.getByText(/^13 pendientes/)).toContainText("· 3 atrasadas");
    await expect(panel.getByRole("listitem")).toHaveCount(10);
    // Las 10 primeras en el orden en que se ven: las 3 atrasadas y 7 días.
    await expect(titulosDe(panel)).toHaveText([
      "Atrasada 01", "Atrasada 02", "Atrasada 03", "Futura 01", "Futura 02", "Futura 03", "Futura 04", "Futura 05", "Futura 06", "Futura 07",
    ]);
    await expect(panel).toContainText("Mostrando 10 de 13 pendientes.");

    const enlace = panel.getByRole("link", { name: "Ver todas en Tareas" });
    await expect(enlace).toHaveAttribute("href", "/app/tareas");
    await enlace.click();
    await page.waitForURL(/\/app\/tareas$/);
    await expect(pestana(page, TODAS)).toHaveAttribute("aria-selected", "true");
    await expect(titulo(page)).toHaveText("Tareas pendientes");
    await expect(filas(page)).toHaveCount(13); // ahí está todo, no solo las 10
    expect(await contador(pestana(page, TODAS))).toBe(13);
  });

  test("justo 10 pendientes se ven todas y no hay enlace", async ({ page }) => {
    const diez: Tarea[] = Array.from({ length: 10 }, (_, i) => ({ id: `d_${i}`, title: `Pendiente ${String(i + 1).padStart(2, "0")}`, dias: i }));
    await abrirAgenda(page, USUARIOS_DEMO.dentista, "u2", diez);
    await tabAgenda(page, "Todas").click();
    await expect(page.getByText(/^10 pendientes/)).toBeVisible();
    await expect(panelAgenda(page, "Todas las pendientes").getByRole("listitem")).toHaveCount(10);
    await expect(page.getByRole("link", { name: "Ver todas en Tareas" })).toHaveCount(0);
    await expect(page.getByText(/Mostrando/)).toHaveCount(0);
  });

  test("sin pendientes lo dice, y una tarea con fecha lejana se ve apenas se agrega", async ({ page }) => {
    const hoy = await abrirAgenda(page, USUARIOS_DEMO.dentista, "u2", []);
    await tabAgenda(page, "Todas").click();
    const panel = panelAgenda(page, "Todas las pendientes");
    await expect(page.getByText("Sin pendientes", { exact: true })).toBeVisible();
    await expect(panel).toContainText("No tenés nada pendiente.");

    const lejana = sumarDias(hoy, 300);
    await page.getByLabel("Nueva tarea").fill("Renovar el contrato del local");
    await page.getByLabel("Día de la tarea").fill(lejana);
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Tarea agregada." })).toBeVisible(); // en «Todas» se ve ahí mismo: no hace falta decir «la vas a ver ese día»
    await expect(page.getByText(/^1 pendiente/)).toBeVisible();
    await expect(panel.getByRole("region", { name: tituloFecha(lejana, hoy) })).toContainText("Renovar el contrato del local");
  });

  test("las pestañas Hoy · Semana · Todas se recorren con el teclado: flechas con vuelta, Inicio y Fin", async ({ page }) => {
    await abrirAgenda(page, USUARIOS_DEMO.dentista, "u2", DE_LA_DENTISTA);
    const [hoyTab, semanaTab, todasTab] = [tabAgenda(page, "Hoy"), tabAgenda(page, "Semana"), tabAgenda(page, "Todas")];
    /** Elegida y con el foco solo `tab`; las otras no entran con Tab (patrón de pestañas de ARIA). */
    const elegida = async (tab: Locator) => {
      for (const t of [hoyTab, semanaTab, todasTab]) {
        await expect(t).toHaveAttribute("aria-selected", String(t === tab));
        await expect(t).toHaveAttribute("tabindex", t === tab ? "0" : "-1");
      }
      await expect(tab).toBeFocused();
    };
    await hoyTab.focus();
    await elegida(hoyTab);
    await page.keyboard.press("ArrowRight"); await elegida(semanaTab);
    await page.keyboard.press("ArrowRight"); await elegida(todasTab);
    await expect(panelAgenda(page, "Todas las pendientes")).toBeVisible();
    await page.keyboard.press("ArrowRight"); await elegida(hoyTab); // da la vuelta
    await page.keyboard.press("ArrowLeft"); await elegida(todasTab); // y para el otro lado también
    await page.keyboard.press("ArrowLeft"); await elegida(semanaTab);
    await page.keyboard.press("End"); await elegida(todasTab);
    await page.keyboard.press("Home"); await elegida(hoyTab);
    await expect(panelAgenda(page, "Agenda de hoy")).toBeVisible();
    // Cada pestaña controla un panel que existe.
    for (const t of [hoyTab, semanaTab, todasTab]) {
      const id = await t.getAttribute("aria-controls");
      expect(await page.locator(`[id="${id}"]`).count()).toBe(1);
    }
  });

  test("el resumen semanal sigue usando solo la semana, aunque esté elegida «Todas»", async ({ page }) => {
    await abrirAgenda(page, USUARIOS_DEMO.dentista, "u2", [
      { id: "r_vieja", title: "Renovar la matrícula", dias: -30 },
      { id: "r_hoy", title: "Pedir guantes y anestesia", dias: 0 },
      { id: "r_lejana", title: "Renovar el seguro del consultorio", dias: 200 },
    ]);
    let pedido: { datos: { semana: { desde: string; hasta: string }; hoy: string; misTareas: Record<string, number> } } | null = null;
    await page.route("**/api/ia/agenda-resumen", async (route) => {
      pedido = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, resumen: "• Todo en orden." } });
    });
    await tabAgenda(page, "Todas").click();
    await expect(page.getByText(/^3 pendientes/)).toBeVisible(); // «Todas» ve las tres…
    await page.getByRole("button", { name: "Resumen semanal" }).click();
    await expect(page.getByRole("region", { name: "Resumen de la semana" })).toContainText("Todo en orden.");
    // …y el resumen, solo lo de la semana (la atrasada y la de hoy), igual que si estuviera en «Semana».
    expect(pedido!.datos.misTareas).toMatchObject({ total: 2, hechas: 0, pendientes: 2, atrasadas: 1 });
    expect(pedido!.datos.semana.desde <= pedido!.datos.hoy && pedido!.datos.hoy <= pedido!.datos.semana.hasta).toBe(true);
  });

  test("con la rutina del administrador: lo que falta de la rutina de hoy entra en «Todas»; lo que se tachó sola, no", async ({ page }) => {
    await entrarDemo(page);
    await conTareas(page, [{ id: "a_lejana", title: "Renovar el seguro del consultorio", dias: 120 }]);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Mi agenda" })).toBeVisible();
    const hoyPendientes = await panelAgenda(page, "Agenda de hoy").getByRole("region", { name: "Pendientes" }).getByRole("listitem").count();
    expect(hoyPendientes, "la demo del administrador tiene rutina pendiente").toBeGreaterThan(0);

    await tabAgenda(page, "Todas").click();
    const panel = panelAgenda(page, "Todas las pendientes");
    // Lo de hoy pendiente (la rutina) + la tarea lejana. Nada hecho.
    await expect(panel.getByRole("listitem")).toHaveCount(hoyPendientes + 1);
    await expect(panel).toContainText("Renovar el seguro del consultorio");
    await expect(panel.getByRole("link", { name: "Completar los documentos clínicos pendientes", exact: true })).toBeVisible();
    await expect(panel.getByText("Se tachó sola")).toHaveCount(0);
  });

  test("el enlace de una automática asignada a mí sigue llevando a «Tareas del día» de su fecha, con la tarea elegida", async ({ page }) => {
    await entrarDemo(page);
    // Juan Ríos faltó hoy a su única cita: la tarea de cita (re-agenda) vence hoy y me la asigné.
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
      const ini = new Date(); ini.setHours(10, 0, 0, 0);
      const fin = new Date(ini); fin.setMinutes(40);
      db.appointments = db.appointments.filter((a: { patientId: string }) => a.patientId !== "p2");
      db.appointments.push({ id: "a_e2e_ausente", clinicId: "cl_demo", patientId: "p2", dentistId: "u2", title: "Consulta E2E", start: ini.toISOString(), end: fin.toISOString(), status: "ausente", amount: 0, discount: 0 });
      db.mgmtTasks.push({ id: "ov_e2e_ausente", clinicId: "cl_demo", type: "cita", patientId: "p2", derivedKey: "cita:a_e2e_ausente", title: "Faltó a su cita", status: "pendiente", assigneeId: "u1", createdAt: new Date().toISOString() });
      localStorage.setItem("novudent.db.v4", JSON.stringify(db));
    });
    await page.reload();
    const hoy = await hoyDe(page);
    // También desde «Todas»: el enlace de la tarea no cambia con la pestaña.
    await tabAgenda(page, "Todas").click();
    await panelAgenda(page, "Todas las pendientes").getByRole("link", { name: "Faltó a su cita", exact: true }).click();
    await page.waitForURL(/\/app\/tareas\?fecha=/);
    await expect(pestana(page, DEL_DIA)).toHaveAttribute("aria-selected", "true");
    await expect(fechaBandeja(page)).toHaveValue(hoy);
    await expect(main(page).getByRole("button", { name: /^Cita — Juan Ríos — pendiente/ })).toHaveAttribute("aria-current", "true");
  });
});

test.describe("Mi agenda — pestaña «Todas» en el celular", () => {
  test("las tres pestañas y la lista entran en la pantalla, también con un texto largo sin cortes", async ({ page }) => {
    await abrirAgenda(page, USUARIOS_DEMO.dentista, "u2", [
      { id: "c_larga", title: "Llamar_a_la_Dra_Sofía_Benítez_para_coordinar_la_entrega_de_la_prótesis_total_superior_del_paciente_Marco_Giménez", dias: 40 },
      { id: "c_vieja", title: "Renovar la matrícula", dias: -400 },
      { id: "c_lejana", title: "Renovar el seguro", dias: 400 },
    ]);
    await tabAgenda(page, "Todas").click();
    const ancho = page.viewportSize()!.width;
    const adentro = async (l: Locator, que: string) => {
      const caja = (await l.boundingBox())!;
      expect(caja.x + caja.width, `${que} se sale de la pantalla (${Math.round(caja.x + caja.width)}px de ${ancho}px)`).toBeLessThanOrEqual(ancho);
    };
    for (const t of ["Hoy", "Semana", "Todas"] as const) await adentro(tabAgenda(page, t), `la pestaña ${t}`);
    for (const li of await panelAgenda(page, "Todas las pendientes").getByRole("listitem").all()) await adentro(li, "un renglón de la lista");
    await adentro(page.getByRole("heading", { name: "Mi agenda" }).locator("xpath=ancestor::div[contains(@class,'p-5')][1]"), "la tarjeta de Mi agenda");
    expect(await page.evaluate(() => innerWidth), "la ventana se ensanchó").toBe(ancho);
  });
});
