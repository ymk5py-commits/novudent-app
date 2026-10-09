import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect, entrarDemo, leerDB, USUARIOS_DEMO, sinScrollHorizontal } from "./soporte";

/* Pedido de Camila (8-oct-2026), «ARMAR UN PRESUPUESTO» — frente C del spec
   docs/superpowers/specs/2026-10-08-pedidos-de-camila-agenda-ficha-plan-tareas.md:
   C1 · «Nuevo plan de tratamiento» en la ficha arma el plan ahí mismo (no manda a la lista de Presupuestos de todos).
   C2 · El formulario del plan busca las prestaciones (el arancel es enorme) y no se rompe sin arancel.
   C3 · El arancel se carga desde un archivo de Excel (.xlsx) y lo cargado sale al armar un plan. */

/** Un .xlsx REAL (lo escribe openpyxl): ver lib/__fixtures__/generar-arancel-prueba.py. */
const XLSX_DE_PRUEBA = path.join(__dirname, "..", "lib", "__fixtures__", "arancel-prueba.xlsx");
const MONTO = /Gs\.?\s?\d/;
const main = (page: Page) => page.locator("main");
const tarjeta = (page: Page, titulo: string) => page.getByRole("heading", { name: titulo, level: 2, exact: true }).locator("xpath=ancestor::*[contains(@class,'p-5')][1]");

type Fila = Record<string, any>;
/** Cambia el estado local de la demo y recarga. `cambiar` corre en el navegador: solo puede usar `db`. */
async function conDemo(page: Page, cambiar: (db: Fila) => void) {
  await page.evaluate(`(() => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4"));
    (${cambiar.toString()})(db);
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  })()`);
  await page.reload();
}

async function abrirCarga(page: Page) {
  await page.goto("/app/configuracion");
  await expect(page.getByRole("heading", { name: "Configuración", level: 1 })).toBeVisible();
  await tarjeta(page, "Arancel de precios").getByRole("button", { name: "Cargar desde Excel" }).click();
  return page.getByRole("dialog", { name: "Cargar precios desde Excel" });
}

/** Abre «Nuevo plan de tratamiento» desde la ficha del paciente (pestaña Planes de tratamiento). */
async function nuevoPlanDesdeLaFicha(page: Page, paciente: string) {
  await page.goto(`/app/pacientes/${paciente}/planes`); // URL limpia (lib/rutasPanel)
  await main(page).getByRole("button", { name: "Nuevo plan de tratamiento" }).click();
  const dialogo = page.getByRole("dialog", { name: "Nuevo plan de tratamiento" });
  await expect(dialogo).toBeVisible();
  expect(new URL(page.url()).pathname, "se queda en la ficha: no va a la lista de Presupuestos").toMatch(new RegExp(`^/app/pacientes/${paciente}(/planes)?$`));
  return dialogo;
}

async function agregarPrestacion(dialogo: ReturnType<Page["getByRole"]>, busqueda: string, opcion: RegExp) {
  await dialogo.getByRole("combobox", { name: "Buscar prestación" }).fill(busqueda);
  await dialogo.getByRole("option", { name: opcion }).click();
}

