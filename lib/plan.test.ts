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
