import type { Budget, BudgetStatus, Payment, PaymentMethod, PaymentRetention } from "./types";
import { CURRENCIES, DEFAULT_CURRENCY, type CurrencyCode } from "./currency";

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

export type CheckStatus = "pendiente" | "cobrado" | "anulado";

/** Deriva el estado del cheque — nunca se guarda como campo propio. Guardarlo
 *  aparte permitiría el estado imposible "voidedAt seteado pero status:
 *  pendiente"; derivarlo lo hace irrepresentable. `anulado` gana sobre
 *  `cobrado` a propósito: un cheque que se descubre rebotado DESPUÉS de
 *  marcarlo cobrado tiene que poder anularse igual. */
export function checkStatus(p: Payment): CheckStatus {
  if (p.voidedAt) return "anulado";
  if (p.check?.cobradoAt) return "cobrado";
  return "pendiente";
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  cheque: "Cheque",
  qr: "QR / billetera",
};

/** % de retención vigente para un medio. Sanea basura: un valor negativo, no
 *  numérico o mayor a 100 no puede producir un neto negativo ni inflar el
 *  ingreso — se acota a [0, 100]. */
export function retentionPct(method: PaymentMethod, cfg: PaymentRetention | undefined): number {
  const v = cfg?.[method];
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

/** Monto que efectivamente entra a la clínica después de la retención del
 *  medio, redondeado a los decimales REALES de la moneda de la clínica.
 *
 *  ⚠️ `budgetTotal` (más arriba en este archivo) redondea siempre a entero —
 *  está bien ahí porque nació pensando en PYG. Copiarle ese `Math.round` acá
 *  sería un bug real: de las 17 monedas de `lib/currency.ts` solo
 *  PYG/CLP/COP/CRC son zero-decimal, las otras 13 (USD, ARS, BRL, MXN…)
 *  tienen 2 decimales. Un pago de USD 50 con 5% de retención tiene que dar
 *  47.50, no redondearse a 48. */
export function netAmount(
  p: Pick<Payment, "amount" | "method">,
  cfg: PaymentRetention | undefined,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): number {
  const factor = 10 ** CURRENCIES[currency].decimals;
  return Math.round(p.amount * (1 - retentionPct(p.method, cfg) / 100) * factor) / factor;
}
