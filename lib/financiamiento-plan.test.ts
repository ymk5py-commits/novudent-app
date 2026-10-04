import { describe, it, expect } from "vitest";
import { aplicarFinanciamiento, cuotasDe, quitarFinanciamiento, saldoAFinanciar, simularFinanciamiento } from "./financiamiento";
import { budgetBalance, budgetDescuento, budgetTotal, installmentValue } from "./budgets";
import type { Budget, Payment } from "./types";

const plan: Budget = {
  id: "g1", clinicId: "c", patientId: "p1", dentistId: "u2", createdAt: "2026-09-01T10:00:00.000Z", status: "aceptado",
  discountPct: 10,
  items: [
    { id: "a", cpt: "D1", description: "Corona", price: 1_000_000, status: "realizado" },
    { id: "b", cpt: "D2", description: "Limpieza", price: 200_000, status: "pendiente" },
  ],
  history: [],
};
const pago = (id: string, amount: number, extra: Partial<Payment> = {}): Payment => ({
  id, clinicId: "c", patientId: "p1", budgetId: "g1", date: "2026-09-10T12:00:00.000Z", amount, method: "efectivo", concept: "x", receivedBy: "Ana", ...extra,
});
const ctx = (payments: Payment[]) => ({ payments, now: "2026-10-04T12:00:00.000Z", by: "Ana", fmt: (n: number) => `Gs ${n}` });
const inp = { cuotas: 4, interesMensualPct: 2, periodicidad: "mensual" as const };

describe("budgetTotal con interés", () => {
  it("el interés se suma sin descuento y el descuento sigue saliendo igual", () => {
    expect(budgetTotal(plan)).toBe(1_080_000);
    const conInteres = { ...plan, financiamiento: { interes: 50_000 } as Budget["financiamiento"] };
    expect(budgetTotal(conInteres)).toBe(1_130_000);
    expect(budgetDescuento(conInteres)).toBe(120_000);
  });
});

describe("aplicarFinanciamiento", () => {
  const pagos = [pago("p1", 80_000)];
  const porFinanciar = saldoAFinanciar(plan, pagos); // 1.080.000 − 80.000
  const sim = simularFinanciamiento({ porFinanciar, pie: 100_000, ...inp, primeraCuota: "2026-11-05", hoy: "2026-10-04" });
  const fin = aplicarFinanciamiento(plan, sim, inp, ctx(pagos));

  it("las cuotas (con el pie) suman exactamente el saldo nuevo del plan", () => {
    expect(porFinanciar).toBe(1_000_000);
    expect(fin.schedule!.reduce((s, c) => s + c.amount, 0)).toBe(budgetBalance(fin, pagos));
    expect(budgetTotal(fin)).toBe(1_080_000 + sim.interes);
  });

  it("lo pagado antes no se imputa a ninguna cuota", () => {
    expect(fin.financiamiento!.pagadoAntes).toBe(80_000);
    expect(cuotasDe(fin, pagos).every((c) => c.pagado === 0)).toBe(true);
    const conPie = [...pagos, pago("p2", 100_000)];
    const cs = cuotasDe(fin, conPie);
    expect(cs[0]).toMatchObject({ numero: 0, pagado: 100_000, saldo: 0 });
    expect(cs[1].pagado).toBe(0);
  });

  it("deja rastro en el historial y el valor de cuota para la impresión", () => {
    expect(fin.history.at(-1)!.action).toMatch(/^Financiamiento generado: pie Gs 100000, 4 cuotas mensuales de Gs \d+, interés 2% mensual/);
    expect(installmentValue(fin)).toBe(sim.valorCuota);
    expect(fin.installments).toBe(4);
  });

  it("refinanciar no cobra interés sobre interés", () => {
    expect(saldoAFinanciar(fin, pagos)).toBe(1_000_000);
    const sim2 = simularFinanciamiento({ porFinanciar: saldoAFinanciar(fin, pagos), pie: 0, ...inp, interesMensualPct: 0, primeraCuota: "2026-11-05", hoy: "2026-10-04" });
    const re = aplicarFinanciamiento(fin, sim2, { ...inp, interesMensualPct: 0 }, ctx(pagos));
    expect(budgetTotal(re)).toBe(1_080_000);
    expect(re.history.at(-1)!.action).toMatch(/^Financiamiento reemplazado/);
  });

  it("quitar el financiamiento vuelve al total sin interés y sin cuotas", () => {
    const sin = quitarFinanciamiento(fin, { now: "2026-10-05T12:00:00.000Z", by: "Ana" });
    expect(sin.schedule).toBeUndefined();
    expect(sin.financiamiento).toBeUndefined();
    expect(budgetTotal(sin)).toBe(1_080_000);
    expect(sin.history.at(-1)!.action).toBe("Financiamiento quitado");
    expect(Object.prototype.hasOwnProperty.call(sin, "schedule")).toBe(false);
  });
});
