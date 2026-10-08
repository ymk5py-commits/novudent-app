/** Motor de tareas automáticas de gestión.
 *
 *  Las tareas automáticas NO se guardan: se derivan del estado de la clínica en
 *  cada lectura. Eso hace que el auto-cierre sea implícito — si el paciente pagó,
 *  la condición "tiene saldo" deja de cumplirse y la tarea no se deriva más. No
 *  hay proceso que la cierre porque no hay nada que cerrar.
 *
 *  Módulo PURO: no importa React, ni Firestore, ni el store. Todo lo que necesita
 *  entra por parámetro y todo lo que produce sale por retorno. */
import type { Appointment, AutoCierre, Budget, MgmtTask, MgmtTaskType, Patient, Payment, TaskAccion, TaskDeadline, TaskDeadlines, TaskGestion } from "./types";
import { budgetTotal, checkStatus } from "./budgets";

/** Plazos por defecto cuando la clínica no configuró los suyos. */
export const DEFAULT_DEADLINES: Required<TaskDeadlines> = {
  // Margen para que el pago entre por otra vía antes de salir a perseguirlo.
  cobranza: { kind: "dias", n: 7 },
  // El presupuesto se enfría rápido: a los 3 días ya hay que llamar.
  captura: { kind: "dias", n: 3 },
  // Control semestral, el estándar odontológico.
  control: { kind: "dias", n: 180 },
  // Una cita que no se hizo (cancelada o ausente) se re-agenda en el día.
  cita: { kind: "inmediato" },
};

// Los 4 con vencimiento configurable ("evento + plazo"). Mismo conjunto que las
// claves de TaskDeadlines — se nombra aparte para que la firma de plazoDe()
// quede explícita y no dependa de un keyof indirecto.
export type PlazoTaskType = "cita" | "captura" | "control" | "cobranza";
export type AutoTaskType = PlazoTaskType | "cheque";

/** Ventana de anticipación de la regla "cita sin confirmar": una cita pendiente
 *  entra a la bandeja este número de días antes. Dos días es lo que da margen a
 *  llamar y, si el paciente no puede, liberar el turno a tiempo. */
export const VENTANA_CITA_DIAS = 2;

/** Ventana de la regla de re-agenda (la "tarea de cita" de Dentalink): una cita
 *  cancelada o ausente de hace más de esto ya no abre tarea. Mismo motivo que
 *  VENTANA_CONTROL_MESES: una clínica que importa su historia no puede abrir la
 *  bandeja con una tarea por cada paciente que faltó alguna vez. Seis meses y no
 *  doce porque re-agendar a quien faltó hace un año ya no es re-agendar. */
export const VENTANA_REAGENDAR_MESES = 6;

/** Ventana de recencia de la regla `control`: no se persigue a quien terminó su
 *  tratamiento hace más de esto. Sin el corte, una clínica que migra su historia
 *  entera abre la bandeja el primer día con una tarea vencida por cada paciente
 *  que pasó alguna vez — y una bandeja con mil atrasadas no se mira nunca. */
export const VENTANA_CONTROL_MESES = 12;

/** Plazo efectivo de un tipo: lo que configuró la clínica, o el default.
 *  El parámetro es PlazoTaskType, no AutoTaskType: pasarle "cheque" acá tiene
 *  que ser un error de compilación. Es lo que impide cablear por error la
 *  regla de cheque a través de un mecanismo de plazos que no le corresponde —
 *  su vencimiento es una fecha absoluta (cashDate), no evento+plazo. */
export function plazoDe(type: PlazoTaskType, cfg: TaskDeadlines | undefined): TaskDeadline {
  return cfg?.[type] ?? DEFAULT_DEADLINES[type];
}

/** Fecha (YYYY-MM-DD) en que una tarea originada en `eventAt` pasa a estar vencida. */
export function calcularVencimiento(eventAt: string, plazo: TaskDeadline): string {
  const d = new Date(eventAt);
  if (plazo.kind === "dias") d.setUTCDate(d.getUTCDate() + plazo.n);
  return d.toISOString().slice(0, 10);
}

/* ─── Configuración de plazos (los botones de Dentalink) ─────────────────── */

/** Los botones de la configuración de plazos, en el orden de Dentalink. Lo que
 *  no sea uno de estos es "otro" (N días). "1 mes" y "1 año" son 30 y 365 días:
 *  el plazo se guarda en días, no en meses calendario. */
export const PLAZOS_RAPIDOS: { label: string; dias: number }[] = [
  { label: "Inmediato", dias: 0 },
  { label: "1 día", dias: 1 },
  { label: "1 semana", dias: 7 },
  { label: "1 mes", dias: 30 },
  { label: "1 año", dias: 365 },
];

/** Tope de "otro": diez años. Más que eso es un error de tipeo, no un plazo. */
export const PLAZO_MAX_DIAS = 3650;

export function diasDePlazo(p: TaskDeadline): number {
  return p.kind === "inmediato" ? 0 : p.n;
}

/** Días → plazo. 0 (o basura) es "inmediato"; se redondea y se topa, porque lo
 *  escribe una persona en el campo "otro". */
export function plazoDeDias(n: number): TaskDeadline {
  const d = Number.isFinite(n) ? Math.min(PLAZO_MAX_DIAS, Math.max(0, Math.round(n))) : 0;
  return d === 0 ? { kind: "inmediato" } : { kind: "dias", n: d };
}

