import { describe, it, expect } from "vitest";
import {
  seguimientoDe, seguimientoDeTodos, haceCuanto, whatsappUrl, armarQuita, MOTIVOS_DE_QUITA, MAX_MOTIVO,
  type CitaDeSeguimiento, type PlanDeSeguimiento,
} from "./seguimiento";
import type { AppointmentStatus, BudgetStatus, QuitaDeLista } from "./types";

/* «Sin próxima cita» (Pacientes › Análisis de estudios específicos): quién cae en la lista, desde cuándo y por qué sale.
   Todas las horas se arman en hora LOCAL (`new Date(a, m, d, h)`), así que las pruebas dan lo mismo en cualquier huso. */

const AHORA = new Date(2026, 9, 8, 15, 0); // jueves 8-oct-2026, 15:00
/** Un instante ISO: `dias` días antes (negativo) o después de hoy, a las `h`:`m` locales. */
const en = (dias: number, h = 10, m = 0) => new Date(2026, 9, 8 + dias, h, m).toISOString();

let n = 0;
const cita = (o: Partial<CitaDeSeguimiento> & { status: AppointmentStatus }): CitaDeSeguimiento => ({ patientId: "p1", start: en(-5), ...o });
const atendida = (dias: number, o: Partial<CitaDeSeguimiento> = {}) => cita({ status: "completada", start: en(dias), ...o });
const plan = (status: BudgetStatus, o: Partial<PlanDeSeguimiento> & { name?: string } = {}): PlanDeSeguimiento & { id: string; name?: string } => ({
  id: `g${++n}`, patientId: "p1", status, createdAt: en(-30), ...o,
});
const quita = (dias: number, o: Partial<QuitaDeLista> = {}): QuitaDeLista => ({ cerradoAt: en(dias, 11), motivo: "No quiere continuar", por: "Laura Recepción", ...o });

type Extra = { disabled?: boolean; seguimiento?: unknown; tipo?: Parameters<typeof seguimientoDe>[0]["tipo"]; ahora?: Date };
const ver = (citas: CitaDeSeguimiento[], presupuestos: PlanDeSeguimiento[] = [], extra: Extra = {}) =>
  seguimientoDe({
    paciente: { id: "p1", disabled: extra.disabled, seguimiento: extra.seguimiento as QuitaDeLista | undefined },
    citas, presupuestos, ahora: extra.ahora ?? AHORA, tipo: extra.tipo,
  });

