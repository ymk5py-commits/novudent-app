import type { Role } from "./types";

/* Matriz de permisos exacta (sec. 2.2 del Documento Maestro) */
export type Permission =
  | "users.manage"
  | "practice.config"
  | "agenda.view"
  | "agenda.create"
  | "agenda.edit"
  | "emr.read"
  | "emr.write"
  | "billing.submit" // Enviar a Cobro / gestionar pagos y seguimiento
  | "billing.finalize" // Finalizar facturas (Release from Hold)
  | "billing.reports" // Ver reportes financieros
  | "engagement.forms"
  | "budgets.manage" // Presupuestos: crear/presentar/aceptar
  | "payments.manage" // Caja: pagos y arqueo
  | "expenses.manage" // Gastos de la clínica
  | "inventory.manage"; // Inventario / bodega

const MATRIX: Record<Permission, Role[]> = {
  "users.manage": ["admin"],
  "practice.config": ["admin"],
  "agenda.view": ["admin", "dentist", "assistant"],
  "agenda.create": ["admin", "dentist", "assistant"],
  "agenda.edit": ["admin", "dentist", "assistant"],
  "emr.read": ["admin", "dentist", "assistant"], // asistente: solo lectura
  "emr.write": ["admin", "dentist"],
  "billing.submit": ["admin", "assistant"], // dentista: denegado
  "billing.finalize": ["admin", "dentist"], // asistente: denegado (matriz v2)
  "billing.reports": ["admin", "assistant"], // dentista: denegado (matriz v2)
  "engagement.forms": ["admin", "assistant"], // dentista: denegado
  "budgets.manage": ["admin", "dentist", "assistant"],
  "payments.manage": ["admin", "assistant"], // caja: dentista no maneja dinero
  "expenses.manage": ["admin"],
  "inventory.manage": ["admin", "assistant"],
};

export function can(role: Role, p: Permission): boolean {
  return MATRIX[p].includes(role);
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  dentist: "Dentista",
  assistant: "Asistente",
};
