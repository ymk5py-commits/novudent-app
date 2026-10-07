import { test, expect, entrarDemo, leerDB, USUARIOS_DEMO } from "./soporte";
import type { Page } from "@playwright/test";

/* Documentos clínicos (Ficha clínica › Documentos ▾): la Historia Clínica de Aura, los textos de
   indicaciones por revisar, los consentimientos con plan y profesional, el alta con Historia Clínica
   pendiente y el editor de plantillas de Configuración. La demo corre sin Firebase (localStorage). */

const main = (page: Page) => page.locator("main");

/** Imprime (con `window.print` reemplazado) y devuelve la hoja que sale por la impresora. */
async function imprimir(page: Page) {
  await page.evaluate(() => {
    (window as typeof window & { __impreso?: boolean }).__impreso = false;
    window.print = () => { (window as typeof window & { __impreso?: boolean }).__impreso = true; };
  });
  await page.getByRole("dialog", { name: "Documento clínico" }).getByRole("button", { name: "Imprimir" }).click();
  expect(await page.evaluate(() => (window as typeof window & { __impreso?: boolean }).__impreso)).toBe(true);
  await page.emulateMedia({ media: "print" });
  return page.getByTestId("docclin-print-document");
}

test.describe("Documentos clínicos", () => {
  test("Ficha clínica › Documentos ▾ lleva a Documentos clínicos y a Consentimientos", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/pacientes/p3");
    await page.getByRole("button", { name: "Ficha clínica", exact: true }).click();
    await page.getByRole("button", { name: /^Documentos/ }).click();
    await page.getByRole("menuitem", { name: "Documentos clínicos" }).click();
    await expect(page.getByRole("heading", { name: "Documentos clínicos" })).toBeVisible();
    await page.getByRole("button", { name: /^Documentos/ }).click();
    await page.getByRole("menuitem", { name: "Consentimientos" }).click();
    await expect(page.getByRole("heading", { name: "Consentimiento informado" })).toBeVisible();
    // «Formularios» y «Consentimientos» ya no están en Datos personales.
    await page.getByRole("button", { name: "Datos personales", exact: true }).click();
    await expect(page.getByRole("button", { name: "Formularios" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Consentimientos" })).toHaveCount(0);
  });

  test("completar la Historia Clínica pendiente y verla impresa: solo lo respondido, sin preguntas de embarazo a un hombre", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/pacientes/p2?tab=documentos");
    await expect(page.getByText("Historia Clínica").first()).toBeVisible();
    await page.getByRole("button", { name: "Completar" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo documento clínico" })).toBeVisible();
    await expect(page.getByLabel(/embarazada/)).toHaveCount(0);

    await page.getByLabel("¿Padece o ha padecido alguna enfermedad en los últimos años?").selectOption("Sí");
    await page.getByRole("group", { name: "El paciente refiere haber padecido:" }).getByLabel("Diabetes").check();
    await page.getByLabel("Tensión arterial:").fill("120/80");
    await page.getByRole("button", { name: "Continuar" }).click();

    const visor = page.getByRole("dialog", { name: "Documento clínico" });
    await expect(visor).toContainText("Diabetes");
    await expect(visor).toContainText("120/80");
    await expect(visor).not.toContainText("Hepatitis");

    const hoja = await imprimir(page);
    await expect(hoja).toBeVisible();
    await expect(hoja).toContainText("Historia Clínica");
    await expect(hoja).toContainText("Juan Ríos");
    await expect(hoja).toContainText("120/80");
    await expect(hoja).not.toContainText("Hepatitis");
    await expect(hoja).not.toContainText("BORRADOR");
    await expect(page.locator("main")).toBeHidden();
    await page.emulateMedia({ media: "screen" });

    await visor.getByRole("button", { name: "Cerrar" }).click();
    await expect(page.getByText("Completado", { exact: true })).toBeVisible();
    const db = await leerDB(page);
    const doc = db.clinicalDocs.find((d: { patientId: string }) => d.patientId === "p2");
    expect(doc).toMatchObject({ estado: "completado", completedBy: "Carlos Admin" });
    expect(doc.valores).toMatchObject({ tension_arterial: "120/80", enfermedad_ultimos_anos: "Sí", refiere_padecido: ["Diabetes"] });
  });

  test("a una mujer sí se le preguntan el embarazo y los embarazos anteriores", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/pacientes/p1?tab=documentos");
    await page.getByRole("button", { name: "Completar" }).click();
    await expect(page.getByLabel(/embarazada/)).toBeVisible();
    await expect(page.getByLabel("Número de embarazos anteriores:")).toBeVisible();
  });

  test("guardar borrador deja el documento pendiente, y salir con cambios pide confirmación", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/pacientes/p1?tab=documentos");
    await page.getByRole("button", { name: "Nuevo documento clínico" }).click();
    const modal = page.getByRole("dialog", { name: "Nuevo documento clínico" });
    await modal.getByLabel(/tipo de documento clínico/i).selectOption({ label: "Historia Clínica" });
    await modal.getByRole("button", { name: "Crear documento" }).click();

    await page.getByLabel("Tensión arterial:").fill("100/60");
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(page.getByText("Guardado", { exact: true })).toBeVisible();

    // Con cambios sin guardar, «Descartar y volver» pregunta; si se rechaza, sigue en el editor.
    await page.getByLabel("Pulso cardíaco:").fill("80");
    page.once("dialog", (d) => { expect(d.message()).toContain("cambios sin guardar"); void d.dismiss(); });
    await page.getByRole("button", { name: "Descartar y volver" }).click();
    await expect(page.getByLabel("Pulso cardíaco:")).toHaveValue("80");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Descartar y volver" }).click();
    await expect(page.getByRole("heading", { name: "Documentos clínicos" })).toBeVisible();

    await expect(page.getByRole("button", { name: "Completar" })).toHaveCount(2); // la de la demo y la nueva
    const db = await leerDB(page);
    const propios = db.clinicalDocs.filter((d: { patientId: string }) => d.patientId === "p1");
    expect(propios).toHaveLength(2);
    expect(propios.find((d: { valores?: Record<string, string> }) => d.valores?.tension_arterial === "100/60")).toMatchObject({ estado: "pendiente" });
    expect(propios.some((d: { valores?: Record<string, string> }) => d.valores?.pulso === "80")).toBe(false); // lo descartado no se guardó
  });

  test("un texto de indicaciones sale «por revisar»: aviso en el editor y leyenda de borrador en la hoja", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/pacientes/p3?tab=documentos");
    await page.getByRole("button", { name: "Nuevo documento clínico" }).click();
    const modal = page.getByRole("dialog", { name: "Nuevo documento clínico" });
    await modal.getByLabel(/tipo de documento clínico/i).selectOption({ label: "Cuidados postoperatorios de exodoncia (por revisar)" });
    await expect(modal.getByRole("note")).toContainText("todavía no lo revisó un odontólogo");
    await modal.getByLabel("Profesional a cargo").selectOption({ label: "Dra. Sofía Benítez" });
    await modal.getByRole("button", { name: "Crear documento" }).click();

    await expect(page.getByRole("note")).toContainText("borrador de Novudent");
    const texto = page.getByLabel("Texto del documento");
    await expect(texto).toHaveValue(/Estimado\/a Camila Ortega:/);
    await expect(texto).toHaveValue(/Profesional a cargo: Dra\. Sofía Benítez/);
    await page.getByRole("button", { name: "Continuar" }).click();

    const visor = page.getByRole("dialog", { name: "Documento clínico" });
    await expect(visor).toContainText("BORRADOR — pendiente de revisión por un odontólogo");
    const hoja = await imprimir(page);
    await expect(hoja).toContainText("BORRADOR — pendiente de revisión por un odontólogo");
    await expect(hoja).toContainText("Camila Ortega");
    await expect(hoja).toContainText("Dra. Sofía Benítez");
    await expect(hoja).toContainText("Muerda suavemente la gasa");
    await page.emulateMedia({ media: "screen" });
  });

  test("los enlaces viejos a «Formularios» abren Documentos clínicos y los formularios anteriores se siguen completando", async ({ page }) => {
    await entrarDemo(page);
    for (const url of ["/app/pacientes/p4?tab=formularios", "/app/pacientes/p4#formularios"]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: "Documentos clínicos" })).toBeVisible();
      await expect(page.getByText("Historia médica (actualización)")).toBeVisible();
    }
    await page.getByRole("button", { name: "Completar" }).click();
    await expect(page.getByRole("dialog", { name: "Completar: Historia médica (actualización)" })).toBeVisible();
  });

  test("la recepción ve y crea documentos clínicos pero no el resto de la ficha clínica", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/p3?tab=documentos");
    await expect(page.getByRole("heading", { name: "Documentos clínicos" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuevo documento clínico" })).toBeVisible();
    for (const oculta of ["Odontograma", "Evoluciones", "Antecedentes médicos", "Periodoncia"]) {
      await expect(page.getByRole("button", { name: oculta })).toHaveCount(0);
    }
  });

  test("el asistente de doctores solo lee los documentos", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.asistente);
    await page.goto("/app/pacientes/p3?tab=documentos");
    await expect(page.getByRole("heading", { name: "Documentos clínicos" })).toBeVisible();
    await expect(page.getByText("Tu rol puede ver los documentos clínicos, pero no crearlos ni editarlos.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuevo documento clínico" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ver / imprimir" })).toBeVisible(); // p3 tiene uno completado
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Anular" })).toHaveCount(0);
  });

  test("un documento anulado queda en la ficha: se esconde y vuelve con «Mostrar anulados»", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/pacientes/p2?tab=documentos");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Anular" }).click();
    await expect(page.getByText("Sin documentos clínicos")).toBeVisible();
    await page.getByLabel("Mostrar anulados").check();
    await expect(page.getByText("Anulado", { exact: true })).toBeVisible();
    const db = await leerDB(page);
    expect(db.clinicalDocs.find((d: { id: string }) => d.id === "cd_demo_p2")).toMatchObject({ estado: "anulado", voidedBy: "Carlos Admin" });
  });

  test("el historial suma el documento completado", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/pacientes/p3");
    await page.getByRole("button", { name: "Ficha clínica", exact: true }).click();
    await page.getByRole("button", { name: "Historial", exact: true }).click();
    await expect(page.getByText("Documento clínico").first()).toBeVisible();
    await expect(page.getByText("Historia Clínica").first()).toBeVisible();
  });
});

