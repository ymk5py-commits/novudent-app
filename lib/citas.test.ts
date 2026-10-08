import { describe, it, expect } from "vitest";
import { proximasCitas } from "./citas";
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