test.describe("C3 · Arancel desde un archivo de Excel", () => {
  test("se sube el .xlsx, se ve la vista previa, se aplica y la prestación nueva sale al armar un plan desde la ficha", async ({ page }) => {
    test.setTimeout(90_000);
    await entrarDemo(page);
    const dialogo = await abrirCarga(page);
    await dialogo.getByLabel("Elegir archivo (Excel o CSV)").setInputFiles(XLSX_DE_PRUEBA);

    // La primera hoja con datos («Hoja1» está vacía y «Notas» está oculta), con la planilla «Prestación | Precio» sin códigos.
    await expect(dialogo).toContainText("arancel-prueba.xlsx");
    const hoja = dialogo.getByLabel("Hoja");
    await expect(hoja.locator("option")).toHaveText(["Aranceles (8 filas)", "Laboratorio (2 filas)"]);
    await expect(hoja).toHaveValue("1");
    await expect(dialogo).toContainText("4 nuevos");
    await expect(dialogo).toContainText("2 cambian");
    await expect(dialogo).toContainText("1 con error");
    await expect(dialogo).toContainText("se buscó por su nombre");
    // La «Línea» es la fila de la hoja (la 4 está vacía): la fórmula que nunca se calculó está en la 6.
    await expect(dialogo.getByRole("row", { name: /^6 / })).toContainText("La fórmula «=B2*10» no tiene su resultado guardado");
    await expect(dialogo.getByRole("row", { name: /S0001/ })).toContainText("Limpieza con ultrasonido");
    await expect(dialogo.getByRole("row", { name: /D1110/ })).toContainText("antes Gs 250.000");

    // Otra hoja visible del libro: tiene código.
    await hoja.selectOption({ label: "Laboratorio (2 filas)" });
    await expect(dialogo).toContainText("1 nuevo");
    await expect(dialogo.getByRole("row", { name: /LAB01/ })).toContainText("Corona de zirconio");
    await hoja.selectOption({ label: "Aranceles (8 filas)" });
    expect((await leerDB(page)).procedures.find((p: Fila) => p.cpt === "S0001"), "la vista previa no guarda nada").toBeUndefined();

    await dialogo.getByRole("button", { name: "Aplicar 6 cambios" }).click();
    await expect(dialogo).toBeHidden();
    await expect(tarjeta(page, "Arancel de precios").getByRole("status")).toContainText("4 servicios nuevos y 2 precios actualizados");
    const procedures = (await leerDB(page)).procedures as Fila[];
    expect(procedures.find((p) => p.cpt === "S0001")).toMatchObject({ description: "Limpieza con ultrasonido", price: 180000 });
    expect(procedures.find((p) => p.cpt === "S0003")).toMatchObject({ description: "Blanqueamiento con férula", price: 450000 });
    expect(procedures.find((p) => p.cpt === "D1110")).toMatchObject({ description: "Profilaxis (adulto)", price: 270000 });
    expect(procedures.find((p) => p.description === "Carillas de porcelana (por pieza)"), "la fila con error no se carga").toBeUndefined();

    // Lo cargado sale en el buscador del plan, con su precio.
    const plan = await nuevoPlanDesdeLaFicha(page, "p2"); // Juan Ríos no tiene planes
    await expect(plan).toContainText("Juan Ríos");
    await plan.getByRole("combobox", { name: "Buscar prestación" }).fill("ultrason");
    await expect(plan.getByRole("option", { name: /Limpieza con ultrasonido/ })).toContainText("180.000");
    await plan.getByRole("option", { name: /Limpieza con ultrasonido/ }).click();
    await agregarPrestacion(plan, "muela del juicio", /Extracción de muela del juicio/);
    await plan.getByLabel("Pieza de la prestación 2").fill("38");
    await expect(plan.getByLabel("Precio de la prestación 1")).toHaveValue("180000");
    await expect(plan).toContainText("1.130.000"); // el total
    await plan.getByRole("button", { name: "Guardar" }).click();

    // Al guardar se abre el plan nuevo.
    await expect(plan).toBeHidden();
    await expect(main(page).getByRole("table")).toContainText("Limpieza con ultrasonido");
    await expect(main(page).getByRole("table")).toContainText("Extracción de muela del juicio");
    const nuevo = ((await leerDB(page)).budgets as Fila[]).find((b) => b.patientId === "p2");
    expect(nuevo).toMatchObject({ status: "borrador", items: [{ cpt: "S0001", price: 180000 }, { cpt: "S0002", tooth: "38", price: 950000 }] });
    expect(nuevo!.history[0].action).toBe("Plan de tratamiento creado");
  });

  test("un Excel viejo (.xls) o algo que no es una planilla se rechaza con un mensaje claro", async ({ page }) => {
    await entrarDemo(page);
    const dialogo = await abrirCarga(page);
    const elegir = dialogo.getByLabel("Elegir archivo (Excel o CSV)");
    await elegir.setInputFiles(XLSX_DE_PRUEBA);
    await expect(dialogo).toContainText("4 nuevos");
    const xlsViejo = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...Array(504).fill(0), ...[..."Workbook"].flatMap((c) => [c.charCodeAt(0), 0])]);
    await elegir.setInputFiles({ name: "aranceles-2019.xls", mimeType: "application/vnd.ms-excel", buffer: xlsViejo });
    await expect(dialogo.getByRole("alert")).toContainText("Guardalo como Excel (.xlsx) o CSV");
    // Lo del archivo anterior no queda a la vista ni se puede aplicar mientras el aviso habla de este.
    await expect(dialogo).not.toContainText("arancel-prueba.xlsx");
    await expect(dialogo).not.toContainText("4 nuevos");
    await elegir.setInputFiles({ name: "foto.txt", mimeType: "text/plain", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]) });
    await expect(dialogo.getByRole("alert")).toContainText("No es una planilla");
    await expect(dialogo.getByRole("button", { name: "Aplicar" })).toBeDisabled();
  });

  test("un CSV elegido como archivo se vuelca en el cuadro, como antes", async ({ page }) => {
    await entrarDemo(page);
    const dialogo = await abrirCarga(page);
    await dialogo.getByLabel("Elegir archivo (Excel o CSV)").setInputFiles({ name: "precios.csv", mimeType: "text/csv", buffer: Buffer.from("Prestación;Precio\nGuarda oclusal;900.000\n", "utf8") });
    await expect(dialogo.getByLabel("Filas de la planilla")).toHaveValue(/Guarda oclusal/);
    await expect(dialogo).toContainText("precios.csv");
    await expect(dialogo).toContainText("1 nuevo");
    await expect(dialogo.getByRole("button", { name: "Aplicar 1 cambio" })).toBeEnabled();
  });

  test("con más de 500 servicios avisa cuántos se van a guardar antes de confirmar", async ({ page }) => {
    await entrarDemo(page);
    const dialogo = await abrirCarga(page);
    const csv = ["Prestación;Precio", ...Array.from({ length: 600 }, (_, i) => `Servicio de prueba ${i + 1};${1000 + i}`)].join("\n");
    await dialogo.getByLabel("Elegir archivo (Excel o CSV)").setInputFiles({ name: "muchos.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await expect(dialogo).toContainText("600 nuevos");
    await expect(dialogo).toContainText("…y 540 filas más (se aplican igual)");
    await dialogo.getByRole("button", { name: "Aplicar 600 cambios" }).click();
    await expect(dialogo.getByRole("alert")).toContainText("Se van a guardar 600 servicios");
    expect((await leerDB(page)).procedures).toHaveLength(9); // todavía nada
    await dialogo.getByRole("button", { name: "Volver" }).click();
    await expect(dialogo.getByRole("alert")).toHaveCount(0);
    await dialogo.getByRole("button", { name: "Aplicar 600 cambios" }).click();
    await dialogo.getByRole("button", { name: "Guardar 600 servicios" }).click();
    await expect(dialogo).toBeHidden();
    expect((await leerDB(page)).procedures).toHaveLength(609);
  });
});

