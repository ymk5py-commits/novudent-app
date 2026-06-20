import type { OrthoRecord } from "./types";

/** Mes promedio en ms (365.25 / 12 días). */
const MS_PER_MONTH = 30.4375 * 86_400_000;

export interface OrthoProgress {
  /** Meses completos transcurridos desde el inicio. */
  monthsElapsed: number;
  /** Duración estimada total (meses). */
  totalMonths: number;
  /** % de avance por calendario (0–100). */
  calendarPct: number;
  /** % de avance clínico real, cargado por el profesional (0–100). */
  realPct: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Progreso del tratamiento de ortodoncia. Puro y tolerante a datos faltantes/basura
 *  (nunca devuelve NaN ni rompe ante un `ortho` incompleto). */
export function orthoProgress(
  ortho: Pick<OrthoRecord, "startDate" | "totalMonths" | "progressReal"> | null | undefined,
  now: number = Date.now(),
): OrthoProgress {
  const totalMonths = Math.max(0, Math.round(Number(ortho?.totalMonths) || 0));

  let monthsElapsed = 0;
  const startMs = ortho?.startDate ? Date.parse(ortho.startDate) : NaN;
  if (!Number.isNaN(startMs)) {
    monthsElapsed = Math.max(0, Math.floor((now - startMs) / MS_PER_MONTH));
  }

  const calendarPct = totalMonths > 0 ? clamp(Math.round((monthsElapsed / totalMonths) * 100), 0, 100) : 0;
  const realPct = clamp(Math.round(Number(ortho?.progressReal) || 0), 0, 100);

  return { monthsElapsed, totalMonths, calendarPct, realPct };
}
