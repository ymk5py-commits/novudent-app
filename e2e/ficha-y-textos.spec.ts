import { test, expect, entrarDemo, leerDB, sinScrollHorizontal, USUARIOS_DEMO } from "./soporte";
import type { Locator, Page } from "@playwright/test";

/* Defectos de la ficha del paciente y de textos sueltos que dejó el manual (hallazgos B1–B9, 8-oct-2026).
   Cada bloque falla con el código anterior y pasa con el arreglo. */

const main = (page: Page) => page.locator("main");

/** La tarjeta (div con `p-5`) cuyo título es `titulo`. */
const tarjeta = (page: Page, titulo: string): Locator =>
  page.getByRole("heading", { name: titulo, exact: true }).locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' p-5 ')][1]");

/** Cambia la copia local de la demo (la app trabaja sin Firebase en los e2e); hay que abrir la pantalla DESPUÉS. */
const cambiarDemo = (page: Page, cambios: { usuarios?: Record<string, object>; config?: object }) =>
  page.evaluate((c) => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
    if (c.usuarios) db.users = db.users.map((u: { id: string }) => (c.usuarios![u.id] ? { ...u, ...c.usuarios![u.id] } : u));
    if (c.config) db.clinics[0].config = { ...db.clinics[0].config, ...c.config };
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  }, cambios);

type Paciente = { id: string; document: string; phone: string; firstName: string; lastName: string };
const pacientes = async (page: Page) => (await leerDB(page)).patients as Paciente[];

/** Completa los obligatorios del alta (nombre, apellido, CI, nacimiento, sexo, género, teléfono y email). */
async function completarObligatorios(zona: Locator, d: { nombre: string; apellido: string; ci: string; tel: string; email?: string }) {
  await zona.getByLabel("Nombre legal *").fill(d.nombre);
  await zona.getByLabel("Apellidos *").fill(d.apellido);
  await zona.getByLabel("Cédula / DNI *").fill(d.ci);
  await zona.getByLabel("Fecha de nacimiento *").fill("1990-05-20");
  await zona.getByLabel("Sexo *").selectOption("F");
  await zona.getByLabel("Género *").selectOption("nd");
  await zona.getByLabel("Teléfono móvil *").fill(d.tel);
  await zona.getByLabel("Email *").fill(d.email ?? "paciente@correo.com");
}

/** «Dar cita» → «Crear nuevo paciente»: devuelve las dos ventanas. */
async function abrirCrearPaciente(page: Page) {
  await page.goto("/app/agenda");
  await main(page).getByRole("button", { name: "Dar cita" }).click();
  const cita = page.getByRole("dialog", { name: "Dar cita" });
  await cita.getByRole("combobox", { name: "Paciente" }).click();
  await cita.getByRole("option", { name: "Crear nuevo paciente" }).click();
  return { cita, ficha: page.getByRole("dialog", { name: "Nuevo paciente" }) };
}

/* ═══════════════════════ B1 · Datos personales y alta de pacientes ═══════════════════════ */