test.describe("C1 · «Nuevo plan de tratamiento» arma el plan en la ficha", () => {
  test("el administrador ve el formulario con el paciente fijo y los montos, y al guardar se abre el plan", async ({ page }) => {
    await entrarDemo(page);
    const dialogo = await nuevoPlanDesdeLaFicha(page, "p1");
    await expect(dialogo).toContainText("María González");
    await expect(dialogo.getByRole("combobox", { name: "Paciente" }), "el paciente no se elige: es el de la ficha").toHaveCount(0);
    await expect(dialogo.getByLabel("Convenio")).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Guardar" })).toBeDisabled();
    await agregarPrestacion(dialogo, "resina", /Resina compuesta/);
    await expect(dialogo.getByLabel("Precio de la prestación 1")).toHaveValue("420000");
    await dialogo.getByLabel("Nombre del plan (opcional)").fill("Resinas del sector anterior");
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo).toBeHidden();
    await expect(main(page).getByRole("heading", { name: "Resinas del sector anterior" })).toBeVisible();
    await expect(main(page)).toContainText("Presupuesto total");
    const nuevo = ((await leerDB(page)).budgets as Fila[]).find((b) => b.name === "Resinas del sector anterior");
    expect(nuevo).toMatchObject({ patientId: "p1", status: "borrador", items: [{ cpt: "D2330", price: 420000 }] });
  });

  test("el dentista arma el plan sin ver precios: él queda como profesional", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    const dialogo = await nuevoPlanDesdeLaFicha(page, "p1");
    await expect(dialogo).toContainText(USUARIOS_DEMO.dentista);
    await dialogo.getByRole("combobox", { name: "Buscar prestación" }).fill("resina");
    await expect(dialogo.getByRole("option", { name: /Resina compuesta/ })).toBeVisible();
    await expect(dialogo.getByRole("listbox", { name: "Prestaciones del arancel" })).not.toContainText(MONTO);
    await dialogo.getByRole("option", { name: /Resina compuesta/ }).click();
    await expect(dialogo).not.toContainText(MONTO);
    await expect(dialogo.getByLabel(/Precio/)).toHaveCount(0);
    await expect(dialogo.getByLabel("Convenio")).toHaveCount(0);
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo).toBeHidden();
    await expect(main(page)).toContainText("Avance del plan");
    await expect(main(page)).not.toContainText(MONTO);
    const dentista = ((await leerDB(page)).users as Fila[]).find((u) => u.name === USUARIOS_DEMO.dentista)!;
    const nuevo = ((await leerDB(page)).budgets as Fila[]).find((b) => b.history?.[0]?.action === "Plan de tratamiento creado por el profesional");
    expect(nuevo).toMatchObject({ patientId: "p1", dentistId: dentista.id, items: [{ cpt: "D2330", price: 420000 }] });
  });

  test("también en «Sin planes de tratamiento», para la caja", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.caja);
    await page.goto("/app/pacientes/p2#planes");
    await expect(main(page)).toContainText("Sin planes de tratamiento");
    await expect(main(page)).toContainText("Armá el primero");
    await main(page).getByRole("button", { name: "Nuevo plan de tratamiento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Nuevo plan de tratamiento" });
    await expect(dialogo).toContainText("Juan Ríos");
    await agregarPrestacion(dialogo, "D1110", /Profilaxis/);
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(main(page).getByRole("table")).toContainText("Profilaxis (adulto)");
  });

  test("la recepción, que no arma planes, no ve el botón", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/p1#planes");
    await expect(main(page).getByRole("button", { name: /Plan dental integral/ })).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Nuevo plan de tratamiento" })).toHaveCount(0);
  });
});