describe("seguimientoDe — quién cae en «Sin próxima cita»", () => {
  it("un paciente sin citas ni planes no está en la lista ni en la tabla", () => {
    const r = ver([], []);
    expect(r).toMatchObject({ enVista: false, enLista: false, citas: 0, planes: 0, desde: null, dias: null, salida: null });
  });

  it("asistió (Atendido) y no tiene otra cita: está en la lista, desde el día de esa cita", () => {
    const r = ver([atendida(-5)]);
    expect(r).toMatchObject({ enVista: true, enLista: true, desde: "2026-10-03", desdeDe: "asistencia", dias: 5, salida: null });
  });

  it("«Atendiéndose» también cuenta como haber asistido", () => {
    expect(ver([cita({ status: "en_atencion", start: en(0, 14) })]).enLista).toBe(true);
  });

  it("si tiene una cita futura, no está (tiene próxima cita)", () => {
    for (const status of ["pendiente", "confirmada", "en_sala"] as const) {
      const r = ver([atendida(-5), cita({ status, start: en(3) })]);
      expect(r.enLista, status).toBe(false);
      expect(r.proxima?.start, status).toBe(en(3));
    }
  });

  it("una cita futura anulada no cuenta como próxima cita", () => {
    const r = ver([atendida(-5), cita({ status: "cancelada", start: en(3) })]);
    expect(r.enLista).toBe(true);
    expect(r.proxima).toBeUndefined();
  });

  it("una cita futura marcada «No asiste» tampoco cuenta", () => {
    const r = ver([atendida(-5), cita({ status: "ausente", start: en(3) })]);
    expect(r.enLista).toBe(true);
    expect(r.proxima).toBeUndefined();
  });

  it("las citas «No asiste» pasadas no son una asistencia: sin nada más, no está", () => {
    const r = ver([cita({ status: "ausente", start: en(-10) }), cita({ status: "ausente", start: en(-3) })]);
    expect(r).toMatchObject({ enVista: true, enLista: false, citas: 2, desde: null });
  });

  it("una cita pasada que nadie actualizó (pendiente, confirmada o en sala) tampoco es una asistencia", () => {
    for (const status of ["pendiente", "confirmada", "en_sala"] as const) {
      expect(ver([cita({ status, start: en(-4) })]).enLista, status).toBe(false);
    }
  });

  it("las citas anuladas no cuentan para nada: ni asistencia ni cita de la tabla", () => {
    const r = ver([cita({ status: "cancelada", start: en(-4) })]);
    expect(r).toMatchObject({ enVista: false, enLista: false, citas: 0 });
  });

  it("sin asistencia pero con un plan vigente (borrador, presentado o aceptado), está en la lista desde que se armó el plan", () => {
    for (const status of ["borrador", "presentado", "aceptado"] as const) {
      const r = ver([], [plan(status, { createdAt: en(-12) })]);
      expect(r, status).toMatchObject({ enVista: true, enLista: true, desde: "2026-09-26", desdeDe: "plan", dias: 12 });
    }
  });

  it("un plan anulado o completado, solo, no pone a nadie en la lista", () => {
    expect(ver([], [plan("anulado")]).enLista).toBe(false);
    expect(ver([], [plan("completado")]).enLista).toBe(false);
  });

  it("un plan vigente no se pisa con una cita «No asiste»: sigue en la lista", () => {
    expect(ver([cita({ status: "ausente", start: en(-3) })], [plan("aceptado")]).enLista).toBe(true);
  });

  it("con asistencia y con plan, «desde» es la última asistencia, no el plan", () => {
    const r = ver([atendida(-40), atendida(-9)], [plan("aceptado", { createdAt: en(-3) })]);
    expect(r).toMatchObject({ desde: "2026-09-29", desdeDe: "asistencia", dias: 9 });
  });

  it("sin asistencia, «desde» sale del plan VIGENTE más nuevo: ni uno completado ni uno anulado", () => {
    const r = ver([], [plan("aceptado", { createdAt: en(-20) }), plan("completado", { createdAt: en(-5) }), plan("anulado", { createdAt: en(-2) })]);
    expect(r).toMatchObject({ enLista: true, desde: "2026-09-18", desdeDe: "plan", dias: 20 });
  });

  it("un paciente deshabilitado nunca está", () => {
    const r = ver([atendida(-5)], [plan("aceptado")], { disabled: true });
    expect(r).toMatchObject({ enVista: false, enLista: false });
  });
});

describe("seguimientoDe — plan finalizado", () => {
  it("asistió y su único plan está completado: sale de la lista porque terminó", () => {
    const r = ver([atendida(-5)], [plan("completado")]);
    expect(r).toMatchObject({ enLista: false, finalizado: true, salida: "finalizado" });
  });

  it("un plan completado más otro anulado: el anulado no cuenta, el tratamiento terminó", () => {
    const r = ver([atendida(-5)], [plan("completado"), plan("anulado")]);
    expect(r).toMatchObject({ enLista: false, finalizado: true, salida: "finalizado" });
  });

  it("varios planes y todos completados: terminó", () => {
    expect(ver([atendida(-5)], [plan("completado"), plan("completado")]).finalizado).toBe(true);
  });

  it("un plan completado más otro vigente: el tratamiento sigue, está en la lista", () => {
    for (const status of ["borrador", "presentado", "aceptado"] as const) {
      const r = ver([atendida(-5)], [plan("completado"), plan(status)]);
      expect(r, status).toMatchObject({ enLista: true, finalizado: false, salida: null });
    }
  });

  it("solo planes anulados: no hay nada que finalizar, sigue por haber asistido", () => {
    const r = ver([atendida(-5)], [plan("anulado"), plan("anulado")]);
    expect(r).toMatchObject({ enLista: true, finalizado: false });
  });

  it("sin planes no hay nada finalizado", () => {
    expect(ver([atendida(-5)], []).finalizado).toBe(false);
  });

  it("que el plan haya terminado no cambia que se vea en la tabla, y la salida solo se informa si de otro modo estaría", () => {
    // Con una cita futura el paciente no es candidato: no «salió» de nada.
    const r = ver([atendida(-5), cita({ status: "confirmada", start: en(2) })], [plan("completado")]);
    expect(r).toMatchObject({ enVista: true, enLista: false, finalizado: true, salida: null });
  });
});

