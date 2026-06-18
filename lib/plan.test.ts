import { describe, it, expect } from "vitest";
import { planHas } from "./plan";

describe("radiografia_ia gating", () => {
  it("está en Clínica y Cadena", () => {
    expect(planHas("clinica", "radiografia_ia")).toBe(true);
    expect(planHas("cadena", "radiografia_ia")).toBe(true);
  });
  it("NO está en Solo", () => {
    expect(planHas("solo", "radiografia_ia")).toBe(false);
  });
});

describe("firma_electronica gating", () => {
  it("está en Clínica y Cadena, no en Solo", () => {
    expect(planHas("clinica", "firma_electronica")).toBe(true);
    expect(planHas("cadena", "firma_electronica")).toBe(true);
    expect(planHas("solo", "firma_electronica")).toBe(false);
  });
});
