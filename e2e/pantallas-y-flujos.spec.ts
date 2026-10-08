import type { Page } from "@playwright/test";
import { test, expect, entrarDemo, leerDB, sinScrollHorizontal, USUARIOS_DEMO } from "./soporte";
import { DEFAULT_TEMPLATES } from "../lib/botika";
import { ESTADOS_DEFAULT } from "../lib/estadosCita";

/* Defectos de pantallas y flujos que salieron al armar el manual (docs/manual/hallazgos-de-la-app.md, «Abiertos — pantallas y
   flujos»). Cada prueba reproduce el recorrido que ahí se describe y falla si el defecto vuelve.

   El seed arma las citas alrededor del LUNES de la semana en curso, así que las pruebas que dependen de la fecha arman su propio
   caso en el estado local de la demo (que es lo que la app usa con Firebase cortado) y no dependen del día en que corren. */

const main = (page: Page) => page.locator("main");

/** Cambia el estado local de la demo y recarga. `cambiar` corre en el navegador: no puede usar nada de afuera, solo `db` y `arg`. */
async function conDemo<A = null>(page: Page, cambiar: (db: any, arg: A) => void, arg?: A) {
  await page.evaluate(`(() => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4"));
    (${cambiar.toString()})(db, ${JSON.stringify(arg ?? null)});
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  })()`);
  await page.reload();
}

/** `yyyy-mm-dd` de hoy más `dias`, en la zona del navegador (la de la clínica). */
const fechaEn = (page: Page, dias: number) => page.evaluate((n) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}, dias);

/* ═══ Presupuestos ═══ */

test("presupuestos: la tarjeta del presupuesto recién creado se ve sin recargar la página", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/presupuestos");
  const tarjetas = main(page).locator("div.grid.gap-4.lg\\:grid-cols-2 > div");
  await expect(tarjetas.first()).toBeVisible(); // la lista ya se dibujó (si no, el conteo de abajo da 0)
  const antes = await tarjetas.count();

  await main(page).getByRole("button", { name: "Nuevo presupuesto" }).click();
  const dialogo = page.getByRole("dialog", { name: "Nuevo presupuesto" });
  await dialogo.getByRole("button", { name: "Agregar" }).click();
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(dialogo).toBeHidden();

  await expect(tarjetas).toHaveCount(antes + 1);
  // El más nuevo va primero. Existir no alcanza: antes quedaba en opacity 0 (invisible) hasta recargar.
  await expect(tarjetas.first()).toHaveCSS("opacity", "1");
  await expect(tarjetas.first()).toContainText("Borrador");
  await expect(tarjetas.first().getByRole("button", { name: "Presentar" })).toBeVisible();
});

/* ═══ Configuración ═══ */

test("Configuración › Documentos clínicos: «Guardar plantillas» guarda y saca la barra de cambios", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/configuracion#documentos-clinicos");
  const tarjeta = page.getByRole("heading", { name: "Documentos clínicos", level: 2 }).locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
  const guardar = tarjeta.getByRole("button", { name: "Guardar plantillas" });
  const descartar = tarjeta.getByRole("button", { name: "Descartar", exact: true });
  await expect(guardar).toHaveCount(0); // recién abierta no hay nada que guardar

  await tarjeta.getByRole("row", { name: /Cuidados postoperatorios de exodoncia/ }).getByRole("button", { name: "Desactivar", exact: true }).click();
  await expect(guardar).toBeVisible();
  await expect(descartar).toBeVisible();

  await guardar.click();
  // Los cambios se guardan: la barra se va y aparece la confirmación.
  await expect(tarjeta.getByRole("status").filter({ hasText: "Plantillas guardadas" })).toBeVisible();
  await expect(guardar).toHaveCount(0);
  await expect(descartar).toHaveCount(0);
  await expect.poll(async () => {
    const plantillas = (await leerDB(page)).clinics[0].config.plantillasDocumento as { id: string; inactiva?: boolean }[];
    return plantillas?.find((p) => p.id === "cuidados_exodoncia")?.inactiva;
  }).toBe(true);

  // Y sigue guardado al recargar, sin la barra.
  await page.reload();
  await expect(tarjeta.getByRole("row", { name: /Cuidados postoperatorios de exodoncia/ }).getByText("Inactiva")).toBeVisible();
  await expect(guardar).toHaveCount(0);
});

