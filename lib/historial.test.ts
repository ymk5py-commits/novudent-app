import { describe, it, expect } from "vitest";
import { buildHistorial } from "./historial";

describe("buildHistorial", () => {
  it("combina las 5 fuentes y ordena descendente por fecha", () => {
    const r = buildHistorial({
      appointments: [{ id: "a1", start: "2026-03-01T10:00:00Z", title: "Control", status: "confirmada" } as any],
      ortho: { controls: [{ date: "2026-04-01T10:00:00Z", note: "Activación", by: "Dra" }] } as any,
      budgets: [{ id: "b1", items: [{ id: "i1", description: "Resina", status: "realizado", doneAt: "2026-05-01T10:00:00Z", doneBy: "Dra" }] } as any],
      payments: [{ id: "p1", date: "2026-02-01T10:00:00Z", concept: "Abono", amount: 1000, receivedBy: "Caja" } as any],
      emr: [{ id: "n1", createdAt: "2026-06-01T10:00:00Z", kind: "nota", text: "Nota", authorName: "Dra" } as any],
    });
    expect(r).toHaveLength(5);
    expect(r[0].kind).toBe("nota");           // 2026-06 = más reciente
    expect(r[r.length - 1].kind).toBe("pago"); // 2026-02 = más viejo
    expect(r.map((e) => e.kind)).toEqual(expect.arrayContaining(["cita", "evolucion", "prestacion"]));
  });

  it("tolera fuentes vacías", () => {
    expect(buildHistorial({ appointments: [], budgets: [], payments: [], emr: [] })).toEqual([]);
  });

  it("ignora prestaciones realizadas sin doneAt", () => {
    const r = buildHistorial({
      appointments: [], payments: [], emr: [],
      budgets: [{ id: "b", items: [{ id: "i", description: "x", status: "realizado" }] } as any],
    });
    expect(r).toHaveLength(0);
  });
});
