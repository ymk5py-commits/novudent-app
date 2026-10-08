import { describe, it, expect } from "vitest";
import { huecosDelDia, citasEnElHueco, diasDesde, HORARIO_POR_DEFECTO, finDeCita, especialidadCoincide, TIPOS_CONSULTA } from "./disponibilidad";

/** Martes 6 de octubre de 2026, medianoche local. */
const MARTES = new Date(2026, 9, 6);
const DOMINGO = new Date(2026, 9, 4);
/** Mucho antes: ningún turno del martes quedó en el pasado. */
const ANTES = new Date(2026, 9, 1, 8, 0).getTime();
const iso = (d: Date, h: number, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x.toISOString(); };
const cita = (h: number, m: number, durMin: number, extra: Record<string, unknown> = {}) => {
  const start = iso(MARTES, h, m);
  return { id: `a${h}${m}`, dentistId: "u2", status: "confirmada", start, end: new Date(Date.parse(start) + durMin * 60_000).toISOString(), ...extra };
};

describe("huecosDelDia", () => {
  it("con la agenda vacía ofrece de 08:00 a la última hora en que entra la consulta", () => {
    const h = huecosDelDia(MARTES, 60, { dentistId: "u2", citas: [], ahora: ANTES });
    expect(h[0]).toBe("08:00");
    expect(h.at(-1)).toBe("17:00"); // 17:00 + 1 h = 18:00, el cierre
    expect(h).not.toContain("17:30");
  });

  it("el domingo no atiende (horario por defecto: lunes a sábado)", () => {
    expect(HORARIO_POR_DEFECTO.dias).not.toContain(0);
    expect(huecosDelDia(DOMINGO, 30, { dentistId: "u2", citas: [], ahora: ANTES })).toEqual([]);
  });

  it("una consulta de 2 h no entra en un hueco de 1 h (el ejemplo del pedido)", () => {
    // Ocupado de 08:00 a 10:00 y de 11:00 a 18:00: el único hueco es 10:00–11:00.
    const citas = [cita(8, 0, 120), cita(11, 0, 420)];
    expect(huecosDelDia(MARTES, 60, { dentistId: "u2", citas, ahora: ANTES })).toEqual(["10:00"]);
    expect(huecosDelDia(MARTES, 120, { dentistId: "u2", citas, ahora: ANTES })).toEqual([]);
  });

  it("las citas de otro profesional no ocupan; las anuladas y los no asiste tampoco", () => {
    const citas = [cita(9, 0, 60, { dentistId: "u4" }), cita(10, 0, 60, { status: "cancelada" }), cita(11, 0, 60, { status: "ausente" })];
    const h = huecosDelDia(MARTES, 60, { dentistId: "u2", citas, ahora: ANTES });
    for (const t of ["09:00", "10:00", "11:00"]) expect(h).toContain(t);
  });

  it("si se eligió box, una cita de otro profesional en ese box también ocupa", () => {
    const citas = [cita(9, 0, 60, { dentistId: "u4", boxId: "box1" })];
    expect(huecosDelDia(MARTES, 60, { dentistId: "u2", boxId: "box1", citas, ahora: ANTES })).not.toContain("09:00");
    expect(huecosDelDia(MARTES, 60, { dentistId: "u2", boxId: "box2", citas, ahora: ANTES })).toContain("09:00");
  });

  it("no ofrece horarios que ya pasaron", () => {
    const ahora = new Date(2026, 9, 6, 12, 10).getTime();
    const h = huecosDelDia(MARTES, 30, { dentistId: "u2", citas: [], ahora });
    expect(h[0]).toBe("12:30");
  });

  it("al editar, la propia cita no se ocupa a sí misma", () => {
    const propia = cita(9, 0, 60);
    expect(huecosDelDia(MARTES, 60, { dentistId: "u2", citas: [propia], ahora: ANTES })).not.toContain("09:00");
    expect(huecosDelDia(MARTES, 60, { dentistId: "u2", citas: [propia], ahora: ANTES, ignorarId: propia.id })).toContain("09:00");
  });

  it("en multiconsulta, los turnos ya elegidos cuentan como ocupados", () => {
    const elegido = cita(9, 0, 60, { id: "elegido" });
    const h = huecosDelDia(MARTES, 60, { dentistId: "u2", citas: [elegido], ahora: ANTES });
    expect(h).not.toContain("08:30");
    expect(h).toContain("08:00");
    expect(h).toContain("10:00");
  });

  it("respeta un horario propio del profesional", () => {
    const horario = { dias: [2], desde: "14:00", hasta: "16:00" };
    expect(huecosDelDia(MARTES, 60, { dentistId: "u2", citas: [], ahora: ANTES, horario })).toEqual(["14:00", "14:30", "15:00"]);
  });
});

