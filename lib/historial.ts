import { ESTADO_LABEL } from "./estadosCita";
import type { Appointment, OrthoRecord, Budget, Payment, EmrNote, DocumentoClinico } from "./types";

/** Tipos de entrada del timeline unificado (paridad Historial de Dentalink). */
export type HistorialKind = "cita" | "evolucion" | "prestacion" | "pago" | "nota" | "documento";

export interface HistorialEntry {
  id: string;
  at: string;        // ISO
  kind: HistorialKind;
  title: string;
  detail: string;
  by?: string;       // profesional/autor
  badge?: string;    // estado (cita) o tipo de nota
  amount?: number;   // sólo en pagos
}

const APPT_LABEL: Record<string, string> = ESTADO_LABEL;

/** Cómo se llama cada tipo de nota clínica en pantalla. Lo usan el Historial, el Resumen y Evoluciones: las tres tienen que decir lo
 *  mismo (el Historial mostraba el valor tal como se guarda, «diagnostico», «plan»). */
export const NOTA_LABEL: Record<EmrNote["kind"], string> = {
  diagnostico: "Diagnóstico",
  tratamiento: "Tratamiento",
  plan: "Plan",
  nota: "Nota",
};

/** El nombre en español de un tipo de nota; si el tipo no se conoce (dato viejo o de otro origen), se muestra como vino. */
export const etiquetaDeNota = (kind: string): string =>
  Object.prototype.hasOwnProperty.call(NOTA_LABEL, kind) ? NOTA_LABEL[kind as EmrNote["kind"]] : kind;

/** Agrega citas + evoluciones de ortodoncia + prestaciones realizadas + pagos + notas EMR
 *  en una lista cronológica (desc). Puro y tolerante a datos faltantes. */
export function buildHistorial(opts: {
  appointments: Appointment[];
  ortho?: OrthoRecord;
  budgets: Budget[];
  payments: Payment[];
  emr: EmrNote[];
  /** Documentos clínicos del paciente: entran los completados (un pendiente o anulado no es historia). */
  documentos?: DocumentoClinico[];
}): HistorialEntry[] {
  const out: HistorialEntry[] = [];

  for (const a of opts.appointments) {
    out.push({ id: `cita_${a.id}`, at: a.start, kind: "cita", title: "Cita agendada", detail: a.title, badge: APPT_LABEL[a.status] ?? a.status });
  }
  opts.ortho?.controls.forEach((c, i) => {
    out.push({ id: `evo_${i}_${c.date}`, at: c.date, kind: "evolucion", title: "Evolución guardada", detail: c.note, by: c.by });
  });
  for (const b of opts.budgets) {
    for (const it of b.items) {
      if (it.status === "realizado" && it.doneAt) {
        out.push({
          id: `prest_${it.id}`, at: it.doneAt, kind: "prestacion",
          title: `Prestación realizada · Plan #${b.id}`,
          detail: it.tooth ? `${it.description} · pieza ${it.tooth}` : it.description,
          by: it.doneBy,
        });
      }
    }
  }
  for (const p of opts.payments) {
    out.push({ id: `pago_${p.id}`, at: p.date, kind: "pago", title: "Pago recibido", detail: p.concept, by: p.receivedBy, amount: p.amount });
  }
  for (const n of opts.emr) {
    out.push({ id: `nota_${n.id}`, at: n.createdAt, kind: "nota", title: "Nota clínica", detail: n.text, by: n.authorName, badge: etiquetaDeNota(n.kind) });
  }

  for (const d of opts.documentos ?? []) {
    if (d.estado !== "completado") continue;
    out.push({ id: `doc_${d.id}`, at: d.completedAt ?? d.createdAt, kind: "documento", title: "Documento clínico", detail: d.nombre, by: d.completedBy ?? d.createdByName });
  }

  return out.sort((a, b) => b.at.localeCompare(a.at));
}