test.describe("Administración: los atajos a Configuración", () => {
  test.skip(({ isMobile }) => isMobile, "es el menú de escritorio; el cajón del celular usa la misma lista");

  const barra = (page: Page) => page.getByRole("banner").getByRole("navigation");
  const abrirAdministracion = (page: Page) => barra(page).getByRole("button", { name: "Administración", exact: true }).click();

  test("todos llevan a una tarjeta que existe (antes «Documentos y consentimientos» iba a un ancla inexistente)", async ({ page }) => {
    await entrarDemo(page);
    await abrirAdministracion(page);
    const hrefs = await page.getByRole("banner").locator("a[href^='/app/configuracion#']").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThan(8);
    expect(hrefs).toContain("/app/configuracion#consentimientos");
    for (const href of new Set(hrefs)) {
      const ancla = href.split("#")[1];
      await page.goto(href);
      await expect(page.locator(`[id="${ancla}"]`), `el atajo ${href} no tiene a dónde llegar`).toHaveCount(1);
    }
  });

  test("«Documentos y consentimientos» lleva a las plantillas de consentimiento", async ({ page }) => {
    await entrarDemo(page);
    await abrirAdministracion(page);
    await barra(page).getByRole("link", { name: "Documentos y consentimientos", exact: true }).click();
    await page.waitForURL("**/app/configuracion#consentimientos");
    await expect(page.getByRole("heading", { name: "Plantillas de consentimiento", level: 2 })).toBeInViewport();
  });
});

/* ═══ Menús flotantes (Desplegable) ═══ */

test.describe("Agenda: el menú «Estado de la cita»", () => {
  test.beforeEach(async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await conDemo(page, (db: any) => {
      const ini = new Date(); ini.setHours(10, 0, 0, 0);
      const fin = new Date(ini); fin.setHours(11);
      db.appointments.push({ id: "a_e2e_hoy", clinicId: db.clinics[0].id, patientId: "p1", dentistId: "u2", title: "Control E2E", start: ini.toISOString(), end: fin.toISOString(), status: "pendiente", amount: 0, discount: 0 });
    });
    await page.goto("/app/agenda");
  });

  test("al cambiar el tamaño de la ventana con el menú abierto no tira error: se reubica (o se cierra)", async ({ page, isMobile }) => {
    await main(page).getByRole("button", { name: "No confirmado" }).first().click();
    const menu = page.getByRole("menu", { name: "Estado de la cita" });
    await expect(menu).toBeVisible();

    // Antes: «TypeError: Failed to execute 'contains' on 'Node'» (en `resize`, el objetivo del evento es `window`).
    // El fixture de `soporte.ts` hace fallar la prueba si la página tira una excepción.
    const ancho = isMobile ? 360 : 1100;
    await page.setViewportSize({ width: ancho, height: 700 });

    if (!isMobile) await expect(menu).toBeVisible(); // en escritorio el botón sigue a la vista: el menú lo acompaña
    // O se cerró (el botón quedó fuera de la pantalla) o sigue entero adentro de la ventana nueva: nunca a medio salir.
    await expect.poll(async () => {
      if (!(await menu.isVisible())) return "cerrado";
      const c = (await menu.boundingBox())!;
      return c.x >= 0 && c.x + c.width <= ancho && c.y >= 0 && c.y + c.height <= 700 ? "adentro" : `afuera (x ${c.x}, ancho ${c.width}, y ${c.y}, alto ${c.height})`;
    }).toMatch(/^(adentro|cerrado)$/);
  });

  test("con muchos estados propios y una ventana de 760 px, los últimos se alcanzan con scroll", async ({ page, isMobile }) => {
    const propios = Array.from({ length: 20 }, (_, i) => ({ id: `propio_${i + 1}`, label: `Estado propio ${i + 1}`, color: "#0E9F6E", base: "pendiente", tipo: "propio" }));
    await conDemo(page, (db: any, estados: unknown[]) => { db.clinics[0].config.estadosCita = estados; }, [...ESTADOS_DEFAULT, ...propios]);
    const alto = 760;
    await page.setViewportSize({ width: isMobile ? 412 : 1440, height: alto });

    await main(page).getByRole("button", { name: "No confirmado" }).first().click();
    const menu = page.getByRole("menu", { name: "Estado de la cita" });
    await expect(menu).toBeVisible();

    // El menú entero está dentro de la pantalla…
    const caja = (await menu.boundingBox())!;
    expect(caja.y).toBeGreaterThanOrEqual(0);
    expect(caja.y + caja.height).toBeLessThanOrEqual(alto);
    // …y lo que no entra se recorre dentro del propio menú.
    const medidas = await menu.evaluate((el) => ({ visible: el.clientHeight, total: el.scrollHeight }));
    expect(medidas.total, "el menú tiene más estados de los que entran").toBeGreaterThan(medidas.visible);

    // El último estado propio se puede tocar y se aplica.
    await menu.getByRole("menuitem", { name: "Estado propio 20", exact: true }).click();
    await expect.poll(async () => (await leerDB(page)).appointments.find((a: { id: string }) => a.id === "a_e2e_hoy")?.estadoId).toBe("propio_20");
  });
});

