import { describe, it, expect } from "vitest";
import { budgetRealizado, financialStatus } from "./budgets";
import type { BudgetItem } from "./types";

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