test.describe("Consentimientos con plan y profesional", () => {
  test("«Crear nuevo consentimiento» pide tipo y profesional, y guarda el profesional", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/pacientes/p3?tab=consentimientos");
    await page.getByRole("button", { name: "Nuevo consentimiento informado" }).click();
    const d = page.getByRole("dialog", { name: "Crear nuevo consentimiento" });
    await expect(d.getByRole("button", { name: "Crear consentimiento" })).toBeDisabled();
    await d.getByLabel(/Tipo de consentimiento/).selectOption({ index: 1 });
    await expect(d.getByRole("button", { name: "Crear consentimiento" })).toBeDisabled(); // falta el profesional
    await d.getByLabel(/Profesional a cargo/).selectOption({ label: "Dra. Sofía Benítez" });
    await d.getByRole("button", { name: "Crear consentimiento" }).click();

    await expect(main(page).getByText(/Dra\. Sofía Benítez/)).toBeVisible();
    const db = await leerDB(page);
    expect(db.signatures[0]).toMatchObject({ patientId: "p3", dentistId: "u2", status: "pendiente" });
  });

  test("los consentimientos anulados se esconden hasta marcar «Mostrar anulados»", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/pacientes/p3?tab=consentimientos");
    await page.getByRole("button", { name: "Nuevo consentimiento informado" }).click();
    const d = page.getByRole("dialog", { name: "Crear nuevo consentimiento" });
    await d.getByLabel(/Tipo de consentimiento/).selectOption({ index: 1 });
    await d.getByLabel(/Profesional a cargo/).selectOption({ label: "Dra. Sofía Benítez" });
    await d.getByRole("button", { name: "Crear consentimiento" }).click();
    await page.getByRole("button", { name: "Anular" }).click();
    await expect(page.getByText("Este paciente no cuenta con ningún consentimiento informado.")).toBeVisible();
    await page.getByLabel("Mostrar anulados").check();
    await expect(page.getByText("Anulado", { exact: true })).toBeVisible();
  });
});

