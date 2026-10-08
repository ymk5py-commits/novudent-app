import { test, expect, entrarDemo, cerrarSesion, leerDB, USUARIOS_DEMO } from "./soporte";
import type { Page } from "@playwright/test";

/* Arreglos de datos y plata (octubre 2026): cada prueba corre el flujo como lo haría una persona
   y mira lo que quedó guardado. Firebase está cortado: la app guarda en la copia local de la demo. */

type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** El día de hoy, escrito como lo escribe un campo de fecha (hora local). */
const hoyLocal = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

/** Una fecha escrita como la muestra la app (`07 oct.`). */
const comoSeMuestra = (page: Page, aaaammdd: string) =>
  page.evaluate((f) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PY", { day: "2-digit", month: "short" }), aaaammdd);

test("fusionar fichas pasa la ortodoncia, las notas, la lista de espera y los mensajes a la ficha que queda", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/configuracion");
  page.on("dialog", (d) => void d.accept());
  const mantener = page.getByLabel("Mantener esta ficha");
  const duplicada = page.getByLabel("Fusionar y eliminar");
  const fusionar = page.getByRole("button", { name: "Fusionar fichas" });

  // Marco Giménez (p6) tiene la ortodoncia, una nota de evolución y un mensaje de WhatsApp en la cola.
  await mantener.selectOption("p3");
  await duplicada.selectOption("p6");
  await fusionar.click();
  await expect(duplicada).toHaveValue("");
  let db = await leerDB(page);
  expect(db.patients.some((p: Fila) => p.id === "p6"), "la ficha duplicada desaparece").toBe(false);
  const camila = db.patients.find((p: Fila) => p.id === "p3");
  expect(camila.ortho?.active, "la ortodoncia pasa a la ficha que queda").toBe(true);
  expect(camila.ortho.controls).toHaveLength(2);
  expect(camila.emr.some((n: Fila) => n.id === "n5"), "la nota de evolución también").toBe(true);
  expect(db.outbox.find((t: Fila) => t.id === "t1").patientId, "el mensaje de WhatsApp sigue a la ficha que queda").toBe("p3");

  // Lucía Ferreira (p5) está en la lista de espera.
  await mantener.selectOption("p3");
  await duplicada.selectOption("p5");
  await fusionar.click();
  await expect(duplicada).toHaveValue("");
  db = await leerDB(page);
  expect(db.waitlist.find((w: Fila) => w.id === "w1").patientId, "la lista de espera no queda con un paciente que ya no existe").toBe("p3");
});

test("editar un borrador de presupuesto conserva su nombre y deja elegir la sección de cada prestación", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/presupuestos");
  // El único borrador de la demo es el «Blanqueamiento dental» de Camila.
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Editar presupuesto" });
  await expect(modal.getByLabel("Nombre del plan (opcional)")).toHaveValue("Blanqueamiento dental");
  await modal.getByLabel("Sección de la prestación 1").fill("Estética");
  await modal.getByRole("button", { name: "Guardar" }).click();
  await expect(modal).toBeHidden();

  const g4 = (await leerDB(page)).budgets.find((b: Fila) => b.id === "g4");
  expect(g4.name, "el nombre del plan sigue ahí").toBe("Blanqueamiento dental");
  expect(g4.notes, "y también las notas").toBe("Evaluar sensibilidad antes de confirmar.");
  expect(g4.items[0].section).toBe("Estética");
});

test("el descuento de un presupuesto no pasa de 100 %", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/presupuestos");
  await page.getByRole("button", { name: "Nuevo presupuesto" }).click();
  const modal = page.getByRole("dialog", { name: "Nuevo presupuesto" });
  await modal.getByLabel("Descuento %").fill("150");
  await expect(modal.getByLabel("Descuento %")).toHaveValue("100");
  await modal.getByLabel("Descuento %").fill("-20");
  await expect(modal.getByLabel("Descuento %")).toHaveValue("0");
});

test("convenios: un porcentaje fuera de 0 a 100 no se puede agregar y el campo vuelve a 10", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/configuracion");
  const nombre = page.getByPlaceholder("Nombre (ej: IPS)");
  const porcentaje = page.getByLabel("Porcentaje del convenio");
  const agregar = page.getByRole("button", { name: "Agregar convenio" });

  await nombre.fill("Convenio E2E");
  await porcentaje.fill("150");
  await expect(page.getByRole("alert").filter({ hasText: "no puede pasar de 100" })).toBeVisible();
  await expect(agregar).toBeDisabled();

  await porcentaje.fill("12.5");
  await expect(page.getByRole("alert").filter({ hasText: "100" })).toHaveCount(0);
  await expect(agregar).toBeEnabled();
  await agregar.click();
  await expect(porcentaje, "después de agregar, el porcentaje vuelve al de partida").toHaveValue("10");
  await expect(nombre).toHaveValue("");
  const convenio = (await leerDB(page)).clinics[0].config.convenios.find((c: Fila) => c.name === "Convenio E2E");
  expect(convenio.discountPct).toBe(12.5);
});