/* Pedido de Camila (8-oct-2026): los espacios bloqueados no se ofrecen nunca, y «Sobreagendar» deja elegir un horario que ya tiene otra
   cita del mismo profesional o del mismo box (pero no uno bloqueado, ni uno que ya pasó). */
describe("bloqueos y sobreagendar", () => {
  const bloqueo = (h: number, m: number, durMin: number, extra: Record<string, unknown> = {}) => {
    const start = iso(MARTES, h, m);
    return { dentistId: "u2", start, end: new Date(Date.parse(start) + durMin * 60_000).toISOString(), ...extra };
  };

  it("un bloqueo del profesional saca los horarios que pisa, también el que empieza antes y termina adentro", () => {
    const h = huecosDelDia(MARTES, 60, { dentistId: "u2", citas: [], ahora: ANTES, bloqueos: [bloqueo(12, 0, 60)] });
    expect(h).not.toContain("11:30"); // 11:30–12:30 pisa el almuerzo
    expect(h).not.toContain("12:00");
    expect(h).not.toContain("12:30");
    expect(h).toContain("11:00"); // 11:00–12:00 solo toca el borde
    expect(h).toContain("13:00");
  });

  it("un bloqueo de otro profesional no saca nada; uno de «Todos los profesionales» sí", () => {
    expect(huecosDelDia(MARTES, 30, { dentistId: "u2", citas: [], ahora: ANTES, bloqueos: [bloqueo(12, 0, 60, { dentistId: "u4" })] })).toContain("12:00");
    expect(huecosDelDia(MARTES, 30, { dentistId: "u2", citas: [], ahora: ANTES, bloqueos: [bloqueo(12, 0, 60, { dentistId: "*" })] })).not.toContain("12:00");
  });

  it("un bloqueo de un box solo cuenta si se eligió ese box", () => {
    const bloqueos = [bloqueo(12, 0, 60, { dentistId: "*", boxId: "box2" })];
    expect(huecosDelDia(MARTES, 30, { dentistId: "u2", boxId: "box2", citas: [], ahora: ANTES, bloqueos })).not.toContain("12:00");
    expect(huecosDelDia(MARTES, 30, { dentistId: "u2", boxId: "box1", citas: [], ahora: ANTES, bloqueos })).toContain("12:00");
    expect(huecosDelDia(MARTES, 30, { dentistId: "u2", citas: [], ahora: ANTES, bloqueos })).toContain("12:00");
  });

  it("con «permitirSuperponer» las citas del profesional y del box no ocupan, pero los bloqueos sí", () => {
    const citas = [cita(9, 0, 60), cita(10, 0, 60, { dentistId: "u4", boxId: "box1" })];
    const opts = { dentistId: "u2", boxId: "box1", citas, ahora: ANTES, bloqueos: [bloqueo(12, 0, 60)] };
    expect(huecosDelDia(MARTES, 30, opts)).not.toContain("09:00");
    const todos = huecosDelDia(MARTES, 30, { ...opts, permitirSuperponer: true });
    expect(todos).toContain("09:00");
    expect(todos).toContain("10:00");
    expect(todos).not.toContain("12:00");
    expect(todos).not.toContain("12:30");
  });

  it("sobreagendando tampoco vuelven los horarios que ya pasaron ni los de fuera del horario de atención", () => {
    const ahora = new Date(2026, 9, 6, 12, 10).getTime();
    const h = huecosDelDia(MARTES, 30, { dentistId: "u2", citas: [cita(14, 0, 60)], ahora, permitirSuperponer: true });
    expect(h[0]).toBe("12:30");
    expect(h).toContain("14:00");
    expect(h.at(-1)).toBe("17:30");
    expect(huecosDelDia(DOMINGO, 30, { dentistId: "u2", citas: [], ahora: ANTES, permitirSuperponer: true })).toEqual([]);
  });

  it("«incluir» ofrece también un horario fuera de los pasos de 30 min (sobreagendar una cita de las 09:20), si entra y no está bloqueado", () => {
    const citas = [cita(9, 20, 20)];
    const sobre = { dentistId: "u2", citas, ahora: ANTES, permitirSuperponer: true };
    expect(huecosDelDia(MARTES, 30, { ...sobre, incluir: ["09:20"] })).toEqual(expect.arrayContaining(["09:00", "09:20", "09:30"]));
    const h = huecosDelDia(MARTES, 30, { ...sobre, incluir: ["09:20"] });
    expect(h.indexOf("09:20")).toBe(h.indexOf("09:00") + 1); // en orden
    expect(huecosDelDia(MARTES, 30, { ...sobre, incluir: ["09:20"], bloqueos: [bloqueo(9, 0, 60)] })).not.toContain("09:20");
    expect(huecosDelDia(MARTES, 30, { dentistId: "u2", citas, ahora: ANTES, incluir: ["09:20"] })).not.toContain("09:20"); // sin sobreagendar está ocupado
    expect(huecosDelDia(MARTES, 30, { ...sobre, incluir: ["17:50", "basura"] })).not.toContain("17:50"); // no entra antes del cierre
  });

  it("citasEnElHueco cuenta las citas del profesional o del box que pisa ese horario (para marcarlo «Ya hay 1 cita»)", () => {
    const citas = [
      cita(9, 0, 60), cita(9, 30, 30, { dentistId: "u4", boxId: "box1" }), cita(9, 0, 30, { dentistId: "u4" }),
      cita(9, 0, 30, { status: "cancelada" }), cita(10, 0, 30),
    ];
    expect(citasEnElHueco(MARTES, "09:00", 60, { dentistId: "u2", boxId: "box1", citas })).toBe(2);
    expect(citasEnElHueco(MARTES, "09:00", 60, { dentistId: "u2", citas })).toBe(1);
    expect(citasEnElHueco(MARTES, "10:30", 30, { dentistId: "u2", citas })).toBe(0);
    expect(citasEnElHueco(MARTES, "09:00", 60, { dentistId: "u2", citas, ignorarId: "a90" })).toBe(0);
  });
});

