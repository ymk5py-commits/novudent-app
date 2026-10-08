import { describe, it, expect } from "vitest";
import { citasSinBox, diaDeLaCita, citasDelBox } from "./boxes";
import type { Appointment } from "./types";

const cita = (id: string, extra: Partial<Appointment> = {}): Appointment => ({
  id, clinicId: "c1", patientId: "p1", dentistId: "u2", start: "2026-10-08T13:00:00.000Z", end: "2026-10-08T13:30:00.000Z",
  status: "pendiente", reason: "Control", ...extra,
} as Appointment);

describe("citasSinBox — qué pasa con las citas cuando se borra un box", () => {
  const citas = [cita("a", { boxId: "box1" }), cita("b", { boxId: "box2" }), cita("c"), cita("d", { boxId: "box1" })];

  it("devuelve solo las citas de ese box, ya sin el campo boxId (Firestore reemplaza el documento entero: el campo se va)", () => {
    const sueltas = citasSinBox(citas, "box1");
    expect(sueltas.map((c) => c.id)).toEqual(["a", "d"]);
    expect(sueltas.every((c) => !("boxId" in c))).toBe(true);
  });

  it("no toca las demás citas ni las originales", () => {
    citasSinBox(citas, "box1");
    expect(citas.find((c) => c.id === "a")?.boxId).toBe("box1");
    expect(citasSinBox(citas, "box9")).toEqual([]);
  });
});

describe("citasDelBox", () => {
  it("cuenta las citas que tienen ese box, de cualquier día", () => {
    const citas = [cita("a", { boxId: "box1" }), cita("b", { boxId: "box1", start: "2026-11-02T13:00:00.000Z" }), cita("c", { boxId: "box2" })];
    expect(citasDelBox(citas, "box1")).toBe(2);
    expect(citasDelBox(citas, "box3")).toBe(0);
  });
});

describe("diaDeLaCita — el día en que cae una cita", () => {
  it("una cita de la noche es de ese día, no del siguiente (el texto ISO en UTC se corre en Paraguay)", () => {
    expect(diaDeLaCita(new Date(2026, 9, 8, 22, 30).toISOString())).toBe("2026-10-08");
  });

  it("una cita de la reserva online (hora local sin zona) es del día que dice", () => {
    expect(diaDeLaCita("2026-10-08T22:30:00")).toBe("2026-10-08");
    expect(diaDeLaCita("2026-10-08T09:00:00")).toBe("2026-10-08");
  });
});