test.describe("odontograma", () => {
  const sembrarCaries = (page: Page) =>
    page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
      db.patients.find((p: { id: string }) => p.id === "p1").odontogram = { version: "2.10", globals: {}, teeth: { "46": { caries: ["caries-occlusal"] } } };
      localStorage.setItem("novudent.db.v4", JSON.stringify(db));
    });
  /** Cuántas caries tiene guardadas la pieza 46 (la que se siembra). */
  const cariesEn46 = async (page: Page) =>
    ((await leerDB(page)).patients.find((p: Fila) => p.id === "p1").odontogram?.teeth?.["46"]?.caries ?? []).length;

  test("«Restablecer boca» pide confirmación y al aceptar actualiza «Información dental» en el momento", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    await sembrarCaries(page);
    await page.goto("/app/pacientes/p1#odontograma");
    const odo = page.locator(".odontogram-root");
    await expect(odo.locator(".tooth-info")).toContainText("46");

    let pregunta = "";
    page.once("dialog", (d) => { pregunta = d.message(); void d.dismiss(); });
    await odo.locator("#btnResetAll").click();
    expect(pregunta, "antes de borrar toda la boca pregunta").toContain("Restablecer toda la boca");
    await expect(odo.locator(".tooth-info"), "si se rechaza, la carta queda como estaba").toContainText("46");

    page.once("dialog", (d) => void d.accept());
    await odo.locator("#btnResetAll").click();
    await expect(odo.locator(".tooth-info"), "al aceptar, el resumen se actualiza sin recargar").toContainText("No hay dientes con caries");
    await expect.poll(() => cariesEn46(page)).toBe(0);
  });

  test("el último cambio se guarda aunque se cambie de pestaña enseguida", async ({ page }) => {
    await entrarDemo(page, USUARIOS_DEMO.dentista);
    await sembrarCaries(page);
    await page.goto("/app/pacientes/p1#odontograma");
    const odo = page.locator(".odontogram-root");
    await expect(odo.locator(".tooth-info")).toContainText("46");
    expect(await cariesEn46(page)).toBe(1);

    // Se marca el cambio y se sale del odontograma en el mismo instante (dentro de la demora del guardado, 0,8 s):
    // con dos clics de Playwright de por medio podía pasar la demora y la prueba no vería el defecto.
    const restablecer = await odo.locator("#btnResetAll").elementHandle();
    const resumen = await page.locator("main").getByRole("button", { name: "Resumen", exact: true }).elementHandle();
    page.once("dialog", (d) => void d.accept());
    await page.evaluate(([r, t]) => { (r as HTMLElement).click(); (t as HTMLElement).click(); }, [restablecer, resumen]);
    await expect.poll(() => cariesEn46(page), { message: "el cambio hecho justo antes de salir tiene que quedar guardado" }).toBe(0);
  });
});

