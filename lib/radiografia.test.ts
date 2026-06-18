import { describe, it, expect } from "vitest";
import { clampBox, normalizeSeverity, validateRadiografiaAI } from "./radiografia";

describe("clampBox", () => {
  it("acepta una caja válida", () => {
    expect(clampBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  });
  it("clampa origen fuera de rango y recorta el ancho al borde", () => {
    const b = clampBox({ x: 0.9, y: 0.2, w: 0.5, h: 0.2 });
    expect(b).not.toBeNull();
    expect(b!.x).toBe(0.9);
    expect(b!.x + b!.w).toBeLessThanOrEqual(1);
  });
  it("rechaza caja con ancho/alto no positivo o no numérico", () => {
    expect(clampBox({ x: 0.1, y: 0.1, w: 0, h: 0.2 })).toBeNull();
    expect(clampBox({ x: 0.1, y: 0.1, w: "a", h: 0.2 })).toBeNull();
    expect(clampBox(null)).toBeNull();
  });
});

describe("normalizeSeverity", () => {
  it("mantiene una severidad válida", () => {
    expect(normalizeSeverity("severo")).toBe("severo");
  });
  it("cae a 'observacion' ante basura", () => {
    expect(normalizeSeverity("urgente")).toBe("observacion");
    expect(normalizeSeverity(undefined)).toBe("observacion");
  });
});

describe("validateRadiografiaAI", () => {
  it("devuelve vacío ante basura", () => {
    expect(validateRadiografiaAI(null)).toEqual({ findings: [], summary: "", patientExplanation: "" });
    expect(validateRadiografiaAI("nope").findings).toEqual([]);
  });
  it("conserva hallazgos válidos y los marca source=ia", () => {
    const r = validateRadiografiaAI({
      findings: [{ box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, label: "Caries oclusal", tooth: "16", severity: "moderado" }],
      summary: "ok",
      patientExplanation: "explicación",
    });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].source).toBe("ia");
    expect(r.findings[0].label).toBe("Caries oclusal");
    expect(r.findings[0].tooth).toBe("16");
    expect(r.summary).toBe("ok");
    expect(r.patientExplanation).toBe("explicación");
  });
  it("descarta hallazgos sin label o con caja inválida", () => {
    const r = validateRadiografiaAI({
      findings: [
        { box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, label: "" },
        { box: { x: 0.1, y: 0.1, w: 0, h: 0.2 }, label: "X" },
        { label: "sin caja" },
      ],
    });
    expect(r.findings).toHaveLength(0);
  });
  it("limita la cantidad de hallazgos a 40", () => {
    const many = Array.from({ length: 60 }, () => ({ box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, label: "C" }));
    expect(validateRadiografiaAI({ findings: many }).findings.length).toBe(40);
  });
});
