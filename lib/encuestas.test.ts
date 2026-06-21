import { describe, it, expect } from "vitest";
import { npsStats, satisfactionAverages } from "./encuestas";
import type { Survey, SurveyResponse } from "./types";

const r = (id: string, npsScore?: number): SurveyResponse => ({ id, clinicId: "c", surveyId: "s", answers: [], npsScore, createdAt: "2026-01-01" });

describe("npsStats", () => {
  it("NPS = %promotores − %detractores", () => {
    // 10,9 = promotores (2) · 7 = pasivo (1) · 3 = detractor (1) → 50% − 25% = 25
    const s = npsStats([r("1", 10), r("2", 9), r("3", 7), r("4", 3)]);
    expect(s.n).toBe(4);
    expect(s.prom).toBe(2);
    expect(s.pas).toBe(1);
    expect(s.det).toBe(1);
    expect(s.nps).toBe(25);
  });
  it("vacío y respuestas sin score no rompen", () => {
    expect(npsStats([]).nps).toBe(0);
    expect(npsStats([r("1")]).n).toBe(0);
  });
});

describe("satisfactionAverages", () => {
  it("promedia solo las preguntas de puntaje", () => {
    const survey: Survey = { id: "s", clinicId: "c", title: "t", kind: "satisfaccion", active: true, createdAt: "", questions: [{ id: "q1", text: "A", type: "rating" }, { id: "q2", text: "C", type: "text" }] };
    const responses: SurveyResponse[] = [
      { id: "1", clinicId: "c", surveyId: "s", answers: [{ questionId: "q1", value: 4 }], createdAt: "" },
      { id: "2", clinicId: "c", surveyId: "s", answers: [{ questionId: "q1", value: 5 }], createdAt: "" },
    ];
    const a = satisfactionAverages(survey, responses);
    expect(a).toHaveLength(1);
    expect(a[0].avg).toBe(4.5);
    expect(a[0].n).toBe(2);
  });
});