describe("seguimientoDe — qué se muestra de cada paciente", () => {
  it("la última cita es la más reciente que ya pasó, con el estado que tenga («No asiste» incluida)", () => {
    const r = ver([atendida(-30), cita({ status: "ausente", start: en(-2) }), atendida(-10)]);
    expect(r.ultima).toMatchObject({ status: "ausente", start: en(-2) });
    expect(r.ultimaAtendida?.start).toBe(en(-10));
    expect(r.citas).toBe(3);
  });

  it("la próxima cita es la primera que viene, aunque haya otras más lejos", () => {
    const r = ver([atendida(-5), cita({ status: "pendiente", start: en(20) }), cita({ status: "confirmada", start: en(4) })]);
    expect(r.proxima?.start).toBe(en(4));
  });

  it("el plan que se muestra es el más reciente que no está anulado, aunque haya uno anulado más nuevo", () => {
    const viejo = plan("aceptado", { createdAt: en(-60) });
    const nuevo = plan("presentado", { createdAt: en(-20) });
    const anulado = plan("anulado", { createdAt: en(-2) });
    expect(ver([], [viejo, anulado, nuevo]).plan).toBe(nuevo);
    expect(ver([], [anulado]).plan).toBeUndefined();
  });

  it("los planes cuentan todos (también los anulados) en la columna «Planes»", () => {
    expect(ver([], [plan("aceptado"), plan("anulado")]).planes).toBe(2);
  });

  it("las citas y los planes de otro paciente no cuentan", () => {
    const r = ver([atendida(-5, { patientId: "otro" }), cita({ status: "confirmada", start: en(2), patientId: "otro" })], [plan("aceptado", { patientId: "otro" })]);
    expect(r).toMatchObject({ enVista: false, enLista: false, citas: 0, planes: 0 });
  });

  it("una cita con la fecha ilegible se ignora en vez de romper la tabla", () => {
    const r = ver([atendida(-5), cita({ status: "completada", start: "no es una fecha" })]);
    expect(r).toMatchObject({ citas: 1, enLista: true, desde: "2026-10-03" });
  });

  it("un plan con la fecha ilegible no tira: está en la lista pero sin «desde»", () => {
    const r = ver([], [plan("aceptado", { createdAt: "???" })]);
    expect(r).toMatchObject({ enLista: true, desde: null, dias: null });
  });
});

describe("seguimientoDe — la hora cuenta", () => {
  it("una cita de hoy más tarde es próxima; una de hoy que ya empezó, no", () => {
    expect(ver([atendida(-5), cita({ status: "confirmada", start: en(0, 18) })]).enLista).toBe(false);
    const yaEmpezo = ver([atendida(-5), cita({ status: "confirmada", start: en(0, 9) })]);
    expect(yaEmpezo.enLista).toBe(true);
    expect(yaEmpezo.proxima).toBeUndefined();
  });

  it("una cita que empieza justo ahora ya no es futura", () => {
    expect(ver([atendida(-5), cita({ status: "confirmada", start: AHORA.toISOString() })]).proxima).toBeUndefined();
  });

  it("alguien que se atendió esta mañana y no tiene otra cita aparece hoy, desde hoy", () => {
    const r = ver([atendida(0, { start: en(0, 9) })]);
    expect(r).toMatchObject({ enLista: true, desde: "2026-10-08", dias: 0 });
  });

  it("los días se cuentan en días locales: ayer a las 23:50 y ahora las 00:10 es 1 día, no 0", () => {
    const r = ver([cita({ status: "completada", start: new Date(2026, 9, 7, 23, 50).toISOString() })], [], { ahora: new Date(2026, 9, 8, 0, 10) });
    expect(r).toMatchObject({ desde: "2026-10-07", dias: 1 });
  });

  it("y atravesando un fin de mes o de año", () => {
    const r = ver([atendida(-5)], [], { ahora: new Date(2027, 0, 2, 9) });
    expect(r.dias).toBe(91); // del 3-oct-2026 al 2-ene-2027
  });

  it("una asistencia con la fecha en el futuro (cita marcada «Atendido» antes de hora) no da días negativos ni cuenta como próxima", () => {
    const r = ver([cita({ status: "completada", start: en(0, 16) })]);
    expect(r.proxima).toBeUndefined();
    expect(r.enLista).toBe(true);
    expect(r.dias).toBe(0);
  });
});

