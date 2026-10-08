import type { Dialog, Locator, Page } from "@playwright/test";
import type { Procedimiento } from "./tipos";

/* Capítulo «Dentista». Las capturas se sacan entrando como la Dra. Sofía Benítez (Dentista) salvo que el procedimiento pida otro rol.
 * Cuando hace falta un dato para mostrar un paso, se carga recorriendo la pantalla (nada de tocar el almacenamiento del navegador).
 * Después de sacar las fotos, cada `capturar` recorre también lo que el texto cuenta y no se fotografía (para no escribir nada sin haberlo probado). */

type Captor = Parameters<NonNullable<Procedimiento["capturar"]>>[0];

/** Un botón o pestaña de la ficha (los dos niveles de pestañas viven dentro de `main`). */
const boton = (page: Page, nombre: string | RegExp, exacto = true): Locator =>
  page.locator("main").getByRole("button", typeof nombre === "string" ? { name: nombre, exact: exacto } : { name: nombre });

/** Abre la ficha de un paciente de la demo (p1 María González … p6 Marco Giménez) y espera a que se vea su nombre. */
async function abrirFicha(c: Captor, id: string, nombre: string) {
  await c.ir(`/app/pacientes/${id}`);
  await c.expect(c.page.getByRole("heading", { name: nombre, level: 1 })).toBeVisible();
}

/** La fila de las pestañas de segundo nivel de «Ficha clínica» (Resumen, Evoluciones, …). */
const filaDeSecciones = (page: Page) => boton(page, "Resumen").locator("xpath=..");
/** La fila de las dos pestañas grandes de la ficha (Ficha clínica / Planes de tratamiento). */
const filaDeGrupos = (page: Page) => boton(page, "Ficha clínica").locator("xpath=..");
/** La banda azul de la cabecera de la ficha (foto, nombre y los tres recuadros médicos). */
const cabecera = (page: Page) => page.locator(".mesh-hero").first();
/** Los tres recuadros de la cabecera (Alertas médicas · Enfermedades · Medicamentos), como un solo bloque. */
const recuadrosMedicos = (page: Page) => page.getByRole("button", { name: /^Alertas médicas/ }).locator("xpath=..");

/** Reemplaza `window.print` (que abriría el cuadro de impresión del navegador) por una marca, para comprobar que se lo llama. */
async function vigilarImpresion(page: Page) {
  await page.evaluate(() => { (window as unknown as { __impreso: boolean }).__impreso = false; window.print = () => { (window as unknown as { __impreso: boolean }).__impreso = true; }; });
}
const seImprimio = (page: Page) => page.evaluate(() => (window as unknown as { __impreso: boolean }).__impreso);

/** Carga los antecedentes médicos de la ficha abierta, igual que en [[anotar-los-antecedentes-medicos]]. */
async function cargarAntecedentes(page: Page) {
  await boton(page, "Antecedentes médicos").click();
  await boton(page, "Editar").click();
  const modal = page.getByRole("dialog", { name: "Datos médicos del paciente" });
  await modal.getByLabel("Alertas médicas").fill("Alergia a la penicilina");
  await modal.getByLabel("Enfermedades").fill("Hipertensión controlada");
  await modal.getByLabel("Medicamentos").fill("Losartán 50 mg");
  await modal.getByRole("button", { name: "Guardar" }).click();
}

/** Una radiografía panorámica «de mentira» (PNG gris, sin archivos): fondo oscuro, hueso y dos arcadas de dientes redondeados con sus raíces.
 *  Se arma al vuelo para no guardar ninguna imagen en el repositorio. */
