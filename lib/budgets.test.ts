import { describe, it, expect } from "vitest";
import { budgetRealizado, budgetTotal, budgetDescuento, financialStatus, checkStatus, parsearDescuento, descuentoSaneado, presupuestosDePaciente } from "./budgets";
import type { BudgetItem, Payment } from "./types";

const item = (price: number, status: "pendiente" | "realizado"): BudgetItem => ({
  id: "x", cpt: "D0000", description: "x", price, status,
});

describe("budgetRealizado", () => {
  it("suma solo los ítems realizados", () => {
    expect(budgetRealizado({ items: [item(1000, "realizado"), item(500, "pendiente")] })).toBe(1000);
  });
  it("aplica el descuento del presupuesto", () => {
    expect(budgetRealizado({ items: [item(1000, "realizado")], discountPct: 10 })).toBe(900);
  });
  it("es 0 sin ítems realizados o sin ítems", () => {
    expect(budgetRealizado({ items: [item(500, "pendiente")] })).toBe(0);
    expect(budgetRealizado({ items: [] })).toBe(0);
  });
});

describe("financialStatus", () => {
  it("'No hay saldo' cuando está saldado", () => {
    expect(financialStatus({ id: "b", items: [item(1000, "realizado")] } as any, [{ budgetId: "b", amount: 1000 } as any]).label).toBe("No hay saldo");
  });
  it("'Deudas' cuando debe por trabajo realizado", () => {
    expect(financialStatus({ id: "b", items: [item(1000, "realizado")] } as any, []).label).toBe("Deudas");
  });
  it("'Hay saldo' cuando hay saldo pero nada realizado aún", () => {
    expect(financialStatus({ id: "b", items: [item(1000, "pendiente")] } as any, []).label).toBe("Hay saldo");
  });
});

const chequePago = (extra: Partial<Payment> = {}): Payment => ({
  id: "y1", clinicId: "c1", patientId: "p1", date: "2026-07-20T10:00:00.000Z",
  amount: 375_000, method: "cheque", concept: "Cheque", receivedBy: "u1",
  check: { number: "001", bank: "Banco Test", cashDate: "2026-08-05" },
  ...extra,
});

describe("checkStatus", () => {
  it("sin voidedAt ni cobradoAt → pendiente", () => {
    expect(checkStatus(chequePago())).toBe("pendiente");
  });

  it("con cobradoAt seteado → cobrado", () => {
    expect(checkStatus(chequePago({ check: { number: "001", bank: "Banco Test", cashDate: "2026-08-05", cobradoAt: "2026-07-31T10:00:00.000Z" } }))).toBe("cobrado");
  });

  it("con voidedAt seteado → anulado", () => {
    expect(checkStatus(chequePago({ voidedAt: "2026-07-31T10:00:00.000Z" }))).toBe("anulado");
  });

  it("anulado gana aunque también esté cobradoAt — no hay estado imposible", () => {
    const p = chequePago({
      voidedAt: "2026-08-01T10:00:00.000Z",
      check: { number: "001", bank: "Banco Test", cashDate: "2026-08-05", cobradoAt: "2026-07-31T10:00:00.000Z" },
    });
    expect(checkStatus(p)).toBe("anulado");
  });

  it("un pago que no es cheque también resuelve (sin check, sin voidedAt) → pendiente", () => {
    expect(checkStatus({ id: "y2", clinicId: "c1", patientId: "p1", date: "2026-07-20T10:00:00.000Z", amount: 100_000, method: "efectivo", concept: "Abono", receivedBy: "u1" })).toBe("pendiente");
  });
});

import { retentionPct, netAmount } from "./budgets";
import type { PaymentRetention } from "./types";

describe("retentionPct", () => {
  it("devuelve el % configurado para el medio", () => {
    expect(retentionPct("tarjeta", { tarjeta: 5 })).toBe(5);
  });
  it("0% si el medio no tiene entrada en la config", () => {
    expect(retentionPct("efectivo", { tarjeta: 5 })).toBe(0);
  });
  it("0% si la config es undefined", () => {
    expect(retentionPct("tarjeta", undefined)).toBe(0);
  });
  it("acota un valor negativo a 0", () => {
    expect(retentionPct("tarjeta", { tarjeta: -10 })).toBe(0);
  });
  it("acota un valor mayor a 100 a 100", () => {
    expect(retentionPct("tarjeta", { tarjeta: 250 })).toBe(100);
  });
  it("0% si el valor no es numérico (NaN)", () => {
    expect(retentionPct("tarjeta", { tarjeta: NaN })).toBe(0);
  });
});

