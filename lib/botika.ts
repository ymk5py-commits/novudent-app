import type { DB, OutboxTask, OutboxTaskType, Patient, BotikaConfig } from "./types";

/* ===== Integración Botika: helpers de encolado =====
 * Las páginas encolan tareas con estos builders; el worker de Botika
 * (servicio externo) las procesa por WhatsApp y escribe `result`.
 * Contrato: docs/INTEGRACION-BOTIKA.md */

export function botikaEnabled(db: DB, automation: keyof BotikaConfig["automations"]): boolean {
  const b = db.clinics[0]?.config.botika;
  return !!b?.connected && !!b.automations[automation];
}

export function makeOutboxTask(args: {
  db: DB;
  type: OutboxTaskType;
  patient: Patient;
  message: string;
  refId?: string;
  by: string;
}): OutboxTask {
  return {
    id: `t_${Date.now()}`,
    clinicId: args.db.clinics[0].id,
    type: args.type,
    patientId: args.patient.id,
    phone: args.patient.phone,
    message: args.message,
    refId: args.refId,
    status: "pendiente",
    createdAt: new Date().toISOString(),
    createdBy: args.by,
  };
}

export function npsMessage(patient: Patient, clinicName: string): string {
  return `Hola ${patient.firstName} 👋 ¿Del 0 al 10, cuánto recomendarías ${clinicName} a un amigo o familiar? Tu opinión nos ayuda a mejorar 🙏`;
}

export function cobranzaMessage(patient: Patient, clinicName: string, amountStr: string): string {
  return `Hola ${patient.firstName} 👋 Te escribimos de ${clinicName}. Tenés un saldo pendiente de ${amountStr}. ¿Querés que te pase los medios de pago o coordinamos una fecha?`;
}
