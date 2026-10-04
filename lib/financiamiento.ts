import type { Budget, FinanciamientoPlan, Installment, Payment, PeriodicidadCuotas } from "./types";
import { budgetPaid, budgetTotal } from "./budgets";

export interface InstallmentStatus {
  numero: number;
  dueDate: string;
  amount: number;
  pagado: number;
  saldo: number;
}

/** Estado de cada cuota: aloca el total pagado del plan en cascada (cuota 1, 2, …).
 *  Puro; el excedente no genera saldo negativo. */
export function installmentStatus(schedule: Installment[], totalPaid: number): InstallmentStatus[] {
  let rem = Math.max(0, totalPaid);
  return schedule.map((c) => {
    const pagado = Math.min(rem, c.amount);
    rem -= pagado;
    return { numero: c.numero, dueDate: c.dueDate, amount: c.amount, pagado, saldo: c.amount - pagado };
  });
}

/* ===== Simulación de financiamiento por crédito (paridad Dentalink) =====
 * Opciones del plan › Financiamiento: pie, cuotas, interés mensual, fecha de la primera
 * cuota y periodicidad. «Simular» muestra el plan de cuotas; «Generar» lo guarda. */

export type Periodicidad = PeriodicidadCuotas;

export const PERIODICIDAD_LABEL: Record<Periodicidad, string> = { mensual: "Mensuales", quincenal: "Quincenales", semanal: "Semanales" };

export interface FinanciamientoInput {
  /** Saldo del plan que se va a financiar. */
  porFinanciar: number;
  /** Pago inicial. Entra como «cuota 0» con vencimiento hoy. */
  pie: number;
  cuotas: number;
  /** Interés simple mensual sobre el monto financiado, en % (0 = sin interés). */
  interesMensualPct: number;
  /** YYYY-MM-DD */
  primeraCuota: string;
  periodicidad: Periodicidad;
  /** YYYY-MM-DD — vencimiento del pie. */
  hoy: string;
}

