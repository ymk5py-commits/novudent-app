import { describe, it, expect } from "vitest";
import { cambiarProfesional, duplicarPlan, enviosDe, finalizarPlan, pendientesDe, presupuestoHtml, reabrirPlan, registrarEnvio } from "./planOpciones";
import type { Budget } from "./types";

const plan: Budget = {
  id: "g1", clinicId: "c", patientId: "p1", dentistId: "u2", createdAt: "2026-09-01T10:00:00.000Z", status: "aceptado",
  name: "Rehabilitación", discountPct: 10, patientComments: "Pago en 3 cuotas",
  items: [
    { id: "a", cpt: "D1", description: "Corona <cerámica>", tooth: "16", price: 1000, status: "realizado", doneAt: "2026-09-10T10:00:00.000Z", doneBy: "Dra." },
    { id: "b", cpt: "D2", description: "Limpieza", price: 500, status: "pendiente" },
  ],
  schedule: [{ numero: 1, dueDate: "2026-10-01", amount: 700 }, { numero: 2, dueDate: "2026-11-01", amount: 780 }],
  installments: 2,
  financiamiento: { pie: 0, cuotas: 2, interesMensualPct: 2, interes: 30, montoFinanciado: 1350, periodicidad: "mensual", pagadoAntes: 0, generadoAt: "2026-09-02T10:00:00.000Z", generadoBy: "Ana" },
  history: [{ at: "2026-09-01T10:00:00.000Z", action: "Creado", by: "Ana" }],
};
const ctx = { now: "2026-10-04T12:00:00.000Z", by: "Ana" };

describe("duplicarPlan", () => {
  const dup = duplicarPlan(plan, { id: "g2", ...ctx });
  it("copia las prestaciones como pendientes, sin cuotas ni financiamiento", () => {
    expect(dup.items.map((i) => [i.description, i.status])).toEqual([["Corona <cerámica>", "pendiente"], ["Limpieza", "pendiente"]]);
    expect(dup.items.every((i) => !("doneAt" in i) && !("doneBy" in i))).toBe(true);
    expect(dup.schedule).toBeUndefined();
    expect(dup.financiamiento).toBeUndefined();
    expect(dup.installments).toBeUndefined();
  });
  it("queda en borrador, con nombre «(copia)», ids nuevos y rastro del original", () => {
    expect(dup.status).toBe("borrador");
    expect(dup.name).toBe("Rehabilitación (copia)");
    expect(dup.id).toBe("g2");
    expect(new Set(dup.items.map((i) => i.id)).size).toBe(2);
    expect(dup.items.some((i) => i.id === "a")).toBe(false);
    expect(dup.history).toEqual([{ at: ctx.now, action: "Duplicado del plan #g1", by: "Ana" }]);
    expect(dup.discountPct).toBe(10);
  });
  it("no deja campos undefined (Firestore los rechaza)", () => {
    expect(Object.values(dup).includes(undefined)).toBe(false);
    for (const i of dup.items) expect(Object.values(i).includes(undefined)).toBe(false);
  });
});

describe("finalizar, reabrir y cambiar profesional", () => {
  it("finalizar avisa en el historial cuántas prestaciones quedaron sin hacer", () => {
    expect(pendientesDe(plan)).toBe(1);
    const f = finalizarPlan(plan, ctx);
    expect(f.status).toBe("completado");
    expect(f.history.at(-1)!.action).toBe("Plan finalizado con 1 prestación sin realizar");
    const completo = finalizarPlan({ ...plan, items: plan.items.map((i) => ({ ...i, status: "realizado" as const })) }, ctx);
    expect(completo.history.at(-1)!.action).toBe("Plan finalizado");
  });
  it("reabrir vuelve a «En ejecución»", () => {
    const r = reabrirPlan(finalizarPlan(plan, ctx), ctx);
    expect(r.status).toBe("aceptado");
    expect(r.history.at(-1)!.action).toBe("Plan reabierto");
  });
  it("cambiar profesional deja rastro; el mismo profesional no cambia nada", () => {
    const c = cambiarProfesional(plan, "u4", { antes: "Dra. Sofía", despues: "Dr. Diego" }, ctx);
    expect(c.dentistId).toBe("u4");
    expect(c.history.at(-1)!.action).toBe("Profesional a cargo: Dra. Sofía → Dr. Diego");
    expect(cambiarProfesional(plan, "u2", { antes: "x", despues: "x" }, ctx)).toBe(plan);
  });
});

describe("envíos del presupuesto", () => {
  it("cada envío queda en el historial y se lista del más reciente al más viejo", () => {
    const uno = registrarEnvio(plan, "completo", "juan@x.com", ctx);
    const dos = registrarEnvio(uno, "solo_total", "juan@x.com", { now: "2026-10-05T09:00:00.000Z", by: "Bea" });
    expect(enviosDe(dos)).toEqual([
      { at: "2026-10-05T09:00:00.000Z", by: "Bea", detalle: "Solo el total · juan@x.com" },
      { at: ctx.now, by: "Ana", detalle: "Presupuesto completo · juan@x.com" },
    ]);
    expect(enviosDe(plan)).toEqual([]);
  });
});

describe("presupuestoHtml", () => {
  const o = { clinica: "Clínica", paciente: "Juan", profesional: "Dra. Sofía", fmt: (n: number) => `Gs ${n}` };
  it("completo: prestaciones con precio, descuento, interés, total y forma de pago", () => {
    const h = presupuestoHtml(plan, "completo", o);
    expect(h).toContain("Corona &lt;cerámica&gt;");
    expect(h).toContain("Gs 1000");
    expect(h).toContain("Descuento 10%: − Gs 150");
    expect(h).toContain("Interés por financiamiento: Gs 30");
    expect(h).toContain("Total: Gs 1380");
    expect(h).toContain("2 cuotas mensuales de Gs 700");
    expect(h).toContain("Pago en 3 cuotas");
  });
  it("sin detalle: prestaciones sin precios ni descuento", () => {
    const h = presupuestoHtml(plan, "sin_detalle", o);
    expect(h).toContain("Limpieza");
    expect(h).not.toContain("Gs 500");
    expect(h).not.toContain("Descuento");
    expect(h).toContain("Total: Gs 1380");
  });
  it("solo total: ni prestaciones, ni precios sueltos, ni cuotas", () => {
    const h = presupuestoHtml(plan, "solo_total", o);
    expect(h).not.toContain("Limpieza");
    expect(h).not.toContain("cuotas mensuales");
    expect(h).toContain("Total: Gs 1380");
  });
});
