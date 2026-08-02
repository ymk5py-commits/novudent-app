import { describe, it, expect } from "vitest";
import { budgetRealizado, financialStatus, checkStatus } from "./budgets";
import type { BudgetItem, Payment } from "./types";

const item = (price: number, status: "pendiente" | "realizado"): BudgetItem => ({
  id: "x", cpt: "D0000", description: "x", price, status,
});

describe("budgetRealizado", () => {
  it("suma solo los ítems realizados", () => {
    expect(budgetRealizado({ items: [item(1000, "realizado"), item(500, "pendiente")] })).toBe(1000);
  });
  it("aplica el descuento del presupuesto", () => {
    expect(budgetRealizado({ items: [item(1000, "realizado")], discountPct: 10 })).toBe(900);
  });
  it("es 0 sin ítems realizados o sin ítems", () => {
    expect(budgetRealizado({ items: [item(500, "pendiente")] })).toBe(0);
    expect(budgetRealizado({ items: [] })).toBe(0);
  });
});

describe("financialStatus", () => {
  it("'No hay saldo' cuando está saldado", () => {
    expect(financialStatus({ id: "b", items: [item(1000, "realizado")] } as any, [{ budgetId: "b", amount: 1000 } as any]).label).toBe("No hay saldo");
  });
  it("'Deudas' cuando debe por trabajo realizado", () => {
    expect(financialStatus({ id: "b", items: [item(1000, "realizado")] } as any, []).label).toBe("Deudas");
  });
  it("'Hay saldo' cuando hay saldo pero nada realizado aún", () => {
    expect(financialStatus({ id: "b", items: [item(1000, "pendiente")] } as any, []).label).toBe("Hay saldo");
  });
});

const chequePago = (extra: Partial<Payment> = {}): Payment => ({
  id: "y1", clinicId: "c1", patientId: "p1", date: "2026-07-20T10:00:00.000Z",
  amount: 375_000, method: "cheque", concept: "Cheque", receivedBy: "u1",
  check: { number: "001", bank: "Banco Test", cashDate: "2026-08-05" },
  ...extra,
});

describe("checkStatus", () => {
  it("sin voidedAt ni cobradoAt → pendiente", () => {
    expect(checkStatus(chequePago())).toBe("pendiente");
  });

  it("con cobradoAt seteado → cobrado", () => {
    expect(checkStatus(chequePago({ check: { number: "001", bank: "Banco Test", cashDate: "2026-08-05", cobradoAt: "2026-07-31T10:00:00.000Z" } }))).toBe("cobrado");
  });

  it("con voidedAt seteado → anulado", () => {
    expect(checkStatus(chequePago({ voidedAt: "2026-07-31T10:00:00.000Z" }))).toBe("anulado");
  });

  it("anulado gana aunque también esté cobradoAt — no hay estado imposible", () => {
    const p = chequePago({
      voidedAt: "2026-08-01T10:00:00.000Z",
      check: { number: "001", bank: "Banco Test", cashDate: "2026-08-05", cobradoAt: "2026-07-31T10:00:00.000Z" },
    });
    expect(checkStatus(p)).toBe("anulado");
  });

  it("un pago que no es cheque también resuelve (sin check, sin voidedAt) → pendiente", () => {
    expect(checkStatus({ id: "y2", clinicId: "c1", patientId: "p1", date: "2026-07-20T10:00:00.000Z", amount: 100_000, method: "efectivo", concept: "Abono", receivedBy: "u1" })).toBe("pendiente");
  });
});
