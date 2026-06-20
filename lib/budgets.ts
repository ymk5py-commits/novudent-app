import type { Budget, BudgetStatus, Payment } from "./types";

/* ===== Presupuestos: totales, saldos y estados ===== */

export const BUDGET_STATUS_INFO: Record<BudgetStatus, { label: string; tone: "muted" | "info" | "warn" | "ok" | "err"; desc: string }> = {
  borrador: { label: "Borrador", tone: "muted", desc: "En preparación — aún no presentado al paciente" },
  presentado: { label: "Presentado", tone: "info", desc: "Entregado al paciente — pendiente de aceptación (tarea de captura)" },
  aceptado: { label: "Aceptado", tone: "ok", desc: "Aprobado por el paciente — tratamiento en curso" },
  completado: { label: "Completado", tone: "ok", desc: "Todos los procedimientos realizados" },
  anulado: { label: "Anulado", tone: "err", desc: "Presupuesto descartado" },
};

export function budgetSubtotal(b: Pick<Budget, "items">): number {
  return b.items.reduce((s, i) => s + i.price, 0);
}

/** Total con descuento (% manual o de convenio) */
export function budgetTotal(b: Pick<Budget, "items" | "discountPct">): number {
  return Math.round(budgetSubtotal(b) * (1 - (b.discountPct ?? 0) / 100));
}

/** Monto de los ítems ya realizados, con el descuento del presupuesto aplicado.
 *  (el "Realizado" del panel financiero del Plan de tratamiento). */
export function budgetRealizado(b: Pick<Budget, "items" | "discountPct">): number {
  const done = b.items.filter((i) => i.status === "realizado").reduce((s, i) => s + i.price, 0);
  return Math.round(done * (1 - (b.discountPct ?? 0) / 100));
}

export function budgetPaid(budgetId: string, payments: Payment[]): number {
  return payments.filter((p) => p.budgetId === budgetId && !p.voidedAt).reduce((s, p) => s + p.amount, 0);
}

export function budgetBalance(b: Budget, payments: Payment[]): number {
  return budgetTotal(b) - budgetPaid(b.id, payments);
}

/** Estado financiero del plan (etiqueta Dentalink): No hay saldo / Deudas / Hay saldo. */
export function financialStatus(b: Budget, payments: Payment[]): { label: string; tone: "ok" | "warn" | "err" | "muted" } {
  const saldo = budgetBalance(b, payments);
  if (saldo <= 0) return { label: "No hay saldo", tone: "muted" };
  if (budgetRealizado(b) > budgetPaid(b.id, payments)) return { label: "Deudas", tone: "err" };
  return { label: "Hay saldo", tone: "ok" };
}

/** Valor de cada cuota pactada */
export function installmentValue(b: Budget): number | null {
  if (!b.installments || b.installments < 2) return null;
  return Math.round(budgetTotal(b) / b.installments);
}

/** Saldo total del paciente: presupuestos aceptados/completados − todos sus pagos */
export function patientBalance(patientId: string, budgets: Budget[], payments: Payment[]): number {
  const owed = budgets
    .filter((b) => b.patientId === patientId && (b.status === "aceptado" || b.status === "completado"))
    .reduce((s, b) => s + budgetTotal(b), 0);
  const paid = payments.filter((p) => p.patientId === patientId && !p.voidedAt).reduce((s, p) => s + p.amount, 0);
  return owed - paid;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  qr: "QR / billetera",
};
