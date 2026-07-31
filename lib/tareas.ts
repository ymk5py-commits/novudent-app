/** Motor de tareas automáticas de gestión.
 *
 *  Las tareas automáticas NO se guardan: se derivan del estado de la clínica en
 *  cada lectura. Eso hace que el auto-cierre sea implícito — si el paciente pagó,
 *  la condición "tiene saldo" deja de cumplirse y la tarea no se deriva más. No
 *  hay proceso que la cierre porque no hay nada que cerrar.
 *
 *  Módulo PURO: no importa React, ni Firestore, ni el store. Todo lo que necesita
 *  entra por parámetro y todo lo que produce sale por retorno. */
import type { Appointment, Budget, MgmtTaskType, Patient, Payment, TaskDeadline, TaskDeadlines } from "./types";
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

/** Ventana de anticipación de la regla `cita`: una cita sin confirmar entra a la
 *  bandeja este número de días antes. Dos días es lo que da margen a llamar y,
 *  si el paciente no puede, liberar el turno a tiempo. */
export const VENTANA_CITA_DIAS = 2;

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

/** Una tarea automática recién derivada. Todavía no pasó por los overrides. */
export interface DerivedTask {
  /** Clave determinística `${tipo}:${idDeLaEntidad}`. Es lo que permite que una
   *  decisión humana se pegue a una tarea que no existe como fila. */
  derivedKey: string;
  type: AutoTaskType;
  patientId: string;
  title: string;
  detail?: string;
  budgetId?: string;
  /** Fecha del hecho que originó la tarea (ISO). */
  eventAt: string;
  /** eventAt + plazo (YYYY-MM-DD). Antes de esta fecha la tarea no vence. */
  dueDate: string;
}

/** Lo mínimo que necesitan las reglas. Se pasa un objeto plano y no el `DB`
 *  entero para poder testear el motor sin construir una base completa. */
export interface TareasInput {
  patients: Patient[];
  budgets: Budget[];
  payments: Payment[];
  appointments: Appointment[];
  deadlines?: TaskDeadlines;
}

/** Formatea un monto en guaraníes sin decimales (PYG es zero-decimal). */
function gs(n: number): string {
  return `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
}

export function derivarTareas(input: TareasInput, hoy: string): DerivedTask[] {
  const { patients, budgets, payments, appointments, deadlines } = input;
  const out: DerivedTask[] = [];
  const saldos = mapaDeSaldos(budgets, payments);

  // Agrupaciones en una pasada. Sin esto, cada regla recorrería budgets y
  // appointments COMPLETOS por cada paciente: el mismo O(P × N) que motivó
  // `mapaDeSaldos`, reintroducido por la puerta de atrás.
  const budgetsPorPaciente = new Map<string, Budget[]>();
  for (const b of budgets) {
    const arr = budgetsPorPaciente.get(b.patientId);
    if (arr) arr.push(b); else budgetsPorPaciente.set(b.patientId, [b]);
  }
  const citasPorPaciente = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const arr = citasPorPaciente.get(a.patientId);
    if (arr) arr.push(a); else citasPorPaciente.set(a.patientId, [a]);
  }

  // ── cobranza: una por paciente con saldo pendiente ──────────────────────
  const plazoCobranza = plazoDe("cobranza", deadlines);
  for (const p of patients) {
    const saldo = saldos.get(p.id) ?? 0;
    if (saldo <= 0) continue;
    // El evento es el presupuesto con saldo más antiguo: la deuda "nació" ahí.
    const desde = (budgetsPorPaciente.get(p.id) ?? [])
      .filter((b) => b.status === "aceptado" || b.status === "completado")
      .map((b) => b.createdAt)
      .sort()[0];
    if (!desde) continue;
    out.push({
      derivedKey: `cobranza:${p.id}`,
      type: "cobranza",
      patientId: p.id,
      title: "Saldo pendiente de pago",
      detail: gs(saldo),
      eventAt: desde,
      dueDate: calcularVencimiento(desde, plazoCobranza),
    });
  }

  // ── captura: una por presupuesto presentado que no avanzó ───────────────
  const plazoCaptura = plazoDe("captura", deadlines);
  for (const b of budgets) {
    if (b.status !== "presentado") continue;
    out.push({
      derivedKey: `captura:${b.id}`,
      type: "captura",
      patientId: b.patientId,
      title: "Presupuesto presentado sin aceptar",
      detail: b.name ?? "Presupuesto",
      budgetId: b.id,
      eventAt: b.createdAt,
      dueDate: calcularVencimiento(b.createdAt, plazoCaptura),
    });
  }

  // ── control: una POR PACIENTE con tratamiento terminado y sin próxima visita ──
  const plazoControl = plazoDe("control", deadlines);
  for (const p of patients) {
    // Continue barato primero: sin presupuestos no hay nada que ordenar ni revisar.
    const budgetsDelPaciente = budgetsPorPaciente.get(p.id);
    if (!budgetsDelPaciente) continue;

    const completados = budgetsDelPaciente
      .filter((b) => b.status === "completado")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (completados.length === 0) continue;

    const citasDelPaciente = citasPorPaciente.get(p.id) ?? [];
    const tieneCitaFutura = citasDelPaciente.some(
      (a) => a.start.slice(0, 10) > hoy && a.status !== "cancelada",
    );
    if (tieneCitaFutura) continue;

    // El evento es la última atención real; si nunca vino, el fin del tratamiento.
    const ultimaAtencion = citasDelPaciente
      .filter((a) => a.status === "completada")
      .map((a) => a.start)
      .sort()
      .pop();
    const eventAt = ultimaAtencion ?? completados[completados.length - 1].createdAt;

    out.push({
      derivedKey: `control:${p.id}`,
      type: "control",
      patientId: p.id,
      title: "Control post-tratamiento",
      detail: "Tratamiento finalizado — agendar control.",
      budgetId: completados[completados.length - 1].id,
      eventAt,
      dueDate: calcularVencimiento(eventAt, plazoControl),
    });
  }

  // ── cita: una por cita próxima sin confirmar ────────────────────────────
  const plazoCita = plazoDe("cita", deadlines);
  const limite = new Date(hoy);
  limite.setUTCDate(limite.getUTCDate() + VENTANA_CITA_DIAS);
  const hasta = limite.toISOString().slice(0, 10);
  for (const a of appointments) {
    if (a.status !== "pendiente") continue;
    const dia = a.start.slice(0, 10);
    if (dia < hoy || dia > hasta) continue;
    out.push({
      derivedKey: `cita:${a.id}`,
      type: "cita",
      patientId: a.patientId,
      title: "Cita sin confirmar",
      detail: a.title,
      eventAt: hoy,
      dueDate: calcularVencimiento(hoy, plazoCita),
    });
  }

  return out;
}
