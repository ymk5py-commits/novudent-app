import { describe, it, expect } from "vitest";
import { fitDimensions } from "./image";

describe("fitDimensions", () => {
  it("no agranda si ya entra en maxDim", () => {
    expect(fitDimensions(800, 600, 1400)).toEqual({ w: 800, h: 600 });
  });
  it("escala por el lado más largo (landscape)", () => {
    expect(fitDimensions(2800, 1400, 1400)).toEqual({ w: 1400, h: 700 });
  });
  it("escala por el lado más largo (portrait)", () => {
    expect(fitDimensions(1400, 2800, 1400)).toEqual({ w: 700, h: 1400 });
  });
  it("redondea a enteros", () => {
    const r = fitDimensions(1000, 333, 500);
    expect(Number.isInteger(r.w)).toBe(true);
    expect(Number.isInteger(r.h)).toBe(true);
  });
  it("devuelve 0x0 ante dimensiones inválidas", () => {
    expect(fitDimensions(0, 100, 1400)).toEqual({ w: 0, h: 0 });
    expect(fitDimensions(NaN, 100, 1400)).toEqual({ w: 0, h: 0 });
  });
});