/* ═══ Ficha del paciente ═══ */

test.describe("Ficha clínica › Evoluciones › Nueva evolución", () => {
  const emrDeP1 = async (page: Page) => (await leerDB(page)).patients.find((p: { id: string }) => p.id === "p1").emr as { text: string; soap?: Record<string, string> }[];

  test.beforeEach(async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/pacientes/p1?tab=evoluciones");
    await main(page).getByRole("button", { name: "Nueva evolución" }).click();
  });

  test("«Firmar y guardar» con los cuatro campos SOAP vacíos avisa por qué y no guarda nada", async ({ page }) => {
    const antes = (await emrDeP1(page)).length;
    const dialogo = page.getByRole("dialog", { name: "Nueva evolución clínica" });
    await dialogo.getByRole("button", { name: "Firmar y guardar" }).click();
    await expect(dialogo.getByRole("alert")).toContainText("antes de firmar");
    await expect(dialogo).toBeVisible();
    expect(await emrDeP1(page)).toHaveLength(antes);
    // Con espacios solos tampoco: no hay nada que firmar.
    await dialogo.getByLabel("S — Subjetivo").fill("   ");
    await dialogo.getByRole("button", { name: "Firmar y guardar" }).click();
    await expect(dialogo.getByRole("alert")).toBeVisible();
    expect(await emrDeP1(page)).toHaveLength(antes);
  });

  test("en «Nota libre» sin detalle pasa lo mismo, y el aviso se va al escribir", async ({ page }) => {
    const antes = (await emrDeP1(page)).length;
    const dialogo = page.getByRole("dialog", { name: "Nueva evolución clínica" });
    await dialogo.getByRole("button", { name: "Nota libre" }).click();
    await dialogo.getByRole("button", { name: "Firmar y guardar" }).click();
    await expect(dialogo.getByRole("alert")).toContainText("antes de firmar");
    expect(await emrDeP1(page)).toHaveLength(antes);
    await dialogo.getByLabel("Detalle").fill("Control sin novedades.");
    await expect(dialogo.getByRole("alert")).toHaveCount(0);
  });

  test("con un solo campo completo sí firma y guarda", async ({ page }) => {
    const antes = (await emrDeP1(page)).length;
    const dialogo = page.getByRole("dialog", { name: "Nueva evolución clínica" });
    await dialogo.getByLabel("P — Plan").fill("Control en 6 meses.");
    await dialogo.getByRole("button", { name: "Firmar y guardar" }).click();
    await expect(dialogo).toBeHidden();
    const emr = await emrDeP1(page);
    expect(emr).toHaveLength(antes + 1);
    expect(emr[0].soap).toMatchObject({ p: "Control en 6 meses." });
  });
});

