import { describe, it, expect } from "vitest";
import { huecosDelDia, diasDesde, HORARIO_POR_DEFECTO, finDeCita, especialidadCoincide, TIPOS_CONSULTA } from "./disponibilidad";

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