test("un pago de hoy queda con la hora real del cobro, no al mediodía", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/pacientes/p6");
  await page.getByRole("button", { name: "Recibir pago", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Ingresar un pago" })).toBeVisible();
  await page.getByLabel("Pagar plan #g2").check();
  await page.getByLabel("Monto a abonar al plan #g2").fill("100000");
  await page.getByRole("button", { name: /^Ingresar pago/ }).click();
  await expect(page.getByRole("heading", { name: /^Comprobante N°/ })).toBeVisible();

  const pagos = (await leerDB(page)).payments.filter((p: Fila) => p.patientId === "p6" && p.amount === 100000);
  expect(pagos).toHaveLength(1);
  const diferencia = Math.abs(Date.now() - Date.parse(pagos[0].date));
  expect(diferencia, `el pago quedó fechado ${pagos[0].date}`).toBeLessThan(2 * 60_000);
});

test("laboratorios: las fechas salen como se cargaron, una entrega de hoy no figura vencida y el profesional no repite el título", async ({ page }) => {
  await entrarDemo(page);
  const hoy = await hoyLocal(page);
  // Una orden de antes del arreglo: guardó la fecha elegida como medianoche UTC (7 y 14 de octubre).
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
    db.labOrders.push({ id: "lab-vieja", patientId: "p1", lab: "Dental Lab", workType: "Corona vieja", sentAt: "2030-10-07T00:00:00.000Z", dueAt: "2030-10-14T00:00:00.000Z", status: "enviado", createdAt: "2030-10-07T12:00:00.000Z" });
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  });
  await page.goto("/app/laboratorios");
  const vieja = page.getByRole("row").filter({ hasText: "Corona vieja" });
  expect(await comoSeMuestra(page, "2030-10-07")).not.toBe(await comoSeMuestra(page, "2030-10-06"));
  await expect(vieja.getByRole("cell").nth(3), "la fecha de envío no se corre un día").toHaveText(await comoSeMuestra(page, "2030-10-07"));
  await expect(vieja.getByRole("cell").nth(4)).toContainText(await comoSeMuestra(page, "2030-10-14"));

  // Una orden nueva, con envío y entrega de hoy, con el profesional elegido.
  await page.getByRole("button", { name: "Nueva orden" }).click();
  const modal = page.getByRole("dialog", { name: "Nueva orden de laboratorio" });
  await modal.getByLabel("Paciente").selectOption({ label: "Juan Ríos" });
  await modal.getByLabel("Profesional").selectOption({ label: "Dra. Sofía Benítez" });
  await modal.getByLabel("Laboratorio *").fill("LaboDent");
  await modal.getByLabel("Tipo de trabajo *").fill("Férula");
  await modal.getByLabel("Fecha de envío").fill(hoy);
  await modal.getByLabel("Fecha de entrega").fill(hoy);
  await modal.getByRole("button", { name: "Crear orden" }).click();

  const fila = page.getByRole("row").filter({ hasText: "Férula" });
  await expect(fila).toBeVisible();
  await expect(fila.getByRole("cell").nth(3)).toHaveText(await comoSeMuestra(page, hoy));
  await expect(fila.getByRole("cell").nth(4)).toContainText(await comoSeMuestra(page, hoy));
  await expect(fila.getByText("Dra. Sofía Benítez")).toBeVisible();
  await expect(fila.getByText("Dr. Dra.")).toHaveCount(0);
  await expect(page.getByText("Vencidas", { exact: true }).locator("xpath=ancestor::div[contains(@class,'bg-white') and contains(@class,'rounded')][1]")).toHaveText(/Vencidas\s*0/);
  const orden = (await leerDB(page)).labOrders.find((o: Fila) => o.workType === "Férula");
  expect(orden.sentAt, "se guarda el día tal cual").toBe(hoy);
  expect(orden.dueAt).toBe(hoy);
});

test.describe("caja", () => {
  test("el administrador anula un pago desde Movimientos: pide confirmación y el pago queda en «Pagos eliminados»", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/caja"); // la demo trae la caja del administrador abierta, con tres cobros
    const concepto = "Camila Ortega · Profilaxis (con descuento)";
    const renglon = page.getByText(concepto);
    await expect(renglon).toBeVisible();
    const anular = renglon.locator("xpath=ancestor::li[1]").getByRole("button", { name: "Anular pago" });

    let pregunta = "";
    page.once("dialog", (d) => { pregunta = d.message(); void d.dismiss(); });
    await anular.click();
    expect(pregunta).toContain("¿Anular el pago de");
    await expect(renglon, "si se rechaza, el pago sigue").toBeVisible();

    page.once("dialog", (d) => void d.accept());
    await anular.click();
    await expect(renglon).toHaveCount(0);
    const pago = (await leerDB(page)).payments.find((p: Fila) => p.patientId === "p3" && p.concept === "Profilaxis (con descuento)");
    expect(pago, "el pago no se borra: queda anulado").toBeTruthy();
    expect(pago.voidedAt).toBeTruthy();
    expect(pago.voidedBy).toBe("Carlos Admin");
  });

  test("«Registrar devolución» pide confirmación y no se puede repetir sobre el mismo pago", async ({ page }) => {
    await entrarDemo(page);
    await page.goto("/app/pacientes/p6");
    await page.locator("main").getByRole("button", { name: "Facturación y pagos", exact: true }).first().click();
    const devolver = page.getByRole("button", { name: "Registrar devolución" });
    const antes = await devolver.count();
    expect(antes).toBeGreaterThan(0);
    const devoluciones = async () => (await leerDB(page)).fiscalDocs.filter((d: Fila) => d.kind === "devolucion").length;
    const previas = await devoluciones();

    page.once("dialog", (d) => void d.dismiss());
    await devolver.first().click();
    expect(await devoluciones(), "si se rechaza la pregunta, no se registra nada").toBe(previas);

    page.once("dialog", (d) => void d.accept());
    await devolver.first().click();
    await expect(devolver, "el pago devuelto ya no ofrece devolverse otra vez").toHaveCount(antes - 1);
    await expect(page.getByText("Devuelto", { exact: true })).toHaveCount(1);
    expect(await devoluciones()).toBe(previas + 1);
  });
});

