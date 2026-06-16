import { describe, it, expect } from "vitest";
import { validatePerioVoice, isValidFdi } from "./perio-voice";

describe("isValidFdi", () => {
  it("acepta piezas permanentes", () => { expect(isValidFdi("16")).toBe(true); expect(isValidFdi("48")).toBe(true); });
  it("rechaza inválidas", () => { expect(isValidFdi("19")).toBe(false); expect(isValidFdi("99")).toBe(false); expect(isValidFdi("1")).toBe(false); });
});

describe("validatePerioVoice", () => {
  it("acepta un dictado válido", () => {
    const r = validatePerioVoice({ tooth: "16", pd: [3, 2, 4, 5, 3, 2], bop: [true, false, false, true, false, false], mobility: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.tooth).toBe("16"); expect(r.record.pd).toEqual([3, 2, 4, 5, 3, 2]); expect(r.record.mobility).toBe(1); }
  });
  it("rechaza pieza inválida", () => {
    expect(validatePerioVoice({ tooth: "99", pd: [3, 2, 4, 5, 3, 2], bop: [false, false, false, false, false, false] }).ok).toBe(false);
  });
  it("rechaza pd con largo != 6", () => {
    expect(validatePerioVoice({ tooth: "16", pd: [3, 2, 4], bop: [false, false, false, false, false, false] }).ok).toBe(false);
  });
  it("rechaza profundidad fuera de rango (descarta un '30' mal oído)", () => {
    expect(validatePerioVoice({ tooth: "16", pd: [3, 2, 30, 5, 3, 2], bop: [false, false, false, false, false, false] }).ok).toBe(false);
  });
  it("acepta null en un sitio no medido", () => {
    const r = validatePerioVoice({ tooth: "16", pd: [3, null, 4, 5, 3, 2], bop: [false, false, false, false, false, false] });
    expect(r.ok).toBe(true);
  });
  it("rechaza mobility fuera de 0-3", () => {
    expect(validatePerioVoice({ tooth: "16", pd: [3, 2, 4, 5, 3, 2], bop: [false, false, false, false, false, false], mobility: 5 }).ok).toBe(false);
  });
  it("normaliza bop ausente a 6 falsos", () => {
    const r = validatePerioVoice({ tooth: "16", pd: [3, 2, 4, 5, 3, 2] } as any);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record.bop).toEqual([false, false, false, false, false, false]);
  });
});
