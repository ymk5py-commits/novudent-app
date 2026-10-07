import type { Page } from "@playwright/test";
import type { Procedimiento } from "./tipos";

/* Ayudas de las capturas de este capítulo (solo corren dentro de `capturar`; el texto del manual no las usa).
 *
 * La demo siembra sus citas en la semana en curso (de lunes a viernes): si la captura abriera «hoy», un sábado o un domingo la agenda
 * saldría vacía. Por eso se elige siempre un día de esa semana. */

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

export const procedimientos: Procedimiento[] = [
  {
    id: "ver-la-agenda-de-tus-doctores",
    capitulo: "assistant",
    titulo: "Ver la agenda de tus doctores",
    roles: ["assistant"],
    paraQue: "Al empezar el día, para saber qué pacientes atiende cada doctor al que asistís, a qué hora vienen y en qué estado está cada cita.",
    antes: ["La administración te asignó al menos un doctor: [[asignar-doctores-a-una-asistente]]."],
    pasos: [
      { texto: "Entrá a **Agenda**. Se abre la vista **Diaria**, con las citas del día de los doctores que tenés asignados, de la más temprana a la más tarde. Las de otros doctores no aparecen.", captura: "agenda" },
      { texto: "En cada fila ves la hora, el paciente, el doctor y el **Estado de la cita**. El estado es solo para mirar: lo cambia la recepción.", captura: "estado" },
      { texto: "Cambiá de día con las flechas o con «Fecha». Con **Semanal** ves la semana y con **Mensual** el mes; si asistís a más de un doctor, **Todos los profesionales** te deja elegir uno.", captura: "semanal" },
      { texto: "Para ver el detalle de una cita, tocá ⋮ en su fila y elegí «Ver»: te muestra el estado, el paciente, el doctor y el horario.", captura: "ver" },
      { texto: "Tocá el nombre del paciente para abrir su ficha: ahí ves su ficha clínica y sus planes de tratamiento. Mirá [[leer-la-ficha-clinica]].", captura: "ficha" },
      { texto: "Si arriba aparece un aviso amarillo que dice «Todavía no tenés doctores asignados», no ves ninguna agenda: pedile a la administración que te asigne.", captura: "sin-doctores" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Con este rol la agenda es de solo lectura: no hay «Dar cita» y no podés cambiar estados, editar ni eliminar citas. Eso lo hace la recepción." },
      { tipo: "ojo", texto: "No ves teléfonos ni correos de los pacientes ni montos: son datos personales y de plata que este rol no tiene." },
      { tipo: "tip", texto: "No confundas **Agenda** (las citas de los doctores) con **Mi agenda**, en Inicio (tus propias tareas): mirá [[usar-mi-agenda]]. Para lo básico de leer una agenda en solo lectura, mirá también [[ver-tu-agenda]]." },
      { tipo: "tip", texto: "El botón «Lista de espera» muestra a los pacientes que esperan un turno con tus doctores, solo para mirar." },
      { tipo: "tip", texto: "El cartel verde de las reservas online («Ver y validar») es un aviso para la recepción: vos no podés confirmarlas." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const main = page.locator("main");
      await c.entrar("assistant", "/app/agenda");
      await page.setViewportSize({ width: 1280, height: 1000 });
      const titulo = main.getByRole("heading", { name: "Agenda" });
      const tabla = main.getByRole("table");

      // El lunes de esta semana: una cita confirmada y una reserva online sin confirmar, las dos de la Dra. Sofía (la doctora de Paola).
      await irAlDia(page, await fechaDeSemana(page));
      await sinMouse(page);
      await c.foto("agenda", {
        resaltar: page.getByRole("navigation").first().getByRole("link", { name: "Agenda", exact: true }),
        recorte: [page.getByRole("banner"), titulo, tabla],
      });

      const juan = main.getByRole("row", { name: /Juan Ríos/ });
      await c.foto("estado", { margen: 2, resaltar: juan.getByText("No confirmado", { exact: true }), recorte: tabla });

      const acciones = main.getByRole("row", { name: /María González/ }).getByRole("button", { name: "Acciones de la cita" });
      await acciones.click();
      const menu = page.getByRole("menu", { name: "Acciones de la cita" });
      await c.expect(menu.getByRole("menuitem")).toHaveCount(1);
      await c.foto("ver", { margen: 0, resaltar: menu.getByRole("menuitem", { name: "Ver" }), recorte: [main.getByRole("row", { name: /María González/ }), menu] });
      await page.keyboard.press("Escape");

      const nombre = main.getByRole("link", { name: "María González" });
      await c.foto("ficha", { margen: 2, resaltar: nombre, recorte: tabla });

      await main.getByRole("button", { name: "Semanal" }).click();
      await sinMouse(page);
      await c.foto("semanal", { resaltar: [main.getByRole("button", { name: "Semanal" }), page.getByLabel("Filtrar por profesional")], recorte: [titulo, page.locator('div[class*="max-h-[560px]"]')] });

      // Una asistente sin doctores asignados: no se puede armar desde su pantalla (los asigna la administración y cada ingreso a la demo vuelve a sembrar los
      // datos), así que se vacía su lista en el estado local de la demo —como hace e2e/agenda.spec.ts con las citas— y se recarga la agenda.
      await page.evaluate(() => {
        const db = JSON.parse(localStorage.getItem("novudent.db.v4") || "null");
        db.users.find((u: { role: string }) => u.role === "assistant").asiste = [];
        localStorage.setItem("novudent.db.v4", JSON.stringify(db));
      });
      await c.ir("/app/agenda");
      const aviso = page.getByRole("status").filter({ hasText: "Todavía no tenés doctores asignados" });
      await c.expect(aviso).toBeVisible();
      await sinMouse(page);
      await c.foto("sin-doctores", { resaltar: aviso, recorte: [page.getByRole("banner"), aviso, main.getByRole("heading", { name: "Agenda" })] });
    },
  },
  {
    id: "consultar-un-plan-de-tratamiento",
    capitulo: "assistant",
    titulo: "Consultar el plan de tratamiento de un paciente",
    roles: ["assistant", "dentist", "receptionist"],
    paraQue: "Para saber qué prestaciones tiene indicadas un paciente, cuáles ya se hicieron y cuáles faltan, por ejemplo antes de preparar el consultorio.",
    pasos: [
      { texto: "Abrí la ficha del paciente (tocando su nombre en la agenda o desde **Pacientes**) y tocá **Planes de tratamiento**.", captura: "lista" },
      { texto: "La lista separa los planes **En ejecución** (los que el paciente aceptó) de **Otros**. Cada plan muestra el profesional, la última cita y el **Progreso**; el selector de arriba pasa de «Tratamientos activos» a «Todos los tratamientos»." },
      { texto: "Tocá un plan para abrirlo. A la izquierda ves el **Avance del plan** (por ejemplo, «1 / 3 prestaciones realizadas»), el vencimiento, el profesional a cargo y las citas del paciente.", captura: "detalle" },
      { texto: "A la derecha, la tabla trae cada prestación con su **Pieza**. En la columna **Pago**, el tilde verde quiere decir «Realizado» y el carrito rojo, «Pendiente».", captura: "prestaciones" },
      { texto: "Con las pestañas de arriba de la tabla podés mirar el **Odontograma** (el estado de las piezas) y **Estética facial**. El ícono de la impresora, a la derecha, imprime el plan." },
      { texto: "Tocá «Planes», arriba a la izquierda, para volver a la lista." },
    ],
    avisos: [
      { tipo: "ojo", texto: "Para la asistente, el dentista y la recepción el plan se ve sin precios: no hay montos, descuentos ni saldos (los ven «Recepción y caja» y la administración). La asistente y la recepción solo lo miran; armarlo o cambiarlo es del dentista: [[armar-un-plan-de-tratamiento]]." },
      { tipo: "ojo", texto: "El dentista y la asistente solo ven a los pacientes que tienen una cita o un plan con sus doctores (la recepción los ve a todos). Si abrís la ficha de otro paciente, el sistema dice «Este paciente no está entre tus pacientes»." },
      { tipo: "tip", texto: "Cuando el dentista marca una prestación como realizada, el avance del plan sube solo: [[marcar-una-prestacion-realizada]]." },
      { tipo: "tip", texto: "Para el resto de la ficha (evoluciones, antecedentes, odontograma) mirá [[leer-la-ficha-clinica]]; para saber cuándo viene el paciente, [[ver-tu-agenda]]." },
      { tipo: "tip", texto: "Con el plan Clínica, la ficha trae «Preparar consulta», que arma con IA un resumen del paciente para la consulta. Es opcional y no cambia nada del plan." },
      { tipo: "revisar", texto: "En la tabla, la columna se llama **Pago**, pero el carrito y el tilde dicen si la prestación se hizo, no si se pagó. Para quien no ve montos puede confundir: sugerir otro nombre (por ejemplo, «Estado»)." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const main = page.locator("main");
      await c.entrar("assistant", "/app/pacientes/p1");
      await page.setViewportSize({ width: 1280, height: 1000 });
      // Para que se vean las dos marcas de la columna «Pago» hace falta una prestación ya hecha, y la demo no trae ninguna en este plan. La asistente no puede
      // marcarla (lo hace el dentista, con otro usuario, y cada ingreso a la demo vuelve a sembrar los datos): se marca la primera en el estado local de la demo,
      // como haría el dentista, y se recarga la ficha.
      await page.evaluate(() => {
        const db = JSON.parse(localStorage.getItem("novudent.db.v4") || "null");
        const primera = db.budgets.find((b: { id: string }) => b.id === "g1").items[0];
        Object.assign(primera, { status: "realizado", doneAt: new Date().toISOString(), doneBy: "Dra. Sofía Benítez" });
        localStorage.setItem("novudent.db.v4", JSON.stringify(db));
      });
      await c.ir("/app/pacientes/p1");
      const grupo = main.getByRole("button", { name: "Planes de tratamiento", exact: true });
      await grupo.click();
      const plan = main.getByRole("button", { name: /#g1: Plan dental integral/ });
      await c.expect(plan).toBeVisible();
      await sinMouse(page);
      await c.foto("lista", { margen: 4, resaltar: grupo, recorte: [grupo, plan] });

      await plan.click();
      const avance = main.getByText("Avance del plan", { exact: true }).locator("xpath=..");
      await c.expect(avance).toBeVisible();
      const panel = avance.locator("xpath=ancestor::div[contains(@class,'overflow-hidden')][1]");
      await sinMouse(page);
      await c.foto("detalle", { margen: 4, resaltar: avance, recorte: [main.getByRole("button", { name: "Planes", exact: true }), panel, main.getByRole("table")] });

      await c.foto("prestaciones", { margen: 4, resaltar: [main.getByTitle("Realizado").locator("svg"), main.getByTitle("Pendiente").first().locator("svg")], recorte: main.getByRole("table") });
    },
  },
];