test("box: borrar un box con citas las deja en «Sin box asignado», y a la noche la cita sigue en su día", async ({ page }) => {
  await entrarDemo(page);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
    const hoy = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
    const poner = (a: Record<string, unknown>, inicio: Date, extra: Record<string, unknown>) =>
      Object.assign(a, { start: inicio.toISOString(), end: new Date(inicio.getTime() + 30 * 60_000).toISOString(), ...extra });
    poner(db.appointments[0], hoy(10, 0), { title: "Cita E2E con box", boxId: "box3" });
    poner(db.appointments[1], hoy(22, 30), { title: "Cita E2E de noche" }); // 22:30 en Paraguay ya es el día siguiente en UTC
    delete db.appointments[1].boxId;
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  });
  await page.goto("/app/box");
  const main = page.locator("main");
  const sinBox = main.getByRole("heading", { name: "Sin box asignado" }).locator("xpath=ancestor::div[contains(@class,'bg-white') and contains(@class,'rounded')][1]");

  await expect(main.getByText("Cita E2E con box")).toBeVisible();
  await expect(sinBox.getByText("Cita E2E de noche"), "una cita de las 22:30 es de hoy, no de mañana").toBeVisible();

  let pregunta = "";
  page.once("dialog", (d) => { pregunta = d.message(); void d.dismiss(); });
  await main.getByRole("button", { name: "Eliminar Box 3" }).click();
  expect(pregunta, "avisa cuántas citas tiene el box").toMatch(/Hay 1 cita con este box/);
  await expect(main.getByRole("button", { name: "Eliminar Box 3" })).toBeVisible();

  page.once("dialog", (d) => void d.accept());
  await main.getByRole("button", { name: "Eliminar Box 3" }).click();
  await expect(main.getByRole("button", { name: "Eliminar Box 3" })).toHaveCount(0);
  await expect(sinBox.getByText("Cita E2E con box"), "la cita no desaparece: pasa a «Sin box asignado»").toBeVisible();
  const db = await leerDB(page);
  expect(db.boxes.some((b: Fila) => b.id === "box3")).toBe(false);
  expect(db.appointments.find((a: Fila) => a.title === "Cita E2E con box").boxId, "ya no apunta a un box que no existe").toBeFalsy();
});

test("un logotipo con fondo transparente se guarda con fondo blanco", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/configuracion");
  const antes = (await leerDB(page)).clinics[0].config.logo ?? "";
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 60;
    c.height = 30; // sin dibujar nada: todo transparente
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect.poll(async () => (await leerDB(page)).clinics[0].config.logo ?? "").not.toBe(antes);

  const pixel = await page.evaluate(async () => {
    const logo = JSON.parse(localStorage.getItem("novudent.db.v4")!).clinics[0].config.logo as string;
    const img = new Image();
    img.src = logo;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(2, 2, 1, 1).data);
  });
  expect(pixel.slice(0, 3).every((v) => v > 240), `el fondo del logotipo salió ${pixel.slice(0, 3)} y tendría que ser blanco`).toBe(true);
});

test("la receta impresa muestra la CI solo a quien puede ver datos personales", async ({ page }) => {
  const emitir = async () => {
    await page.goto("/app/pacientes/p1");
    const main = page.locator("main");
    await main.getByRole("button", { name: "Ficha clínica", exact: true }).click();
    await main.getByRole("button", { name: "Recetas", exact: true }).click();
    await main.getByRole("button", { name: "Nueva receta" }).click();
    await page.getByRole("dialog", { name: "Nueva receta" }).getByRole("button", { name: "Emitir receta" }).click();
    const receta = page.getByRole("dialog", { name: "Receta", exact: true });
    await expect(receta).toContainText("María González");
    return receta;
  };

  await entrarDemo(page, USUARIOS_DEMO.dentista);
  const comoDentista = await emitir();
  await expect(comoDentista).not.toContainText("3.456.789");
  await comoDentista.getByRole("button", { name: "Cerrar", exact: true }).last().click();

  await cerrarSesion(page);
  await entrarDemo(page, USUARIOS_DEMO.admin);
  await expect(await emitir()).toContainText("CI 3.456.789");
});
