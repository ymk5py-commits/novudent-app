import { describe, it, expect } from "vitest";
import { porMedio, totalesSesion } from "./caja";
import type { CashSession, Expense, Payment } from "./types";

const s: CashSession = { id: "cs1", clinicId: "c", userId: "u1", userName: "Ana", openedAt: "2026-10-04T08:00:00.000Z", openingBalance: 100_000, status: "abierta" };
const pago = (id: string, amount: number, method: Payment["method"], date = "2026-10-04T10:00:00.000Z", extra: Partial<Payment> = {}): Payment =>
  ({ id, clinicId: "c", patientId: "p1", date, amount, method, concept: "x", receivedBy: "Ana", ...extra });
const gasto = (id: string, amount: number, extra: Partial<Expense> = {}): Expense =>
  ({ id, clinicId: "c", date: "2026-10-04T11:00:00.000Z", category: "Insumos", description: "x", amount, registeredBy: "Ana", ...extra });

const pagos = [
  pago("1", 50_000, "efectivo"),
  pago("2", 30_000, "efectivo"),
  pago("3", 200_000, "tarjeta"),
  pago("4", 999_999, "efectivo", "2026-10-04T10:30:00.000Z", { voidedAt: "2026-10-04T10:31:00.000Z" }),
  pago("5", 70_000, "qr", "2026-10-03T18:00:00.000Z"), // antes de abrir
];
const gastos = [gasto("g1", 20_000), gasto("g2", 5_000, { cashSessionId: "cs1", date: "2026-10-01T09:00:00.000Z" }), gasto("g3", 1_000, { cashSessionId: "otra" })];

describe("totalesSesion", () => {
  const t = totalesSesion(s, pagos, gastos, "2026-10-04T20:00:00.000Z");
  it("cuenta solo los pagos vigentes dentro de la sesión", () => {
    expect(t.pays.map((p) => p.id)).toEqual(["1", "2", "3"]);
    expect(t.ingresos).toBe(280_000);
  });
  it("los gastos imputados a la sesión cuentan aunque su fecha caiga afuera; los de otra caja no", () => {
    expect(t.exps.map((e) => e.id).sort()).toEqual(["g1", "g2"]);
    expect(t.egresos).toBe(25_000);
  });
  it("acumulado y efectivo esperado en el cajón", () => {
    expect(t.acumulado).toBe(100_000 + 280_000 - 25_000);
    expect(t.expectedCash).toBe(100_000 + 80_000 - 25_000);
  });
});

describe("porMedio", () => {
  it("agrupa por medio con cantidad, en el orden del selector y sin medios vacíos", () => {
    expect(porMedio(totalesSesion(s, pagos, gastos, "2026-10-04T20:00:00.000Z").pays)).toEqual([
      { method: "efectivo", cantidad: 2, total: 80_000 },
      { method: "tarjeta", cantidad: 1, total: 200_000 },
    ]);
    expect(porMedio([])).toEqual([]);
  });
});