describe("netAmount", () => {
  const cfg: PaymentRetention = { tarjeta: 5 };

  it("PYG (0 decimales): 5% sobre 1.000.000 → 950.000", () => {
    expect(netAmount({ amount: 1_000_000, method: "tarjeta" }, cfg, "PYG")).toBe(950_000);
  });
  it("0% de retención → monto idéntico al bruto", () => {
    expect(netAmount({ amount: 100_000, method: "efectivo" }, cfg, "PYG")).toBe(100_000);
  });
  it("PYG redondea a entero: 5% sobre 333 → 316 (no 316.35)", () => {
    expect(netAmount({ amount: 333, method: "tarjeta" }, cfg, "PYG")).toBe(316);
  });
  it("100% de retención → 0", () => {
    expect(netAmount({ amount: 50_000, method: "tarjeta" }, { tarjeta: 100 }, "PYG")).toBe(0);
  });
  it("moneda de 2 decimales (USD): 5% sobre 50 → 47.5, NO se redondea a entero", () => {
    expect(netAmount({ amount: 50, method: "tarjeta" }, { tarjeta: 5 }, "USD")).toBe(47.5);
  });
  it("moneda inválida/desconocida cae a DEFAULT_CURRENCY en vez de crashear", () => {
    expect(netAmount({ amount: 1_000_000, method: "tarjeta" }, cfg, "XYZ" as any)).toBe(950_000);
  });
});

describe("parsearDescuento — el % de un convenio o de un presupuesto", () => {
  it("acepta de 0 a 100, con punto o con coma", () => {
    expect(parsearDescuento("0")).toEqual({ ok: true, valor: 0 });
    expect(parsearDescuento("15")).toEqual({ ok: true, valor: 15 });
    expect(parsearDescuento("100")).toEqual({ ok: true, valor: 100 });
    expect(parsearDescuento("12,5")).toEqual({ ok: true, valor: 12.5 });
    expect(parsearDescuento(" 7.25 ")).toEqual({ ok: true, valor: 7.25 });
    expect(parsearDescuento(30)).toEqual({ ok: true, valor: 30 });
  });

  it("se queda con dos decimales", () => {
    expect(parsearDescuento("10.456")).toEqual({ ok: true, valor: 10.46 });
  });

  it("rechaza lo que pasa de 100, lo negativo, lo vacío y lo que no es un número, diciendo qué corregir", () => {
    expect(parsearDescuento("150")).toMatchObject({ ok: false, error: expect.stringMatching(/100/) });
    expect(parsearDescuento("100.5")).toMatchObject({ ok: false });
    expect(parsearDescuento("-5")).toMatchObject({ ok: false, error: expect.stringMatching(/negativo/) });
    expect(parsearDescuento("")).toMatchObject({ ok: false, error: expect.stringMatching(/Escribí/) });
    expect(parsearDescuento("   ")).toMatchObject({ ok: false });
    expect(parsearDescuento("abc")).toMatchObject({ ok: false, error: expect.stringMatching(/número/) });
    expect(parsearDescuento("1e3")).toMatchObject({ ok: false });
    expect(parsearDescuento(NaN)).toMatchObject({ ok: false });
    expect(parsearDescuento(Infinity)).toMatchObject({ ok: false });
  });
});

describe("descuentoSaneado — un % guardado con basura no rompe los totales", () => {
  it("lo deja entre 0 y 100", () => {
    expect(descuentoSaneado(150)).toBe(100);
    expect(descuentoSaneado(-20)).toBe(0);
    expect(descuentoSaneado(undefined)).toBe(0);
    expect(descuentoSaneado(NaN)).toBe(0);
    expect(descuentoSaneado(25)).toBe(25);
  });

  it("un convenio con 150 % ya guardado no da un total negativo", () => {
    const b = { items: [item(1000, "pendiente"), item(500, "pendiente")], discountPct: 150 };
    expect(budgetTotal(b)).toBe(0);
    expect(budgetDescuento(b)).toBe(1500);
    expect(budgetRealizado({ items: [item(1000, "realizado")], discountPct: 150 })).toBe(0);
  });
});

describe("presupuestosDePaciente — el buscador por paciente de Presupuestos", () => {
  const pacientes = [
    { id: "p1", firstName: "María", lastName: "González", document: "3.456.789" },
    { id: "p2", firstName: "Juan", lastName: "Ríos", document: "4.567.890" },
    { id: "p3", firstName: "Mariano", lastName: "Benítez", document: "" },
  ];
  const presupuestos = [{ id: "g1", patientId: "p1" }, { id: "g2", patientId: "p2" }, { id: "g3", patientId: "p1" }, { id: "g4", patientId: "p3" }, { id: "g5", patientId: "borrado" }];
  const ids = (q: string) => presupuestosDePaciente(presupuestos, pacientes, q).map((b) => b.id);

  it("sin escribir nada están todos, en el mismo orden", () => {
    expect(ids("")).toEqual(["g1", "g2", "g3", "g4", "g5"]);
    expect(ids("   ")).toEqual(["g1", "g2", "g3", "g4", "g5"]);
  });
  it("por nombre o apellido, sin tildes ni mayúsculas, con todas las palabras en cualquier orden", () => {
    expect(ids("MARIA")).toEqual(["g1", "g3", "g4"]); // María y Mariano
    expect(ids("gonzalez maría")).toEqual(["g1", "g3"]);
    expect(ids("rios")).toEqual(["g2"]);
  });
  it("por CI, con o sin puntos y aunque sea una parte", () => {
    expect(ids("3.456.789")).toEqual(["g1", "g3"]);
    expect(ids("3456789")).toEqual(["g1", "g3"]);
    expect(ids("567890")).toEqual(["g2"]);
  });
  it("si nadie coincide no queda ninguno (tampoco el de un paciente que ya no existe)", () => {
    expect(ids("zzz")).toEqual([]);
  });
});
