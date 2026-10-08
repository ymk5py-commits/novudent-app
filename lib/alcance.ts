import { can } from "./rbac";
import type { MgmtTask, MgmtTaskType, RolId, User } from "./types";

/* Alcance por profesional (roles v3): la matriz de lib/rbac.ts dice QUÉ puede hacer
 * cada rol; esto dice SOBRE QUIÉN. Dentista y asistente de doctores trabajan sobre
 * sus propios doctores y sus pacientes; el resto de los roles ve toda la clínica. */

type Quien = { role: RolId; userId: string };

/** Los profesionales cuya agenda y planes ve este usuario. `null` = todos. */
export function doctoresVisibles(quien: Quien, users: Pick<User, "id" | "asiste">[]): string[] | null {
  if (can(quien.role, "agenda.all")) return null;
  if (quien.role === "dentist") return [quien.userId];
  if (quien.role === "assistant") return users.find((u) => u.id === quien.userId)?.asiste ?? [];
  return [];
}

/** ¿Este usuario ve la agenda o el plan del profesional `dentistId`? */
export function veDoctor(doctores: string[] | null, dentistId: string | undefined): boolean {
  return doctores === null || (!!dentistId && doctores.includes(dentistId));
}

type ConDoctor = { patientId: string; dentistId?: string };

/** Los pacientes que ve este usuario. `null` = todos. Un paciente es de un doctor
 *  cuando tiene una cita o un plan (presupuesto) con él; si lo atienden dos
 *  doctores, aparece para los dos. */
export function pacientesVisibles(
  doctores: string[] | null,
  fuentes: { appointments: ConDoctor[]; budgets?: ConDoctor[] },
): Set<string> | null {
  if (doctores === null) return null;
  const visibles = new Set<string>();
  for (const x of [...fuentes.appointments, ...(fuentes.budgets ?? [])]) {
    if (x.dentistId && doctores.includes(x.dentistId)) visibles.add(x.patientId);
  }
  return visibles;
}

/** ¿Ve al paciente `patientId`? */
export function vePaciente(visibles: Set<string> | null, patientId: string): boolean {
  return visibles === null || visibles.has(patientId);
}

const TIPOS_TAREA: MgmtTaskType[] = ["captura", "control", "cobranza", "cheque", "cita", "personalizada"];

/** Tipos de tarea de gestión que ve cada rol: cobranza y cheques son plata, y la
 *  captura (presupuesto presentado sin aceptar) es de quien gestiona presupuestos. */
export function tiposDeTareaVisibles(role: RolId): MgmtTaskType[] {
  return TIPOS_TAREA.filter((t) => {
    if (t === "cobranza" || t === "cheque") return can(role, "money.view");
    if (t === "captura") return can(role, "budgets.manage");
    return true;
  });
}

/** ¿Ve esta tarea? Sin alcance (`visibles` null) ve todas; con alcance, las que
 *  tiene asignadas, las que creó y las de sus pacientes. */
export function veTarea(
  t: Pick<MgmtTask, "assigneeId" | "createdBy" | "patientId">,
  userId: string,
  visibles: Set<string> | null,
): boolean {
  if (visibles === null) return true;
  return t.assigneeId === userId || t.createdBy === userId || (!!t.patientId && visibles.has(t.patientId));
}