describe("seguimientoDe — quitado a mano", () => {
  it("lo quitaron después de su última asistencia: no está, y la salida dice que fue a mano", () => {
    const q = quita(-3);
    const r = ver([atendida(-9)], [], { seguimiento: q });
    expect(r).toMatchObject({ enLista: false, salida: "quitado", quita: q });
  });

  it("si después de que lo quitaron se atiende de nuevo y no se le agenda nada, vuelve a la lista", () => {
    const r = ver([atendida(-9), atendida(-1)], [], { seguimiento: quita(-3) });
    expect(r).toMatchObject({ enLista: true, quita: null, salida: null, desde: "2026-10-07", dias: 1 });
  });

  it("«Atendiéndose» después de la quita también lo hace volver", () => {
    const r = ver([atendida(-9), cita({ status: "en_atencion", start: en(0, 14) })], [], { seguimiento: quita(-3) });
    expect(r.enLista).toBe(true);
  });

  it("la asistencia anterior a la quita no lo devuelve, aunque sea el mismo día", () => {
    // Se atendió a las 10:00 y a las 11:00 lo quitaron («Terminó su tratamiento»).
    const r = ver([atendida(-3)], [], { seguimiento: quita(-3) });
    expect(r).toMatchObject({ enLista: false, salida: "quitado" });
  });

  it("una cita que justo coincide con el instante de la quita no cuenta como volver a asistir", () => {
    const q = quita(-3);
    const r = ver([atendida(-9), cita({ status: "completada", start: q.cerradoAt })], [], { seguimiento: q });
    expect(r.enLista).toBe(false);
  });

  it("volvió a asistir pero ya tiene otra cita agendada: no está por tener próxima cita, y la quita quedó sin efecto", () => {
    const r = ver([atendida(-9), atendida(-1), cita({ status: "confirmada", start: en(6) })], [], { seguimiento: quita(-3) });
    expect(r).toMatchObject({ enLista: false, quita: null, salida: null });
    expect(r.proxima?.start).toBe(en(6));
  });

  it("quitado y con una cita nueva que todavía no se cumplió: sigue quitado, pero no «salió» de nada porque tiene próxima cita", () => {
    const q = quita(-3);
    const r = ver([atendida(-9), cita({ status: "confirmada", start: en(6) })], [], { seguimiento: q });
    expect(r).toMatchObject({ enLista: false, quita: q, salida: null });
  });

  it("armar un plan nuevo después de quitarlo no lo devuelve: solo vuelve si se atiende", () => {
    const r = ver([atendida(-9)], [plan("presentado", { createdAt: en(-1) })], { seguimiento: quita(-3) });
    expect(r).toMatchObject({ enLista: false, salida: "quitado" });
  });

  it("quitar a quien solo tenía un plan vigente (nunca asistió) lo mantiene afuera", () => {
    const r = ver([], [plan("aceptado")], { seguimiento: quita(-3) });
    expect(r).toMatchObject({ enLista: false, salida: "quitado" });
  });

  it("si además su plan terminó, la razón es que terminó y la quita no figura como vigente", () => {
    const r = ver([atendida(-9)], [plan("completado")], { seguimiento: quita(-3) });
    expect(r).toMatchObject({ enLista: false, salida: "finalizado", quita: null, finalizado: true });
  });

  it("un registro de quita roto se ignora: el paciente sigue las reglas de siempre", () => {
    const rotos: unknown[] = [
      {}, "quitado", 42, [], { cerradoAt: en(-3), motivo: "", por: "x" }, { cerradoAt: en(-3), motivo: "   ", por: "x" },
      { cerradoAt: "no es una fecha", motivo: "No quiere continuar", por: "x" }, { motivo: "No quiere continuar", por: "x" },
      { cerradoAt: 12345, motivo: "No quiere continuar", por: "x" },
    ];
    for (const seguimiento of rotos) expect(ver([atendida(-9)], [], { seguimiento }).enLista, JSON.stringify(seguimiento)).toBe(true);
  });

  it("la quita que se devuelve viene limpia: motivo sin espacios sobrantes y sin campos de más", () => {
    const r = ver([atendida(-9)], [], { seguimiento: { cerradoAt: en(-3, 11), motivo: "  Se atiende en otra clínica  ", por: "Laura", extra: "no va" } });
    expect(r.quita).toEqual({ cerradoAt: en(-3, 11), motivo: "Se atiende en otra clínica", por: "Laura" });
  });

  it("un registro sin «por» se acepta (datos viejos o armados a mano) con el nombre vacío", () => {
    const r = ver([atendida(-9)], [], { seguimiento: { cerradoAt: en(-3, 11), motivo: "No quiere continuar" } });
    expect(r.quita).toEqual({ cerradoAt: en(-3, 11), motivo: "No quiere continuar", por: "" });
  });
});

