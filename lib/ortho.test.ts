import { describe, it, expect } from "vitest";
import { orthoProgress } from "./ortho";

const MS_DAY = 86_400_000;

describe("orthoProgress", () => {
  it("calcula meses transcurridos y % calendario", () => {
    const now = Math.round(200 * MS_DAY); // ~6 meses completos desde epoch
    const r = orthoProgress({ startDate: new Date(0).toISOString(), totalMonths: 24 }, now);
    expect(r.monthsElapsed).toBe(6);
    expect(r.totalMonths).toBe(24);
    expect(r.calendarPct).toBe(25); // round(6/24*100)
  });

  it("realPct usa progressReal con clamp 0–100", () => {
    expect(orthoProgress({ progressReal: 40 } as any, 0).realPct).toBe(40);
    expect(orthoProgress({ progressReal: 150 } as any, 0).realPct).toBe(100);
    expect(orthoProgress({ progressReal: -5 } as any, 0).realPct).toBe(0);
  });

  it("tolera ortho sin datos (no rompe, sin NaN)", () => {
    const r = orthoProgress(undefined, 0);
    expect(r.monthsElapsed).toBe(0);
    expect(r.totalMonths).toBe(0);
    expect(r.calendarPct).toBe(0);
    expect(r.realPct).toBe(0);
    expect(Number.isNaN(r.calendarPct)).toBe(false);
  });

  it("calendarPct nunca pasa 100 aunque se exceda el tiempo", () => {
    const now = Math.round(1000 * MS_DAY);
    const r = orthoProgress({ startDate: new Date(0).toISOString(), totalMonths: 12 }, now);
    expect(r.calendarPct).toBe(100);
    expect(r.monthsElapsed).toBeGreaterThan(12);
  });
});
