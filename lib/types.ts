/* ===== Modelo de datos Novudent (sec. 4 del Documento Maestro) ===== */
import type { CurrencyCode } from "./currency";

export type Role = "admin" | "dentist" | "assistant";

/** Convenio empresarial / aseguradora con descuento pactado */
export interface Convenio {
  name: string;
  discountPct: number;   // % de cobertura/descuento
  ruc?: string;
  phone?: string;
}

/** Configuración de campos del paciente (paridad Dentalink): por contexto, presente/requerido. */
export type FieldContext = "nuevo" | "agenda" | "online" | "checkin";
export interface FieldConfig {
  present?: Partial<Record<FieldContext, boolean>>;
  required?: Partial<Record<FieldContext, boolean>>;
}

export interface Clinic {
  id: string;
  name: string;
  /** Plan contratado (solo | clinica | cadena) — limita módulos y usuarios.
   *  Clínicas creadas antes del sistema de planes → "clinica" (lib/plan.ts planOf). */
  plan?: "solo" | "clinica" | "cadena";
  config: {
    timezone: string;
    currency: CurrencyCode;
    address?: string;
    phone?: string;
    /** Gestión de convenios (descuento % aplicable a presupuestos) */
    convenios?: Convenio[];
    /** Plantilla de recordatorio de cita (placeholders {paciente} {fecha} {hora} {clinica}) */
    reminderTemplate?: string;
    /** Integración Botika (bot de WhatsApp con IA) */
    botika?: BotikaConfig;
    /** Plantillas de consentimiento informado configurables por la clínica */
    consentTemplates?: ConsentTemplate[];
    /** Config de campos del paciente: presente/requerido por contexto */
    patientFields?: Record<string, FieldConfig>;
    /** Plazos de las tareas automáticas de gestión (módulo Tareas). */
    taskDeadlines?: TaskDeadlines;
    /** Reserva online del paciente (paridad Dentalink). */
    onlineBooking?: {
      /** Anticipación mínima en horas: cuánto tiene que faltar para el turno
       *  para que el paciente todavía pueda tomarlo. 0 = hasta la hora misma.
       *  Se evalúa en la zona horaria de la clínica (`config.timezone`). */
      minLeadHoras?: number;
    };
    /** Logotipo de la clínica (data URL base64) — header de la app + documentos */
    logo?: string;
    /** Pago online configurable (sin atar a una pasarela ni guardar secretos):
     *  link de checkout del gateway de la clínica + datos de transferencia. */
    payments?: { checkoutUrl?: string; bankInfo?: string };
  };
}

/* ===== Suscripción SaaS (monetización) =====
 * Vive en la colección RAÍZ `subscriptions/{cid}`, NO dentro de clinics/{cid}:
 * el admin de una clínica puede escribir su propio doc de clínica, así que si el
 * plan viviera ahí podría auto-ascenderse a Cadena gratis. Este doc lo escribe
 * SOLO el usuario de servicio (webhook de la pasarela) — ver firestore.rules. */
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";

export interface Subscription {
  clinicId: string;
  /** Plan contratado — fuente de verdad del gating (gana sobre Clinic.plan). */
  plan: "solo" | "clinica" | "cadena";
  status: SubscriptionStatus;
  /** Fin del período pago, en epoch ms. En ms (no ISO) para poder compararlo
   *  directo en firestore.rules con `request.time.toMillis()`. */
  currentPeriodEndMs?: number;
  provider?: "lemonsqueezy" | "manual";
  /** Ids de Lemon Squeezy para conciliar y para el portal del cliente */
  lsSubscriptionId?: string;
  lsCustomerId?: string;
  lsVariantId?: string;
  customerPortalUrl?: string;
  updatedAt: string;
  /** quién la actualizó: "webhook:lemonsqueezy" o el dueño desde /superadmin */
  updatedBy?: string;
}

export interface User {
  id: string;
  clinicId: string;
  name: string;
  email: string;
  role: Role;
  color: string; // color de agenda
  active: boolean;
  /** uid de Firebase Auth (cuenta real creada por el administrador) */
  authUid?: string;
  /** true mientras el usuario use la contraseña inicial que le asignaron;
   *  la app fuerza el cambio antes de dejarlo entrar al dashboard. */
  mustChangePassword?: boolean;
  /** WhatsApp del doctor para la alerta roja del monitor de recuperación */
  phone?: string;
  /** % de comisión sobre producción cobrada (cálculo de pago a odontólogos) */
  commissionPct?: number;
  /** Sueldo base del período (contrato salario fijo / mixto) */
  salaryBase?: number;
  /** Especialidad del profesional (Ortodoncia, Endodoncia, …) */
  specialty?: string;
  /** Sucursal asignada (multi-sede) */
  branchId?: string;
}