/** Qué botón queda marcado para un plazo: el rápido que coincide, u "otro". */
export function opcionDePlazo(p: TaskDeadline): number | "otro" {
  const d = diasDePlazo(p);
  return PLAZOS_RAPIDOS.some((x) => x.dias === d) ? d : "otro";
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

/** ¿El presupuesto ya empezó? Es la definición de Dentalink de "capturado": tiene
 *  un abono recibido o una prestación realizada. Un presupuesto así no necesita
 *  que lo llamen para capturarlo aunque nadie lo haya marcado aceptado. */
export function presupuestoIniciado(b: Pick<Budget, "id" | "items">, payments: Pick<Payment, "budgetId" | "voidedAt">[]): boolean {
  return b.items.some((i) => i.status === "realizado") || payments.some((p) => !p.voidedAt && p.budgetId === b.id);
}

/** Una tarea automática recién derivada. Todavía no pasó por los overrides. */
export interface DerivedTask {
  /** Clave determinística `${tipo}:${idDeLaEntidad}`. Es lo que permite que una
   *  decisión humana se pegue a una tarea que no existe como fila. */
  derivedKey: string;
  /** Identifica ESTA instancia de la condición, no el casillero.
   *  `derivedKey` se reusa toda la vida del paciente (`cobranza:p1`), así que un
   *  cierre humano atado solo a la clave enterraría la regla para siempre: el
   *  paciente firma un plan nuevo, no paga, y la tarea nunca vuelve a aparecer.
   *  El cierre se guarda contra esta instancia y deja de aplicar cuando cambia. */
  instanceKey: string;
  type: AutoTaskType;
  patientId: string;
  title: string;
  detail?: string;
  /** Monto CRUDO, sin formato. El motor es puro y la app maneja 17 monedas
   *  (`lib/currency.ts`): si acá se armara el texto, una clínica de Colombia
   *  vería "Gs." sobre pesos y con USD el redondeo se comería los centavos.
   *  Formatea la página, que es la que sabe cuál es la moneda activa. */
  amount?: number;
  budgetId?: string;
  /** La cita de la que habla la tarea (reglas de cita). */
  appointmentId?: string;
  /** El profesional de la tarea —el del plan o el de la cita—, que la bandeja
   *  muestra debajo del nombre del paciente, como Dentalink. */
  professionalId?: string;
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

const porFechaDeAlta = (a: Budget, b: Budget) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

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
  const budgetsConPago = new Set<string>();
  for (const p of payments) if (!p.voidedAt && p.budgetId) budgetsConPago.add(p.budgetId);
  const dentistaDelPlan = new Map(budgets.map((b) => [b.id, b.dentistId]));

  // ── cobranza: una por paciente con saldo pendiente ──────────────────────
  const plazoCobranza = plazoDe("cobranza", deadlines);
  for (const p of patients) {
    const saldo = saldos.get(p.id) ?? 0;
    if (saldo <= 0) continue;
    // El evento es el presupuesto con saldo más antiguo: la deuda "nació" ahí.
    const origen = (budgetsPorPaciente.get(p.id) ?? [])
      .filter((b) => b.status === "aceptado" || b.status === "completado")
      .sort(porFechaDeAlta)[0];
    if (!origen) continue;
    const desde = origen.createdAt;
    out.push({
      derivedKey: `cobranza:${p.id}`,
      // Si la deuda cambió —creció, o pagó una parte— es otra situación y
      // merece otra mirada, aunque alguien haya cerrado la anterior.
      instanceKey: String(saldo),
      type: "cobranza",
      patientId: p.id,
      title: "Saldo pendiente de pago",
      amount: saldo,
      professionalId: origen.dentistId,
      eventAt: desde,
      dueDate: calcularVencimiento(desde, plazoCobranza),
    });
  }

  // ── captura: una por presupuesto presentado que no empezó ni se pagó ────
  const plazoCaptura = plazoDe("captura", deadlines);
  for (const b of budgets) {
    if (b.status !== "presentado") continue;
    // Dentalink: "presupuesto no empezado ni pagado". Con un abono o una
    // prestación hecha ya está capturado aunque siga figurando "presentado".
    if (budgetsConPago.has(b.id) || b.items.some((i) => i.status === "realizado")) continue;
    out.push({
      derivedKey: `captura:${b.id}`,
      // La clave ya es única por presupuesto: la instancia es trivialmente estable.
      instanceKey: b.id,
      type: "captura",
      patientId: b.patientId,
      title: "Presupuesto presentado sin aceptar",
      detail: b.name ?? "Presupuesto",
      budgetId: b.id,
      professionalId: b.dentistId,
      eventAt: b.createdAt,
      dueDate: calcularVencimiento(b.createdAt, plazoCaptura),
    });
  }

  // ── control: una POR PACIENTE con tratamiento terminado y sin próxima visita ──
  const plazoControl = plazoDe("control", deadlines);
  const corte = new Date(hoy);
  corte.setUTCMonth(corte.getUTCMonth() - VENTANA_CONTROL_MESES);
  const controlDesde = corte.toISOString().slice(0, 10);
  for (const p of patients) {
    // Continue barato primero: sin presupuestos no hay nada que ordenar ni revisar.
    const budgetsDelPaciente = budgetsPorPaciente.get(p.id);
    if (!budgetsDelPaciente) continue;

    const completados = budgetsDelPaciente
      .filter((b) => b.status === "completado")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (completados.length === 0) continue;

    const citasDelPaciente = citasPorPaciente.get(p.id) ?? [];
    // `>=`, no `>`: la cita de hoy todavía no pasó, y la regla `cita` también
    // cuenta el día de hoy. Con `>` estricto, al paciente que viene esta tarde
    // se le abría igual un "Control post-tratamiento".
    const tieneCitaFutura = citasDelPaciente.some(
      (a) => a.start.slice(0, 10) >= hoy && a.status !== "cancelada",
    );
    if (tieneCitaFutura) continue;

    // El evento es la última atención real; si nunca vino, el fin del tratamiento.
    const ultimaAtencion = citasDelPaciente
      .filter((a) => a.status === "completada")
      .map((a) => a.start)
      .sort()
      .pop();
    const eventAt = ultimaAtencion ?? completados[completados.length - 1].createdAt;
    // Fuera de la ventana no se persigue: a quien terminó hace años ya no se lo
    // llama "para el control", y su tarea solo taparía las que sí importan.
    if (eventAt.slice(0, 10) < controlDesde) continue;

    out.push({
      derivedKey: `control:${p.id}`,
      // Un tratamiento terminado DESPUÉS mueve el evento y reabre el control:
      // el cierre viejo se refería a la atención anterior, no a esta.
      instanceKey: eventAt,
      type: "control",
      patientId: p.id,
      title: "Control post-tratamiento",
      detail: "Tratamiento finalizado — agendar control.",
      budgetId: completados[completados.length - 1].id,
      professionalId: completados[completados.length - 1].dentistId,
      eventAt,
      dueDate: calcularVencimiento(eventAt, plazoControl),
    });
  }

  // ── cita (la de Dentalink): la última cita del paciente quedó cancelada o
  //    ausente y no tiene ninguna cita futura. Una por paciente: la de su
  //    última cita, no una por cada vez que faltó. ──────────────────────────
  const plazoCita = plazoDe("cita", deadlines);
  const corteCita = new Date(hoy);
  corteCita.setUTCMonth(corteCita.getUTCMonth() - VENTANA_REAGENDAR_MESES);
  const reagendarDesde = corteCita.toISOString().slice(0, 10);
  for (const p of patients) {
    const citas = citasPorPaciente.get(p.id);
    if (!citas) continue;
    // Mismo criterio de "cita futura" que control (`>=`: la de hoy cuenta),
    // pero una cita futura cancelada o ausente no es una próxima visita.
    if (citas.some((a) => a.start.slice(0, 10) >= hoy && a.status !== "cancelada" && a.status !== "ausente")) continue;
    let ultima: Appointment | undefined;
    for (const a of citas) if (!ultima || a.start > ultima.start || (a.start === ultima.start && a.id > ultima.id)) ultima = a;
    if (!ultima || (ultima.status !== "cancelada" && ultima.status !== "ausente")) continue;
    if (ultima.start.slice(0, 10) < reagendarDesde) continue;
    out.push({
      // Por cita y no por paciente: si agenda y vuelve a faltar, es otra tarea
      // (con su propio responsable y su propio cierre), no la de antes.
      derivedKey: `cita:${ultima.id}`,
      // El estado va en la instancia: si la cita pendiente tenía una tarea de
      // confirmación cerrada, ese cierre no puede enterrar la de re-agenda.
      instanceKey: `${ultima.status}:${ultima.id}`,
      type: "cita",
      patientId: p.id,
      title: ultima.status === "ausente" ? "Faltó a su cita" : "Cita cancelada sin reagendar",
      detail: ultima.title,
      budgetId: ultima.budgetId,
      appointmentId: ultima.id,
      professionalId: ultima.dentistId,
      // "Luego de cuánto tiempo de que la cita no se ejecutó": el evento es el
      // día de la cita. No guardamos cuándo se cambió el estado.
      eventAt: ultima.start,
      dueDate: calcularVencimiento(ultima.start, plazoCita),
    });
  }

  // ── cita sin confirmar (extra de Novudent): una por cita próxima pendiente ──
  // No usa el plazo configurable: ese plazo es el de la re-agenda, y con "1
  // semana" la llamada para confirmar llegaría después de la cita.
  const limite = new Date(hoy);
  limite.setUTCDate(limite.getUTCDate() + VENTANA_CITA_DIAS);
  const hasta = limite.toISOString().slice(0, 10);
  for (const a of appointments) {
    if (a.status !== "pendiente") continue;
    const dia = a.start.slice(0, 10);
    if (dia < hoy || dia > hasta) continue;
    out.push({
      derivedKey: `cita:${a.id}`,
      // Ídem captura: una clave por cita, así que la instancia no se mueve.
      instanceKey: a.id,
      type: "cita",
      patientId: a.patientId,
      title: "Cita sin confirmar",
      detail: a.title,
      budgetId: a.budgetId,
      appointmentId: a.id,
      professionalId: a.dentistId,
      eventAt: hoy,
      dueDate: hoy,
    });
  }

  // ── cheque: uno por cheque recibido y todavía no resuelto ───────────────
  // Cada cheque es su propio Payment: la clave ya es única por instancia, así
  // que —a diferencia de cobranza/control— acá no hace falta indexar por
  // paciente ni colapsar varios en una sola tarea.
  for (const p of payments) {
    if (p.method !== "cheque" || !p.check) continue;
    if (checkStatus(p) !== "pendiente") continue;
    out.push({
      derivedKey: `cheque:${p.id}`,
      instanceKey: p.id,
      type: "cheque",
      patientId: p.patientId,
      title: "Cheque por cobrar",
      detail: `${p.check.bank} · N° ${p.check.number}`,
      amount: p.amount,
      budgetId: p.budgetId,
      professionalId: p.budgetId ? dentistaDelPlan.get(p.budgetId) : undefined,
      eventAt: p.date,
      // No pasa por plazoDe/calcularVencimiento: la fecha de cobro YA es la
      // fecha de vencimiento, no hay plazo que sumarle a un evento.
      dueDate: p.check.cashDate,
    });
  }

  return out;
}

/** Una fila de la bandeja: un `MgmtTask` más lo que solo existe en memoria.
 *
 *  Estos campos NO se persisten —son de la derivada, que no es un doc— y por
 *  eso viven acá y no en `MgmtTask`: si estuvieran en el tipo guardado,
 *  cualquier `{...t}` los escribiría en Firestore como basura. */
export interface TaskRow extends MgmtTask {
  /** Instancia de la condición de la derivada (ver `DerivedTask.instanceKey`).
   *  La UI lo necesita para saber CONTRA QUÉ está cerrando. */
  instanceKey?: string;
  /** Id del doc del override, cuando existe. Es lo que hay que actualizar para
   *  cambiar la decisión humana — nunca el `id` de la fila, que es sintético. */
  overrideId?: string;
  /** Monto crudo de la derivada (ver `DerivedTask.amount`). Lo formatea la
   *  página con `fmtGs`, que es la que conoce la moneda de la clínica. */
  amount?: number;
  /** Ver `DerivedTask.professionalId` / `appointmentId`. */
  professionalId?: string;
  appointmentId?: string;
}

/** La fila de una derivada con lo que aporta su override (si lo tiene). El id
 *  es determinístico y SIEMPRE el mismo: no puede depender de si existe el
 *  override, porque entonces cambiaría justo al crearlo y la fila seleccionada
 *  se le escaparía al panel de detalle. */
function filaDeDerivada(d: DerivedTask, ov: MgmtTask | undefined): TaskRow {
  // El cierre caduco (contra otra instancia) no describe la situación de hoy:
  // ni el estado ni la resolución de entonces siguen valiendo.
  const cierreCaduco = ov?.status === "cerrada" && ov.closedInstance !== d.instanceKey;
  return {
    id: `d_${d.derivedKey}`,
    overrideId: ov?.id,
    clinicId: ov?.clinicId ?? "",
    type: d.type,
    patientId: d.patientId,
    title: d.title,
    detail: d.detail,
    amount: d.amount,
    budgetId: d.budgetId,
    professionalId: d.professionalId,
    appointmentId: d.appointmentId,
    derivedKey: d.derivedKey,
    instanceKey: d.instanceKey,
    dueDate: d.dueDate,
    createdAt: d.eventAt,
    assigneeId: ov?.assigneeId,
    snoozedUntil: ov?.snoozedUntil,
    status: cierreCaduco ? "pendiente" : ov?.status ?? "pendiente",
    resolution: cierreCaduco ? undefined : ov?.resolution,
    updatedAt: ov?.updatedAt,
    gestiones: ov?.gestiones,
  };
}

/** Combina las derivadas con lo guardado y devuelve lo que ve la UI.
 *
 *  Reglas de convivencia: una derivada NUNCA pisa una decisión humana, y un
 *  override NUNCA revive una tarea cuya condición ya no se cumple.
 *
 *  El cierre humano vale solo para la instancia contra la que se cerró: la
 *  clave `cobranza:p1` dura toda la vida del paciente, la deuda no.
 *
 *  El override huérfano —el que quedó cuando el paciente pagó y la cobranza
 *  dejó de derivarse— se ignora en silencio. No se borra: borrarlo sería
 *  escribir en una lectura, y no molesta a nadie donde está.
 *
 *  Es la vista "de hoy" (lo postergado no aparece). La bandeja por fecha usa
 *  `filasDeTareas`, que conserva lo postergado en su día. */
export function fusionarTareas(
  derivadas: DerivedTask[],
  guardadas: MgmtTask[],
  hoy: string,
  incluirCerradas = false,
): TaskRow[] {
  const porClave = new Map<string, MgmtTask>();
  for (const g of guardadas) if (g.derivedKey) porClave.set(g.derivedKey, g);

  const out: TaskRow[] = [];

  for (const d of derivadas) {
    const ov = porClave.get(d.derivedKey);
    // Un cierre sin `closedInstance` es dato viejo (anterior a este campo):
    // cuenta como instancia que NO coincide. Preferimos mostrar una tarea de
    // más que perder plata por una cobranza enterrada.
    const cierreVigente = ov?.status === "cerrada" && ov.closedInstance === d.instanceKey;
    if (cierreVigente && !incluirCerradas) continue;
    if (ov?.snoozedUntil && ov.snoozedUntil > hoy) continue;
    out.push(filaDeDerivada(d, ov));
  }

  for (const g of guardadas) {
    if (g.derivedKey) continue; // ya se procesó como override (o quedó huérfano)
    if (g.status === "cerrada" && !incluirCerradas) continue;
    // "Postergar" escribe `snoozedUntil` en cualquier tarea, manual o derivada.
    // Sin este chequeo, en la manual el panel se cerraba y daba la sensación de
    // que había funcionado, pero al recargar la tarea seguía en la bandeja.
    if (g.snoozedUntil && g.snoozedUntil > hoy) continue;
    out.push(g);
  }

  return out;
}

/** Particiona la bandeja en las vistas de Dentalink.
 *
 *  `delDia` y `futuras` son una partición exacta del total; `atrasadas` es un
 *  subconjunto de `delDia` (las que además ya vencieron), que es lo que va en el
 *  badge con el número. Una tarea sin `dueDate` —las manuales sin fecha— cuenta
 *  como del día: si la escondiéramos hasta "algún día", no se haría nunca. */
export function clasificarTareas<T extends { dueDate?: string }>(tareas: T[], hoy: string): {
  delDia: T[];
  atrasadas: T[];
  futuras: T[];
} {
  const delDia: T[] = [];
  const atrasadas: T[] = [];
  const futuras: T[] = [];
  for (const t of tareas) {
    if (t.dueDate && t.dueDate > hoy) { futuras.push(t); continue; }
    delDia.push(t);
    if (t.dueDate && t.dueDate < hoy) atrasadas.push(t);
  }
  return { delDia, atrasadas, futuras };
}

/** Arma el texto secundario de una fila de la bandeja. `amount` y `detail`
 *  pueden coexistir —la regla `cheque` es la primera en setear los dos: el
 *  monto Y "<banco> · N° <número>"— así que se concatenan en vez de elegir
 *  uno. El formateador de moneda entra por parámetro: este módulo es puro y
 *  no sabe qué moneda tiene activa la clínica (ver nota de `DerivedTask.amount`). */
export function detalleTarea(t: { amount?: number; detail?: string }, fmt?: (n: number) => string): string | undefined {
  const partes = [
    t.amount != null && fmt ? fmt(t.amount) : null,
    t.detail ?? null,
  ].filter((x): x is string => x != null && x !== "");
  return partes.length > 0 ? partes.join(" · ") : undefined;
}

/* ═══ Bandeja por fecha (paridad Dentalink) ════════════════════════════════
 *
 *  Dentalink ordena el trabajo por DÍA: "Tareas del día" es lo que toca en la
 *  fecha elegida (‹ Anterior · Fecha · Siguiente ›), y lo que no se hizo a
 *  tiempo se acumula en "Tareas atrasadas". Una tarea trabajada no desaparece:
 *  queda con su ✓ en el día en que se trabajó, y si fue "Volver a contactar en…"
 *  vuelve a aparecer, pendiente, en la fecha nueva. Novudent suma una tercera lista,
 *  "Todas las pendientes" (`todasLasPendientes`): lo que falta de cualquier fecha, sin ir día por día. */

/** Hoy (YYYY-MM-DD) en la hora local del navegador, que es la de la clínica.
 *  No `toISOString()`: en Paraguay, de 21 a 24 h eso ya da el día siguiente. */
export function fechaLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Una fecha de calendario (YYYY-MM-DD: vencimientos, cobro de cheques, gastos) se arma en
 *  hora local. `new Date("2026-11-04")` la toma como medianoche UTC y en Paraguay (UTC−3)
 *  se mostraba el 3. Un instante ISO completo se lee tal cual. */
export function parseFecha(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
}

/** El valor de un `<input type="datetime-local">` («AAAA-MM-DDTHH:mm») para una fecha guardada, en hora LOCAL. Con `toISOString().slice(0, 16)`
 *  el campo mostraba la hora UTC (3 h adelantada en Paraguay) y, al guardar sin tocarla, cada edición corría el registro otras 3 h. Una fecha
 *  sola (AAAA-MM-DD) arranca a las 00:00 de ese día. */
export function aInputLocal(iso: string): string {
  const d = parseFecha(iso);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${fechaLocal(d)}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** Suma días a una fecha YYYY-MM-DD (aritmética de calendario, sin husos). */
export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ¿Es una fecha YYYY-MM-DD de verdad (no "2026-02-31")? */
export function esFecha(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** "Martes 19 Octubre", como el encabezado de Dentalink. Con el año solo si no
 *  es el de `hoy`. Sin Intl a propósito: el resultado no depende del navegador. */
export function tituloFecha(fecha: string, hoy?: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const base = `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
  return hoy && fecha.slice(0, 4) !== hoy.slice(0, 4) ? `${base} ${d.getUTCFullYear()}` : base;
}

/** "lunes 5 de octubre" (para frases). Con el año si no es el de `hoy`. */
export function fechaLarga(fecha: string, hoy?: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const base = `${DIAS[d.getUTCDay()].toLowerCase()} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()].toLowerCase()}`;
  return hoy && fecha.slice(0, 4) !== hoy.slice(0, 4) ? `${base} de ${d.getUTCFullYear()}` : base;
}

/** "19 Oct" (la fecha de cada fila). Con el año si no es el de `hoy`. */
export function fechaCorta(fecha: string, hoy?: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const base = `${String(d.getUTCDate()).padStart(2, "0")} ${MESES[d.getUTCMonth()].slice(0, 3)}`;
  return hoy && fecha.slice(0, 4) !== hoy.slice(0, 4) ? `${base} ${d.getUTCFullYear()}` : base;
}

/** Nombre de cada tipo, como en las etiquetas de Dentalink. */
export const TIPO_TAREA_LABEL: Record<MgmtTaskType, string> = {
  personalizada: "Personalizada", captura: "Captura", cobranza: "Cobranza", control: "Control", cita: "Cita", cheque: "Cheque",
};

/** Cómo se cerró una tarea, para mostrar. */
export const RESOLUCION_LABEL: Record<NonNullable<MgmtTask["resolution"]>, string> = {
  acepto: "Aceptó", contacto_posterior: "Contacto posterior", rechazo: "Rechazó", ejecutada: "Se ejecutó",
};

/** "Oct 2026" (el botón "Por mes" de las estadísticas). */
export function etiquetaMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[(m || 1) - 1].slice(0, 3)} ${y}`;
}

/** Cómo queda una fila en un día de la bandeja. */
export type EstadoFila =
  /** Todavía hay que hacerla. */
  | "pendiente"
  /** Alguien la trabajó ese día (✓). */
  | "completada"
  /** Se resolvió sola —el paciente pagó, agendó, aceptó— cuando alguien ya la tenía entre manos. */
  | "sistema";

/** Una fila de la bandeja por fecha. */
export interface FilaTarea extends TaskRow {
  /** Día de la bandeja en el que va la fila (YYYY-MM-DD). */
  fecha: string;
  estado: EstadoFila;
  /** La gestión que completó esta ocurrencia (solo en estado "completada"). */
  gestion?: TaskGestion;
}

const mayor = (a: string, b?: string) => (b && b > a ? b : a);

/** El día (YYYY-MM-DD) de un ISO: el LOCAL, como el resto de la bandeja. Si ya
 *  es una fecha pelada (el `eventAt` de "cita sin confirmar" es `hoy`), queda
 *  igual: `new Date("2026-07-30")` es medianoche UTC, o sea el 29 en Paraguay. */
export function diaDe(isoOFecha: string): string {
  return esFecha(isoOFecha) ? isoOFecha : fechaLocal(new Date(isoOFecha));
}

/** Un cierre hecho antes de que existieran las gestiones: se muestra igual, con
 *  su ✓ en el día en que se cerró, para no perder la historia. */
function gestionHeredada(g: MgmtTask): TaskGestion {
  const at = g.updatedAt ?? g.createdAt;
  return { fecha: diaDe(at), at, by: "", byName: "", accion: g.resolution === "acepto" ? "ok" : "cerrar", instancia: g.closedInstance };
}

function resolucionDe(accion: TaskAccion, personalizada: boolean): MgmtTask["resolution"] {
  if (accion === "ok") return "acepto";
  if (accion === "recontactar") return "contacto_posterior";
  return personalizada ? "ejecutada" : "rechazo";
}

/** Todas las filas de la bandeja, de todas las fechas: lo pendiente en su día,
 *  cada gestión en el día en que se hizo, y lo que se resolvió solo.
 *
 *  - Pendiente derivada: su día es el vencimiento, o la fecha de "volver a
 *    contactar" si es posterior. Un cierre vigente (contra ESTA instancia) la saca.
 *  - Pendiente manual: su `dueDate`; sin fecha (datos viejos) flota en `hoy`,
 *    que es lo que ya hacía `clasificarTareas`: lo que no tiene día no se esconde.
 *  - Completada: una por gestión. Un cierre viejo sin gestiones cuenta como una.
 *  - Sistema: el override huérfano (la condición se resolvió sola) que nadie
 *    había cerrado. Solo existe si alguien la había tomado —asignado, trabajado—:
 *    las que nadie tocó se resuelven sin dejar rastro, como decidió el diseño
 *    original (docs/superpowers/specs/2026-07-30-tareas-automaticas-design.md).
 *    También lo es una propia con «se tacha sola cuando…» que ya se cumplió
 *    (`cumplidas`, de `tareasCumplidas`): conserva el id de la pendiente, así el
 *    panel no pierde la selección cuando el paciente paga. */
export function filasDeTareas(derivadas: DerivedTask[], guardadas: MgmtTask[], hoy: string, cumplidas?: ReadonlySet<string>): FilaTarea[] {
  const porClave = new Map<string, MgmtTask>();
  for (const g of guardadas) if (g.derivedKey) porClave.set(g.derivedKey, g);
  const derivadaPorClave = new Map(derivadas.map((d) => [d.derivedKey, d]));
  const out: FilaTarea[] = [];

  for (const d of derivadas) {
    const ov = porClave.get(d.derivedKey);
    if (ov?.status === "cerrada" && ov.closedInstance === d.instanceKey) continue;
    out.push({ ...filaDeDerivada(d, ov), resolution: undefined, fecha: mayor(d.dueDate, ov?.snoozedUntil), estado: "pendiente" });
  }

  for (const g of guardadas) {
    if (!g.derivedKey && g.status !== "cerrada") {
      const sola = cumplidas?.has(g.id) === true;
      out.push({
        ...g,
        fecha: mayor(g.dueDate ?? hoy, g.snoozedUntil),
        estado: sola ? "sistema" : "pendiente",
        ...(sola ? { status: "cerrada" as const } : {}),
      });
    }
    const d = g.derivedKey ? derivadaPorClave.get(g.derivedKey) : undefined;
    const gestiones = g.gestiones?.length ? g.gestiones : g.status === "cerrada" ? [gestionHeredada(g)] : [];
    const heredada = !g.gestiones?.length;
    for (const ge of gestiones) {
      out.push({
        ...g,
        id: `${g.derivedKey ? `d_${g.derivedKey}` : g.id}@${ge.at}`,
        overrideId: g.derivedKey ? g.id : undefined,
        instanceKey: ge.instancia,
        detail: d?.detail ?? g.detail,
        amount: d?.amount,
        professionalId: d?.professionalId,
        appointmentId: d?.appointmentId,
        status: "cerrada",
        // Un cierre heredado conserva su resolución original ("Contacto posterior" incluido).
        resolution: heredada ? g.resolution : resolucionDe(ge.accion, g.type === "personalizada"),
        fecha: ge.fecha,
        estado: "completada",
        gestion: ge,
      });
    }
    if (g.derivedKey && !d && g.status !== "cerrada") {
      out.push({
        ...g,
        id: `s_${g.id}`,
        overrideId: g.id,
        status: "cerrada",
        fecha: mayor(g.dueDate ?? "", g.snoozedUntil) || diaDe(g.updatedAt ?? g.createdAt),
        estado: "sistema",
      });
    }
  }
  return out;
}

/** Lo que muestra la bandeja para `fecha`: las tareas de ese día (pendientes,
 *  trabajadas ✓ y, si no se esconden, las completadas por el sistema) y las
 *  atrasadas, que siempre se miden contra HOY aunque se esté mirando otro día
 *  (el contador de Dentalink no cambia al navegar). Una atrasada no va además
 *  en "Tareas del día" de hoy: en Dentalink son dos listas. */
export function bandejaDelDia(
  filas: FilaTarea[],
  fecha: string,
  hoy: string,
  esconderSistema = true,
): { delDia: FilaTarea[]; atrasadas: FilaTarea[] } {
  return {
    delDia: filas.filter((f) => f.fecha === fecha && !(esconderSistema && f.estado === "sistema")),
    atrasadas: filas.filter((f) => f.estado === "pendiente" && f.fecha < hoy),
  };
}

/** Orden de los tipos en la bandeja (el de Dentalink, con cheque al final). */
export const ORDEN_TIPOS: MgmtTaskType[] = ["personalizada", "captura", "cobranza", "control", "cita", "cheque"];

/** Orden estable de una lista: fecha, tipo, paciente. Las trabajadas quedan en
 *  su lugar (no saltan al final): la lista no se reacomoda bajo el cursor. */
export function ordenarFilas<T extends { fecha: string; type: MgmtTaskType; id: string }>(filas: T[], nombreDe: (f: T) => string): T[] {
  return [...filas].sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
    || ORDEN_TIPOS.indexOf(a.type) - ORDEN_TIPOS.indexOf(b.type)
    || nombreDe(a).localeCompare(nombreDe(b), "es")
    || a.id.localeCompare(b.id));
}

