import { describe, it, expect } from "vitest";
import { installmentStatus } from "./financiamiento";
import type { Installment } from "./types";

const sched: Installment[] = [
  { numero: 1, dueDate: "2026-01-01", amount: 100 },
  { numero: 2, dueDate: "2026-02-01", amount: 100 },
  { numero: 3, dueDate: "2026-03-01", amount: 100 },
];

describe("installmentStatus", () => {
  it("aloca los pagos en cascada (waterfall)", () => {
    const r = installmentStatus(sched, 150);
    expect(r[0]).toMatchObject({ pagado: 100, saldo: 0 });
    expect(r[1]).toMatchObject({ pagado: 50, saldo: 50 });
    expect(r[2]).toMatchObject({ pagado: 0, saldo: 100 });
  });
  it("0 pagado deja todo pendiente; excedente no negativiza", () => {
    expect(installmentStatus(sched, 0)[0].saldo).toBe(100);
    const full = installmentStatus(sched, 9999);
    expect(full.every((c) => c.saldo === 0)).toBe(true);
  });
  it("schedule vacío → []", () => {
    expect(installmentStatus([], 100)).toEqual([]);
  });
});
