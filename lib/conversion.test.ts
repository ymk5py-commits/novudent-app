import { describe, it, expect } from "vitest";
import { conversionFunnel, conversionTimeline } from "./conversion";
import type { Appointment, Budget } from "./types";

const appt = (start: string, status: Appointment["status"]): Appointment =>
  ({ id: start + status, clinicId: "c", patientId: "p", dentistId: "d", title: "x", start, end: start, status, amount: 0, discount: 0 });
const bud = (createdAt: string, status: Budget["status"]): Budget =>
  ({ id: createdAt + status, clinicId: "c", patientId: "p", dentistId: "d", createdAt, status, items: [], history: [] });

describe("conversionFunnel", () => {
  it("cuenta etapas y porcentajes sobre agendadas", () => {
    const from = Date.parse("2026-01-01"), to = Date.parse("2026-12-31");
    const appts = [appt("2026-03-01", "confirmada"), appt("2026-03-02", "completada"), appt("2026-03-03", "pendiente"), appt("2026-03-04", "cancelada")];
    const budgets = [bud("2026-03-05", "aceptado"), bud("2026-03-06", "borrador")];
    const r = conversionFunnel(appts, budgets, from, to);
    expect(r.agendadas).toBe(4);
    expect(r.confirmadas).toBe(2); // confirmada + completada
    expect(r.aceptados).toBe(1);
    expect(r.pctConfirmadas).toBe(50);
    expect(r.pctAceptados).toBe(25);
  });
  it("0 agendadas → 0% sin dividir por cero", () => {
    const r = conversionFunnel([], [], 0, 1);
    expect(r.agendadas).toBe(0);
    expect(r.pctConfirmadas).toBe(0);
    expect(r.pctAceptados).toBe(0);
  });
});

describe("conversionTimeline", () => {
  it("devuelve un punto por mes en orden cronológico", () => {
    const now = Date.parse("2026-06-20");
    const r = conversionTimeline([appt("2026-06-01", "confirmada")], [bud("2026-06-02", "aceptado")], 12, now);
    expect(r).toHaveLength(12);
    const last = r[r.length - 1];
    expect(last.agendadas).toBe(1);
    expect(last.confirmadas).toBe(1);
    expect(last.aceptados).toBe(1);
    // un mes sin datos queda en 0
    expect(r[0].agendadas).toBe(0);
  });
});
