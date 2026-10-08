import type { FiscalDoc, Payment, PaymentMethod } from "./types";
import { fechaLocal } from "./tareas";

/* Ingresar un pago (paridad Dentalink): un mismo pago puede abonar a varios planes,
 * repartirse en varios medios (parte en efectivo, parte con tarjeta) y dejar un abono
 * libre a favor del paciente. Acá vive la aritmética; la pantalla solo la muestra.
 *
 * Cada cruce plan × medio se guarda como un `Payment` propio (así Caja, Reportes y la
 * retención por medio siguen funcionando sin cambios) y todos comparten el mismo
 * `receiptNumber`, que es lo que arma el comprobante. */

export interface CargoPago {
  budgetId: string;
  /** Lo que se abona a ese plan en este pago (puede ser menos que su saldo). */
  amount: number;
}

export interface MedioPago {
  method: PaymentMethod;
  amount: number;
  check?: { number: string; bank: string; cashDate: string };
}

export interface LineaPago {
  /** Sin plan = abono libre a favor del paciente. */
  budgetId?: string;
  method: PaymentMethod;
  amount: number;
  check?: { number: string; bank: string; cashDate: string };
}

export interface RepartoPago {
  lineas: LineaPago[];
  totalCargos: number;
  totalMedios: number;
  /** totalMedios − totalCargos. 0 = cuadra. */
  diferencia: number;
  error?: string;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Reparte los medios de pago entre los cargos, en orden: el primer medio cubre primero el
 *  primer plan. El abono libre va al final. Si los medios no suman lo mismo que los cargos
 *  devuelve `error` y ninguna línea: un pago que no cuadra no se guarda. */
export function repartirPago(cargos: readonly CargoPago[], medios: readonly MedioPago[], abonoLibre = 0): RepartoPago {
  const cs = cargos.map((c) => ({ budgetId: c.budgetId as string | undefined, falta: r2(c.amount) })).filter((c) => c.falta > 0);
  const libre = r2(abonoLibre);
  if (libre > 0) cs.push({ budgetId: undefined, falta: libre });
  const ms = medios.map((m) => ({ ...m, queda: r2(m.amount) })).filter((m) => m.queda > 0);

  const totalCargos = r2(cs.reduce((s, c) => s + c.falta, 0));
  const totalMedios = r2(ms.reduce((s, m) => s + m.queda, 0));
  const diferencia = r2(totalMedios - totalCargos);
  const base = { totalCargos, totalMedios, diferencia };

  if (cargos.some((c) => c.amount < 0) || medios.some((m) => m.amount < 0) || abonoLibre < 0) return { ...base, lineas: [], error: "Los montos no pueden ser negativos." };
  if (totalCargos <= 0) return { ...base, lineas: [], error: "Elegí qué se paga o ingresá un abono libre." };
  if (totalMedios <= 0) return { ...base, lineas: [], error: "Ingresá el monto en al menos un medio de pago." };
  if (diferencia !== 0) {
    return { ...base, lineas: [], error: diferencia > 0 ? "Los medios de pago suman más que lo que se abona." : "Los medios de pago no alcanzan a cubrir lo que se abona." };
  }
  const chequeIncompleto = ms.some((m) => m.method === "cheque" && (!m.check?.number.trim() || !m.check?.bank.trim()));
  if (chequeIncompleto) return { ...base, lineas: [], error: "Al cheque le falta el número o el banco." };

  const lineas: LineaPago[] = [];
  let i = 0;
  for (const m of ms) {
    while (m.queda > 0 && i < cs.length) {
      const c = cs[i];
      const monto = r2(Math.min(m.queda, c.falta));
      lineas.push({
        ...(c.budgetId ? { budgetId: c.budgetId } : {}),
        method: m.method,
        amount: monto,
        ...(m.method === "cheque" && m.check ? { check: { number: m.check.number.trim(), bank: m.check.bank.trim(), cashDate: m.check.cashDate } } : {}),
      });
      m.queda = r2(m.queda - monto);
      c.falta = r2(c.falta - monto);
      if (c.falta <= 0) i++;
    }
  }
  return { ...base, lineas };
}

/** Siguiente número correlativo (comprobante o pago) a partir de los ya usados. Ignora los
 *  que no son numéricos y arranca en 1. */
export function siguienteNumero(usados: readonly (string | undefined)[]): string {
  let max = 0;
  for (const u of usados) {
    const n = Number.parseInt(String(u ?? "").replace(/\D/g, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

export interface Comprobante {
  receiptNumber: string;
  date: string;
  patientId: string;
  receivedBy: string;
  /** Cuánto se abonó a cada plan (`budgetId` undefined = abono libre). */
  cargos: { budgetId?: string; amount: number }[];
  /** Cuánto entró por cada medio. */
  medios: { method: PaymentMethod; amount: number; check?: Payment["check"] }[];
  total: number;
}

/** Arma el comprobante juntando los pagos que comparten `receiptNumber`. Los anulados no
 *  cuentan. Devuelve null si ese número no tiene pagos vigentes. */
export function comprobanteDe(receiptNumber: string, payments: readonly Payment[]): Comprobante | null {
  const ps = payments.filter((p) => p.receiptNumber === receiptNumber && !p.voidedAt);
  if (ps.length === 0) return null;
  const cargos: Comprobante["cargos"] = [];
  const medios: Comprobante["medios"] = [];
  for (const p of ps) {
    const c = cargos.find((x) => x.budgetId === p.budgetId);
    if (c) c.amount = r2(c.amount + p.amount); else cargos.push({ ...(p.budgetId ? { budgetId: p.budgetId } : {}), amount: r2(p.amount) });
    // Cada cheque es un medio aparte (tiene su número); el resto se agrupa por medio.
    const m = p.method === "cheque" ? undefined : medios.find((x) => x.method === p.method);
    const mismoCheque = p.method === "cheque" ? medios.find((x) => x.method === "cheque" && x.check?.number === p.check?.number && x.check?.bank === p.check?.bank) : undefined;
    const destino = m ?? mismoCheque;
    if (destino) destino.amount = r2(destino.amount + p.amount);
    else medios.push({ method: p.method, amount: r2(p.amount), ...(p.check ? { check: p.check } : {}) });
  }
  return {
    receiptNumber,
    date: ps[0].date,
    patientId: ps[0].patientId,
    receivedBy: ps[0].receivedBy,
    cargos,
    medios,
    total: r2(ps.reduce((s, p) => s + p.amount, 0)),
  };
}

/** El instante en que queda registrado un pago. Un pago de HOY lleva la hora real del cobro: con el mediodía fijo, antes de las 12:00 el
 *  pago quedaba en el futuro y no entraba en «Movimientos de la caja» ni en el «Total de caja», y en una caja abierta después de las 12:00
 *  quedaba antes de que se abriera y no entraba nunca (el saldo del paciente sí bajaba). Un pago de otro día queda al mediodía de ese día. */
export function fechaDelPago(dia: string, ahora: Date = new Date()): string {
  return dia === fechaLocal(ahora) ? ahora.toISOString() : new Date(`${dia}T12:00:00`).toISOString();
}

/** La devolución ya registrada de un pago, si la hay. Un pago se devuelve una sola vez:
 *  la pantalla esconde el botón y no deja repetirla. */
export function devolucionDelPago(docs: FiscalDoc[], paymentId: string): FiscalDoc | undefined {
  return docs.find((d) => d.kind === "devolucion" && d.paymentId === paymentId);
}
