import type { Appointment, OrthoRecord, Budget, Payment, EmrNote } from "./types";

/** Tipos de entrada del timeline unificado (paridad Historial de Dentalink). */
export type HistorialKind = "cita" | "evolucion" | "prestacion" | "pago" | "nota";

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

const APPT_LABEL: Record<string, string> = {
  confirmada: "Confirmada", pendiente: "No confirmada", completada: "Atendido", cancelada: "Anulada",
};

/** Agrega citas + evoluciones de ortodoncia + prestaciones realizadas + pagos + notas EMR
 *  en una lista cronológica (desc). Puro y tolerante a datos faltantes. */
export function buildHistorial(opts: {
  appointments: Appointment[];
  ortho?: OrthoRecord;
  budgets: Budget[];
  payments: Payment[];
  emr: EmrNote[];
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
    out.push({ id: `nota_${n.id}`, at: n.createdAt, kind: "nota", title: "Nota clínica", detail: n.text, by: n.authorName, badge: n.kind });
  }

  return out.sort((a, b) => b.at.localeCompare(a.at));
}