describe("seguimientoDe — vistas por tipo de consulta", () => {
  const rehab = (o: Partial<CitaDeSeguimiento> & { status: AppointmentStatus }) => cita({ tipoConsulta: "rehabilitacion", ...o });
  const estetica = (o: Partial<CitaDeSeguimiento> & { status: AppointmentStatus }) => cita({ tipoConsulta: "estetica", ...o });

  it("en una vista por tipo solo cuentan las citas de ese tipo", () => {
    const citas = [rehab({ status: "completada", start: en(-20) }), estetica({ status: "completada", start: en(-2) }), cita({ status: "completada", start: en(-1) })];
    const r = ver(citas, [], { tipo: "rehabilitacion" });
    expect(r).toMatchObject({ enVista: true, citas: 1, enLista: true, desde: "2026-09-18", dias: 20 });
    expect(r.ultima?.tipoConsulta).toBe("rehabilitacion");
    expect(ver(citas).citas).toBe(3); // la vista general las cuenta todas
  });

  it("quien no tiene ninguna cita de ese tipo no está en la tabla, aunque tenga citas de otros tipos y hasta un plan", () => {
    const r = ver([estetica({ status: "completada" })], [plan("aceptado")], { tipo: "rehabilitacion" });
    expect(r).toMatchObject({ enVista: false, enLista: true, citas: 0, planes: 1 });
  });

  it("las citas sin tipo no entran en una vista por tipo pero sí en la general", () => {
    const sinTipo = cita({ status: "completada" });
    expect(ver([sinTipo], [], { tipo: "estetica" }).enVista).toBe(false);
    expect(ver([sinTipo]).enVista).toBe(true);
  });

  it("asistió a estética pero a rehabilitación solo faltó: en la vista de rehabilitación no está", () => {
    const citas = [estetica({ status: "completada", start: en(-9) }), rehab({ status: "ausente", start: en(-3) })];
    expect(ver(citas, [], { tipo: "rehabilitacion" })).toMatchObject({ enVista: true, enLista: false });
    expect(ver(citas, [], { tipo: "estetica" })).toMatchObject({ enVista: true, enLista: true });
  });

  it("la cita futura de OTRO tipo no lo saca de la lista de esta vista", () => {
    const citas = [rehab({ status: "completada", start: en(-9) }), estetica({ status: "confirmada", start: en(4) })];
    expect(ver(citas, [], { tipo: "rehabilitacion" }).enLista).toBe(true);
    expect(ver(citas).enLista).toBe(false); // en la general sí tiene próxima cita
  });

  it("una cita futura de ese tipo sí lo saca", () => {
    const citas = [rehab({ status: "completada", start: en(-9) }), rehab({ status: "pendiente", start: en(4) })];
    expect(ver(citas, [], { tipo: "rehabilitacion" })).toMatchObject({ enLista: false });
  });

  it("los planes cuentan siempre: un plan vigente lo deja en la lista aunque no haya asistido a esa clase de cita", () => {
    const r = ver([rehab({ status: "ausente", start: en(-3) })], [plan("presentado", { createdAt: en(-8) })], { tipo: "rehabilitacion" });
    expect(r).toMatchObject({ enVista: true, enLista: true, desdeDe: "plan", dias: 8 });
  });

  it("y un plan terminado lo saca, sea cual sea el tipo de la vista", () => {
    const r = ver([rehab({ status: "completada", start: en(-9) })], [plan("completado")], { tipo: "rehabilitacion" });
    expect(r).toMatchObject({ enLista: false, finalizado: true, salida: "finalizado" });
  });

  it("la quita solo se levanta con asistencias de la clase de la vista", () => {
    const citas = [rehab({ status: "completada", start: en(-9) }), estetica({ status: "completada", start: en(-1) })];
    const seguimiento = quita(-3);
    expect(ver(citas, [], { tipo: "rehabilitacion", seguimiento })).toMatchObject({ enLista: false, salida: "quitado" });
    expect(ver(citas, [], { seguimiento })).toMatchObject({ enLista: true, quita: null });
  });

  it("cuenta de la vista general: una cita de tipo «general» entra, y en una vista por tipo no", () => {
    const general = cita({ tipoConsulta: "general", status: "completada" });
    expect(ver([general]).citas).toBe(1);
    expect(ver([general], [], { tipo: "rehabilitacion" }).citas).toBe(0);
  });
});

