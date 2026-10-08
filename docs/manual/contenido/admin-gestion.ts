import type { Dialog, Download, Locator, Page } from "@playwright/test";
import type { Procedimiento } from "./tipos";

/* Administrador — gestión y reportes: inventario, gastos, laboratorios, liquidaciones, reportes, facturación,
 * esterilización, residuos, encuestas, boxes, integraciones, tareas del equipo y CRM.
 *
 * Todo se explica con lo que hace la app HOY (leído en app/app/*, lib/* y probado en la demo). Lo que la demo no puede mostrar
 * (el link público de las encuestas, el envío real de Botika) va en texto y con un aviso «revisar». */

/* ─── Ayudas para sacar las capturas ───────────────────────────────────────────────────────────────────────────── */

/** Hoy en la hora de la clínica (la del navegador de la corrida), AAAA-MM-DD. */
const hoyLocal = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

/** `fecha` (AAAA-MM-DD) más `dias` días. */
const sumarDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** El lunes de la semana de `fecha`: la demo siembra sus citas, cobros y gastos alrededor de ese día. */
const lunesDe = (fecha: string) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  return sumarDias(fecha, -((d.getUTCDay() + 6) % 7));
};

/** La tarjeta blanca (Card) que contiene a este elemento. */
const tarjeta = (l: Locator) => l.locator("xpath=ancestor::div[contains(@class,'bg-white') and contains(@class,'rounded')][1]");

/** El renglón de arriba de una pantalla: el título con sus botones y selectores (el contenedor que envuelve al <h1>). */
const cabecera = (main: Locator, titulo: string) =>
  main.getByRole("heading", { name: titulo, level: 1 }).locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]");

/** El estado local de la demo (lo que la app guarda cuando Firebase no responde): sirve para comprobar lo que el manual afirma. */
const leerDemo = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("novudent.db.v4") || "null"));

/** El contenido de un archivo que acaba de bajar el navegador, como texto. */
const textoDe = async (descarga: Download) => {
  const partes: Buffer[] = [];
  for await (const parte of await descarga.createReadStream()) partes.push(parte as Buffer);
  return Buffer.concat(partes).toString("utf8");
};

/** Hace `accion` y dice si el navegador abrió un cuadro de confirmación (que se descarta sin aceptar). Sirve para comprobar
 *  que un botón pide confirmación antes de borrar, o que borra sin preguntar. */
const abrioConfirmacion = async (page: Page, accion: () => Promise<void>) => {
  let abrio = false;
  const alAbrir = (d: Dialog) => { abrio = true; void d.dismiss(); };
  page.on("dialog", alAbrir);
  try { await accion(); } finally { page.off("dialog", alAbrir); }
  return abrio;
};

/** Saca el foco y el mouse de donde quedaron: sin esto la captura muestra un campo con el cursor o un globito de ayuda. */
const soltar = async (page: Page) => {
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
};

/** Recorre la página de arriba abajo para que terminen de aparecer las secciones que entran con animación al scrollear
 *  (si no, la captura las muestra a medio aparecer). */
