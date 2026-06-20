import { describe, it, expect } from "vitest";
import { ageBucket, procedureCategory } from "./categorias";
import type { Procedure } from "./types";

describe("ageBucket", () => {
  it("clasifica por rango de edad", () => {
    const now = new Date("2026-06-20").getTime();
    const at = (y: number) => `${2026 - y}-06-20`;
    expect(ageBucket(at(10), now)).toBe("<14");
    expect(ageBucket(at(18), now)).toBe("15-20");
    expect(ageBucket(at(30), now)).toBe("21-35");
    expect(ageBucket(at(45), now)).toBe("36-50");
    expect(ageBucket(at(60), now)).toBe("51-65");
    expect(ageBucket(at(80), now)).toBe(">65");
  });
  it("devuelve 'Sin dato' si no hay fecha", () => {
    expect(ageBucket(undefined)).toBe("Sin dato");
    expect(ageBucket("no-es-fecha")).toBe("Sin dato");
  });
});

describe("procedureCategory", () => {
  const cat: Procedure[] = [{ cpt: "D8080", description: "Orto", price: 1, defaultDx: [], category: "ortodoncia" }];
  it("usa la categoría del catálogo si existe", () => {
    expect(procedureCategory("D8080", cat)).toBe("ortodoncia");
  });
  it("fallback por rango ADA cuando no hay match", () => {
    expect(procedureCategory("D2330", [])).toBe("operatoria");
    expect(procedureCategory("D1110", [])).toBe("prevencion");
    expect(procedureCategory("D7140", [])).toBe("cirugia");
    expect(procedureCategory("D8090", [])).toBe("ortodoncia");
  });
  it("cpt basura → general (no rompe)", () => {
    expect(procedureCategory("XYZ", [])).toBe("general");
    expect(procedureCategory("", [])).toBe("general");
  });
});
