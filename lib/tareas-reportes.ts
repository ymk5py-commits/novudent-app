/** Estadísticas y reportes Excel de las tareas de gestión (paridad Dentalink:
 *  el ícono de indicador del módulo, y Reportes Excel → CRM).
 *
 *  Módulo PURO, como lib/tareas.ts. Todo sale de dos fuentes: las derivadas de
 *  hoy y lo guardado en `mgmtTasks` (manuales y overrides con sus gestiones).
 *
 *  Lo que NO puede medir, por diseño: las automáticas que se resolvieron solas
 *  sin que nadie las tocara no dejan registro (ver la nota de "Costo aceptado"
 *  en docs/superpowers/specs/2026-07-30-tareas-automaticas-design.md). Por eso
 *  un "caso" es una tarea que alguien TRABAJÓ desde "Finalizar ▾". */
import type { Appointment, Budget, MgmtTask, MgmtTaskType, Payment, TaskGestion } from "./types";
import { mapaDeSaldos, presupuestoIniciado, diaDe, TIPO_TAREA_LABEL, RESOLUCION_LABEL, type DerivedTask } from "./tareas";

/* ═══ Estadísticas ═══════════════════════════════════════════════════════ */

/** "Resultados históricos" o "Por mes". `mes` es YYYY-MM. */
export type PeriodoTareas = { tipo: "historico" } | { tipo: "mes"; mes: string };

/** Los cuatro contadores de Dentalink. */
export type TipoContador = "cobranza" | "captura" | "control" | "cita";
export const CONTADORES: { tipo: TipoContador; label: string }[] = [
  { tipo: "cobranza", label: "Deudas cobradas" },
  { tipo: "captura", label: "Presupuestos capturados" },
  { tipo: "control", label: "Controles agendados" },
  { tipo: "cita", label: "Citas re-agendadas" },
];

export interface ParticipacionUsuario {
  userId: string;
  nombre: string;
  /** Casos en los que participó, por tipo de tarea. */
  porTipo: Partial<Record<MgmtTaskType, number>>;
  total: number;
}

export interface EstadisticasTareas {
  /** "N (de M casos)": M = casos trabajados en el período; N = los que hoy están resueltos a favor. */
  contadores: Record<TipoContador, { casos: number; exitos: number }>;
  /** "Usuarios y los casos en los que han participado", de más a menos. */
  usuarios: ParticipacionUsuario[];
}

export interface EstadisticasInput {
  mgmtTasks: MgmtTask[];
  budgets: Budget[];
  payments: Payment[];
  appointments: Appointment[];
}

/** Las instancias de la re-agenda llevan el estado de la cita ("ausente:a1").
 *  Las de "cita sin confirmar" son el id pelado: esas no son re-agendas. */
const esReagenda = (instancia: string) => instancia.startsWith("cancelada:") || instancia.startsWith("ausente:");

/** ¿Tiene, desde `desde`, una cita que no esté cancelada ni ausente? */
function volvioAAgendar(citas: Appointment[] | undefined, desde: string): boolean {
  return (citas ?? []).some((a) => a.start.slice(0, 10) >= desde && a.status !== "cancelada" && a.status !== "ausente");
}

/** Un caso = una tarea (doc) + la instancia de su condición, con al menos una
 *  gestión en el período. La cobranza de un paciente que debió dos veces en el
 *  año son dos casos: dos deudas distintas. */