test.describe("Ficha clínica › Resumen e Historial", () => {
  test.beforeEach(async ({ page }) => {
    await entrarDemo(page);
    await conDemo(page, (db: any) => {
      const dia = (n: number, h: number) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d.toISOString(); };
      const base = { clinicId: db.clinics[0].id, patientId: "p1", dentistId: "u2", amount: 0, discount: 0 };
      db.appointments.push(
        { ...base, id: "a_e2e_anulada", title: "Cita anulada E2E", start: dia(2, 15), end: dia(2, 16), status: "cancelada" },
        { ...base, id: "a_e2e_vigente", title: "Cita vigente E2E", start: dia(3, 15), end: dia(3, 16), status: "confirmada" },
      );
    });
  });

  test("«Próximas citas» no lista las citas anuladas", async ({ page }) => {
    await page.goto("/app/pacientes/p1");
    const proximas = page.getByRole("heading", { name: "Próximas citas" }).locator("xpath=..");
    await expect(proximas).toContainText("Cita vigente E2E");
    await expect(proximas).not.toContainText("Cita anulada E2E");
    await expect(proximas).not.toContainText("Anulado");
    // Las anuladas siguen estando en la pestaña Citas (ahí sí van, con su etiqueta).
    await page.goto("/app/pacientes/p1?tab=citas");
    await expect(main(page).getByRole("row", { name: /Cita anulada E2E/ })).toContainText("Anulado");
  });

  test("el tipo de nota se lee igual en Resumen, Historial y Evoluciones («Diagnóstico», no «diagnostico»)", async ({ page }) => {
    for (const pestana of ["resumen", "historial", "evoluciones"]) {
      await page.goto(`/app/pacientes/p1?tab=${pestana}`);
      await expect(main(page).getByText("Diagnóstico", { exact: true }).first(), pestana).toBeVisible();
      await expect(main(page).getByText("Plan", { exact: true }).first(), pestana).toBeVisible();
      for (const crudo of ["diagnostico", "tratamiento", "plan", "nota"]) {
        await expect(main(page).getByText(crudo, { exact: true }), `«${crudo}» crudo en ${pestana}`).toHaveCount(0);
      }
    }
  });
});

/* ═══ Integraciones ═══ */

