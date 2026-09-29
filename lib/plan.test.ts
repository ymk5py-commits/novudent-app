import { describe, it, expect } from "vitest";
import { PLANS, planHas, planUserLimitError, publicPlanId } from "./plan";
import { PLANES } from "./landing/precios";

describe("radiografia_ia gating", () => {
  it("está en Clínica y Cadena", () => {
    expect(planHas("clinica", "radiografia_ia")).toBe(true);
    expect(planHas("cadena", "radiografia_ia")).toBe(true);
  });
  it("NO está en Solo", () => {
    expect(planHas("solo", "radiografia_ia")).toBe(false);
  });
});

describe("oferta comercial", () => {
  it("comparte nombres, precios, beneficios y límites con la landing", () => {
    for (const p of Object.values(PLANS)) {
      const publico = PLANES.find((oferta) => oferta.id === publicPlanId(p.id));
      expect(publico).toBeDefined();
      expect(p.label).toBe(publico?.nombre);
      expect(p.priceGs).toBe(publico?.mensualGs);
      expect(p.annualGs).toBe(publico?.anualGs);
      expect(p.maxDentists).toBe(publico?.maxProfesionales);
      expect(p.bullets).toEqual(publico?.incluye);
    }
  });

  it("aplica los límites publicados al agregar profesionales", () => {
    const dentistas = (cantidad: number) => Array.from({ length: cantidad }, () => ({ role: "dentist", active: true }));
    expect(planUserLimitError({ plan: "clinica" }, dentistas(3), "dentist")).toBeNull();
    expect(planUserLimitError({ plan: "clinica" }, dentistas(4), "dentist")).toContain("4 profesionales");
    expect(planUserLimitError({ plan: "cadena" }, dentistas(10), "dentist")).toContain("10 profesionales");
  });
});

describe("firma_electronica gating", () => {
  it("está en Clínica y Cadena, no en Solo", () => {
    expect(planHas("clinica", "firma_electronica")).toBe(true);
    expect(planHas("cadena", "firma_electronica")).toBe(true);
    expect(planHas("solo", "firma_electronica")).toBe(false);
  });
});
