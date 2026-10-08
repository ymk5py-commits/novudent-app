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

/* ===== Editor de plantillas (Integraciones › Plantillas de mensajes) =====
 * El editor arma un borrador por CADA plantilla que tiene un default (antes armaba cuatro a mano y la quinta, la de «Negociación de
 * presupuestos», salía vacía y dejaba «Guardar plantillas» prendido para siempre).
 *
 * Un texto vacío vale como «el de fábrica» (igual que en `botikaMessage` y en /api/reservas, que usan `||`): así «Restaurar default»
 * se puede guardar. No alcanza con omitir la clave: el documento de la clínica se guarda con `setDoc(…, { merge: true })`, que no borra
 * un campo ausente, y el texto propio anterior volvería a aparecer al recargar. */

export type PlantillasBotika = Record<BotikaAutoKey, string>;

const CLAVES_DE_PLANTILLAS = Object.keys(DEFAULT_TEMPLATES) as BotikaAutoKey[];

/** Los textos con los que arranca el editor: lo que la clínica guardó para cada automatización o, si no hay (o está vacío), el de fábrica. */
export function borradoresDePlantillas(guardadas?: BotikaConfig["templates"]): PlantillasBotika {
  const out = {} as PlantillasBotika;
  for (const k of CLAVES_DE_PLANTILLAS) out[k] = guardadas?.[k] || DEFAULT_TEMPLATES[k];
  return out;
}

/** ¿Hay algo para guardar? (Cuándo aparece «Guardar plantillas».) */
export function plantillasModificadas(borradores: PlantillasBotika, guardadas?: BotikaConfig["templates"]): boolean {
  return CLAVES_DE_PLANTILLAS.some((k) => borradores[k] !== (guardadas?.[k] || DEFAULT_TEMPLATES[k]));
}

/** Lo que va a `botika.templates`: el texto de las plantillas que difieren del de fábrica y, para una que tenía texto propio y se
 *  devolvió al de fábrica, un texto vacío (que sobrescribe al anterior). Las que nunca se personalizaron no se escriben. */
export function plantillasParaGuardar(borradores: PlantillasBotika, guardadas?: BotikaConfig["templates"]): NonNullable<BotikaConfig["templates"]> {
  const out: NonNullable<BotikaConfig["templates"]> = {};
  for (const k of CLAVES_DE_PLANTILLAS) {
    if (borradores[k] !== DEFAULT_TEMPLATES[k]) out[k] = borradores[k];
    else if (guardadas?.[k]) out[k] = "";
  }
  return out;
}

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