describe("seguimientoDeTodos — la clínica entera de una vez", () => {
  const citas = [
    atendida(-5, { patientId: "a" }),
    atendida(-9, { patientId: "b" }), cita({ patientId: "b", status: "confirmada", start: en(3) }),
    atendida(-2, { patientId: "c" }),
    cita({ patientId: "d", status: "ausente", start: en(-1) }),
  ];
  const planes = [plan("completado", { patientId: "c" }), plan("borrador", { patientId: "e" })];
  const pacientes = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }, { id: "f", disabled: true }, { id: "g" }];
  const todos = seguimientoDeTodos({ pacientes, citas, presupuestos: planes, ahora: AHORA });

  it("devuelve un resultado por paciente, agrupando sus citas y planes sin mezclarlos", () => {
    expect([...todos.keys()]).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    expect(todos.get("a")).toMatchObject({ enLista: true, citas: 1 });
    expect(todos.get("b")).toMatchObject({ enLista: false, citas: 2 });
    expect(todos.get("c")).toMatchObject({ enLista: false, finalizado: true, salida: "finalizado" });
    expect(todos.get("d")).toMatchObject({ enVista: true, enLista: false });
    expect(todos.get("e")).toMatchObject({ enVista: true, enLista: true, desdeDe: "plan" });
    expect(todos.get("f")).toMatchObject({ enVista: false, enLista: false });
    expect(todos.get("g")).toMatchObject({ enVista: false, citas: 0, planes: 0 });
  });

  it("da lo mismo que preguntar por cada paciente", () => {
    for (const p of pacientes) {
      expect(todos.get(p.id)).toEqual(seguimientoDe({ paciente: p, citas, presupuestos: planes, ahora: AHORA }));
    }
  });

  it("devuelve las mismas citas y planes que recibió, no copias (la pantalla necesita sus otros campos)", () => {
    expect(todos.get("a")?.ultima).toBe(citas[0]);
    expect(todos.get("e")?.plan).toBe(planes[1]);
  });

  it("respeta la vista por tipo", () => {
    const porTipo = seguimientoDeTodos({ pacientes, citas: [cita({ patientId: "a", status: "completada", tipoConsulta: "estetica" }), ...citas], presupuestos: planes, ahora: AHORA, tipo: "estetica" });
    expect(porTipo.get("a")).toMatchObject({ enVista: true, citas: 1 });
    expect(porTipo.get("b")?.enVista).toBe(false);
  });
});

describe("haceCuanto", () => {
  it("hoy, ayer y después, en días", () => {
    expect(haceCuanto(0)).toBe("hoy");
    expect(haceCuanto(1)).toBe("ayer");
    expect(haceCuanto(2)).toBe("hace 2 días");
    expect(haceCuanto(23)).toBe("hace 23 días");
    expect(haceCuanto(412)).toBe("hace 412 días");
  });
  it("sin dato, una raya; lo que no tiene sentido se lee como hoy", () => {
    expect(haceCuanto(null)).toBe("—");
    expect(haceCuanto(-3)).toBe("hoy");
    expect(haceCuanto(Number.NaN)).toBe("—");
  });
});