/** «Todas las pendientes»: lo que falta hacer, de CUALQUIER fecha —atrasadas, de hoy y futuras—, de la más
 *  vieja a la más nueva y, a igual fecha, en el orden del resto de la bandeja (tipo y después paciente).
 *
 *  Es la lista que no obliga a ir día por día: no mira `fecha` más que para ordenar. Una postergada
 *  («Volver a contactar en…») ya es una pendiente en su fecha de regreso (así la arma `filasDeTareas`), y
 *  la trabajada de hoy (✓) no cuenta: es historia, no trabajo por hacer. Para marcar cuáles están postergadas,
 *  `estaPostergada`. `bandejaDelDia` —«Tareas del día» y «Tareas atrasadas»— no cambia. */
export function todasLasPendientes<T extends FilaTarea>(filas: readonly T[], nombreDe: (f: T) => string): T[] {
  return ordenarFilas(filas.filter((f) => f.estado === "pendiente"), nombreDe);
}

/** ¿Alguien la reprogramó con «Volver a contactar en…» y todavía no llegó esa fecha? Es lo que explica por
 *  qué una pendiente figura más adelante aunque su regla ya la hubiera abierto. Sale de la gestión (lo que
 *  hace «Volver a contactar» en una personalizada) o de `snoozedUntil` (lo que escribe en una automática, y
 *  el «Postergar» viejo). El «OK» de una personalizada, que la vuelve a activar a la semana, no cuenta: no
 *  es una decisión de dejarla para después. Al llegar el día es una tarea más de hoy; pasado, una atrasada. */