describe("apoyo", () => {
  it("diasDesde arma 7 días seguidos desde la fecha", () => {
    const d = diasDesde(MARTES, 7);
    expect(d).toHaveLength(7);
    expect(d[6].getDate()).toBe(12);
  });

  it("finDeCita suma horas y minutos", () => {
    const inicio = iso(MARTES, 9, 30);
    expect(new Date(finDeCita(inicio, 1, 45)).getHours()).toBe(11);
    expect(new Date(finDeCita(inicio, 1, 45)).getMinutes()).toBe(15);
  });

  it("los tipos de consulta son los que pidió la clínica", () => {
    expect(TIPOS_CONSULTA.map((t) => t.label)).toEqual(["Todas", "General", "Odontología estética", "Ortodoncia", "Rehabilitación oral"]);
  });

  it("filtra profesionales por especialidad, sin importar mayúsculas ni tildes", () => {
    expect(especialidadCoincide("estetica", "Odontología Estética")).toBe(true);
    expect(especialidadCoincide("ortodoncia", "Ortodoncia y ortopedia")).toBe(true);
    expect(especialidadCoincide("rehabilitacion", "Rehabilitacion oral")).toBe(true);
    expect(especialidadCoincide("general", "Endodoncia")).toBe(false);
    expect(especialidadCoincide("todas", "Endodoncia")).toBe(true);
  });
});