test.describe("Integraciones (Botika)", () => {
  test.beforeEach(async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/integraciones");
  });

  const editor = (page: Page) => page.getByRole("heading", { name: "Plantillas de mensajes" }).locator("xpath=..");

  test("las cinco plantillas arrancan con su texto (también «Negociación de presupuestos») y «Guardar plantillas» no está prendido", async ({ page }) => {
    const cajas = editor(page).locator("textarea");
    await expect(cajas).toHaveCount(5);
    const claves = Object.keys(DEFAULT_TEMPLATES) as (keyof typeof DEFAULT_TEMPLATES)[];
    for (const [i, k] of claves.entries()) await expect(cajas.nth(i), k).toHaveValue(DEFAULT_TEMPLATES[k]);
    await expect(editor(page).getByText("Restaurar default")).toHaveCount(0);
    await expect(editor(page).getByRole("button", { name: "Guardar plantillas" })).toHaveCount(0);
    await sinScrollHorizontal(page);
  });

  test("editar una plantilla prende «Guardar plantillas», guardar lo apaga, y «Restaurar default» vuelve al texto de fábrica", async ({ page }) => {
    const negociacion = editor(page).locator("textarea").nth(4);
    const guardar = editor(page).getByRole("button", { name: "Guardar plantillas" });
    const plantillaGuardada = async () => (await leerDB(page)).clinics[0].config.botika.templates?.negociacion;

    await negociacion.fill("Hola {paciente}, ¿viste el presupuesto?");
    await expect(guardar).toBeVisible();
    await guardar.click();
    await expect(guardar).toHaveCount(0);
    await expect.poll(plantillaGuardada).toBe("Hola {paciente}, ¿viste el presupuesto?");

    await page.reload();
    await expect(editor(page).locator("textarea").nth(4)).toHaveValue("Hola {paciente}, ¿viste el presupuesto?");
    await editor(page).getByText("Restaurar default").click();
    await expect(editor(page).locator("textarea").nth(4)).toHaveValue(DEFAULT_TEMPLATES.negociacion);
    await expect(guardar).toBeVisible();
    await guardar.click();
    await expect(guardar).toHaveCount(0);
    // Quedó el de fábrica (vacío = el de fábrica), no el texto propio de antes.
    await expect.poll(plantillaGuardada).toBe("");
    await page.reload();
    await expect(editor(page).locator("textarea").nth(4)).toHaveValue(DEFAULT_TEMPLATES.negociacion);
    await expect(editor(page).getByText("Restaurar default")).toHaveCount(0);
  });

  test("«Reagendar canceladas» no se puede prender y dice que todavía no envía nada", async ({ page }) => {
    const reagendar = page.getByRole("button", { name: /Reagendar canceladas/ });
    await expect(reagendar).toBeDisabled();
    await expect(reagendar).toContainText("Todavía no envía");
    const antes = (await leerDB(page)).clinics[0].config.botika.automations;
    await reagendar.click({ force: true });
    expect((await leerDB(page)).clinics[0].config.botika.automations).toEqual(antes);
    // Las que sí funcionan siguen funcionando.
    await expect(page.getByRole("button", { name: /Confirmación de citas/ })).toBeEnabled();
    await sinScrollHorizontal(page);
  });
});

/* ═══ Suscripción vencida ═══ */