export interface Simulacion {
  schedule: Installment[];
  pie: number;
  montoFinanciado: number;
  interes: number;
  /** montoFinanciado + interes: lo que suman las cuotas (sin el pie). */
  totalCuotas: number;
  valorCuota: number;
  error?: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MESES_POR_PERIODO: Record<Periodicidad, number> = { mensual: 1, quincenal: 0.5, semanal: 7 / 30 };

/** Vencimiento de la cuota `i` (0 = la primera). Mensual conserva el día y lo recorta al
 *  último del mes (31-ene → 28-feb); quincenal y semanal suman días. */
export function vencimientoCuota(primera: string, i: number, periodicidad: Periodicidad): string {
  const [y, m, d] = primera.split("-").map(Number);
  if (periodicidad === "mensual") {
    const ultimo = new Date(Date.UTC(y, m - 1 + i + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m - 1 + i, Math.min(d, ultimo))).toISOString().slice(0, 10);
  }
  const dias = (periodicidad === "quincenal" ? 15 : 7) * i;
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Arma el plan de cuotas. Montos enteros (como el resto de los presupuestos); la última
 *  cuota absorbe el redondeo, así las cuotas suman exactamente lo financiado más el interés. */
export function simularFinanciamiento(inp: FinanciamientoInput): Simulacion {
  const porFinanciar = Math.round(Number(inp.porFinanciar) || 0);
  const pie = Math.round(Number(inp.pie) || 0);
  const cuotas = Math.trunc(Number(inp.cuotas) || 0);
  const pct = Number(inp.interesMensualPct) || 0;
  const vacio = { schedule: [], pie, montoFinanciado: 0, interes: 0, totalCuotas: 0, valorCuota: 0 };

  if (porFinanciar <= 0) return { ...vacio, error: "El plan no tiene saldo para financiar." };
  if (pie < 0 || pie >= porFinanciar) return { ...vacio, error: "El pie tiene que ser menor que el monto a financiar." };
  if (cuotas < 1 || cuotas > 60) return { ...vacio, error: "Las cuotas van de 1 a 60." };
  if (pct < 0 || pct > 20) return { ...vacio, error: "El interés mensual va de 0 a 20%." };
  if (!FECHA.test(inp.primeraCuota) || !FECHA.test(inp.hoy)) return { ...vacio, error: "Falta la fecha de la primera cuota." };

  const montoFinanciado = porFinanciar - pie;
  const interes = Math.round(montoFinanciado * (pct / 100) * cuotas * MESES_POR_PERIODO[inp.periodicidad]);
  const totalCuotas = montoFinanciado + interes;
  const valorCuota = Math.floor(totalCuotas / cuotas);

  const schedule: Installment[] = [];
  if (pie > 0) schedule.push({ numero: 0, dueDate: inp.hoy, amount: pie });
  for (let i = 0; i < cuotas; i++) {
    const ultima = i === cuotas - 1;
    schedule.push({ numero: i + 1, dueDate: vencimientoCuota(inp.primeraCuota, i, inp.periodicidad), amount: ultima ? totalCuotas - valorCuota * (cuotas - 1) : valorCuota });
  }
  return { schedule, pie, montoFinanciado, interes, totalCuotas, valorCuota };
}

/* ===== Financiamiento aplicado al plan ===== */

/** Estado de las cuotas de un plan. Lo que el paciente pagó antes de generar las cuotas no
 *  se imputa a ninguna (`financiamiento.pagadoAntes`); el resto cae en cascada. */
export function cuotasDe(b: Pick<Budget, "id" | "schedule" | "financiamiento">, payments: Payment[]): InstallmentStatus[] {
  const pagado = budgetPaid(b.id, payments) - (b.financiamiento?.pagadoAntes ?? 0);
  return installmentStatus(b.schedule ?? [], pagado);
}

/** Saldo que se puede financiar: el total del plan SIN el interés de un financiamiento
 *  anterior, menos lo ya pagado. Así refinanciar no cobra interés sobre interés. */
export function saldoAFinanciar(b: Budget, payments: Payment[]): number {
  const sinInteres = budgetTotal({ ...b, financiamiento: undefined });
  return Math.max(0, sinInteres - budgetPaid(b.id, payments));
}

/** Devuelve el plan con el financiamiento aplicado: cuotas, condiciones e interés (que pasa a
 *  sumar en el total) y una línea en el historial. Reemplaza un financiamiento anterior. */
export function aplicarFinanciamiento(
  b: Budget,
  sim: Simulacion,
  inp: Pick<FinanciamientoInput, "cuotas" | "interesMensualPct" | "periodicidad">,
  ctx: { payments: Payment[]; now: string; by: string; fmt: (n: number) => string },
): Budget {
  const financiamiento: FinanciamientoPlan = {
    pie: sim.pie,
    cuotas: inp.cuotas,
    interesMensualPct: inp.interesMensualPct,
    interes: sim.interes,
    montoFinanciado: sim.montoFinanciado,
    periodicidad: inp.periodicidad,
    pagadoAntes: budgetPaid(b.id, ctx.payments),
    generadoAt: ctx.now,
    generadoBy: ctx.by,
  };
  const partes = [
    sim.pie > 0 ? `pie ${ctx.fmt(sim.pie)}` : null,
    `${inp.cuotas} cuota${inp.cuotas === 1 ? "" : "s"} ${PERIODICIDAD_LABEL[inp.periodicidad].toLowerCase()} de ${ctx.fmt(sim.valorCuota)}`,
    sim.interes > 0 ? `interés ${inp.interesMensualPct}% mensual (${ctx.fmt(sim.interes)})` : "sin interés",
  ].filter(Boolean);
  return {
    ...b,
    schedule: sim.schedule,
    installments: inp.cuotas,
    financiamiento,
    history: [...b.history, { at: ctx.now, action: `${b.financiamiento ? "Financiamiento reemplazado" : "Financiamiento generado"}: ${partes.join(", ")}`, by: ctx.by }],
  };
}

/** Quita el financiamiento: sin cuotas ni interés. Los pagos hechos siguen en el plan. */
export function quitarFinanciamiento(b: Budget, ctx: { now: string; by: string }): Budget {
  const { financiamiento: _f, schedule: _s, installments: _i, ...resto } = b;
  return { ...resto, history: [...b.history, { at: ctx.now, action: "Financiamiento quitado", by: ctx.by }] };
}