export function estadisticasTareas(input: EstadisticasInput, periodo: PeriodoTareas): EstadisticasTareas {
  const enPeriodo = (g: TaskGestion) => periodo.tipo === "historico" || g.fecha.startsWith(periodo.mes);
  const saldos = mapaDeSaldos(input.budgets, input.payments);
  const budgetPorId = new Map(input.budgets.map((b) => [b.id, b]));
  const citasPorPaciente = new Map<string, Appointment[]>();
  for (const a of input.appointments) {
    const arr = citasPorPaciente.get(a.patientId);
    if (arr) arr.push(a); else citasPorPaciente.set(a.patientId, [a]);
  }

  const contadores: EstadisticasTareas["contadores"] = {
    cobranza: { casos: 0, exitos: 0 }, captura: { casos: 0, exitos: 0 }, control: { casos: 0, exitos: 0 }, cita: { casos: 0, exitos: 0 },
  };
  const usuarios = new Map<string, ParticipacionUsuario>();

  for (const doc of input.mgmtTasks) {
    const porInstancia = new Map<string, TaskGestion[]>();
    for (const g of doc.gestiones ?? []) {
      if (!enPeriodo(g)) continue;
      const k = g.instancia ?? "";
      const arr = porInstancia.get(k);
      if (arr) arr.push(g); else porInstancia.set(k, [g]);
    }

    for (const [instancia, gestiones] of porInstancia) {
      const t = doc.type;
      const primera = gestiones.reduce((a, g) => (g.fecha < a ? g.fecha : a), gestiones[0].fecha);
      let exito: boolean | null = null; // null = no es de los cuatro contadores
      if (t === "cobranza") exito = !!doc.patientId && (saldos.get(doc.patientId) ?? 0) <= 0;
      else if (t === "captura") {
        const b = budgetPorId.get(doc.derivedKey?.startsWith("captura:") ? doc.derivedKey.slice(8) : doc.budgetId ?? "");
        exito = !!b && (b.status === "aceptado" || b.status === "completado" || (b.status === "presentado" && presupuestoIniciado(b, input.payments)));
      } else if (t === "control") exito = !!doc.patientId && volvioAAgendar(citasPorPaciente.get(doc.patientId), primera);
      else if (t === "cita" && esReagenda(instancia)) exito = !!doc.patientId && volvioAAgendar(citasPorPaciente.get(doc.patientId), primera);
      if (exito !== null) {
        const c = contadores[t as TipoContador];
        c.casos++;
        if (exito) c.exitos++;
      }

      // Cada usuario cuenta una vez por caso, aunque lo haya trabajado tres veces.
      const vistos = new Set<string>();
      for (const g of gestiones) {
        if (!g.by || vistos.has(g.by)) continue;
        vistos.add(g.by);
        const u = usuarios.get(g.by) ?? { userId: g.by, nombre: g.byName || "—", porTipo: {}, total: 0 };
        if (g.byName) u.nombre = g.byName;
        u.porTipo[t] = (u.porTipo[t] ?? 0) + 1;
        u.total++;
        usuarios.set(g.by, u);
      }
    }
  }

  return {
    contadores,
    usuarios: [...usuarios.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es")),
  };
}

/* ═══ Reportes Excel → CRM ══════════════════════════════════════════════ */

export type EstadoLinea = "Pendiente" | "Cerrada" | "Completada por el sistema";

/** Una tarea para los reportes: una línea por tarea (no por cada vez que se trabajó). */
export interface LineaTarea {
  type: MgmtTaskType;
  patientId?: string;
  patientName?: string;
  title: string;
  detail?: string;
  amount?: number;
  professionalId?: string;
  /** Cuándo se generó (YYYY-MM-DD): el hecho de la derivada, el alta de la manual. */
  generada: string;
  /** Su fecha en la bandeja (YYYY-MM-DD). */
  vence?: string;
  estado: EstadoLinea;
  resolution?: MgmtTask["resolution"];
  assigneeId?: string;
  /** La última vez que alguien la trabajó. */
  ultima?: TaskGestion;
}

const mayor = (a: string, b?: string) => (b && b > a ? b : a);

export function lineasDeTareas(derivadas: DerivedTask[], guardadas: MgmtTask[], hoy: string): LineaTarea[] {
  const porClave = new Map<string, MgmtTask>();
  for (const g of guardadas) if (g.derivedKey) porClave.set(g.derivedKey, g);
  const vivas = new Set(derivadas.map((d) => d.derivedKey));
  const ultima = (g?: MgmtTask) => g?.gestiones?.[g.gestiones.length - 1];
  const out: LineaTarea[] = [];

  for (const d of derivadas) {
    const ov = porClave.get(d.derivedKey);
    const cerrada = ov?.status === "cerrada" && ov.closedInstance === d.instanceKey;
    out.push({
      type: d.type, patientId: d.patientId, title: d.title, detail: d.detail, amount: d.amount, professionalId: d.professionalId,
      generada: diaDe(d.eventAt), vence: mayor(d.dueDate, ov?.snoozedUntil),
      estado: cerrada ? "Cerrada" : "Pendiente", resolution: cerrada ? ov?.resolution : undefined,
      assigneeId: ov?.assigneeId, ultima: ultima(ov),
    });
  }
  for (const g of guardadas) {
    if (g.derivedKey) continue;
    out.push({
      type: g.type, patientId: g.patientId, patientName: g.patientName, title: g.title, detail: g.detail,
      generada: diaDe(g.createdAt), vence: mayor(g.dueDate ?? hoy, g.snoozedUntil),
      estado: g.status === "cerrada" ? "Cerrada" : "Pendiente", resolution: g.status === "cerrada" ? g.resolution : undefined,
      assigneeId: g.assigneeId, ultima: ultima(g),
    });
  }
  // Overrides huérfanos: la tarea ya no se deriva (la condición se resolvió).
  for (const [clave, g] of porClave) {
    if (vivas.has(clave)) continue;
    out.push({
      type: g.type, patientId: g.patientId, title: g.title,
      generada: diaDe(g.createdAt), vence: mayor(g.dueDate ?? "", g.snoozedUntil) || undefined,
      estado: g.status === "cerrada" ? "Cerrada" : "Completada por el sistema", resolution: g.status === "cerrada" ? g.resolution : undefined,
      assigneeId: g.assigneeId, ultima: ultima(g),
    });
  }
  return out;
}

export const COLUMNAS_REPORTE_TAREAS = [
  "Tipo", "Paciente", "Profesional", "Tarea", "Detalle", "Generada", "Vence", "Estado",
  "Responsable", "Última gestión", "Gestionada por", "Resultado", "Monto",
];

/** Qué se hizo la última vez, en palabras. */
export function resultadoGestion(g: TaskGestion | undefined): string {
  if (!g) return "";
  if (g.accion === "ok") return "El paciente dice OK";
  if (g.accion === "recontactar") return `Volver a contactar el ${g.hasta ?? ""}`.trim();
  return "Caso cerrado";
}

/** Las filas del CSV (con encabezado) de "Tareas de gestión generadas en un
 *  período de tiempo" o "…a vencer en un período de tiempo". El rango es
 *  inclusivo en las dos puntas. "A vencer" son solo las pendientes: lo cerrado
 *  ya no vence. */
export function reporteTareas(
  tipo: "generadas" | "a_vencer",
  lineas: LineaTarea[],
  rango: { desde: string; hasta: string },
  nombres: { paciente: (l: LineaTarea) => string; usuario: (id?: string) => string },
): (string | number)[][] {
  const dentro = (f?: string) => !!f && f >= rango.desde && f <= rango.hasta;
  const elegidas = tipo === "generadas"
    ? lineas.filter((l) => dentro(l.generada)).sort((a, b) => a.generada.localeCompare(b.generada))
    : lineas.filter((l) => l.estado === "Pendiente" && dentro(l.vence)).sort((a, b) => (a.vence ?? "").localeCompare(b.vence ?? ""));
  return [
    COLUMNAS_REPORTE_TAREAS,
    ...elegidas.map((l) => [
      TIPO_TAREA_LABEL[l.type],
      nombres.paciente(l),
      l.professionalId ? nombres.usuario(l.professionalId) : "",
      l.title,
      l.detail ?? "",
      l.generada,
      l.vence ?? "",
      l.estado === "Cerrada" && l.resolution ? `Cerrada · ${RESOLUCION_LABEL[l.resolution]}` : l.estado,
      l.assigneeId ? nombres.usuario(l.assigneeId) : "No asignado",
      l.ultima?.fecha ?? "",
      l.ultima?.byName ?? "",
      resultadoGestion(l.ultima),
      l.amount ?? "",
    ]),
  ];
}