export type AppointmentStatus = "confirmada" | "en_atencion" | "pendiente" | "completada" | "cancelada" | "ausente";

export interface Appointment {
  id: string;
  clinicId: string;
  patientId: string;
  dentistId: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  status: AppointmentStatus;
  amount: number; // Importe total
  discount: number; // Descuento
  notes?: string;
  /** Motivo de cancelación / ausencia (cuando status = cancelada | ausente) */
  cancelReason?: string;
  /** Origen: "online" = reserva web del paciente (entra como pendiente, a validar) */
  source?: "online" | "interna";
  branchId?: string;        // sucursal (multi-sede)
  telemed?: boolean;        // videoconsulta (telemedicina)
  /** Token aleatorio de la sala de videoconsulta. La sala se deriva de esto (no
   *  de cid+id, que son adivinables) para que nadie se cuele en la consulta. */
  videoToken?: string;
  /** Confirmación de citas: recordatorio WhatsApp/email ya enviado */
  reminderSent?: boolean;
  /** quién confirmó la cita (botika = automático por el bot) */
  confirmedVia?: "botika" | "manual";
  /** Box/sillón asignado a la cita (módulo Box) */
  boxId?: string;
  /** Plan de tratamiento al que pertenece la cita (paridad Dentalink) */
  budgetId?: string;
}

export type FormStatus = "pendiente" | "completado";

export interface PatientForm {
  id: string;
  templateName: string; // p.ej. "Anamnesis inicial"
  status: FormStatus;
  completedAt?: string; // Fecha de finalización
  fields: { label: string; value: string }[];
}

/* ===== Odontograma (notación FDI, motor externo vendorizado en components/odontogram-engine) ===== */
/** Estado de UNA pieza en el payload del motor de odontograma (React-Odontogram-Modul,
 *  vendorizado en components/odontogram-engine). El motor mismo trata estos campos como
 *  `any` internamente (ver registry/ = fuente de verdad declarativa de los ~30 campos posibles:
 *  toothSelection, caries, fillingSurfaces, restorationType, endo, mobility, note, etc.) — tiparlo
 *  campo por campo acá duplicaría esa fuente de verdad y se desincronizaría. Se usa
 *  Record<string, unknown> deliberadamente; el código propio de Novudent que lee/escribe campos
 *  puntuales (lib/odontogram-findings.ts, lib/seed.ts) los referencia por nombre con comentario. */
export interface OdontogramToothState {
  [field: string]: unknown;
}

/** Payload completo del odontograma de un paciente — mismo shape que
 *  collectExportPayload()/importStatus() del motor vendorizado. */
export interface OdontogramStatus {
  version: string;
  globals: {
    wisdomVisible?: boolean;
    showBase?: boolean;
    occlusalVisible?: boolean;
    showHealthyPulp?: boolean;
    edentulous?: boolean;
  };
  teeth: Record<string, OdontogramToothState>;
}

/** Odontograma vacío pero válido — fallback cuando un paciente todavía no tiene ninguno. */
export const DEFAULT_ODONTOGRAM_STATUS: OdontogramStatus = {
  version: "2.10",
  globals: {},
  teeth: {},
};

export interface EmrNote {
  id: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  kind: "diagnostico" | "tratamiento" | "plan" | "nota";
  text: string;
  /** Evolución estructurada SOAP (Subjetivo/Objetivo/Análisis/Plan). */
  soap?: { s?: string; o?: string; a?: string; p?: string };
  /** Firma electrónica del profesional (autoría + sello temporal). */
  signedBy?: string;
  signedAt?: string;
}

