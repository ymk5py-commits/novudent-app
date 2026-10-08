import { describe, it, expect } from "vitest";
import { comprobanteDe, repartirPago, siguienteNumero, fechaDelPago, devolucionDelPago } from "./pago";
import type { FiscalDoc, Payment } from "./types";

describe("repartirPago", () => {
  it("un plan y un medio: una sola línea", () => {
    const r = repartirPago([{ budgetId: "b1", amount: 500 }], [{ method: "efectivo", amount: 500 }]);
    expect(r.error).toBeUndefined();
    expect(r.lineas).toEqual([{ budgetId: "b1", method: "efectivo", amount: 500 }]);
  });

  it("dos medios para un plan: una línea por medio", () => {
    const r = repartirPago([{ budgetId: "b1", amount: 500 }], [{ method: "efectivo", amount: 200 }, { method: "tarjeta", amount: 300 }]);
    expect(r.lineas).toEqual([
      { budgetId: "b1", method: "efectivo", amount: 200 },
      { budgetId: "b1", method: "tarjeta", amount: 300 },
    ]);
  });

  it("un medio que cubre dos planes se parte en el orden de los planes", () => {
    const r = repartirPago([{ budgetId: "b1", amount: 300 }, { budgetId: "b2", amount: 200 }], [{ method: "transferencia", amount: 500 }]);
    expect(r.lineas).toEqual([
      { budgetId: "b1", method: "transferencia", amount: 300 },
      { budgetId: "b2", method: "transferencia", amount: 200 },
    ]);
  });

  it("dos planes y dos medios: el primer medio llena primero el primer plan", () => {
    const r = repartirPago([{ budgetId: "b1", amount: 300 }, { budgetId: "b2", amount: 200 }], [{ method: "efectivo", amount: 400 }, { method: "qr", amount: 100 }]);
    expect(r.lineas).toEqual([
      { budgetId: "b1", method: "efectivo", amount: 300 },
      { budgetId: "b2", method: "efectivo", amount: 100 },
      { budgetId: "b2", method: "qr", amount: 100 },
    ]);
    expect(r.lineas.reduce((s, l) => s + l.amount, 0)).toBe(500);
  });

  it("el abono libre va al final y sin plan", () => {
    const r = repartirPago([{ budgetId: "b1", amount: 100 }], [{ method: "efectivo", amount: 150 }], 50);
    expect(r.lineas).toEqual([
      { budgetId: "b1", method: "efectivo", amount: 100 },
      { method: "efectivo", amount: 50 },
    ]);
  });

  it("solo abono libre, sin planes", () => {
    const r = repartirPago([], [{ method: "efectivo", amount: 80 }], 80);
    expect(r.lineas).toEqual([{ method: "efectivo", amount: 80 }]);
  });

  it("si los medios no cuadran con lo que se abona, no hay líneas", () => {
    const falta = repartirPago([{ budgetId: "b1", amount: 500 }], [{ method: "efectivo", amount: 400 }]);
    expect(falta.lineas).toEqual([]);
    expect(falta.diferencia).toBe(-100);
    expect(falta.error).toMatch(/no alcanzan/);
    const sobra = repartirPago([{ budgetId: "b1", amount: 500 }], [{ method: "efectivo", amount: 600 }]);
    expect(sobra.diferencia).toBe(100);
    expect(sobra.error).toMatch(/suman más/);
  });

  it("sin nada para pagar o sin medios, error", () => {
    expect(repartirPago([], [{ method: "efectivo", amount: 10 }]).error).toBeTruthy();
    expect(repartirPago([{ budgetId: "b1", amount: 10 }], []).error).toBeTruthy();
    expect(repartirPago([{ budgetId: "b1", amount: -5 }], [{ method: "efectivo", amount: 5 }]).error).toMatch(/negativos/);
  });

  it("un cheque sin número o banco no pasa; con datos, viajan en su línea", () => {
    const sin = repartirPago([{ budgetId: "b1", amount: 100 }], [{ method: "cheque", amount: 100, check: { number: "", bank: "Itaú", cashDate: "2026-10-10" } }]);
    expect(sin.error).toMatch(/cheque/);
    const con = repartirPago([{ budgetId: "b1", amount: 100 }], [{ method: "cheque", amount: 100, check: { number: " 123 ", bank: "Itaú", cashDate: "2026-10-10" } }]);
    expect(con.lineas[0].check).toEqual({ number: "123", bank: "Itaú", cashDate: "2026-10-10" });
  });

  it("no pierde centavos al partir", () => {
    const r = repartirPago([{ budgetId: "b1", amount: 33.33 }, { budgetId: "b2", amount: 66.67 }], [{ method: "efectivo", amount: 50 }, { method: "tarjeta", amount: 50 }]);
    expect(r.error).toBeUndefined();
    expect(Math.round(r.lineas.reduce((s, l) => s + l.amount, 0) * 100)).toBe(10000);
  });
});

