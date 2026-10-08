import type { Page } from "@playwright/test";
import type { Procedimiento } from "./tipos";

/* Ayudas de las capturas de este capítulo (solo corren dentro de `capturar`; el texto del manual no las usa).
 *
 * La demo siembra sus citas en la semana en curso (de lunes a viernes): si la captura abriera «hoy», un sábado o un domingo la agenda
 * saldría vacía. Por eso se elige siempre un día de esa semana y, para dar citas nuevas, la semana que viene (que está toda libre). */

/** AAAA-MM-DD (hora local de la clínica) del lunes de esta semana, más `semanas` semanas y `dias` días. */
const fechaDeSemana = (page: Page, semanas = 0, dias = 0) =>
  page.evaluate(([s, d]) => {
    const x = new Date();
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7 * s + d);
    return x.toLocaleDateString("en-CA");
  }, [semanas, dias] as const);

/** Va a ese día en la agenda (lo que hace el botón «Fecha» de arriba). */
const irAlDia = (page: Page, fecha: string) => page.getByLabel("Elegir fecha").fill(fecha);

/** Saca el mouse de en medio: si quedara sobre un botón, la captura lo mostraría «con el dedo encima». */
const sinMouse = (page: Page) => page.mouse.move(0, 0);

/** Quita el foco del campo en el que se escribió último (si no, la captura lo muestra con el borde azul o con un pedazo de la fecha marcado). */
const sinFoco = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

