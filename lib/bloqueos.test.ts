import { describe, it, expect } from "vitest";
import {
  bloqueoAplica, expandirRepeticion, errorDeBloqueo, armarBloqueos, citasQuePisan, rangoDeBloqueo, etiquetaDeBloqueo,
  TODOS_LOS_PROFESIONALES, MOTIVOS_SUGERIDOS, type FormBloqueo,
} from "./bloqueos";

/* «Bloquear espacio» de la agenda (pedido de Camila, 8-oct-2026): un espacio bloqueado (almuerzo, reunión, feriado) no se puede reservar,
   ni desde «Dar cita» ni desde la reserva online. Un bloqueo es de un solo día; «Repetir» crea uno por ocurrencia con el mismo `serieId`. */

const form = (extra: Partial<FormBloqueo> = {}): FormBloqueo => ({
  dentistId: "u2", fecha: "2026-10-12", desde: "12:00", hasta: "13:00", motivo: "Almuerzo", repetir: "no", ...extra,
});
/** Instante ISO de una fecha y hora LOCALES (como las arma la agenda). */
const local = (fecha: string, hora: string) => {
  const [y, mo, d] = fecha.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  return new Date(y, mo - 1, d, h, mi).toISOString();
};

describe("bloqueoAplica", () => {
  it("un bloqueo de un profesional aplica a ese profesional y no a otro", () => {
    expect(bloqueoAplica({ dentistId: "u2" }, { dentistId: "u2" })).toBe(true);
    expect(bloqueoAplica({ dentistId: "u2" }, { dentistId: "u4" })).toBe(false);
  });

  it("«Todos los profesionales» («*») aplica a cualquiera", () => {
    expect(TODOS_LOS_PROFESIONALES).toBe("*");
    expect(bloqueoAplica({ dentistId: "*" }, { dentistId: "u4" })).toBe(true);
  });

  it("sin box aplica en todos los boxes, y también cuando no se eligió box", () => {
    expect(bloqueoAplica({ dentistId: "u2" }, { dentistId: "u2", boxId: "box1" })).toBe(true);
    expect(bloqueoAplica({ dentistId: "u2" }, { dentistId: "u2" })).toBe(true);
  });

  it("con box aplica solo en ese box; sin box elegido (la reserva online no elige box) no aplica", () => {
    expect(bloqueoAplica({ dentistId: "*", boxId: "box2" }, { dentistId: "u2", boxId: "box2" })).toBe(true);
    expect(bloqueoAplica({ dentistId: "*", boxId: "box2" }, { dentistId: "u2", boxId: "box1" })).toBe(false);
    expect(bloqueoAplica({ dentistId: "*", boxId: "box2" }, { dentistId: "u2" })).toBe(false);
  });

  it("profesional y box a la vez: tienen que coincidir los dos", () => {
    expect(bloqueoAplica({ dentistId: "u2", boxId: "box2" }, { dentistId: "u2", boxId: "box2" })).toBe(true);
    expect(bloqueoAplica({ dentistId: "u2", boxId: "box2" }, { dentistId: "u4", boxId: "box2" })).toBe(false);
  });
});

describe("expandirRepeticion", () => {
  it("«No se repite»: solo la fecha", () => {
    expect(expandirRepeticion({ fecha: "2026-10-12", repetir: "no", repetirHasta: "2026-12-31" })).toEqual(["2026-10-12"]);
  });

  it("«Todos los días hábiles»: de lunes a sábado, sin domingos, hasta «Repetir hasta» inclusive", () => {
    // Lunes 12 al martes 20 de octubre de 2026: el domingo 18 no entra.
    expect(expandirRepeticion({ fecha: "2026-10-12", repetir: "habiles", repetirHasta: "2026-10-20" })).toEqual([
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-19", "2026-10-20",
    ]);
  });

  it("empezando un domingo con «días hábiles», el domingo no entra", () => {
    expect(expandirRepeticion({ fecha: "2026-10-18", repetir: "habiles", repetirHasta: "2026-10-19" })).toEqual(["2026-10-19"]);
  });

  it("«Todas las semanas»: el mismo día de cada semana hasta «Repetir hasta» inclusive", () => {
    expect(expandirRepeticion({ fecha: "2026-10-12", repetir: "semanal", repetirHasta: "2026-11-02" })).toEqual([
      "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02",
    ]);
  });

  it("cruza el cambio de mes y de año sin saltear ni repetir días (también con el cambio de hora)", () => {
    const dias = expandirRepeticion({ fecha: "2026-12-28", repetir: "habiles", repetirHasta: "2027-01-04" });
    expect(dias).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-04"]);
    expect(new Set(expandirRepeticion({ fecha: "2026-09-28", repetir: "habiles", repetirHasta: "2026-10-10" })).size).toBe(12);
  });

  it("nunca pasa de un año, aunque «Repetir hasta» diga más", () => {
    const dias = expandirRepeticion({ fecha: "2026-10-12", repetir: "semanal", repetirHasta: "2030-01-01" });
    expect(dias.at(-1)! <= "2027-10-12").toBe(true);
    expect(dias.length).toBeLessThanOrEqual(53);
  });
});

