/** Cálculo puro de resultados de encuestas (NPS + satisfacción). */
import type { Survey, SurveyResponse } from "./types";

export interface NpsStats {
  n: number; prom: number; pas: number; det: number;
  nps: number; promPct: number; pasPct: number; detPct: number;
}

/** NPS = %promotores − %detractores. Promotor ≥9 · pasivo 7-8 · detractor ≤6. */
export function npsStats(responses: SurveyResponse[]): NpsStats {
  const scored = responses.filter((r) => typeof r.npsScore === "number");
  const n = scored.length;
  const prom = scored.filter((r) => (r.npsScore ?? 0) >= 9).length;
  const pas = scored.filter((r) => (r.npsScore ?? 0) >= 7 && (r.npsScore ?? 0) <= 8).length;
  const det = scored.filter((r) => (r.npsScore ?? 0) <= 6).length;
  const pct = (x: number) => (n ? Math.round((x / n) * 100) : 0);
  return { n, prom, pas, det, nps: pct(prom) - pct(det), promPct: pct(prom), pasPct: pct(pas), detPct: pct(det) };
}

/** Promedio (1-5) por cada pregunta de tipo rating de una encuesta de satisfacción. */
export function satisfactionAverages(survey: Survey, responses: SurveyResponse[]): { question: string; avg: number; n: number }[] {
  return survey.questions.filter((q) => q.type === "rating").map((q) => {
    const vals = responses
      .map((r) => r.answers.find((a) => a.questionId === q.id)?.value)
      .filter((v): v is number => typeof v === "number");
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    return { question: q.text, avg: Math.round(avg * 10) / 10, n: vals.length };
  });
}