export interface Patient {
  id: string;
  clinicId: string;
  firstName: string;
  lastName: string;
  document: string; // CI
  phone: string;
  email?: string;
  birthDate?: string;
  insurer?: string;
  /** Datos demográficos (Análisis & Conversión): género y ciudad/localidad */
  gender?: "F" | "M" | "otro";
  city?: string;
  /** Datos personales completos (paridad Dentalink) */
  sex?: "M" | "F";              // sexo biológico (separado de género)
  tipo?: string;                // tipo/clasificación del paciente
  socialName?: string;          // nombre social (distinto del legal)
  foreigner?: boolean;          // extranjero (junto al documento)
  internalNumber?: string;      // número interno
  municipio?: string;           // municipio/comuna (separado de ciudad)
  address?: string;             // dirección
  activity?: string;            // actividad o profesión
  employer?: string;            // empleador
  landline?: string;            // teléfono fijo (phone = móvil)
  guardian?: string;            // apoderado
  referencia?: string;          // cómo nos conoció
  observaciones?: string;       // observaciones (demográfico, no clínico)
  legalRepDoc?: string;         // DNI representante legal
  emergencyContact?: string;    // contacto de emergencia (nombre + parentesco)
  emergencyPhone?: string;      // teléfono del contacto de emergencia
  /** Foto del paciente (data URL base64, redimensionada) */
  photo?: string;
  /** Datos médicos destacados de la cabecera (estilo Dentalink) */
  medicalAlerts?: string;
  conditions?: string;
  medications?: string;
  /* Flags de engagement (íconos del Patient Finder) */
  forms: PatientForm[];
  historyUpdatePending: boolean;
  /** fecha de envío registrada al marcar la actualización de historial como recibida (flujo clipboard) */
  historyUpdateDate?: string;
  emr: EmrNote[];
  /* Odontograma: pieza FDI -> estado (ausencia de entrada = pieza sana) */
  odontogram?: OdontogramStatus;
  /** Auditoría a nivel de documento (el motor no trackea por-diente quién tocó qué). */
  odontogramUpdatedBy?: string;
  odontogramUpdatedAt?: string;
  /* Recetas emitidas */
  prescriptions?: Prescription[];
  /* Archivos clínicos (imágenes/documentos) */
  files?: PatientFileRec[];
  /* Módulo de ortodoncia */
  ortho?: OrthoRecord;
  /* Periodontograma: sesiones de medición periodontal */
  perio?: PerioSession[];
  /* Última encuesta NPS respondida (vía Botika) — se mantiene por compatibilidad */
  nps?: { score: number; comment?: string; at: string };
  /* Histórico completo de encuestas NPS (no se pierde ninguna respuesta) */
  npsHistory?: { score: number; comment?: string; at: string }[];
}

/* ===== Periodontograma ===== */
/** Medición de una pieza: profundidad de sondaje en mm por sitio
 *  (3 vestibulares MV-V-DV + 3 linguopalatinos ML-L-DL), sangrado al
 *  sondaje por sitio y movilidad (escala Miller 0-3). null = sitio no
 *  medido. */
export interface PerioToothRecord {
  pd: (number | null)[];          // largo 6 — profundidad de sondaje (mm)
  bop: boolean[];                 // largo 6 — sangrado al sondaje
  recession?: (number | null)[];  // largo 6 — recesión gingival (mm)
  plaque?: boolean[];             // largo 6 — placa bacteriana por sitio
  mobility?: 0 | 1 | 2 | 3;
}

export interface PerioSession {
  id: string;
  date: string; // ISO
  by: string;   // profesional que midió
  teeth: Record<string, PerioToothRecord>; // clave = pieza FDI
  notes?: string;
}

/* ===== Facturación (sec. 3.3) ===== */
export type BillingFlag =
  | "ATHENA"
  | "MBILLED"
  | "HOLD"
  | "MGRHOLD"
  | "FACTURADO"
  | "SEGUIMIENTO"
  | "ACH";

export type ClaimType = "electronic" | "manual";

/** Procedure_Billing_Mapping: procedimiento adicional asociado al registro,
 *  con modificador opcional (el principal vive en cpt/dx/pos del registro). */
export interface BillingExtra {
  cpt: string;
  modifier?: string;
  amount: number;
}

export interface BillingRecord {
  id: string;
  clinicId: string;
  patientId: string;
  appointmentId?: string;
  cpt: string;
  dx: string;
  pos: string;
  modifier?: string;
  amount: number;
  discount: number;
  /** procedimientos adicionales del mismo reclamo (multi-procedimiento) */
  extras?: BillingExtra[];
  claimType: ClaimType;
  flags: BillingFlag[];
  holdReason?: string;
  history: { at: string; action: string; by: string }[];
}