test.describe("Alta de paciente y campana", () => {
  test("el paciente nuevo arranca con la Historia Clínica pendiente y sin el formulario viejo", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/pacientes/nuevo");
    await main(page).getByLabel("Nombre legal *").fill("Rosa");
    await main(page).getByLabel("Apellidos *").fill("Campos");
    await main(page).getByLabel("Cédula / DNI *").fill("7.777.777");
    await main(page).getByLabel("Fecha de nacimiento *").fill("1990-05-20");
    await main(page).getByLabel("Sexo *").selectOption("F");
    await main(page).getByLabel("Género *").selectOption("nd");
    await main(page).getByLabel("Teléfono móvil *").fill("0981 777 777");
    await main(page).getByRole("button", { name: "Crear paciente" }).click();
    await page.waitForURL(/\/app\/pacientes\/p_/);

    await expect.poll(async () => (await leerDB(page))?.patients.some((p: { document: string }) => p.document === "7.777.777")).toBe(true);
    const db = await leerDB(page);
    const nuevo = db.patients.find((p: { document: string }) => p.document === "7.777.777");
    expect(nuevo.forms).toEqual([]);
    const docs = db.clinicalDocs.filter((d: { patientId: string }) => d.patientId === nuevo.id);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ plantillaId: "historia_clinica", estado: "pendiente", nombre: "Historia Clínica" });

    await page.goto(`/app/pacientes/${nuevo.id}?tab=documentos`);
    await expect(page.getByText("Historia Clínica")).toBeVisible();
    await expect(page.getByText("Pendiente", { exact: true })).toBeVisible();
  });

  test("la campana cuenta pacientes con documentos pendientes y baja al completar uno", async ({ page }) => {
    await entrarDemo(page);
    const leer = async () => Number(/\((\d+)\)/.exec((await page.getByRole("link", { name: /Ver pendientes/ }).getAttribute("aria-label")) ?? "")?.[1]);
    await expect.poll(leer).toBeGreaterThanOrEqual(3); // p1 y p2 (documentos) y p4 (formulario viejo)
    const antes = await leer();
    await page.goto("/app/pacientes/p2?tab=documentos");
    await page.getByRole("button", { name: "Completar" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("dialog", { name: "Documento clínico" }).getByRole("button", { name: "Cerrar" }).click();
    await expect.poll(leer).toBe(antes - 1);
  });
});