describe("whatsappUrl", () => {
  it("arma el link con solo los dígitos del teléfono", () => {
    expect(whatsappUrl("+595 981 111 111")).toBe("https://wa.me/595981111111");
    expect(whatsappUrl("(0981) 111-111")).toBe("https://wa.me/0981111111");
  });
  it("sin teléfono, o con algo que no es un teléfono, no hay link", () => {
    expect(whatsappUrl("")).toBeNull();
    expect(whatsappUrl("   ")).toBeNull();
    expect(whatsappUrl(undefined)).toBeNull();
    expect(whatsappUrl("s/d")).toBeNull();
    expect(whatsappUrl("12345")).toBeNull();
  });
});

describe("armarQuita — el motivo al quitar de la lista", () => {
  const ahora = new Date(2026, 9, 8, 15, 30);
  const base = { por: "Laura Recepción", ahora };

  it("los cuatro motivos de siempre", () => {
    expect([...MOTIVOS_DE_QUITA]).toEqual(["Terminó su tratamiento", "Se atiende en otra clínica", "No quiere continuar", "No se lo puede ubicar"]);
    for (const motivo of MOTIVOS_DE_QUITA) {
      expect(armarQuita({ ...base, motivo })).toEqual({ ok: true, quita: { cerradoAt: ahora.toISOString(), motivo, por: "Laura Recepción" } });
    }
  });

  it("sin motivo no se quita", () => {
    expect(armarQuita({ ...base, motivo: null })).toEqual({ ok: false, error: "Elegí un motivo." });
    expect(armarQuita({ ...base, motivo: "" })).toEqual({ ok: false, error: "Elegí un motivo." });
    expect(armarQuita({ ...base, motivo: "Porque sí" })).toEqual({ ok: false, error: "Elegí un motivo." }); // uno que no está en la lista
  });

  it("«Otro» exige el texto, y ese texto es el motivo", () => {
    expect(armarQuita({ ...base, motivo: "Otro" })).toEqual({ ok: false, error: "Escribí el motivo." });
    expect(armarQuita({ ...base, motivo: "Otro", otro: "   " })).toEqual({ ok: false, error: "Escribí el motivo." });
    expect(armarQuita({ ...base, motivo: "Otro", otro: "  Se mudó a Encarnación  " })).toMatchObject({ ok: true, quita: { motivo: "Se mudó a Encarnación" } });
  });

  it("el texto de «Otro» se guarda en una sola línea: los saltos y los espacios de más no pasan (el motivo va también a una celda del CSV)", () => {
    const r = armarQuita({ ...base, motivo: "Otro", otro: "  Se mudó\n\na   Encarnación \t y no  vuelve\r\n" });
    expect(r).toMatchObject({ ok: true, quita: { motivo: "Se mudó a Encarnación y no vuelve" } });
  });

  it("el texto de «Otro» tiene un tope para que el documento del paciente no crezca sin control", () => {
    expect(MAX_MOTIVO).toBe(200);
    expect(armarQuita({ ...base, motivo: "Otro", otro: "x".repeat(MAX_MOTIVO) }).ok).toBe(true);
    expect(armarQuita({ ...base, motivo: "Otro", otro: "x".repeat(MAX_MOTIVO + 1) })).toEqual({ ok: false, error: "El motivo puede tener hasta 200 letras." });
  });

  it("el texto sobrante de «Otro» no se guarda cuando se eligió uno de la lista", () => {
    expect(armarQuita({ ...base, motivo: "No quiere continuar", otro: "texto olvidado" })).toMatchObject({ ok: true, quita: { motivo: "No quiere continuar" } });
  });

  it("lo que arma se lee como una quita vigente", () => {
    const r = armarQuita({ ...base, motivo: "No quiere continuar" });
    if (!r.ok) throw new Error("debía armarse");
    const antes = new Date(2026, 9, 8, 15, 31);
    expect(ver([atendida(-9)], [], { seguimiento: r.quita, ahora: antes }).salida).toBe("quitado");
  });
});