describe("siguienteNumero", () => {
  it("arranca en 1 y sigue al mayor, ignorando lo no numérico", () => {
    expect(siguienteNumero([])).toBe("1");
    expect(siguienteNumero(["2875", undefined, "abc", "12"])).toBe("2876");
  });
});

describe("comprobanteDe", () => {
  const base = { clinicId: "c", patientId: "p1", date: "2026-10-03T12:00:00.000Z", concept: "x", receivedBy: "Ana", receiptNumber: "7" };
  const pagos: Payment[] = [
    { ...base, id: "1", budgetId: "b1", amount: 300, method: "efectivo" },
    { ...base, id: "2", budgetId: "b2", amount: 100, method: "efectivo" },
    { ...base, id: "3", budgetId: "b2", amount: 100, method: "tarjeta" },
    { ...base, id: "4", amount: 50, method: "tarjeta" },
    { ...base, id: "5", budgetId: "b1", amount: 999, method: "efectivo", voidedAt: "2026-10-03T13:00:00.000Z" },
    { ...base, id: "6", budgetId: "b1", amount: 10, method: "efectivo", receiptNumber: "8" },
  ];

  it("agrupa por plan y por medio, sin contar anulados ni otros comprobantes", () => {
    const c = comprobanteDe("7", pagos)!;
    expect(c.total).toBe(550);
    expect(c.cargos).toEqual([{ budgetId: "b1", amount: 300 }, { budgetId: "b2", amount: 200 }, { amount: 50 }]);
    expect(c.medios).toEqual([{ method: "efectivo", amount: 400 }, { method: "tarjeta", amount: 150 }]);
    expect(c.receivedBy).toBe("Ana");
  });

  it("devuelve null si el comprobante no tiene pagos vigentes", () => {
    expect(comprobanteDe("99", pagos)).toBeNull();
  });
});

describe("fechaDelPago — a qué hora queda un pago", () => {
  const ahora = new Date(2026, 9, 8, 9, 15, 30); // jueves 8-oct, 09:15 hora local

  it("un pago de hoy queda con la hora real del cobro: así entra en la caja que está abierta ahora", () => {
    expect(fechaDelPago("2026-10-08", ahora)).toBe(ahora.toISOString());
  });

  it("un pago de un día anterior queda al mediodía de ese día", () => {
    expect(fechaDelPago("2026-10-07", ahora)).toBe(new Date(2026, 9, 7, 12, 0, 0).toISOString());
  });

  it("una fecha futura no puede ser «ahora»: queda al mediodía de ese día", () => {
    expect(fechaDelPago("2026-10-09", ahora)).toBe(new Date(2026, 9, 9, 12, 0, 0).toISOString());
  });

  it("de noche sigue siendo el día local: a las 23:30 en Paraguay un pago de hoy no pasa a ser de mañana", () => {
    const tarde = new Date(2026, 9, 8, 23, 30, 0);
    expect(fechaDelPago("2026-10-08", tarde)).toBe(tarde.toISOString());
  });
});

describe("devolucionDelPago — una devolución por pago", () => {
  const doc = (kind: FiscalDoc["kind"], paymentId?: string): FiscalDoc => ({
    id: `fd_${kind}_${paymentId ?? "libre"}`, clinicId: "c1", patientId: "p1", kind, amount: 100000,
    date: "2026-10-08T12:00:00.000Z", paymentId, by: "Ana",
  });

  it("devuelve la devolución ya registrada de ese pago", () => {
    const docs = [doc("devolucion", "pg1"), doc("devolucion", "pg2")];
    expect(devolucionDelPago(docs, "pg2")?.paymentId).toBe("pg2");
  });

  it("una boleta del mismo pago no cuenta como devolución", () => {
    expect(devolucionDelPago([doc("boleta", "pg1")], "pg1")).toBeUndefined();
  });

  it("un pago sin devolución no la tiene, y una devolución suelta (sin pago) no se la adjudica a ninguno", () => {
    expect(devolucionDelPago([doc("devolucion", "pg1")], "pg9")).toBeUndefined();
    expect(devolucionDelPago([doc("devolucion", undefined)], "pg1")).toBeUndefined();
    expect(devolucionDelPago([], "pg1")).toBeUndefined();
  });
});