test.describe("C2 · El formulario del plan con cualquier arancel", () => {
  test("sin prestaciones cargadas no se rompe y lleva a Configuración › Arancel de precios", async ({ page }) => {
    await entrarDemo(page);
    await conDemo(page, (db) => { db.procedures = []; });
    const dialogo = await nuevoPlanDesdeLaFicha(page, "p2");
    await expect(dialogo.getByRole("status")).toContainText("Todavía no hay prestaciones cargadas");
    await expect(dialogo.getByRole("button", { name: "Guardar" })).toBeDisabled();
    await dialogo.getByRole("link", { name: "Cargalas en Configuración › Arancel de precios" }).click();
    await page.waitForURL("**/app/configuracion/arancel");
    await expect(tarjeta(page, "Arancel de precios")).toContainText("Sin servicios");
  });

  test("la misma prestación se puede agregar dos veces (dos piezas) y se quita con el tachito", async ({ page }) => {
    await entrarDemo(page);
    const dialogo = await nuevoPlanDesdeLaFicha(page, "p2");
    await agregarPrestacion(dialogo, "resina", /Resina compuesta/);
    await agregarPrestacion(dialogo, "resina", /Resina compuesta/);
    await agregarPrestacion(dialogo, "exodoncia", /Exodoncia simple/);
    await dialogo.getByLabel("Pieza de la prestación 1").fill("11");
    await dialogo.getByLabel("Pieza de la prestación 2").fill("21");
    await dialogo.getByRole("button", { name: "Quitar Exodoncia simple" }).click();
    await expect(dialogo.getByRole("button", { name: /^Quitar / })).toHaveCount(2);
    await expect(dialogo).toContainText("840.000");
  });

  test("con miles de prestaciones el buscador muestra de a pocas y encuentra cualquiera", async ({ page }) => {
    await entrarDemo(page);
    await conDemo(page, (db) => {
      for (let i = 1; i <= 3000; i++) db.procedures.push({ cpt: `X${String(i).padStart(4, "0")}`, description: `Prestación de prueba ${i}`, price: 1000 + i, defaultDx: [] });
    });
    const dialogo = await nuevoPlanDesdeLaFicha(page, "p2");
    await dialogo.getByRole("combobox", { name: "Buscar prestación" }).fill("prueba");
    const lista = dialogo.getByRole("listbox", { name: "Prestaciones del arancel" }); // (el selector de profesional también tiene opciones)
    await expect(lista.getByRole("option")).toHaveCount(30);
    await expect(lista).toContainText("Mostrando 30 de 3000");
    await dialogo.getByRole("combobox", { name: "Buscar prestación" }).fill("X2999");
    await dialogo.getByRole("option", { name: /Prestación de prueba 2999/ }).click();
    await expect(dialogo).toContainText("Prestación de prueba 2999");
  });
});

