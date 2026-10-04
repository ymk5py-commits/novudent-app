import { describe, it, expect } from "vitest";
import { simularFinanciamiento, vencimientoCuota } from "./financiamiento";

const base = { porFinanciar: 1_000_000, pie: 0, cuotas: 4, interesMensualPct: 0, primeraCuota: "2026-11-05", periodicidad: "mensual" as const, hoy: "2026-10-04" };

describe("simularFinanciamiento", () => {
  it("sin pie ni interés: cuotas iguales que suman el total", () => {
    const s = simularFinanciamiento(base);
    expect(s.error).toBeUndefined();
    expect(s.schedule.map((c) => c.amount)).toEqual([250_000, 250_000, 250_000, 250_000]);
    expect(s.schedule.map((c) => c.dueDate)).toEqual(["2026-11-05", "2026-12-05", "2027-01-05", "2027-02-05"]);
    expect(s.schedule.map((c) => c.numero)).toEqual([1, 2, 3, 4]);
  });

  it("el pie entra como cuota 0 con vencimiento hoy y baja lo financiado", () => {
    const s = simularFinanciamiento({ ...base, pie: 200_000 });
    expect(s.schedule[0]).toEqual({ numero: 0, dueDate: "2026-10-04", amount: 200_000 });
    expect(s.montoFinanciado).toBe(800_000);
    expect(s.schedule.reduce((a, c) => a + c.amount, 0)).toBe(1_000_000);
  });

  it("la última cuota absorbe el redondeo", () => {
    const s = simularFinanciamiento({ ...base, porFinanciar: 1_000_000, cuotas: 3 });
    expect(s.schedule.map((c) => c.amount)).toEqual([333_333, 333_333, 333_334]);
    expect(s.totalCuotas).toBe(1_000_000);
  });

  it("interés simple mensual sobre lo financiado", () => {
    const s = simularFinanciamiento({ ...base, interesMensualPct: 2 }); // 2% x 4 meses = 8%
    expect(s.interes).toBe(80_000);
    expect(s.totalCuotas).toBe(1_080_000);
    expect(s.schedule.reduce((a, c) => a + c.amount, 0)).toBe(1_080_000);
  });

  it("quincenal cobra medio mes de interés por cuota y vence cada 15 días", () => {
    const s = simularFinanciamiento({ ...base, interesMensualPct: 2, periodicidad: "quincenal" }); // 4 quincenas = 2 meses = 4%
    expect(s.interes).toBe(40_000);
    expect(s.schedule.map((c) => c.dueDate)).toEqual(["2026-11-05", "2026-11-20", "2026-12-05", "2026-12-20"]);
  });

  it("rechaza entradas inválidas", () => {
    expect(simularFinanciamiento({ ...base, porFinanciar: 0 }).error).toBeTruthy();
    expect(simularFinanciamiento({ ...base, pie: 1_000_000 }).error).toMatch(/pie/);
    expect(simularFinanciamiento({ ...base, cuotas: 0 }).error).toMatch(/cuotas/i);
    expect(simularFinanciamiento({ ...base, cuotas: 61 }).error).toMatch(/cuotas/i);
    expect(simularFinanciamiento({ ...base, interesMensualPct: 25 }).error).toMatch(/interés/);
    expect(simularFinanciamiento({ ...base, primeraCuota: "" }).error).toMatch(/fecha/);
  });
});

describe("vencimientoCuota", () => {
  it("mensual recorta al último día del mes", () => {
    expect(vencimientoCuota("2027-01-31", 1, "mensual")).toBe("2027-02-28");
    expect(vencimientoCuota("2027-01-31", 2, "mensual")).toBe("2027-03-31");
  });
  it("semanal suma 7 días y cruza de año", () => {
    expect(vencimientoCuota("2026-12-28", 1, "semanal")).toBe("2027-01-04");
  });
});