describe("errorDeBloqueo", () => {
  it("un bloqueo bien armado no tiene errores", () => {
    expect(errorDeBloqueo(form())).toBeNull();
    expect(errorDeBloqueo(form({ dentistId: "*", motivo: "" }))).toBeNull();
  });

  it("«Hasta» tiene que ser después de «Desde»", () => {
    expect(errorDeBloqueo(form({ hasta: "12:00" }))).toMatch(/Hasta.*después.*Desde/);
    expect(errorDeBloqueo(form({ hasta: "11:45" }))).toMatch(/Hasta.*después.*Desde/);
  });

  it("los horarios van de a 15 minutos", () => {
    expect(errorDeBloqueo(form({ desde: "12:10" }))).toMatch(/15 minutos/);
    expect(errorDeBloqueo(form({ hasta: "13:05" }))).toMatch(/15 minutos/);
    expect(errorDeBloqueo(form({ desde: "08:15", hasta: "08:45" }))).toBeNull();
  });

  it("faltan datos: profesional, fecha u horas", () => {
    expect(errorDeBloqueo(form({ dentistId: "" }))).toMatch(/profesional/i);
    expect(errorDeBloqueo(form({ fecha: "" }))).toMatch(/fecha/i);
    expect(errorDeBloqueo(form({ fecha: "2026-02-31" }))).toMatch(/fecha/i);
    expect(errorDeBloqueo(form({ desde: "" }))).toMatch(/hora/i);
    expect(errorDeBloqueo(form({ hasta: "25:00" }))).toMatch(/hora/i);
  });

  it("con repetición hace falta «Repetir hasta», no antes de la fecha", () => {
    expect(errorDeBloqueo(form({ repetir: "semanal" }))).toMatch(/Repetir hasta/);
    expect(errorDeBloqueo(form({ repetir: "semanal", repetirHasta: "2026-10-11" }))).toMatch(/antes de la fecha/);
    expect(errorDeBloqueo(form({ repetir: "semanal", repetirHasta: "2026-10-12" }))).toBeNull();
  });

  it("se repite hasta un año como máximo", () => {
    expect(errorDeBloqueo(form({ repetir: "habiles", repetirHasta: "2027-10-12" }))).toBeNull();
    expect(errorDeBloqueo(form({ repetir: "habiles", repetirHasta: "2027-10-13" }))).toMatch(/un año/);
  });

  it("«días hábiles» sin ningún día hábil en el rango (de domingo a domingo) no crea nada: se avisa", () => {
    expect(errorDeBloqueo(form({ fecha: "2026-10-18", repetir: "habiles", repetirHasta: "2026-10-18" }))).toMatch(/día hábil/);
  });

  it("«Hasta 24:00» es todo el resto del día (vacaciones, feriado); «Desde 24:00» no", () => {
    expect(errorDeBloqueo(form({ desde: "00:00", hasta: "24:00" }))).toBeNull();
    expect(errorDeBloqueo(form({ desde: "24:00", hasta: "24:00" }))).toMatch(/hora/);
  });
});

describe("etiquetaDeBloqueo", () => {
  it("dice qué está bloqueado: horario, motivo, profesional y box («Bloqueado 12:00–13:00 · Almuerzo · Dra. Sofía Benítez · Box 2»)", () => {
    const b = { dentistId: "u2", start: local("2026-10-12", "12:00"), end: local("2026-10-12", "13:00"), reason: "Almuerzo" };
    expect(etiquetaDeBloqueo(b, "Dra. Sofía Benítez", "Box 2")).toBe("Bloqueado 12:00–13:00 · Almuerzo · Dra. Sofía Benítez · Box 2");
    expect(etiquetaDeBloqueo({ ...b, reason: undefined }, "Todos los profesionales")).toBe("Bloqueado 12:00–13:00 · Todos los profesionales");
  });
});

describe("rangoDeBloqueo", () => {
  it("dice el horario en la hora local: «12:00–13:00»", () => {
    expect(rangoDeBloqueo({ start: local("2026-10-12", "12:00"), end: local("2026-10-12", "13:00") })).toBe("12:00–13:00");
  });

  it("uno que termina a la medianoche siguiente (todo el día) dice «24:00», no «00:00»", () => {
    const [b] = armarBloqueos(form({ desde: "08:00", hasta: "24:00" }), { clinicId: "c", createdAt: "x", createdBy: "y", idBase: "b" });
    expect(Date.parse(b.end) - Date.parse(b.start)).toBe(16 * 3_600_000);
    expect(rangoDeBloqueo(b)).toBe("08:00–24:00");
  });
});

