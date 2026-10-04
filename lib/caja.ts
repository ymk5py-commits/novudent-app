import type { CashSession, Expense, Payment, PaymentMethod } from "./types";

/* Caja: totales de una sesión y su desglose por medio de pago (paridad Dentalink
 * «Total caja #N»: lo cobrado por medio con su cantidad, el saldo inicial, los gastos y
 * las transacciones). Puro: la pantalla y la impresión solo muestran esto. */

/** Orden en que se listan los medios (el del selector de pago). */
export const ORDEN_MEDIOS: PaymentMethod[] = ["efectivo", "tarjeta", "transferencia", "cheque", "qr"];

export interface TotalesSesion {
  pays: Payment[];
  exps: Expense[];
  ingresos: number;
  egresos: number;
  efectivo: number;
  /** saldo inicial + ingresos − egresos */
  acumulado: number;
  /** El efectivo que tiene que haber en el cajón: saldo inicial + cobrado en efectivo − gastos. */
  expectedCash: number;
}

/** Movimientos de la sesión: pagos no anulados y gastos dentro de [apertura, cierre o ahora].
 *  Un gasto imputado a la sesión cuenta aunque su fecha caiga afuera. */
export function totalesSesion(s: CashSession, payments: Payment[], expenses: Expense[], ahora: string = new Date().toISOString()): TotalesSesion {
  const from = s.openedAt;
  const to = s.closedAt ?? ahora;
  const pays = payments.filter((p) => !p.voidedAt && p.date >= from && p.date <= to);
  const exps = expenses.filter((e) => e.cashSessionId === s.id || (!e.cashSessionId && e.date >= from && e.date <= to));
  const ingresos = pays.reduce((a, p) => a + p.amount, 0);
  const egresos = exps.reduce((a, e) => a + e.amount, 0);
  const efectivo = pays.filter((p) => p.method === "efectivo").reduce((a, p) => a + p.amount, 0);
  return { pays, exps, ingresos, egresos, efectivo, acumulado: s.openingBalance + ingresos - egresos, expectedCash: s.openingBalance + efectivo - egresos };
}

/** Lo cobrado por medio de pago, con cuántos pagos fueron. Solo los medios que se usaron. */
export function porMedio(pays: Payment[]): { method: PaymentMethod; cantidad: number; total: number }[] {
  return ORDEN_MEDIOS
    .map((method) => {
      const ps = pays.filter((p) => p.method === method);
      return { method, cantidad: ps.length, total: ps.reduce((a, p) => a + p.amount, 0) };
    })
    .filter((m) => m.cantidad > 0);
}