test.describe("B1 · Datos personales de la ficha", () => {
  test("«Datos requeridos» es lo que pide el alta: sexo y género sí; el tipo no", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/p2?tab=datos");
    const requeridos = tarjeta(page, "Datos requeridos");
    const opcionales = tarjeta(page, "Datos opcionales");
    for (const campo of ["Nombre legal", "Apellidos", "Cédula identidad / DNI", "Fecha de nacimiento", "Sexo", "Género", "Teléfono móvil", "Email"]) {
      await expect(requeridos.getByLabel(campo), `${campo} tiene que estar en «Datos requeridos»`).toHaveCount(1);
    }
    await expect(requeridos.getByLabel("Tipo", { exact: true })).toHaveCount(0);
    await expect(opcionales.getByLabel("Tipo", { exact: true })).toHaveCount(1);
    for (const campo of ["Sexo", "Género", "Email"]) await expect(opcionales.getByLabel(campo), `${campo} no es opcional`).toHaveCount(0);
  });

  test("si la clínica cambia lo obligatorio, la ficha lo sigue", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await cambiarDemo(page, { config: { patientFields: { email: { required: { nuevo: false } }, empleador: { present: { nuevo: true }, required: { nuevo: true } } } } });
    await page.goto("/app/pacientes/p2?tab=datos");
    await expect(tarjeta(page, "Datos requeridos").getByLabel("Empleador")).toHaveCount(1);
    await expect(tarjeta(page, "Datos requeridos").getByLabel("Email")).toHaveCount(0);
    await expect(tarjeta(page, "Datos opcionales").getByLabel("Email")).toHaveCount(1);
  });

  test("«Guardar datos» no deja vaciar la CI ni el teléfono", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/p1?tab=datos");
    const requeridos = tarjeta(page, "Datos requeridos");
    await requeridos.getByLabel("Cédula identidad / DNI").fill("");
    await requeridos.getByLabel("Teléfono móvil").fill("");
    await main(page).getByRole("button", { name: "Guardar datos" }).click();
    const aviso = main(page).getByRole("alert");
    await expect(aviso).toContainText("No se guardó");
    await expect(aviso).toContainText("Cédula / DNI");
    await expect(aviso).toContainText("Teléfono móvil");
    expect((await pacientes(page)).find((p) => p.id === "p1")).toMatchObject({ document: "3.456.789", phone: "+595 981 111 111" });
  });

  test("si se escribe la CI de otro paciente, la ficha avisa (sin impedir guardar)", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/p2?tab=datos");
    await tarjeta(page, "Datos requeridos").getByLabel("Cédula identidad / DNI").fill("3456789"); // la de María González
    await expect(main(page).getByText("Otro paciente tiene esta misma CI")).toBeVisible();
    await expect(main(page).getByRole("link", { name: "María González" })).toHaveAttribute("href", "/app/pacientes/p1");
    await expect(main(page).getByRole("button", { name: "Guardar datos" })).toBeEnabled();
    await tarjeta(page, "Datos requeridos").getByLabel("Cédula identidad / DNI").fill("4.567.890"); // la suya: no es una repetida
    await expect(main(page).getByText("Otro paciente tiene esta misma CI")).toHaveCount(0);
  });

  test("un dato requerido que el paciente nunca tuvo no impide corregir otro", async ({ page }) => {
    // Juan Ríos se cargó cuando el email no era obligatorio: cambiarle el teléfono tiene que poder guardarse.
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/p2?tab=datos");
    await expect(main(page)).toContainText("Faltan datos requeridos: Email");
    await tarjeta(page, "Datos requeridos").getByLabel("Teléfono móvil").fill("+595 982 999 000");
    await main(page).getByRole("button", { name: "Guardar datos" }).click();
    await expect.poll(async () => (await pacientes(page)).find((p) => p.id === "p2")?.phone).toBe("+595 982 999 000");
    await expect(main(page).getByRole("alert")).toHaveCount(0);
  });
});