async function pngPanoramica(w = 960, h = 440): Promise<Buffer> {
  const { deflateSync } = await import("node:zlib");
  const tabla = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = tabla[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const trozo = (tipo: string, datos: Buffer) => {
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    const t = Buffer.from(tipo, "ascii");
    const sello = Buffer.alloc(4); sello.writeUInt32BE(crc(Buffer.concat([t, datos])));
    return Buffer.concat([largo, t, datos, sello]);
  };
  const cabeceraPng = Buffer.alloc(13); cabeceraPng.writeUInt32BE(w, 0); cabeceraPng.writeUInt32BE(h, 4); cabeceraPng[8] = 8; cabeceraPng[9] = 0; // 8 bits, escala de grises
  const crudo = Buffer.alloc((w + 1) * h);
  const ruido = (x: number, y: number) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
  const paso = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  /** Forma redondeada (superelipse): 1 en el centro, 0 afuera, con el borde suave. */
  const forma = (u: number, v: number) => { const s = Math.pow(Math.pow(Math.abs(u), 2.8) + Math.pow(Math.abs(v), 2.8), 1 / 2.8); return paso(1.0, 0.82, s) * (1 - 0.28 * s * s); };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x / w) * 2 - 1;
      const d = y / h - (0.5 - 0.1 * nx * nx); // < 0 maxilar superior, > 0 mandíbula (el plano de mordida es una sonrisa suave)
      const lateral = paso(0.97, 0.72, Math.abs(nx));
      let v = 16 + 18 * (1 - nx * nx);
      v += 40 * paso(0.44, 0.08, Math.abs(d)) * lateral; // hueso alrededor de las raíces
      v += 30 * paso(0.27, 0.33, d) * paso(0.47, 0.36, d) * lateral; // borde de la mandíbula
      v -= 20 * paso(0.5, 0.68, Math.abs(nx)) * paso(0.88, 0.7, Math.abs(nx)) * paso(-0.12, -0.3, d) * paso(-0.5, -0.32, d); // senos maxilares
      const k = Math.round((nx + 0.84) / 0.12); // 15 dientes por arcada, uno cada 0,12; los molares, más anchos
      if (k >= 0 && k <= 14) {
        const cx = -0.84 + k * 0.12;
        const uu = (nx - cx) / (0.042 + 0.022 * paso(0.35, 0.75, Math.abs(cx))) + (d / 0.3) * 0.24 * ((k - 7) / 7);
        const arriba = Math.max(165 * forma(uu, (d + 0.085) / 0.082), 82 * forma(uu / 0.58, (d + 0.2) / 0.15) * (0.65 + 0.35 * paso(-0.36, -0.12, d)));
        const abajo = Math.max(165 * forma(uu, (d - 0.082) / 0.072), 82 * forma(uu / 0.58, (d - 0.185) / 0.14) * (0.65 + 0.35 * paso(0.32, 0.1, d)));
        v += Math.max(arriba, abajo);
      }
      v += (ruido(x, y) - 0.5) * 12;
      crudo[y * (w + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", cabeceraPng), trozo("IDAT", deflateSync(crudo)), trozo("IEND", Buffer.alloc(0))]);
}

export const procedimientos: Procedimiento[] = [
  /* ───────────────────────────── 1 · La agenda ───────────────────────────── */
  {
    id: "ver-tu-agenda",
    capitulo: "dentist",
    titulo: "Ver tu agenda",
    roles: ["dentist", "assistant"],
    paraQue: "Al empezar el día, para saber qué pacientes te esperan y a qué hora. La agenda es de solo lectura: los horarios los mueve la recepción.",
    pasos: [
      { texto: "Entrá a **Agenda**, en el menú de arriba. Se abre la vista «Diaria»: las citas del día con la hora, el paciente, el doctor y el estado de la cita.", captura: "diaria" },
      { texto: "Para mirar otro día, tocá las flechas que están a los costados de la fecha o el botón «Fecha», que abre el calendario. «Ir a hoy» te devuelve al día actual." },
      { texto: "Tocá «Semanal» para ver la semana entera: cada cita es una tarjeta en su día y su hora, y las anuladas salen tachadas.", captura: "semanal" },
      { texto: "Tocá una cita para ver su detalle: el estado, el paciente, el doctor y el horario. (En la vista «Diaria», tocá los tres puntos del final de la fila y «Ver».)" },
      { texto: "Tocá el nombre del paciente, en azul, para abrir su ficha: [[leer-la-ficha-clinica]].", captura: "detalle" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Con este rol no podés dar citas, cambiar su estado ni editarlas: el estado se ve pero no se toca, y el menú de los tres puntos de cada fila solo tiene «Ver». Si hay que mover un horario, pedíselo a la recepción." },
      { tipo: "ojo", texto: "Ves solo las citas de tus doctores: con el rol Dentista, las tuyas; con el rol Asistente de doctores, las de los doctores que la administración te asignó." },
      { tipo: "tip", texto: "A la izquierda, **Estados** esconde o muestra las citas según su estado y cuenta cuántas hay de cada uno; el buscador de arriba encuentra a un paciente dentro del día. «Imprimir» saca la agenda en papel." },
      { tipo: "tip", texto: "«Mensual» da un vistazo al mes, con las citas de cada día; «Diaria global» pone a cada doctor en su columna (con el rol Dentista, solo la tuya); «Lista de espera» muestra a los pacientes que esperan un hueco, y la recepción los agenda." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("dentist", "/app/agenda");
      // La demo siembra sus citas de lunes a viernes de la semana en curso. Para que la captura se vea igual cualquier día (también un
      // sábado, cuando «hoy» no tiene nada) se mira el viernes de esa semana, que tiene dos citas. La fecha se calcula en el navegador.
      const viernes = await page.evaluate(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 4);
        return d.toLocaleDateString("en-CA");
      });
      await page.getByLabel("Elegir fecha").fill(viernes);
      await c.expect(page.getByRole("link", { name: "Camila Ortega" })).toBeVisible();
      const tabla = page.locator("main table").first().locator("xpath=ancestor::div[contains(@class,'overflow-x-auto')][1]");
      const lateral = page.locator("main aside > div");
      await c.foto("diaria", {
        resaltar: page.getByRole("navigation").first().getByRole("link", { name: "Agenda" }),
        recorte: [page.getByRole("banner"), page.getByRole("navigation").first(), tabla, lateral.nth(0), lateral.nth(1)],
        margen: 4,
      });

      // Lo que el texto cuenta y no se fotografía: otro día, «Ir a hoy», el detalle desde los tres puntos, los estados, el buscador y «Imprimir».
      await page.getByLabel("Elegir fecha").fill("2000-01-03"); // un día que nunca es «hoy»
      await c.expect(page.getByText("Sin citas para este día")).toBeVisible();
      await page.getByRole("button", { name: "Día siguiente" }).click();
      await page.getByRole("button", { name: "Día anterior" }).click();
      await page.getByRole("button", { name: "Ir a hoy" }).click();
      await c.expect(page.getByRole("button", { name: "Ir a hoy" })).toHaveCount(0);
      await page.getByLabel("Elegir fecha").fill(viernes);
      await page.getByRole("button", { name: "Acciones de la cita" }).first().click();
      await c.expect(page.getByRole("menuitem")).toHaveText(["Ver"]); // sin «Editar» ni «Eliminar»
      await page.getByRole("menuitem", { name: "Ver" }).click();
      await c.expect(page.getByRole("dialog", { name: "Control post-operatorio" })).toBeVisible();
      await page.keyboard.press("Escape");
      await c.expect(page.getByRole("button", { name: "Dar cita" })).toHaveCount(0);
      await page.locator("label").filter({ hasText: /^Anulado\s*\d+$/ }).getByRole("checkbox").uncheck();
      await c.expect(page.getByRole("link", { name: "María González" })).toHaveCount(0);
      await page.getByRole("button", { name: "Marcar todos" }).click();
      await c.expect(page.getByRole("link", { name: "María González" })).toBeVisible();
      await page.getByPlaceholder(/Buscar nombre del paciente/).fill("Camila");
      await c.expect(page.getByRole("link", { name: "María González" })).toHaveCount(0);
      await page.getByPlaceholder(/Buscar nombre del paciente/).fill("");
      await vigilarImpresion(page);
      await page.getByRole("button", { name: "Imprimir" }).click();
      await c.expect.poll(() => seImprimio(page)).toBe(true);

      await page.getByRole("button", { name: "Semanal" }).click();
      const grilla = page.locator("main div.overflow-hidden").filter({ hasText: "08:00" }).filter({ hasText: "Lun" }).last();
      await c.expect(page.getByRole("button", { name: /Resina pieza 16/ })).toBeVisible();
      await c.foto("semanal", {
        resaltar: page.getByRole("button", { name: "Semanal" }),
        recorte: [page.getByRole("heading", { name: "Agenda", level: 1 }).locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]"), grilla],
      });

      await page.getByRole("button", { name: /Resina pieza 16/ }).click();
      const modal = page.getByRole("dialog", { name: "Resina pieza 16" });
      await c.foto("detalle", { resaltar: modal.getByRole("link", { name: "María González" }), recorte: modal, margen: 4 });
      await page.keyboard.press("Escape");

      // Las otras vistas que el texto menciona.
      await page.getByRole("button", { name: "Mensual" }).click();
      await c.expect(page.getByRole("button", { name: "Este mes" })).toBeVisible();
      await page.getByRole("button", { name: "Diaria global" }).click();
      await c.expect(page.locator("main").getByText("Dra. Sofía Benítez", { exact: true }).filter({ visible: true }).first()).toBeVisible(); // su columna
      await page.getByRole("button", { name: /Lista de espera/ }).click();
      const espera = page.getByRole("dialog", { name: "Lista de espera" });
      await c.expect(espera.getByText("Juan Ríos")).toBeVisible();
      await c.expect(espera.getByRole("button", { name: "Agregar" })).toHaveCount(0); // con este rol la lista es solo para mirar

      // La asistente de doctores ve la agenda de su doctora, también en solo lectura.
      await c.entrar("assistant", "/app/agenda");
      await c.expect(page.getByRole("button", { name: "Dar cita" })).toHaveCount(0);
      await page.getByRole("button", { name: "Acciones de la cita" }).first().click();
      await c.expect(page.getByRole("menuitem")).toHaveText(["Ver"]);
      await page.keyboard.press("Escape");
      await c.expect(page.locator("main")).not.toContainText("Diego Martínez"); // las citas del otro doctor no están
    },
  },

  /* ───────────────────────────── 2 · Leer la ficha ───────────────────────────── */
  {
    id: "leer-la-ficha-clinica",
    capitulo: "dentist",
    titulo: "Leer la ficha clínica de un paciente",
    roles: ["dentist", "assistant"],
    paraQue: "Antes de atender o durante la consulta, para saber quién es el paciente, qué le pasa y qué se le hizo. Con los roles Dentista y Asistente de doctores solo ves a los pacientes que tienen una cita o un plan con tus doctores.",
    pasos: [
      { texto: "Abrí la ficha del paciente: desde la agenda, tocando su nombre en la cita, o desde **Pacientes** (menú de arriba), tocando su nombre en la lista. Para buscarlo por nombre desde cualquier pantalla, mirá [[buscar-un-paciente]].", captura: "lista" },
      { texto: "Mirá la cabecera: el nombre, la edad y tres recuadros con las **Alertas médicas**, las **Enfermedades** y los **Medicamentos** del paciente. Leelos antes de empezar a trabajar.", captura: "cabecera" },
      { texto: "Debajo hay dos niveles de pestañas. El de arriba tiene **Ficha clínica** (lo que se lee y se anota en la consulta) y **Planes de tratamiento**.", captura: "grupos" },
      { texto: "Dentro de **Ficha clínica** hay una fila con sus secciones: **Resumen** (lo más reciente), **Evoluciones** (la nota de cada consulta), **Antecedentes médicos**, **Odontograma**, **Periodoncia**, **Historial** (todo por fecha), **Radiografías**, **Recetas**, **Tareas de gestión**, **Archivos** y **Documentos** (la Historia Clínica y otros). Las que se escriben tienen su propio procedimiento en este capítulo.", captura: "secciones" },
      { texto: "**Resumen** muestra las **Próximas citas** del paciente y su **Última actividad clínica** (las últimas notas).", captura: "resumen" },
      { texto: "Para ver todo lo que le pasó al paciente, en orden, entrá a **Historial**: citas, notas clínicas, prestaciones realizadas y documentos, agrupados por día. Los filtros de arriba dejan ver un solo tipo o un solo mes.", captura: "historial" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Si abrís un paciente que no tiene cita ni plan con tus doctores, la ficha dice «Este paciente no está entre tus pacientes»." },
      { tipo: "ojo", texto: "Con estos roles no aparecen los datos personales (CI, teléfono, correo), ni los pagos, ni los montos: esas pestañas no están." },
      { tipo: "ojo", texto: "La asistente de doctores ve lo mismo, pero solo para leer: no tiene «Nueva evolución», «Nueva receta» ni «Nueva medición», ni la pestaña «Copilot IA»." },
      { tipo: "tip", texto: "Los íconos de al lado de «Ver agenda» avisan de pendientes: el naranja, que al paciente le faltan documentos por completar (tocarlo abre «Documentos»); el celeste, que hay una actualización de su historial médico pendiente (la registra la recepción)." },
      { tipo: "tip", texto: "Con el plan Clínica, «Preparar consulta» (arriba a la derecha) arma con IA un resumen de la ficha, y «Copilot IA» propone hallazgos y un plan a partir de una radiografía." },
      { tipo: "tip", texto: "En **Resumen**, «Próximas citas» muestra hasta cuatro, de la más cercana a la más lejana; las citas anuladas no figuran. El tipo de cada nota («Diagnóstico», «Plan», «Tratamiento», «Nota») se lee igual en Resumen, Historial y Evoluciones." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("dentist", "/app/pacientes");
      const enlace = page.getByRole("link", { name: "Abrir la ficha de María González" });
      await c.foto("lista", { resaltar: enlace, recorte: page.locator("main table").locator("xpath=ancestor::div[contains(@class,'overflow-x-auto')][1]"), margen: 4 });
      await enlace.click();
      await c.expect(page.getByRole("heading", { name: "María González", level: 1 })).toBeVisible();
      // Para que la cabecera tenga algo que leer se cargan los antecedentes, como en el procedimiento que los explica.
      await cargarAntecedentes(page);
      await boton(page, "Resumen").click();
      await c.expect(page.getByRole("button", { name: /^Alertas médicas\s*Alergia a la penicilina/ })).toBeVisible();

      await c.foto("cabecera", { resaltar: recuadrosMedicos(page), recorte: cabecera(page), margen: 4 });
      await c.foto("grupos", { resaltar: filaDeGrupos(page), recorte: [filaDeGrupos(page), filaDeSecciones(page)], margen: 4 });
      await c.foto("secciones", { resaltar: filaDeSecciones(page), recorte: [filaDeGrupos(page), filaDeSecciones(page)], margen: 4 });
      // Las dos tarjetas del Resumen, juntas, en un solo recuadro (con dos recuadros el número 2 cae entre ellas).
      const proximas = page.getByRole("heading", { name: "Próximas citas" }).locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
      const tarjetas = proximas.locator("xpath=..");
      await c.foto("resumen", { resaltar: tarjetas, recorte: tarjetas, margen: 4 });

      await boton(page, "Historial").click();
      await c.expect(page.getByText("Nota clínica").first()).toBeVisible();
      await c.foto("historial", { resaltar: page.locator(".print-area"), recorte: [page.getByRole("button", { name: "Nueva nota" }), page.locator(".print-area")] });

      // Lo que el texto cuenta y no se fotografía: el ícono naranja lleva a «Documentos», y un paciente de otro doctor no se abre.
      await page.locator("button[data-tip^='Documentos clínicos pendientes']").click();
      await c.expect(page.getByRole("heading", { name: "Documentos clínicos" })).toBeVisible();
      await c.expect(page.getByRole("button", { name: "Datos personales" })).toHaveCount(0);
      await c.ir("/app/pacientes/p5"); // Lucía Ferreira solo tiene cita con el Dr. Martínez
      await c.expect(page.getByText("Este paciente no está entre tus pacientes")).toBeVisible();

      // La asistente de doctores ve lo mismo, pero sin los botones para agregar y sin «Copilot IA».
      await c.entrar("assistant", "/app/pacientes/p1");
      await c.expect(boton(page, "Copilot IA")).toHaveCount(0);
      for (const [seccion, nuevo] of [["Evoluciones", "Nueva evolución"], ["Recetas", "Nueva receta"], ["Periodoncia", "Nueva medición"]] as const) {
        await boton(page, seccion).click();
        await c.expect(boton(page, nuevo)).toHaveCount(0);
      }
    },
  },

  /* ───────────────────────────── 3 · Documentos del paciente ───────────────────────────── */
  {
    id: "revisar-los-documentos-del-paciente",
    capitulo: "dentist",
    titulo: "Revisar los documentos clínicos del paciente",
    roles: ["dentist", "assistant"],
    paraQue: "Para leer lo que el paciente respondió en su Historia Clínica y en otros documentos clínicos antes de atenderlo. La recepción es quien los completa: mirá [[completar-la-historia-clinica]].",
    pasos: [
      { texto: "En la ficha del paciente, con **Ficha clínica** abierta, tocá «Documentos» (tiene una flechita: abre un menú) y elegí «Documentos clínicos». Si al paciente le faltan documentos por completar, un número naranja junto a «Documentos» te lo avisa.", captura: "menu" },
      { texto: "Cada documento muestra su nombre, su estado (**Pendiente**, **Completado** o **Anulado**) y quién y cuándo lo hizo. Para leer uno completado, tocá «Ver / imprimir».", captura: "lista" },
      { texto: "Se abre el documento con las respuestas del paciente, ordenadas por secciones. «Imprimir» lo saca en papel y «Enviar por correo» se lo manda al paciente. Para cerrarlo, tocá la X de arriba.", captura: "visor" },
      { texto: "Un documento completado también figura en el **Historial** de la ficha, como «Documento clínico»." },
    ],
    avisos: [
      { tipo: "ojo", texto: "La asistente de doctores solo puede leerlos: en su pantalla no están «Nuevo documento clínico», «Editar» ni «Anular», y un aviso lo explica." },
      { tipo: "ojo", texto: "Con el rol Dentista también podés crear, completar, editar y anular documentos clínicos. Un documento anulado no se borra: queda en la ficha y se ve marcando «Mostrar anulados»." },
      { tipo: "ojo", texto: "«Consentimientos», que en otros roles aparece dentro de «Documentos», no se ve con estos roles: lo gestiona la recepción." },
      { tipo: "revisar", texto: "Ni el dentista ni la asistente ven los consentimientos del paciente, solo los documentos clínicos. Confirmar si deberían poder leerlos." },
      { tipo: "revisar", texto: "No se pudo probar «Enviar por correo»: la demo no envía correos." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("dentist");
      await abrirFicha(c, "p3", "Camila Ortega");
      const documentos = boton(page, /^Documentos/);
      await documentos.click();
      const opcion = page.getByRole("menuitem", { name: "Documentos clínicos" });
      await c.expect(page.getByRole("menuitem")).toHaveText(["Documentos clínicos"]); // sin «Consentimientos»
      await c.foto("menu", { resaltar: opcion, recorte: [filaDeSecciones(page), page.getByRole("menu", { name: "Documentos" }), page.getByRole("heading", { name: "Próximas citas" })], margen: 4 });
      await opcion.click();

      await c.expect(page.getByRole("heading", { name: "Documentos clínicos" })).toBeVisible();
      const lista = page.getByText("Historia Clínica").first().locator("xpath=ancestor::div[contains(@class,'divide-y')][1]");
      await c.foto("lista", {
        resaltar: page.getByRole("button", { name: "Ver / imprimir" }),
        recorte: [page.getByRole("heading", { name: "Documentos clínicos" }).locator("xpath=.."), lista],
        margen: 4,
      });
      await page.getByRole("button", { name: "Ver / imprimir" }).click();
      const visor = page.getByRole("dialog", { name: "Documento clínico" });
      // Los dos botones («Enviar por correo» e «Imprimir») van en un solo recuadro: con dos, el número 2 tapa el texto del primero.
      await c.foto("visor", {
        resaltar: visor.getByRole("button", { name: "Imprimir" }).locator("xpath=.."),
        recorte: [visor.getByRole("heading", { name: "Documento clínico" }), visor.getByText(/¿Padece o padeció usted alguna alergia/)],
        margen: 4,
      });
      await visor.getByRole("button", { name: "Cerrar" }).click();

      // Lo que el texto cuenta y no se fotografía: el documento completado figura en el Historial.
      await boton(page, "Historial").click();
      await c.expect(page.getByText("Documento clínico").first()).toBeVisible();

      // La asistente de doctores solo puede leerlos.
      await c.entrar("assistant", "/app/pacientes/p3?tab=documentos");
      await c.expect(page.getByText("Tu rol puede ver los documentos clínicos, pero no crearlos ni editarlos.")).toBeVisible();
      for (const prohibido of ["Nuevo documento clínico", "Editar", "Anular"]) await c.expect(page.getByRole("button", { name: prohibido })).toHaveCount(0);
      await c.expect(page.getByRole("button", { name: "Ver / imprimir" })).toBeVisible();
    },
  },

  /* ───────────────────────────── 4 · Antecedentes médicos ───────────────────────────── */
  {
    id: "anotar-los-antecedentes-medicos",
    capitulo: "dentist",
    titulo: "Anotar los antecedentes médicos",
    roles: ["dentist", "admin", "receptionist", "cashier"],
    verComo: ["assistant"], // solo se comprueba que ve los datos y no puede cambiarlos (ver el segundo `ojo`)
    paraQue: "Para dejar a la vista, en la cabecera de la ficha, lo que hay que saber antes de tocar al paciente: sus alergias y alertas, sus enfermedades y los medicamentos que toma.",
    pasos: [
      { texto: "En la ficha del paciente, tocá uno de los tres recuadros de la cabecera: **Alertas médicas**, **Enfermedades** o **Medicamentos**. Con el rol Dentista también podés entrar a **Ficha clínica › Antecedentes médicos** y tocar «Editar».", captura: "editar" },
      { texto: "En **Datos médicos del paciente**, escribí cada dato en su campo: **Alertas médicas** (alergias, condiciones críticas…), **Enfermedades** (diabetes, hipertensión…) y **Medicamentos** (anticoagulantes, etc.).", captura: "campos" },
      { texto: "Tocá «Guardar»." },
      { texto: "Listo: lo que escribiste aparece en los tres recuadros de la cabecera, en cualquier pestaña de la ficha. Para corregirlo después, volvé a tocar uno de los recuadros.", captura: "cabecera" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Cada campo es un texto libre y lo que dejás escrito reemplaza lo anterior: si agregás un dato, conservá el que ya estaba." },
      { tipo: "ojo", texto: "La asistente de doctores ve estos datos pero no puede cambiarlos. La recepción y la caja sí, pero solo desde los recuadros de la cabecera: no ven la pestaña «Antecedentes médicos»." },
      { tipo: "revisar", texto: "La recepción y la caja pueden cambiar estos datos aunque no ven la ficha clínica (los permisos de la clínica reservan lo clínico al dentista y a la administración). Confirmar si es lo que se quiere." },
      { tipo: "revisar", texto: "Un recuadro vacío dice «Sin información». Confirmar si la clínica quiere dejar constancia de lo que el paciente respondió que no tiene (por ejemplo escribiendo «Niega alergias»)." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("dentist");
      await abrirFicha(c, "p1", "María González");
      await boton(page, "Antecedentes médicos").click();
      const tarjeta = page.getByRole("heading", { name: "Antecedentes médicos" }).locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
      await c.expect(tarjeta).toBeVisible();
      await c.foto("editar", { resaltar: [recuadrosMedicos(page), boton(page, "Editar")], recorte: [cabecera(page), tarjeta], margen: 4 });

      await boton(page, "Editar").click();
      const modal = page.getByRole("dialog", { name: "Datos médicos del paciente" });
      await modal.getByLabel("Alertas médicas").fill("Alergia a la penicilina");
      await modal.getByLabel("Enfermedades").fill("Hipertensión controlada");
      await modal.getByLabel("Medicamentos").fill("Losartán 50 mg");
      await c.foto("campos", {
        resaltar: [modal.getByLabel("Alertas médicas"), modal.getByLabel("Enfermedades"), modal.getByLabel("Medicamentos"), modal.getByRole("button", { name: "Guardar" })],
        recorte: modal,
        margen: 4,
      });
      await modal.getByRole("button", { name: "Guardar" }).click();
      await c.expect(page.getByRole("button", { name: /^Alertas médicas\s*Alergia a la penicilina/ })).toBeVisible();
      await c.foto("cabecera", { resaltar: recuadrosMedicos(page), recorte: cabecera(page), margen: 4 });

      // Lo que el texto cuenta y no se fotografía: la tarjeta de «Antecedentes médicos» muestra lo guardado y los recuadros de la cabecera reabren el formulario.
      await c.expect(tarjeta).toContainText("Hipertensión controlada");
      await page.getByRole("button", { name: /^Medicamentos/ }).click();
      await c.expect(modal.getByLabel("Medicamentos")).toHaveValue("Losartán 50 mg"); // trae lo que ya estaba
      await modal.getByRole("button", { name: "Cancelar" }).click();

      // Los otros roles: la recepción y la caja lo cargan desde los recuadros de la cabecera (no tienen la pestaña); la asistente no puede.
      for (const rol of ["receptionist", "cashier"] as const) {
        await c.entrar(rol, "/app/pacientes/p1");
        await c.expect(boton(page, "Antecedentes médicos")).toHaveCount(0);
        await page.getByRole("button", { name: /^Alertas médicas/ }).click();
        await c.expect(modal).toBeVisible();
        await modal.getByLabel("Alertas médicas").fill("Alergia al látex");
        await modal.getByRole("button", { name: "Guardar" }).click();
        await c.expect(page.getByRole("button", { name: /^Alertas médicas\s*Alergia al látex/ })).toBeVisible();
      }
      await c.entrar("assistant", "/app/pacientes/p1");
      await page.getByRole("button", { name: /^Alertas médicas/ }).click();
      await c.expect(modal).toHaveCount(0);
      await boton(page, "Antecedentes médicos").click();
      await c.expect(boton(page, "Editar")).toHaveCount(0);
    },
  },

  /* ───────────────────────────── 5 · Odontograma ───────────────────────────── */
  {
    id: "usar-el-odontograma",
    capitulo: "dentist",
    titulo: "Usar el odontograma",
    roles: ["dentist", "admin"],
    verComo: ["assistant"], // solo se comprueba su pantalla de solo lectura (ver el último `ojo`)
    paraQue: "Durante el examen, para marcar en el diagrama dental lo que encontrás (caries, obturaciones, coronas, endodoncias, ausencias…) y lo que ya se hizo, pieza por pieza y superficie por superficie.",
    pasos: [
      { texto: "En la ficha, entrá a **Ficha clínica › Odontograma**. Vas a ver la **Carta dental** (las piezas, con numeración FDI) y, a la derecha, los **Controles**.", captura: "pestana" },
      { texto: "Tocá la pieza que querés trabajar (por ejemplo la 4.6): queda marcada y su número aparece en **Diente activo**. Con Ctrl (⌘ en Mac) apretado podés elegir varias piezas a la vez; «Borrar selección» las suelta.", captura: "pieza" },
      { texto: "Para registrar una caries, tocá en **Caries** la superficie afectada. Cada una lleva una letra y su nombre (bucal, mesial, oclusal, distal, lingual o palatino); en las piezas de adelante, los nombres pasan a ser labial e incisal.", captura: "caries" },
      { texto: "Para un tratamiento ya hecho, elegí la pieza y, en **Obturaciones y restauración**, el **Tipo** (por ejemplo «Obturación de composite») y las superficies tratadas. En el mismo panel están **Detalles del diente** (si está ausente, si es un implante, si lleva corona) y **Raíz y periodonto** (endodoncia, movilidad).", captura: "obturacion" },
      { texto: "Debajo de la carta, **Información dental** resume lo marcado: caries, obturaciones, tratamientos de conducto, prótesis y estado periodontal.", captura: "resumen" },
      { texto: "No hay botón «Guardar»: cada cambio se guarda solo, un instante después de hacerlo." },
    ],
    avisos: [
      { tipo: "tip", texto: "El odontograma se guarda solo: también el último cambio si cambiás de pestaña o salís de la ficha enseguida." },
      { tipo: "ojo", texto: "Elegí primero una pieza: mientras no haya ninguna, los controles de la derecha están apagados." },
      { tipo: "ojo", texto: "«Restablecer boca», en **Estados**, borra todo lo marcado en el odontograma de una vez. Antes pide confirmación; usalo solo para empezar la carta desde cero." },
      { tipo: "ojo", texto: "La asistente de doctores ve el odontograma, pero no lo puede editar: la pantalla lo avisa." },
      { tipo: "tip", texto: "Hacé doble clic en una pieza para anotarle una nota: se lee al pasar el mouse por encima. Los botones de arriba de la carta muestran u ocultan la vista oclusal, las muelas del juicio, el hueso y la pulpa." },
      { tipo: "tip", texto: "Con el plan Clínica, «Copilot IA» (en la misma **Ficha clínica**) propone hallazgos para el odontograma a partir de una radiografía; vos elegís cuáles aplicar." },
      { tipo: "revisar", texto: "La pantalla no trae una leyenda de colores: lo marcado se lee en «Información dental». Confirmar si hace falta una." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("dentist");
      await abrirFicha(c, "p1", "María González");
      await boton(page, "Odontograma").click();
      const odo = page.locator(".odontogram-root");
      const pieza = (n: string) => odo.getByRole("option", { name: n, exact: true });
      await c.expect(pieza("4.6")).toBeVisible();
      await page.waitForTimeout(1500); // el motor termina de dibujar las piezas y de cargar lo que ya estaba guardado
      await c.expect(odo.locator("#cariesChecks input").first()).toBeDisabled(); // sin pieza elegida, los controles están apagados
      await c.foto("pestana", { resaltar: boton(page, "Odontograma"), recorte: [filaDeSecciones(page), odo.locator("header.topbar")] });

      await pieza("4.6").click();
      await c.expect(odo.locator("#activeToothLabel")).toHaveText("4.6");
      await c.foto("pieza", { resaltar: pieza("4.6"), recorte: [odo.locator("header.topbar"), odo.locator("section.chart"), odo.locator(".panel-header")], margen: 4 });

      await odo.locator("#cariesChecks label.pos-occlusal").click();
      await c.foto("caries", { resaltar: odo.locator("#cariesChecks label.pos-occlusal"), recorte: odo.locator("#cariesSection"), margen: 4 });

      await pieza("3.6").click();
      await odo.locator("#fillingSelect").selectOption({ label: "Obturación de composite" });
      await odo.locator("#fillingSurfaceChecks label.pos-distal").click();
      // Un solo recuadro, el de toda la tarjeta: con dos (el «Tipo» y la superficie) el lugar para los números mostraría un pedazo de la tarjeta de arriba.
      await c.foto("obturacion", { resaltar: odo.locator("#fillingSection"), recorte: odo.locator("#fillingSection"), margen: 4 });

      await c.expect(odo.locator(".tooth-info")).toContainText("46");
      await c.foto("resumen", { resaltar: odo.locator(".tooth-info"), recorte: odo.locator(".tooth-info") });

      // Lo que el texto cuenta y no se fotografía: rótulos de las superficies, varias piezas con Ctrl, «Borrar selección», la nota por pieza,
      // que se guarda solo y «Restablecer boca» (todo esto después de las fotos: deja el odontograma de la demo distinto).
      const rotulos = async (n: string) => { await pieza(n).click(); return odo.locator("#cariesChecks label.surface-cell .surf-name").allInnerTexts(); };
      c.expect(await rotulos("4.6")).toEqual(["bucal", "mesial", "oclusal", "distal", "lingual"]);
      c.expect(await rotulos("1.1")).toEqual(["labial", "mesial", "incisal", "distal", "palatino"]);
      await pieza("1.5").click({ modifiers: ["Control"] });
      await c.expect(odo.locator("#activeToothLabel")).toHaveText("2 dientes");
      await odo.locator("#btnSelectNone").click();
      await c.expect(odo.locator("#activeToothLabel")).toHaveText("—");
      await pieza("4.6").dblclick();
      await page.locator(".odon-note-textarea").fill("Controlar en la próxima visita");
      await page.locator(".odon-note-popover").getByRole("button", { name: "Guardar" }).click();
      await c.expect(pieza("4.6")).toHaveAttribute("title", /Controlar en la próxima visita/);
      await page.waitForTimeout(1200);
      // Solo se LEE lo que la app guardó (no se escribe nada a mano): la caries de la 4.6 quedó sin tocar ningún botón de guardar.
      const caries46 = await page.evaluate(() => JSON.parse(localStorage.getItem("novudent.db.v4") || "null")?.patients.find((p: { id: string }) => p.id === "p1")?.odontogram?.teeth?.["46"]?.caries);
      c.expect(caries46).toEqual(["caries-occlusal"]);
      // «Restablecer boca» pide confirmación: si se rechaza, la carta queda como estaba; si se acepta, «Información dental» se actualiza en el momento.
      let preguntoAntes = false;
      const alPreguntar = (d: Dialog) => { preguntoAntes = true; void d.dismiss(); };
      page.on("dialog", alPreguntar);
      await odo.locator("#btnResetAll").click();
      page.off("dialog", alPreguntar);
      c.expect(preguntoAntes).toBe(true);
      await c.expect(odo.locator(".tooth-info")).not.toContainText("No hay dientes con caries");
      page.once("dialog", (d) => void d.accept());
      await odo.locator("#btnResetAll").click();
      await c.expect(odo.locator(".tooth-info")).toContainText("No hay dientes con caries");
      await page.waitForTimeout(1200);
      await page.reload();
      await boton(page, "Odontograma").click();
      await c.expect(odo.locator(".tooth-info")).toContainText("No hay dientes con caries");

      // La asistente de doctores ve el odontograma en solo lectura.
      await c.entrar("assistant", "/app/pacientes/p1");
      await boton(page, "Odontograma").click();
      await c.expect(page.getByText("Solo el dentista o administrador puede editar el odontograma")).toBeVisible();
    },
  },

  /* ───────────────────────────── 6 · Periodoncia ───────────────────────────── */
  {
    id: "hacer-el-periodontograma",
    capitulo: "dentist",
    titulo: "Hacer el periodontograma",
    roles: ["dentist", "admin"],
    paraQue: "Para medir cómo están las encías de un paciente: profundidad de sondaje, sangrado, recesión, placa y movilidad por pieza. Cada sesión queda guardada para comparar con las próximas.",
    pasos: [
      { texto: "En la ficha, entrá a **Ficha clínica › Periodoncia** y tocá «Nueva medición».", captura: "nueva" },
      { texto: "Elegí la arcada con «Superior» o «Inferior»: la tabla lista las piezas de esa arcada, una fila por pieza." },
      { texto: "En la fila de la pieza, anotá la **profundidad de sondaje** (en mm) de cada uno de los seis sitios (MV, V, DV, ML, L y DL) y, si sangra, tocá la gotita. Debajo podés anotar la recesión («rec») y marcar la placa con el cuadradito; al final de la fila, la movilidad (0 a 3).", captura: "fila" },
      { texto: "Si querés, escribí una nota de la sesión (por ejemplo el índice de placa o el plan periodontal) y tocá «Guardar medición». Hace falta haber cargado al menos una pieza.", captura: "guardar" },
      { texto: "La sesión queda en la lista con su fecha y quién la hizo, y un resumen: **BOP** (el porcentaje de sitios que sangran), **Placa** (si marcaste alguna), **CAL** (la peor inserción clínica) y cuántos sitios miden de 4 a 5 mm o 6 mm o más. Tocá la fila para abrir o cerrar su tabla.", captura: "resultado" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Una medición guardada no se edita: si te equivocaste, hacé una nueva. Las sesiones nuevas se suman arriba de la lista." },
      { tipo: "tip", texto: "Los valores de 4 a 5 mm se pintan de amarillo y los de 6 mm o más, de rojo, para que se vean de un vistazo." },
      { tipo: "tip", texto: "Con el plan Clínica, «Dictar pieza» te deja decir en voz alta la pieza y sus seis profundidades, y la IA completa la fila." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("dentist");
      await abrirFicha(c, "p1", "María González");
      await boton(page, "Periodoncia").click();
      await c.foto("nueva", { resaltar: boton(page, "Nueva medición"), recorte: [filaDeSecciones(page), page.getByText("Profundidad de sondaje (6 sitios), sangrado y movilidad por pieza.")] });

      await boton(page, "Nueva medición").click();
      await c.expect(page.getByRole("heading", { name: "Nueva medición" })).toBeVisible();
      const editor = page.getByRole("heading", { name: "Nueva medición" }).locator("xpath=ancestor::div[contains(@class,'p-4')][1]");
      const guardar = editor.getByRole("button", { name: "Guardar medición" });
      await c.expect(guardar).toBeDisabled(); // hace falta al menos una pieza
      // Superior / Inferior: la tabla cambia de arcada.
      await editor.getByRole("button", { name: "Inferior" }).click();
      await c.expect(editor.getByRole("cell", { name: "48", exact: true })).toBeVisible();
      await editor.getByRole("button", { name: "Superior" }).click();
      const fila = (n: string) => editor.locator("tbody tr").filter({ has: page.getByRole("cell", { name: n, exact: true }) });
      const f16 = fila("16");
      const hondo = f16.locator('input[title="Profundidad de sondaje (mm)"]');
      for (const [i, mm] of [3, 2, 4, 3, 2, 5].entries()) await hondo.nth(i).fill(String(mm));
      await f16.locator('button[title="Sangrado al sondaje"]').nth(2).click();
      await f16.locator('button[title="Sangrado al sondaje"]').nth(5).click();
      await f16.locator('input[title="Recesión gingival (mm)"]').nth(0).fill("1");
      await f16.locator('button[title="Placa bacteriana"]').nth(1).click();
      await f16.locator("td").last().locator("input").fill("1"); // movilidad
      await c.foto("fila", { resaltar: f16, recorte: [editor.locator("thead"), f16], margen: 2 });

      await editor.getByPlaceholder(/Notas de la sesión/).fill("Placa moderada en el sector posterior superior.");
      // La nota y los botones, en un solo recuadro (el bloque de abajo de la tabla).
      const pie = editor.getByPlaceholder(/Notas de la sesión/).locator("xpath=..");
      await c.foto("guardar", { resaltar: pie, recorte: pie, margen: 4 });
      await guardar.click();
      const sesion = page.getByRole("button", { name: /de octubre de|de .* de \d{4}/ }).first();
      await c.expect(sesion).toBeVisible();
      await c.expect(page.getByText("r1", { exact: true })).toBeVisible(); // la recesión quedó en la tabla de la sesión
      await c.expect(sesion).toContainText("Placa"); // y la placa, en el resumen
      await c.foto("resultado", { resaltar: sesion, recorte: sesion.locator("xpath=ancestor::div[contains(@class,'overflow-hidden')][1]"), margen: 2 });
    },
  },

  /* ───────────────────────────── 7 · Radiografías ───────────────────────────── */
  {
    id: "subir-una-radiografia",
    capitulo: "dentist",
    titulo: "Subir una radiografía",
    roles: ["dentist", "admin"],
    verComo: ["assistant"], // solo se comprueba su pantalla de solo lectura (ver el último `ojo`)
    paraQue: "Para guardar en la ficha la radiografía del paciente, con las marcas de lo que ves y una explicación en lenguaje simple para mostrársela.",
    antes: ["Tener la imagen de la radiografía en tu computadora (cualquier imagen sirve: JPG, PNG…).", "Tu clínica tiene que tener el plan Clínica o superior: con otro plan, esta pestaña muestra un aviso en lugar de la herramienta."],
    pasos: [
      { texto: "En la ficha, entrá a **Ficha clínica › Radiografías**. Arriba hay un aviso fijo: es una herramienta de apoyo, no reemplaza tu criterio.", captura: "pestana" },
      { texto: "En **Tipo de estudio** elegí Panorámica, Bitewing, Periapical u Otra y tocá «Subir radiografía». Elegí la imagen en tu computadora: se abre el estudio con la imagen.", captura: "subir" },
      { texto: "Para marcar un hallazgo a mano, tocá «Agregar marca»: aparece una caja sobre la imagen (arrastrala para moverla, y la esquina para cambiarle el tamaño). A la derecha escribí qué es, la pieza (FDI), la gravedad y una nota.", captura: "marca" },
      { texto: "Escribí la **Explicación para el paciente**, con palabras simples, y tocá «Guardar estudio».", captura: "guardar" },
      { texto: "El estudio queda en **Estudios previos**, con su tipo, su fecha y cuántos hallazgos tiene. Tocalo para volver a abrirlo; «Mostrar al paciente» abre una vista limpia, sin controles, para enseñarle la imagen en pantalla.", captura: "estudios" },
    ],
    avisos: [
      { tipo: "tip", texto: "Con el plan Clínica, «Analizar con IA» marca hallazgos sobre la imagen y propone una explicación; vos los ajustás antes de guardar. Es un apoyo: la decisión clínica es tuya." },
      { tipo: "ojo", texto: "«Eliminar estudio» (aparece en un estudio ya guardado) borra la radiografía en el acto, sin pedir confirmación." },
      { tipo: "ojo", texto: "La imagen se reduce al subirla. Si igual queda muy pesada, la pantalla avisa «La imagen sigue siendo muy pesada tras comprimir»: probá con una versión más liviana." },
      { tipo: "ojo", texto: "La asistente de doctores puede ver los estudios guardados, pero no subir ni editar radiografías." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("dentist");
      await abrirFicha(c, "p1", "María González");
      await boton(page, "Radiografías").click();
      const aviso = page.getByText("Herramienta de apoyo al diagnóstico");
      await c.expect(aviso).toBeVisible();
      await c.foto("pestana", { resaltar: boton(page, "Radiografías"), recorte: [filaDeSecciones(page), aviso] });

      const herramienta = page.getByRole("heading", { name: "Subir una radiografía" }).locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
      // El tipo de estudio y el botón, en un solo recuadro.
      await c.foto("subir", { resaltar: herramienta.locator("select").locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]"), recorte: herramienta, margen: 4 });
      await c.expect(herramienta.locator("select option")).toHaveText(["Panorámica", "Bitewing", "Periapical", "Otra"]);
      // Se elige el archivo sin abrir el diálogo del sistema: el campo de archivo de la propia herramienta (el de la cabecera es el de la foto del paciente).
      await herramienta.locator('input[type="file"]').setInputFiles({ name: "panoramica.png", mimeType: "image/png", buffer: await pngPanoramica() });
      await c.expect(page.getByRole("button", { name: "Guardar estudio" })).toBeVisible();
      await page.waitForTimeout(500);

      await page.getByRole("button", { name: "Agregar marca" }).click();
      const estudio = page.getByRole("button", { name: "Cerrar estudio" }).locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
      await estudio.getByPlaceholder("Hallazgo").fill("Caries distal");
      await estudio.getByPlaceholder("FDI").fill("26");
      await estudio.locator("select").selectOption({ label: "Moderado" });
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // sin el aro azul del último campo escrito
      await c.foto("marca", { resaltar: page.getByRole("button", { name: "Agregar marca" }), recorte: estudio, margen: 4 });

      await estudio.getByLabel("Explicación para el paciente").fill("En esta radiografía vemos una caries entre dos muelas de arriba. Se arregla con una resina.");
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await c.foto("guardar", { resaltar: page.getByRole("button", { name: "Guardar estudio" }), recorte: estudio, margen: 4 });
      await page.getByRole("button", { name: "Guardar estudio" }).click();
      await c.expect(page.getByText("Guardado ✓")).toBeVisible();
      await page.getByRole("button", { name: "Cerrar estudio" }).click();
      const tarjeta = page.getByRole("button", { name: /Panorámica.*1 hallazgo/ });
      await c.expect(tarjeta).toBeVisible();
      await c.foto("estudios", { resaltar: tarjeta, recorte: [page.getByRole("heading", { name: "Estudios previos" }), tarjeta] });

      // Lo que el texto cuenta y no se fotografía: reabrir el estudio, «Mostrar al paciente» y «Eliminar estudio».
      await tarjeta.click();
      await c.expect(page.getByRole("button", { name: "Guardar cambios" })).toBeVisible();
      await page.getByRole("button", { name: "Mostrar al paciente" }).click();
      await c.expect(page.getByRole("heading", { name: "Tu radiografía" })).toBeVisible();
      await page.getByRole("button", { name: "Salir de la vista" }).click();
      await page.getByRole("button", { name: "Eliminar estudio" }).click();
      await c.expect(page.getByText("Sin estudios")).toBeVisible();

      // La asistente de doctores solo puede mirar: no hay dónde subir una radiografía.
      await c.entrar("assistant", "/app/pacientes/p1");
      await boton(page, "Radiografías").click();
      await c.expect(page.getByText(/acceso de solo lectura/)).toBeVisible();
      await c.expect(page.getByRole("button", { name: "Subir radiografía" })).toHaveCount(0);
    },
  },

  /* ───────────────────────────── 8 · Evolución ───────────────────────────── */
  {
    id: "registrar-una-evolucion",
    capitulo: "dentist",
    titulo: "Registrar una evolución",
    roles: ["dentist", "admin"],
    paraQue: "Después de cada consulta, para dejar por escrito qué se encontró y qué se hizo. La nota queda firmada con tu nombre y figura en el Historial del paciente.",
    pasos: [
      { texto: "En la ficha, entrá a **Ficha clínica › Evoluciones** y tocá «Nueva evolución». (En **Historial**, «Nueva nota» abre el mismo formulario.)", captura: "nueva" },
      { texto: "Elegí cómo escribirla: el formato («SOAP» —Subjetivo, Objetivo, Análisis y Plan— o «Nota libre»), una plantilla si querés partir de un modelo («Plantilla…») y el tipo de nota (Diagnóstico, Tratamiento, Plan o Nota; viene puesto «Tratamiento»).", captura: "opciones" },
      { texto: "Escribí en los casilleros, o ajustá lo que trajo la plantilla. En «Nota libre» hay un solo campo, **Detalle**.", captura: "casilleros" },
      { texto: "Tocá «Firmar y guardar»: la nota queda firmada electrónicamente con tu nombre y la fecha." },
      { texto: "La nueva evolución aparece arriba de la lista en **Evoluciones**, con la marca «Firmado electrónicamente por…», y también en **Historial**, junto con las citas y las prestaciones.", captura: "lista" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Revisá el texto antes de tocar «Firmar y guardar»: una vez guardada, no hay botón para editar ni para borrar la nota." },
      { tipo: "tip", texto: "Con el plan Clínica, «Dictar nota» (en **Historial**) te deja contar la evolución hablando: la IA la transcribe y la redacta como nota clínica, y vos la revisás antes de guardarla." },
      { tipo: "revisar", texto: "Las plantillas SOAP («Control de ortodoncia», «Urgencia por dolor», «Profilaxis» y «Post-quirúrgico») son textos de ejemplo de Novudent, algunas con «…» para completar: confirmar con un odontólogo que sirven." },
      { tipo: "ojo", texto: "Una evolución vacía no se firma: si todos los casilleros están vacíos (o solo tienen espacios), aparece un aviso en rojo («Escribí al menos uno de los cuatro campos…») y la nota no se guarda." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("dentist");
      await abrirFicha(c, "p1", "María González");
      await boton(page, "Evoluciones").click();
      const titulo = page.getByRole("heading", { name: "Evoluciones clínicas" });
      await c.foto("nueva", {
        resaltar: boton(page, "Nueva evolución"),
        recorte: [titulo.locator("xpath=.."), titulo.locator("xpath=../following-sibling::div[1]")],
      });

      await boton(page, "Nueva evolución").click();
      const modal = page.getByRole("dialog", { name: "Nueva evolución clínica" });
      await modal.locator("select").first().selectOption({ label: "Profilaxis" });
      await c.expect(modal.getByLabel("S — Subjetivo")).not.toHaveValue("");
      await c.foto("opciones", {
        resaltar: [modal.getByRole("button", { name: "SOAP" }).locator("xpath=.."), modal.locator("select").first(), modal.locator("select").nth(1)],
        recorte: modal,
        margen: 4,
      });
      await c.foto("casilleros", {
        resaltar: [modal.getByLabel("S — Subjetivo").locator("xpath=ancestor::div[contains(@class,'grid')][1]"), modal.getByRole("button", { name: "Firmar y guardar" })],
        recorte: modal,
        margen: 4,
      });
      await modal.getByRole("button", { name: "Firmar y guardar" }).click();
      await c.expect(page.getByText(/Firmado electrónicamente por Dra\. Sofía Benítez/)).toBeVisible();
      const nueva = page.getByText(/Firmado electrónicamente por/).locator("xpath=ancestor::div[contains(@class,'p-4')][1]");
      await c.foto("lista", { resaltar: nueva, recorte: [titulo.locator("xpath=.."), nueva], margen: 6 });

      // Lo que el texto cuenta y no se fotografía: «Nota libre», que sin escribir nada no guarda, «Nueva nota» del Historial y la nota en el Historial.
      await boton(page, "Nueva evolución").click();
      await modal.getByRole("button", { name: "Nota libre" }).click();
      await c.expect(modal.getByLabel("Detalle")).toBeVisible();
      await modal.getByRole("button", { name: "Firmar y guardar" }).click();
      await c.expect(modal).toBeVisible(); // vacía, no guarda
      await c.expect(modal.getByRole("alert")).toContainText("Escribí al menos uno");
      await modal.getByRole("button", { name: "Cancelar" }).click();
      await boton(page, "Historial").click();
      await c.expect(page.getByText(/S: Asintomático, consulta de control/)).toBeVisible();
      await boton(page, "Nueva nota").click();
      await c.expect(page.getByRole("dialog", { name: "Nueva evolución clínica" })).toBeVisible();
    },
  },

  /* ───────────────────────────── 9 · Plan de tratamiento ───────────────────────────── */
  {
    id: "armar-un-plan-de-tratamiento",
    capitulo: "dentist",
    titulo: "Armar un plan de tratamiento",
    roles: ["dentist"],
    paraQue: "Cuando terminaste el diagnóstico y sabés qué necesita el paciente: dejás las prestaciones en un plan para que después se presente, se acepte y se vaya cumpliendo.",
    pasos: [
      { texto: "En la ficha del paciente, tocá **Planes de tratamiento**. Si todavía no tiene ninguno, la pantalla lo dice.", captura: "planes" },
      { texto: "Tocá «Nuevo plan de tratamiento». Se abre el formulario con el paciente y vos, como profesional, ya puestos." },
      { texto: "En **Procedimientos**, tocá «Agregar» y elegí la prestación del arancel (por ejemplo «D2330 — Resina compuesta — 1 superficie»). Si es de una pieza, escribí su número (FDI) en el campo **Pieza**.", captura: "prestaciones" },
      { texto: "Repetí «Agregar» por cada prestación que necesite el paciente. Con el tachito de la derecha sacás una." },
      { texto: "Si querés, escribí una nota en **Notas** y tocá «Guardar» (se activa cuando hay al menos una prestación). El plan se crea y se abre.", captura: "guardar" },
      { texto: "A la izquierda ves el **Avance del plan** (hoy, «0 / 2 prestaciones realizadas») y, a la derecha, la lista de prestaciones. Tocá el lápiz de al lado del nombre del plan y poné uno que lo identifique: se guarda con Enter.", captura: "plan" },
      { texto: "El plan queda en la lista, bajo **Otros** y con el estado «Borrador»: todavía no está aceptado. Quien maneja los montos (la administración o la caja) lo presenta al paciente con sus precios y lo marca como aceptado; recién ahí pasa a **En ejecución**." },
    ],
    avisos: [
      { tipo: "ojo", texto: "Con el rol Dentista no ves precios, descuentos ni totales: los precios salen del arancel y los maneja la caja. La administración y la caja arman los planes desde **Presupuestos**, con precios: [[presentar-y-aceptar-un-presupuesto]]." },
      { tipo: "ojo", texto: "En la lista de prestaciones, la columna «Estado» muestra un carrito rojo («Pendiente») mientras la prestación falta y un tilde verde («Realizada») cuando ya se hizo; no dice si se pagó. Marcarlas como realizadas lo hace la administración: [[marcar-una-prestacion-realizada]]." },
      { tipo: "tip", texto: "«Opciones › Duplicar plan de tratamiento» arma una copia del plan, con todo pendiente, para volver a presentarlo. En un plan ya aceptado, «Finalizar plan» lo cierra." },
      { tipo: "tip", texto: "Con el plan Clínica, «Copilot IA» arma un borrador del plan a partir de una radiografía; lo revisás antes de crearlo." },
      { tipo: "tip", texto: "Cada prestación tiene un campo **Sección** (por ejemplo «Restauraciones» o «Prevención e higiene»): sirve para agrupar el plan. Si lo dejás vacío, la prestación sale bajo «Sección sin nombre». Con **Nombre del plan (opcional)** le ponés nombre desde el principio." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("dentist");
      await abrirFicha(c, "p2", "Juan Ríos"); // Juan Ríos no tiene ningún plan: es el caso de «armar el primero»
      await boton(page, "Planes de tratamiento").click();
      const vacio = page.getByText("Sin planes de tratamiento").locator("xpath=..");
      const nuevo = page.getByRole("button", { name: "Nuevo plan de tratamiento" });
      await c.expect(nuevo).toBeVisible();
      await c.foto("planes", { resaltar: nuevo, recorte: [filaDeGrupos(page), vacio, nuevo] });

      await nuevo.click();
      const modal = page.getByRole("dialog", { name: "Nuevo plan de tratamiento" });
      await c.expect(modal.getByRole("button", { name: "Guardar" })).toBeDisabled(); // sin prestaciones no se puede guardar
      await modal.getByRole("button", { name: "Agregar" }).click();
      await modal.locator("select").first().selectOption({ label: "D2330 — Resina compuesta — 1 superficie" });
      await modal.getByPlaceholder("Pieza").first().fill("21");
      await modal.getByRole("button", { name: "Agregar" }).click();
      await modal.locator("select").nth(1).selectOption({ label: "D1110 — Profilaxis (adulto)" });
      await c.foto("prestaciones", {
        resaltar: [modal.getByRole("button", { name: "Agregar" }), modal.locator("select").first(), modal.getByPlaceholder("Pieza").first()],
        recorte: modal,
        margen: 4,
      });
      // El tachito saca una prestación (se prueba con una tercera que no queda).
      await modal.getByRole("button", { name: "Agregar" }).click();
      await c.expect(modal.getByRole("button", { name: "Quitar" })).toHaveCount(3);
      await modal.getByRole("button", { name: "Quitar" }).last().click();
      await c.expect(modal.getByRole("button", { name: "Quitar" })).toHaveCount(2);

      await modal.getByLabel("Notas").fill("Empezar por la pieza 21 (sensibilidad).");
      await c.foto("guardar", { resaltar: [modal.getByLabel("Notas"), modal.getByRole("button", { name: "Guardar" })], recorte: modal, margen: 4 });
      await modal.getByRole("button", { name: "Guardar" }).click();

      await c.expect(page.getByText("Avance del plan")).toBeVisible();
      await page.getByTitle("Renombrar plan").click();
      await page.locator("main input:focus").fill("Resina pieza 21 y limpieza"); // el campo del nombre toma el foco solo
      await page.keyboard.press("Enter");
      const titulo = page.getByRole("heading", { level: 2 }).filter({ hasText: "Resina pieza 21 y limpieza" });
      await c.expect(titulo).toBeVisible();
      // Las dos columnas del plan (el panel de la izquierda y la lista de prestaciones), enteras.
      const columnas = page.getByText("Avance del plan").locator("xpath=ancestor::div[contains(@class,'lg:grid-cols')][1]");
      await c.foto("plan", { resaltar: page.getByTitle("Renombrar plan"), recorte: columnas, margen: 4 });

      // Lo que el texto cuenta y no se fotografía: el plan queda en «Otros» (sin aceptar) y no tiene precios a la vista.
      await page.getByRole("button", { name: "Planes", exact: true }).click();
      await c.expect(page.getByRole("heading", { name: "Otros" })).toBeVisible();
      await c.expect(page.getByRole("heading", { name: "En ejecución" })).toHaveCount(0);
      await c.expect(page.locator("main")).not.toContainText(/Gs\.?\s?\d/);
    },
  },


  /* ───────────────────────────── 11 · Receta ───────────────────────────── */
  {
    id: "hacer-una-receta",
    capitulo: "dentist",
    titulo: "Hacer una receta",
    roles: ["dentist", "admin"],
    paraQue: "Cuando le indicás un medicamento al paciente: armás la receta con una plantilla, la imprimís o se la mandás por correo, y queda guardada en su ficha.",
    pasos: [
      { texto: "En la ficha, entrá a **Ficha clínica › Recetas** y tocá «Nueva receta».", captura: "nueva" },
      { texto: "En **Plantilla**, elegí un modelo: «Antibiótico estándar», «Post-exodoncia», «Analgesia simple» o «Receta en blanco». Trae los medicamentos y las indicaciones ya escritos.", captura: "plantilla" },
      { texto: "Ajustá los medicamentos (**Medicamento**, **Dosis**, **Frecuencia** y **Duración**). «Agregar medicamento» suma una fila y el tachito saca una. Si la receta es de un tratamiento, elegilo en **Plan de tratamiento (opcional)**.", captura: "medicamentos" },
      { texto: "Revisá las **Indicaciones** y tocá «Emitir receta»." },
      { texto: "Se abre la receta lista para imprimir, con el membrete de la clínica y tu nombre al pie. Tocá «Imprimir / PDF» para sacarla en papel o guardarla como PDF, y «Cerrar» cuando termines.", captura: "impresa" },
      { texto: "La receta queda en la lista, la más nueva arriba. Desde ahí podés «Enviar» (por correo, al paciente), «Imprimir», «Duplicar» (arma otra parecida) o «Anular».", captura: "lista" },
    ],
    avisos: [
      { tipo: "ojo", texto: "«Anular» no borra: pide confirmación y la receta queda en la ficha marcada como anulada (se ve con «Mostrar anuladas»)." },
      { tipo: "ojo", texto: "«Enviar» manda la receta al correo que figura en la ficha del paciente. Si no tiene uno cargado, avisa «El paciente no tiene email cargado»: pedile a la recepción que lo cargue, porque con este rol no ves los datos personales." },
      { tipo: "tip", texto: "«Duplicar» es lo más rápido para repetir una receta: abre el formulario con los mismos medicamentos para que cambies lo que haga falta. El filtro **Tratamiento**, arriba, muestra solo las recetas de un plan." },
      { tipo: "revisar", texto: "Las plantillas de receta («Antibiótico estándar», «Post-exodoncia», «Analgesia simple») son ejemplos de Novudent: confirmar con un odontólogo que las dosis y las indicaciones sirven tal cual." },
      { tipo: "revisar", texto: "No se pudo probar «Enviar»: en la demo el envío de correos no está disponible. Confirmar con una clínica real." },
      { tipo: "ojo", texto: "La receta impresa muestra el nombre del paciente, pero no su CI: con el rol Dentista no se ven los datos personales. Si la necesitás en la receta, la administración te lo puede dar en **Permisos del equipo** («Ver y editar los datos personales del paciente»)." }
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("dentist");
      await abrirFicha(c, "p1", "María González");
      await boton(page, "Recetas").click();
      const titulo = page.getByRole("heading", { name: "Recetas", exact: true });
      const primera = page.getByRole("button", { name: "Duplicar" }).first().locator("xpath=ancestor::div[contains(@class,'p-4')][1]");
      await c.foto("nueva", { resaltar: boton(page, "Nueva receta"), recorte: [titulo.locator("xpath=.."), primera], margen: 8 });

      await boton(page, "Nueva receta").click();
      const modal = page.getByRole("dialog", { name: "Nueva receta" });
      await modal.getByLabel("Plantilla").selectOption({ label: "Post-exodoncia" });
      await c.expect(modal.getByPlaceholder("Medicamento").first()).toHaveValue("Ibuprofeno 400 mg");
      await c.foto("plantilla", { resaltar: modal.getByLabel("Plantilla"), recorte: modal, margen: 4 });
      await c.foto("medicamentos", {
        resaltar: [modal.getByPlaceholder("Medicamento").first().locator("xpath=ancestor::div[contains(@class,'space-y-2')][1]"), modal.getByLabel("Plan de tratamiento (opcional)")],
        recorte: modal,
        margen: 4,
      });
      await modal.getByRole("button", { name: "Emitir receta" }).click();

      const receta = page.getByRole("dialog", { name: "Receta" });
      await c.foto("impresa", { resaltar: receta.getByRole("button", { name: "Imprimir / PDF" }), recorte: receta, margen: 4 });
      // «Imprimir / PDF» abre el cuadro de impresión del navegador: se lo reemplaza para comprobar que se lo llama.
      await vigilarImpresion(page);
      await receta.getByRole("button", { name: "Imprimir / PDF" }).click();
      await c.expect.poll(() => seImprimio(page)).toBe(true);
      await receta.getByRole("button", { name: "Cerrar" }).first().click();
      const nueva = page.getByRole("button", { name: "Duplicar" }).first().locator("xpath=ancestor::div[contains(@class,'p-4')][1]");
      // Los cuatro botones, en un solo recuadro (con cuatro, los números se apretarían).
      await c.foto("lista", { resaltar: nueva.getByRole("button", { name: "Duplicar" }).locator("xpath=.."), recorte: nueva, margen: 8 });

      // Lo que el texto cuenta y no se fotografía: «Duplicar», «Anular» (con confirmación) y «Enviar» sin correo cargado.
      await nueva.getByRole("button", { name: "Duplicar" }).click();
      await c.expect(page.getByRole("dialog", { name: "Nueva receta (duplicada)" })).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
      page.once("dialog", (d) => { c.expect(d.message()).toContain("¿Anular esta receta?"); void d.accept(); });
      await nueva.getByRole("button", { name: "Anular" }).click();
      await c.expect(page.getByText(/Mostrar anuladas \(1\)/)).toBeVisible();
      await abrirFicha(c, "p2", "Juan Ríos"); // Juan Ríos no tiene correo cargado
      await boton(page, "Recetas").click();
      await boton(page, "Nueva receta").click();
      await modal.getByLabel("Plantilla").selectOption({ label: "Analgesia simple" });
      await modal.getByRole("button", { name: "Emitir receta" }).click();
      await receta.getByRole("button", { name: "Cerrar" }).first().click();
      await page.getByRole("button", { name: "Enviar" }).click();
      await c.expect(page.getByText("El paciente no tiene email cargado.")).toBeVisible();
    },
  },

  /* ───────────────────────────── 12 · Ortodoncia ───────────────────────────── */
  {
    id: "seguir-un-tratamiento-de-ortodoncia",
    capitulo: "dentist",
    titulo: "Seguir un tratamiento de ortodoncia",
    roles: ["dentist", "admin"],
    paraQue: "En cada control del paciente de ortodoncia, para anotar lo que hiciste (activación, cambio de arco, elásticos), actualizar los datos del aparato y ver cuánto lleva del tratamiento.",
    antes: ["El paciente tiene un plan de ortodoncia: en su **Planes de tratamiento**, la especialidad del plan dice «Ortodoncia»."],
    pasos: [
      { texto: "En la ficha del paciente (por ejemplo, Marco Giménez), tocá **Planes de tratamiento** y abrí el plan de ortodoncia tocando su nombre. Se abre en la pestaña **Ortodoncia**, con cinco sub-pestañas: **Resumen**, **Plantilla Fotográfica**, **Diagnóstico**, **Plan de tratamiento** y **Rx y CF**." },
      { texto: "En **Resumen** ves dos círculos de avance —**Calendario** (cuánto tiempo pasó) y **Real** (el avance clínico)—, los meses que lleva y los datos del aparato: arcos, elásticos y próximo control.", captura: "resumen" },
      { texto: "Para anotar lo que hiciste hoy, tocá «Nueva evolución», escribí la acción realizada (activación, cambio de arco, colocación de elásticos, higiene…) y tocá «Guardar evolución».", captura: "evolucion" },
      { texto: "La evolución queda en **Última evolución**, con tu nombre y la fecha.", captura: "ultima" },
      { texto: "Para actualizar los datos del seguimiento (duración, avance real, arcos, elásticos, próximo control o las indicaciones para la próxima sesión), tocá «Editar», cambiá lo que haga falta y tocá «Guardar».", captura: "editar" },
      { texto: "En **Diagnóstico** escribí o corregí el diagnóstico ortodóncico: apenas cambiás el texto aparece «Guardar».", captura: "diagnostico" },
      { texto: "En **Plantilla Fotográfica**, «Subir foto» agrega las fotos intraorales y extraorales del seguimiento. **Rx y CF** son las radiografías del paciente: [[subir-una-radiografia]].", captura: "fotos" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Las evoluciones de ortodoncia no se editan ni se borran una vez guardadas: cada control se suma a la lista." },
      { tipo: "ojo", texto: "La cuota mensual no se ve con este rol: la carga la caja." },
      { tipo: "tip", texto: "Para ver de un vistazo a todos tus pacientes de ortodoncia, con su avance y los controles atrasados, entrá a **Pacientes › Análisis de estudios específicos › Ortodoncia**." },
      { tipo: "tip", texto: "La sub-pestaña **Plan de tratamiento** lista las prestaciones del plan de ortodoncia, solo para leer." },
      { tipo: "revisar", texto: "La pantalla no trae ningún botón para crear un plan de ortodoncia: «Nuevo plan de tratamiento» arma planes «General». Hoy el plan de ortodoncia de la demo viene cargado de fábrica; confirmar cómo se da de alta uno nuevo en una clínica." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("dentist");
      await abrirFicha(c, "p6", "Marco Giménez");
      await boton(page, "Planes de tratamiento").click();
      const plan = page.getByRole("button", { name: /#g2: Ortodoncia fija superior e inferior/ });
      await c.expect(plan).toBeVisible();
      await c.expect(plan).toContainText("Ortodoncia");
      await plan.click();
      const sub = (nombre: string) => boton(page, nombre);
      const filaOrtodoncia = sub("Plantilla Fotográfica").locator("xpath=..");
      const seguimiento = page.getByText("Seguimiento del tratamiento").locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
      await c.expect(seguimiento).toBeVisible();
      await c.foto("resumen", { resaltar: filaOrtodoncia, recorte: [filaOrtodoncia, seguimiento], margen: 4 });

      await sub("Nueva evolución").click();
      const evolucion = page.getByRole("dialog", { name: "Nueva evolución" });
      await evolucion.getByLabel("Acción realizada / observaciones").fill("Activación y cambio de ligaduras. Se colocan elásticos clase II. Buena higiene.");
      await c.foto("evolucion", {
        resaltar: [evolucion.getByLabel("Acción realizada / observaciones"), evolucion.getByRole("button", { name: "Guardar evolución" })],
        recorte: evolucion,
        margen: 4,
      });
      await evolucion.getByRole("button", { name: "Guardar evolución" }).click();
      const ultima = page.getByRole("heading", { name: "Última evolución" }).locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
      await c.expect(ultima).toContainText("Activación y cambio de ligaduras.");
      await c.foto("ultima", { resaltar: ultima, recorte: ultima, margen: 4 });

      await sub("Editar").click();
      const edicion = page.getByRole("dialog", { name: "Editar seguimiento de ortodoncia" });
      await edicion.getByLabel("Último arco superior").fill("NiTi 0.018");
      await edicion.getByLabel("Último arco inferior").fill("NiTi 0.016");
      await c.foto("editar", {
        resaltar: [edicion.getByLabel("Último arco superior"), edicion.getByRole("button", { name: "Guardar" })],
        recorte: edicion,
        margen: 4,
      });
      await edicion.getByRole("button", { name: "Guardar" }).click();
      await c.expect(page.getByText("NiTi 0.018")).toBeVisible(); // el Resumen ya muestra el arco nuevo

      await sub("Diagnóstico").click();
      const dx = page.getByPlaceholder("Clase, apiñamiento, mordida, plan…");
      await dx.fill("Clase II división 1 — apiñamiento moderado superior e inferior. Se indican elásticos de clase II.");
      await c.foto("diagnostico", {
        resaltar: [dx, page.getByRole("button", { name: "Guardar" })],
        recorte: page.getByRole("heading", { name: "Diagnóstico ortodóncico" }).locator("xpath=ancestor::div[contains(@class,'p-5')][1]"),
        margen: 4,
      });
      await page.getByRole("button", { name: "Guardar" }).click();
      await c.expect(page.getByRole("button", { name: "Guardar" })).toHaveCount(0); // sin cambios pendientes, el botón se va

      await sub("Plantilla Fotográfica").click();
      const fotos = page.getByRole("heading", { name: "Plantilla fotográfica" }).locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
      await c.expect(fotos).toBeVisible();
      await c.foto("fotos", { resaltar: sub("Subir foto"), recorte: fotos, margen: 4 });
      // «Subir foto» se prueba con una imagen chica generada al vuelo (sin el diálogo del sistema): queda en la plantilla con su nombre.
      await fotos.locator('input[type="file"]').setInputFiles({ name: "intraoral-frontal.png", mimeType: "image/png", buffer: await pngPanoramica(320, 160) });
      await c.expect(fotos.getByText("intraoral-frontal.png")).toBeVisible();

      // El atajo del tip: Pacientes › Análisis de estudios específicos › Ortodoncia lista a los pacientes con tratamiento en curso.
      await c.ir("/app/pacientes");
      await page.getByRole("button", { name: "Análisis de estudios específicos" }).click();
      await page.getByRole("button", { name: "Ortodoncia", exact: true }).click();
      await c.expect(page.getByText("Marco").first()).toBeVisible();
    },
  },
];
