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

import { mapaDeSaldos } from "./tareas";
import { patientBalance } from "./budgets";
import type { Budget, Payment } from "./types";

const bud = (id: string, patientId: string, status: Budget["status"], monto: number, createdAt = "2026-01-10T10:00:00.000Z"): Budget => ({
  id, clinicId: "c1", patientId, dentistId: "u1", createdAt, status,
  items: [{ id: `${id}i`, code: "D001", name: "Prestación", qty: 1, price: monto }],
  // Fixture parcial (falta `history`) — mismo patrón que budgets.test.ts (`as any`,
  // no `as Budget`): el cast a la interfaz completa rompe tsc porque faltan campos
  // que no le importan a mapaDeSaldos/patientBalance (solo leen status/items/patientId).
} as any);

const pay = (id: string, patientId: string, amount: number, voided = false): Payment => ({
  id, clinicId: "c1", patientId, date: "2026-02-01T10:00:00.000Z", amount,
  method: "efectivo", concept: "Abono", receivedBy: "u1",
  ...(voided ? { voidedAt: "2026-02-02T10:00:00.000Z" } : {}),
} as Payment);

describe("mapaDeSaldos", () => {
  it("suma aceptados y completados, resta pagos no anulados", () => {
    const budgets = [bud("b1", "p1", "aceptado", 500_000), bud("b2", "p1", "completado", 300_000)];
    const payments = [pay("y1", "p1", 200_000)];
    expect(mapaDeSaldos(budgets, payments).get("p1")).toBe(600_000);
  });

  it("ignora borrador, presentado y anulado", () => {
    const budgets = [bud("b1", "p1", "borrador", 100_000), bud("b2", "p1", "presentado", 100_000), bud("b3", "p1", "anulado", 100_000)];
    expect(mapaDeSaldos(budgets, []).get("p1") ?? 0).toBe(0);
  });

  it("ignora los pagos anulados", () => {
    const budgets = [bud("b1", "p1", "aceptado", 500_000)];
    const payments = [pay("y1", "p1", 500_000, true)];
    expect(mapaDeSaldos(budgets, payments).get("p1")).toBe(500_000);
  });

  it("no mezcla pacientes", () => {
    const budgets = [bud("b1", "p1", "aceptado", 500_000), bud("b2", "p2", "aceptado", 100_000)];
    const payments = [pay("y1", "p2", 100_000)];
    const m = mapaDeSaldos(budgets, payments);
    expect(m.get("p1")).toBe(500_000);
    expect(m.get("p2")).toBe(0);
  });

  // EL test que importa: si alguien cambia la regla de saldo en lib/budgets.ts
  // y no acá, la bandeja y la ficha del paciente empiezan a mentir distinto.
  it("coincide con patientBalance para cada paciente (equivalencia)", () => {
    const budgets = [
      bud("b1", "p1", "aceptado", 500_000), bud("b2", "p1", "completado", 300_000),
      bud("b3", "p2", "presentado", 900_000), bud("b4", "p2", "aceptado", 250_000),
      bud("b5", "p3", "anulado", 100_000),
    ];
    const payments = [pay("y1", "p1", 200_000), pay("y2", "p2", 250_000), pay("y3", "p1", 50_000, true)];
    const mapa = mapaDeSaldos(budgets, payments);
    for (const pid of ["p1", "p2", "p3"]) {
      expect(mapa.get(pid) ?? 0).toBe(patientBalance(pid, budgets, payments));
    }
  });
});
