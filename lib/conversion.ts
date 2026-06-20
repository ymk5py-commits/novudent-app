import type { Appointment, Budget } from "./types";

const CONFIRMED = new Set<Appointment["status"]>(["confirmada", "completada"]);
const ACCEPTED = new Set<Budget["status"]>(["aceptado", "completado"]);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export interface Funnel {
  agendadas: number;
  confirmadas: number;
  aceptados: number;
  pctConfirmadas: number;
  pctAceptados: number;
}

/** Embudo de conversión del período: agendadas → confirmadas → presupuestos aceptados. */
export function conversionFunnel(appointments: Appointment[], budgets: Budget[], fromMs: number, toMs: number): Funnel {
  const inRange = (iso: string) => {
    const t = Date.parse(iso);
    return !Number.isNaN(t) && t >= fromMs && t <= toMs;
  };
  const ag = appointments.filter((a) => inRange(a.start));
  const agendadas = ag.length;
  const confirmadas = ag.filter((a) => CONFIRMED.has(a.status)).length;
  const aceptados = budgets.filter((b) => ACCEPTED.has(b.status) && inRange(b.createdAt)).length;
  return {
    agendadas, confirmadas, aceptados,
    pctConfirmadas: pct(confirmadas, agendadas),
    pctAceptados: pct(aceptados, agendadas),
  };
}

export interface TimelinePoint {
  mes: string;
  agendadas: number;
  confirmadas: number;
  aceptados: number;
}

/** Serie mensual (conteos) de los últimos `months` meses, en orden cronológico. */
export function conversionTimeline(appointments: Appointment[], budgets: Budget[], months: number = 12, now: number = Date.now()): TimelinePoint[] {
  const base = new Date(now);
  const out: TimelinePoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    // Comparación por "YYYY-MM" del string ISO → estable ante la zona horaria
    // (una fecha UTC no se corre al mes anterior en husos negativos como UTC-3).
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const sameMonth = (iso: string) => (iso || "").slice(0, 7) === key;
    const ag = appointments.filter((a) => sameMonth(a.start));
    out.push({
      mes: d.toLocaleDateString("es-PY", { month: "short", year: "2-digit" }).replace(".", ""),
      agendadas: ag.length,
      confirmadas: ag.filter((a) => CONFIRMED.has(a.status)).length,
      aceptados: budgets.filter((b) => ACCEPTED.has(b.status) && sameMonth(b.createdAt)).length,
    });
  }
  return out;
}
