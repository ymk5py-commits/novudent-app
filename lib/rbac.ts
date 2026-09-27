import type { Role } from "./types";

/* Matriz de permisos (sec. 2.2 del Documento Maestro), roles v3 del 27/9/2026:
 * - la recepción se separa de la caja: Recepcionista agenda y carga pacientes sin
 *   ver montos; «Recepción y caja» además cobra y hace el arqueo;
 * - Dentista y «Asistente de doctores» quedan con lo clínico: su agenda, sus planes
 *   (sin montos) y la ficha de sus pacientes, sin datos personales.
 * El alcance fino (qué agenda y qué pacientes ve cada uno) está en lib/alcance.ts. */
export type Permission =
  | "users.manage"
  | "practice.config"
  | "agenda.view"
  | "agenda.create"
  | "agenda.edit"
  | "agenda.all" // Ver y agendar en la agenda de TODOS los profesionales
  | "patients.personal" // Ver y editar datos personales: teléfono, correo, documento, convenio, origen
  | "emr.read"
  | "emr.write"
  | "plans.view" // Ver planes de tratamiento (con montos solo si además tiene money.view)
  | "plans.create" // Armar planes de tratamiento desde la ficha (sin montos si no tiene money.view)
  | "money.view" // Ver montos: precios, presupuestos, deudas, saldos y totales
  | "billing.submit" // Enviar a Cobro / gestionar pagos y seguimiento
  | "billing.finalize" // Finalizar facturas (Release from Hold)
  | "billing.reports" // Ver reportes financieros
  | "engagement.forms" // CRM, consentimientos y formularios del paciente
  | "tasks.use" // Tareas del equipo
  | "budgets.manage" // Presupuestos: crear/presentar/aceptar
  | "payments.manage" // Caja: pagos y arqueo
  | "expenses.manage" // Gastos de la clínica
  | "inventory.manage" // Inventario / bodega
  | "labs.manage"; // Órdenes de laboratorio (muestran costos)

/** Orden en que se listan los roles (tablas, selectores). */
export const ROLES: Role[] = ["admin", "cashier", "receptionist", "dentist", "assistant"];

const MATRIX: Record<Permission, Role[]> = {
  "users.manage": ["admin"],
  "practice.config": ["admin"],
  // Todos usan la agenda; dentista y asistente, solo la suya o la de sus doctores.
  "agenda.view": ROLES,
  "agenda.create": ROLES,
  "agenda.edit": ROLES,
  "agenda.all": ["admin", "cashier", "receptionist"],
  "patients.personal": ["admin", "cashier", "receptionist"],
  "emr.read": ["admin", "dentist", "assistant"], // asistente: solo lectura
  "emr.write": ["admin", "dentist"],
  "plans.view": ["admin", "dentist", "assistant"],
  "plans.create": ["admin", "dentist"],
  // La plata queda en administración y en la caja: ni la recepción ni lo clínico ven montos.
  "money.view": ["admin", "cashier"],
  "billing.submit": ["admin", "cashier"],
  "billing.finalize": ["admin"],
  // Números del NEGOCIO (ingresos, producción, análisis, liquidaciones): solo el
  // dueño. La caja cobra y hace el arqueo (payments.manage) pero no ve la
  // facturación global ni cuánto gana cada profesional.
  "billing.reports": ["admin"],
  "engagement.forms": ["admin", "cashier", "receptionist"],
  "tasks.use": ROLES,
  "budgets.manage": ["admin", "cashier"],
  "payments.manage": ["admin", "cashier"],
  "expenses.manage": ["admin"],
  "inventory.manage": ["admin"],
  "labs.manage": ["admin"],
};

export function can(role: Role, p: Permission): boolean {
  return MATRIX[p].includes(role);
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  cashier: "Recepción y caja",
  receptionist: "Recepcionista",
  dentist: "Dentista",
  assistant: "Asistente de doctores",
};

/** Una línea por rol para el selector de Usuarios y el inicio. */
export const ROLE_DESCRIPCION: Record<Role, string> = {
  admin: "Acceso completo, incluida la configuración de la clínica.",
  cashier: "Agenda de todos, datos del paciente, cobros y arqueo de caja. No ve reportes del negocio.",
  receptionist: "Agenda de todos y datos del paciente para cargarlos o editarlos. No ve montos ni la ficha clínica.",
  dentist: "Su agenda, sus planes de tratamiento y la ficha clínica de sus pacientes. No ve montos ni datos personales.",
  assistant: "La agenda, los planes y la ficha de los doctores que tenga asignados, en solo lectura. No ve montos ni datos personales.",
};
