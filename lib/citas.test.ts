import { describe, it, expect } from "vitest";
import { proximasCitas, reservasPorValidar } from "./citas";
import type { Appointment } from "./types";

type Cita = Pick<Appointment, "id" | "start" | "status"> & { source?: Appointment["source"] };
const cita = (id: string, start: string, status: Appointment["status"] = "pendiente", source?: Appointment["source"]): Cita => ({ id, start, status, source });
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

/** Jueves 8-oct-2026, 10:00 en Asunción (13:00 UTC). */
const AHORA = new Date("2026-10-08T13:00:00.000Z");

describe("proximasCitas — «Próximas citas» del Resumen de la ficha", () => {
  it("deja afuera las anuladas: una cita anulada no es una cita próxima", () => {
    const r = proximasCitas([
      cita("anulada", "2026-10-09T13:00:00.000Z", "cancelada"),
      cita("vigente", "2026-10-10T13:00:00.000Z", "confirmada"),
    ], AHORA);
    expect(ids(r)).toEqual(["vigente"]);
  });

  it("deja afuera las que ya pasaron", () => {
    const r = proximasCitas([cita("ayer", "2026-10-07T13:00:00.000Z"), cita("mañana", "2026-10-09T13:00:00.000Z")], AHORA);
    expect(ids(r)).toEqual(["mañana"]);
  });

  it("las ordena de la más cercana a la más lejana, sin importar cómo vengan", () => {
    const r = proximasCitas([
      cita("c", "2026-10-30T13:00:00.000Z"), cita("a", "2026-10-09T13:00:00.000Z"), cita("b", "2026-10-20T13:00:00.000Z"),
    ], AHORA);
    expect(ids(r)).toEqual(["a", "b", "c"]);
  });

  it("muestra las 4 más cercanas (las más lejanas quedan afuera, no las cercanas)", () => {
    const todas = Array.from({ length: 6 }, (_, i) => cita(`c${i}`, `2026-10-${String(10 + i).padStart(2, "0")}T13:00:00.000Z`));
    expect(ids(proximasCitas(todas, AHORA))).toEqual(["c0", "c1", "c2", "c3"]);
    expect(ids(proximasCitas(todas, AHORA, 2))).toEqual(["c0", "c1"]);
  });

  it("una cita que empieza justo ahora todavía cuenta", () => {
    expect(ids(proximasCitas([cita("ya", AHORA.toISOString())], AHORA))).toEqual(["ya"]);
  });

  it("no toca la lista de entrada", () => {
    const entrada = [cita("b", "2026-10-20T13:00:00.000Z"), cita("a", "2026-10-09T13:00:00.000Z")];
    proximasCitas(entrada, AHORA);
    expect(ids(entrada)).toEqual(["b", "a"]);
  });

  it("sin citas, lista vacía", () => {
    expect(proximasCitas([], AHORA)).toEqual([]);
  });
});

describe("reservasPorValidar — el cartel «Hay N agendamiento(s) online que deben ser validados»", () => {
  /** Hoy a las 00:00 en Asunción (03:00 UTC): el cartel cuenta desde el principio del día. */
  const HOY = new Date("2026-10-08T03:00:00.000Z");

  it("cuenta las reservas online sin validar de hoy y de los días que vienen, no solo de un día", () => {
    const r = reservasPorValidar([
      cita("hoy", "2026-10-08T14:00:00.000Z", "pendiente", "online"),
      cita("mañana", "2026-10-09T13:00:00.000Z", "pendiente", "online"),
      cita("el-mes-que-viene", "2026-11-03T13:00:00.000Z", "pendiente", "online"),
    ], HOY);
    expect(ids(r)).toEqual(["hoy", "mañana", "el-mes-que-viene"]);
  });

  it("una cita cargada por la recepción (no online) no es una reserva por validar, aunque esté sin confirmar", () => {
    const r = reservasPorValidar([
      cita("interna", "2026-10-09T13:00:00.000Z", "pendiente", "interna"),
      cita("sin-origen", "2026-10-09T14:00:00.000Z", "pendiente"),
      cita("online", "2026-10-09T15:00:00.000Z", "pendiente", "online"),
    ], HOY);
    expect(ids(r)).toEqual(["online"]);
  });

  it("una reserva online que ya se confirmó, atendió o anuló ya está validada", () => {
    const r = reservasPorValidar(
      (["confirmada", "completada", "en_atencion", "en_sala", "ausente", "cancelada"] as const)
        .map((s) => cita(s, "2026-10-09T13:00:00.000Z", s, "online")),
      HOY,
    );
    expect(r).toEqual([]);
  });

  it("las de días que ya pasaron no se cuentan (no hay nada que validar)", () => {
    const r = reservasPorValidar([
      cita("ayer", "2026-10-07T20:00:00.000Z", "pendiente", "online"),
      cita("hoy-a-la-mañana", "2026-10-08T12:00:00.000Z", "pendiente", "online"),
    ], HOY);
    expect(ids(r)).toEqual(["hoy-a-la-mañana"]);
  });

  it("las devuelve de la más próxima a la más lejana: la primera es adonde lleva «Ver y validar»", () => {
    const r = reservasPorValidar([
      cita("c", "2026-10-20T13:00:00.000Z", "pendiente", "online"),
      cita("a", "2026-10-09T13:00:00.000Z", "pendiente", "online"),
      cita("b", "2026-10-12T13:00:00.000Z", "pendiente", "online"),
    ], HOY);
    expect(ids(r)).toEqual(["a", "b", "c"]);
  });

  it("no toca la lista de entrada", () => {
    const entrada = [cita("b", "2026-10-20T13:00:00.000Z", "pendiente", "online"), cita("a", "2026-10-09T13:00:00.000Z", "pendiente", "online")];
    reservasPorValidar(entrada, HOY);
    expect(ids(entrada)).toEqual(["b", "a"]);
  });
});