/** Categoría clínica de la prestación (donut "Categoría de acciones" + Ventas por categoría). */
export type ProcedureCategory =
  | "diagnostico" | "prevencion" | "operatoria" | "endodoncia" | "periodoncia"
  | "protesis" | "cirugia" | "ortodoncia" | "estetica" | "general";

export interface Procedure {
  cpt: string;
  description: string;
  price: number;
  defaultDx: string[];
  /** Marca el arancel como quirúrgico (sugiere monitor de recuperación post-op) */
  surgical?: boolean;
  /** Categoría clínica para reportes */
  category?: ProcedureCategory;
}

/* ===== Presupuestos (planes de tratamiento) ===== */
export type BudgetStatus = "borrador" | "presentado" | "aceptado" | "completado" | "anulado";

export interface BudgetItem {
  id: string;
  cpt: string;
  description: string;
  /** pieza FDI opcional (11–48) */
  tooth?: string;
  price: number;
  /** agrupación en secciones del plan (paridad Dentalink) */
  section?: string;
  /** descuento por ítem (DSCTO); si falta, aplica el del presupuesto */
  discountPct?: number;
  status: "pendiente" | "realizado";
  doneAt?: string;
  doneBy?: string;
}

/** Cuota de un plan de financiamiento. */
export interface Installment {
  numero: number;
  dueDate: string;  // YYYY-MM-DD o ISO
  amount: number;
}

export interface Budget {
  id: string;
  clinicId: string;
  patientId: string;
  dentistId: string;
  createdAt: string;
  status: BudgetStatus;
  name?: string; // Nombre del plan (ej: "Ortodoncia fija")
  /** Datos RIPS/EPS (legislación CO) — banner "Actualizar los detalles RIPS". */
  rips?: { tipoDoc?: string; nroDoc?: string; eps?: string; regimen?: "contributivo" | "subsidiado" | "particular"; riesgos?: string; completo?: boolean };
  /** Nota de estética facial del plan. */
  facialNote?: string;
  /** Registro fotográfico facial (pre/post): imágenes base64 redimensionadas. */
  facialPhotos?: { id: string; label: string; dataUrl: string; at: string }[];
  /** Análisis/medidas faciales. */
  facialMeasures?: { tercios?: string; lineaMedia?: string; perfil?: string; sonrisa?: string };
  /** Vencimiento del presupuesto (ISO). Si falta, se asume 60 días. */
  dueDate?: string;
  items: BudgetItem[];
  /** Tipo de plan (Dentalink): general u ortodoncia. El seguimiento clínico de
   *  ortodoncia vive en `patient.ortho` (un tratamiento de ortodoncia por paciente). */
  planType?: "general" | "ortodoncia";
  /** descuento % (manual o por convenio) */
  discountPct?: number;
  /** convenio aplicado (nombre) */
  convenio?: string;
  /** cobro en cuotas: nº de cuotas pactadas */
  installments?: number;
  notes?: string;
  /** Comentarios para el paciente (se imprimen en el presupuesto) */
  patientComments?: string;
  /** Plan de cuotas de financiamiento (paridad Dentalink) */
  schedule?: Installment[];
  history: { at: string; action: string; by: string }[];
  /** Negociación de presupuesto abandonado (bot re-engancha al paciente) */
  negociacion?: {
    status: "en_curso" | "listo_para_cerrar" | "sin_respuesta" | "rechazado";
    intentos: number;
    ultimoContactoAt: string;
    financiacionElegida?: string;
    resumen?: string;
  };
}

/* ===== Caja: pagos y gastos ===== */
export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "cheque" | "qr";

export interface Payment {
  id: string;
  clinicId: string;
  patientId: string;
  /** presupuesto al que abona (opcional: pago libre) */
  budgetId?: string;
  date: string; // ISO
  amount: number;
  method: PaymentMethod;
  concept: string;
  receivedBy: string;
  /** Facturación (paridad Dentalink) */
  paymentNumber?: string;   // N° de pago visible
  receiptNumber?: string;   // N° de boleta/comprobante
  dueDate?: string;         // vencimiento (ISO o YYYY-MM-DD)
  /** Anulación (soft-delete) → "Pagos eliminados" */
  voidedAt?: string;
  voidedBy?: string;
  /** Motivo de anulación (libre: "Rebotó", "El paciente lo retiró"…). Aplica a
   *  cualquier pago anulado, no solo cheques. */
  voidReason?: string;
  /** Datos del cheque. Presente únicamente cuando `method === "cheque"`. */
  check?: {
    number: string;
    bank: string;
    /** Fecha en que se puede cobrar (YYYY-MM-DD) — el "vencimiento" del cheque. */
    cashDate: string;
    /** Cuándo se confirmó que el banco lo acreditó. Ausente = todavía pendiente. */
    cobradoAt?: string;
    cobradoBy?: string;
  };
}