test.describe("Suscripción vencida", () => {
  test.beforeEach(async ({ page }) => {
    await entrarDemo(page);
    await conDemo(page, (db: any) => {
      db.subscription = { clinicId: db.clinics[0].id, plan: "cadena", status: "past_due", updatedAt: new Date().toISOString() };
    });
  });
  const cartel = (page: Page) => page.getByText("No pudimos procesar tu último pago");

  test("el cartel rojo sale UNA sola vez en /app/suscripcion (el del Shell, igual que en el resto de las pantallas)", async ({ page }) => {
    await page.goto("/app/suscripcion");
    await expect(page.getByRole("heading", { name: "Suscripción", level: 1 })).toBeVisible();
    await expect(cartel(page)).toHaveCount(1);
    await expect(page.getByRole("status").filter({ hasText: "No pudimos procesar tu último pago" })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Regularizar pago" })).toHaveCount(1);
  });

  test("en las demás pantallas el cartel sigue, con el botón para regularizar", async ({ page }) => {
    await page.goto("/app/agenda");
    await expect(cartel(page)).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Regularizar pago" })).toBeVisible();
  });
});

/* ═══ Agenda: reservas online por validar ═══ */

test.describe("Agenda: el cartel «agendamiento(s) online que deben ser validados»", () => {
  /** Juan Ríos: online sin validar hoy · Camila Ortega: online sin validar mañana · Marco Giménez: online sin validar AYER (no cuenta)
   *  · Lucía Ferreira: online ya confirmada hoy · Andrés Mejía: cita de la recepción sin confirmar hoy y mañana. */
  const armar = async (page: Page, { hoy }: { hoy: boolean }) => {
    await conDemo(page, (db: any, args: { hoy: boolean }) => {
      // Una cita de la demo `dias` días desde hoy (negativo = ayer) a la hora `hora`.
      const cita = (dias: number, hora: number, resto: Record<string, unknown>) => {
        const ini = new Date(); ini.setDate(ini.getDate() + dias); ini.setHours(hora, 0, 0, 0);
        const fin = new Date(ini); fin.setHours(hora + 1);
        db.appointments.push({ clinicId: db.clinics[0].id, dentistId: "u2", amount: 0, discount: 0, start: ini.toISOString(), end: fin.toISOString(), ...resto });
      };
      db.appointments = db.appointments.filter((a: { source?: string }) => a.source !== "online");
      if (args.hoy) cita(0, 8, { id: "o_hoy", patientId: "p2", title: "Reserva de hoy", status: "pendiente", source: "online" });
      cita(1, 10, { id: "o_manana", patientId: "p3", title: "Reserva de mañana", status: "pendiente", source: "online" });
      cita(-1, 10, { id: "o_ayer", patientId: "p6", title: "Reserva de ayer", status: "pendiente", source: "online" });
      cita(0, 12, { id: "o_conf", patientId: "p5", title: "Reserva confirmada", status: "confirmada", source: "online" });
      cita(0, 14, { id: "i_hoy", patientId: "p4", title: "Cita interna de hoy", status: "pendiente", source: "interna" });
      cita(1, 15, { id: "i_manana", patientId: "p4", title: "Cita interna de mañana", status: "pendiente", source: "interna" });
    }, { hoy });
  };
  const cartel = (page: Page) => main(page).getByText(/agendamiento\(s\) online/);

  test("la recepción ve cuántas reservas online hay por validar en TODOS los días que vienen, no solo en el día abierto", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await armar(page, { hoy: true });
    await page.goto("/app/agenda");
    // Hoy + mañana. No cuentan la de ayer, la ya confirmada ni las citas de la recepción.
    await expect(cartel(page)).toContainText("Hay 2 agendamiento(s) online que deben ser validados");
    await sinScrollHorizontal(page);
  });

  test("«Ver y validar» muestra solo las reservas online sin validar, y se puede volver a ver todo", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await armar(page, { hoy: true });
    await page.goto("/app/agenda");
    await expect(main(page)).toContainText("Andrés Mejía"); // sin filtro, la cita de la recepción está

    await main(page).getByRole("button", { name: "Ver y validar" }).click();
    await expect(main(page).getByRole("link", { name: "Juan Ríos" })).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Andrés Mejía" })).toHaveCount(0); // sin confirmar, pero no es online
    await expect(main(page).getByRole("link", { name: "Lucía Ferreira" })).toHaveCount(0); // online, pero ya confirmada

    await main(page).getByRole("button", { name: "Ver todas las citas" }).click();
    await expect(main(page).getByRole("link", { name: "Andrés Mejía" })).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Lucía Ferreira" })).toBeVisible();
  });

  test("si en el día abierto no hay ninguna, «Ver y validar» lleva al primer día que sí tiene", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await armar(page, { hoy: false });
    await page.goto("/app/agenda");
    await expect(cartel(page)).toContainText("Hay 1 agendamiento(s) online que deben ser validados");

    await main(page).getByRole("button", { name: "Ver y validar" }).click();
    await expect(page.getByLabel("Elegir fecha")).toHaveValue(await fechaEn(page, 1));
    await expect(main(page).getByRole("link", { name: "Camila Ortega" })).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Andrés Mejía" })).toHaveCount(0);
  });

  for (const [rol, usuario] of [["la asistente", USUARIOS_DEMO.asistente], ["el dentista", USUARIOS_DEMO.dentista]] as const) {
    test(`${rol} no ve el cartel: no puede validar reservas`, async ({ page }) => {
      await entrarDemo(page, usuario);
      await armar(page, { hoy: true });
      await page.goto("/app/agenda");
      // La reserva está en su agenda, pero no es suya para validar.
      await expect(main(page).getByText("Online", { exact: true }).first()).toBeVisible();
      await expect(cartel(page)).toHaveCount(0);
      await expect(main(page).getByRole("button", { name: "Ver y validar" })).toHaveCount(0);
    });
  }
});

