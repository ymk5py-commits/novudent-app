/* ===== Modelo de datos Novudent (sec. 4 del Documento Maestro) ===== */

export type Role = "admin" | "dentist" | "assistant";

export interface Clinic {
  id: string;
  name: string;
  config: {
    timezone: string;
    currency: "PYG" | "USD";
    address?: string;
    phone?: string;
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
}

export type AppointmentStatus = "confirmada" | "pendiente" | "cancelada";

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
}

export type FormStatus = "pendiente" | "completado";

export interface PatientForm {
  id: string;
  templateName: string; // p.ej. "Anamnesis inicial"
  status: FormStatus;
  completedAt?: string; // Fecha de finalización
  fields: { label: string; value: string }[];
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
  emr: EmrNote[];
}

/* ===== Facturación (sec. 3.3) ===== */
export type BillingFlag =
  | "ATHENA"
  | "MBILLED"
  | "HOLD"
  | "MGRHOLD"
  | "FACTURADO"
  | "ACH";

export type ClaimType = "electronic" | "manual";

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
}

export interface Session {
  userId: string;
  clinicId: string;
  role: Role;
  name: string;
}

export interface DB {
  clinics: Clinic[];
  users: User[];
  patients: Patient[];
  appointments: Appointment[];
  billing: BillingRecord[];
  procedures: Procedure[];
  onboarding: { usersCreated: boolean; servicesDefined: boolean; tourDone: boolean };
}
