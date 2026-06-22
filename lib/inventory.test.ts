import { describe, it, expect } from "vitest";
import { stockLevel } from "./inventory";

describe("stockLevel — semáforo de 3 niveles", () => {
  it("crítico: stock en o por debajo del mínimo", () => {
    expect(stockLevel({ stock: 2, minStock: 3 })).toBe("critico");
    expect(stockLevel({ stock: 4, minStock: 4 })).toBe("critico"); // <= mínimo
  });

  it("bajo óptimo: por encima del mínimo pero debajo del óptimo", () => {
    expect(stockLevel({ stock: 8, minStock: 4, optimalStock: 10 })).toBe("bajo");
  });

  it("ok: en o por encima del óptimo (y dentro del máximo)", () => {
    expect(stockLevel({ stock: 14, minStock: 5, optimalStock: 12, maxStock: 25 })).toBe("ok");
    expect(stockLevel({ stock: 10, minStock: 4, optimalStock: 10 })).toBe("ok"); // == óptimo
  });

  it("sobre-stock: por encima del máximo", () => {
    expect(stockLevel({ stock: 30, minStock: 5, optimalStock: 12, maxStock: 25 })).toBe("exceso");
  });

  it("sin óptimo/máximo: por encima del mínimo = ok", () => {
    expect(stockLevel({ stock: 6, minStock: 4 })).toBe("ok");
  });

  it("crítico tiene prioridad aunque falten óptimo/máximo", () => {
    expect(stockLevel({ stock: 0, minStock: 1, optimalStock: 10, maxStock: 20 })).toBe("critico");
  });
});
