import type { Procedure, ProcedureCategory } from "./types";

export const CATEGORY_LABEL: Record<ProcedureCategory, string> = {
  diagnostico: "Diagnóstico",
  prevencion: "Prevención e higiene",
  operatoria: "Operatoria",
  endodoncia: "Endodoncia",
  periodoncia: "Periodoncia",
  protesis: "Prótesis",
  cirugia: "Cirugía",
  ortodoncia: "Ortodoncia",
  estetica: "Estética",
  general: "General",
};

export const GENDER_LABEL: Record<string, string> = { F: "Femenino", M: "Masculino", otro: "Otro" };

/** Mapeo por prefijo de código ADA (fallback cuando el ítem no está en el catálogo). */
const ADA_RANGE: Record<string, ProcedureCategory> = {
  D0: "diagnostico", D1: "prevencion", D2: "operatoria", D3: "endodoncia",
  D4: "periodoncia", D5: "protesis", D6: "protesis", D7: "cirugia", D8: "ortodoncia", D9: "general",
};

/** Rango etario para los donuts demográficos. Tolerante a fechas faltantes/inválidas. */
export function ageBucket(birthDate: string | undefined, now: number = Date.now()): string {
  if (!birthDate) return "Sin dato";
  const ms = Date.parse(birthDate);
  if (Number.isNaN(ms)) return "Sin dato";
  const age = Math.floor((now - ms) / (365.25 * 86_400_000));
  if (age < 14) return "<14";
  if (age <= 20) return "15-20";
  if (age <= 35) return "21-35";
  if (age <= 50) return "36-50";
  if (age <= 65) return "51-65";
  return ">65";
}

/** Categoría de una prestación: del catálogo si está, si no por rango ADA. Nunca rompe. */
export function procedureCategory(cpt: string, procedures: Procedure[]): ProcedureCategory {
  const found = procedures.find((p) => p.cpt === cpt);
  if (found?.category) return found.category;
  return ADA_RANGE[(cpt || "").slice(0, 2).toUpperCase()] ?? "general";
}