export function estaPostergada(f: Pick<FilaTarea, "estado" | "fecha" | "snoozedUntil" | "gestiones">, hoy: string): boolean {
  if (f.estado !== "pendiente" || f.fecha <= hoy) return false;
  if (f.snoozedUntil === f.fecha) return true;
  const ultima = f.gestiones?.[f.gestiones.length - 1];
  return ultima?.accion === "recontactar" && ultima.hasta === f.fecha;
}

/* ─── Finalizar ▾ ─────────────────────────────────────────────────────────── */

/** Las opciones rápidas de "Volver a contactar en…". */
export const RECONTACTO_OPCIONES: { label: string; dias: number }[] = [
  { label: "1 día más", dias: 1 },
  { label: "3 días más", dias: 3 },
  { label: "1 semana más", dias: 7 },
  { label: "2 semanas más", dias: 14 },
];

/** Desde qué día se cuentan los "N días más": desde hoy, o desde la fecha de la
 *  tarea si se la está trabajando por adelantado. Una fecha nueva siempre tiene
 *  que ser posterior a esto: "volver a contactar" nunca adelanta una tarea. */
export function baseRecontacto(fila: Pick<FilaTarea, "fecha">, hoy: string): string {
  return fila.fecha > hoy ? fila.fecha : hoy;
}

