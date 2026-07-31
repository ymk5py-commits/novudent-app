import { describe, it, expect } from "vitest";
import { calcularVencimiento, plazoDe, DEFAULT_DEADLINES } from "./tareas";

describe("calcularVencimiento", () => {
  it("inmediato vence el mismo día del evento", () => {
    expect(calcularVencimiento("2026-07-30T14:30:00.000Z", { kind: "inmediato" })).toBe("2026-07-30");
  });

  it("suma los días del plazo", () => {
    expect(calcularVencimiento("2026-07-30T14:30:00.000Z", { kind: "dias", n: 7 })).toBe("2026-08-06");
  });

  it("cruza el fin de mes sin romperse", () => {
    expect(calcularVencimiento("2026-01-28T00:00:00.000Z", { kind: "dias", n: 5 })).toBe("2026-02-02");
  });

  it("devuelve YYYY-MM-DD, no un ISO completo", () => {
    expect(calcularVencimiento("2026-07-30T23:59:59.000Z", { kind: "dias", n: 1 })).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("plazoDe — configuración de la clínica vs defaults", () => {
  it("sin configuración usa el default del tipo", () => {
    expect(plazoDe("cobranza", undefined)).toEqual(DEFAULT_DEADLINES.cobranza);
    expect(plazoDe("captura", {})).toEqual(DEFAULT_DEADLINES.captura);
  });

  it("la configuración de la clínica pisa al default", () => {
    expect(plazoDe("cobranza", { cobranza: { kind: "dias", n: 30 } })).toEqual({ kind: "dias", n: 30 });
  });

  it("configurar un tipo no afecta a los otros", () => {
    const cfg = { cobranza: { kind: "dias", n: 30 } } as const;
    expect(plazoDe("captura", cfg)).toEqual(DEFAULT_DEADLINES.captura);
  });

  it("los defaults son los cuatro tipos automáticos", () => {
    expect(Object.keys(DEFAULT_DEADLINES).sort()).toEqual(["captura", "cita", "cobranza", "control"]);
  });
});