export interface Expense {
  id: string;
  clinicId: string;
  date: string; // ISO
  category: string;
  supplier?: string;
  description: string;
  amount: number;
  registeredBy: string;
  invoiceDate?: string; // Fecha de factura (YYYY-MM-DD)
  payDate?: string;     // Fecha de pago (YYYY-MM-DD)
  cashSessionId?: string; // Caja (sesión) a la que se asocia el gasto
}

/* ===== Inventario (bodega virtual) ===== */
export interface StockItem {
  id: string;
  clinicId: string;
  name: string;
  category: string;
  unit: string; // unidad, caja, ml…
  stock: number;
  minStock: number;
  optimalStock?: number;  // nivel óptimo (semáforo 3 niveles)
  maxStock?: number;      // nivel máximo (sobre-stock)
  supplier?: string;      // proveedor
  cost: number; // costo unitario
}

export interface StockMove {
  id: string;
  clinicId: string;
  itemId: string;
  date: string;
  type: "entrada" | "salida";
  qty: number;
  reason: string;
  by: string;
}

/* ===== Recetas (plantillas de prescripción) ===== */
export interface PrescriptionItem {
  drug: string;
  dose: string;
  freq: string;
  days: string;
}

export interface Prescription {
  id: string;
  date: string;
  dentistId: string;
  dentistName: string;
  items: PrescriptionItem[];
  notes?: string;
}

/* ===== Archivos clínicos del paciente (imágenes/documentos) ===== */
export interface PatientFileRec {
  id: string;
  name: string;
  kind: "imagen" | "documento";
  /** dataURL comprimido (≤ ~150 KB) — apto para Firestore */
  dataUrl: string;
  uploadedAt: string;
  by: string;
}

/* ===== Firma electrónica / consentimientos ===== */
export interface ConsentTemplate {
  id: string;
  title: string;
  body: string;
}

export type SignatureStatus = "pendiente" | "firmado" | "anulado";

export interface SignatureDoc {
  id: string;
  patientId: string;
  templateId?: string;
  title: string;
  body: string;            // snapshot inmutable
  status: SignatureStatus;
  token: string;
  signatureImage?: string; // PNG base64
  signedAt?: string;
  signedByName?: string;
  channel?: "consultorio" | "remoto";
  createdBy: string;
  createdAt: string;
}

/* ===== Análisis IA de radiografías ===== */
export type RxKind = "panoramica" | "bitewing" | "periapical" | "otra";
export type RxSeverity = "observacion" | "leve" | "moderado" | "severo";

export interface RadiographFinding {
  id: string;
  /** Caja normalizada 0..1 sobre la imagen. */
  box: { x: number; y: number; w: number; h: number };
  label: string;
  tooth?: string;            // FDI si aplica
  severity: RxSeverity;
  note?: string;
  source: "ia" | "profesional";
}

export interface RadiographRec {
  id: string;
  patientId: string;
  kind: RxKind;
  image: string;             // data URL base64 JPEG (redimensionado)
  takenAt?: string;
  createdAt: string;
  createdBy: string;
  findings: RadiographFinding[];
  aiSummary?: string;
  patientExplanation?: string;
  aiModel?: string;
  status: "borrador" | "revisado";
  reviewedBy?: string;
  reviewedAt?: string;
}

/* ===== Módulo de ortodoncia ===== */
export interface OrthoControl {
  date: string;
  note: string;
  by: string;
}

export interface OrthoRecord {
  active: boolean;
  applianceType: string; // brackets metálicos, estéticos, alineadores…
  diagnosis: string;
  startDate: string;
  monthlyFee: number;
  controls: OrthoControl[];
  /* ===== Seguimiento clínico (vista Plan de tratamiento estilo Dentalink) ===== */
  /** Duración estimada del tratamiento en meses (ej. 24) → "X de N meses" */
  totalMonths?: number;
  /** Avance clínico real 0–100 (lo carga el profesional) → donut "Progreso Real" */
  progressReal?: number;
  /** Último arco superior / inferior colocado */
  upperArch?: string;
  lowerArch?: string;
  /** Elásticos: tipo y configuración */
  elasticType?: string;
  elasticConfig?: string;
  /** Próximo control (ISO o YYYY-MM-DD) */
  nextControlDate?: string;
  /** Curva de higiene (promedio, ej. 2.0) */
  hygieneCurve?: number;
  /** Indicaciones para la próxima sesión */
  nextSessionNotes?: string;
}