test.describe("B1 · CI repetida al crear un paciente", () => {
  test("el alta avisa, enlaza la ficha existente y pide confirmar que es otra persona", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/nuevo");
    const antes = (await pacientes(page)).length;
    // 3456789 es la CI de María González (3.456.789): sin puntos es la misma persona.
    await completarObligatorios(main(page), { nombre: "Otra", apellido: "Persona", ci: "3456789", tel: "0981 000 111" });
    await expect(main(page).getByText("Ya hay un paciente con esa CI")).toBeVisible();
    await expect(main(page).getByRole("link", { name: "María González" })).toHaveAttribute("href", "/app/pacientes/p1");

    await main(page).getByRole("button", { name: "Crear paciente" }).click();
    await expect(main(page).getByRole("alert")).toContainText("Ya hay un paciente con esa CI");
    expect(page.url()).toContain("/app/pacientes/nuevo");
    expect((await pacientes(page)).length).toBe(antes);

    await main(page).getByLabel(/Es otra persona/).check();
    await main(page).getByRole("button", { name: "Crear paciente" }).click();
    await page.waitForURL(/\/app\/pacientes\/p_/);
    await expect.poll(async () => (await pacientes(page)).filter((p) => p.document.replace(/\D/g, "") === "3456789").length).toBe(2);
  });

  test("una CI que no es de nadie no molesta", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/nuevo");
    await completarObligatorios(main(page), { nombre: "Nueva", apellido: "Persona", ci: "9.123.456", tel: "0981 000 222" });
    await expect(main(page).getByText("Ya hay un paciente con esa CI")).toHaveCount(0);
    await main(page).getByRole("button", { name: "Crear paciente" }).click();
    await page.waitForURL(/\/app\/pacientes\/p_/);
  });

  test("al dar una cita, el popup de paciente nuevo ofrece usar al que ya existe", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    const { cita, ficha } = await abrirCrearPaciente(page);
    await completarObligatorios(ficha, { nombre: "Otra", apellido: "Persona", ci: "3.456.789", tel: "0981 000 333" });
    await expect(ficha.getByText("Ya hay un paciente con esa CI")).toBeVisible();
    const antes = (await pacientes(page)).length;
    await ficha.getByRole("button", { name: "Crear paciente" }).click();
    await expect(ficha.getByRole("alert")).toContainText("Ya hay un paciente con esa CI");
    expect((await pacientes(page)).length).toBe(antes);
    await ficha.getByRole("button", { name: "Usar a María González" }).click();
    await expect(ficha).toHaveCount(0);
    await expect(cita.getByRole("combobox", { name: "Paciente" })).toHaveValue("3.456.789 | MARÍA GONZÁLEZ");
    expect((await pacientes(page)).length).toBe(antes);
  });
});

/* ═══════════════════════ B8 · Avisos propios en vez del globito del navegador ═══════════════════════ */

test.describe("B8 · «Completá: …» aparece de verdad", () => {
  test("el alta lista todo lo que falta, marca los campos y lleva el foco al primero", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/nuevo");
    const antes = (await pacientes(page)).length;
    await main(page).getByRole("button", { name: "Crear paciente" }).click();
    await expect(main(page).getByRole("alert")).toContainText("Completá: Nombre legal, Apellidos, Cédula / DNI, Fecha de nacimiento, Sexo, Género, Teléfono móvil, Email.");
    await expect(main(page).getByLabel("Nombre legal *")).toBeFocused();
    await expect(main(page).getByLabel("Nombre legal *")).toHaveAttribute("aria-invalid", "true");
    await expect(main(page).getByLabel("Cédula / DNI *")).toHaveAttribute("aria-invalid", "true");
    expect(page.url()).toContain("/app/pacientes/nuevo");
    expect((await pacientes(page)).length).toBe(antes);
  });

  test("solo espacios en la CI y un correo sin dominio tampoco pasan", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    await page.goto("/app/pacientes/nuevo");
    await completarObligatorios(main(page), { nombre: "Ana", apellido: "Prueba", ci: "   ", tel: "0981 000 444", email: "ana@correo" });
    await main(page).getByRole("button", { name: "Crear paciente" }).click();
    await expect(main(page).getByRole("alert")).toContainText("Completá: Cédula / DNI.");
    await expect(main(page).getByRole("alert")).toContainText("Revisá: Email.");
    await expect(main(page).getByLabel("Email *")).toHaveAttribute("aria-invalid", "true");
    await expect(main(page).getByLabel("Cédula / DNI *")).toBeFocused();
  });

  test("al dar una cita pasa lo mismo en el popup de paciente nuevo", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.recepcionista);
    const { ficha } = await abrirCrearPaciente(page);
    const antes = (await pacientes(page)).length;
    await ficha.getByLabel("Nombre legal *").fill("Sin");
    await ficha.getByLabel("Apellidos *").fill("Cédula");
    await ficha.getByRole("button", { name: "Crear paciente" }).click();
    await expect(ficha.getByRole("alert")).toContainText("Completá: Cédula / DNI, Fecha de nacimiento, Sexo, Género, Teléfono móvil, Email.");
    await expect(ficha.getByLabel("Cédula / DNI *")).toBeFocused();
    expect((await pacientes(page)).length).toBe(antes);
  });
});