/* ═══ Reserva online pública ═══ */

test.describe("Reserva online pública (/reservar/{clinicId})", () => {
  /** La API se simula: sin el usuario de servicio local, la de verdad no llega a Firestore. */
  async function simular(page: Page, opciones: { botikaQueued?: boolean; nombre?: string | null } = {}) {
    const nombre = opciones.nombre === undefined ? "Clínica Aura" : opciones.nombre;
    await page.route("**/api/reservas**", async (route) => {
      if (route.request().method() === "POST") return route.fulfill({ json: { ok: true, appointmentId: "a_x", botikaQueued: !!opciones.botikaQueued } });
      if (nombre === null) return route.fulfill({ status: 500, json: { ok: false, error: "Reservas online no configuradas (envs del servidor)" } });
      if (!new URL(route.request().url()).searchParams.get("date")) return route.fulfill({ json: { ok: true, clinic: { name: nombre } } });
      return route.fulfill({ json: { ok: true, clinic: { name: nombre }, dentists: [{ id: "u2", name: "Dra. Sofía Benítez" }], slots: { u2: ["11:00", "11:30"] } } });
    });
  }
  const reservar = async (page: Page) => {
    await page.getByRole("button", { name: /^(lun|mar|mié|jue|vie|sáb)/i }).first().click();
    await page.getByRole("button", { name: "11:00" }).click();
    await page.getByPlaceholder("Nombre", { exact: true }).fill("Lía");
    await page.getByPlaceholder("Apellido", { exact: true }).fill("Online");
    await page.getByPlaceholder("Cédula (CI)").fill("5555555");
    await page.getByPlaceholder("WhatsApp (09xx xxx xxx)").fill("0983 555 555");
    await page.getByRole("button", { name: "Confirmar reserva" }).click();
  };

  test("el encabezado dice el nombre de la clínica desde el primer paso, no «NOVUdent»", async ({ page }) => {
    await simular(page);
    await page.goto("/reservar/cl_aura");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Clínica Aura");
    await expect(page.locator("header").getByRole("img", { name: "Novudent" })).toHaveCount(0);
    await sinScrollHorizontal(page);
  });

  test("no promete que la clínica va a confirmar por WhatsApp: dice que la clínica confirma el turno", async ({ page }) => {
    await simular(page);
    await page.goto("/reservar/cl_aura");
    await expect(page.locator("header")).toContainText("La clínica te va a confirmar el turno");
    await expect(page.locator("header")).not.toContainText("WhatsApp");
  });

  test("si no se pudo traer el nombre, el encabezado dice «Reservá tu cita» y la página sigue andando", async ({ page }) => {
    await simular(page, { nombre: null });
    await page.goto("/reservar/cl_aura");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reservá tu cita");
    await expect(page.getByRole("button", { name: /^(lun|mar|mié|jue|vie|sáb)/i }).first()).toBeVisible();
  });

  test("al terminar, el WhatsApp solo se promete si la clínica lo está mandando", async ({ page }) => {
    await simular(page, { botikaQueued: false });
    await page.goto("/reservar/cl_aura");
    await reservar(page);
    await expect(page.getByText("¡Reserva recibida!")).toBeVisible();
    await expect(page.getByText("La clínica revisará tu reserva y te contactará para confirmar.")).toBeVisible();
    await expect(page.getByText(/te llega un WhatsApp/)).toHaveCount(0);

    await page.unroute("**/api/reservas**");
    await simular(page, { botikaQueued: true });
    await page.goto("/reservar/cl_aura");
    await reservar(page);
    await expect(page.getByText("En breve te llega un WhatsApp para confirmar tu asistencia.")).toBeVisible();
  });
});
