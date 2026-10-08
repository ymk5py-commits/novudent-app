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