/* ═══════════════════════ B2 · Importación de pacientes ═══════════════════════ */

test.describe("B2 · Importar pacientes", () => {
  test("texto neutro, sin duplicar CI (ni contra los que ya existen) y con la Historia Clínica pendiente", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.admin);
    await page.goto("/app/configuracion");
    await expect(main(page).getByRole("heading", { name: /Migración/ })).toBeVisible();
    await expect(main(page)).not.toContainText("Dentalink");

    await main(page).getByRole("button", { name: "Iniciar migración" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).not.toContainText("Dentalink");
    // Ana Uno y Beto Dos son nuevos; la segunda «Ana» repite la CI de la primera (escrita sin puntos); Carla ya existe (María González).
    await modal.locator("textarea").fill([
      "Nombre;Apellido;CI;Teléfono;Email;Deuda",
      "Ana;Uno;7.000.001;0981 100 001;;150000",
      "Beto;Dos;7.000.002;0981 100 002;;",
      "Ana;Repetida;7000001;0981 100 003;;",
      "Carla;Existe;3.456.789;0981 100 004;;",
    ].join("\n"));
    await modal.getByRole("button", { name: "Continuar" }).click();
    await modal.getByRole("button", { name: "Vista previa" }).click();
    await expect(modal).toContainText("2 nuevos");
    await expect(modal).toContainText("1 ya cargado");
    await expect(modal).toContainText("1 repetido en el archivo");
    await modal.getByRole("button", { name: "Importar 2 pacientes" }).click();
    await expect(modal).toContainText("2 pacientes importados");
    await expect(modal).toContainText("2 duplicados omitidos");

    const db = await leerDB(page);
    const nuevos = (db.patients as Paciente[]).filter((p) => ["7.000.001", "7.000.002"].includes(p.document));
    expect(nuevos.map((p) => p.firstName).sort()).toEqual(["Ana", "Beto"]);
    expect((db.patients as Paciente[]).filter((p) => /Repetida|Existe/.test(p.lastName))).toHaveLength(0);
    // Igual que el alta de la recepción: cada paciente importado queda con la Historia Clínica pendiente.
    for (const p of nuevos) {
      const hc = (db.clinicalDocs as { patientId: string; plantillaId: string; estado: string }[]).filter((d) => d.patientId === p.id && d.plantillaId === "historia_clinica");
      expect(hc, `Historia Clínica de ${p.firstName}`).toHaveLength(1);
      expect(hc[0].estado).toBe("pendiente");
    }
    // El saldo migrado (Cuentas por cobrar) tampoco nombra a otro sistema.
    const saldo = (db.budgets as { patientId: string; items: { description: string }[]; history?: { action: string }[] }[]).find((b) => b.patientId === nuevos.find((p) => p.firstName === "Ana")!.id)!;
    expect(JSON.stringify(saldo)).not.toContain("Dentalink");
    expect(saldo.items[0].description).toBe("Saldo migrado de otro sistema");
  });
});

/* ═══════════════════════ B3 · Plan de tratamiento ═══════════════════════ */

