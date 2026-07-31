/** Motor de tareas automáticas de gestión.
 *
 *  Las tareas automáticas NO se guardan: se derivan del estado de la clínica en
 *  cada lectura. Eso hace que el auto-cierre sea implícito — si el paciente pagó,
 *  la condición "tiene saldo" deja de cumplirse y la tarea no se deriva más. No
 *  hay proceso que la cierre porque no hay nada que cerrar.
 *
 *  Módulo PURO: no importa React, ni Firestore, ni el store. Todo lo que necesita
 *  entra por parámetro y todo lo que produce sale por retorno. */
import type { Budget, MgmtTaskType, Payment, TaskDeadline, TaskDeadlines } from "./types";
import { budgetTotal } from "./budgets";

/** Plazos por defecto cuando la clínica no configuró los suyos. */
export const DEFAULT_DEADLINES: Required<TaskDeadlines> = {
  // Margen para que el pago entre por otra vía antes de salir a perseguirlo.
  cobranza: { kind: "dias", n: 7 },
  // El presupuesto se enfría rápido: a los 3 días ya hay que llamar.
  captura: { kind: "dias", n: 3 },
  // Control semestral, el estándar odontológico.
  control: { kind: "dias", n: 180 },
  // Una cita sin confirmar es trabajo de hoy.
  cita: { kind: "inmediato" },
};

export type AutoTaskType = Exclude<MgmtTaskType, "personalizada">;

/** Plazo efectivo de un tipo: lo que configuró la clínica, o el default. */
export function plazoDe(type: AutoTaskType, cfg: TaskDeadlines | undefined): TaskDeadline {
  return cfg?.[type] ?? DEFAULT_DEADLINES[type];
}

/** Fecha (YYYY-MM-DD) en que una tarea originada en `eventAt` pasa a estar vencida. */
export function calcularVencimiento(eventAt: string, plazo: TaskDeadline): string {
  const d = new Date(eventAt);
  if (plazo.kind === "dias") d.setUTCDate(d.getUTCDate() + plazo.n);
  return d.toISOString().slice(0, 10);
}

/** Saldo de TODOS los pacientes en dos pasadas (una por budgets, una por pagos).
 *
 *  Misma definición que `patientBalance` de lib/budgets.ts —presupuestos
 *  aceptados/completados menos pagos no anulados— pero calculada de una sola vez
 *  para todos. Llamar `patientBalance` por paciente sería O(P × (B + Pg)) y
 *  congelaría el render de la bandeja en una clínica con historia.
 *
 *  `lib/tareas.test.ts` tiene un test de equivalencia contra `patientBalance`
 *  que falla si las dos definiciones divergen. */
export function mapaDeSaldos(budgets: Budget[], payments: Payment[]): Map<string, number> {
  const saldo = new Map<string, number>();
  for (const b of budgets) {
    if (b.status !== "aceptado" && b.status !== "completado") continue;
    saldo.set(b.patientId, (saldo.get(b.patientId) ?? 0) + budgetTotal(b));
  }
  for (const p of payments) {
    if (p.voidedAt) continue;
    saldo.set(p.patientId, (saldo.get(p.patientId) ?? 0) - p.amount);
  }
  return saldo;
}