/* ===== Lista de espera ===== */
export interface WaitlistEntry {
  id: string;
  clinicId: string;
  patientId: string;
  reason: string;
  preference: string; // franja/día preferido
  createdAt: string;
}

/* ===== Integración Botika (bot agéntico de WhatsApp) =====
 * Patrón outbox/inbox sobre Firestore: Novudent encola tareas de mensajería,
 * el worker de Botika las escucha, conversa por WhatsApp y escribe `result`.
 * Contrato completo en docs/INTEGRACION-BOTIKA.md */
export type OutboxTaskType = "confirmar_cita" | "nps" | "cobranza" | "reagendar" | "postop" | "postop_alert" | "negociacion" | "negociacion_listo";
export type OutboxStatus = "pendiente" | "enviado" | "respondido" | "error";

export interface OutboxResult {
  at: string;
  /** respuesta libre del paciente (resumen de Botika) */
  reply?: string;
  /** confirmar_cita / reagendar */
  confirmed?: boolean;
  /** encuesta NPS (0–10) */
  nps?: number;
  comment?: string;
  error?: string;
  severity?: "verde" | "amarillo" | "rojo";
  pain?: number;     // 0-10
  summary?: string;  // resumen IA de 1 línea
  /** negociacion: resultado de la negociación de presupuesto */
  negociacionStatus?: "listo_para_cerrar" | "negociando" | "rechazado";
  financiacionElegida?: string;
}

export interface OutboxTask {
  id: string;
  clinicId: string;
  type: OutboxTaskType;
  patientId: string;
  phone: string;
  message: string;
  /** referencia: citaId (confirmar_cita/reagendar) o budgetId (nps/cobranza) */
  refId?: string;
  status: OutboxStatus;
  createdAt: string;
  createdBy: string;
  result?: OutboxResult;
}

export interface BotikaConfig {
  connected: boolean;
  automations: {
    confirmCita: boolean; // al crear cita → tarea de confirmación
    nps: boolean; // al completar presupuesto → encuesta
    cobranza: boolean; // recordatorios de deuda conversacionales
    reagendar: boolean; // citas canceladas → reagendamiento
    negociacion: boolean; // presupuestos presentados sin aceptar → re-engagement
  };
  /** plantillas personalizadas por automatización (vacío = default de Novudent) */
  templates?: Partial<Record<keyof BotikaConfig["automations"], string>>;
  /** Negociación de presupuestos abandonados */
  negociacion?: {
    diasGatillo: number;   // días en "presentado" antes de reenganchar
    maxIntentos: number;   // tope de contactos
    financiacion: { maxCuotas: number; sinInteres: boolean; anticipoMinPct: number };
  };
}

export interface Session {
  userId: string;
  clinicId: string;
  role: Role;
  name: string;
}

