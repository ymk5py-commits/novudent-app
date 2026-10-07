/** «Se tacha sola cuando…»: tareas propias con paciente que se cierran cuando pasa lo que esperaban
 *  (el paciente agenda, acepta el presupuesto o paga). Es la versión manual de lo que el motor de
 *  `lib/tareas.ts` ya hace con las automáticas: NO se guarda ningún cierre, se compara en cada lectura.
 *  Por eso, si lo que pasó se revierte (pago anulado, cita cancelada), la tarea vuelve a pendiente.
 *
 *  Módulo PURO: no importa React, ni Firestore, ni el store. */
import { diaDe } from "./tareas";
import type { Appointment, AutoCierre, Budget, MgmtTask, Payment } from "./types";

/** Lo mínimo que se compara. Un objeto plano, para testear sin armar una base completa. */
export interface DatosAuto {
  appointments: Pick<Appointment, "id" | "patientId" | "start" | "status">[];
  budgets: Pick<Budget, "id" | "status">[];
  payments: Pick<Payment, "patientId" | "date" | "voidedAt">[];
}

/** Una cita cancelada o a la que faltó no es haber agendado. */
const citaVigente = (a: Pick<Appointment, "status">) => a.status !== "cancelada" && a.status !== "ausente";

/** La foto del estado al crear la tarea: desde cuándo se espera y qué ya existía.
 *  Sin ella, el paciente que ya tenía una cita cumpliría la tarea en el mismo instante. */
export function crearAutoCierre(o: {
  evento: AutoCierre["evento"];
  patientId: string;
  /** Hoy, en hora local (YYYY-MM-DD). */
  hoy: string;
  appointments: DatosAuto["appointments"];
  budgetId?: string;
}): AutoCierre {
  if (o.evento === "presupuesto") {
    if (!o.budgetId) throw new Error("Elegí el presupuesto que tiene que aceptar");
    return { evento: "presupuesto", desde: o.hoy, budgetId: o.budgetId };
  }
  if (o.evento === "cita") {
    const previas = o.appointments
      .filter((a) => a.patientId === o.patientId && citaVigente(a) && diaDe(a.start) >= o.hoy)
      .map((a) => a.id);
    return { evento: "cita", desde: o.hoy, previas };
  }
  return { evento: "pago", desde: o.hoy };
}

/** ¿Pasó lo que la tarea esperaba? */
export function autoCierreCumplido(a: AutoCierre, patientId: string, d: DatosAuto): boolean {
  switch (a.evento) {
    case "presupuesto": {
      const b = d.budgets.find((x) => x.id === a.budgetId);
      return !!b && (b.status === "aceptado" || b.status === "completado");
    }
    case "pago":
      return d.payments.some((p) => p.patientId === patientId && !p.voidedAt && diaDe(p.date) >= a.desde);
    case "cita": {
      // Basta con que la cita nueva exista y esté vigente: no tiene que ser futura. Si no, la
      // tarea se destildaría sola el día después de la cita, cuando ya es pasado.
      const previas = new Set(a.previas ?? []);
      return d.appointments.some((x) => x.patientId === patientId && citaVigente(x) && diaDe(x.start) >= a.desde && !previas.has(x.id));
    }
  }
}

/** Los ids de las tareas propias abiertas, con paciente, cuya condición ya se cumplió. Una tarea que
 *  alguien cerró a mano, o sin paciente, o el override de una automática, no entra. */
export function tareasCumplidas(
  guardadas: Pick<MgmtTask, "id" | "derivedKey" | "patientId" | "status" | "autoCierre">[],
  d: DatosAuto,
): Set<string> {
  const out = new Set<string>();
  for (const g of guardadas) {
    if (g.derivedKey || g.status === "cerrada" || !g.autoCierre || !g.patientId) continue;
    if (autoCierreCumplido(g.autoCierre, g.patientId, d)) out.add(g.id);
  }
  return out;
}

/** Destilda una tarea propia que se cerró con «Se ejecutó»: saca esa gestión y la deja pendiente en su
 *  día. Las gestiones anteriores (un «OK», un «volver a contactar») no se tocan. */
export function reabrirTarea(doc: MgmtTask, ahora: string): MgmtTask {
  if (doc.derivedKey) throw new Error("Solo se reabre una tarea propia");
  if (doc.status !== "cerrada") throw new Error("La tarea no está cerrada");
  const gestiones = doc.gestiones ?? [];
  const ultima = gestiones[gestiones.length - 1];
  const { resolution: _resolution, ...resto } = doc;
  return {
    ...resto,
    status: "pendiente",
    gestiones: ultima?.accion === "cerrar" ? gestiones.slice(0, -1) : gestiones,
    updatedAt: ahora,
  };
}

/** Por qué se tachó sola (lo que dice el panel de una «completada por el sistema»). */
export function motivoCumplido(a: AutoCierre): string {
  if (a.evento === "presupuesto") return "El paciente aceptó el presupuesto.";
  if (a.evento === "pago") return "El paciente registró un pago.";
  return "El paciente agendó una cita.";
}

/** Qué espera la tarea (la leyenda de la fila). */
export function etiquetaAutoCierre(a: AutoCierre): string {
  if (a.evento === "presupuesto") return "Se tacha sola cuando acepte el presupuesto";
  if (a.evento === "pago") return "Se tacha sola cuando registre un pago";
  return "Se tacha sola cuando agende una cita";
}

/** Las opciones del formulario, en el orden en que se ofrecen. */
export const EVENTOS_AUTOCIERRE: { id: AutoCierre["evento"]; label: string }[] = [
  { id: "cita", label: "Agende una cita" },
  { id: "presupuesto", label: "Acepte el presupuesto" },
  { id: "pago", label: "Registre un pago" },
];
