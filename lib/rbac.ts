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
  | "billing.submit"
  | "engagement.forms";

const MATRIX: Record<Permission, Role[]> = {
  "users.manage": ["admin"],
  "practice.config": ["admin"],
  "agenda.view": ["admin", "dentist", "assistant"],
  "agenda.create": ["admin", "dentist", "assistant"],
  "agenda.edit": ["admin", "dentist", "assistant"],
  "emr.read": ["admin", "dentist", "assistant"], // asistente: solo lectura
  "emr.write": ["admin", "dentist"],
  "billing.submit": ["admin", "assistant"], // dentista: denegado
  "engagement.forms": ["admin", "assistant"], // dentista: denegado
};

export function can(role: Role, p: Permission): boolean {
  return MATRIX[p].includes(role);
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  dentist: "Dentista",
  assistant: "Asistente",
};
