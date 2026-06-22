import type { DB, OutboxTask, OutboxTaskType, Patient, BotikaConfig } from "./types";

/* ===== Integración Botika: helpers de encolado y plantillas =====
 * Las páginas encolan tareas con estos builders; el worker de Botika
 * (servicio externo) las procesa por WhatsApp y escribe `result`.
 * Contrato: docs/INTEGRACION-BOTIKA.md */

export type BotikaAutoKey = keyof BotikaConfig["automations"];

export function botikaEnabled(db: DB, automation: BotikaAutoKey): boolean {
  const b = db.clinics[0]?.config.botika;
  return !!b?.connected && !!b.automations[automation];
}

/** Variables disponibles en todas las plantillas */
export const BOTIKA_TEMPLATE_VARS = "{paciente} {clinica} {fecha} {hora} {titulo} {saldo}";

export const DEFAULT_TEMPLATES: Record<BotikaAutoKey, string> = {
  confirmCita:
    "Hola {paciente} 👋 Te recordamos tu cita «{titulo}» en {clinica} el {fecha} a las {hora}. ¿Confirmás tu asistencia?",
  nps:
    "Hola {paciente} 👋 ¿Del 0 al 10, cuánto recomendarías {clinica} a un amigo o familiar? Tu opinión nos ayuda a mejorar 🙏",
  cobranza:
    "Hola {paciente} 👋 Te escribimos de {clinica}. Tenés un saldo pendiente de {saldo}. ¿Querés que te pase los medios de pago o coordinamos una fecha?",
  reagendar:
    "Hola {paciente} 👋 Tu cita «{titulo}» del {fecha} fue cancelada. ¿Buscamos un nuevo horario? Contame qué días y franjas te quedan cómodos 😊",
  negociacion:
    "Hola {paciente} 👋 Te escribimos de {clinica}. Hace unos días te presentamos un presupuesto de tratamiento. ¿Pudiste revisarlo? Con gusto te contamos sobre opciones de pago en cuotas 😊",
};

export const AUTOMATION_LABEL: Record<BotikaAutoKey, string> = {
  confirmCita: "Confirmación de citas",
  nps: "Encuesta NPS",
  cobranza: "Cobranza",
  reagendar: "Reagendamiento",
  negociacion: "Negociación de presupuestos",
};

type TemplateVars = Partial<Record<"paciente" | "clinica" | "fecha" | "hora" | "titulo" | "saldo", string>>;

/** Mensaje final: plantilla personalizada (Integraciones) o default, con variables rellenas */
export function botikaMessage(db: DB, kind: BotikaAutoKey, vars: TemplateVars): string {
  const tpl = db.clinics[0]?.config.botika?.templates?.[kind] || DEFAULT_TEMPLATES[kind];
  const filled = (Object.entries(vars) as [string, string][]).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, v ?? ""),
    tpl
  );
  // Limpia placeholders no provistos para no mostrarle «{algo}» literal al paciente.
  return filled.replace(/\{[a-zA-Z_]+\}/g, "");
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