/** El OK de una personalizada la vuelve a activar a la semana calendario
 *  ("si hoy es miércoles, el miércoles que viene la vuelvo a tener"). */
export const OK_PERSONALIZADA_DIAS = 7;

export interface GestionInput {
  accion: TaskAccion;
  /** La fecha nueva de "Volver a contactar en…" (YYYY-MM-DD). */
  hasta?: string;
  quien: { id: string; name: string };
  /** Momento de la gestión (ISO). */
  ahora: string;
  /** Hoy, en hora local (YYYY-MM-DD). */
  hoy: string;
  clinicId: string;
  /** El doc guardado de la tarea: la manual misma, o el override de la
   *  derivada si ya existe. Sin él, a la derivada se le crea el override. */
  doc?: MgmtTask;
}

/** El doc que carga la decisión humana sobre una derivada, la primera vez que
 *  alguien la toca. `createdAt` es el del hecho que la originó (el de la fila):
 *  es la fecha de "generada" en los reportes. */
function nuevoOverride(fila: FilaTarea, clinicId: string, ahora: string): MgmtTask {
  return {
    id: `ov_${(fila.derivedKey ?? "").replace(":", "_")}_${Date.parse(ahora)}`,
    clinicId,
    type: fila.type,
    patientId: fila.patientId,
    derivedKey: fila.derivedKey,
    title: fila.title,
    budgetId: fila.budgetId,
    status: "pendiente",
    createdAt: fila.createdAt,
  };
}