test.describe("C2 · Facturación también busca el procedimiento (era otro <select> con todo el arancel)", () => {
  test("«Nuevo registro» elige el procedimiento y los adicionales con el buscador", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/facturacion");
    await main(page).getByRole("button", { name: "Nuevo registro" }).click();
    const dialogo = page.getByRole("dialog", { name: "Nuevo registro de facturación" });
    await dialogo.getByRole("combobox", { name: "Procedimiento (CPT/CDT)" }).fill("D2330");
    await dialogo.getByRole("option", { name: /Resina compuesta/ }).click();
    await expect(dialogo).toContainText("D2330 Resina compuesta — 1 superficie");
    await expect(dialogo.getByLabel("Importe (Gs)")).toHaveValue("420000");
    await dialogo.getByRole("combobox", { name: "Agregar procedimiento adicional" }).fill("exodoncia");
    await dialogo.getByRole("option", { name: /Exodoncia simple/ }).click();
    await expect(dialogo.getByText("D7140", { exact: true })).toBeVisible();
    await expect(dialogo).toContainText("Total del reclamo: Gs 1.020.000");
  });
});

test.describe("Presupuestos: buscador por paciente", () => {
  test("filtra la lista por nombre o CI y el formulario elige el paciente con el buscador", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/presupuestos");
    const buscar = main(page).getByRole("searchbox", { name: "Buscar presupuestos por paciente" });
    await buscar.fill("gonzalez");
    await expect(main(page).getByRole("status").filter({ hasText: "presupuestos" })).toHaveText(/^\d+ de \d+ presupuestos$/);
    const tarjetas = main(page).locator("div.grid.gap-4.lg\\:grid-cols-2 > div");
    await expect(tarjetas.first()).toContainText("María González");
    for (const t of await tarjetas.all()) await expect(t).toContainText("María González");
    await buscar.fill("3.456.789");
    await expect(tarjetas.first()).toContainText("María González");
    await buscar.fill("nadie con este nombre");
    await expect(main(page)).toContainText("Ningún presupuesto de ese paciente");
    await buscar.fill("");

    await main(page).getByRole("button", { name: "Nuevo presupuesto" }).click();
    const dialogo = page.getByRole("dialog", { name: "Nuevo presupuesto" });
    await agregarPrestacion(dialogo, "profilaxis", /Profilaxis/);
    await expect(dialogo.getByRole("button", { name: "Guardar" }), "sin paciente no se guarda").toBeDisabled();
    await dialogo.getByRole("combobox", { name: "Paciente" }).fill("ferreira");
    await dialogo.getByRole("option", { name: /LUCÍA FERREIRA/ }).click();
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(dialogo).toBeHidden();
    await expect(tarjetas.first()).toContainText("Lucía Ferreira");
  });
});

test.describe("En el celular", () => {
  test("el formulario del plan y la carga del arancel entran en la pantalla", async ({ page }) => {
    await entrarDemo(page);
    const ancho = await page.evaluate(() => innerWidth);
    const plan = await nuevoPlanDesdeLaFicha(page, "p2");
    await agregarPrestacion(plan, "resina", /Resina compuesta/);
    await expect(plan.getByLabel("Sección de la prestación 1")).toBeVisible();
    expect(await page.evaluate(() => innerWidth)).toBe(ancho);
    await sinScrollHorizontal(page);
    await plan.getByRole("button", { name: "Cancelar" }).click();

    const carga = await abrirCarga(page);
    await carga.getByLabel("Elegir archivo (Excel o CSV)").setInputFiles(XLSX_DE_PRUEBA);
    await expect(carga).toContainText("4 nuevos");
    expect(await page.evaluate(() => innerWidth)).toBe(ancho);
    await sinScrollHorizontal(page);
    const caja = await carga.boundingBox();
    expect(caja!.x).toBeGreaterThanOrEqual(0);
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(ancho);
  });
});