test.describe("Configuración › Documentos clínicos", () => {
  test("desactivar una plantilla, marcar un texto como revisado y crear una propia", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/configuracion#documentos-clinicos");
    const fila = (nombre: string) => page.getByRole("row", { name: new RegExp(nombre) });
    await expect(fila("Cuidados postoperatorios de exodoncia")).toContainText("Por revisar");
    await fila("Higiene y cepillado en adultos").getByRole("button", { name: "Desactivar" }).click();
    await fila("Cuidados postoperatorios de exodoncia").getByRole("button", { name: "Marcar como revisada" }).click();

    // Una plantilla propia: formulario con una sección y un campo.
    await page.getByRole("button", { name: "Nueva plantilla de documento" }).click();
    const ed = page.getByRole("dialog", { name: "Nueva plantilla de documento" });
    await ed.getByRole("button", { name: "Crear plantilla" }).click();
    await expect(ed.getByRole("alert")).toContainText("necesita un nombre");
    await ed.getByLabel("Nombre de la plantilla").fill("Control de ortodoncia");
    await ed.getByRole("button", { name: "Agregar sección" }).click();
    await ed.getByLabel("Sección 1").fill("Control mensual");
    await ed.getByRole("button", { name: "Agregar campo" }).click();
    await ed.getByLabel("Rótulo del campo 1 de Control mensual").fill("Observaciones del control");
    await ed.getByRole("button", { name: "Crear plantilla" }).click();
    await page.getByRole("button", { name: "Guardar plantillas" }).click();
    await expect.poll(async () => (await leerDB(page))?.clinics[0].config.plantillasDocumento?.length).toBe(5);

    await page.goto("/app/pacientes/p3?tab=documentos");
    await page.getByRole("button", { name: "Nuevo documento clínico" }).click();
    const modal = page.getByRole("dialog", { name: "Nuevo documento clínico" });
    await expect(modal.getByRole("option", { name: "Higiene y cepillado en adultos" })).toHaveCount(0); // desactivada
    await expect(modal.getByRole("option", { name: "Cuidados postoperatorios de exodoncia", exact: true })).toHaveCount(1); // ya sin «por revisar»
    await modal.getByLabel(/tipo de documento clínico/i).selectOption({ label: "Control de ortodoncia" });
    await modal.getByRole("button", { name: "Crear documento" }).click();
    await expect(page.getByRole("heading", { name: "Control mensual" })).toBeVisible();
    await expect(page.getByLabel("Observaciones del control")).toBeVisible();
    await expect(page.getByRole("note")).toHaveCount(0); // no es un borrador por revisar
  });

  test("el administrador ve «Documentos clínicos» en el menú de Configuración", async ({ page }) => {
    await entrarDemo(page);
    // En el celular la navegación es un menú lateral; en escritorio, el desplegable «Administración».
    const abrir = page.getByRole("button", { name: "Abrir menú" });
    if (await abrir.isVisible()) await abrir.click();
    else await page.getByRole("button", { name: /Administración/ }).click();
    await expect(page.getByRole("link", { name: "Documentos clínicos" }).filter({ visible: true }).first()).toBeVisible();
  });
});