/** Aplica "Finalizar ▾" a una fila pendiente y devuelve el doc a guardar.
 *
 *  Automáticas (derivadas, vía override):
 *  - ok → cierra ESTA instancia con "Aceptó".
 *  - recontactar → la de hoy queda ✓ y la tarea vuelve a la bandeja en `hasta`.
 *  - cerrar → cierra esta instancia con "Rechazó" (respuesta negativa).
 *  Personalizadas (el doc mismo):
 *  - ok → la de hoy queda ✓ y se reactiva a la semana.
 *  - recontactar → ídem, en `hasta`.
 *  - cerrar → se ejecutó: queda cerrada.
 *
 *  `filaId` es el id de la fila ✓ que queda en la bandeja de hoy, para que el
 *  panel siga mostrando lo que se acaba de hacer. */
export function gestionarTarea(fila: FilaTarea, o: GestionInput): { doc: MgmtTask; nuevo: boolean; filaId: string } {
  if (fila.estado !== "pendiente") throw new Error("Solo se trabaja una tarea pendiente");
  const base = baseRecontacto(fila, o.hoy);
  if (o.accion === "recontactar" && !(esFecha(o.hasta) && o.hasta > base)) {
    throw new Error("La fecha para volver a contactar tiene que ser posterior a la de la tarea");
  }
  const personalizada = !fila.derivedKey;
  const hasta = o.accion === "recontactar" ? o.hasta : o.accion === "ok" && personalizada ? sumarDias(base, OK_PERSONALIZADA_DIAS) : undefined;
  const gestion: TaskGestion = {
    fecha: o.hoy, at: o.ahora, by: o.quien.id, byName: o.quien.name, accion: o.accion,
    ...(hasta ? { hasta } : {}),
    ...(fila.instanceKey ? { instancia: fila.instanceKey } : {}),
  };

  const existente = o.doc ?? (personalizada ? fila : undefined);
  const previo: MgmtTask = existente ?? nuevoOverride(fila, o.clinicId, o.ahora);
  // Sin los campos de la fila que no son del doc (fecha, estado…): lo que se
  // guarda es un MgmtTask, nunca un FilaTarea con basura de memoria.
  const doc: MgmtTask = limpiarDoc({ ...previo, gestiones: [...(previo.gestiones ?? []), gestion], updatedAt: o.ahora });

  if (personalizada) {
    if (o.accion === "cerrar") Object.assign(doc, { status: "cerrada", resolution: "ejecutada" });
    else Object.assign(doc, { status: "pendiente", resolution: undefined, dueDate: hasta, snoozedUntil: undefined });
  } else if (o.accion === "recontactar") {
    // Reprogramar reabre: un cierre viejo contra otra instancia deja de estorbar.
    Object.assign(doc, { status: "pendiente", resolution: undefined, closedInstance: undefined, snoozedUntil: hasta, dueDate: hasta });
  } else {
    Object.assign(doc, {
      status: "cerrada",
      resolution: o.accion === "ok" ? "acepto" : "rechazo",
      closedInstance: fila.instanceKey,
      snoozedUntil: undefined,
      dueDate: fila.fecha,
    });
  }
  return {
    doc: sinIndefinidos(doc),
    nuevo: !existente,
    filaId: `${personalizada ? doc.id : `d_${fila.derivedKey}`}@${o.ahora}`,
  };
}

