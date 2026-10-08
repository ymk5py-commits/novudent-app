import { describe, it, expect } from "vitest";
import { diaDeLaOrden, ordenVencida } from "./laboratorios";
import type { LabOrder } from "./types";

const orden = (extra: Partial<LabOrder> = {}): LabOrder => ({
  id: "lab1", patientId: "p1", lab: "Dental Lab", workType: "Corona", sentAt: "2026-10-01", status: "enviado", createdAt: "2026-10-01T10:00:00.000Z", ...extra,
});

describe("diaDeLaOrden — el día de calendario de una fecha de laboratorio", () => {
  it("una fecha AAAA-MM-DD ya es el día", () => {
    expect(diaDeLaOrden("2026-10-07")).toBe("2026-10-07");
  });

  it("las órdenes viejas guardaron la fecha elegida como medianoche UTC: sigue siendo el mismo día, no el anterior", () => {
    expect(diaDeLaOrden("2026-10-07T00:00:00.000Z")).toBe("2026-10-07");
  });

  it("un instante cualquiera es el día local en que ocurrió", () => {
    expect(diaDeLaOrden(new Date(2026, 9, 7, 22, 30).toISOString())).toBe("2026-10-07");
    expect(diaDeLaOrden(new Date(2026, 9, 7, 1, 5).toISOString())).toBe("2026-10-07");
  });
});

describe("ordenVencida — pasó el día de entrega y todavía no llegó", () => {
  const ahora = new Date(2026, 9, 8, 9, 0, 0); // jueves 8-oct, 09:00

  it("una orden con entrega para hoy no está vencida", () => {
    expect(ordenVencida(orden({ dueAt: "2026-10-08" }), ahora)).toBe(false);
    expect(ordenVencida(orden({ dueAt: "2026-10-08T00:00:00.000Z" }), ahora)).toBe(false);
  });

  it("con entrega de ayer o antes, sí", () => {
    expect(ordenVencida(orden({ dueAt: "2026-10-07" }), ahora)).toBe(true);
    expect(ordenVencida(orden({ dueAt: "2026-10-07T00:00:00.000Z" }), ahora)).toBe(true);
  });

  it("con entrega futura, no", () => {
    expect(ordenVencida(orden({ dueAt: "2026-10-14" }), ahora)).toBe(false);
  });

  it("una orden ya entregada o sin fecha de entrega nunca está vencida", () => {
    expect(ordenVencida(orden({ dueAt: "2026-10-01", status: "entregado" }), ahora)).toBe(false);
    expect(ordenVencida(orden({ dueAt: undefined }), ahora)).toBe(false);
  });
});
