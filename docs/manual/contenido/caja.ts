import type { Locator, Page } from "@playwright/test";
import type { Captor, OpcionesFoto, Procedimiento } from "./tipos";

/* Capítulo «Recepción y caja». Todas las capturas se sacan entrando como Marta Caja (`cashier`).
 *
 * Lo que hay que saber de cómo viene la demo y de cómo se cuida cada captura:
 *  - Marta NO tiene caja abierta (la que trae la demo es de Carlos Admin, abierta el lunes): por eso «Abrir caja» se puede fotografiar.
 *  - El cheque de Marco Giménez (Banco Itaú) vence el jueves de la semana en curso y según el día puede salir «Atrasado». Los cheques
 *    que se muestran se cargan acá, con fecha de cobro a 15 días; el de la demo solo aparece de relleno y el texto explica el «Atrasado».
 *  - Un pago ingresado desde la ficha («Recibir pago») queda fechado a las 12:00 del día elegido y la caja solo cuenta lo que cae
 *    entre su apertura y «ahora». Lo que tiene que verse en «Movimientos de la caja» se carga con «Registrar pago» de Cajas,
 *    que usa la hora real, para que la captura salga igual a cualquier hora.
 *  - La tarjeta de un presupuesto recién creado queda invisible hasta recargar la página (error de la app: ver el informe); por eso,
 *    después de «Guardar», se vuelve a entrar a Presupuestos, que es lo que haría la persona.
 *  - El menú de arriba es fijo: cuando lo que se muestra está más abajo, la foto se saca con la página arriba de todo y una ventana alta
 *    (`fotoAlta`), así el menú no se cuela en el recorte. */

/* ---------- ayudas (solo para sacar capturas) ---------- */

