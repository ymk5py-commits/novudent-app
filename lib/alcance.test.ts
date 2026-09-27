import { describe, it, expect } from "vitest";
import { doctoresVisibles, veDoctor, pacientesVisibles, vePaciente, tiposDeTareaVisibles, veTarea } from "./alcance";

const users = [
  { id: "u1" }, // admin
  { id: "u2" }, // dentista
  { id: "u3", asiste: ["u2"] }, // asistente de la Dra. del u2
  { id: "u4" }, // otro dentista
  { id: "u5" }, // asistente sin doctores asignados
];
const appointments = [
  { patientId: "p1", dentistId: "u2" },
  { patientId: "p2", dentistId: "u4" },
  { patientId: "p3", dentistId: "u2" },
  { patientId: "p3", dentistId: "u4" }, // p3 lo atienden los dos
];
const budgets = [{ patientId: "p4", dentistId: "u2" }]; // p4 solo tiene plan, sin cita

describe("doctoresVisibles", () => {
  it("admin, caja y recepción ven a todos los profesionales", () => {
    for (const role of ["admin", "cashier", "receptionist"] as const) {
      expect(doctoresVisibles({ role, userId: "u1" }, users)).toBeNull();
    }
  });

  it("el dentista ve solo su agenda", () => {
    expect(doctoresVisibles({ role: "dentist", userId: "u2" }, users)).toEqual(["u2"]);
  });

  it("el asistente ve la de sus doctores asignados, y ninguna si no tiene", () => {
    expect(doctoresVisibles({ role: "assistant", userId: "u3" }, users)).toEqual(["u2"]);
    expect(doctoresVisibles({ role: "assistant", userId: "u5" }, users)).toEqual([]);
  });

  it("veDoctor respeta el alcance", () => {
    expect(veDoctor(null, "u4")).toBe(true);
    expect(veDoctor(["u2"], "u2")).toBe(true);
    expect(veDoctor(["u2"], "u4")).toBe(false);
    expect(veDoctor(["u2"], undefined)).toBe(false);
  });
});

describe("pacientesVisibles", () => {
  it("sin alcance (null) se ven todos", () => {
    expect(pacientesVisibles(null, { appointments, budgets })).toBeNull();
    expect(vePaciente(null, "cualquiera")).toBe(true);
  });

  it("un paciente es del doctor si tiene una cita o un plan con él", () => {
    const v = pacientesVisibles(["u2"], { appointments, budgets });
    expect([...(v ?? [])].sort()).toEqual(["p1", "p3", "p4"]);
    expect(vePaciente(v, "p2")).toBe(false);
  });

  it("si lo atienden dos doctores, aparece para los dos", () => {
    expect(vePaciente(pacientesVisibles(["u2"], { appointments }), "p3")).toBe(true);
    expect(vePaciente(pacientesVisibles(["u4"], { appointments }), "p3")).toBe(true);
  });

  it("un asistente sin doctores no ve pacientes", () => {
    expect(pacientesVisibles([], { appointments, budgets })?.size).toBe(0);
  });
});

describe("tareas de gestión", () => {
  it("cobranza y cheques solo para quien ve plata; la captura, para quien gestiona presupuestos", () => {
    expect(tiposDeTareaVisibles("admin")).toEqual(["captura", "control", "cobranza", "cheque", "cita", "personalizada"]);
    expect(tiposDeTareaVisibles("cashier")).toContain("cobranza");
    for (const r of ["receptionist", "dentist", "assistant"] as const) {
      const tipos = tiposDeTareaVisibles(r);
      expect(tipos).not.toContain("cobranza");
      expect(tipos).not.toContain("cheque");
      expect(tipos).not.toContain("captura");
      expect(tipos).toEqual(["control", "cita", "personalizada"]);
    }
  });

  it("con alcance ve las asignadas, las que creó y las de sus pacientes", () => {
    const visibles = new Set(["p1"]);
    expect(veTarea({ patientId: "p1" }, "u2", visibles)).toBe(true);
    expect(veTarea({ patientId: "p2" }, "u2", visibles)).toBe(false);
    expect(veTarea({ patientId: "p2", assigneeId: "u2" }, "u2", visibles)).toBe(true);
    expect(veTarea({ createdBy: "u2" }, "u2", visibles)).toBe(true);
    expect(veTarea({}, "u2", visibles)).toBe(false);
    expect(veTarea({ patientId: "p2" }, "u1", null)).toBe(true);
  });
});
