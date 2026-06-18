import type { RadiographFinding, RxSeverity } from "./types";

const SEVERITIES: RxSeverity[] = ["observacion", "leve", "moderado", "severo"];
const MAX_FINDINGS = 40;

/** Caja normalizada 0..1 saneada, o null si es inválida. Recorta al borde. Puro. */
export function clampBox(box: any): { x: number; y: number; w: number; h: number } | null {
  if (!box || typeof box !== "object") return null;
  let x = Number(box.x), y = Number(box.y), w = Number(box.w), h = Number(box.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
  x = Math.min(Math.max(x, 0), 1);
  y = Math.min(Math.max(y, 0), 1);
  w = Math.min(Math.max(w, 0), 1);
  h = Math.min(Math.max(h, 0), 1);
  if (w <= 0 || h <= 0) return null;
  if (x + w > 1) w = 1 - x;
  if (y + h > 1) h = 1 - y;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/** Severidad válida o 'observacion'. Puro. */
export function normalizeSeverity(s: any): RxSeverity {
  const v = String(s ?? "").toLowerCase().trim();
  return (SEVERITIES as string[]).includes(v) ? (v as RxSeverity) : "observacion";
}

export interface RadiografiaAIResult {
  findings: RadiographFinding[];
  summary: string;
  patientExplanation: string;
}

/** Sanea la respuesta cruda de la IA. Nunca explota ni mete basura en la ficha. Puro. */
export function validateRadiografiaAI(raw: any): RadiografiaAIResult {
  const out: RadiografiaAIResult = { findings: [], summary: "", patientExplanation: "" };
  if (!raw || typeof raw !== "object") return out;
  out.summary = String(raw.summary ?? "").slice(0, 4000);
  out.patientExplanation = String(raw.patientExplanation ?? "").slice(0, 4000);
  const arr = Array.isArray(raw.findings) ? raw.findings : [];
  let i = 0;
  for (const f of arr) {
    if (out.findings.length >= MAX_FINDINGS) break;
    if (!f || typeof f !== "object") continue;
    const box = clampBox(f.box);
    if (!box) continue;
    const label = String(f.label ?? "").trim().slice(0, 120);
    if (!label) continue;
    const tooth = f.tooth != null ? String(f.tooth).trim().slice(0, 4) : "";
    out.findings.push({
      id: `ia-${i++}`,
      box,
      label,
      severity: normalizeSeverity(f.severity),
      source: "ia",
      ...(tooth ? { tooth } : {}),
    });
  }
  return out;
}