/** Asigna (o desasigna, con `undefined`) una fila pendiente. En una derivada
 *  crea el override si no existía; guarda además la fecha de bandeja, que es lo
 *  que ubica a la tarea si después se resuelve sola. */
export function asignarTarea(
  fila: FilaTarea,
  assigneeId: string | undefined,
  o: { ahora: string; clinicId: string; doc?: MgmtTask },
): { doc: MgmtTask; nuevo: boolean } {
  const personalizada = !fila.derivedKey;
  const existente = o.doc ?? (personalizada ? fila : undefined);
  const previo = existente ?? nuevoOverride(fila, o.clinicId, o.ahora);
  const doc = limpiarDoc({ ...previo, assigneeId, updatedAt: o.ahora, ...(personalizada ? {} : { dueDate: fila.fecha }) });
  return { doc: sinIndefinidos(doc), nuevo: !existente };
}

/** Una tarea personalizada nueva (modal "Nueva tarea personalizada"). */
export function nuevaPersonalizada(o: {
  id: string;
  clinicId: string;
  detalle: string;
  fecha: string;
  patientId?: string;
  patientName?: string;
  budgetId?: string;
  /** «Se tacha sola cuando…»: solo tiene sentido con paciente. */
  autoCierre?: AutoCierre;
  createdBy: string;
  ahora: string;
}): MgmtTask {
  const detalle = o.detalle.trim();
  if (!detalle) throw new Error("El detalle es obligatorio");
  if (!esFecha(o.fecha)) throw new Error("La fecha es obligatoria");
  return sinIndefinidos({
    id: o.id,
    clinicId: o.clinicId,
    type: "personalizada",
    patientId: o.patientId || undefined,
    patientName: o.patientName,
    title: detalle,
    budgetId: o.patientId ? o.budgetId || undefined : undefined,
    autoCierre: o.patientId ? o.autoCierre : undefined,
    createdBy: o.createdBy,
    status: "pendiente",
    dueDate: o.fecha,
    createdAt: o.ahora,
  });
}