/* ===== Monitor de recuperación post-operatoria ===== */
export interface RecoveryTouchpoint {
  offsetHours: 24 | 48 | 72;
  dueAt: string;
  status: "pendiente" | "enviado" | "respondido" | "vencido";
  severity?: "verde" | "amarillo" | "rojo";
  pain?: number;
  reply?: string;
  summary?: string;
  repliedAt?: string;
}
export interface RecoveryMonitor {
  id: string;
  clinicId: string;
  patientId: string;
  dentistId: string;
  procedure: string;
  startedAt: string;
  touchpoints: RecoveryTouchpoint[];
  status: "activo" | "completado" | "escalado";
  worstSeverity?: "verde" | "amarillo" | "rojo";
  alertedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

// ===== Módulos de paridad Dentalink (CRM, Laboratorios, Liquidaciones, Box) =====
export type CrmStage = "nuevo" | "contactado" | "presupuesto" | "seguimiento" | "ganado" | "perdido";
export interface CrmCard { id: string; patientId: string; stage: CrmStage; note?: string; createdAt: string; updatedAt: string; }
export interface Campaign { id: string; name: string; channel: "whatsapp" | "email"; message: string; audience: string; createdAt: string; sentAt?: string; sentCount?: number; }

export type LabStatus = "enviado" | "en_proceso" | "recibido" | "entregado";
export interface LabOrder { id: string; patientId: string; professionalId?: string; lab: string; workType: string; sentAt: string; dueAt?: string; cost?: number; status: LabStatus; notes?: string; createdAt: string; }

export type SettlementStatus = "pendiente" | "liquidado";
export interface Settlement { id: string; professionalId: string; periodFrom: string; periodTo: string; production: number; commissionPct: number; salaryBase?: number; amount: number; status: SettlementStatus; createdAt: string; paidAt?: string; }

export interface Box { id: string; name: string; color?: string; }

export type PatientNoteKind = "comentario" | "tarea" | "email";
/** Nota del paciente (Datos personales, paridad Dentalink): comentario administrativo,
 *  tarea de gestión o registro de email. */
export interface PatientNote {
  id: string;
  clinicId: string;
  patientId: string;
  kind: PatientNoteKind;
  text: string;          // comentario / descripción de la tarea / cuerpo del email
  subject?: string;      // asunto (emails)
  done?: boolean;        // tareas
  dueDate?: string;      // tareas (YYYY-MM-DD)
  createdAt: string;
  createdBy: string;
}

export type FiscalDocKind = "boleta" | "devolucion";
/** Documento fiscal del paciente: boleta/factura emitida o devolución (paridad Dentalink). */
export interface FiscalDoc {
  id: string;
  clinicId: string;
  patientId: string;
  kind: FiscalDocKind;
  number?: string;      // N° de boleta/factura
  amount: number;
  date: string;
  paymentId?: string;   // pago asociado
  reason?: string;      // motivo (devoluciones)
  by: string;
}

export type CashSessionStatus = "abierta" | "cerrada";
/** Sesión de caja (libro de caja): apertura/cierre con arqueo por usuario. */
export interface CashSession {
  id: string;
  clinicId: string;
  userId: string;
  userName: string;
  openedAt: string;        // ISO
  closedAt?: string;       // ISO
  openingBalance: number;  // saldo inicial declarado
  countedCash?: number;    // efectivo contado al cierre (arqueo)
  note?: string;
  branchId?: string;       // sucursal (multi-sede)
  status: CashSessionStatus;
}

/** Ciclo de esterilización de instrumental (cumplimiento — spec 8.7). */
export interface SterilizationCycle {
  id: string;
  clinicId: string;
  date: string;                 // fecha/hora del ciclo (ISO)
  responsibleId?: string;       // usuario responsable
  method: "autoclave" | "calor_seco" | "quimico";
  load: string;                 // descripción del instrumental / carga
  cycleNumber?: string;         // n.º de ciclo del equipo
  lot?: string;                 // lote del paquete
  temperature?: number;         // °C
  chemicalIndicator?: "ok" | "fail";                 // indicador químico
  biologicalIndicator?: "ok" | "fail" | "pendiente"; // indicador biológico (espora)
  notes?: string;
}

/** Mensaje del chat interno del equipo (recepción ↔ odontólogos ↔ admin). */
export interface TeamMessage {
  id: string;
  clinicId: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
}

/** Encuestas de satisfacción / NPS (spec 7.4). */
export type SurveyKind = "nps" | "satisfaccion";
export interface SurveyQuestion {
  id: string;
  text: string;
  type: "rating" | "nps" | "text"; // rating 1-5 · nps 0-10 · text abierto
}
export interface Survey {
  id: string;
  clinicId: string;
  title: string;
  kind: SurveyKind;
  questions: SurveyQuestion[];
  active: boolean;
  createdAt: string;
}
export interface SurveyResponse {
  id: string;
  clinicId: string;
  surveyId: string;
  patientName?: string;
  answers: { questionId: string; value: number | string }[];
  npsScore?: number;       // 0-10 (encuestas NPS)
  comment?: string;
  createdAt: string;
}

/** Tarea de gestión (spec 3.2 / 6.5 / 7.2): bandeja de captura/control/cobranza/cita. */
export type MgmtTaskType = "cita" | "captura" | "control" | "cobranza" | "cheque" | "personalizada";
export interface MgmtTask {
  id: string;
  clinicId: string;
  type: MgmtTaskType;
  patientId?: string;
  patientName?: string;     // denormalizado (fallback si no está en patients)
  title: string;
  detail?: string;
  budgetId?: string;
  assigneeId?: string;
  status: "pendiente" | "en_proceso" | "cerrada";
  resolution?: "acepto" | "contacto_posterior" | "rechazo";
  dueDate?: string;
  createdAt: string;
  updatedAt?: string;
  /** Clave de la tarea DERIVADA sobre la que este doc actúa como override
   *  (`cobranza:p_123`). Vacío en las tareas manuales (`personalizada`).
   *  Las derivadas no se guardan: este doc solo carga la decisión humana. */
  derivedKey?: string;
  /** Instancia de la condición contra la que se cerró esta tarea derivada
   *  (ver `DerivedTask.instanceKey`). Si la instancia actual es otra, el cierre
   *  ya no aplica: es una situación nueva, no la que el humano resolvió. */
  closedInstance?: string;
  /** Postergada hasta esta fecha (YYYY-MM-DD). Antes de ella la tarea no
   *  aparece en la bandeja del día ni cuenta como atrasada. */
  snoozedUntil?: string;
}

/** Plazo de una regla automática: cuánto pasa desde el evento que la origina
 *  hasta que la tarea vence y aparece en "Tareas del día". */
export type TaskDeadline =
  | { kind: "inmediato" }
  | { kind: "dias"; n: number };

/** Plazo por tipo de tarea automática. Vive en `Clinic.config.taskDeadlines`.
 *  Lo que no esté configurado usa DEFAULT_DEADLINES de lib/tareas.ts. */
// Los 4 tipos cuyo vencimiento es "evento + plazo configurable". "cheque" queda
// afuera a propósito: su vencimiento YA es una fecha absoluta (la fecha de cobro
// del cheque), no un plazo que sumar — agregarlo acá obligaría a un default sin
// uso real (ver lib/tareas.ts, PlazoTaskType).
export type TaskDeadlines = Partial<Record<"cita" | "captura" | "control" | "cobranza", TaskDeadline>>;

/** Registro ambiental de residuos (cumplimiento CO — spec 8.7). */
export interface EnvironmentalLog {
  id: string;
  clinicId: string;
  date: string;
  wasteType: "biologico" | "cortopunzante" | "quimico" | "anatomopatologico" | "comun" | "reciclable";
  quantityKg: number;
  responsibleId?: string;
  collector?: string;       // empresa gestora externa
  manifest?: string;        // n.º de manifiesto / acta de entrega
  notes?: string;
}

/** Video educativo / 3D para mostrar al paciente (spec 5.8). */
export interface EduVideo {
  id: string;
  clinicId: string;
  title: string;
  category: string;         // ej. Implantes, Endodoncia, Ortodoncia
  url: string;              // YouTube/Vimeo o búsqueda
  description?: string;
}

/** Sucursal / sede de la clínica (multi-sede — spec 11). */
export interface Branch {
  id: string;
  clinicId: string;
  name: string;
  address?: string;
  phone?: string;
  isMain?: boolean;   // sede principal
  active?: boolean;
}

export interface DB {
  clinics: Clinic[];
  users: User[];
  patients: Patient[];
  appointments: Appointment[];
  billing: BillingRecord[];
  procedures: Procedure[];
  budgets: Budget[];
  payments: Payment[];
  expenses: Expense[];
  stock: StockItem[];
  stockMoves: StockMove[];
  waitlist: WaitlistEntry[];
  outbox: OutboxTask[];
  recoveryMonitors: RecoveryMonitor[];
  radiographs: RadiographRec[];
  signatures: SignatureDoc[];
  crmCards: CrmCard[];
  campaigns: Campaign[];
  labOrders: LabOrder[];
  settlements: Settlement[];
  boxes: Box[];
  patientNotes: PatientNote[];
  fiscalDocs: FiscalDoc[];
  cashSessions: CashSession[];
  sterilizationCycles: SterilizationCycle[];
  teamMessages: TeamMessage[];
  surveys: Survey[];
  surveyResponses: SurveyResponse[];
  mgmtTasks: MgmtTask[];
  environmentalLogs: EnvironmentalLog[];
  eduVideos: EduVideo[];
  branches: Branch[];
  onboarding: { usersCreated: boolean; servicesDefined: boolean; tourDone: boolean };
  /** Suscripción SaaS de la clínica activa (subscriptions/{cid}, solo-lectura
   *  para el cliente). `null` = clínica anterior al cobro → grandfathered. */
  subscription?: Subscription | null;
}
