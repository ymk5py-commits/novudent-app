/* ===== Modelo de datos Novudent (sec. 4 del Documento Maestro) ===== */

export type Role = "admin" | "dentist" | "assistant";

/** Convenio empresarial / aseguradora con descuento pactado */
export interface Convenio {
  name: string;
  discountPct: number;
}

export interface Clinic {
  id: string;
  name: string;
  /** Plan contratado (solo | clinica | cadena) — limita módulos y usuarios.
   *  Clínicas creadas antes del sistema de planes → "clinica" (lib/plan.ts planOf). */
  plan?: "solo" | "clinica" | "cadena";
  config: {
    timezone: string;
    currency: "PYG" | "USD";
    address?: string;
    phone?: string;
    /** Gestión de convenios (descuento % aplicable a presupuestos) */
    convenios?: Convenio[];
    /** Plantilla de recordatorio de cita (placeholders {paciente} {fecha} {hora} {clinica}) */
    reminderTemplate?: string;
    /** Integración Botika (bot de WhatsApp con IA) */
    botika?: BotikaConfig;
  };
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
}

export type AppointmentStatus = "confirmada" | "pendiente" | "completada" | "cancelada";

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
  /** Confirmación de citas: recordatorio WhatsApp/email ya enviado */
  reminderSent?: boolean;
  /** quién confirmó la cita (botika = automático por el bot) */
  confirmedVia?: "botika" | "manual";
}

export type FormStatus = "pendiente" | "completado";

export interface PatientForm {
  id: string;
  templateName: string; // p.ej. "Anamnesis inicial"
  status: FormStatus;
  completedAt?: string; // Fecha de finalización
  fields: { label: string; value: string }[];
}

/* ===== Odontograma (notación FDI) ===== */
export type ToothCondition =
  | "caries"
  | "restaurado"
  | "corona"
  | "endodoncia"
  | "extraccion" // extracción indicada
  | "ausente"
  | "implante";

/** Superficies dentales: Mesial, Distal, Vestibular, Lingual/Palatina, Oclusal/Incisal */
export type ToothSurface = "M" | "D" | "V" | "L" | "O";

export interface ToothRecord {
  condition: ToothCondition;
  /** superficies afectadas (aplica a caries y restauraciones) */
  surfaces?: ToothSurface[];
  note?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface EmrNote {
  id: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  kind: "diagnostico" | "tratamiento" | "plan" | "nota";
  text: string;
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
  /* Flags de engagement (íconos del Patient Finder) */
  forms: PatientForm[];
  historyUpdatePending: boolean;
  /** fecha de envío registrada al marcar la actualización de historial como recibida (flujo clipboard) */
  historyUpdateDate?: string;
  emr: EmrNote[];
  /* Odontograma: pieza FDI -> estado (ausencia de entrada = pieza sana) */
  odontogram?: Record<string, ToothRecord>;
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
  pd: (number | null)[];   // largo 6
  bop: boolean[];          // largo 6
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

export interface Procedure {
  cpt: string;
  description: string;
  price: number;
  defaultDx: string[];
  /** Marca el arancel como quirúrgico (sugiere monitor de recuperación post-op) */
  surgical?: boolean;
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
  status: "pendiente" | "realizado";
  doneAt?: string;
  doneBy?: string;
}

export interface Budget {
  id: string;
  clinicId: string;
  patientId: string;
  dentistId: string;
  createdAt: string;
  status: BudgetStatus;
  items: BudgetItem[];
  /** descuento % (manual o por convenio) */
  discountPct?: number;
  /** convenio aplicado (nombre) */
  convenio?: string;
  /** cobro en cuotas: nº de cuotas pactadas */
  installments?: number;
  notes?: string;
  history: { at: string; action: string; by: string }[];
}

/* ===== Caja: pagos y gastos ===== */
export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "qr";

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
export type OutboxTaskType = "confirmar_cita" | "nps" | "cobranza" | "reagendar" | "postop" | "postop_alert";
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
  };
  /** plantillas personalizadas por automatización (vacío = default de Novudent) */
  templates?: Partial<Record<keyof BotikaConfig["automations"], string>>;
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
  onboarding: { usersCreated: boolean; servicesDefined: boolean; tourDone: boolean };
}