/** El nombre de un espacio de la grilla semanal, como lo dice la agenda: «Mié 14 oct · 12:00» (día `dias` de la semana `semanas`). */
const espacioDeLaGrilla = (page: Page, semanas: number, dias: number, hora: string) =>
  page.evaluate(([s, d, h]) => {
    const x = new Date();
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7 * s + d);
    const nombres = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${nombres[x.getDay()]} ${x.getDate()} ${meses[x.getMonth()]} · ${h}`;
  }, [semanas, dias, hora] as const);

/** Alto de ventana para los menús largos (la lista de estados mide unos 650 px y es de posición fija: con la ventana de siempre no se alcanza a tocar). */
const VENTANA_ALTA = { width: 1280, height: 1200 } as const;

export const procedimientos: Procedimiento[] = [
  {
    id: "dar-una-cita",
    capitulo: "receptionist",
    titulo: "Dar una cita",
    roles: ["receptionist", "cashier", "commercial", "admin"],
    paraQue: "Cuando un paciente pide un horario, por teléfono, por WhatsApp o en el mostrador. La cita queda en la agenda del profesional como «No confirmado».",
    antes: ["El nombre o la CI del paciente a mano. Si todavía no tiene ficha, la cargás en el mismo momento (paso 2)."],
    pasos: [
      { texto: "Entrá a **Agenda** y tocá «Dar cita», arriba a la derecha.", captura: "agenda" },
      { texto: "En **Paciente**, escribí la CI (con o sin puntos) o el nombre y elegí al paciente de la lista, que sale como «CI | NOMBRE». Si no tiene ficha, tocá «Crear nuevo paciente», al final de la lista.", captura: "paciente" },
      { texto: "Elegí el **Tipo de consulta** (filtra a los profesionales por especialidad), el **Profesional** y la **Duración**; por defecto son 30 minutos. Si hay varias sucursales o boxes, elegí también cuál." },
      { texto: "En **Procedimiento a realizar** marcá qué se le va a hacer: tildá las prestaciones pendientes de sus planes de tratamiento, o agregá una del arancel («Agregar otra prestación») u otro motivo escrito a mano. La primera es el título de la cita en la agenda.", captura: "procedimiento" },
      { texto: "A la derecha, en **Agenda disponible**, tocá el horario que le sirve al paciente. Solo salen los horarios libres donde entra la consulta; con las flechas, «Hoy» o el calendario («Ir a la fecha») cambiás de semana.", captura: "horario" },
      { texto: "Tocá «Crear cita». La ventana se cierra y la cita aparece en la agenda, en el día elegido, como «No confirmado».", captura: "cita-creada" },
      { texto: "Si el paciente necesita varias citas con los mismos datos (por ejemplo, un control por semana), tildá «Multiconsulta (varias citas)» y tocá un horario por cada cita (también en otras semanas): el botón pasa a decir «Crear 2 citas», «Crear 3 citas»…", captura: "multiconsulta" },
      { texto: "Si ningún horario le sirve, tildá «Agregar a la lista de espera», escribí su **Preferencia horaria** y tocá «Agregar a la lista de espera». Mirá [[usar-la-lista-de-espera]]." },
    ],
    avisos: [
      { tipo: "ojo", texto: "Dar la cita no le manda ningún correo al paciente, y queda «No confirmado» hasta que alguien cambie su estado. Para avisarle, usá «Notificar por mail»: mirá [[cambiar-el-estado-de-una-cita]]." },
      { tipo: "ojo", texto: "Los pacientes deshabilitados no aparecen en la búsqueda. Si no encontrás a alguien, probá con la CI sin puntos o con el apellido." },
      { tipo: "tip", texto: "En la vista **Semanal**, tocar un espacio abre su menú: «Dar cita presencial», «Dar cita por videoconsulta», «Dar múltiples citas», «Sobreagendar en este horario» y «Bloquear espacio». Las cuatro primeras abren «Dar cita» con ese día y esa hora ya elegidos. Mirá [[sobreagendar-una-cita]] y [[bloquear-un-espacio-de-la-agenda]]." },
      { tipo: "ojo", texto: "Los espacios bloqueados (almuerzo, reunión, feriado) no aparecen en **Agenda disponible**: en ese horario no se puede dar cita." },
      { tipo: "revisar", texto: "Las prestaciones que se eligen en «Procedimiento a realizar» no se marcan solas como realizadas en el plan cuando se atiende la cita: eso se sigue haciendo en el plan de tratamiento. Confirmar con Camila si hace falta." },
      { tipo: "tip", texto: "El **Comentario** (opcional) se lee en la agenda tocando el globito de la cita: sirve para dejarle un aviso al doctor." },
      { tipo: "revisar", texto: "La agenda ofrece turnos de lunes a sábado, de 08:00 a 18:00, cada 30 minutos, para todos los profesionales, y la pantalla no deja cambiar ese horario por profesional. Confirmar si alcanza para las clínicas." },
      { tipo: "revisar", texto: "Con la integración de WhatsApp (plan Clínica), al crear la cita el sistema deja preparado el mensaje de confirmación para el paciente. La demo no manda mensajes: no pude verificar que salga ni cómo se lee." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const main = page.locator("main");
      await c.entrar("receptionist", "/app/agenda");

      // Primero se muestra una agenda con citas (el lunes de esta semana); después se da la cita la semana que viene, que está libre.
      await irAlDia(page, await fechaDeSemana(page));
      await c.foto("agenda", {
        resaltar: [page.getByRole("navigation").first().getByRole("link", { name: "Agenda", exact: true }), main.getByRole("button", { name: "Dar cita" })],
        recorte: [page.getByRole("banner"), page.getByRole("navigation").first(), main.getByRole("button", { name: "Dar cita" })],
      });

      await irAlDia(page, await fechaDeSemana(page, 1));
      await main.getByRole("button", { name: "Dar cita" }).click();
      const modal = page.getByRole("dialog", { name: "Dar cita" });
      const paciente = modal.getByRole("combobox", { name: "Paciente" });
      await paciente.fill("3.456.789");
      const opcion = modal.getByRole("option", { name: "3.456.789 | MARÍA GONZÁLEZ" });
      await c.expect(opcion).toBeVisible();
      await c.foto("paciente", { alto: 1000, margen: 4, resaltar: [paciente, opcion], recorte: modal });
      await opcion.click();

      // María tiene un plan con prestaciones pendientes: se tilda la resina de la pieza 16.
      const procedimiento = modal.getByRole("group", { name: "Procedimiento a realizar" });
      const resina = procedimiento.getByRole("checkbox", { name: "Resina compuesta — 1 superficie · pieza 16" });
      await resina.check();
      await c.foto("procedimiento", { alto: 1000, margen: 4, resaltar: resina.locator("xpath=ancestor::label[1]"), recorte: procedimiento });

      // El lunes de la semana que viene arranca la grilla: las 09:00 están libres.
      const nueve = modal.getByRole("button", { name: /^lunes, .*09:00$/ }).first();
      await nueve.click();
      await sinMouse(page);
      await c.foto("horario", {
        alto: 1000,
        margen: 8,
        resaltar: nueve,
        recorte: [modal.getByRole("heading", { name: /^Agenda disponible/ }), modal.getByRole("status")],
      });

      await modal.getByRole("button", { name: "Crear cita" }).click();
      await c.expect(modal).toBeHidden();
      const fila = main.getByRole("row", { name: /María González/ });
      await c.expect(fila).toBeVisible();
      await c.foto("cita-creada", { margen: 2, resaltar: fila.getByRole("button", { name: "No confirmado" }), recorte: [main.getByText("lunes", { exact: true }), main.getByRole("table")] });

      // Varias citas de una vez: otra paciente, con «Multiconsulta».
      await main.getByRole("button", { name: "Dar cita" }).click();
      const otra = page.getByRole("dialog", { name: "Dar cita" });
      await otra.getByRole("combobox", { name: "Paciente" }).fill("Ortega");
      await otra.getByRole("option", { name: /CAMILA ORTEGA/ }).click();
      const multi = otra.getByText("Multiconsulta (varias citas)", { exact: true });
      await multi.click();
      const lunes = otra.getByRole("button", { name: /^lunes, .*10:00$/ }).first();
      const miercoles = otra.getByRole("button", { name: /^miércoles, .*10:00$/ }).first();
      await lunes.click();
      await miercoles.click();
      const crear2 = otra.getByRole("button", { name: "Crear 2 citas" });
      await c.expect(crear2).toBeVisible();
      await sinMouse(page);
      await c.foto("multiconsulta", {
        alto: 1000,
        margen: 4,
        resaltar: [multi.locator("xpath=ancestor::label[1]"), lunes, miercoles, crear2],
        recorte: otra,
      });
    },
  },
  {
    id: "sobreagendar-una-cita",
    capitulo: "receptionist",
    titulo: "Sobreagendar una cita (sobrecupo)",
    roles: ["receptionist", "cashier", "commercial", "admin"],
    paraQue: "Cuando hay que darle un turno a un paciente en un horario que ya tiene otra cita del mismo profesional o del mismo box: una urgencia, un control corto entre dos pacientes.",
    pasos: [
      { texto: "En **Agenda**, vista **Semanal**, pasá el mouse por la cita que ya está en ese horario y tocá el «+» de arriba a la derecha (en el celular el «+» se ve siempre).", captura: "mas" },
      { texto: "Se abre «Dar cita» con **Sobreagendar** tildado y el día, la hora, el profesional y el box de esa cita ya elegidos. Los horarios que ya tienen una cita salen con el borde ámbar; al pasar el mouse dicen «Ya hay 1 cita».", captura: "dar-cita" },
      { texto: "Elegí al paciente, si hace falta el procedimiento, y tocá «Crear cita». La cita queda en la agenda con la marca «Sobrecupo», al lado de la otra.", captura: "sobrecupo" },
    ],
    avisos: [
      { tipo: "tip", texto: "También se sobreagenda desde el menú de un espacio de la Semanal («Sobreagendar en este horario»), desde ⋮ en la fila de la cita en la **Diaria** o desde «Ver». O en cualquier «Dar cita», tildando **Sobreagendar**." },
      { tipo: "ojo", texto: "Un espacio bloqueado no se puede sobreagendar: con «Sobreagendar» tampoco aparece. Mirá [[bloquear-un-espacio-de-la-agenda]]." },
      { tipo: "ojo", texto: "La marca «Sobrecupo» queda solo si de verdad comparte el horario con otra cita. Si con «Sobreagendar» elegís un horario libre, es una cita común." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const main = page.locator("main");
      await c.entrar("receptionist", "/app/agenda");
      // Más ancha que de costumbre: con dos citas en el mismo horario cada tarjeta es la mitad de la columna y la marca «Sobrecupo» se cortaba.
      await page.setViewportSize({ width: 1600, height: 1000 });

      // La semana que viene está libre: primero se le da a Andrés Mejía el martes a las 10:00; después se sobreagenda encima.
      await irAlDia(page, await fechaDeSemana(page, 1, 1));
      await main.getByRole("button", { name: "Dar cita" }).click();
      const dar = page.getByRole("dialog", { name: "Dar cita" });
      await dar.getByRole("combobox", { name: "Paciente" }).fill("Mejía");
      await dar.getByRole("option", { name: /ANDRÉS MEJÍA/ }).click();
      await dar.getByRole("button", { name: /^martes, .*10:00$/ }).first().click();
      await dar.getByRole("button", { name: "Crear cita" }).click();
      await c.expect(dar).toBeHidden();

      await main.getByRole("button", { name: "Semanal" }).click();
      await main.getByRole("button", { name: "Semana siguiente" }).click();
      const tarjeta = main.getByRole("button", { name: /Andrés Mejía/ });
      await tarjeta.hover();
      const mas = tarjeta.locator("..").getByRole("button", { name: "Sobreagendar en este horario" });
      await c.expect(mas).toBeVisible();
      await c.foto("mas", { conFoco: true, margen: 60, resaltar: mas, recorte: tarjeta });
      await mas.click();

      const sobre = page.getByRole("dialog", { name: "Dar cita" });
      const diez = sobre.getByRole("button", { name: /^martes, .*10:00$/ });
      await c.expect(diez).toHaveAttribute("title", "Ya hay 1 cita");
      await sobre.getByRole("combobox", { name: "Paciente" }).fill("Ferreira");
      await sobre.getByRole("option", { name: /LUCÍA FERREIRA/ }).click();
      await sinMouse(page);
      await c.foto("dar-cita", {
        alto: 1000,
        margen: 4,
        resaltar: [sobre.getByText("Sobreagendar", { exact: true }).locator("xpath=ancestor::div[1]"), diez],
        recorte: sobre,
      });
      await sobre.getByRole("button", { name: "Crear cita" }).click();
      await c.expect(sobre).toBeHidden();

      const nueva = main.getByRole("button", { name: /Sobrecupo/ });
      await c.expect(nueva).toBeVisible();
      await sinMouse(page);
      await c.foto("sobrecupo", { margen: 40, resaltar: nueva, recorte: [tarjeta, nueva] });
    },
  },
  {
    id: "bloquear-un-espacio-de-la-agenda",
    capitulo: "receptionist",
    titulo: "Bloquear un espacio de la agenda",
    roles: ["receptionist", "cashier", "commercial", "admin"],
    paraQue: "Para que nadie dé citas en un horario: el almuerzo de un profesional, una reunión, una capacitación, vacaciones o un feriado. En ese horario tampoco se puede reservar desde la agenda online.",
    pasos: [
      { texto: "En **Agenda**, vista **Semanal**, tocá el espacio donde empieza el bloqueo y elegí «Bloquear espacio».", captura: "menu" },
      { texto: "Elegí el **Profesional** (o «Todos los profesionales»), el **Box** si hay que bloquear uno solo, y revisá la **Fecha**, **Desde** y **Hasta** (van de a 15 minutos; «Hasta 24:00» es hasta el final del día). Escribí el **Motivo** o tocá una de las sugerencias: Almuerzo, Reunión, Capacitación, Vacaciones o Feriado." },
      { texto: "Si se repite, en **Repetir** elegí «Todos los días hábiles (lunes a sábado)» o «Todas las semanas», y en **Repetir hasta**, hasta qué día (como mucho, un año). Abajo dice cuántos bloqueos se van a crear.", captura: "formulario" },
      { texto: "Tocá «Bloquear». El espacio queda rayado en gris con el motivo; en la **Diaria** sale arriba de la tabla, en «Espacios bloqueados», y en la **Diaria global**, como una tarjeta gris.", captura: "bloqueado" },
      { texto: "Para quitarlo, tocalo en la **Semanal** (o «Quitar» en la Diaria) y elegí «Quitar este bloqueo». Si se repetía, «Quitar toda la serie» saca todos los días juntos (pide confirmación).", captura: "quitar" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Bloquear no borra ni mueve las citas que ya había en ese horario: el formulario avisa «Ya hay 1 cita en ese horario; siguen en la agenda». Si hay que moverlas, mirá [[reprogramar-una-cita]]." },
      { tipo: "tip", texto: "Un bloqueo de «Todos los profesionales» sirve para un feriado o para cerrar la clínica unas horas." },
      { tipo: "ojo", texto: "Un bloqueo de un solo box no saca turnos de la agenda online: el paciente no elige box. Para cortar la agenda online de un profesional, bloquealo a él." },
      { tipo: "ojo", texto: "El dentista y la asistente ven los espacios bloqueados, pero no pueden bloquear ni quitar bloqueos." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const main = page.locator("main");
      await c.entrar("receptionist", "/app/agenda");
      await page.setViewportSize({ width: 1280, height: 1000 });
      await main.getByRole("button", { name: "Semanal" }).click();
      await main.getByRole("button", { name: "Semana siguiente" }).click();

      // El miércoles de la semana que viene a las 12:00: el almuerzo de la Dra. Sofía, de lunes a sábado.
      const etiqueta = await espacioDeLaGrilla(page, 1, 2, "12:00");
      const celda = main.getByRole("button", { name: etiqueta, exact: true });
      await celda.click();
      const menu = page.getByRole("menu", { name: etiqueta });
      const bloquear = menu.getByRole("menuitem", { name: "Bloquear espacio" });
      await c.expect(bloquear).toBeVisible();
      await c.foto("menu", { margen: 4, resaltar: bloquear, recorte: [celda, menu] });
      await bloquear.click();

      const modal = page.getByRole("dialog", { name: "Bloquear espacio" });
      const profesional = modal.getByLabel("Profesional");
      const hasta = modal.getByLabel("Hasta", { exact: true });
      const almuerzo = modal.getByRole("button", { name: "Almuerzo", exact: true });
      const repetir = modal.getByLabel("Repetir", { exact: true });
      await profesional.selectOption({ label: "Dra. Sofía Benítez" });
      await hasta.selectOption("13:00");
      await almuerzo.click();
      await repetir.selectOption({ label: "Todos los días hábiles (lunes a sábado)" });
      await c.expect(modal.getByRole("status").filter({ hasText: "bloqueos" })).toBeVisible();
      await sinMouse(page);
      await c.foto("formulario", { alto: 1000, margen: 4, resaltar: [profesional, hasta, almuerzo, repetir], recorte: modal });
      await modal.getByRole("button", { name: "Bloquear", exact: true }).click();
      await c.expect(modal).toBeHidden();

      const grilla = page.locator('div[class*="max-h-[560px]"]');
      const bloqueado = main.getByRole("button", { name: /^Bloqueado 12:00–13:00 · Almuerzo/ }).first();
      await c.expect(bloqueado).toBeVisible();
      await sinMouse(page);
      await c.foto("bloqueado", { resaltar: bloqueado, recorte: grilla });

      await bloqueado.click();
      const opciones = page.getByRole("menu", { name: "Espacio bloqueado" });
      const serie = opciones.getByRole("menuitem", { name: "Quitar toda la serie" });
      await c.expect(serie).toBeVisible();
      await c.foto("quitar", { margen: 4, resaltar: [opciones.getByRole("menuitem", { name: "Quitar este bloqueo" }), serie], recorte: [bloqueado, opciones] });
    },
  },
  {
    id: "cambiar-el-estado-de-una-cita",
    capitulo: "receptionist",
    titulo: "Confirmar, anular o cambiar el estado de una cita",
    roles: ["receptionist", "cashier", "commercial", "admin"],
    paraQue: "A medida que el paciente avanza: confirma, llega, pasa al consultorio, se atiende, avisa que no viene o no aparece. Con el estado al día, toda la clínica sabe en qué está cada cita.",
    pasos: [
      { texto: "En **Agenda**, vista **Diaria**, buscá la cita (cambiá de día con las flechas o con «Fecha») y tocá su estado, en la columna **Estado de la cita**: se abre la lista de estados.", captura: "menu" },
      { texto: "Elegí el estado nuevo. Los de todos los días: «Confirmado» (avisó que viene), «En sala de espera» (llegó), «Atendiéndose» (pasó al consultorio) y «Atendido» (terminó).", captura: "confirmado" },
      { texto: "«No asiste» y «Anulado» te piden el **motivo** en una ventanita del navegador: escribilo y aceptá. El motivo queda debajo del estado y el horario se libera.", captura: "anulado" },
      { texto: "Para avisarle al paciente cómo quedó su cita, abrí la lista de estados y tocá «Notificar por mail», la primera opción: le llega un correo con el estado actual. Si el paciente no tiene correo cargado, la opción dice «(sin email)» y no se puede tocar.", captura: "notificar" },
      { texto: "Para que el paciente confirme o anule por su cuenta, tocá ⋮ en la fila y elegí «Ver». En **Confirmación de cita**, «Enviar al correo» le manda el link por mail, «Copiar link» te lo deja listo para pegarlo en WhatsApp y «Marcar como enviado» pasa el aviso de «Pendiente» a «Enviado».", captura: "ver" },
      { texto: "El paciente abre el link, sin usuario ni contraseña, y toca «Confirmar cita» o «Anular cita». La cita cambia sola a «Confirmado por WhatsApp» (o «por email») o a «Anulado por el paciente», y en **Confirmación de cita** aparece «Respondió»." },
    ],
    avisos: [
      { tipo: "ojo", texto: "Cambian estados la recepción, la caja y la administración: el dentista y la asistente ven el estado de la cita, pero no los botones para cambiarlo." },
      { tipo: "ojo", texto: "Si cancelás la ventanita del motivo, el estado no cambia; si la aceptás en blanco, queda «Sin motivo». Una cita «Anulado» no se borra: pasa a la pestaña **Reprogramación** para volver a darla ([[reprogramar-una-cita]]); una «No asiste», no." },
      { tipo: "tip", texto: "Además de los siete estados de fábrica hay otros que dejan constancia de cómo se avisó o confirmó («Notificado por WhatsApp», «Confirmado por teléfono», «Anulado por la clínica»…): se comportan como «No confirmado», «Confirmado» y «Anulado». La administración puede cambiarlos ([[configurar-los-estados-de-cita]])." },
      { tipo: "tip", texto: "Si al marcar «No asiste» o «Anulado» el paciente queda sin ninguna cita futura, el sistema arma una tarea para volver a contactarlo («Faltó a su cita» o «Cita cancelada sin reagendar»): mirá [[trabajar-las-tareas]]." },
      { tipo: "revisar", texto: "No pude verificar que lleguen los correos de «Notificar por mail» y «Enviar al correo»: la demo avisa «En la demo no se envían correos» y no manda nada. Tampoco pude abrir la página que ve el paciente con el link, porque necesita un servicio que la demo no tiene. Probar con una clínica real." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const main = page.locator("main");
      await c.entrar("receptionist", "/app/agenda");
      await page.setViewportSize(VENTANA_ALTA);
      const menu = page.getByRole("menu", { name: "Estado de la cita" });

      // El viernes: Camila (tiene correo cargado) con su cita sin confirmar. De ahí salen el menú, el cambio a «Confirmado» y el detalle.
      await irAlDia(page, await fechaDeSemana(page, 0, 4));
      const camila = main.getByRole("row", { name: /Camila Ortega/ });
      const estadoCamila = camila.getByRole("button", { name: "No confirmado" });
      await estadoCamila.click();
      await c.expect(menu.getByRole("menuitem", { name: "Notificar por mail" })).toBeEnabled();
      await c.foto("menu", { margen: 2, resaltar: estadoCamila, recorte: [camila, menu] });
      await menu.getByRole("menuitem", { name: "Confirmado", exact: true }).click();
      await sinMouse(page);
      await c.foto("confirmado", { margen: 2, resaltar: camila.getByRole("button", { name: "Confirmado" }), recorte: main.getByRole("table") });

      await camila.getByRole("button", { name: "Acciones de la cita" }).click();
      await page.getByRole("menu", { name: "Acciones de la cita" }).getByRole("menuitem", { name: "Ver" }).click();
      const ver = page.getByRole("dialog", { name: "Blanqueamiento — evaluación" });
      await c.expect(ver).toBeVisible();
      await sinMouse(page);
      await c.foto("ver", {
        margen: 4,
        resaltar: [ver.getByRole("button", { name: "Enviar al correo" }), ver.getByRole("button", { name: "Copiar link" }), ver.getByRole("button", { name: "Marcar como enviado" })],
        recorte: ver,
      });
      await ver.getByRole("button", { name: "Cerrar" }).click();

      // El lunes: María (confirmada, con correo). Anular pide el motivo con una ventana del propio navegador (no sale en la captura).
      await irAlDia(page, await fechaDeSemana(page));
      const maria = main.getByRole("row", { name: /María González/ });
      page.once("dialog", (d) => void d.accept("El paciente pidió otro día"));
      await maria.getByRole("button", { name: "Confirmado" }).click();
      await menu.getByRole("menuitem", { name: "Anulado", exact: true }).click();
      await c.expect(maria.getByText("El paciente pidió otro día")).toBeVisible();
      await sinMouse(page);
      await c.foto("anulado", { margen: 2, resaltar: maria.getByRole("cell").nth(3), recorte: main.getByRole("table") });

      // Y se le avisa del cambio: «Notificar por mail» es la primera opción de la misma lista.
      await maria.getByRole("button", { name: "Anulado" }).click();
      const notificar = menu.getByRole("menuitem", { name: "Notificar por mail" });
      await c.expect(notificar).toBeEnabled();
      await c.foto("notificar", { margen: 2, resaltar: notificar, recorte: [maria, menu] });
    },
  },
  {
    id: "reprogramar-una-cita",
    capitulo: "receptionist",
    titulo: "Mover una cita a otro día u horario",
    roles: ["receptionist", "cashier", "commercial", "admin"],
    paraQue: "Cuando el paciente pide cambiar su cita a otro día o a otra hora, o cuando una cita anulada hay que volver a dar.",
    pasos: [
      { texto: "En **Agenda**, buscá la cita, tocá ⋮ en su fila (**Acciones de la cita**) y elegí «Editar».", captura: "acciones" },
      { texto: "Se abre **Editar cita** con el horario actual marcado: tocá el nuevo en **Agenda disponible** (con las flechas cambiás de semana). Si hace falta, cambiá también el profesional, la duración o el comentario.", captura: "editar" },
      { texto: "Tocá «Guardar cambios». La cita pasa al nuevo día y horario, y deja de estar en el anterior.", captura: "movida" },
      { texto: "Si el paciente anuló y todavía no tiene fecha nueva, pasá la cita a «Anulado» ([[cambiar-el-estado-de-una-cita]]): queda en la pestaña **Reprogramación**, que junta las citas anuladas para volver a dar.", captura: "reprogramacion" },
      { texto: "Cuando el paciente tenga fecha, tocá «Reagendar» en su fila: se abre «Dar cita» con el paciente y el profesional ya cargados. Elegí el horario y tocá «Crear cita»." },
    ],
    avisos: [
      { tipo: "ojo", texto: "Mover una cita confirmada no cambia su estado: sigue «Confirmado» aunque el paciente haya confirmado el horario anterior. Si hay que volver a confirmar, pasala a «No confirmado»." },
      { tipo: "ojo", texto: "El sistema no le avisa al paciente del cambio: avisale vos o usá «Notificar por mail» ([[cambiar-el-estado-de-una-cita]])." },
      { tipo: "ojo", texto: "Para cambiar una cita no uses «Eliminar»: la borra sin dejar rastro. Usá «Editar», o «Anulado» si el paciente no viene." },
      { tipo: "tip", texto: "«Reagendar» crea una cita nueva y deja la anulada como estaba: en la agenda se ven las dos." },
      { tipo: "revisar", texto: "Decisión de negocio: ¿al mover una cita confirmada debería volver sola a «No confirmado»? Hoy no lo hace." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const main = page.locator("main");
      await c.entrar("receptionist", "/app/agenda");
      await page.setViewportSize({ width: 1280, height: 1100 });

      // Hace falta una cita futura para moverla: se da una a Lucía el lunes de la semana que viene, a las 10:00.
      await irAlDia(page, await fechaDeSemana(page, 1));
      await main.getByRole("button", { name: "Dar cita" }).click();
      const dar = page.getByRole("dialog", { name: "Dar cita" });
      await dar.getByRole("combobox", { name: "Paciente" }).fill("Ferreira");
      await dar.getByRole("option", { name: /LUCÍA FERREIRA/ }).click();
      await dar.getByRole("button", { name: /^lunes, .*10:00$/ }).first().click();
      await dar.getByRole("button", { name: "Crear cita" }).click();
      await c.expect(dar).toBeHidden();

      const fila = main.getByRole("row", { name: /Lucía Ferreira/ });
      await fila.getByRole("button", { name: "Acciones de la cita" }).click();
      const acciones = page.getByRole("menu", { name: "Acciones de la cita" });
      const editar = acciones.getByRole("menuitem", { name: "Editar" });
      await c.foto("acciones", { margen: 2, resaltar: editar, recorte: [fila, acciones] });
      await editar.click();

      const ed = page.getByRole("dialog", { name: "Editar cita" });
      const nuevo = ed.getByRole("button", { name: /^martes, .*11:00$/ }).first();
      await nuevo.click();
      await sinMouse(page);
      await c.foto("editar", { alto: 1000, margen: 4, resaltar: nuevo, recorte: ed });
      await ed.getByRole("button", { name: "Guardar cambios" }).click();
      await c.expect(ed).toBeHidden();

      await page.getByRole("button", { name: "Día siguiente" }).click();
      const movida = main.getByRole("row", { name: /Lucía Ferreira/ });
      await c.expect(movida).toBeVisible();
      await sinMouse(page);
      await c.foto("movida", { margen: 2, resaltar: movida.getByRole("cell").first(), recorte: [main.getByText("martes", { exact: true }), main.getByRole("table")] });

      // La demo trae una cita anulada (Control post-operatorio): sale en Reprogramación.
      await main.getByRole("button", { name: "Reprogramación" }).click();
      const reagendar = main.getByRole("button", { name: "Reagendar" }).first();
      await c.expect(reagendar).toBeVisible();
      await sinMouse(page);
      await c.foto("reprogramacion", { margen: 2, resaltar: reagendar, recorte: main.getByRole("table") });
    },
  },
  {
    id: "usar-la-lista-de-espera",
    capitulo: "receptionist",
    titulo: "Usar la lista de espera",
    roles: ["receptionist", "cashier", "commercial", "admin"],
    paraQue: "Cuando un paciente quiere un turno antes o no hay horario que le sirva: lo anotás y, apenas se libera un lugar, le das la cita.",
    pasos: [
      { texto: "En **Agenda**, tocá «Lista de espera», arriba a la derecha. El número del botón es cuántos pacientes esperan.", captura: "boton" },
      { texto: "Se abre la lista: cada fila muestra al paciente, el motivo, su preferencia horaria y desde cuándo espera, del que espera hace más al más nuevo.", captura: "lista" },
      { texto: "Para anotar a alguien, tocá «Agregar», elegí al paciente, escribí el **Motivo** (es obligatorio) y la **Preferencia horaria**, por ejemplo «martes a la tarde», y tocá «Guardar».", captura: "agregar" },
      { texto: "Cuando se libere un lugar, tocá «Agendar» en la fila del paciente: se abre «Dar cita» con el paciente ya cargado.", captura: "agendar" },
      { texto: "Elegí el horario y tocá «Crear cita». La cita queda en la agenda y el paciente sale de la lista de espera solo.", captura: "resultado" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Si cerrás «Dar cita» sin crear la cita, el paciente sigue en la lista." },
      { tipo: "tip", texto: "También podés anotar a un paciente desde «Dar cita», tildando «Agregar a la lista de espera»: mirá [[dar-una-cita]]." },
      { tipo: "tip", texto: "El tachito de la fila («Quitar de la lista») saca al paciente sin darle cita, por ejemplo si ya consiguió turno por otro lado." },
      { tipo: "tip", texto: "La lista no avisa sola cuando se libera un lugar: mirala cada vez que anulás o movés una cita." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const main = page.locator("main");
      await c.entrar("receptionist", "/app/agenda");
      await page.setViewportSize({ width: 1280, height: 1000 });
      await irAlDia(page, await fechaDeSemana(page));

      const boton = main.getByRole("button", { name: /Lista de espera/ });
      await c.foto("boton", { resaltar: boton, recorte: [main.getByRole("button", { name: "Dar cita" }), boton] });
      await boton.click();
      const lista = page.getByRole("dialog", { name: "Lista de espera" });
      await c.expect(lista).toBeVisible();
      await sinMouse(page);
      await c.foto("lista", { margen: 4, resaltar: lista.getByRole("listitem").first(), recorte: lista });

      await lista.getByRole("button", { name: "Agregar" }).click();
      const quien = lista.locator("select");
      const motivo = lista.getByPlaceholder("Motivo");
      const preferencia = lista.getByPlaceholder("Preferencia horaria");
      const guardar = lista.getByRole("button", { name: "Guardar" });
      await quien.selectOption({ label: "Marco Giménez" });
      await motivo.fill("Control de ortodoncia");
      await preferencia.fill("martes a la tarde");
      await sinMouse(page);
      await c.foto("agregar", { margen: 4, resaltar: quien.locator("xpath=.."), recorte: lista });
      await guardar.click();

      const lucia = lista.getByRole("listitem").filter({ hasText: "Lucía Ferreira" });
      const agendar = lucia.getByRole("button", { name: "Agendar" });
      await c.expect(agendar).toBeVisible();
      await sinMouse(page);
      await c.foto("agendar", { margen: 4, resaltar: agendar, recorte: lista });
      await agendar.click();

      // «Dar cita» ya trae a Lucía: se toma el primer horario libre, sea hoy o más adelante (depende del día y la hora en que se corra).
      const dar = page.getByRole("dialog", { name: "Dar cita" });
      await c.expect(dar.getByRole("combobox", { name: "Paciente" })).toHaveValue(/LUCÍA FERREIRA/);
      await dar.locator("button[aria-pressed='false']:not([disabled])").first().click();
      await dar.getByRole("button", { name: "Crear cita" }).click();
      await c.expect(dar).toBeHidden();

      await boton.click();
      await c.expect(lista).toBeVisible();
      await c.expect(lista.getByRole("listitem").filter({ hasText: "Lucía Ferreira" })).toHaveCount(0);
      await sinMouse(page);
      await c.foto("resultado", { margen: 4, recorte: lista });
    },
  },
  {
    id: "recorrer-la-agenda",
    capitulo: "receptionist",
    titulo: "Recorrer la agenda: día, semana, mes y filtros",
    roles: ["receptionist", "cashier", "commercial", "admin"],
    paraQue: "Para ver las citas de un día, de la semana o del mes, de todos los profesionales o de uno solo, y para imprimir la agenda.",
    pasos: [
      { texto: "Entrá a **Agenda**: se abre la vista **Diaria**, con las citas del día. Cambiá de día con las flechas de la izquierda o con «Fecha»; si estás en otro día, «Ir a hoy» te devuelve al de hoy.", captura: "diaria" },
      { texto: "Filtrá lo que ves: **profesional**, **sucursal** y **box** (si la clínica tiene más de uno) arriba a la izquierda, los **Estados** (tildá o destildá cada uno; «Marcar todos» los vuelve a prender) y, sobre la tabla, el buscador por nombre de paciente.", captura: "filtros" },
      { texto: "En **Semanal** ves la semana en una grilla de media hora. Tocá una cita para abrirla, o un espacio para abrir su menú: dar cita, sobreagendar o bloquear el espacio. Las citas que comparten horario se ven una al lado de la otra, y los espacios bloqueados, rayados en gris.", captura: "semanal" },
      { texto: "En **Mensual** ves el mes entero, con hasta tres citas por día y «+N más». Tocá un día para abrirlo en la vista **Diaria**.", captura: "mensual" },
      { texto: "En **Diaria global** ves el día con una columna por profesional, para comparar las agendas de un vistazo.", captura: "global" },
      { texto: "Tocá «Imprimir» para sacar en papel lo que estás mirando, con el nombre de la clínica, la fecha y los filtros que elegiste.", captura: "imprimir" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Los **Estados** solo filtran las vistas del día (**Diaria** y **Diaria global**). En **Semanal** y **Mensual** se filtra por profesional, sucursal y box, que se eligen arriba de la grilla. Lo que elijas viaja a «Dar cita» y a «Bloquear espacio»." },
      { tipo: "ojo", texto: "Si no ves una cita que esperabas, revisá los filtros: el día puede estar bien y la cita estar oculta por un estado destildado. «Marcar todos» los vuelve a prender." },
      { tipo: "tip", texto: "El número que está junto al título **Agenda** (por ejemplo, 5 citas) cuenta las citas de la vista que estás mirando: las del día, la semana o el mes." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const main = page.locator("main");
      await c.entrar("receptionist", "/app/agenda");
      await page.setViewportSize({ width: 1280, height: 1200 });
      // El miércoles de esta semana: una cita de cada doctor y sin el cartel de las reservas online.
      await irAlDia(page, await fechaDeSemana(page, 0, 2));
      const titulo = main.getByRole("heading", { name: "Agenda" });

      await sinMouse(page);
      await c.foto("diaria", {
        resaltar: [page.getByRole("button", { name: "Día anterior" }), page.getByRole("button", { name: "Día siguiente" }), page.getByLabel("Elegir fecha").locator("xpath=..")],
        recorte: [titulo, main.getByRole("table")],
      });

      const buscador = main.getByPlaceholder("Buscar nombre del paciente en las citas de hoy…");
      const estados = main.getByText("Estados", { exact: true }).locator("xpath=ancestor::div[contains(@class,'p-3')][1]");
      const selectores = page.getByLabel("Filtrar por profesional").locator("xpath=ancestor::div[contains(@class,'p-3')][1]");
      await c.foto("filtros", { margen: 4, resaltar: [selectores, estados, buscador], recorte: [buscador, estados] });

      await main.getByRole("button", { name: "Semanal" }).click();
      await sinMouse(page);
      await c.foto("semanal", { resaltar: main.getByRole("button", { name: "Semanal" }), recorte: [titulo, page.locator('div[class*="max-h-[560px]"]')] });

      await main.getByRole("button", { name: "Mensual" }).click();
      await sinMouse(page);
      const calendario = main.locator("button.min-h-\\[88px\\]").last().locator("xpath=ancestor::div[contains(@class,'overflow-hidden')][1]");
      await c.foto("mensual", { resaltar: main.getByRole("button", { name: "Mensual" }), recorte: [titulo, calendario] });

      await main.getByRole("button", { name: "Diaria global" }).click();
      await sinMouse(page);
      await c.foto("global", { resaltar: main.getByRole("button", { name: "Diaria global" }), recorte: [titulo, main.getByRole("button", { name: /Andrés Mejía/ }), main.getByRole("button", { name: /Lucía Ferreira/ })] });

      await main.getByRole("button", { name: "Diaria", exact: true }).click();
      const imprimir = main.getByRole("button", { name: "Imprimir" });
      await c.foto("imprimir", { resaltar: imprimir, recorte: [main.getByRole("button", { name: "Dar cita" }), main.getByRole("button", { name: /Lista de espera/ })] });
    },
  },
  {
    id: "cargar-un-paciente-nuevo",
    capitulo: "receptionist",
    titulo: "Cargar un paciente nuevo",
    roles: ["receptionist", "cashier", "commercial", "admin"],
    paraQue: "La primera vez que viene un paciente, o antes, cuando pide su primera cita. La ficha queda lista para sus citas, sus documentos y sus tratamientos.",
    antes: ["Buscar al paciente por nombre o CI para confirmar que no tenga ya una ficha: [[buscar-un-paciente]]."],
    pasos: [
      { texto: "Entrá a **Pacientes** y tocá «Nuevo paciente», arriba a la derecha.", captura: "boton" },
      { texto: "En **Datos principales**, completá los campos con asterisco (*): **Nombre legal**, **Apellidos**, **Cédula / DNI**, **Fecha de nacimiento**, **Sexo** y **Género**.", captura: "principales" },
      { texto: "En **Contacto y domicilio**, cargá el **Teléfono móvil** y el **Email** (los dos son obligatorios: los avisos al paciente salen por correo) y, si lo tenés, la ciudad, el barrio y la dirección. «Subir foto», a la izquierda, es opcional.", captura: "contacto" },
      { texto: "Si el paciente es menor de 18 años, al cargar su fecha de nacimiento aparecen los datos del **Responsable** y pasan a ser obligatorios.", captura: "menor" },
      { texto: "Tocá «Crear paciente». Si falta algún dato obligatorio, el formulario marca los campos y lista todo junto («Completá: …») y lleva el cursor al primero. Cuando está completo, el **Código interno** (arriba a la derecha del formulario) se asigna solo y se abre la ficha del paciente." },
      { texto: "La **Historia Clínica** del paciente queda pendiente: la campana suma uno y el paciente aparece en «Documentos clínicos pendientes». Completala en su primera visita: [[completar-la-historia-clinica]].", captura: "campana" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Si la CI (con o sin puntos) ya la tiene otro paciente, el formulario avisa «Ya hay un paciente con esa CI: …», con un enlace a su ficha, y no crea la nueva hasta que marques «Es otra persona» (por ejemplo, un menor que usa la CI de su responsable). Igual conviene buscarlo antes." },
      { tipo: "tip", texto: "Los datos que se piden, y cuáles son obligatorios, los define la administración: [[configurar-los-campos-del-paciente]]. En «Dar cita» también podés cargar un paciente nuevo, con «Crear nuevo paciente»." },
      { tipo: "revisar", texto: "Hoy la CI, el teléfono móvil y el email son obligatorios y no hay manera de cargar a un paciente sin CI (por ejemplo, un niño) ni sin correo. Confirmar si alcanza o si hace falta un caso «sin documento» o «sin email»." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const main = page.locator("main");
      await c.entrar("receptionist", "/app/pacientes");
      await page.setViewportSize({ width: 1280, height: 1000 });
      const nuevo = page.getByRole("button", { name: "Nuevo paciente" });
      await c.foto("boton", { resaltar: nuevo, recorte: [main.getByRole("heading", { name: "Pacientes", level: 1 }), nuevo, main.getByRole("table")] });
      await nuevo.click();
      await page.waitForURL("**/app/pacientes/nuevo");

      // Datos de ejemplo: no es una persona real.
      const nacimiento = main.getByLabel("Fecha de nacimiento *");
      await main.getByLabel("Nombre legal *").fill("Rosa");
      await main.getByLabel("Apellidos *").fill("Campos");
      await main.getByLabel("Cédula / DNI *").fill("7.777.777");
      await nacimiento.fill("1990-05-20");
      await main.getByLabel("Sexo *").selectOption("F");
      await main.getByLabel("Género *").selectOption("F");
      await sinFoco(page);
      await sinMouse(page);
      await c.foto("principales", {
        resaltar: [main.getByLabel("Nombre legal *"), main.getByLabel("Apellidos *"), main.getByLabel("Cédula / DNI *"), nacimiento, main.getByLabel("Sexo *"), main.getByLabel("Género *")],
        recorte: [main.getByText("Datos principales", { exact: true }), main.getByLabel("Género *")],
      });

      const telefono = main.getByLabel("Teléfono móvil *");
      await telefono.fill("+595 981 777 777");
      const email = main.getByLabel("Email *");
      await email.fill("rosa@example.com");
      await main.getByLabel("Ciudad").fill("Asunción");
      await sinFoco(page);
      await sinMouse(page);
      await c.foto("contacto", { resaltar: [telefono, email], recorte: main.locator("fieldset").filter({ hasText: "Contacto y domicilio" }) });

      // Una fecha de hace ocho años: el formulario pide al responsable. Se vuelve a la fecha de adulta antes de guardar.
      const hace8 = await page.evaluate(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 8); return d.toLocaleDateString("en-CA"); });
      await nacimiento.fill(hace8);
      await sinFoco(page);
      const responsable = main.locator("fieldset").filter({ hasText: "Responsable (paciente menor de edad)" });
      await c.expect(responsable).toBeVisible();
      await c.foto("menor", { resaltar: responsable, recorte: responsable });
      await nacimiento.fill("1990-05-20");

      // Con la CI de otro paciente (María González, 3.456.789) avisa y no crea la ficha hasta marcar «Es otra persona».
      await main.getByLabel("Cédula / DNI *").fill("3.456.789");
      await main.getByRole("button", { name: "Crear paciente" }).click();
      await c.expect(main.getByText(/Ya hay un paciente con esa CI/).first()).toBeVisible();
      await c.expect(page).toHaveURL(/\/app\/pacientes\/nuevo/);
      await main.getByLabel("Cédula / DNI *").fill("7.777.777");

      await main.getByRole("button", { name: "Crear paciente" }).click();
      await page.waitForURL(/\/app\/pacientes\/p_/);
      const campana = page.getByRole("button", { name: /^Ver pendientes/ });
      await campana.click();
      const panel = page.getByRole("menu", { name: "Pendientes" });
      const fila = panel.getByRole("menuitem", { name: /Rosa Campos/ });
      await c.expect(fila).toBeVisible();
      await sinMouse(page);
      await c.foto("campana", { resaltar: fila, recorte: [campana, panel] });
    },
  },
  {
    id: "editar-o-deshabilitar-un-paciente",
    capitulo: "receptionist",
    titulo: "Editar los datos de un paciente o deshabilitarlo",
    roles: ["receptionist", "cashier", "commercial", "admin"],
    paraQue: "Cuando cambia el teléfono, el correo o la dirección de un paciente, o cuando ya no se atiende en la clínica y querés sacarlo de la lista.",
    pasos: [
      { texto: "En **Pacientes**, buscá al paciente (por nombre, CI o teléfono), tocá ⋮ en su fila y elegí «Ir a datos personales».", captura: "menu" },
      { texto: "Se abre su ficha, en **Datos personales › Datos**. Corregí lo que haga falta y tocá «Guardar datos», arriba a la derecha: el botón se activa en cuanto cambiás algo.", captura: "datos" },
      { texto: "Para deshabilitarlo, volvé a **Pacientes**, tocá ⋮ en su fila y elegí «Deshabilitar paciente». El navegador pregunta si estás seguro: aceptá.", captura: "deshabilitar" },
      { texto: "El paciente sale de la lista. Para verlo, cambiá el selector que dice «Habilitados» (al lado de **Pacientes**) a «Deshabilitados»: aparece con la marca «Deshabilitado».", captura: "deshabilitados" },
      { texto: "Para volver a habilitarlo, tocá ⋮ en su fila, ya en «Deshabilitados», y elegí «Habilitar paciente»." },
    ],
    avisos: [
      { tipo: "ojo", texto: "Deshabilitar no borra nada: la ficha, las citas y los documentos quedan como estaban. Lo que cambia es que el paciente no sale en la lista de siempre ni se ofrece al dar una cita nueva." },
      { tipo: "ojo", texto: "Si cambiás algo en **Datos** y salís sin tocar «Guardar datos», el cambio se pierde." },
      { tipo: "ojo", texto: "«Datos requeridos» lista lo que la clínica pide de todos sus pacientes (lo define la administración). Si vaciás un dato obligatorio que el paciente ya tenía, «Guardar datos» te dice cuál es y no guarda; si nunca se cargó (por ejemplo, el correo de un paciente de antes), la ficha lo avisa pero igual podés guardar otros cambios." },
      { tipo: "tip", texto: "El teléfono y el correo de la ficha son los que se usan para avisarle al paciente de sus citas: mantenelos al día." },
      { tipo: "tip", texto: "Con «Todos» en el selector ves a la vez los pacientes habilitados y los deshabilitados." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const main = page.locator("main");
      await c.entrar("receptionist", "/app/pacientes");
      await page.setViewportSize({ width: 1280, height: 900 });
      const fila = main.getByRole("row", { name: /Ferreira/ });
      await fila.getByRole("button", { name: "Acciones de Lucía Ferreira" }).click();
      const acciones = page.getByRole("menu", { name: "Acciones de Lucía Ferreira" });
      const irDatos = acciones.getByRole("menuitem", { name: "Ir a datos personales" });
      await c.foto("menu", { resaltar: irDatos, recorte: [fila, acciones] });
      // Este ítem recarga la página (va a la ficha con la pestaña pedida).
      await irDatos.click();
      await page.waitForURL(/tab=datos/);
      await c.expect(main.getByRole("heading", { name: "Datos requeridos" })).toBeVisible();

      const email = main.getByLabel("Email");
      await email.fill("lucia@example.com");
      const guardar = main.getByRole("button", { name: "Guardar datos" });
      await c.expect(guardar).toBeEnabled();
      await sinMouse(page);
      await sinFoco(page);
      await c.foto("datos", { resaltar: [email, guardar], recorte: [main.getByRole("button", { name: "Datos personales", exact: true }), main.getByLabel("Fecha de nacimiento")] });
      await guardar.click();

      await c.ir("/app/pacientes");
      const otra = main.getByRole("row", { name: /Ferreira/ });
      await otra.getByRole("button", { name: "Acciones de Lucía Ferreira" }).click();
      const deshabilitar = page.getByRole("menu", { name: "Acciones de Lucía Ferreira" }).getByRole("menuitem", { name: "Deshabilitar paciente" });
      await c.foto("deshabilitar", { resaltar: deshabilitar, recorte: [otra, page.getByRole("menu", { name: "Acciones de Lucía Ferreira" })] });
      page.once("dialog", (d) => void d.accept());
      await deshabilitar.click();
      await c.expect(main.getByRole("link", { name: "Abrir la ficha de Lucía Ferreira" })).toHaveCount(0);

      const selector = main.getByLabel("Mostrar pacientes");
      await selector.selectOption("deshabilitados");
      // En pantalla ancha la lista es la tabla (la de tarjetas queda escondida, pero también está en la página).
      const marca = main.getByRole("table").getByText("Deshabilitado", { exact: true });
      await c.expect(marca).toBeVisible();
      await sinMouse(page);
      await c.foto("deshabilitados", { resaltar: [selector, marca], recorte: [main.getByRole("heading", { name: "Pacientes", level: 1 }), main.getByRole("table")] });
    },
  },
  {
    id: "completar-la-historia-clinica",
    capitulo: "receptionist",
    titulo: "Completar la Historia Clínica de un paciente",
    roles: ["receptionist", "cashier", "commercial", "admin", "dentist"],
    paraQue: "La primera vez que viene un paciente, o cuando la campana la marca pendiente: se le hacen las preguntas de salud y se anotan sus respuestas en la ficha.",
    antes: ["El paciente ya tiene ficha: la Historia Clínica queda pendiente sola al cargarlo ([[cargar-un-paciente-nuevo]])."],
    pasos: [
      { texto: "Abrí la ficha del paciente (desde **Pacientes** o tocándolo en la campana) y tocá **Ficha clínica**: se abre **Documentos clínicos**." },
      { texto: "La **Historia Clínica** figura como «Pendiente»: tocá «Completar».", captura: "lista" },
      { texto: "Respondé las preguntas, sección por sección (**Antecedentes patológicos**, **Aparatos y sistemas**, **Signos vitales**…). Completá solo lo que el paciente contesta: lo que quede en blanco no se imprime.", captura: "formulario" },
      { texto: "Si hay que interrumpirse, tocá «Guardar borrador»: queda «Pendiente» y seguís después. Cuando esté todo, tocá «Continuar».", captura: "barra" },
      { texto: "Se abre el documento terminado, con el membrete de la clínica. Tocá «Imprimir» para entregárselo en papel (salen solo las preguntas respondidas) y cerrá la ventana con la X.", captura: "visor" },
      { texto: "La Historia Clínica pasa a «Completado» y el paciente sale de la campana. Si hay que corregir algo, tocá «Editar»; para verla de nuevo, «Ver / imprimir».", captura: "completado" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Las preguntas sobre embarazo solo aparecen si en la ficha el paciente figura como mujer (en **Sexo** o **Género**). Si ese dato no está cargado, se preguntan a todos." },
      { tipo: "ojo", texto: "Un documento clínico no se borra: se anula con «Anular» y queda en la ficha como «Anulado». Para verlo, tildá «Mostrar anulados»." },
      { tipo: "tip", texto: "Si en lugar de la lista ves **Consentimientos**, tocá **Documentos ▾** y elegí «Documentos clínicos». «Nuevo documento clínico» arma otros documentos con las plantillas de la clínica, por ejemplo los cuidados después de una extracción." },
      { tipo: "tip", texto: "«Enviar por correo», junto a «Imprimir», le manda el documento al email del paciente. Si no tiene email cargado, el sistema lo avisa." },
      { tipo: "revisar", texto: "No pude probar «Enviar por correo»: la demo no tiene servicio de correo." },
      { tipo: "revisar", texto: "Los textos marcados «Por revisar» (cuidados e indicaciones, no la Historia Clínica) son borradores de Novudent que todavía no vio un odontólogo, y salen impresos con la leyenda de borrador. Confirmar cuáles se pueden entregar a pacientes." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const main = page.locator("main");
      await c.entrar("receptionist", "/app/pacientes/p2");
      await page.setViewportSize({ width: 1280, height: 1000 });
      await main.getByRole("button", { name: "Ficha clínica", exact: true }).click();
      const completar = main.getByRole("button", { name: "Completar" });
      await c.expect(completar).toBeVisible();
      await sinMouse(page);
      await c.foto("lista", { margen: 4, resaltar: completar, recorte: [main.getByRole("heading", { name: "Documentos clínicos" }), main.getByRole("button", { name: "Nuevo documento clínico" }), completar.locator("xpath=ancestor::div[contains(@class,'divide-y')][1]")] });
      await completar.click();

      // Juan es hombre: no se le preguntan los datos de embarazo. Solo se completan algunas respuestas de ejemplo.
      await c.expect(main.getByRole("heading", { name: "Nuevo documento clínico" })).toBeVisible();
      const enfermedad = page.getByLabel("¿Padece o ha padecido alguna enfermedad en los últimos años?");
      await enfermedad.selectOption("Sí");
      const diabetes = page.getByRole("group", { name: "El paciente refiere haber padecido:" }).getByLabel("Diabetes");
      await diabetes.check();
      await page.getByLabel("Tensión arterial:").fill("120/80");
      await page.getByLabel("Pulso cardíaco:").fill("72");
      await sinMouse(page);
      await c.foto("formulario", {
        margen: 4,
        resaltar: [enfermedad, diabetes],
        recorte: [main.getByRole("heading", { name: "Nuevo documento clínico" }), page.locator("section[aria-labelledby='seccion-antecedentes_patologicos']")],
      });

      await page.getByRole("button", { name: "Guardar borrador" }).click();
      await c.expect(page.getByText("Guardado", { exact: true })).toBeVisible();
      const continuar = page.getByRole("button", { name: "Continuar" });
      const barra = continuar.locator("xpath=..");
      await c.foto("barra", { margen: 2, resaltar: barra, recorte: barra });
      await continuar.click();

      const visor = page.getByRole("dialog", { name: "Documento clínico" });
      await c.expect(visor).toBeVisible();
      await sinMouse(page);
      await c.foto("visor", { margen: 4, resaltar: visor.getByRole("button", { name: "Imprimir" }), recorte: visor });
      await visor.getByRole("button", { name: "Cerrar" }).click();

      const hecho = main.getByText("Completado", { exact: true });
      await c.expect(hecho).toBeVisible();
      await c.foto("completado", {
        margen: 4,
        resaltar: [main.getByRole("button", { name: "Ver / imprimir" }), main.getByRole("button", { name: "Editar" })],
        recorte: [main.getByRole("heading", { name: "Documentos clínicos" }), hecho.locator("xpath=ancestor::div[contains(@class,'divide-y')][1]")],
      });
    },
  },
  {
    id: "pedir-un-consentimiento",
    capitulo: "receptionist",
    titulo: "Pedir y guardar un consentimiento",
    roles: ["receptionist", "cashier", "commercial", "admin"],
    paraQue: "Antes de un tratamiento que lo requiere: el paciente lee y firma un consentimiento informado y la clínica lo guarda firmado en su ficha.",
    antes: ["La clínica tiene plantillas de consentimiento cargadas (las carga la administración).", "El plan Clínica o superior: la firma electrónica no está en el plan Solo."],
    pasos: [
      { texto: "En la ficha del paciente, tocá **Ficha clínica**, abrí **Documentos ▾** y elegí «Consentimientos».", captura: "menu" },
      { texto: "Tocá «Nuevo consentimiento informado». En «Crear nuevo consentimiento», elegí el **Tipo de consentimiento**, si querés el **Plan de tratamiento**, y el **Profesional a cargo** (el tipo y el profesional son obligatorios).", captura: "crear" },
      { texto: "Tocá «Crear consentimiento». Queda en la lista como «Pendiente», con las opciones para firmarlo.", captura: "pendiente" },
      { texto: "Con el paciente en la clínica, tocá «Firmar acá». Revisá el nombre de quien firma, pedile que firme con el dedo o el mouse en el recuadro y tocá «Confirmar firma».", captura: "firmar" },
      { texto: "El consentimiento pasa a «Firmado». Con «Ver / imprimir» lo abrís con la firma y lo imprimís.", captura: "firmado" },
      { texto: "Si el paciente no está, tocá «Firmar desde el celular»: aparece un código QR y un link. El paciente lo escanea (o recibe el link) y firma en su propio celular.", captura: "qr" },
    ],
    avisos: [
      { tipo: "ojo", texto: "El texto se copia al crear el consentimiento: si la administración cambia la plantilla después, los que ya creaste no cambian." },
      { tipo: "ojo", texto: "Un consentimiento se anula («Anular») pero no se borra; los anulados se ven con «Mostrar anulados». Las pestañas de consentimientos las ve y maneja la recepción, no el dentista ni la asistente." },
      { tipo: "tip", texto: "En cada consentimiento figuran el profesional a cargo y el plan de tratamiento: sirven para encontrarlo después." },
      { tipo: "revisar", texto: "No pude probar la firma desde el celular: la página que abre el paciente necesita un servicio que la demo no tiene. Solo se vio hasta que aparecen el QR y el link." },
      { tipo: "revisar", texto: "La pantalla dice «Firma electrónica simple — válida para consentimiento clínico». El valor legal de esa firma y los textos de las plantillas los tiene que validar el asesor legal de cada clínica." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const main = page.locator("main");
      // Ventana alta: el recuadro de la firma queda abajo y hay que dibujar en él (con otra altura la ventana se achicaría y el recuadro se borraría).
      await c.entrar("receptionist", "/app/pacientes/p3");
      await page.setViewportSize({ width: 1280, height: 1200 });
      await main.getByRole("button", { name: "Ficha clínica", exact: true }).click();
      const documentos = main.getByRole("button", { name: /^Documentos/ });
      await documentos.click();
      const menuDocs = page.getByRole("menu", { name: "Documentos" });
      const consentimientos = menuDocs.getByRole("menuitem", { name: "Consentimientos" });
      await c.foto("menu", { margen: 4, resaltar: [main.getByRole("button", { name: "Ficha clínica", exact: true }), documentos, consentimientos], recorte: [main.getByRole("button", { name: "Ficha clínica", exact: true }), menuDocs] });
      await consentimientos.click();

      await main.getByRole("button", { name: "Nuevo consentimiento informado" }).click();
      const crear = page.getByRole("dialog", { name: "Crear nuevo consentimiento" });
      const tipo = crear.getByLabel(/Tipo de consentimiento/);
      const profesional = crear.getByLabel(/Profesional a cargo/);
      await tipo.selectOption({ label: "Consentimiento informado general" });
      await profesional.selectOption({ label: "Dra. Sofía Benítez" });
      const crearBoton = crear.getByRole("button", { name: "Crear consentimiento" });
      await sinMouse(page);
      await c.foto("crear", { margen: 4, resaltar: [tipo, crear.getByLabel("Plan de tratamiento"), profesional, crearBoton], recorte: crear });
      await crearBoton.click();

      const firmarAca = main.getByRole("button", { name: "Firmar acá" });
      const celular = main.getByRole("button", { name: "Firmar desde el celular" });
      await c.expect(firmarAca).toBeVisible();
      const tarjeta = firmarAca.locator("xpath=ancestor::div[contains(@class,'p-4')][1]");
      await sinMouse(page);
      await c.foto("pendiente", { resaltar: [firmarAca, celular], recorte: tarjeta });

      // Firma de ejemplo: un trazo con el mouse sobre el recuadro.
      await firmarAca.click();
      const lienzo = main.locator("canvas").first();
      await lienzo.scrollIntoViewIfNeeded();
      const caja = (await lienzo.boundingBox())!;
      await page.mouse.move(caja.x + 60, caja.y + caja.height / 2);
      await page.mouse.down();
      for (let i = 0; i < 14; i++) await page.mouse.move(caja.x + 60 + i * 16, caja.y + caja.height / 2 + Math.sin(i / 1.5) * 28);
      await page.mouse.up();
      const confirmar = main.getByRole("button", { name: "Confirmar firma" });
      await c.expect(confirmar).toBeEnabled();
      await sinMouse(page);
      await c.foto("firmar", { resaltar: [main.getByLabel("Nombre de quien firma"), lienzo, confirmar], recorte: tarjeta });
      await confirmar.click();

      const ver = main.getByRole("button", { name: "Ver / imprimir" });
      await c.expect(ver).toBeVisible();
      await ver.click();
      const firmado = page.getByRole("dialog", { name: "Consentimiento firmado" });
      await c.expect(firmado).toBeVisible();
      await sinMouse(page);
      await c.foto("firmado", { margen: 4, resaltar: firmado.getByRole("button", { name: "Imprimir" }), recorte: firmado });
      await firmado.getByRole("button", { name: "Cerrar" }).click();

      // Otro consentimiento, para mostrar la firma desde el celular.
      await main.getByRole("button", { name: "Nuevo consentimiento informado" }).click();
      const otro = page.getByRole("dialog", { name: "Crear nuevo consentimiento" });
      await otro.getByLabel(/Tipo de consentimiento/).selectOption({ label: "Consentimiento para tratamiento odontológico" });
      await otro.getByLabel(/Profesional a cargo/).selectOption({ label: "Dra. Sofía Benítez" });
      await otro.getByRole("button", { name: "Crear consentimiento" }).click();
      await main.getByRole("button", { name: "Firmar desde el celular" }).click();
      const panelQr = main.locator("div.rounded-2xl").filter({ hasText: "El paciente escanea el código" }).last();
      await c.expect(page.getByRole("img", { name: "Código QR para firmar" })).toBeVisible();
      // El link lleva la dirección del servidor donde se saca la captura (localhost): se tapa, que no sirve de ejemplo.
      await page.locator("input[readonly]").evaluate((el) => { (el as HTMLElement).style.visibility = "hidden"; });
      await sinMouse(page);
      await c.foto("qr", { resaltar: page.getByRole("img", { name: "Código QR para firmar" }), recorte: panelQr });
    },
  },
  {
    id: "atender-una-reserva-online",
    capitulo: "receptionist",
    titulo: "Atender una reserva que entra por la web",
    roles: ["receptionist", "cashier", "commercial", "admin"],
    paraQue: "Cuando un paciente reserva solo, con el link de la clínica (web, Instagram, WhatsApp): la cita entra a la agenda sin confirmar y la recepción la tiene que validar.",
    antes: ["La clínica comparte su link de reserva: lo copia la administración desde **Administración › Agenda online** (ahí también está su código QR, para imprimirlo en la recepción)."],
    pasos: [
      { texto: "El paciente abre el link, elige el día, el profesional y el horario, y deja nombre, apellido, CI, WhatsApp y email. Al final toca «Confirmar reserva» y ve «¡Reserva recibida!».", captura: "pagina" },
      { texto: "La reserva entra a la agenda como «No confirmado», con la marca «Online» junto al nombre. Arriba de la tabla, un cartel verde avisa «Hay N agendamiento(s) online que deben ser validados» y trae el enlace «Ver y validar».", captura: "cartel" },
      { texto: "Tocá «Ver y validar»: la tabla deja solo las reservas online sin confirmar (si el día abierto no tiene ninguna, te lleva al primer día que sí). El teléfono del paciente está debajo de su nombre." },
      { texto: "Llamá o escribile al paciente. Si viene, pasá la cita a «Confirmado» desde su estado; si no puede, a «Anulado»: mirá [[cambiar-el-estado-de-una-cita]].", captura: "filtrada" },
      { texto: "Cuando ya no queda ninguna reserva online sin confirmar, el cartel desaparece." },
    ],
    avisos: [
      { tipo: "ojo", texto: "Al confirmar una cita desde «Ver y validar», sale de la tabla porque ya no está sin confirmar. Cuando quieras volver a ver todas las citas del día, tocá «Ver todas las citas» en el aviso azul que queda arriba de la tabla." },
      { tipo: "ojo", texto: "El cartel cuenta las reservas online sin validar de hoy en adelante, de cualquier día (no solo del que tenés abierto); las de días que ya pasaron no se cuentan. Solo lo ven quienes pueden confirmar citas: la asistente de doctores no. **Mi agenda**, en Inicio, también te recuerda con «Validar las reservas online» cuántas hay por validar: [[usar-mi-agenda]]." },
      { tipo: "tip", texto: "El paciente puede reservar hasta 30 días adelante, de lunes a sábado. Con cuánta anticipación mínima lo define la administración, en **Administración › Agenda online**, en «Anticipación mínima»." },
      { tipo: "revisar", texto: "No pude hacer una reserva real: en la demo, la página del paciente avisa «Reservas online no configuradas» al elegir un día. Los pasos 2 a 5 se hicieron con la cita online que trae la demo en la agenda." },
      { tipo: "tip", texto: "Si el paciente no tenía ficha, el sistema la crea con lo que dejó (nombre, apellido, CI, WhatsApp y email) y le deja la Historia Clínica pendiente, igual que cuando la cargás vos; si ya la tenía, usa la existente por su CI. Esto se probó con pruebas automáticas del servicio de reservas, no con una reserva real de una clínica." },
      { tipo: "revisar", texto: "El WhatsApp de «te llega un mensaje para confirmar» depende de la integración de la clínica. Confirmar si está activa en cada caso." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const main = page.locator("main");
      // La página del paciente es pública: no hace falta entrar. Solo se ve el primer paso (elegir el día); los siguientes piden un servicio que la demo no tiene.
      await c.ir("/reservar/cl_demo");
      await c.expect(page.getByText("¿Qué día te queda bien?")).toBeVisible();
      await c.foto("pagina", { margen: 24, recorte: [page.getByRole("heading", { level: 1 }), page.locator("section").first()] });

      await c.entrar("receptionist", "/app/agenda");
      await page.setViewportSize({ width: 1280, height: 1000 });
      // El cartel cuenta las reservas online de hoy en adelante. La de la demo está en el lunes de esta semana, que puede haber pasado:
      // se pasa ese día entero (con la cita confirmada de María) a hoy, en el estado local de la demo, y se recarga la agenda.
      const lunes = await fechaDeSemana(page);
      await page.evaluate((lunesDeEstaSemana) => {
        const db = JSON.parse(localStorage.getItem("novudent.db.v4") || "null");
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const dias = Math.round((hoy.getTime() - new Date(`${lunesDeEstaSemana}T00:00:00`).getTime()) / 86_400_000);
        if (dias > 0) {
          for (const a of db.appointments as { start: string; end: string }[]) {
            if (new Date(a.start).toLocaleDateString("en-CA") !== lunesDeEstaSemana) continue;
            for (const k of ["start", "end"] as const) { const x = new Date(a[k]); x.setDate(x.getDate() + dias); a[k] = x.toISOString(); }
          }
          localStorage.setItem("novudent.db.v4", JSON.stringify(db));
        }
      }, lunes);
      await c.ir("/app/agenda");
      await irAlDia(page, await page.evaluate(() => new Date().toLocaleDateString("en-CA")));
      const juan = main.getByRole("row", { name: /Juan Ríos/ });
      const marca = juan.getByText("Online", { exact: true });
      const validar = main.getByRole("button", { name: "Ver y validar" });
      await c.expect(marca).toBeVisible();
      await sinMouse(page);
      await c.foto("cartel", { resaltar: [marca, validar], recorte: [main.getByRole("heading", { name: "Agenda" }), validar.locator("xpath=ancestor::div[1]"), main.getByRole("table")] });

      await validar.click();
      await c.expect(main.getByRole("row", { name: /María González/ })).toHaveCount(0);
      await sinMouse(page);
      await c.foto("filtrada", { resaltar: juan.getByRole("button", { name: "No confirmado" }), recorte: main.getByRole("table") });
    },
  },
];
