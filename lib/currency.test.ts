import { describe, it, expect } from "vitest";
import { formatMoney, CURRENCIES, CURRENCY_LIST, DEFAULT_CURRENCY } from "./currency";

describe("formatMoney", () => {
  it("USD: símbolo US$ + 2 decimales (en-US)", () => {
    expect(formatMoney(2, "USD")).toBe("US$ 2.00");
    expect(formatMoney(2.5, "USD")).toBe("US$ 2.50");
    expect(formatMoney(1000, "USD")).toBe("US$ 1,000.00");
  });

  it("PYG: símbolo Gs + 0 decimales", () => {
    expect(formatMoney(2, "PYG")).toBe("Gs 2");
    expect(formatMoney(0, "PYG")).toBe("Gs 0");
  });

  it("CLP/COP: 0 decimales con su símbolo", () => {
    expect(formatMoney(2, "CLP")).toBe("$ 2");
    expect(formatMoney(2, "COP")).toBe("$ 2");
  });

  it("código desconocido → cae a la moneda por defecto (PYG)", () => {
    expect(formatMoney(2, "ZZZ" as any)).toBe(formatMoney(2, DEFAULT_CURRENCY));
    expect(formatMoney(2, "ZZZ" as any)).toBe("Gs 2");
  });

  it("valores no finitos se tratan como 0", () => {
    expect(formatMoney(NaN, "USD")).toBe("US$ 0.00");
    expect(formatMoney(Infinity, "PYG")).toBe("Gs 0");
  });

  it("el registro y la lista están alineados", () => {
    expect(CURRENCY_LIST.length).toBe(Object.keys(CURRENCIES).length);
    expect(CURRENCIES[DEFAULT_CURRENCY]).toBeDefined();
    // cada moneda tiene símbolo, locale y decimales 0|2
    for (const c of CURRENCY_LIST) {
      expect(c.symbol.length).toBeGreaterThan(0);
      expect(c.locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect([0, 2]).toContain(c.decimals);
    }
  });
});
