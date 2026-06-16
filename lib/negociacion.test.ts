import { describe, it, expect } from "vitest";
import { defaultNegociacionConfig, isBudgetStale, canRetry } from "./negociacion";

describe("defaultNegociacionConfig", () => {
  it("trae los defaults (5 días, 2 intentos, 3 cuotas sin interés)", () => {
    const c = defaultNegociacionConfig();
    expect(c.diasGatillo).toBe(5);
    expect(c.maxIntentos).toBe(2);
    expect(c.financiacion).toEqual({ maxCuotas: 3, sinInteres: true, anticipoMinPct: 0 });
  });
});

describe("isBudgetStale", () => {
  const now = new Date("2026-06-16T10:00:00.000Z");
  it("presentado hace ≥ N días y sin negociación → stale", () => {
    const b = { status: "presentado", createdAt: "2026-06-10T10:00:00.000Z" } as any;
    expect(isBudgetStale(b, 5, now)).toBe(true);
  });
  it("presentado hace < N días → no stale", () => {
    const b = { status: "presentado", createdAt: "2026-06-14T10:00:00.000Z" } as any;
    expect(isBudgetStale(b, 5, now)).toBe(false);
  });
  it("no presentado → no stale", () => {
    const b = { status: "aceptado", createdAt: "2026-06-01T10:00:00.000Z" } as any;
    expect(isBudgetStale(b, 5, now)).toBe(false);
  });
  it("ya tiene negociación terminal → no stale", () => {
    const b = { status: "presentado", createdAt: "2026-06-01T10:00:00.000Z", negociacion: { status: "sin_respuesta", intentos: 2 } } as any;
    expect(isBudgetStale(b, 5, now)).toBe(false);
  });
});

describe("canRetry", () => {
  it("permite si intentos < max", () => {
    expect(canRetry({ negociacion: { intentos: 1 } } as any, 2)).toBe(true);
  });
  it("no permite si intentos >= max", () => {
    expect(canRetry({ negociacion: { intentos: 2 } } as any, 2)).toBe(false);
  });
  it("sin negociación previa → permite", () => {
    expect(canRetry({} as any, 2)).toBe(true);
  });
});