const revelarTodo = async (page: Page) => {
  await page.evaluate(async () => {
    const alto = document.documentElement.scrollHeight;
    for (let y = 0; y < alto; y += 300) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
};

/** Un botón o pestaña de la ficha del paciente (los dos niveles de pestañas viven dentro de `main`). */
const boton = (page: Page, nombre: string | RegExp, exacto = true): Locator =>
  page.locator("main").getByRole("button", typeof nombre === "string" ? { name: nombre, exact: exacto } : { name: nombre });
/** La fila de las dos pestañas grandes de la ficha (Ficha clínica / Planes de tratamiento). */
const filaDeGrupos = (page: Page) => boton(page, "Ficha clínica").locator("xpath=..");

/** El pie «Plataforma de soporte · ID de soporte» de la demo: si un menú o una captura de pantalla entera lo deja a medias, se esconde. */
const pieDeSoporte = (page: Page) => page.getByText("Plataforma de soporte").locator("xpath=..");

export const procedimientos: Procedimiento[] = [
  /* ─── La rutina del administrador (Inicio) ─── */
  {
    id: "usar-la-rutina-del-administrador",
    capitulo: "admin",
    titulo: "Usar la rutina del administrador",
    roles: ["admin"],
    paraQue: "Para no olvidarte de lo que revisás todos los días (la caja, lo cobrado, los que deben, los cheques…) y llevar la cuenta de lo que hiciste esta semana y de lo que falta.",
    antes: ["Entrás con el usuario de **Administrador**: la rutina es solo de la administración, los demás roles no la ven."],
    pasos: [
      { texto: "Entrá a **Inicio**: debajo de los números de colores está **Rutina del administrador**. En «Todos los días» figura lo que te toca revisar hoy, y cada renglón muestra el dato de la clínica (por ejemplo, quién dejó la caja abierta o cuántos reclamos hay en retención).", captura: "rutina" },
      { texto: "Tocá el nombre de un renglón para ir a la pantalla donde se mira o se resuelve: la caja, los reportes, los cheques…" },
      { texto: "Cuando ya lo revisaste, tildá el casillero de la izquierda. Queda guardado con tu nombre y la hora; si te equivocaste, tocalo de nuevo y se destilda.", captura: "tildar" },
      { texto: "Arriba a la derecha, **Esta semana: N hechas · M faltan** cuenta lo que tildaste y lo que quedó sin tildar. Tocá «Ver la semana» para ver cada día; ahí también podés tildar un día que se te pasó.", captura: "semana" },
      { texto: "«Revisar el desempeño de la semana» sale cada lunes. Y a fin de mes —desde el 25 hasta el 5 del mes siguiente— se suman «Liquidar a los profesionales» y «Cargar los gastos del mes»." },
    ],
    avisos: [
      { tipo: "ojo", texto: "Cada día empieza de cero: lo que tildaste ayer no cuenta hoy. El de la semana se reinicia el lunes y los de fin de mes, cada mes." },
      { tipo: "ojo", texto: "«Esta semana» cuenta desde el primer día que usaste la rutina: los días anteriores a tu primer casillero no figuran como faltantes." },
      { tipo: "tip", texto: "Si la clínica es nueva, arriba de la lista aparece **Puesta en marcha**: «Crear usuarios» y «Definir servicios y aranceles» se marcan solos cuando ya cargaste a tu equipo y tus prestaciones." },
      { tipo: "revisar", texto: "La rutina es la misma para todas las clínicas (caja, cobrado, deudores, implantes, retenciones y cheques cada día; el desempeño los lunes; liquidar y cargar gastos a fin de mes). Confirmar si falta algo o si conviene que cada clínica pueda editarla." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app");
      const titulo = page.getByRole("heading", { name: "Rutina del administrador" });
      const card = titulo.locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
      await titulo.scrollIntoViewIfNeeded();
      await c.foto("rutina", { recorte: card, resaltar: page.getByRole("region", { name: "Todos los días" }) });

      const marcar = page.getByRole("button", { name: "Marcar como hecho: Revisar lo cobrado del día", exact: true });
      const desmarcar = page.getByRole("button", { name: "Desmarcar: Revisar lo cobrado del día", exact: true });
      await marcar.click();
      await c.expect(desmarcar).toBeVisible();
      await c.foto("tildar", { recorte: card, resaltar: desmarcar });

      await page.getByRole("button", { name: "Ver la semana" }).click();
      await c.expect(page.getByRole("region", { name: "La semana de la rutina" })).toBeVisible();
      await c.foto("semana", { recorte: card, resaltar: [page.getByRole("status").filter({ hasText: "Esta semana:" }), page.getByRole("region", { name: "La semana de la rutina" })] });
    },
  },
  /* ─── Cobranza: prestación realizada (estaba en Dentista: hoy solo la administración puede marcarla) ─── */
  {
    id: "marcar-una-prestacion-realizada",
    capitulo: "admin",
    titulo: "Marcar una prestación como realizada",
    roles: ["admin"],
    paraQue: "Cuando una prestación del plan ya se hizo en el consultorio: al marcarla sube el avance del plan y lo realizado pasa a contar para la cobranza. Hoy lo hace la administración.",
    antes: ["El plan tiene que estar **Aceptado** por el paciente: mientras figura como **Borrador** o **Presentado**, la columna **Estado** de sus prestaciones muestra solo un guion."],
    pasos: [
      { texto: "Entrá a **Presupuestos** (menú **Cobranza**, arriba). Cada plan es una tarjeta con su estado; si el plan figura como **Presentado** y el paciente ya lo aprobó, tocá «Marcar aceptado» (si está en **Borrador**, antes tocá «Presentar»).", captura: "lista" },
      { texto: "En la tarjeta del plan aceptado, tocá «Detalle»: se abre el presupuesto con la lista de prestaciones." },
      { texto: "En la columna **Estado**, tocá «pendiente» en la prestación que se hizo: pasa a «✓ realizado», en verde. Si te equivocaste, tocala de nuevo y vuelve a «pendiente».", captura: "detalle" },
      { texto: "Cuando están todas realizadas, la tarjeta del plan ofrece «Completar»: tocalo para cerrar el plan." },
      { texto: "Mirá el resultado en la ficha del paciente, en **Planes de tratamiento**: el progreso del plan sube y, si lo realizado vale más que lo que el paciente pagó, el plan figura con **Deudas**.", captura: "resultado" },
    ],
    avisos: [
      { tipo: "ojo", texto: "El dentista no abre **Presupuestos** (le aparece «Acceso denegado»): lo que se hizo en el consultorio lo marca la administración." },
      { tipo: "ojo", texto: "En la ficha de un dentista, el plan solo muestra «Avance del plan» (por ejemplo 1 / 3 prestaciones realizadas): los montos son de la administración y la caja." },
      { tipo: "ojo", texto: "Cada marca queda en el historial del plan (con quién la hizo) y la prestación aparece en el **Historial** del paciente como «Prestación realizada»." },
      { tipo: "error", texto: "Marcar una prestación como realizada está pensado para quien escribe en la ficha clínica (administración y dentista), pero la sección **Presupuestos**, donde está el botón, solo la abren la administración y la caja: la Dra. Sofía, que es quien hace la prestación, no puede marcarla. Tendría que poder marcar las prestaciones de sus planes desde la ficha, en **Planes de tratamiento**." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app");
      // Se llega por el menú, como dice el texto.
      await page.getByRole("button", { name: /Cobranza/ }).click();
      await page.getByRole("link", { name: "Presupuestos" }).filter({ visible: true }).first().click();
      await c.expect(page.getByRole("heading", { name: "Presupuestos", level: 1 })).toBeVisible();
      // El plan de María González está «Presentado»: se lo acepta para poder marcar sus prestaciones (es el paso previo del procedimiento).
      const tarjeta = page.locator("main").getByRole("button", { name: "María González", exact: true }).locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
      await c.foto("lista", { resaltar: tarjeta.getByRole("button", { name: "Marcar aceptado" }), recorte: tarjeta, margen: 8 });
      await tarjeta.getByRole("button", { name: "Marcar aceptado" }).click();
      await tarjeta.getByRole("button", { name: "Detalle" }).click();
      const modal = page.getByRole("dialog", { name: "Presupuesto" });
      await modal.getByRole("button", { name: "pendiente" }).first().click();
      await c.expect(modal.getByRole("button", { name: "✓ realizado" })).toHaveCount(1);
      await c.foto("detalle", {
        resaltar: modal.getByRole("button", { name: "✓ realizado" }),
        recorte: [modal.getByRole("heading", { name: "Presupuesto" }), modal.getByRole("table")],
        margen: 6,
      });
      // Si te equivocaste, tocala de nuevo y vuelve a «pendiente» (y se vuelve a marcar).
      await modal.getByRole("button", { name: "✓ realizado" }).click();
      await c.expect(modal.getByRole("button", { name: "pendiente" })).toHaveCount(3);
      await modal.getByRole("button", { name: "pendiente" }).first().click();
      await modal.getByRole("button", { name: "Cerrar", exact: true }).last().click();

      await c.ir("/app/pacientes/p1");
      await boton(page, "Planes de tratamiento").click();
      await c.expect(page.getByText("Deudas")).toBeVisible();
      const plan = page.getByRole("button", { name: /#g1: Plan dental integral/ });
      // El círculo del avance y la etiqueta de «Deudas»: dos recuadros chicos (las columnas enteras se pisan entre sí).
      await c.foto("resultado", {
        resaltar: [plan.locator("div.relative.h-12.w-12"), plan.getByText(/Deudas/)],
        recorte: [filaDeGrupos(page), plan],
      });

      // Lo que el texto cuenta y no se fotografía: la prestación figura en el Historial y, con todas hechas, aparece «Completar».
      await boton(page, "Ficha clínica").click();
      await boton(page, "Historial").click();
      await c.expect(page.getByText(/Prestación realizada · Plan #g1/)).toBeVisible();
      await c.ir("/app/presupuestos");
      await tarjeta.getByRole("button", { name: "Detalle" }).click();
      await c.expect(modal).toBeVisible();
      await c.expect(tarjeta.getByRole("button", { name: "Completar" })).toHaveCount(0); // con 1 de 3, todavía no
      for (let i = 0; i < 2; i++) {
        await modal.getByRole("button", { name: "pendiente" }).first().click();
        await page.waitForTimeout(200);
      }
      await modal.getByRole("button", { name: "Cerrar", exact: true }).last().click();
      await c.expect(tarjeta.getByRole("button", { name: "Completar" })).toBeVisible();
      await tarjeta.getByRole("button", { name: "Completar" }).click();
      await c.expect(tarjeta.getByText("Completado")).toBeVisible();
    },
  },
  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    id: "leer-el-panel-de-desempeno",
    capitulo: "admin",
    titulo: "Leer el panel de desempeño y los reportes gráficos",
    roles: ["admin"],
    paraQue: "Para saber cómo viene la clínica: cuánto se cobró, cuánto se gastó, cuánto produce cada profesional y de dónde vienen los pacientes. Se mira cada semana o al cerrar el mes.",
    antes: ["La clínica tiene el plan Clínica o Multi: con el plan Solo, la sección Reportes no está disponible."],
    pasos: [
      { texto: "Entrá a **Reportes › Panel de desempeño**. Arriba están los números de los últimos 30 días: «Cobrado 30d», «Gastos 30d», «Resultado» (cobrado menos gastos) y «Aceptación» (el porcentaje de presupuestos presentados que el paciente aceptó).", captura: "panel" },
      { texto: "Más abajo, **Flujo de caja** dibuja día por día lo cobrado (verde) y lo gastado (rojo): sirve para ver cuándo entró la plata y cuándo se juntaron los gastos.", captura: "flujo" },
      { texto: "**Producción y comisiones por profesional** muestra cuánto se cobró por los presupuestos de cada uno y la comisión que le toca. **Morosidad** lista a los pacientes que aceptaron un tratamiento y todavía deben plata.", captura: "produccion" },
      { texto: "Para mirar mes por mes, tocá «Reportes gráficos». Elegí el reporte en **Reporte** y los meses en **Desde** y **Hasta**; debajo del título, cada reporte explica qué mide.", captura: "graficos" },
      { texto: "Cada reporte contesta una pregunta. **Resultados**: ¿ganamos o perdimos plata cada mes? **Eficiencia por profesional**: ¿quién rinde más por hora de sillón? **Ventas por prestación** y **Ventas por categoría**: ¿qué tratamientos dejan más? **Recaudación del día**: ¿cuánto entró el día que elijas y con qué medio de pago?" },
      { texto: "**Estado de financiamientos** (¿cuánto vamos a cobrar en cuotas y cuánto está vencido?) y **Pacientes morosos por antigüedad** (¿quién debe trabajo ya hecho y desde hace cuánto?) se calculan al día de hoy. **Derivación de pacientes** contesta de dónde vienen los pacientes nuevos y sale mejor cuanto más se carga el dato «Cómo nos conoció» en la ficha." },
      { texto: "En **Resultados**, el desplegable **En base a** cambia cómo se cuenta. Con «Prestaciones realizadas», las ventas son las prestaciones que el dentista marcó como realizadas cada mes (con el descuento del plan), las hayas cobrado o no, y los gastos van por su fecha de factura; con «Pagos recibidos», cuenta solo lo cobrado y los gastos ya pagados.", captura: "resultados" },
      { texto: "«Análisis de pacientes» contesta: de las citas agendadas, ¿cuántas se confirman y cuántas terminan en un presupuesto aceptado? Elegí el período con las dos fechas y tocá «Filtrar»; abajo hay gráficos por edad, género, ciudad, medio de pago, categoría de tratamiento y estado de las citas.", captura: "analisis" },
    ],
    avisos: [
      { tipo: "ojo", texto: "«Gastos 30d» cuenta cada gasto por el día en que se cargó, y «Aceptación» cuenta todos los presupuestos presentados, no solo los de los últimos 30 días." },
      { tipo: "ojo", texto: "«Morosidad» es lo que el paciente aceptó y todavía no pagó, aunque el tratamiento no se haya hecho. En «Pacientes morosos por antigüedad» solo cuenta el trabajo ya realizado y no pagado: por eso los dos números pueden no coincidir." },
      { tipo: "ojo", texto: "En «Producción y comisiones por profesional» solo suman los pagos ligados a un presupuesto del profesional. Es una cuenta distinta de la de [[liquidar-a-los-profesionales]]." },
      { tipo: "tip", texto: "Con el plan Clínica o Multi, arriba del panel está «Pregúntale a tus datos»: escribís una pregunta y la IA la contesta con estos mismos números. En la demo pública la IA está apagada." },
      { tipo: "revisar", texto: "Hay tres «producciones» que no coinciden: la de Inicio y la de Liquidaciones (importe de las citas), la de este panel (lo cobrado en 30 días) y la de los reportes gráficos (prestaciones realizadas). Confirmar cuál se le explica a la clínica como «producción»." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app/reportes");
      const main = page.locator("main");
      await revelarTodo(page);

      // Los cuatro números de arriba, en un solo recuadro (sin el cuadro de IA que está encima).
      const tiles = ["Cobrado 30d", "Gastos 30d", "Resultado", "Aceptación"].map((t) => tarjeta(main.getByText(t, { exact: true })));
      const fila = tiles[0].locator("xpath=ancestor::div[contains(@class,'grid')][1]");
      await c.foto("panel", { resaltar: fila, recorte: fila, margen: 6 });

      const flujo = tarjeta(page.getByRole("heading", { name: /^Flujo de caja/ }));
      await c.foto("flujo", { resaltar: flujo, recorte: flujo, esperar: 1800 });

      const produccion = tarjeta(page.getByRole("heading", { name: /^Producción y comisiones/ }));
      const morosidad = tarjeta(page.getByRole("heading", { name: /^Morosidad/ }));
      await c.foto("produccion", { resaltar: [produccion, morosidad], recorte: [produccion, morosidad], esperar: 1500 });

      await page.getByRole("button", { name: "Reportes gráficos" }).click();
      await revelarTodo(page);
      const reporte = main.locator("select").first();
      const controles = reporte.locator("xpath=ancestor::div[contains(@class,'space-y-3')][1]");
      const meses = main.locator("input[type=month]");
      const pestanas = page.getByRole("button", { name: "Reportes gráficos" });
      await c.foto("graficos", { resaltar: [pestanas, reporte, meses.nth(0), meses.nth(1)], recorte: [main.getByRole("heading", { name: "Informes de gestión", level: 1 }), pestanas.locator("xpath=.."), controles], esperar: 1000 });

      const enBase = main.locator("select").nth(1);
      const grafico = tarjeta(main.locator(".recharts-wrapper").first());
      await c.foto("resultados", { resaltar: enBase, recorte: [controles, grafico], margen: 8, esperar: 1800 });

      await page.getByRole("button", { name: "Análisis de pacientes" }).click();
      await revelarTodo(page);
      const filtro = main.getByText("Filtrar los resultados", { exact: true }).locator("xpath=..");
      const embudo = tarjeta(main.getByRole("heading", { name: "Conversión total del período" }));
      const lineaTiempo = tarjeta(main.getByRole("heading", { name: "Conversión de pacientes a través del tiempo" }));
      await c.foto("analisis", { resaltar: main.getByRole("button", { name: "Filtrar" }), recorte: [filtro, embudo, lineaTiempo], esperar: 1800 });
    },
  },

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    id: "asignar-tareas-al-equipo",
    capitulo: "admin",
    titulo: "Asignar tareas al equipo y ver las estadísticas",
    roles: ["admin"],
    paraQue: "Para repartir el trabajo del día entre el equipo (quién llama, quién cobra, quién agenda) y ver después cuánto resolvió cada uno.",
    antes: ["Conocer la bandeja de tareas: [[trabajar-las-tareas]]."],
    pasos: [
      { texto: "Entrá a **Tareas** y, en la fila de la tarea, tocá «Responsable»: se abre la lista de personas.", captura: "responsable" },
      { texto: "Elegí «Asignar a mí» o, más abajo, el nombre de un compañero. La lista trae solo a quienes pueden ver ese tipo de tarea: una cobranza, por ejemplo, no se le asigna a quien no ve montos." },
      { texto: "En la fila queda el nombre del responsable, y la tarea aparece en **Mi agenda** (en Inicio) de esa persona. Para soltarla, abrí «Responsable» y elegí «Quitar responsable».", captura: "asignada" },
      { texto: "Para ver cómo se reparte el trabajo, tocá «Filtrar por» y, en **Responsable**, elegí «Asignadas a mí» o «Sin asignar».", captura: "filtro" },
      { texto: "Para ver cuánto resolvió cada uno, tocá el segundo ícono de arriba a la izquierda, **Estadísticas**. Elegí «Resultados históricos» o un mes con las flechas.", captura: "estadisticas" },
      { texto: "Los cuatro contadores (deudas cobradas, presupuestos capturados, controles agendados y citas re-agendadas) dicen «N de M casos»: M son los casos que alguien trabajó con «Finalizar» y N los que hoy terminaron bien (la deuda se cobró, el presupuesto se aceptó, el paciente volvió a agendar). Abajo, la tabla cuenta los casos que trabajó cada persona, incluidas las tareas personalizadas, los cheques y las citas sin confirmar.", captura: "casos" },
      { texto: "Los plazos con los que el sistema arma las tareas automáticas se cambian en «Plazos de las tareas» (el engranaje de la pantalla de Tareas), **Configuración de plazos**: mirá [[ajustar-los-plazos-de-las-tareas]]." },
    ],
    avisos: [
      { tipo: "ojo", texto: "Una tarea que le asignás a otra persona deja de ser tuya: sale de tu **Mi agenda** y aparece en la de ella. Las tareas automáticas (cobranza, cita…) solo aparecen en **Mi agenda** de quien las tiene asignadas." },
      { tipo: "ojo", texto: "Las estadísticas solo cuentan lo que alguien trabajó con «Finalizar». Una tarea que se resuelve sola (el paciente pagó, agendó o aceptó) sin que nadie la toque no deja registro." },
      { tipo: "tip", texto: "Los demás roles también usan «Responsable» para pasarse tareas; las estadísticas y el engranaje de plazos son solo de la administración." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app/tareas");
      const main = page.locator("main");
      await revelarTodo(page);

      // La tarea interna de la demo (sin paciente, sin fecha: siempre está en «hoy»).
      const lista = main.getByRole("list", { name: "Tareas del día" });
      const fila = lista.getByRole("listitem").filter({ hasText: "Pedir presupuesto de autoclave nueva" });
      const responsable = fila.getByRole("button", { name: /^Responsable/ });
      await responsable.click();
      const menu = page.getByRole("menu");
      await c.expect(menu).toBeVisible();
      await c.foto("responsable", { resaltar: responsable, recorte: [lista, menu], margen: 8 });

      await menu.getByRole("menuitem", { name: "Laura Recepción" }).click();
      await c.expect(fila.getByRole("button", { name: /Laura/ })).toBeVisible();
      await soltar(page);
      await c.foto("asignada", { resaltar: fila.getByRole("button", { name: /Laura/ }), recorte: fila, margen: 0 });

      // «Quitar responsable» (sin captura): la fila vuelve a «Responsable».
      await fila.getByRole("button", { name: /Laura/ }).click();
      await page.getByRole("menuitem", { name: "Quitar responsable" }).click();
      await c.expect(fila.getByRole("button", { name: /^Responsable$/ })).toBeVisible();

      const filtrar = main.getByRole("button", { name: /Filtrar por/ });
      await filtrar.click();
      const menuFiltro = page.getByRole("menu");
      const sinAsignar = menuFiltro.getByRole("menuitem", { name: "Sin asignar" });
      const barra = main.getByRole("tablist", { name: "Listas de tareas" }).locator("xpath=..");
      await c.foto("filtro", { resaltar: sinAsignar, recorte: [barra, lista, menuFiltro], margen: 8, ocultar: pieDeSoporte(page) });
      await sinAsignar.click();
      await c.expect(lista.getByRole("listitem").filter({ hasText: "Pedir presupuesto de autoclave nueva" })).toBeVisible();
      await c.expect(lista.getByRole("listitem").filter({ hasText: "Llamar para confirmar control de ortodoncia" })).toHaveCount(0); // ya tiene responsable (Paola)
      await filtrar.click();
      await page.getByRole("menu").getByRole("menuitem", { name: "Todas" }).last().click();

      // Una cobranza solo se le puede asignar a quien ve montos: en la lista no están la dentista ni la asistente.
      await main.getByRole("tab", { name: /Tareas atrasadas/ }).click();
      const cobranza = main.getByRole("listitem").filter({ hasText: "Cobranza" }).first();
      if (await cobranza.count()) {
        await cobranza.getByRole("button", { name: /^Responsable/ }).click();
        await c.expect(page.getByRole("menuitem", { name: "Marta Caja" })).toBeVisible();
        await c.expect(page.getByRole("menuitem", { name: "Dra. Sofía Benítez" })).toHaveCount(0);
        await page.keyboard.press("Escape");
      }
      await main.getByRole("tab", { name: /Tareas del día/ }).click();

      // Para que las estadísticas tengan algo que mostrar se trabajan tres tareas con «Finalizar ▾» (datos de ejemplo).
      const trabajar = async (nombre: RegExp) => {
        const f = main.getByRole("button", { name: nombre }).first();
        if (!(await f.count())) return;
        await f.click();
        await main.getByRole("button", { name: /^Finalizar/ }).click();
        await page.getByRole("menuitem", { name: "El paciente dice OK" }).click();
      };
      await main.getByRole("tab", { name: /Tareas atrasadas/ }).click();
      await trabajar(/^Cobranza — /);
      await main.getByRole("tab", { name: /Tareas del día/ }).click();
      await trabajar(/^Cita — /);
      await trabajar(/^Personalizada — Marco/);

      await main.getByRole("tab", { name: "Estadísticas" }).click();
      await c.expect(main.getByRole("heading", { name: "Estadísticas", level: 1 })).toBeVisible();
      await soltar(page);
      const tabs = main.getByRole("tablist", { name: "Secciones de tareas" });
      await c.foto("estadisticas", { resaltar: [tabs.getByRole("tab", { name: "Estadísticas" }), main.getByRole("button", { name: /^Por mes/ })], recorte: [tabs, main.getByRole("button", { name: /^Por mes/ })], esperar: 600 });

      const contadores = main.getByText("Deudas cobradas").locator("xpath=ancestor::div[contains(@class,'grid')][1]");
      const tablaCasos = tarjeta(main.getByRole("heading", { name: "Usuarios y los casos en los que han participado" }));
      await c.foto("casos", { resaltar: contadores, recorte: [contadores, tablaCasos], margen: 8, esperar: 800 });
    },
  },

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    id: "cargar-un-gasto",
    capitulo: "admin",
    titulo: "Cargar un gasto de la clínica",
    roles: ["admin"],
    paraQue: "Cada vez que la clínica paga algo (insumos, laboratorio, alquiler, sueldos, servicios) para que el gasto entre en los reportes y en el cierre de la caja.",
    pasos: [
      { texto: "Entrá a **Administración › Gastos** y tocá «Agregar gasto». Arriba podés cambiar el mes y el año para ver los gastos de otro período.", captura: "lista" },
      { texto: "Elegí la **Categoría** (Insumos, Laboratorio, Sueldos, Alquiler, Servicios, Equipamiento, Marketing, Impuestos, Mantenimiento u Otros), escribí el **Detalle** de lo que se pagó y el **Monto (Gs)**. El **Proveedor** es opcional.", captura: "formulario" },
      { texto: "Poné la **Fecha factura** (la que figura en la factura del proveedor) y, si ya lo pagaste, la **Fecha pago**. Sin fecha de pago, el gasto queda como «No pagada».", captura: "fechas" },
      { texto: "En **Asociar a caja (opcional)** dejá la caja abierta de la que salió el dinero, o «Sin asociar». Tocá «Registrar»: el botón muestra el monto.", captura: "registrar" },
      { texto: "El gasto aparece en la tabla **Detalle** y suma al total del mes. En «Resumen por categoría» ves cuánto pesa cada categoría.", captura: "nuevo" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Mientras haya una caja abierta, todo gasto que cargues se resta del efectivo que tiene que haber en el cajón al cerrarla, aunque lo hayas pagado por transferencia. Con **Asociar a caja** lo imputás a una caja concreta." },
      { tipo: "ojo", texto: "Cada reporte ubica el gasto con una fecha distinta: el Panel de desempeño, por el día en que lo cargaste; «Resultados», por la **Fecha factura** (o por la **Fecha pago** si elegís «Pagos recibidos»); «Recaudación del día», por la **Fecha pago**. Por eso conviene cargar las dos fechas: [[leer-el-panel-de-desempeno]]." },
      { tipo: "ojo", texto: "Para corregir un monto o una fecha usá el lápiz de la fila. El tachito pide confirmación y borra el gasto sin posibilidad de deshacerlo." },
      { tipo: "tip", texto: "Todos los gastos se bajan en una planilla desde Reportes: [[sacar-un-reporte-en-excel]]." },
      { tipo: "revisar", texto: "El formulario no tiene un campo para el número de factura ni para adjuntar el comprobante: solo guarda las fechas. Confirmar si la clínica lo necesita." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app/gastos");
      const hoy = await hoyLocal(page);
      const main = page.locator("main");
      await revelarTodo(page);
      const agregar = main.getByRole("button", { name: "Agregar gasto" });
      const tiles = main.getByText("Categorías", { exact: true }).locator("xpath=ancestor::div[contains(@class,'grid')][1]");
      await c.foto("lista", { resaltar: agregar, recorte: [cabecera(main, "Gastos"), tiles], margen: 6 });

      await agregar.click();
      const modal = page.getByRole("dialog", { name: "Agregar gasto" });
      await modal.getByLabel("Categoría").selectOption("Insumos");
      await modal.getByLabel("Proveedor").fill("Dental Center PY");
      await modal.getByLabel("Detalle").fill("Guantes y barbijos");
      await modal.getByLabel("Monto (Gs)").fill("350000");
      await soltar(page);
      await c.foto("formulario", { resaltar: [modal.getByLabel("Categoría"), modal.getByLabel("Detalle"), modal.getByLabel("Monto (Gs)")], recorte: modal, margen: 4 });

      await modal.getByLabel("Fecha factura").fill(hoy);
      await modal.getByLabel("Fecha pago").fill(hoy);
      await soltar(page);
      await c.foto("fechas", { resaltar: [modal.getByLabel("Fecha factura"), modal.getByLabel("Fecha pago")], recorte: modal, margen: 4 });

      const registrar = modal.getByRole("button", { name: /^Registrar/ });
      await c.foto("registrar", { resaltar: [modal.getByLabel("Asociar a caja"), registrar], recorte: modal, margen: 4 });
      await registrar.click();
      await c.expect(main.getByText("Guantes y barbijos")).toBeVisible();
      await soltar(page);
      const fila = main.getByRole("row").filter({ hasText: "Guantes y barbijos" });
      await c.foto("nuevo", { resaltar: fila, recorte: [fila, main.getByRole("button", { name: "Resumen por categoría" }), main.getByRole("columnheader", { name: "Categoría" })], margen: 6 });
    },
  },

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    id: "controlar-el-inventario",
    capitulo: "admin",
    titulo: "Controlar el inventario",
    roles: ["admin"],
    paraQue: "Para saber qué insumos hay, cuáles se están acabando y registrar cada compra y cada consumo, de modo que el stock del sistema coincida con el de la bodega.",
    antes: ["La clínica tiene el plan Clínica o Multi: con el plan Solo, el inventario no está disponible."],
    pasos: [
      { texto: "Entrá a **Administración › Inventario**. Arriba ves cuántos ítems hay, cuántos están con **Stock bajo** y la **Valorización**: lo que vale todo el stock al costo.", captura: "resumen" },
      { texto: "Mirá el semáforo de cada fila: «Reponer» (rojo) es que el stock llegó al mínimo o está por debajo; «Bajo óptimo» (amarillo), que está sobre el mínimo pero debajo del óptimo; «OK», que está bien; «Sobre-stock», que pasó el máximo.", captura: "semaforo" },
      { texto: "Para dar de alta un insumo, tocá «Nuevo ítem». Completá **Nombre**, **Categoría**, **Unidad**, **Stock**, los topes **Mínimo**, **Óptimo** y **Máximo**, el **Costo (Gs)** y el **Proveedor**, y tocá «Guardar».", captura: "nuevo" },
      { texto: "Cuando llega mercadería, tocá el ícono verde de la fila, **Registrar entrada**. Escribí la **Cantidad** y el **Motivo** (por ejemplo, la compra al proveedor) y tocá «Registrar entrada». Con el ícono rojo, **Registrar salida**, hacés lo mismo cuando se usa material.", captura: "entrada" },
      { texto: "El stock de la fila se actualiza al instante y el movimiento queda en **Movimientos recientes**, con la fecha, el motivo y quién lo registró.", captura: "movimientos" },
      { texto: "Cuando un insumo llega al mínimo, el sistema te avisa: en **Inicio**, en «Tareas críticas», y en **Mi agenda**, en «Reponer el stock bajo».", captura: "aviso" },
    ],
    avisos: [
      { tipo: "ojo", texto: "El número «Stock bajo» de esta pantalla cuenta los ítems en «Reponer» y en «Bajo óptimo». El aviso de Inicio y el de Mi agenda salta solo con los que llegaron al mínimo («Reponer»)." },
      { tipo: "ojo", texto: "Una salida no puede ser mayor que el stock que hay. Si corregís el stock con el lápiz (**Editar ítem**), el cambio no queda en Movimientos: para dejar rastro usá una entrada o una salida." },
      { tipo: "tip", texto: "El Excel de Inventario baja el stock y la valorización de cada insumo: [[sacar-un-reporte-en-excel]]." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app/inventario");
      const main = page.locator("main");
      await revelarTodo(page);
      const tiles = ["Ítems", "Stock bajo", "Valorización"].map((t) => tarjeta(main.getByText(t, { exact: true })));
      await c.foto("resumen", { resaltar: tiles[1], recorte: tiles, esperar: 800 });

      const tabla = main.getByRole("table");
      await c.foto("semaforo", { resaltar: [tabla.getByText("Reponer", { exact: true }).first(), tabla.getByText("Bajo óptimo", { exact: true }).first()], recorte: tabla, margen: 8 });

      await main.getByRole("button", { name: "Nuevo ítem" }).click();
      const nuevo = page.getByRole("dialog", { name: "Nuevo ítem" });
      await nuevo.getByLabel("Nombre", { exact: true }).fill("Algodón en rollos");
      await nuevo.getByLabel("Categoría").fill("Descartables");
      await nuevo.getByLabel("Unidad").fill("bolsa x500 g");
      await nuevo.getByLabel("Stock", { exact: true }).fill("6");
      await nuevo.getByLabel("Mínimo").fill("2");
      await nuevo.getByLabel("Óptimo").fill("6");
      await nuevo.getByLabel("Máximo").fill("12");
      await nuevo.getByLabel("Costo (Gs)").fill("28000");
      await nuevo.getByLabel("Proveedor").fill("Insumos Médicos SA");
      await soltar(page);
      await c.foto("nuevo", { resaltar: [nuevo.getByLabel("Nombre", { exact: true }), nuevo.getByLabel("Stock", { exact: true }), nuevo.getByLabel("Mínimo"), nuevo.getByLabel("Óptimo"), nuevo.getByLabel("Máximo"), nuevo.getByRole("button", { name: "Guardar" })], recorte: nuevo, margen: 4, alto: 900 });
      await nuevo.getByRole("button", { name: "Guardar" }).click();
      await c.expect(tabla.getByText("Algodón en rollos")).toBeVisible();

      // Entrada de mercadería sobre el hipoclorito, que está en «Reponer».
      const fila = main.getByRole("row").filter({ hasText: "Hipoclorito de sodio" });
      const entrada = fila.getByRole("button", { name: "Registrar entrada" });
      await entrada.click();
      const mov = page.getByRole("dialog", { name: /^Entrada — / });
      await mov.getByLabel("Cantidad").fill("5");
      await mov.getByLabel("Motivo").fill("Compra proveedor Insumos Médicos SA");
      await soltar(page);
      await c.foto("entrada", { resaltar: [mov.getByLabel("Cantidad"), mov.getByLabel("Motivo")], recorte: mov, margen: 4 });
      await mov.getByRole("button", { name: "Registrar entrada" }).click();
      await c.expect(page.getByRole("dialog")).toHaveCount(0);
      await soltar(page);

      const recientes = tarjeta(main.getByRole("heading", { name: "Movimientos recientes" }));
      const tarjetaTabla = tarjeta(tabla);
      await c.foto("movimientos", { resaltar: [fila.getByRole("cell").nth(1), recientes.getByRole("listitem").first()], recorte: [tarjetaTabla, recientes], margen: 8 });

      // Salida (sin captura): no deja sacar más de lo que hay, y al registrarla el stock baja.
      await fila.getByRole("button", { name: "Registrar salida" }).click();
      const salida = page.getByRole("dialog", { name: /^Salida — / });
      await salida.getByLabel("Cantidad").fill("99");
      await c.expect(salida.getByLabel("Cantidad")).toHaveValue("6"); // el tope es el stock actual
      await salida.getByLabel("Cantidad").fill("1");
      await salida.getByLabel("Motivo").fill("Consumo consultorio 2");
      await salida.getByRole("button", { name: "Registrar salida" }).click();
      await c.expect(fila.getByRole("cell").nth(1)).toContainText("5");
      // Corregir el stock con «Editar ítem» no deja un movimiento.
      const movimientosAntes = (await leerDemo(page)).stockMoves.length;
      await fila.getByRole("button", { name: "Editar ítem" }).click();
      const editar = page.getByRole("dialog", { name: "Editar ítem" });
      await editar.getByLabel("Stock", { exact: true }).fill("4");
      await editar.getByRole("button", { name: "Guardar" }).click();
      await c.expect(fila.getByRole("cell").nth(1)).toContainText("4");
      c.expect((await leerDemo(page)).stockMoves.length).toBe(movimientosAntes);

      await c.ir("/app");
      await revelarTodo(page);
      const fila2 = page.getByRole("link", { name: "Reponer el stock bajo", exact: true });
      await fila2.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(500);
      const filaAviso = fila2.locator("xpath=ancestor::li[1]");
      await c.foto("aviso", { resaltar: filaAviso, recorte: filaAviso, margen: 2 });
    },
  },

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    id: "revisar-las-retenciones-de-facturacion",
    capitulo: "admin",
    titulo: "Revisar los cobros retenidos",
    roles: ["admin"],
    paraQue: "Cuando en Inicio el número «Reclamos en retención» no es cero: son registros de facturación frenados, a la espera de que la administración los revise y los libere.",
    antes: ["El reclamo ya fue enviado a cobro: eso lo hace Recepción y caja o la administración, con «Enviar a cobro»."],
    pasos: [
      { texto: "En **Inicio**, tocá la tarjeta **Reclamos en retención**. Te lleva a **Cobranza › Facturación** con el filtro «En retención» ya puesto.", captura: "inicio" },
      { texto: "Cada reclamo muestra el procedimiento, el paciente, los códigos (**DX**, **POS**, **MOD**), el tipo (**E-claim** o **Manual claim**), el total y la etiqueta **HOLD** o **MGRHOLD**. La franja de abajo dice por qué está retenido.", captura: "lista" },
      { texto: "«HOLD» es la retención automática de un reclamo electrónico, que espera en la cola de validación. «MGRHOLD» es la retención manual de un reclamo manual: necesita que una persona lo revise antes del envío." },
      { texto: "Para ver cómo llegó hasta ahí, tocá el ícono del reloj, **Ver historial de estados**: lista cada paso con la fecha y quién lo hizo.", captura: "historial" },
      { texto: "Si está todo bien, tocá «Release from Hold». La retención se levanta y el reclamo pasa a **FACTURADO**.", captura: "liberar" },
      { texto: "El reclamo sale de la lista «En retención» y el número de Inicio baja en uno.", captura: "resultado" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Liberar es una decisión de la administración. Recepción y caja ve la lista «En retención» pero no tiene el botón «Release from Hold»." },
      { tipo: "tip", texto: "Los reclamos retenidos también figuran en la campana de arriba, junto a los documentos pendientes: [[ver-los-pendientes]]." },
      { tipo: "revisar", texto: "Esta pantalla usa términos de facturación de seguros (E-claim, DX, POS, Release from Hold) y etiquetas que no se explican en la app. Confirmar con Novum cómo se les explica a las clínicas de Paraguay y qué significa «retención» en su día a día; el manual lo describe como funciona hoy." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app");
      const retenidos = page.getByRole("link", { name: /Reclamos en retención/ });
      const tiles = retenidos.locator("xpath=..").locator("xpath=..");
      await c.foto("inicio", { resaltar: retenidos, recorte: tiles, esperar: 1800 });
      await retenidos.click();
      await page.waitForURL(/facturacion\?filtro=en-retencion/);
      const main = page.locator("main");
      await c.expect(main.getByRole("heading", { name: "Facturación" })).toBeVisible();
      await revelarTodo(page);
      const filtros = main.getByRole("button", { name: "En retención" });
      const primero = tarjeta(main.getByRole("button", { name: "Release from Hold" }).first());
      const segundo = tarjeta(main.getByRole("button", { name: "Release from Hold" }).nth(1));
      await c.foto("lista", { resaltar: [filtros, main.getByText("HOLD", { exact: true }).first(), main.getByText("MGRHOLD", { exact: true }).first()], recorte: [main.getByRole("heading", { name: "Facturación", level: 1 }), main.getByRole("button", { name: "Nuevo registro" }), filtros, primero, segundo],
        // La etiqueta ATHENA (con quién se factura en otros países) no le dice nada a una clínica de Paraguay.
        ocultar: main.getByText("ATHENA", { exact: true }) });

      const reloj = primero.getByRole("button").first();
      await reloj.click();
      const historial = page.getByRole("dialog", { name: "Historial del reclamo" });
      await c.foto("historial", { resaltar: historial.locator("div").filter({ hasText: "Retención automática (HOLD)" }).last(), recorte: historial, margen: 4 });
      await page.keyboard.press("Escape");
      await soltar(page);

      const liberar = main.getByRole("button", { name: "Release from Hold" }).first();
      await c.foto("liberar", { resaltar: liberar, recorte: primero, margen: 8, ocultar: main.getByText("ATHENA", { exact: true }) });
      await liberar.click();
      await c.expect(main.getByRole("button", { name: "Release from Hold" })).toHaveCount(1);
      await c.ir("/app");
      const nuevo = page.getByRole("link", { name: /Reclamos en retención/ });
      await c.foto("resultado", { resaltar: nuevo, recorte: nuevo.locator("xpath=..").locator("xpath=.."), esperar: 1800 });
    },
  },

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    id: "pedir-un-trabajo-al-laboratorio",
    capitulo: "admin",
    titulo: "Pedir un trabajo al laboratorio",
    roles: ["admin"],
    paraQue: "Cuando un paciente necesita una corona, una prótesis, una férula u otro trabajo que hace un laboratorio externo: queda anotado qué se pidió, para cuándo y cuánto cuesta, y se sigue hasta que vuelve.",
    antes: ["La clínica tiene el plan Clínica o Multi: con el plan Solo, Laboratorios no está disponible."],
    pasos: [
      { texto: "Entrá a **Administración › Laboratorios** y tocá «Nueva orden». Arriba ves cuántas órdenes hay, cuántas están pendientes y cuántas vencidas.", captura: "lista" },
      { texto: "Elegí el **Paciente** y, si querés, el **Profesional** que lo atiende. Escribí a qué **Laboratorio** se lo mandás y el **Tipo de trabajo** (corona, prótesis, férula…).", captura: "formulario" },
      { texto: "Poné la **Fecha de envío**, la **Fecha de entrega** que te prometió el laboratorio y el **Costo (Gs)**. En **Notas** anotá el color, las indicaciones y lo que haga falta.", captura: "fechas" },
      { texto: "Tocá «Crear orden». Queda en la tabla con el estado **Enviado**.", captura: "orden" },
      { texto: "A medida que avanza el trabajo, tocá el botón azul de la fila: primero «En proceso», después «Recibido» y por último «Entregado». Con el lápiz cambiás la fecha de entrega, el costo o las notas.", captura: "avanzar" },
      { texto: "Con los filtros de arriba (**Enviado**, **En proceso**, **Recibido**, **Entregado**) ves los trabajos de cada etapa." },
    ],
    avisos: [
      { tipo: "ojo", texto: "Si pasó el día de entrega y la orden no está «Entregado», la fila se pinta de rojo y suma en «Vencidas». Una orden con entrega para hoy todavía no está vencida: lo está desde el día siguiente." },
      { tipo: "ojo", texto: "Laboratorios es solo de la administración, porque la orden muestra el costo. El tachito de la fila pide confirmación y borra la orden sin posibilidad de deshacerlo." },
      { tipo: "tip", texto: "El costo de la orden no se carga solo en los gastos. Para que cuente en los reportes, cargalo aparte con la categoría «Laboratorio»: [[cargar-un-gasto]]." },
      { tipo: "revisar", texto: "La orden vive solo en esta pantalla y en el Excel de Laboratorios: no aparece en la ficha del paciente ni genera una tarea cuando vence. Confirmar si hace falta." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app/laboratorios");
      const hoy = await hoyLocal(page);
      const main = page.locator("main");
      await revelarTodo(page);
      const nueva = main.getByRole("button", { name: "Nueva orden" });
      await c.foto("lista", { resaltar: nueva, recorte: [cabecera(main, "Laboratorios"), tarjeta(main.getByText("Total", { exact: true })), tarjeta(main.getByText("Vencidas", { exact: true }))], margen: 6 });

      await nueva.click();
      const modal = page.getByRole("dialog", { name: "Nueva orden de laboratorio" });
      await modal.getByLabel("Paciente").selectOption({ label: "María González" });
      await modal.getByLabel("Laboratorio *").fill("LaboDent");
      await modal.getByLabel("Tipo de trabajo *").fill("Corona cerámica pieza 26");
      await soltar(page);
      await c.foto("formulario", { resaltar: [modal.getByLabel("Paciente"), modal.getByLabel("Laboratorio *"), modal.getByLabel("Tipo de trabajo *")], recorte: modal, margen: 4, alto: 900 });

      await modal.getByLabel("Fecha de envío").fill(hoy);
      await modal.getByLabel("Fecha de entrega").fill(sumarDias(hoy, 7));
      await modal.getByLabel("Costo (Gs)").fill("900000");
      await modal.getByLabel("Notas").fill("Color A2. Prueba de metal a los 4 días.");
      await soltar(page);
      await c.foto("fechas", { resaltar: [modal.getByLabel("Fecha de envío"), modal.getByLabel("Fecha de entrega"), modal.getByLabel("Costo (Gs)"), modal.getByLabel("Notas"), modal.getByRole("button", { name: "Crear orden" })], recorte: modal, margen: 4, alto: 900 });
      await modal.getByRole("button", { name: "Crear orden" }).click();

      const fila = main.getByRole("row").filter({ hasText: "Corona cerámica pieza 26" });
      await c.expect(fila).toBeVisible();
      await soltar(page);
      await c.foto("orden", { resaltar: fila, recorte: [fila, main.getByRole("columnheader", { name: "Paciente" })], margen: 6 });
      // La tabla muestra las fechas tal como se cargaron (antes salían un día antes) y la entrega de la semana que viene no figura vencida.
      const diaCargado = await page.evaluate((h) => new Date(`${h}T12:00:00`).toLocaleDateString("es-PY", { day: "2-digit", month: "short" }), hoy);
      await c.expect(fila.getByRole("cell").nth(3), "La fecha de envío de Laboratorios tiene que ser la cargada").toHaveText(diaCargado);
      await c.expect(tarjeta(main.getByText("Vencidas", { exact: true }))).toHaveText(/Vencidas\s*0/);

      const avanzar = fila.getByRole("button", { name: /^En proceso/ });
      const pastillas = main.getByRole("button", { name: "Todos", exact: true }).locator("xpath=..");
      await c.foto("avanzar", { resaltar: [avanzar, fila.getByRole("button", { name: "Editar notas" })], recorte: [pastillas, fila], margen: 6 });

      // Sin captura: con un «Profesional» elegido, la tabla muestra el nombre tal como está cargado (antes salía «Dr. Dra. Sofía Benítez»).
      await nueva.click();
      const conProfesional = page.getByRole("dialog", { name: "Nueva orden de laboratorio" });
      await conProfesional.getByLabel("Paciente").selectOption({ label: "Juan Ríos" });
      await conProfesional.getByLabel("Profesional").selectOption({ label: "Dra. Sofía Benítez" });
      await conProfesional.getByLabel("Laboratorio *").fill("LaboDent");
      await conProfesional.getByLabel("Tipo de trabajo *").fill("Férula");
      await conProfesional.getByRole("button", { name: "Crear orden" }).click();
      const filaFerula = main.getByRole("row").filter({ hasText: "Férula" });
      await c.expect(filaFerula.getByText("Dra. Sofía Benítez")).toBeVisible();
      await c.expect(filaFerula.getByText("Dr. Dra.")).toHaveCount(0);
    },
  },

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    id: "registrar-la-esterilizacion",
    capitulo: "admin",
    titulo: "Registrar un ciclo de esterilización",
    roles: ["admin"],
    paraQue: "Después de cada ciclo del autoclave (o de otro método), para dejar constancia de qué instrumental se esterilizó, con qué lote y con qué resultado de los controles.",
    pasos: [
      { texto: "Entrá a **Administración › Esterilización**. Arriba ves el último ciclo, cuántos indicadores biológicos siguen pendientes y cuántos ciclos salieron no conformes. Tocá «Nuevo ciclo».", captura: "lista" },
      { texto: "Completá la **Fecha y hora**, el **Responsable** y el **Método** (Autoclave (vapor), Calor seco o Químico), con su **Temperatura (°C)**.", captura: "metodo" },
      { texto: "Anotá la **Carga / instrumental** (qué se esterilizó), el **N.º de ciclo** y el **Lote**.", captura: "carga" },
      { texto: "Marcá el **Indicador químico** (Conforme o No conforme) y el **Indicador biológico (espora)**: queda «Pendiente» hasta que llegue el resultado. Tocá «Guardar ciclo».", captura: "indicadores" },
      { texto: "Cuando llegue el resultado del indicador biológico, tocá el lápiz de ese ciclo, cambialo a «Conforme» o «No conforme» y guardá.", captura: "editar" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Si algún ciclo queda «No conforme», aparece un aviso rojo arriba: “Hay ciclos con indicador no conforme: revisá el instrumental antes de usarlo”." },
      { tipo: "ojo", texto: "Los tres cuadros de arriba cuentan todos los ciclos de la clínica, no solo los del mes elegido en el selector. El tachito de la fila pide confirmación y borra el ciclo sin posibilidad de deshacerlo." },
      { tipo: "revisar", texto: "Confirmar con la clínica si este registro alcanza para lo que le exige la autoridad sanitaria (por ejemplo, cada cuánto se hace el indicador biológico): el sistema no controla plazos." },
      { tipo: "revisar", texto: "La pantalla figura solo en el menú del administrador, pero los ciclos de ejemplo están a nombre de la asistente. Confirmar quién la carga en la práctica." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app/esterilizacion");
      const main = page.locator("main");
      await revelarTodo(page);
      const nuevo = main.getByRole("button", { name: "Nuevo ciclo" });
      const tiles = [tarjeta(main.getByText("Último ciclo", { exact: true })), tarjeta(main.getByText("Ciclos no conformes", { exact: true }))];
      await c.foto("lista", { resaltar: nuevo, recorte: [cabecera(main, "Esterilización"), ...tiles], margen: 6 });

      await nuevo.click();
      const modal = page.getByRole("dialog", { name: "Nuevo ciclo de esterilización" });
      await modal.getByLabel("Responsable").selectOption({ label: "Paola Asistente" });
      await modal.getByLabel("Método").selectOption({ label: "Autoclave (vapor)" });
      await soltar(page);
      await c.foto("metodo", { resaltar: [modal.getByLabel("Fecha y hora"), modal.getByLabel("Responsable"), modal.getByLabel("Método"), modal.getByLabel("Temperatura (°C)")], recorte: modal, margen: 4, alto: 900 });

      await modal.getByLabel("Carga / instrumental").fill("Instrumental de examen ×6 sets y kit de endodoncia");
      await modal.getByLabel("N.º de ciclo").fill("A-1044");
      await modal.getByLabel("Lote").fill("L-2026-120");
      await soltar(page);
      await c.foto("carga", { resaltar: [modal.getByLabel("Carga / instrumental"), modal.getByLabel("N.º de ciclo"), modal.getByLabel("Lote")], recorte: modal, margen: 4, alto: 900 });

      await c.foto("indicadores", { resaltar: [modal.getByLabel("Indicador químico"), modal.getByLabel("Indicador biológico"), modal.getByRole("button", { name: "Guardar ciclo" })], recorte: modal, margen: 4, alto: 900 });
      await modal.getByRole("button", { name: "Guardar ciclo" }).click();

      const fila = main.getByRole("row").filter({ hasText: "A-1044" });
      await c.expect(fila).toBeVisible();
      await soltar(page);
      await c.foto("editar", { resaltar: [fila.getByText("Pendiente"), fila.getByRole("button", { name: "Editar" })], recorte: [fila, main.getByRole("columnheader", { name: "Fecha" })], margen: 0 });

      // Sin captura: llega el resultado del biológico y se edita el ciclo. «No conforme» prende el aviso rojo y suma a los no conformes.
      const noConformes = tarjeta(main.getByText("Ciclos no conformes", { exact: true }));
      const antes = Number((await noConformes.innerText()).replace(/\D/g, ""));
      await fila.getByRole("button", { name: "Editar" }).click();
      const edicion = page.getByRole("dialog", { name: "Editar ciclo de esterilización" });
      await edicion.getByLabel("Indicador biológico").selectOption({ label: "No conforme" });
      await edicion.getByRole("button", { name: "Guardar ciclo" }).click();
      await c.expect(main.getByText("Hay ciclos con indicador no conforme")).toBeVisible();
      await c.expect(noConformes).toContainText(String(antes + 1));
      // Los cuadros de arriba cuentan todos los ciclos: con otro mes elegido en el selector siguen igual.
      const selectorMes = main.locator("input[type=month]");
      const mesActual = await selectorMes.inputValue();
      await selectorMes.fill("2025-01");
      await c.expect(main.getByText("Sin ciclos este mes")).toBeVisible();
      await c.expect(noConformes).toContainText(String(antes + 1));
      await selectorMes.fill(mesActual);
      // El tachito pide confirmación.
      c.expect(await abrioConfirmacion(page, () => fila.getByRole("button", { name: "Eliminar" }).click())).toBe(true);
      await c.expect(fila).toBeVisible();
    },
  },

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    id: "liquidar-a-los-profesionales",
    capitulo: "admin",
    titulo: "Liquidar a los profesionales",
    roles: ["admin"],
    paraQue: "Al cerrar el período (por lo general, el mes) para calcular cuánto le corresponde a cada profesional por su producción y su comisión, y llevar el registro de lo liquidado y de lo pagado.",
    antes: [
      "La clínica tiene el plan Clínica o Multi.",
      "Cada profesional tiene cargado su porcentaje de comisión, en **Administración › Usuarios y profesionales**.",
    ],
    pasos: [
      { texto: "Entrá a **Administración › Liquidaciones**. Elegí el período con **Desde** y **Hasta**; al entrar viene el mes en curso. Arriba ves las comisiones del período, lo que queda pendiente de pago y cuántas liquidaciones hay en el histórico.", captura: "periodo" },
      { texto: "En **Producción por profesional** aparece una fila por profesional con su **Producción**, el **% Comisión**, el **Sueldo base** y lo **A liquidar**, que es el sueldo base más la producción por el porcentaje.", captura: "tabla" },
      { texto: "La **Producción** sale de las citas del profesional que quedaron en estado «Atendido» dentro del período: suma el importe de cada cita menos su descuento. Abajo de cada monto dice «calc.» con la cifra calculada." },
      { texto: "Si hace falta ajustar algo, cambiá la **Producción**, el **% Comisión** o el **Sueldo base** de esa fila: lo **A liquidar** se recalcula al instante.", captura: "ajuste" },
      { texto: "Cuando los números estén bien, tocá «Liquidar» en la fila del profesional. La liquidación queda en **Historial de liquidaciones** como «Pendiente».", captura: "historial" },
      { texto: "Cuando le pagues, tocá «Marcar pagado»: la liquidación pasa a «Liquidado» y queda la fecha del pago.", captura: "pagado" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Revisá los números antes de tocar «Liquidar»: una liquidación hecha no se puede editar ni borrar desde la pantalla." },
      { tipo: "ojo", texto: "«Marcar pagado» solo deja constancia: no genera un gasto ni mueve la caja. Si querés que el pago figure en los reportes, cargalo como gasto de la categoría «Sueldos»: [[cargar-un-gasto]]." },
      { tipo: "ojo", texto: "El porcentaje viene de la ficha del profesional, pero el sueldo base no se guarda en ninguna ficha: lo que escribas en la fila vale solo para esa liquidación." },
      { tipo: "ojo", texto: "Esta producción (citas atendidas) no es la de «Producción y comisiones por profesional» del Panel de desempeño, que mide lo cobrado en 30 días: [[leer-el-panel-de-desempeno]]. Las dos cifras pueden ser distintas." },
      { tipo: "ojo", texto: "Las citas que se dan desde «Dar cita» se guardan con importe 0: en una clínica real la columna «Producción» puede salir en 0 (y con 0 a liquidar el botón «Liquidar» queda apagado). Escribí el monto a mano en esa fila antes de liquidar." },
      { tipo: "revisar", texto: "La producción de la liquidación se calcula con el importe de las citas atendidas. Confirmar con Novum cómo debe calcularse: por tratamientos realizados, por lo cobrado o por el importe de la cita." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app/liquidaciones");
      const hoy = await hoyLocal(page);
      const main = page.locator("main");
      await revelarTodo(page);
      // La demo siembra sus citas en la semana en curso: el período es esa semana, de lunes a domingo (si no, un mes que
      // empieza a mitad de semana dejaría la producción en cero).
      const lunes = lunesDe(hoy);
      const desde = main.getByLabel("Desde");
      const hasta = main.getByLabel("Hasta");
      await desde.fill(lunes);
      await hasta.fill(sumarDias(lunes, 6));
      await soltar(page);
      const kpis = tarjeta(main.getByText("Comisiones del período", { exact: true }));
      await c.foto("periodo", { resaltar: [desde, hasta], recorte: [cabecera(main, "Liquidaciones"), tarjeta(main.getByText("Histórico", { exact: true })), kpis], margen: 8, esperar: 800 });

      const tabla = tarjeta(main.getByRole("heading", { name: "Producción por profesional" }));
      await c.foto("tabla", { resaltar: tabla.getByRole("row").first(), recorte: tabla });

      const filaSofia = main.getByRole("row").filter({ hasText: "Dra. Sofía Benítez" }).first();
      await filaSofia.getByTitle("% de comisión sobre producción").fill("35");
      await soltar(page);
      await c.foto("ajuste", { resaltar: [filaSofia.getByTitle("% de comisión sobre producción"), filaSofia.getByText(/^Gs [\d.]+$/).last()], recorte: [main.getByRole("heading", { name: "Producción por profesional" }), filaSofia], margen: 8 });

      await filaSofia.getByRole("button", { name: "Liquidar" }).click();
      const historial = tarjeta(main.getByRole("heading", { name: "Historial de liquidaciones" }));
      await c.expect(historial.getByRole("button", { name: "Marcar pagado" })).toBeVisible();
      await soltar(page);
      await c.foto("historial", { resaltar: historial.getByText("Pendiente", { exact: true }).last(), recorte: historial });

      const gastosAntes = (await leerDemo(page)).expenses.length;
      await historial.getByRole("button", { name: "Marcar pagado" }).click();
      await soltar(page);
      await c.foto("pagado", { resaltar: historial.getByText("Liquidado", { exact: true }), recorte: historial });

      // Sin captura: «Marcar pagado» deja la fecha de pago pero no crea un gasto; y la liquidación hecha ya no tiene botones.
      await c.expect.poll(async () => (await leerDemo(page)).settlements.filter((s: { status: string; paidAt?: string }) => s.status === "liquidado" && s.paidAt).length).toBe(1);
      c.expect((await leerDemo(page)).expenses.length).toBe(gastosAntes);
      await c.expect(historial.getByRole("button")).toHaveCount(0);
      // Con 0 a liquidar el botón «Liquidar» queda apagado.
      await filaSofia.getByTitle("Producción del período (editable)").fill("0");
      await filaSofia.getByTitle("Sueldo base del período (salario fijo / mixto)").fill("0");
      await c.expect(filaSofia.getByRole("button", { name: "Liquidar" })).toBeDisabled();
    },
  },

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    id: "sacar-un-reporte-en-excel",
    capitulo: "admin",
    titulo: "Sacar un reporte en Excel",
    roles: ["admin"],
    paraQue: "Cuando necesitás los números en una planilla: para el contador, para cruzar datos por tu cuenta o para guardar una copia.",
    antes: ["La clínica tiene el plan Clínica o Multi: con el plan Solo, Reportes no está disponible."],
    pasos: [
      { texto: "Entrá a **Reportes › Reportes Excel**. Los botones están agrupados: **Finanzas** (Pagos, Gastos, Presupuestos), **Pacientes** (Pacientes, Citas), **Inventario**, **Laboratorios** y **Nóminas** (Comisiones).", captura: "reportes" },
      { texto: "Tocá el botón del reporte que necesitás: el navegador baja un archivo con ese nombre (por ejemplo, pagos.csv).", captura: "descarga" },
      { texto: "Para las tareas de gestión, elegí primero el rango en **Desde** y **Hasta** (viene el mes en curso). Tocá «Tareas de gestión generadas en un período de tiempo» para las que se crearon en esas fechas, o «Tareas de gestión a vencer en un período de tiempo» para las que vencen en esas fechas. Si «Desde» queda después de «Hasta», los dos botones se apagan.", captura: "tareas" },
      { texto: "Abrí el archivo con Excel o con tu planilla habitual. Viene en UTF-8 y con las columnas separadas por punto y coma (;)." },
      { texto: "Cada reporte gráfico baja su propia tabla, con el rango que elegiste, con el botón «Descargar CSV»: mirá [[leer-el-panel-de-desempeno]].", captura: "grafico" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Pagos, Gastos, Presupuestos, Pacientes, Citas, Inventario y Laboratorios bajan todo el historial de la clínica: no se pueden filtrar por fecha antes de descargar. Filtralos en la planilla." },
      { tipo: "ojo", texto: "El archivo de Pacientes trae documento, teléfono y correo, y el de Pagos trae montos y nombres. Guardalos en un lugar seguro." },
      { tipo: "ojo", texto: "«Comisiones» usa lo cobrado en los últimos 30 días (igual que el Panel de desempeño), no los números de Liquidaciones: [[liquidar-a-los-profesionales]]." },
      { tipo: "revisar", texto: "Los archivos son CSV, no .xlsx, y no se probó abrirlos en Excel ni en Google Sheets: confirmar si la clínica espera un Excel con formato." },
      { tipo: "revisar", texto: "En el archivo de Citas la columna «Estado» trae el código interno (por ejemplo, completada) y no el nombre que se ve en la agenda. Confirmar con Novum si la clínica prefiere el nombre." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app/reportes");
      const main = page.locator("main");
      const pestana = page.getByRole("button", { name: "Reportes Excel" });
      await pestana.click();
      await revelarTodo(page);
      const grupo = tarjeta(main.getByRole("heading", { name: "Reportes descargables (Excel)" }));
      await c.foto("reportes", { resaltar: pestana, recorte: [pestana.locator("xpath=.."), grupo], margen: 8 });

      const pagos = main.getByRole("button", { name: "Pagos", exact: true });
      const [descarga] = await Promise.all([page.waitForEvent("download"), pagos.click()]);
      c.expect(descarga.suggestedFilename()).toBe("pagos.csv");
      const contenido = await textoDe(descarga);
      c.expect(contenido.charCodeAt(0)).toBe(0xfeff); // la marca que hace que Excel lo abra en UTF-8
      c.expect(contenido.split("\n")[0]).toContain('"Fecha";"Paciente";"Concepto"'); // columnas separadas por punto y coma
      await soltar(page);
      await c.foto("descarga", { resaltar: pagos, recorte: [main.getByRole("heading", { name: "Reportes descargables (Excel)" }), main.getByText(/^CSV con codificación UTF-8/), main.getByRole("button", { name: "Presupuestos", exact: true }), pagos], margen: 8 });

      // Sin captura: el archivo de Citas trae la hora de la clínica (la cita de las 09:00 figura a las 09:00) y el estado como código interno.
      const [descargaCitas] = await Promise.all([page.waitForEvent("download"), main.getByRole("button", { name: "Citas", exact: true }).click()]);
      const citas = await textoDe(descargaCitas);
      c.expect(citas).toContain('"09:00";"María González"');
      c.expect(citas).toContain('"confirmada"');
      await soltar(page);

      const generadas = main.getByRole("button", { name: "Tareas de gestión generadas en un período de tiempo" });
      const aVencer = main.getByRole("button", { name: "Tareas de gestión a vencer en un período de tiempo" });
      const bloqueCrm = main.getByText("CRM", { exact: true }).locator("xpath=..");
      await c.foto("tareas", { resaltar: bloqueCrm, recorte: bloqueCrm, margen: 8 });

      // Sin captura: los dos reportes de tareas llevan el rango en el nombre del archivo, y un rango al revés apaga los botones.
      const [porFecha] = await Promise.all([page.waitForEvent("download"), generadas.click()]);
      c.expect(porFecha.suggestedFilename()).toMatch(/^tareas-generadas_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
      const [porVencer] = await Promise.all([page.waitForEvent("download"), aVencer.click()]);
      c.expect(porVencer.suggestedFilename()).toMatch(/^tareas-a-vencer_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
      await main.getByLabel("Desde").fill("2099-01-01");
      await c.expect(main.getByText(/Elegí un rango válido/)).toBeVisible();
      await c.expect(generadas).toBeDisabled();
      await c.expect(aVencer).toBeDisabled();

      await page.getByRole("button", { name: "Reportes gráficos" }).click();
      await revelarTodo(page);
      const csv = main.getByRole("button", { name: "Descargar CSV" });
      await c.foto("grafico", { resaltar: csv, recorte: tarjeta(csv), margen: 8 });
      const [descargaGrafico] = await Promise.all([page.waitForEvent("download"), csv.click()]);
      c.expect(descargaGrafico.suggestedFilename()).toMatch(/^resultados_\d{4}-\d{2}_\d{4}-\d{2}\.csv$/);
    },
  },

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    id: "registrar-el-retiro-de-residuos",
    capitulo: "admin",
    titulo: "Registrar el retiro de residuos",
    roles: ["admin"],
    paraQue: "Cada vez que la empresa recolectora retira los residuos de la clínica, para dejar anotado qué se entregó, cuántos kilos y con qué manifiesto.",
    pasos: [
      { texto: "Entrá a **Administración › Registro ambiental**. Arriba ves el **Total del mes** en kilos y cuántos son **Residuos peligrosos**. Tocá «Nuevo registro».", captura: "lista" },
      { texto: "Elegí el **Tipo de residuo**: Biológico / infeccioso, Cortopunzante, Químico, Anatomopatológico, Común / no peligroso o Reciclable. Escribí la **Cantidad (kg)** y elegí el **Responsable**.", captura: "tipo" },
      { texto: "Anotá el **Gestor / empresa recolectora** y el **N.º de manifiesto / acta** que te entregó la empresa. La **Fecha y hora** viene con el momento actual: cambiala si cargás un retiro anterior.", captura: "gestor" },
      { texto: "Tocá «Guardar registro». Queda en la tabla y suma al total del mes.", captura: "resultado" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Los **Residuos peligrosos** suman todo lo que no sea «Común / no peligroso» ni «Reciclable»." },
      { tipo: "ojo", texto: "La cantidad tiene que ser mayor que 0: si no, «Guardar registro» no hace nada. El tachito de la fila pide confirmación y borra el registro sin posibilidad de deshacerlo." },
      { tipo: "tip", texto: "Si la empresa retira dos tipos de residuo en la misma visita con el mismo manifiesto, cargá un registro por tipo." },
      { tipo: "revisar", texto: "La pantalla solo guarda el número de manifiesto, no el documento escaneado. Confirmar si la clínica necesita adjuntarlo. Y, como en Esterilización, confirmar quién la carga: figura solo en el menú del administrador." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app/ambiental");
      const main = page.locator("main");
      await revelarTodo(page);
      const nuevo = main.getByRole("button", { name: "Nuevo registro" });
      const tiles = [tarjeta(main.getByText("Total del mes", { exact: true })), tarjeta(main.getByText("Residuos peligrosos", { exact: true }))];
      await c.foto("lista", { resaltar: nuevo, recorte: [cabecera(main, "Registro ambiental"), ...tiles], margen: 6 });

      await nuevo.click();
      const modal = page.getByRole("dialog", { name: "Nuevo registro ambiental" });
      await modal.getByLabel("Tipo de residuo").selectOption({ label: "Biológico / infeccioso" });
      await modal.getByLabel("Cantidad (kg)").fill("2.8");
      await modal.getByLabel("Responsable").selectOption({ label: "Paola Asistente" });
      await soltar(page);
      await c.foto("tipo", { resaltar: [modal.getByLabel("Tipo de residuo"), modal.getByLabel("Cantidad (kg)"), modal.getByLabel("Responsable")], recorte: modal, margen: 4, alto: 900 });

      await modal.getByLabel("Gestor / empresa recolectora").fill("EcoGestión Residuos S.A.");
      await modal.getByLabel("N.º de manifiesto / acta").fill("ACT-2026-0461");
      await soltar(page);
      await c.foto("gestor", { resaltar: [modal.getByLabel("Gestor / empresa recolectora"), modal.getByLabel("N.º de manifiesto / acta"), modal.getByRole("button", { name: "Guardar registro" })], recorte: modal, margen: 4, alto: 900 });
      await modal.getByRole("button", { name: "Guardar registro" }).click();

      const fila = main.getByRole("row").filter({ hasText: "ACT-2026-0461" });
      await c.expect(fila).toBeVisible();
      await soltar(page);
      await c.foto("resultado", { resaltar: fila, recorte: [fila, main.getByRole("columnheader", { name: "Fecha" }), tiles[0]], margen: 2 });

      // Sin captura: sin cantidad (o con 0) «Guardar registro» no hace nada, y el tachito pide confirmación.
      const registros = (await leerDemo(page)).environmentalLogs.length;
      await nuevo.click();
      const vacio = page.getByRole("dialog", { name: "Nuevo registro ambiental" });
      await vacio.getByRole("button", { name: "Guardar registro" }).click();
      await vacio.getByLabel("Cantidad (kg)").fill("0");
      await vacio.getByRole("button", { name: "Guardar registro" }).click();
      await c.expect(vacio).toBeVisible();
      c.expect((await leerDemo(page)).environmentalLogs.length).toBe(registros);
      await vacio.getByRole("button", { name: "Cancelar" }).click();
      c.expect(await abrioConfirmacion(page, () => fila.getByRole("button", { name: "Eliminar" }).click())).toBe(true);
      await c.expect(fila).toBeVisible();
    },
  },

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    id: "armar-una-encuesta-y-leer-el-nps",
    capitulo: "admin",
    titulo: "Armar una encuesta y leer el NPS",
    roles: ["admin"],
    paraQue: "Para saber qué opinan los pacientes: armás una encuesta de satisfacción o de recomendación (NPS), le pasás el link al paciente y leés las respuestas en esta misma pantalla.",
    pasos: [
      { texto: "Entrá a **CRM › Encuestas y NPS** y tocá «Nueva encuesta». A la izquierda están las encuestas que ya hay, con su cantidad de respuestas.", captura: "lista" },
      { texto: "Escribí el **Título** y elegí el **Tipo**: «Satisfacción» (puntajes de 1 a 5) o «NPS» (una pregunta de 0 a 10: ¿qué tan probable es que nos recomiende?).", captura: "formulario" },
      { texto: "Armá las preguntas. Con «+ Puntaje», «+ NPS» o «+ Texto» sumás una; en cada una escribís lo que va a leer el paciente y elegís el **Tipo de respuesta**. Tocá «Guardar encuesta».", captura: "preguntas" },
      { texto: "Tocá «Copiar link» en la tarjeta de la encuesta y mandáselo al paciente (por WhatsApp o correo). Lo abre sin usuario ni contraseña, responde y toca «Enviar respuesta».", captura: "link" },
      { texto: "Las respuestas se leen a la derecha, al elegir la encuesta. En una de tipo NPS ves el **NPS**, cuántos son promotores, pasivos y detractores, y los **Comentarios** con el nombre de quien los dejó.", captura: "resultados" },
      { texto: "En una de Satisfacción, cada pregunta de puntaje muestra el promedio de las respuestas, de 1 a 5.", captura: "satisfaccion" },
    ],
    avisos: [
      { tipo: "ojo", texto: "El NPS es el porcentaje de promotores (notas 9 y 10) menos el porcentaje de detractores (0 a 6): los pasivos (7 y 8) no suman ni restan. Va de −100 a 100; el número sale en verde desde 50, en ámbar de 0 a 49 y en rojo si es negativo." },
      { tipo: "ojo", texto: "Esta NPS no es la misma que la tarjeta «Encuestas NPS» del Panel de desempeño: aquella la recoge Botika por WhatsApp (mirá [[conectar-las-integraciones]]) y esta, los links que mandás vos." },
      { tipo: "ojo", texto: "El tachito de la encuesta pide confirmación y la borra sin posibilidad de deshacerlo." },
      { tipo: "tip", texto: "Usá una sola pregunta de «Texto abierto» por encuesta, para los comentarios." },
      { tipo: "revisar", texto: "No se pudo probar el link público: en la demo la página del paciente responde “Servidor no configurado”. Por el código, el paciente ve el nombre de la clínica, las preguntas y un campo de nombre opcional; una encuesta «Inactiva» no acepta respuestas, y si hay varias preguntas de «Texto abierto» solo se guarda el comentario de la primera. Verificarlo con una clínica real." },
    ],
    capturar: async (c) => {
      const { page } = c;
      // Copiar el link usa el portapapeles del navegador: en la corrida de capturas hay que darle permiso (en la clínica lo da el clic).
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await c.entrar("admin", "/app/encuestas");
      const main = page.locator("main");
      await revelarTodo(page);
      const nueva = main.getByRole("button", { name: "Nueva encuesta" });
      const tarjetaDe = (titulo: string) => main.getByText(titulo, { exact: true }).first().locator("xpath=ancestor::div[@role='button'][1]");
      await c.foto("lista", { resaltar: nueva, recorte: [cabecera(main, "Encuestas y NPS"), tarjetaDe("Encuesta de satisfacción"), tarjeta(main.getByRole("heading", { name: "¿Nos recomendarías?", level: 3 }))], margen: 6 });

      await nueva.click();
      const modal = page.getByRole("dialog", { name: "Nueva encuesta" });
      await modal.getByLabel("Título").fill("¿Cómo fue tu visita?");
      const tipo = modal.locator("select").first();
      await tipo.selectOption({ label: "Satisfacción" });
      await soltar(page);
      await c.foto("formulario", { resaltar: [modal.getByLabel("Título"), tipo], recorte: modal, margen: 4, alto: 900 });

      await modal.getByRole("textbox", { name: "Texto de la pregunta" }).first().fill("Atención del personal");
      await modal.getByRole("button", { name: "+ Puntaje" }).click();
      await modal.getByRole("textbox", { name: "Texto de la pregunta" }).nth(2).fill("Puntualidad de la cita");
      await soltar(page);
      await c.foto("preguntas", { resaltar: [modal.getByRole("button", { name: "+ Puntaje" }), modal.getByRole("button", { name: "+ NPS" }), modal.getByRole("button", { name: "+ Texto" }), modal.getByRole("button", { name: "Guardar encuesta" })], recorte: modal, margen: 4, alto: 1000 });
      await modal.getByRole("button", { name: "Guardar encuesta" }).click();

      const nuevaTarjeta = tarjetaDe("¿Cómo fue tu visita?");
      await c.expect(nuevaTarjeta).toBeVisible();
      await nuevaTarjeta.getByRole("button", { name: /Copiar link/ }).click();
      await c.expect(nuevaTarjeta.getByText("Copiado")).toBeVisible();
      c.expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/encuestas\/cl_demo\/sv_\d+$/);
      await c.foto("link", { resaltar: nuevaTarjeta.getByText("Copiado"), recorte: nuevaTarjeta, esperar: 50 });
      await page.waitForTimeout(1800); // que el «Copiado» vuelva a «Copiar link» antes de las capturas que siguen

      await tarjetaDe("¿Nos recomendarías?").click();
      const detalle = tarjeta(main.getByRole("heading", { name: "¿Nos recomendarías?", level: 3 }));
      await soltar(page);
      await c.foto("resultados", {
        resaltar: [
          detalle.getByText(/NPS · \d+ respuestas/).locator("xpath=.."),
          detalle.getByText("Promotores (9-10)").locator("xpath=ancestor::div[contains(@class,'space-y-3')][1]"),
          detalle.getByText("Comentarios", { exact: true }).locator("xpath=.."),
        ],
        recorte: [cabecera(main, "Encuestas y NPS"), detalle],
        margen: 6,
      });

      await tarjetaDe("Encuesta de satisfacción").click();
      const detalleSat = tarjeta(main.getByRole("heading", { name: "Encuesta de satisfacción", level: 3 }));
      await soltar(page);
      await c.foto("satisfaccion", { resaltar: detalleSat.getByText(/ \/ 5$/).first().locator("xpath=ancestor::div[contains(@class,'space-y-3')][1]"), recorte: detalleSat, margen: 6 });
    },
  },

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    id: "asignar-box-y-sillones",
    capitulo: "admin",
    titulo: "Asignar box y sillones",
    roles: ["admin"],
    paraQue: "Para que cada cita tenga su sillón: se crean los boxes de la clínica y se le asigna uno a las citas que todavía no lo tienen, así no se pisan dos pacientes en el mismo lugar.",
    antes: ["La clínica tiene el plan Clínica o Multi: con el plan Solo, Box / Sillones no está disponible."],
    pasos: [
      { texto: "Entrá a **Administración › Box / Sillones**. Arriba están los sillones configurados (**Box 1**, **Box 2**…). Para sumar uno, tocá «Nuevo box».", captura: "boxes" },
      { texto: "Escribí el **Nombre del box**, elegí un **Color identificador** y tocá «Crear box». Con el lápiz de cada box cambiás el nombre o el color.", captura: "nuevo" },
      { texto: "Elegí el día con las flechas o con «Hoy». Cada columna es un box, con las citas que tiene ese día por hora.", captura: "dia" },
      { texto: "En **Sin box asignado** están las citas del día que todavía no tienen sillón. En cada una, elegí el box en el desplegable «Asignar a…».", captura: "asignar" },
      { texto: "La cita pasa a la columna de ese box.", captura: "asignada" },
    ],
    avisos: [
      { tipo: "ojo", texto: "El tachito de un box pide confirmación y avisa cuántas citas lo tienen. Esas citas no se borran: pasan a **Sin box asignado** y se les elige otro sillón desde ahí." },
      { tipo: "ojo", texto: "Desde esta pantalla una cita se asigna una sola vez: no hay botón para cambiarla de box. Para cambiarlo, en la agenda tocá «Acciones de la cita › Editar» y elegí otro **Box**: mirá [[reprogramar-una-cita]]." },
      { tipo: "tip", texto: "Cuando la recepción da una cita con [[dar-una-cita]], elige el box ahí mismo y el sistema no ofrece un horario en el que ese box ya está ocupado. Las reservas online entran sin box: aparecen acá, en «Sin box asignado»." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app/box");
      const main = page.locator("main");
      await revelarTodo(page);
      const nuevo = main.getByRole("button", { name: "Nuevo box" });
      const sillones = tarjeta(main.getByRole("heading", { name: "Sillones configurados" }));
      await c.foto("boxes", { resaltar: nuevo, recorte: [cabecera(main, "Box / Sillones"), sillones], margen: 6 });

      await nuevo.click();
      const modal = page.getByRole("dialog", { name: "Nuevo box" });
      await modal.getByLabel("Nombre del box").fill("Box 4");
      await modal.getByRole("button", { name: "Verde" }).click();
      await soltar(page);
      const colores = modal.getByRole("button", { name: "Verde" }).locator("xpath=..");
      await c.foto("nuevo", { resaltar: [modal.getByLabel("Nombre del box"), colores, modal.getByRole("button", { name: "Crear box" })], recorte: modal, margen: 4 });
      await modal.getByRole("button", { name: "Crear box" }).click();
      await c.expect(main.getByText("Box 4").first()).toBeVisible();

      // La demo siembra sus citas en la semana en curso: se va al miércoles de esa semana, que tiene citas sin box (hoy puede no tenerlas).
      const dow = await page.evaluate(() => (new Date().getDay() + 6) % 7);
      const diff = 2 - dow;
      for (let i = 0; i < Math.abs(diff); i++) await main.getByRole("button", { name: diff > 0 ? "Día siguiente" : "Día anterior" }).click();
      await c.expect(main.getByText("Sin box asignado").first()).toBeVisible();
      await soltar(page);
      const grupoDia = main.getByRole("button", { name: "Día anterior" }).locator("xpath=..");
      const filaDia = grupoDia.locator("xpath=..");
      const cabezas = main.getByText(/^\d+ citas?$/);
      const columnas = [tarjeta(cabezas.first()), tarjeta(cabezas.last())];
      await c.foto("dia", { resaltar: grupoDia, recorte: [filaDia, ...columnas], margen: 6 });

      const sinBox = tarjeta(main.getByRole("heading", { name: "Sin box asignado" }));
      const selector = sinBox.locator("select").first();
      await c.foto("asignar", { resaltar: selector, recorte: sinBox, margen: 8 });
      await selector.selectOption({ label: "Box 4" });
      const columna = tarjeta(main.getByText("1 cita", { exact: true }));
      await c.expect(columna).toBeVisible();
      await soltar(page);
      await c.foto("asignada", { resaltar: columna, recorte: [columna, sinBox], margen: 8 });

      // Sin captura: el lápiz del box abre «Editar box»; el tachito pide confirmación y, al aceptar, las citas del box pasan a «Sin box asignado»;
      // «Hoy» vuelve al día de hoy.
      const citasEnTotal = main.getByText(/ en total$/);
      const total = await citasEnTotal.innerText();
      await main.getByRole("button", { name: "Editar Box 4" }).click();
      const edicion = page.getByRole("dialog", { name: "Editar box" });
      await c.expect(edicion.getByLabel("Nombre del box")).toHaveValue("Box 4");
      await edicion.getByLabel("Nombre del box").fill("Box 4 Cirugía");
      await edicion.getByRole("button", { name: "Guardar cambios" }).click();
      await c.expect(main.getByText("Box 4 Cirugía").first()).toBeVisible();
      c.expect(await abrioConfirmacion(page, () => main.getByRole("button", { name: "Eliminar Box 4 Cirugía" }).click())).toBe(true);
      await c.expect(main.getByText("Box 4 Cirugía").first()).toBeVisible();
      page.once("dialog", (d) => d.accept());
      await main.getByRole("button", { name: "Eliminar Box 4 Cirugía" }).click();
      await c.expect(main.getByText("Box 4 Cirugía")).toHaveCount(0);
      // La cita que tenía ese box sigue ahí, ahora en «Sin box asignado»; el total del día no baja.
      await c.expect(sinBox.getByText("Exodoncia 28").first()).toBeVisible();
      await c.expect(citasEnTotal).toHaveText(total);
      await main.getByRole("button", { name: "Hoy", exact: true }).click();
      const hoyEscrito = await page.evaluate(() => new Date().toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
      await c.expect(main.getByText(hoyEscrito, { exact: true })).toBeVisible();
    },
  },

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    id: "seguir-a-los-pacientes-en-el-crm",
    capitulo: "admin",
    titulo: "Seguir a los pacientes en el CRM",
    roles: ["admin", "cashier", "commercial", "receptionist"],
    paraQue: "Para no perder a los pacientes que están por decidirse o que dejaron de venir: un tablero de seguimiento por etapas, listas ya armadas de a quién contactar y campañas de mensajes.",
    antes: ["La clínica tiene el plan Multi (la demo lo tiene): con el plan Clínica, la pantalla CRM aparece bloqueada con el aviso “Este módulo no está incluido en tu Plan Clínica”."],
    pasos: [
      { texto: "Entrá a **CRM**. En la pestaña **Reportes** está el tablero: una columna por etapa (**Nuevo**, **Contactado**, **Presupuesto**, **Seguimiento**, **Ganado** y **Perdido**) con los pacientes que estás siguiendo.", captura: "tablero" },
      { texto: "Para sumar a un paciente, tocá «Nuevo en pipeline». Elegí el **Paciente**, la **Etapa**, escribí una **Nota** (por ejemplo, “Interesado en ortodoncia, llamar el martes”) y tocá «Agregar».", captura: "nuevo" },
      { texto: "A medida que avanza la conversación, pasá la tarjeta de etapa con las flechas «Etapa anterior» y «Etapa siguiente». Con el lápiz, **Editar nota**, cambiás la nota; con el tachito, **Quitar del pipeline**, la sacás del tablero.", captura: "tarjeta" },
      { texto: "Debajo del tablero hay listas ya armadas: **Oportunidades** (presupuestos presentados que esperan respuesta), **Reactivación** (pacientes sin próxima cita) y **Cumpleaños**. Con el botón «Pipeline» pasás a un paciente al tablero.", captura: "listas" },
      { texto: "En **Segmentar pacientes** combinás filtros (género, ciudad, edad, con deuda, sin cita futura) para armar una lista de destinatarios. El ícono verde de cada paciente abre WhatsApp con un saludo ya escrito." },
      { texto: "Para una campaña, tocá la pestaña «Campañas de Marketing» y «Nueva campaña». Elegí el **Canal**, escribí el **Mensaje** y tocá «Guardar campaña». En las de correo, «Elegir destinatarios» arma la lista y «Abrir borrador» abre el mensaje en tu programa de correo.", captura: "campana" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Novudent no envía mensajes ni correos masivos desde acá: la campaña guarda el texto, el correo se abre como borrador (hasta 30 destinatarios) y el WhatsApp se manda a mano desde el ícono verde. «Registrar envío externo» solo deja constancia." },
      { tipo: "ojo", texto: "Quitar una tarjeta del tablero y eliminar una campaña no piden confirmación." },
      { tipo: "ojo", texto: "Recepcionista y Recepción y caja también usan el CRM, pero la recepcionista no ve montos: no le aparecen el valor de las oportunidades ni el filtro «Con deuda»." },
      { tipo: "tip", texto: "Las pestañas «Plantillas» y «Configuración» son informativas: muestran mensajes de ejemplo con variables como {paciente} y las etapas del tablero, sin opciones para editar. Los recordatorios automáticos se editan en [[conectar-las-integraciones]]." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app/crm");
      const main = page.locator("main");
      await revelarTodo(page);
      const columnas = main.getByText(/^(Nuevo|Contactado|Presupuesto|Seguimiento|Ganado|Perdido)$/);
      const nuevo = main.getByRole("button", { name: "Nuevo en pipeline" });
      await c.foto("tablero", { resaltar: nuevo, recorte: [cabecera(main, "CRM"), columnas.first().locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]"), columnas.last().locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")], margen: 6 });

      await nuevo.click();
      const modal = page.getByRole("dialog", { name: "Nuevo en pipeline" });
      await modal.getByLabel("Paciente").selectOption({ label: "Camila Ortega" });
      await modal.getByLabel("Etapa").selectOption({ label: "Contactado" });
      await modal.getByLabel("Nota").fill("Interesada en blanqueamiento, llamar el martes.");
      await c.foto("nuevo", { resaltar: [modal.getByLabel("Paciente"), modal.getByLabel("Etapa"), modal.getByLabel("Nota"), modal.getByRole("button", { name: "Agregar" })], recorte: modal, margen: 4 });
      await modal.getByRole("button", { name: "Agregar" }).click();

      const tarj = main.getByRole("link", { name: "Camila Ortega" }).first().locator("xpath=ancestor::div[contains(@class,'p-3')][1]");
      await c.expect(tarj).toBeVisible();
      await tarj.getByRole("button", { name: "Etapa siguiente" }).click();
      await revelarTodo(page);
      const movida = main.getByRole("link", { name: "Camila Ortega" }).first().locator("xpath=ancestor::div[contains(@class,'p-3')][1]");
      const columna = (l: Locator) => l.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
      await soltar(page);
      const controlesTarjeta = movida.getByRole("button", { name: "Etapa anterior" }).locator("xpath=..").locator("xpath=..");
      await c.foto("tarjeta", { resaltar: controlesTarjeta, recorte: [columna(columnas.first()), columna(columnas.last())], margen: 6 });

      const oportunidades = tarjeta(main.getByRole("heading", { name: "Oportunidades" }));
      const reactivacion = tarjeta(main.getByRole("heading", { name: "Reactivación" }));
      // «Reactivación» puede estar vacía (si todos los pacientes ya tienen su próxima cita, como un lunes a la mañana): se marca solo lo que hay.
      const botones = [oportunidades.getByRole("button", { name: /Pipeline/ }).first()];
      if (await reactivacion.getByRole("button", { name: /Pipeline/ }).count()) botones.push(reactivacion.getByRole("button", { name: /Pipeline/ }).first());
      await c.foto("listas", { resaltar: botones, recorte: [oportunidades, reactivacion] });

      // Sin captura: «Pipeline» pasa el presupuesto al tablero (y el botón queda en «En pipeline»).
      const conNota = main.getByText(/presentado el /);
      const tarjetasDePresupuesto = await conNota.count();
      const filaOportunidad = oportunidades.getByRole("listitem").filter({ has: page.getByRole("button", { name: /Pipeline/ }) }).first();
      const nombreOportunidad = (await filaOportunidad.getByRole("link").innerText()).split("\n")[0].trim();
      await filaOportunidad.getByRole("button", { name: /Pipeline/ }).click();
      await c.expect(oportunidades.getByRole("listitem").filter({ hasText: nombreOportunidad }).first().getByRole("button", { name: /En pipeline/ })).toBeDisabled();
      await c.expect(conNota).toHaveCount(tarjetasDePresupuesto + 1);
      // El lápiz de la tarjeta («Editar nota») cambia la nota, pero no el paciente; el tachito la saca sin preguntar.
      await movida.getByRole("button", { name: "Editar nota" }).click();
      const editarTarjeta = page.getByRole("dialog", { name: "Editar tarjeta" });
      await c.expect(editarTarjeta.getByLabel("Paciente")).toBeDisabled();
      await editarTarjeta.getByLabel("Nota").fill("Pidió precios, llamar el jueves.");
      await editarTarjeta.getByRole("button", { name: "Guardar" }).click();
      await c.expect(movida.getByText("Pidió precios, llamar el jueves.")).toBeVisible();
      c.expect(await abrioConfirmacion(page, () => movida.getByRole("button", { name: "Quitar del pipeline" }).click())).toBe(false);
      await c.expect(main.getByText("Pidió precios, llamar el jueves.")).toHaveCount(0);
      // «Segmentar pacientes»: «Con deuda» deja a menos pacientes, y el ícono verde abre WhatsApp con un saludo escrito.
      const segmentar = tarjeta(main.getByRole("heading", { name: "Segmentar pacientes" }));
      const cantidad = segmentar.getByText(/^\d+ pacientes?$/);
      const todos = Number((await cantidad.innerText()).replace(/\D/g, ""));
      await segmentar.getByLabel("Con deuda").check();
      await c.expect.poll(async () => Number((await cantidad.innerText()).replace(/\D/g, ""))).toBeLessThan(todos);
      await segmentar.getByLabel("Con deuda").uncheck();
      const whatsapp = segmentar.getByRole("link", { name: /Escribir por WhatsApp a/ }).first();
      c.expect(await whatsapp.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\d+\?text=Hola/);
      // Las pestañas «Plantillas» y «Configuración» solo muestran: no tienen campos.
      await main.getByRole("button", { name: "Plantillas", exact: true }).click();
      await c.expect(main.getByRole("heading", { name: "Plantillas de mensaje" })).toBeVisible();
      await c.expect(main.getByRole("link", { name: "Integraciones" })).toHaveAttribute("href", "/app/integraciones");
      c.expect(await main.locator("input, select, textarea").count()).toBe(0);
      await main.getByRole("button", { name: "Configuración", exact: true }).click();
      await c.expect(main.getByRole("heading", { name: "Configuración del embudo" })).toBeVisible();
      c.expect(await main.locator("input, select, textarea").count()).toBe(0);

      await main.getByRole("button", { name: "Campañas de Marketing" }).click();
      await main.getByRole("button", { name: "Nueva campaña" }).click();
      const camp = page.getByRole("dialog", { name: "Nueva campaña" });
      await camp.getByLabel("Nombre", { exact: true }).fill("Control semestral");
      await camp.getByLabel("Canal").selectOption({ label: "Email" });
      await camp.getByLabel("Audiencia").fill("Pacientes que no vienen hace más de 6 meses");
      await camp.getByLabel("Mensaje").fill("Hola {paciente} 👋 Te invitamos a tu control semestral. ¡Te esperamos!");
      await c.foto("campana", { resaltar: [camp.getByLabel("Nombre", { exact: true }), camp.getByLabel("Canal"), camp.getByLabel("Mensaje"), camp.getByRole("button", { name: "Guardar campaña" })], recorte: camp, margen: 4 });

      // Sin captura: la campaña queda de borrador; con destinatarios aparece «Abrir borrador» (un correo con copia oculta, que Novudent no envía);
      // «Registrar envío externo» pide confirmación y deja constancia; el tachito de la campaña borra sin preguntar.
      await camp.getByRole("button", { name: "Guardar campaña" }).click();
      const campania = main.getByText("Control semestral", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
      await c.expect(campania.getByText("Borrador · sin envío confirmado")).toBeVisible();
      await c.expect(campania.getByRole("link", { name: "Abrir borrador" })).toHaveCount(0);
      await campania.getByRole("button", { name: "Elegir destinatarios" }).click();
      const destinatarios = page.getByRole("dialog", { name: "Destinatarios · Control semestral" });
      await destinatarios.getByRole("checkbox").nth(0).check();
      await destinatarios.getByRole("checkbox").nth(1).check();
      await c.expect(destinatarios.getByText("2 seleccionados")).toBeVisible();
      await destinatarios.getByRole("button", { name: "Guardar destinatarios" }).click();
      const borrador = campania.getByRole("link", { name: "Abrir borrador" });
      await c.expect(borrador).toBeVisible();
      c.expect(await borrador.getAttribute("href")).toMatch(/^mailto:\?bcc=.+&subject=Control\+semestral&body=/);
      let tipoDialogo = "";
      page.once("dialog", async (d) => { tipoDialogo = d.type(); await d.accept(); });
      await campania.getByRole("button", { name: "Registrar envío externo" }).click();
      c.expect(tipoDialogo).toBe("confirm");
      await c.expect(campania.getByText(/✓ Envío declarado: 2/)).toBeVisible();
      await c.expect(campania.getByRole("button", { name: "Registrar envío externo" })).toHaveCount(0);
      c.expect(await abrioConfirmacion(page, () => campania.getByRole("button", { name: "Eliminar campaña" }).click())).toBe(false);
      await c.expect(main.getByText("Control semestral", { exact: true })).toHaveCount(0);
    },
  },

  /* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    id: "conectar-las-integraciones",
    capitulo: "admin",
    titulo: "Conectar las integraciones",
    roles: ["admin"],
    paraQue: "Para decidir qué mensajes automáticos de WhatsApp manda la clínica a través de Botika (confirmar citas, pedir la nota NPS, recordar un cobro) y para ver a qué pacientes se les mandó.",
    antes: ["La clínica tiene el plan Clínica o Multi: con el plan Solo, Integraciones no está disponible.", "Botika (el servicio que manda los WhatsApp) está configurado para la clínica, con su propio número de WhatsApp: Novudent solo deja los mensajes en la cola."],
    pasos: [
      { texto: "Entrá a **Administración › Integraciones**. La tarjeta **Contact Center IA** (Botika) dice en qué estado está: «Cola desactivada», «Cola activa · sin envíos confirmados» o «Actividad de Botika recibida». En la demo dice «Modo demo».", captura: "tarjeta" },
      { texto: "Tocá «Activar cola de Botika» para que Novudent empiece a dejar mensajes en la cola. Con «Pausar cola» se frenan todos y, mientras esté pausada, las automatizaciones no se pueden tocar y las plantillas no se muestran." },
      { texto: "Elegí qué automatizaciones querés: **Confirmación de citas**, **Encuestas NPS** y **Cobranza conversacional**. Tocá cada tarjeta para prenderla o apagarla. **Reagendar canceladas** figura apagada, con la marca «Todavía no envía»: no se puede tocar.", captura: "automatizaciones" },
      { texto: "En **Plantillas de mensajes** editá el primer mensaje que manda Botika en cada automatización. Podés usar las variables {paciente} {clinica} {fecha} {hora} {titulo} {saldo}. Tocá «Guardar plantillas».", captura: "plantillas" },
      { texto: "La **Cola de mensajería** muestra cada mensaje con su estado (Pendiente, Enviado, Respondido o Error) y lo que contestó el paciente. Con el tachito cancelás uno pendiente.", captura: "cola" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Novudent solo deja los mensajes en la cola: los manda Botika. Un mensaje figura como enviado o respondido recién cuando Botika registra ese resultado." },
      { tipo: "ojo", texto: "Cuándo se encola cada uno: la confirmación, al dar una cita nueva a un paciente con teléfono; la nota NPS, al completar un presupuesto; la cobranza, con el botón «Botika» de Cajas › Cuentas por cobrar." },
      { tipo: "tip", texto: "Cuando el paciente responde, la cita pasa a «Confirmado» y la nota queda en su ficha, y alimenta la tarjeta «Encuestas NPS» de Reportes: [[leer-el-panel-de-desempeno]]." },
      { tipo: "revisar", texto: "En la demo la conexión es simulada: el botón «Simular respuesta» inventa lo que contestaría el paciente y no se pudo probar un envío real por WhatsApp. Confirmar con Novum qué hay que cargar para conectar una clínica real: hoy se configura del lado de Botika." },
      { tipo: "ojo", texto: "El campo «Negociación de presupuestos» trae el mensaje de fábrica: dejalo así salvo que quieras cambiarlo. Con «↺ Restaurar default» volvés al de fábrica. Esa automatización se prende en Configuración, no en esta pantalla." },
      { tipo: "ojo", texto: "«Reagendar canceladas» todavía no manda ningún mensaje: el interruptor no se puede tocar y la tarjeta lo dice. Las citas anuladas reagendalas vos desde Agenda › Reprogramación ([[reprogramar-una-cita]])." },
      { tipo: "revisar", texto: "Para activar «Reagendar canceladas» hay que decidir el texto del mensaje y cuándo se manda (al cancelar la cita, o después de unos días). Confirmar con la clínica." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app/integraciones");
      const main = page.locator("main");
      await revelarTodo(page);
      const titulo = main.getByRole("heading", { name: "Contact Center IA" });
      const cola = main.getByRole("button", { name: /Pausar cola|Activar cola de Botika/ });
      await c.foto("tarjeta", { resaltar: [main.getByText("Modo demo", { exact: true }), cola], recorte: [titulo.locator("xpath=ancestor::div[contains(@class,'justify-between')][1]")], margen: 10, esperar: 700 });

      const auto = ["Confirmación de citas", "Encuestas NPS", "Cobranza conversacional", "Reagendar canceladas"].map((n) => main.getByRole("button", { name: new RegExp(`^${n}`) }));
      await c.foto("automatizaciones", { resaltar: auto, recorte: auto });

      const plantilla = main.getByLabel("Confirmación de citas").first();
      await plantilla.fill("Hola {paciente} 👋 Te recordamos tu cita «{titulo}» en {clinica} el {fecha} a las {hora}. Respondé SÍ para confirmar. ¡Gracias!");
      await soltar(page);
      const guardar = main.getByRole("button", { name: "Guardar plantillas" });
      const plantillas = tarjeta(main.getByRole("heading", { name: "Plantillas de mensajes" }));
      await c.foto("plantillas", { resaltar: [plantilla, guardar], recorte: plantillas });

      const respondida = main.locator("li").filter({ hasText: "NPS 9/10" });
      await respondida.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(500);
      await c.foto("cola", { resaltar: respondida.getByText("Respondido", { exact: true }), recorte: [main.getByRole("heading", { name: "Cola de mensajería" }), respondida], margen: 8 });

      // Sin captura: «Negociación de presupuestos» trae el mensaje de fábrica; «Guardar plantillas» deja el texto guardado y se apaga; el
      // tachito cancela el mensaje pendiente; tocar una automatización la apaga; «Reagendar canceladas» no se puede tocar (todavía no envía);
      // con la cola pausada las automatizaciones no se pueden tocar y las plantillas se ocultan.
      await c.expect(main.getByLabel("Negociación de presupuestos")).not.toHaveValue("");
      await guardar.click();
      await c.expect(guardar).toHaveCount(0);
      await c.expect.poll(async () => (await leerDemo(page)).clinics[0].config.botika.templates?.confirmCita ?? "").toContain("Respondé SÍ para confirmar");
      await main.getByRole("button", { name: "Cancelar tarea" }).click();
      await c.expect(main.getByRole("button", { name: "Cancelar tarea" })).toHaveCount(0);
      await c.expect(main.getByText("0 pendientes")).toBeVisible();
      await c.expect(auto[3]).toBeDisabled();
      const nps = (await leerDemo(page)).clinics[0].config.botika.automations.nps;
      await auto[1].click();
      await c.expect.poll(async () => (await leerDemo(page)).clinics[0].config.botika.automations.nps).toBe(!nps);
      await main.getByRole("button", { name: "Pausar cola" }).click();
      await c.expect(main.getByText("Cola desactivada", { exact: true })).toBeVisible();
      for (const automatizacion of auto) await c.expect(automatizacion).toBeDisabled();
      await c.expect(main.getByRole("heading", { name: "Plantillas de mensajes" })).toHaveCount(0);
      await main.getByRole("button", { name: "Activar cola de Botika" }).click();
      await c.expect(main.getByText("Modo demo", { exact: true })).toBeVisible();
    },
  },
];
