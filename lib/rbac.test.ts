import { describe, it, expect } from "vitest";
import { can, ROLES, ROLE_LABEL, ROLE_DESCRIPCION, type Permission } from "./rbac";

const ALL: Permission[] = [
  "users.manage", "practice.config", "agenda.view", "agenda.create", "agenda.edit", "agenda.all",
  "patients.personal", "emr.read", "emr.write", "plans.view", "plans.create", "money.view", "billing.submit",
  "billing.finalize", "billing.reports", "engagement.forms", "tasks.use", "budgets.manage",
  "payments.manage", "expenses.manage", "inventory.manage", "labs.manage",
];
const PLATA: Permission[] = ["money.view", "payments.manage", "billing.submit", "billing.finalize", "budgets.manage"];

describe("can — matriz RBAC (roles v3)", () => {
  it("admin puede TODO", () => {
    for (const p of ALL) expect(can("admin", p)).toBe(true);
  });

  it("los cinco roles tienen nombre y descripción", () => {
    expect(ROLES).toEqual(["admin", "cashier", "receptionist", "dentist", "assistant"]);
    expect(ROLE_LABEL.admin).toBe("Administrador");
    expect(ROLE_LABEL.cashier).toBe("Recepción y caja");
    expect(ROLE_LABEL.receptionist).toBe("Recepcionista");
    expect(ROLE_LABEL.dentist).toBe("Dentista");
    expect(ROLE_LABEL.assistant).toBe("Asistente de doctores");
    for (const r of ROLES) expect(ROLE_DESCRIPCION[r].length).toBeGreaterThan(20);
  });

  it("todos ven la agenda y usan las tareas", () => {
    for (const r of ROLES) {
      expect(can(r, "agenda.view")).toBe(true);
      expect(can(r, "tasks.use")).toBe(true);
    }
  });

  it("solo la recepción, la caja y el admin dan o cambian citas: lo clínico ve la agenda en lectura", () => {
    for (const r of ROLES) {
      const recepcion = r === "admin" || r === "cashier" || r === "receptionist";
      expect(can(r, "agenda.create")).toBe(recepcion);
      expect(can(r, "agenda.edit")).toBe(recepcion);
    }
  });
});

describe("recepción: agenda de todos y datos del paciente, sin plata", () => {
  it("la recepcionista ve la agenda de todos y carga los datos personales", () => {
    expect(can("receptionist", "agenda.all")).toBe(true);
    expect(can("receptionist", "patients.personal")).toBe(true);
    expect(can("receptionist", "engagement.forms")).toBe(true);
  });

  it("la recepcionista no ve montos ni la ficha clínica, pero sí los tratamientos (sin montos)", () => {
    for (const p of PLATA) expect(can("receptionist", p)).toBe(false);
    expect(can("receptionist", "emr.read")).toBe(false);
    expect(can("receptionist", "plans.view")).toBe(true);
    expect(can("receptionist", "plans.create")).toBe(false);
  });

  it("«Recepción y caja» es la recepcionista más el cobro y el arqueo", () => {
    for (const p of ALL) if (can("receptionist", p)) expect(can("cashier", p)).toBe(true);
    expect(can("cashier", "money.view")).toBe(true);
    expect(can("cashier", "payments.manage")).toBe(true);
    expect(can("cashier", "billing.submit")).toBe(true);
    expect(can("cashier", "budgets.manage")).toBe(true);
  });
});

describe("lo clínico: dentista y asistente de doctores, sin plata ni datos personales", () => {
  it("el dentista escribe la ficha, ve sus planes y los arma", () => {
    expect(can("dentist", "plans.create")).toBe(true);
    expect(can("dentist", "emr.read")).toBe(true);
    expect(can("dentist", "emr.write")).toBe(true);
    expect(can("dentist", "plans.view")).toBe(true);
  });

  it("el asistente de doctores lee la ficha y los planes, sin escribir", () => {
    expect(can("assistant", "emr.read")).toBe(true);
    expect(can("assistant", "plans.view")).toBe(true);
    expect(can("assistant", "emr.write")).toBe(false);
    expect(can("assistant", "plans.create")).toBe(false);
  });

  it("ninguno de los dos ve montos, datos personales ni la agenda de todos", () => {
    for (const r of ["dentist", "assistant"] as const) {
      for (const p of PLATA) expect(can(r, p)).toBe(false);
      expect(can(r, "patients.personal")).toBe(false);
      expect(can(r, "agenda.all")).toBe(false);
      expect(can(r, "engagement.forms")).toBe(false);
      expect(can(r, "inventory.manage")).toBe(false);
      expect(can(r, "labs.manage")).toBe(false);
    }
  });
});

describe("números del negocio — solo el dueño", () => {
  it("reportes, gastos, inventario, laboratorios y configuración son del admin", () => {
    for (const p of ["billing.reports", "expenses.manage", "inventory.manage", "labs.manage", "users.manage", "practice.config"] as const) {
      for (const r of ROLES) expect(can(r, p)).toBe(r === "admin");
    }
  });
});
