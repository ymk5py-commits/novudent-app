import { describe, it, expect } from "vitest";
import { can, ROLE_LABEL, type Permission } from "./rbac";

const ALL: Permission[] = [
  "users.manage", "practice.config", "agenda.view", "agenda.create", "agenda.edit",
  "emr.read", "emr.write", "billing.submit", "billing.finalize", "billing.reports",
  "engagement.forms", "budgets.manage", "payments.manage", "expenses.manage", "inventory.manage",
];

describe("can — matriz RBAC", () => {
  it("admin puede TODO", () => {
    for (const p of ALL) expect(can("admin", p)).toBe(true);
  });

  it("dentista: clínico sí, dinero/config NO", () => {
    // sí
    expect(can("dentist", "emr.write")).toBe(true);
    expect(can("dentist", "emr.read")).toBe(true);
    expect(can("dentist", "budgets.manage")).toBe(true);
    expect(can("dentist", "agenda.edit")).toBe(true);
    expect(can("dentist", "billing.finalize")).toBe(true);
    // no (no maneja dinero ni configura)
    expect(can("dentist", "payments.manage")).toBe(false);
    expect(can("dentist", "billing.submit")).toBe(false);
    expect(can("dentist", "billing.reports")).toBe(false);
    expect(can("dentist", "engagement.forms")).toBe(false);
    expect(can("dentist", "expenses.manage")).toBe(false);
    expect(can("dentist", "inventory.manage")).toBe(false);
    expect(can("dentist", "users.manage")).toBe(false);
    expect(can("dentist", "practice.config")).toBe(false);
  });

  it("asistente: administrativo sí, EMR solo lectura, finalizar/gastos/config NO", () => {
    // sí
    expect(can("assistant", "emr.read")).toBe(true);
    expect(can("assistant", "billing.submit")).toBe(true);
    expect(can("assistant", "billing.reports")).toBe(true);
    expect(can("assistant", "payments.manage")).toBe(true);
    expect(can("assistant", "inventory.manage")).toBe(true);
    expect(can("assistant", "engagement.forms")).toBe(true);
    expect(can("assistant", "budgets.manage")).toBe(true);
    // no
    expect(can("assistant", "emr.write")).toBe(false);
    expect(can("assistant", "billing.finalize")).toBe(false);
    expect(can("assistant", "expenses.manage")).toBe(false);
    expect(can("assistant", "users.manage")).toBe(false);
    expect(can("assistant", "practice.config")).toBe(false);
  });

  it("ROLE_LABEL cubre los 3 roles", () => {
    expect(ROLE_LABEL.admin).toBe("Administrador");
    expect(ROLE_LABEL.dentist).toBe("Dentista");
    expect(ROLE_LABEL.assistant).toBe("Asistente");
  });
});