test.describe("B3 · Plan de tratamiento", () => {
  test("la columna dice «Estado» (se hizo o no), no «Pago»", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    await page.goto("/app/pacientes/p1#planes");
    await main(page).getByRole("button", { name: /Plan dental integral/ }).click();
    const tabla = main(page).getByRole("table");
    await expect(tabla.getByRole("columnheader", { name: "Estado" })).toBeVisible();
    await expect(tabla.getByRole("columnheader", { name: "Pago" })).toHaveCount(0);
    await expect(tabla.getByText("Pendiente", { exact: true })).toHaveCount(3);

    // Un plan con prestaciones hechas (el plan completado de Andrés Mejía).
    await page.goto("/app/pacientes/p4#planes");
    await main(page).locator("select").selectOption("todos");
    await main(page).getByRole("button", { name: /Exodoncia y control/ }).click();
    await expect(main(page).getByRole("table").getByText("Realizada", { exact: true })).toHaveCount(2);
  });

  test("la lista de planes dice si cada uno es Borrador, Presentado o Aceptado", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    await page.goto("/app/pacientes/p1#planes");
    await expect(main(page).getByRole("button", { name: /Plan dental integral/ })).toContainText("Presentado");
    await page.goto("/app/pacientes/p3#planes");
    await expect(main(page).getByRole("button", { name: /Blanqueamiento dental/ })).toContainText("Borrador");
  });

  test("la asistente (solo lectura) no recibe la orden de subir fotos en «Estética facial»", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.asistente);
    await page.goto("/app/pacientes/p1#planes");
    await main(page).getByRole("button", { name: /Plan dental integral/ }).click();
    await main(page).getByRole("button", { name: "Estética facial" }).click();
    await expect(main(page).getByRole("heading", { name: "Estética facial" })).toBeVisible();
    await expect(main(page)).not.toContainText("Subí registros");
    await expect(main(page)).toContainText("Todavía no hay fotos");
  });

  test("quien sí puede subirlas sigue viendo la instrucción", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    await page.goto("/app/pacientes/p1#planes");
    await main(page).getByRole("button", { name: /Plan dental integral/ }).click();
    await main(page).getByRole("button", { name: "Estética facial" }).click();
    await expect(main(page)).toContainText("Subí registros frontal/perfil");
  });

  // «Preparar consulta» resume la ficha clínica (evoluciones incluidas): es para quien la lee (`emr.read`), como en la cabecera de la ficha.
  for (const quien of [USUARIOS_DEMO.recepcionista, USUARIOS_DEMO.caja, USUARIOS_DEMO.comercial]) {
    test(`«Preparar consulta» no está en el plan de ${quien}, que no lee la ficha clínica`, async ({ page }) => {
      await entrarDemo(page, quien);
      await page.goto("/app/pacientes/p1#planes");
      await main(page).getByRole("button", { name: /Plan dental integral/ }).click();
      await expect(main(page).getByRole("heading", { name: "Plan dental integral" })).toBeVisible();
      await expect(main(page).getByRole("button", { name: "Preparar consulta" })).toHaveCount(0);
    });
  }

  for (const quien of [USUARIOS_DEMO.dentista, USUARIOS_DEMO.asistente]) {
    test(`${quien}, que lee la ficha clínica, la sigue viendo`, async ({ page }) => {
      await entrarDemo(page, quien);
      await page.goto("/app/pacientes/p1#planes");
      await main(page).getByRole("button", { name: /Plan dental integral/ }).click();
      await expect(main(page).getByRole("heading", { name: "Plan dental integral" })).toBeVisible();
      await expect(main(page).getByRole("button", { name: "Preparar consulta" }).first()).toBeVisible();
    });
  }
});

/* ═══════════════════════ B5 · Odontograma y radiografías ═══════════════════════ */

test.describe("B5 · Textos del odontograma y de radiografías", () => {
  test("el odontograma habla en voseo", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    await page.goto("/app/pacientes/p1#odontograma");
    await expect(page.locator(".tooth-tile.side-view svg")).toHaveCount(32);
    await expect(page.locator(".chart-hint")).toHaveText("Hacé clic en un diente. Para selección múltiple, usá Cmd/Ctrl + clic.");
    // `#contenido` es el <main> de la app; el motor del odontograma trae otro <main> adentro.
    const texto = await page.locator("#contenido").evaluate((n) => n.textContent ?? "");
    expect(texto).not.toMatch(/\bHaz clic\b|\bSelecciona\b|\busa CMD\b/);
  });

  test("la carga de radiografías no se llama «Análisis IA»: la IA es un paso opcional", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    await page.goto("/app/pacientes/p1#radiografias");
    await expect(main(page).getByRole("heading", { name: "Subir una radiografía" })).toBeVisible();
    await expect(main(page).getByRole("heading", { name: "Análisis IA de radiografías" })).toHaveCount(0);
    await expect(main(page)).toContainText("Analizar con IA");
  });
});