/** Lo que se ve debajo de "Tarea completada · <usuario>" en el panel. */
export function resumenGestion(g: TaskGestion, personalizada: boolean, hoy?: string): string {
  const cuando = g.hasta ? fechaLarga(g.hasta, hoy) : "";
  if (g.accion === "recontactar") return `Paciente será contactado nuevamente el ${cuando}`;
  if (g.accion === "ok") return personalizada ? `El paciente dice OK · vuelve a la bandeja el ${cuando}` : "El paciente dice OK";
  return personalizada ? "Caso cerrado · la tarea se ejecutó" : "Caso cerrado · respuesta negativa del paciente";
}

/** Quita de una fila los campos que existen solo en memoria (ver TaskRow y
 *  FilaTarea): lo que sale de acá es un MgmtTask que se puede guardar. */
function limpiarDoc(x: MgmtTask & Partial<FilaTarea>): MgmtTask {
  const { fecha: _f, estado: _e, gestion: _g, instanceKey: _i, overrideId: _o, amount: _a, professionalId: _p, appointmentId: _c, ...doc } = x;
  return doc;
}

/** Firestore rechaza `undefined`; el store ya lo limpia al guardar, pero el doc
 *  también vive en el estado local: mejor que no lleve claves fantasma. */
function sinIndefinidos<T extends object>(x: T): T {
  return Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) as T;
}