describe("armarBloqueos", () => {
  const extra = { clinicId: "cl_demo", createdAt: "2026-10-08T15:00:00.000Z", createdBy: "Laura Recepción", idBase: "bl_x" };

  it("un bloqueo de un día: inicio y fin en la hora local de la clínica, sin serie", () => {
    const [b, ...resto] = armarBloqueos(form(), extra);
    expect(resto).toHaveLength(0);
    expect(b).toEqual({
      id: "bl_x", clinicId: "cl_demo", dentistId: "u2", start: local("2026-10-12", "12:00"), end: local("2026-10-12", "13:00"),
      reason: "Almuerzo", createdAt: extra.createdAt, createdBy: "Laura Recepción",
    });
  });

  it("con repetición: uno por ocurrencia, ids distintos y todos con el mismo serieId", () => {
    const bs = armarBloqueos(form({ repetir: "semanal", repetirHasta: "2026-11-02", boxId: "box2" }), extra);
    expect(bs.map((b) => b.start)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"].map((f) => local(f, "12:00")));
    expect(new Set(bs.map((b) => b.id)).size).toBe(4);
    expect(new Set(bs.map((b) => b.serieId))).toEqual(new Set(["bl_x"]));
    expect(bs.every((b) => b.boxId === "box2")).toBe(true);
  });

  it("una repetición que da un solo día no es una serie", () => {
    const bs = armarBloqueos(form({ repetir: "semanal", repetirHasta: "2026-10-15" }), extra);
    expect(bs).toHaveLength(1);
    expect(bs[0].serieId).toBeUndefined();
  });

  it("«Todos los profesionales» guarda «*»; el motivo se limpia y uno vacío no se guarda", () => {
    const [todos] = armarBloqueos(form({ dentistId: "*", motivo: "   " }), extra);
    expect(todos.dentistId).toBe("*");
    expect(todos).not.toHaveProperty("reason");
    expect(todos).not.toHaveProperty("boxId");
    const [largo] = armarBloqueos(form({ motivo: `  <b>${"x".repeat(200)}  ` }), extra);
    expect(largo.reason!.length).toBeLessThanOrEqual(80);
    expect(largo.reason).not.toMatch(/[<>]/);
  });

  it("los motivos sugeridos son los que pidió la clínica", () => {
    expect(MOTIVOS_SUGERIDOS).toEqual(["Almuerzo", "Reunión", "Capacitación", "Vacaciones", "Feriado"]);
  });
});

describe("citasQuePisan", () => {
  const cita = (id: string, desde: string, hasta: string, extra: Record<string, unknown> = {}) =>
    ({ id, dentistId: "u2", status: "confirmada", start: local("2026-10-12", desde), end: local("2026-10-12", hasta), ...extra });
  const bloqueo = (extra: Record<string, unknown> = {}) =>
    ({ dentistId: "u2", start: local("2026-10-12", "12:00"), end: local("2026-10-12", "13:00"), ...extra });

  it("cuenta las citas del profesional que el bloqueo pisa, no las anuladas, los no asiste ni las que solo tocan el borde", () => {
    const citas = [
      cita("adentro", "12:15", "12:45"), cita("empieza-antes", "11:30", "12:30"), cita("borde-antes", "11:00", "12:00"),
      cita("borde-despues", "13:00", "13:30"), cita("anulada", "12:00", "12:30", { status: "cancelada" }),
      cita("no-asiste", "12:00", "12:30", { status: "ausente" }), cita("otro", "12:00", "12:30", { dentistId: "u4" }),
    ];
    expect(citasQuePisan([bloqueo()], citas).map((c) => c.id)).toEqual(["adentro", "empieza-antes"]);
  });

  it("«Todos» pisa las de todos los profesionales; con box, solo las de ese box", () => {
    const citas = [cita("a", "12:00", "12:30", { boxId: "box1" }), cita("b", "12:00", "12:30", { dentistId: "u4", boxId: "box2" })];
    expect(citasQuePisan([bloqueo({ dentistId: "*" })], citas).map((c) => c.id)).toEqual(["a", "b"]);
    expect(citasQuePisan([bloqueo({ dentistId: "*", boxId: "box2" })], citas).map((c) => c.id)).toEqual(["b"]);
  });

  it("con varios bloqueos (una serie) una cita se cuenta una sola vez", () => {
    const citas = [cita("a", "12:00", "13:00")];
    expect(citasQuePisan([bloqueo(), bloqueo({ start: local("2026-10-12", "12:30") })], citas)).toHaveLength(1);
  });
});