/** YYYY-MM-DD de hoy más `dias`, en la hora de la clínica. */
const fechaEn = (dias: number) => {
  const d = new Date(Date.now() + dias * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** La foto con la página arriba de todo y una ventana alta: el menú fijo no tapa lo que se recorta más abajo. */
async function fotoAlta(c: Captor, nombre: string, o: OpcionesFoto, alto = 1150) {
  await c.page.evaluate(() => window.scrollTo(0, 0));
  await c.foto(nombre, { ...o, alto });
}

/** Saca el foco y el mouse de donde quedaron: así la captura no muestra un botón «apretado» (anillo o color de «encima») que no es el que se explica. */
async function quitarFoco(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(1270, 745);
}

/** «Abrir caja» recorriendo la pantalla: deja abierta la caja de Marta con ese saldo inicial, como paso previo de los demás procedimientos. */
async function abrirMiCaja(c: Captor, saldo = 200_000) {
  const { page } = c;
  await c.ir("/app/caja");
  await page.getByRole("button", { name: "Abrir caja" }).first().click();
  const modal = page.getByRole("dialog", { name: "Abrir caja" });
  await modal.getByLabel("Saldo inicial (Gs)").fill(String(saldo));
  await modal.getByRole("button", { name: "Abrir caja" }).click();
  await c.expect(page.getByText("Caja abierta", { exact: true })).toBeVisible();
}

/** «Registrar pago» de Cajas (el cobro corto, de un solo medio). Se usa para que la caja tenga movimientos con la hora real. */
async function cobroRapido(c: Captor, o: { paciente: string; presupuesto?: boolean; monto?: number; metodo?: string; concepto?: string }) {
  const { page } = c;
  await page.getByRole("button", { name: "Registrar pago" }).first().click();
  const modal = page.getByRole("dialog", { name: "Registrar pago" });
  await modal.getByLabel("Paciente").selectOption({ label: o.paciente });
  if (o.presupuesto) await modal.getByLabel(/^Presupuesto/).selectOption({ index: 1 });
  if (o.monto !== undefined) await modal.getByLabel("Monto (Gs)").fill(String(o.monto));
  if (o.metodo) await modal.getByLabel("Método").selectOption({ label: o.metodo });
  if (o.concepto) await modal.getByLabel("Concepto").fill(o.concepto);
  await modal.getByRole("button", { name: /^Registrar/ }).click();
  await c.expect(modal).toBeHidden();
}

/** La ficha del paciente, en el grupo «Recibir pago». */
async function irARecibirPago(c: Captor, paciente = "p6") {
  await c.ir(`/app/pacientes/${paciente}`);
  await c.page.getByRole("button", { name: "Recibir pago", exact: true }).first().click();
  await c.expect(c.page.getByRole("heading", { name: "Ingresar un pago" })).toBeVisible();
}

/** Lo que se ve en «Recibir pago»: el título, el paso 1 (qué se paga) y el paso 2 (medio de pago). */
const tituloPago = (page: Page) => page.getByRole("heading", { name: "Ingresar un pago" });
const paso1 = (page: Page) => page.getByText("Selección de lo que se paga").locator("xpath=ancestor::div[contains(@class,'overflow-hidden')][1]");
const paso2 = (page: Page) => page.getByRole("button", { name: "Agregar nuevo medio de pago" }).locator("xpath=ancestor::div[contains(@class,'space-y-3')][1]");
const tarjetaComprobante = (page: Page) => page.getByRole("heading", { name: /^Comprobante N°/ }).locator("xpath=ancestor::div[contains(@class,'space-y-4')][1]");

/** Tilda el plan de Marco y deja «A abonar» en ese monto. */
async function tildarPlan(c: Captor, monto: number) {
  await c.page.getByLabel("Pagar plan #g2").check();
  await c.page.getByLabel("Monto a abonar al plan #g2").fill(String(monto));
}

/** Las pestañas de arriba de la ficha. */
const grupo = (page: Page, nombre: string) => page.getByRole("button", { name: nombre, exact: true }).first();

/** Cajas: la fila del título con sus pestañas, y la barra «Caja abierta». */
const filaCajas = (page: Page) => page.getByRole("heading", { name: "Cajas", exact: true }).locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]");
const barraCajaAbierta = (page: Page) => page.getByText("Caja abierta", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
const cuadrosDeCaja = (page: Page) => page.getByText("Acumulado", { exact: true }).locator("xpath=ancestor::div[contains(@class,'grid')][1]");
const cuadro = (page: Page, nombre: string) => page.getByText(nombre, { exact: true }).locator("xpath=ancestor::div[contains(@class,'p-4')][1]");

/** Ficha › Facturación y pagos: la fila de sub-pestañas. */
const subpestanas = (page: Page) => page.getByRole("button", { name: "Pagos", exact: true }).locator("xpath=..");

/** Un presupuesto en la lista de Presupuestos: su tarjeta, por el nombre del paciente. */
const tarjetaDe = (page: Page, paciente: string): Locator =>
  page.getByRole("button", { name: paciente }).locator("xpath=ancestor::div[contains(@class,'flex-col')][1]");

/** «Presentar» y «Marcar aceptado» sobre las tarjetas que haya (en la demo: el borrador de Camila y el presentado de María). */
async function aceptarPresupuestos(c: Captor, cuantos: 1 | 2) {
  const { page } = c;
  await c.ir("/app/presupuestos");
  await page.getByRole("button", { name: "Presentar" }).first().click();
  await page.getByRole("button", { name: "Marcar aceptado" }).first().click();
  if (cuantos === 2) await page.getByRole("button", { name: "Marcar aceptado" }).first().click();
}

/* ---------- los procedimientos ---------- */

export const procedimientos: Procedimiento[] = [
  /* ===== 1 · Abrir la caja ===== */
  {
    id: "abrir-la-caja",
    capitulo: "cashier",
    titulo: "Abrir la caja del día",
    roles: ["cashier", "admin"],
    paraQue: "Es lo primero que hacés al empezar tu turno: declarás con cuánto efectivo arrancás. Con la caja abierta, lo que cobrás queda en tus movimientos y al terminar la cerrás con el arqueo.",
    antes: ["Contá el efectivo que hay en el cajón: ese es tu saldo inicial."],
    pasos: [
      { texto: "Entrá a **Cajas**, en el menú de arriba. Si todavía no abriste la tuya, aparece «No tenés una caja abierta»: tocá «Abrir caja».", captura: "sin-caja" },
      { texto: "En **Saldo inicial (Gs)**, que viene en 0, escribí el efectivo con el que arrancás. Si la clínica tiene más de una sede, elegí la **Sucursal**.", captura: "formulario" },
      { texto: "Tocá «Abrir caja» en la ventana." },
      { texto: "Listo: arriba dice **Caja abierta**, con tu nombre y la hora, y el cuadro **Saldo inicial** muestra lo que declaraste. Ya podés empezar a cobrar: [[ingresar-un-pago]].", captura: "abierta" },
    ],
    avisos: [
      { tipo: "ojo", texto: "El saldo inicial es la base del arqueo: al cerrar, el sistema espera encontrar en el cajón ese efectivo más lo cobrado en efectivo, menos los gastos. Si lo declarás mal, la diferencia del cierre también sale mal." },
      { tipo: "ojo", texto: "Cada persona abre y cierra su propia caja. Si ya tenés una abierta, en lugar de «Abrir caja» aparece «Registrar pago»; las cajas abiertas de todo el equipo se ven en la pestaña «Cajas abiertas»." },
      { tipo: "tip", texto: "**Cajas** y «Cuentas por cobrar» vienen con el plan Clínica o superior: con el plan Solo no aparecen en el menú." },
      { tipo: "revisar", texto: "Hoy el saldo inicial arranca en 0 (no arrastra el efectivo contado en el cierre anterior) y se puede cobrar desde la ficha del paciente sin tener ninguna caja abierta. Confirmar si se quiere cambiar alguna de las dos cosas." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("cashier", "/app/caja");
      const cajasMenu = page.getByRole("navigation").first().getByRole("link", { name: "Cajas", exact: true });
      const tarjeta = page.getByRole("heading", { name: "No tenés una caja abierta" }).locator("xpath=ancestor::div[contains(@class,'text-center')][1]");
      await c.foto("sin-caja", { resaltar: [cajasMenu, tarjeta.getByRole("button", { name: "Abrir caja" })], recorte: [page.getByRole("banner"), tarjeta] });

      await tarjeta.getByRole("button", { name: "Abrir caja" }).click();
      const modal = page.getByRole("dialog", { name: "Abrir caja" });
      await modal.getByLabel("Saldo inicial (Gs)").fill("200000");
      await c.foto("formulario", { resaltar: [modal.getByLabel("Saldo inicial (Gs)"), modal.getByLabel("Sucursal")], recorte: modal, margen: 4 });

      await modal.getByRole("button", { name: "Abrir caja" }).click();
      await c.expect(page.getByText("Caja abierta", { exact: true })).toBeVisible();
      await c.foto("abierta", {
        resaltar: [page.getByText("Caja abierta", { exact: true }), cuadro(page, "Saldo inicial")],
        recorte: [filaCajas(page), barraCajaAbierta(page), cuadrosDeCaja(page)], margen: 4,
      });
    },
  },

  /* ===== 2 · Ingresar un pago ===== */
  {
    id: "ingresar-un-pago",
    capitulo: "cashier",
    titulo: "Ingresar un pago",
    roles: ["cashier", "admin"],
    paraQue: "Cada vez que un paciente paga: una cuota, una seña o todo el tratamiento. En un mismo cobro podés abonar uno o varios planes y usar uno o varios medios de pago; al final el sistema arma el comprobante.",
    antes: ["Tu caja abierta ([[abrir-la-caja]]).", "Que el paciente tenga un plan aceptado con saldo (si no, igual podés ingresar un abono libre)."],
    pasos: [
      { texto: "Abrí la ficha del paciente (buscalo arriba o en **Pacientes**) y tocá «Recibir pago».", captura: "ficha" },
      { texto: "En el **paso 1** (**Selección de lo que se paga**) tildá el plan que se abona. En **A abonar** viene el saldo completo: corregilo si el paciente paga solo una parte, por ejemplo una cuota.", captura: "paso-1" },
      { texto: "En el **paso 2** (**Medio de pago**) elegí cómo paga: Efectivo, Tarjeta, Transferencia, Cheque o QR / billetera. Con un solo medio no hace falta escribir el monto: paga el total. La **Fecha** viene con la de hoy y el **Concepto** es opcional.", captura: "paso-2" },
      { texto: "Si paga con dos medios (parte en efectivo y parte con tarjeta), tocá «Agregar nuevo medio de pago» y escribí cuánto va en cada uno. Abajo el sistema te muestra cuánto suman y cuánto sobra o falta.", captura: "dos-medios" },
      { texto: "Tocá «Ingresar pago»." },
      { texto: "En el **paso 3** aparece el **Comprobante** con su número, lo que se abonó a cada plan y por qué medio. Tocá «Imprimir» para dárselo en papel o «Enviar comprobante por e-mail» para mandárselo.", captura: "comprobante" },
      { texto: "Si estás en **Cajas** y el cobro es simple (un solo medio), podés cobrar sin entrar a la ficha: tocá «Registrar pago», elegí **Paciente**, **Presupuesto** (opcional), **Monto** y **Método**, y confirmá con «Registrar».", captura: "caja-rapido" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Un pago que no cuadra no se guarda: si el monto de un plan supera su saldo, o los medios de pago suman más o menos que lo que se abona, aparece un aviso en rojo y no se ingresa nada." },
      { tipo: "ojo", texto: "En el paso 1 aparecen todos los planes del paciente con saldo, también los que todavía no se aceptaron (en borrador o presentados). Cobrá solo los que el paciente ya aceptó: ver [[presentar-y-aceptar-un-presupuesto]]." },
      { tipo: "ojo", texto: "El comprobante se ve en este momento: si cambiás de pestaña o cerrás la ficha no hay forma de volver a abrirlo. Imprimilo o enviáselo antes. Los cobros hechos con «Registrar pago» desde **Cajas** no generan comprobante." },
      { tipo: "ojo", texto: "Con el rol de Recepcionista no aparece «Recibir pago» ni se ven montos: cobrar es de Recepción y caja y del administrador." },
      { tipo: "tip", texto: "Para dejar plata a favor del paciente sin plan (una seña, un adelanto), tildá «Ingresar abono libre» y escribí el monto. Para cobrar un plan puntual, también podés entrar desde el plan de tratamiento: «Opciones» › «Recaudar este tratamiento» abre **Recibir pago** con ese plan ya tildado." },
      { tipo: "tip", texto: "Si el plan está en cuotas, al pie de **Recibir pago** hay una tabla **Por cuotas de financiamiento** con el botón «Pagar cuota #…»: carga esa cuota en el paso 1. Cómo se arman: [[armar-las-cuotas-de-un-plan]]." },
      { tipo: "ojo", texto: "Con la **Fecha** de hoy, el pago queda con la hora real del cobro y entra enseguida en la caja que tenés abierta. Si cargás un pago de un día anterior, queda al mediodía de ese día y no suma en la caja de hoy." },
      { tipo: "revisar", texto: "No probé el botón «Link de pago (WhatsApp)» ni el envío del comprobante por e-mail: dependen de WhatsApp, del correo de la clínica y de su configuración de cobro online." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("cashier");
      await abrirMiCaja(c);

      await c.ir("/app/pacientes/p6");
      await c.foto("ficha", { resaltar: grupo(page, "Recibir pago"), pantalla: true, alto: 480 });
      await grupo(page, "Recibir pago").click();
      await c.expect(tituloPago(page)).toBeVisible();

      await tildarPlan(c, 375000);
      await fotoAlta(c, "paso-1", { resaltar: [page.getByLabel("Pagar plan #g2"), page.getByLabel("Monto a abonar al plan #g2")], recorte: [tituloPago(page), paso1(page)], margen: 4 });

      await fotoAlta(c, "paso-2", { resaltar: paso2(page).locator("select").first(), recorte: paso2(page), margen: 6 });

      await paso2(page).getByRole("button", { name: "Agregar nuevo medio de pago" }).click();
      await paso2(page).getByLabel("Monto").nth(0).fill("250000");
      await paso2(page).locator("select").nth(1).selectOption("tarjeta");
      await paso2(page).getByLabel("Monto").nth(1).fill("125000");
      await c.expect(page.getByText(/^Medios:/)).toBeVisible();
      await fotoAlta(c, "dos-medios", { resaltar: [paso2(page).getByRole("button", { name: "Agregar nuevo medio de pago" }), page.getByText(/^Medios:/)], recorte: [tituloPago(page), paso1(page), paso2(page)], margen: 4 });

      await page.getByRole("button", { name: /^Ingresar pago/ }).click();
      await c.expect(page.getByRole("heading", { name: /^Comprobante N°/ })).toBeVisible();
      await fotoAlta(c, "comprobante", {
        resaltar: [page.getByRole("button", { name: "Imprimir" }), page.getByRole("button", { name: "Enviar comprobante por e-mail" })],
        recorte: [tituloPago(page), tarjetaComprobante(page)], margen: 4,
      });

      await c.ir("/app/caja");
      await page.getByRole("button", { name: "Registrar pago" }).first().click();
      const modal = page.getByRole("dialog", { name: "Registrar pago" });
      await modal.getByLabel("Paciente").selectOption({ label: "Marco Giménez" });
      await modal.getByLabel(/^Presupuesto/).selectOption({ index: 1 });
      await c.foto("caja-rapido", {
        resaltar: [modal.getByLabel("Paciente"), modal.getByLabel(/^Presupuesto/), modal.getByLabel("Monto (Gs)"), modal.getByLabel("Método"), modal.getByRole("button", { name: /^Registrar/ })],
        recorte: modal, margen: 4,
      });
    },
  },

  /* ===== 3 · Cobrar con cheque ===== */
  {
    id: "cobrar-con-cheque",
    capitulo: "cashier",
    titulo: "Cobrar con cheque",
    roles: ["cashier", "admin"],
    paraQue: "Cuando un paciente paga con cheque, muchas veces a fecha. Lo cargás con sus datos, queda «por cobrar» y lo seguís hasta que el banco lo paga o rebota.",
    antes: ["Tener el cheque a mano: el banco, el número y la fecha desde la que se puede cobrar."],
    pasos: [
      { texto: "Empezá el cobro como siempre ([[ingresar-un-pago]]): en la ficha del paciente, tocá «Recibir pago», tildá el plan y corregí **A abonar**." },
      { texto: "En **Medio de pago** elegí «Cheque». Aparecen tres campos nuevos." },
      { texto: "Completá **N° de cheque**, **Banco** y **Fecha de cobro**: la fecha desde la que el banco lo acepta (en un cheque a fecha, la que tiene escrita).", captura: "datos-cheque" },
      { texto: "Tocá «Ingresar pago». En el comprobante, el medio figura como «Cheque N° …», con el banco y la fecha de cobro." },
      { texto: "Mientras no se cobra, el cheque espera en **Cajas**, pestaña «Cheques», sub-pestaña «Por cobrar». El número entre paréntesis, junto a «Cheques», dice cuántos hay pendientes.", captura: "por-cobrar" },
      { texto: "El sistema arma solo la tarea «Cheque por cobrar», para que no se te pase: en **Tareas** figura con la fecha de cobro (en «Todas las pendientes» desde ya, y en «Tareas del día» ese día).", captura: "tarea" },
      { texto: "Cuando el banco lo acredita, tocá «Marcar cobrado» en la fila del cheque: pasa a **Cobrados**.", captura: "marcar-cobrado" },
      { texto: "Si rebotó o el paciente lo retiró, tocá «Anular», escribí el motivo (si querés) y confirmá con «Anular cheque»: pasa a **Anulados**.", captura: "anular" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Un cheque «por cobrar» ya cuenta como pagado: baja el saldo del paciente y suma en los **Ingresos** de la caja aunque el banco todavía no lo haya acreditado. Si rebota, anulalo para que la deuda vuelva." },
      { tipo: "ojo", texto: "Si la fecha de cobro ya pasó y el cheque sigue pendiente, la fecha sale en rojo con la marca «Atrasado»." },
      { tipo: "tip", texto: "Al marcar el cheque como cobrado o al anularlo, la tarea «Cheque por cobrar» desaparece sola de **Tareas**: ver [[trabajar-las-tareas]]." },
      { tipo: "revisar", texto: "El motivo que se escribe al anular un cheque se guarda pero no se muestra en ninguna pantalla (tampoco en **Pagos eliminados**). Confirmar si hay que mostrarlo." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const cobro = fechaEn(15);
      await c.entrar("cashier");
      await abrirMiCaja(c);

      await irARecibirPago(c);
      await tildarPlan(c, 375000);
      await paso2(page).locator("select").first().selectOption("cheque");
      await paso2(page).getByLabel("N° de cheque").fill("00778899");
      await paso2(page).getByLabel("Banco", { exact: true }).fill("Banco Continental");
      await paso2(page).getByLabel("Fecha de cobro").fill(cobro);
      await fotoAlta(c, "datos-cheque", {
        resaltar: [paso2(page).locator("select").first(), paso2(page).getByLabel("N° de cheque"), paso2(page).getByLabel("Banco", { exact: true }), paso2(page).getByLabel("Fecha de cobro")],
        recorte: [tituloPago(page), paso1(page), paso2(page)], margen: 4,
      });
      await page.getByRole("button", { name: /^Ingresar pago/ }).click();
      await c.expect(page.getByRole("heading", { name: /^Comprobante N°/ })).toBeVisible();

      await c.ir("/app/caja");
      const cheques = page.getByRole("button", { name: /^Cheques/ });
      await cheques.click();
      const fila = page.getByRole("row", { name: /00778899/ });
      await c.expect(fila).toBeVisible();
      await c.foto("por-cobrar", { resaltar: [cheques, page.getByRole("button", { name: /^Por cobrar/ })], recorte: [cheques, fila], margen: 4 });

      // El día de la fecha de cobro, la bandeja de Tareas tiene el cheque: el enlace con ?fecha= abre «Tareas del día» de ese día
      // (la bandeja, a secas, abre en «Todas las pendientes», que no tiene selector de fecha).
      await c.ir(`/app/tareas?fecha=${cobro}`);
      const tarea = page.getByRole("button", { name: /Cheque — Marco Giménez/ });
      await c.expect(tarea).toBeVisible();
      await c.foto("tarea", { resaltar: tarea, recorte: [page.getByRole("heading", { name: /^Tareas - / }), tarea.locator("xpath=..")] });

      await c.ir("/app/caja");
      await page.getByRole("button", { name: /^Cheques/ }).click();
      const marcar = page.getByRole("row", { name: /00778899/ }).getByRole("button", { name: "Marcar cobrado" });
      await c.foto("marcar-cobrado", { resaltar: marcar, recorte: [page.getByRole("button", { name: /^Cheques/ }), page.getByRole("row", { name: /00778899/ })], margen: 6 });
      await marcar.click();

      await page.getByRole("row", { name: /00456123/ }).getByRole("button", { name: "Anular", exact: true }).click();
      const modal = page.getByRole("dialog", { name: "Anular cheque" });
      await modal.getByLabel("Motivo (opcional)").fill("Rebotó: sin fondos");
      await c.foto("anular", { resaltar: [modal.getByLabel("Motivo (opcional)"), modal.getByRole("button", { name: "Anular cheque" })], recorte: modal, margen: 4 });
    },
  },

  /* ===== 4 · Revisar los movimientos y anular un pago ===== */
  {
    id: "revisar-los-movimientos-de-la-caja",
    capitulo: "cashier",
    titulo: "Revisar los movimientos de la caja y anular un pago",
    roles: ["cashier", "admin"],
    paraQue: "Durante el día y antes de cerrar: para comprobar qué se cobró, con qué medio y cuánto debería haber en el cajón, y para corregir un pago que se cargó mal.",
    antes: ["Tener tu caja abierta ([[abrir-la-caja]])."],
    pasos: [
      { texto: "Entrá a **Cajas** (se abre en la pestaña «Mi caja»). En **Movimientos de la caja** ves cada cobro con el paciente, el concepto, la hora, el medio de pago y quién lo recibió; los gastos que carga la administración salen con signo menos.", captura: "movimientos" },
      { texto: "Los cuatro cuadros de arriba resumen la caja: **Saldo inicial**, **Ingresos** (todo lo cobrado, con cualquier medio), **Egresos** (los gastos) y **Acumulado** (saldo inicial + ingresos − egresos).", captura: "resumen" },
      { texto: "Tocá «Total de caja» para ver el detalle: lo cobrado por cada medio de pago, los gastos, el total y el **Efectivo que tiene que haber en el cajón**; abajo van las transacciones. Con «Imprimir» lo sacás en papel.", captura: "total" },
      { texto: "Si un pago se cargó mal, abrí la ficha del paciente, tocá «Facturación y pagos» y, en la pestaña «Pagos», tocá el tachito de ese pago («Anular pago»). Confirmá el aviso que aparece.", captura: "anular" },
      { texto: "El pago pasa a **Pagos eliminados**, con la fecha y quién lo anuló. Deja de contar en la caja y en el saldo del paciente: cargá de nuevo el pago correcto.", captura: "eliminados" },
    ],
    avisos: [
      { tipo: "ojo", texto: "El **Acumulado** suma todos los medios de pago. En el cajón solo tiene que estar el efectivo: por eso el **Total de caja** muestra aparte «Efectivo que tiene que haber en el cajón»." },
      { tipo: "ojo", texto: "Anular no borra: el pago queda en **Pagos eliminados** y no hay botón para reactivarlo. Si fue un error, volvé a cargarlo." },
      { tipo: "tip", texto: "Si entrás como administrador vas a ver además un tachito en cada renglón de **Movimientos de la caja**: hace lo mismo que el de la ficha («Anular pago»). Pide confirmación y el pago queda en **Pagos eliminados**." },
      { tipo: "ojo", texto: "Con este rol no ves los reportes del negocio (ingresos totales, producción): son solo del administrador." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("cashier");
      await abrirMiCaja(c);
      await cobroRapido(c, { paciente: "Marco Giménez", presupuesto: true });
      await cobroRapido(c, { paciente: "Camila Ortega", monto: 250000, metodo: "Tarjeta", concepto: "Profilaxis" });

      const movimientos = page.getByRole("heading", { name: "Movimientos de la caja" }).locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
      await c.foto("movimientos", { resaltar: movimientos, recorte: movimientos, margen: 4 });

      await c.foto("resumen", { resaltar: cuadrosDeCaja(page), recorte: [filaCajas(page), barraCajaAbierta(page), cuadrosDeCaja(page)], margen: 4 });

      await page.getByRole("button", { name: "Total de caja" }).click();
      const total = page.getByRole("dialog", { name: "Total de caja" });
      await c.expect(total.getByText("Transacciones de la caja")).toBeVisible();
      await c.foto("total", {
        resaltar: [total.getByText("Efectivo que tiene que haber en el cajón").locator("xpath=ancestor::tr[1]"), total.getByRole("button", { name: "Imprimir" })],
        recorte: total, margen: 4,
      });
      await page.keyboard.press("Escape");

      await c.ir("/app/pacientes/p3");
      await grupo(page, "Facturación y pagos").click();
      const tachito = page.getByTitle("Anular pago").first();
      await c.expect(tachito).toBeVisible();
      await c.foto("anular", { resaltar: tachito, recorte: [subpestanas(page), page.getByRole("table")] });
      page.once("dialog", (d) => d.accept());
      await tachito.click();
      await page.getByRole("button", { name: "Pagos eliminados", exact: true }).click();
      await c.expect(page.getByRole("table")).toBeVisible();
      await c.foto("eliminados", { resaltar: page.getByRole("row").nth(1), recorte: [subpestanas(page), page.getByRole("table")] });
    },
  },

  /* ===== 5 · Cerrar la caja ===== */
  {
    id: "cerrar-la-caja",
    capitulo: "cashier",
    titulo: "Cerrar la caja y hacer el arqueo",
    roles: ["cashier", "admin"],
    paraQue: "Al terminar tu turno: contás el efectivo del cajón, lo comparás con lo que el sistema espera y dejás la caja cerrada.",
    antes: ["Que todos los cobros del turno ya estén ingresados.", "El efectivo del cajón, contado."],
    pasos: [
      { texto: "Entrá a **Cajas** (se abre en «Mi caja») y tocá «Cerrar caja».", captura: "mi-caja" },
      { texto: "En **Cerrar caja — arqueo** el sistema te muestra lo que espera: **Saldo inicial**, **Ingresos en efectivo**, **Egresos** y **Efectivo esperado**.", captura: "arqueo" },
      { texto: "Escribí en **Efectivo contado (Gs)** lo que contaste en el cajón. Debajo aparece **Caja cuadrada**, **Sobrante** o **Faltante**, con la diferencia.", captura: "contado" },
      { texto: "Si hay diferencia, anotá el motivo en **Observación (opcional)**." },
      { texto: "Tocá «Cerrar caja»: tu caja pasa a la pestaña «Cajas cerradas», con la **Diferencia** del arqueo.", captura: "cerradas" },
      { texto: "Para ver el detalle de esa caja o imprimirlo, tocá «Total» en su fila.", captura: "total-cerrada" },
    ],
    avisos: [
      { tipo: "ojo", texto: "**Efectivo contado** viene ya completo con el efectivo esperado: si no lo cambiás por lo que realmente contaste, la caja sale «cuadrada» aunque no lo esté." },
      { tipo: "ojo", texto: "Solo el efectivo entra en el arqueo: tarjeta, transferencia, cheque y QR suman en **Ingresos** pero no tienen que estar en el cajón." },
      { tipo: "ojo", texto: "Una caja cerrada no se puede reabrir ni corregir. Si todavía vas a cobrar, abrí una nueva ([[abrir-la-caja]])." },
      { tipo: "tip", texto: "En **Inicio**, en **Mi agenda**, la rutina del día te recuerda «Cerrar la caja» mientras haya una abierta: ver [[usar-mi-agenda]]." },
      { tipo: "revisar", texto: "La **Observación** del cierre (y la sucursal elegida al abrir) se guarda, pero no se muestra en ninguna pantalla. Confirmar si debería verse." },
      { tipo: "revisar", texto: "Desde la pestaña «Cajas abiertas», el botón «Cerrar» deja que cualquier persona con permiso de caja cierre la caja de otra (por ejemplo, una que quedó abierta de ayer). Confirmar que es lo que se quiere." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("cashier");
      await abrirMiCaja(c);
      await cobroRapido(c, { paciente: "Marco Giménez", presupuesto: true });
      await cobroRapido(c, { paciente: "Camila Ortega", monto: 250000, metodo: "Tarjeta", concepto: "Profilaxis" });

      const cerrar = page.getByRole("button", { name: "Cerrar caja" });
      await c.foto("mi-caja", { resaltar: cerrar, recorte: [filaCajas(page), barraCajaAbierta(page)], margen: 4 });
      await cerrar.click();
      const modal = page.getByRole("dialog", { name: "Cerrar caja — arqueo" });
      await c.expect(modal).toBeVisible();
      await c.foto("arqueo", { resaltar: modal.getByText("Efectivo esperado").locator("xpath=.."), recorte: modal, margen: 4 });

      await modal.getByLabel("Efectivo contado (Gs)").fill("565000");
      await modal.getByLabel("Observación (opcional)").fill("Diferencia por vuelto");
      await c.foto("contado", { resaltar: [modal.getByLabel("Efectivo contado (Gs)"), modal.getByText("Faltante").locator("xpath=.."), modal.getByLabel("Observación (opcional)")], recorte: modal, margen: 4 });
      await modal.getByRole("button", { name: "Cerrar caja" }).click();

      await c.expect(page.getByText("No tenés una caja abierta")).toBeVisible();
      await page.getByRole("button", { name: "Cajas cerradas" }).click();
      const cabecera = page.getByRole("columnheader").first().locator("xpath=ancestor::tr[1]");
      const mia = page.getByRole("row").nth(1);
      await c.expect(mia).toContainText("Marta Caja");
      await c.foto("cerradas", { resaltar: mia.getByRole("cell").nth(7), recorte: [filaCajas(page), cabecera, mia], margen: 0 });

      await mia.getByRole("button", { name: "Total" }).click();
      const total = page.getByRole("dialog", { name: "Total de caja" });
      await c.expect(total.getByText("Efectivo contado al cierre · diferencia")).toBeVisible();
      await c.foto("total-cerrada", { resaltar: total.getByText("Efectivo contado al cierre · diferencia").locator("xpath=ancestor::tr[1]"), recorte: total, margen: 4 });
    },
  },

  /* ===== 6 · Cobrar a quien debe ===== */
  {
    id: "cobrar-a-quien-debe",
    capitulo: "cashier",
    titulo: "Cobrarle a quien debe",
    roles: ["cashier", "admin"],
    paraQue: "Para saber qué pacientes tienen saldo pendiente y recordarles el pago por WhatsApp, a mano o con Botika.",
    antes: ["Tu caja abierta ([[abrir-la-caja]]): la lista de deudores aparece dentro de la pestaña «Mi caja»."],
    pasos: [
      { texto: "En el menú de arriba, abrí **Cobranza** y tocá «Cuentas por cobrar». Te lleva a **Cajas**.", captura: "menu" },
      { texto: "Con tu caja abierta, a la derecha ves **Cuentas por cobrar**: cada paciente con su saldo, del que más debe al que menos. Tocá un nombre para abrir su ficha. A la derecha de cada renglón hay dos formas de avisarle: «Botika» y «Manual».", captura: "lista" },
      { texto: "«Manual» abre WhatsApp, en otra pestaña, con un mensaje ya escrito: el nombre del paciente, el de la clínica y su saldo. Revisalo y envialo vos." },
      { texto: "«Botika» (si tu clínica lo tiene activado) deja el aviso en cola: el botón pasa a «Encolado» y queda para que Botika se lo mande al paciente por WhatsApp.", captura: "encolado" },
      { texto: "Cuando el paciente pague, ingresá el pago ([[ingresar-un-pago]]): su saldo baja y, al llegar a cero, sale de la lista." },
    ],
    avisos: [
      { tipo: "ojo", texto: "La lista aparece solo con tu caja abierta: si no tenés una, «Cuentas por cobrar» te lleva a «No tenés una caja abierta» sin mostrar a nadie." },
      { tipo: "ojo", texto: "«Botika» aparece solo si la clínica conectó Botika y activó el aviso de **Cobranza** (en **Integraciones**, que maneja el administrador). Sin eso, usá «Manual»." },
      { tipo: "tip", texto: "El sistema también arma solo una tarea «Saldo pendiente de pago» por cada paciente con deuda: la ves en **Tareas** ([[trabajar-las-tareas]])." },
      { tipo: "revisar", texto: "No pude verificar que Botika mande el mensaje por WhatsApp (depende del servicio externo: en la demo el aviso solo queda en cola) ni abrí WhatsApp desde «Manual». Confirmar además con Angel y Camila el texto del mensaje manual, que es fijo." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("cashier");
      await abrirMiCaja(c);
      // Para que la lista tenga más de un deudor: se aceptan el borrador de Camila (después de presentarlo) y el presupuesto de María.
      await aceptarPresupuestos(c, 2);

      const cobranza = page.getByRole("button", { name: /^Cobranza/ });
      await cobranza.click();
      const item = page.getByRole("link", { name: "Cuentas por cobrar" });
      await c.expect(item).toBeVisible();
      await c.foto("menu", { resaltar: item, recorte: [page.getByRole("navigation").first(), item.locator("xpath=..")], margen: 6 });
      await item.click();
      await page.waitForURL("**/app/caja");

      const tarjeta = page.getByRole("heading", { name: "Cuentas por cobrar" }).locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
      await c.expect(tarjeta.getByRole("button", { name: "Botika" }).first()).toBeVisible();
      await c.foto("lista", { resaltar: tarjeta.getByRole("listitem").first(), recorte: tarjeta, margen: 4 });

      await tarjeta.getByRole("button", { name: "Botika" }).first().click();
      await c.foto("encolado", { resaltar: tarjeta.getByRole("button", { name: "Encolado" }), recorte: tarjeta, margen: 4 });
    },
  },

  /* ===== 7 · Presentar y aceptar un presupuesto ===== */
  {
    id: "presentar-y-aceptar-un-presupuesto",
    capitulo: "cashier",
    titulo: "Presentar y aceptar un presupuesto",
    roles: ["cashier", "commercial", "admin"],
    paraQue: "Para armar el presupuesto de un tratamiento, entregárselo al paciente y registrar que lo aceptó. Pasa por tres estados: Borrador, Presentado y Aceptado.",
    antes: ["El paciente tiene ficha.", "Saber qué prestaciones lleva (te las indica el dentista) y si el paciente tiene convenio."],
    pasos: [
      { texto: "En el menú de arriba, abrí **Cobranza** y tocá «Presupuestos». Cada tarjeta es un presupuesto, con su estado; los filtros de arriba (Borrador, Presentado, Aceptado…) los separan.", captura: "lista" },
      { texto: "Tocá «Nuevo presupuesto» y elegí el **Paciente** y el **Profesional**. Si el paciente tiene convenio, elegilo en **Convenio**: el descuento se aplica solo.", captura: "nuevo" },
      { texto: "Tocá «Agregar» por cada prestación y elegila de la lista (sale del arancel). Anotá la **Pieza** si corresponde, revisá el precio y mirá el **Total**.", captura: "items" },
      { texto: "Tocá «Guardar»: el presupuesto queda en **Borrador**." },
      { texto: "Para dárselo al paciente, tocá «Detalle» en la tarjeta y después «Imprimir / PDF» (o «Enviar por email»).", captura: "detalle" },
      { texto: "Cuando se lo entregaste, tocá «Presentar» en la tarjeta: pasa a **Presentado**.", captura: "presentar" },
      { texto: "Cuando el paciente dice que sí, tocá «Marcar aceptado»: pasa a **Aceptado**. Desde ese momento la tarjeta muestra lo **pagado** y el **saldo**, y el paciente entra en **Cuentas por cobrar**.", captura: "aceptar" },
    ],
    avisos: [
      { tipo: "ojo", texto: "«Presentar» y «Marcar aceptado» solo cambian el estado: no le mandan nada al paciente. Entregarlo o enviarlo es el paso de «Detalle»." },
      { tipo: "ojo", texto: "«Editar» existe solo en **Borrador**. «Anular» (en Borrador y Presentado) no pide confirmación y un presupuesto anulado no se puede reactivar desde esta pantalla." },
      { tipo: "tip", texto: "Un presupuesto **Presentado** sin ningún pago genera en **Tareas** la tarea «Presupuesto presentado sin aceptar», para hacerle seguimiento al paciente; al aceptarlo, esa tarea desaparece sola y, si queda saldo, el sistema arma la de cobranza («Saldo pendiente de pago»)." },
      { tipo: "revisar", texto: "«Marcar aceptado» no pide firma ni deja constancia de cómo aceptó el paciente (firmado, por WhatsApp). Confirmar si la clínica necesita registrarlo." },
      { tipo: "tip", texto: "Al editar un borrador con «Editar» se conserva todo lo que tenía, incluido su nombre. Para cambiarlo o ponerle uno, usá **Nombre del plan (opcional)**." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("cashier", "/app/presupuestos");
      await c.foto("lista", { resaltar: page.getByRole("button", { name: /^borrador/i }).locator("xpath=.."), pantalla: true, alto: 640 });

      await page.getByRole("button", { name: "Nuevo presupuesto" }).click();
      const modal = page.getByRole("dialog", { name: "Nuevo presupuesto" });
      await modal.getByLabel("Paciente").selectOption({ label: "Lucía Ferreira" });
      await modal.getByLabel("Profesional").selectOption({ label: "Dr. Diego Martínez" });
      await modal.getByLabel("Convenio").selectOption({ label: "IPS (10%)" });
      await c.foto("nuevo", { resaltar: [modal.getByLabel("Paciente"), modal.getByLabel("Profesional"), modal.getByLabel("Convenio")], recorte: modal, margen: 4, alto: 1100 });

      await modal.getByRole("button", { name: "Agregar" }).click();
      await modal.getByRole("button", { name: "Agregar" }).click();
      await modal.locator("div.rounded-xl select").nth(1).selectOption("D1110");
      await modal.getByPlaceholder("Pieza").first().fill("16");
      await c.foto("items", {
        resaltar: [modal.getByRole("button", { name: "Agregar" }), modal.getByPlaceholder("Pieza").first(), modal.getByText(/^Total/).locator("xpath=..")],
        recorte: modal, margen: 4, alto: 1100,
      });
      await modal.getByRole("button", { name: "Guardar" }).click();

      // La tarjeta nueva aparece enseguida, sin recargar la lista.
      const tarjeta = tarjetaDe(page, "Lucía Ferreira");
      await c.expect(tarjeta.getByRole("button", { name: "Presentar" })).toBeVisible();
      await tarjeta.getByRole("button", { name: "Detalle" }).click();
      const detalle = page.getByRole("dialog", { name: "Presupuesto" });
      await c.foto("detalle", { resaltar: detalle.getByRole("button", { name: "Imprimir / PDF" }), recorte: detalle, margen: 4, alto: 1100 });
      await page.keyboard.press("Escape");
      await quitarFoco(page);

      await c.foto("presentar", { resaltar: tarjeta.getByRole("button", { name: "Presentar" }), recorte: tarjeta, margen: 6, esperar: 900 });
      await tarjeta.getByRole("button", { name: "Presentar" }).click();
      await quitarFoco(page);
      await c.foto("aceptar", { resaltar: tarjeta.getByRole("button", { name: "Marcar aceptado" }), recorte: tarjeta, margen: 6 });
    },
  },

  /* ===== 8 · Ver el estado de cuenta ===== */
  {
    id: "ver-el-estado-de-cuenta-de-un-paciente",
    capitulo: "cashier",
    titulo: "Ver el estado de cuenta de un paciente",
    roles: ["cashier", "admin"],
    paraQue: "Cuando el paciente pregunta cuánto debe o qué pagó, o cuando tenés que revisar un cobro: todo lo de plata del paciente está en un solo lugar.",
    pasos: [
      { texto: "Abrí la ficha del paciente y tocá «Facturación y pagos». Arriba aparecen cinco pestañas: «Pagos», «Documentos emitidos», «Devoluciones», «Pagos eliminados» y «Balance»." },
      { texto: "En «Pagos» está cada cobro: el **N° Pago**, el **Plan** (o «Libre»), el **Medio de pago** y quién lo recibió, el **N° Boleta**, la fecha de **Recepción** y el **Monto**.", captura: "pagos" },
      { texto: "«Documentos emitidos» lista las boletas que se emitieron, con su número, la fecha y el monto.", captura: "documentos" },
      { texto: "«Devoluciones» muestra las devoluciones registradas, con su fecha, motivo y monto." },
      { texto: "«Pagos eliminados» guarda los pagos anulados, con la fecha y quién los anuló. No cuentan en el saldo.", captura: "eliminados" },
      { texto: "«Balance» resume la cuenta: lo **Presupuestado (aceptado)**, el **Total abonado** y el **Saldo del paciente**.", captura: "balance" },
      { texto: "Para ver cada plan por separado (lo realizado, lo abonado, el saldo y cada abono), tocá «Planes de tratamiento» y entrá al plan.", captura: "plan" },
    ],
    avisos: [
      { tipo: "ojo", texto: "El **Saldo del paciente** es el total de los presupuestos aceptados menos todo lo que abonó, con plan o libre. Un presupuesto que todavía no se aceptó no suma." },
      { tipo: "ojo", texto: "Esta sección la ven el administrador y Recepción y caja. Recepcionista, Dentista y Asistente de doctores no ven montos." },
      { tipo: "tip", texto: "Los pagos de un mismo cobro (por ejemplo, parte en efectivo y parte con tarjeta) comparten el mismo número de comprobante." },
      { tipo: "revisar", texto: "La columna **N° Boleta** de **Pagos** muestra el número del comprobante del cobro, no el de la boleta emitida (ese está en **Documentos emitidos**). Confirmar cómo debería llamarse." },
      { tipo: "ojo", texto: "«Registrar devolución» (el ícono ↺ de **Pagos**) pide confirmación y se puede hacer una sola vez por pago: después el renglón dice «Devuelto». Solo deja un registro en **Devoluciones**; no cambia el saldo del paciente ni el total de la caja. Si el pago no tiene que seguir contando, anulalo." },
      { tipo: "revisar", texto: "Confirmar cómo debe contarse una devolución: hoy es solo un registro. Si tiene que bajar el total abonado del paciente y salir de la caja del día, hay que definirlo." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("cashier");
      // Se ingresa un cobro desde Recibir pago para que la tabla de Pagos muestre también el N° de pago y el del comprobante.
      await irARecibirPago(c);
      await tildarPlan(c, 375000);
      await page.getByRole("button", { name: /^Ingresar pago/ }).click();
      await c.expect(page.getByRole("heading", { name: /^Comprobante N°/ })).toBeVisible();

      await grupo(page, "Facturación y pagos").click();
      const tabla = page.getByRole("table");
      await c.expect(tabla).toBeVisible();
      await c.foto("pagos", { resaltar: tabla, recorte: [subpestanas(page), tabla] });

      await page.getByRole("button", { name: "Documentos emitidos", exact: true }).click();
      await c.expect(page.getByText("0001-2875")).toBeVisible();
      await c.foto("documentos", { resaltar: page.getByRole("button", { name: "Documentos emitidos", exact: true }), recorte: [subpestanas(page), tabla] });

      await page.getByRole("button", { name: "Balance", exact: true }).click();
      const resumen = page.getByText("Saldo del paciente").locator("xpath=ancestor::div[contains(@class,'grid')][1]");
      await c.expect(resumen).toBeVisible();
      await c.foto("balance", { resaltar: resumen, recorte: [subpestanas(page), resumen] });

      await grupo(page, "Planes de tratamiento").click();
      await page.getByRole("button", { name: /#g2:/ }).click();
      const total = page.getByText("Presupuesto total").locator("xpath=..");
      await c.expect(total).toBeVisible();
      const abonos = page.getByText("Abonos", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
      await c.foto("plan", { resaltar: page.getByText("Saldo por abonar").locator("xpath=.."), recorte: [total, abonos], margen: 2 });

      // Para que haya algo en «Pagos eliminados» se anula el cheque de Marco (por la ficha, como lo haría la caja).
      await grupo(page, "Facturación y pagos").click();
      await page.getByRole("button", { name: "Pagos", exact: true }).click();
      page.once("dialog", (d) => d.accept());
      await page.getByRole("row").filter({ hasText: "Cheque" }).getByTitle("Anular pago").click();
      await page.getByRole("button", { name: "Pagos eliminados", exact: true }).click();
      await c.expect(page.getByRole("table")).toBeVisible();
      await c.foto("eliminados", { resaltar: page.getByRole("button", { name: "Pagos eliminados", exact: true }), recorte: [subpestanas(page), page.getByRole("table")] });
    },
  },

  /* ===== 9 · Armar las cuotas de un plan ===== */
  {
    id: "armar-las-cuotas-de-un-plan",
    capitulo: "cashier",
    titulo: "Armar las cuotas de un plan",
    roles: ["cashier", "admin"],
    paraQue: "Cuando el paciente va a pagar el plan en cuotas, con o sin interés. El sistema calcula cada cuota y su vencimiento; después las cobrás desde **Recibir pago**.",
    antes: ["El plan está aceptado ([[presentar-y-aceptar-un-presupuesto]]) y tiene saldo.", "Acordado con el paciente: el pie (si hay), la cantidad de cuotas, el interés y la fecha de la primera cuota."],
    pasos: [
      { texto: "Abrí la ficha del paciente, tocá «Planes de tratamiento» y entrá al plan. Arriba a la derecha tocá «Opciones» y elegí «Financiamiento».", captura: "opciones" },
      { texto: "Arriba de la ventana, **Por financiar** es el total del plan (con el descuento del convenio ya aplicado) menos lo que el paciente ya pagó. Completá las condiciones: **Pie (pago inicial)**, **Cuotas**, **Interés mensual (%)**, **Fecha de la primera cuota** y **Periodicidad**.", captura: "formulario" },
      { texto: "Mirá la simulación: **Monto financiado**, **Interés**, el valor de cada cuota y el **Total en cuotas**, con la tabla de vencimientos. Cambiá los datos hasta que coincida con lo que acordaron.", captura: "simulacion" },
      { texto: "Tocá «Generar plan de cuotas»." },
      { texto: "El plan queda como **Financiado**: el pie, las cuotas y el interés aparecen en el panel de la izquierda, y el **Presupuesto total** ya incluye el interés.", captura: "financiado" },
      { texto: "Las cuotas se cobran desde **Recibir pago**: al pie, en **Por cuotas de financiamiento**, el botón «Pagar pie» (o «Pagar cuota #…») carga la próxima en el paso 1. Ver [[ingresar-un-pago]].", captura: "cuotas" },
    ],
    avisos: [
      { tipo: "ojo", texto: "El interés se suma al total del plan y no lleva descuento: por eso el **Presupuesto total** sube al generar las cuotas." },
      { tipo: "ojo", texto: "Lo que el paciente ya pagó antes no entra en las cuotas: solo se financia el saldo." },
      { tipo: "ojo", texto: "Si el plan ya tenía cuotas, generar de nuevo las reemplaza y recalcula el interés sobre el saldo actual. «Quitar financiamiento» (en la misma ventana) borra las cuotas y el interés; los pagos hechos quedan." },
      { tipo: "ojo", texto: "El sistema avisa en rojo lo que no se puede: el pie tiene que ser menor que el monto a financiar, las cuotas van de 1 a 60 y el interés mensual, de 0 a 20 %." },
      { tipo: "revisar", texto: "El interés es simple: monto financiado × % mensual × cantidad de cuotas (en quincenal y semanal, proporcional al tiempo). Confirmar con la administración que esa es la fórmula de la clínica." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("cashier", "/app/presupuestos");
      // María González: su plan «Plan dental integral» está presentado; se acepta para financiarlo, como en la clínica.
      await page.getByRole("button", { name: "Marcar aceptado" }).first().click();
      await c.ir("/app/pacientes/p1");
      await grupo(page, "Planes de tratamiento").click();
      await page.getByRole("button", { name: /#g1: Plan dental integral/ }).click();

      const opciones = page.getByRole("button", { name: /^Opciones/ });
      await opciones.click();
      const menu = page.getByRole("menu", { name: "Opciones del plan" });
      await c.expect(menu).toBeVisible();
      await c.foto("opciones", { resaltar: [opciones, menu.getByRole("menuitem", { name: /Financiamiento/ })], recorte: [opciones, menu] });
      await menu.getByRole("menuitem", { name: /Financiamiento/ }).click();

      const modal = page.getByRole("dialog", { name: "Financiamiento por crédito" });
      await modal.getByLabel("Pie (pago inicial)").fill("126500");
      await modal.getByLabel("Cuotas").fill("6");
      await modal.getByLabel("Interés mensual (%)").fill("2");
      const campos = modal.getByLabel("Pie (pago inicial)").locator("xpath=ancestor::div[contains(@class,'grid')][1]");
      await quitarFoco(page);
      await c.foto("formulario", {
        resaltar: campos,
        recorte: [modal.getByRole("heading", { name: "Financiamiento por crédito" }), modal.getByText("Por financiar").locator("xpath=ancestor::div[contains(@class,'grid')][1]"), campos],
        margen: 8,
      });

      const simulacion = modal.getByText("Monto financiado").locator("xpath=ancestor::div[contains(@class,'space-y-2')][1]");
      await c.foto("simulacion", { resaltar: simulacion, recorte: simulacion, margen: 8 });

      await modal.getByRole("button", { name: "Generar plan de cuotas" }).click();
      await c.expect(page.getByText("Financiado", { exact: true })).toBeVisible();
      const total = page.getByText("Presupuesto total").locator("xpath=..");
      await c.foto("financiado", {
        resaltar: page.getByText("Financiado", { exact: true }).locator("xpath=.."),
        recorte: [total, page.getByText("Saldo por abonar").locator("xpath=..")], margen: 6,
      });

      await grupo(page, "Recibir pago").click();
      const pagarPie = page.getByRole("button", { name: /^Pagar pie/ });
      await c.expect(pagarPie).toBeVisible();
      await c.foto("cuotas", {
        resaltar: pagarPie,
        recorte: [page.getByRole("heading", { name: "Por cuotas de financiamiento" }), pagarPie.locator("xpath=ancestor::div[contains(@class,'overflow-hidden')][1]")], margen: 8,
      });
    },
  },

  /* ===== 10 · Emitir o reimprimir un comprobante ===== */
  {
    id: "emitir-un-comprobante",
    capitulo: "cashier",
    titulo: "Emitir o reimprimir un comprobante",
    roles: ["cashier", "admin"],
    paraQue: "Para darle al paciente el comprobante de lo que pagó, o para emitirle la boleta de un pago que ya estaba registrado.",
    antes: ["Para el comprobante: estar cobrando ([[ingresar-un-pago]]). Para la boleta: un pago ya registrado."],
    pasos: [
      { texto: "Al ingresar un pago, el comprobante aparece solo, con su número. Tocá «Imprimir» para dárselo en papel: sale con el membrete de la clínica.", captura: "comprobante" },
      { texto: "Para mandárselo por correo, tocá «Enviar comprobante por e-mail» (el paciente tiene que tener su correo cargado en **Datos personales**)." },
      { texto: "Más tarde, el número del comprobante queda en la ficha, en «Facturación y pagos», pestaña «Pagos», columna **N° Boleta**: todos los pagos de un mismo cobro lo comparten." },
      { texto: "Si el paciente pide la boleta de un pago, buscá ese pago en «Pagos» y tocá el ícono «Emitir boleta».", captura: "pagos" },
      { texto: "La boleta queda en «Documentos emitidos», con su número, la fecha y el monto del pago.", captura: "documentos" },
    ],
    avisos: [
      { tipo: "ojo", texto: "El comprobante solo se puede imprimir o enviar en el momento del cobro: después no hay una pantalla para volver a abrirlo. Lo que queda es su número." },
      { tipo: "ojo", texto: "Cada pago admite una sola boleta: cuando se emite, el ícono «Emitir boleta» desaparece de esa fila." },
      { tipo: "tip", texto: "Antes de cobrar, fijate que el paciente tenga su correo en **Datos personales**: si no lo tiene, «Enviar comprobante por e-mail» avisa «El paciente no tiene email cargado.» y, como el comprobante no se puede volver a abrir, no hay cómo mandarlo después." },
      { tipo: "revisar", texto: "Hoy «Emitir boleta» solo registra un número, la fecha y el monto del pago: no imprime ni genera un archivo, y la numeración arranca en 0001-0001 para cada paciente. Confirmar si es lo que la clínica necesita para facturar." },
      { tipo: "revisar", texto: "No probé el envío del comprobante por e-mail: depende del correo de la clínica." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("cashier");
      await abrirMiCaja(c);
      // Camila no tiene planes con saldo aceptado: se le ingresa un abono libre (una seña) y se mira el comprobante.
      await irARecibirPago(c, "p3");
      await page.getByLabel("Ingresar abono libre").check();
      await page.getByLabel("Monto del abono libre").fill("100000");
      await page.getByRole("button", { name: /^Ingresar pago/ }).click();
      await c.expect(page.getByRole("heading", { name: /^Comprobante N°/ })).toBeVisible();
      await fotoAlta(c, "comprobante", { resaltar: page.getByRole("button", { name: "Imprimir" }), recorte: [tituloPago(page), tarjetaComprobante(page)], margen: 4 });

      await grupo(page, "Facturación y pagos").click();
      const tabla = page.getByRole("table");
      await c.expect(tabla).toBeVisible();
      const fila = page.getByRole("row").filter({ hasText: "225.000" });
      await c.foto("pagos", { resaltar: fila.getByTitle("Emitir boleta"), recorte: [subpestanas(page), tabla] });
      await fila.getByTitle("Emitir boleta").click();

      await page.getByRole("button", { name: "Documentos emitidos", exact: true }).click();
      await c.expect(page.getByText("0001-0001")).toBeVisible();
      await c.foto("documentos", { resaltar: page.getByRole("row").nth(1), recorte: [subpestanas(page), page.getByRole("table")] });
    },
  },
];
