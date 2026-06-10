import type { DB, Appointment, Patient } from "./types";

/** Devuelve el lunes de la semana actual a las 00:00 */
function monday(): Date {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // 0 = lunes
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

function at(dayOffset: number, h: number, m = 0): string {
  const d = monday();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const CLINIC_ID = "cl_demo";

const patients: Patient[] = [
  {
    id: "p1", clinicId: CLINIC_ID, firstName: "María", lastName: "González", document: "3.456.789",
    phone: "+595 981 111 111", email: "maria@example.com", birthDate: "1988-04-12", insurer: "Asismed",
    forms: [
      { id: "f1", templateName: "Anamnesis inicial", status: "pendiente", fields: [{ label: "Alergias", value: "" }, { label: "Medicación actual", value: "" }, { label: "Antecedentes", value: "" }] },
      { id: "f2", templateName: "Consentimiento informado", status: "completado", completedAt: "2026-05-20", fields: [{ label: "Firmado por", value: "María González" }] },
    ],
    historyUpdatePending: true,
    emr: [
      { id: "n1", authorId: "u2", authorName: "Dra. Sofía Benítez", createdAt: at(-7, 10), kind: "diagnostico", text: "Caries oclusal en pieza 16 (K02.9). Sensibilidad al frío." },
      { id: "n2", authorId: "u2", authorName: "Dra. Sofía Benítez", createdAt: at(-7, 10, 30), kind: "plan", text: "Plan: resina compuesta en 16. Control de placa. Profilaxis en próxima visita." },
    ],
    odontogram: {
      "16": { condition: "caries", surfaces: ["O"], note: "Oclusal, sensibilidad al frío", updatedAt: at(-7, 10), updatedBy: "Dra. Sofía Benítez" },
      "24": { condition: "caries", surfaces: ["M"], note: "Interproximal mesial", updatedAt: at(-7, 10), updatedBy: "Dra. Sofía Benítez" },
      "11": { condition: "restaurado", surfaces: ["V"], note: "Resina 2024", updatedAt: at(-30, 9), updatedBy: "Dra. Sofía Benítez" },
      "26": { condition: "corona", note: "Corona cerámica", updatedAt: at(-60, 9), updatedBy: "Dra. Sofía Benítez" },
      "28": { condition: "ausente", updatedAt: at(-90, 9), updatedBy: "Dra. Sofía Benítez" },
    },
  },
  {
    id: "p2", clinicId: CLINIC_ID, firstName: "Juan", lastName: "Ríos", document: "4.567.890",
    phone: "+595 982 222 222", birthDate: "1995-09-03",
    forms: [{ id: "f3", templateName: "Anamnesis inicial", status: "pendiente", fields: [{ label: "Alergias", value: "" }, { label: "Medicación actual", value: "" }] }],
    historyUpdatePending: false,
    emr: [],
  },
  {
    id: "p3", clinicId: CLINIC_ID, firstName: "Camila", lastName: "Ortega", document: "5.678.901",
    phone: "+595 983 333 333", email: "cami@example.com", birthDate: "2001-01-26", insurer: "OSDE PY",
    forms: [],
    historyUpdatePending: false,
    emr: [{ id: "n3", authorId: "u2", authorName: "Dra. Sofía Benítez", createdAt: at(-14, 9), kind: "tratamiento", text: "Profilaxis realizada (D1110). Encías saludables, leve gingivitis en sector anteroinferior." }],
  },
  {
    id: "p4", clinicId: CLINIC_ID, firstName: "Andrés", lastName: "Mejía", document: "2.345.678",
    phone: "+595 984 444 444", birthDate: "1979-11-30",
    forms: [{ id: "f4", templateName: "Historia médica (actualización)", status: "pendiente", fields: [{ label: "Cambios de salud", value: "" }, { label: "Nueva medicación", value: "" }] }],
    historyUpdatePending: true,
    emr: [{ id: "n4", authorId: "u2", authorName: "Dra. Sofía Benítez", createdAt: at(-3, 11), kind: "diagnostico", text: "Resto radicular pieza 28 (K08.3). Indicada exodoncia simple." }],
    odontogram: {
      "28": { condition: "extraccion", note: "Resto radicular — exodoncia programada", updatedAt: at(-3, 11), updatedBy: "Dra. Sofía Benítez" },
      "36": { condition: "endodoncia", note: "Endodoncia 2023, asintomática", updatedAt: at(-120, 9), updatedBy: "Dra. Sofía Benítez" },
      "46": { condition: "implante", note: "Implante + corona 2022", updatedAt: at(-200, 9), updatedBy: "Dra. Sofía Benítez" },
    },
  },
  {
    id: "p5", clinicId: CLINIC_ID, firstName: "Lucía", lastName: "Ferreira", document: "6.789.012",
    phone: "+595 985 555 555", birthDate: "1992-06-17", insurer: "Asismed",
    forms: [], historyUpdatePending: false, emr: [],
  },
  {
    id: "p6", clinicId: CLINIC_ID, firstName: "Marco", lastName: "Giménez", document: "1.234.567",
    phone: "+595 986 666 666", birthDate: "1985-02-08",
    forms: [], historyUpdatePending: false,
    emr: [{ id: "n5", authorId: "u2", authorName: "Dra. Sofía Benítez", createdAt: at(-1, 16), kind: "plan", text: "Inicio de ortodoncia (D8080). Estudio cefalométrico solicitado." }],
  },
];

const appointments: Appointment[] = [
  { id: "a1", clinicId: CLINIC_ID, patientId: "p1", dentistId: "u2", title: "Resina pieza 16", start: at(0, 9), end: at(0, 10), status: "confirmada", amount: 420000, discount: 0 },
  { id: "a2", clinicId: CLINIC_ID, patientId: "p2", dentistId: "u2", title: "Primera consulta", start: at(0, 11), end: at(0, 11, 40), status: "pendiente", amount: 150000, discount: 0 },
  { id: "a3", clinicId: CLINIC_ID, patientId: "p3", dentistId: "u2", title: "Profilaxis", start: at(1, 10), end: at(1, 10, 45), status: "completada", amount: 250000, discount: 25000 },
  { id: "a4", clinicId: CLINIC_ID, patientId: "p4", dentistId: "u2", title: "Exodoncia 28", start: at(2, 9, 30), end: at(2, 10, 30), status: "confirmada", amount: 600000, discount: 0 },
  { id: "a5", clinicId: CLINIC_ID, patientId: "p5", dentistId: "u2", title: "Control + limpieza", start: at(2, 15), end: at(2, 16), status: "pendiente", amount: 250000, discount: 0 },
  { id: "a6", clinicId: CLINIC_ID, patientId: "p6", dentistId: "u2", title: "Control ortodoncia", start: at(3, 17), end: at(3, 17, 30), status: "confirmada", amount: 350000, discount: 0 },
  { id: "a7", clinicId: CLINIC_ID, patientId: "p3", dentistId: "u2", title: "Blanqueamiento — evaluación", start: at(4, 14), end: at(4, 14, 30), status: "pendiente", amount: 0, discount: 0 },
  { id: "a8", clinicId: CLINIC_ID, patientId: "p1", dentistId: "u2", title: "Control post-operatorio", start: at(4, 9), end: at(4, 9, 20), status: "cancelada", amount: 0, discount: 0 },
];

export function buildSeed(): DB {
  return {
    clinics: [
      { id: CLINIC_ID, name: "Clínica Demo Asunción", config: { timezone: "America/Asuncion", currency: "PYG", address: "Av. España 1234, Asunción", phone: "+595 21 555 000" } },
    ],
    users: [
      { id: "u1", clinicId: CLINIC_ID, name: "Carlos Admin", email: "admin@novudent.app", role: "admin", color: "#1769E0", active: true },
      { id: "u2", clinicId: CLINIC_ID, name: "Dra. Sofía Benítez", email: "sofia@novudent.app", role: "dentist", color: "#0E9F6E", active: true },
      { id: "u3", clinicId: CLINIC_ID, name: "Paola Asistente", email: "paola@novudent.app", role: "assistant", color: "#B45309", active: true },
    ],
    patients,
    appointments,
    billing: [
      {
        id: "b1", clinicId: CLINIC_ID, patientId: "p3", appointmentId: "a3", cpt: "D1110", dx: "Z01.20", pos: "11", modifier: "",
        amount: 250000, discount: 25000, claimType: "electronic", flags: ["ATHENA"], history: [{ at: at(-1, 12), action: "Registro creado", by: "Paola Asistente" }],
      },
      {
        id: "b2", clinicId: CLINIC_ID, patientId: "p1", appointmentId: "a1", cpt: "D2330", dx: "K02.9", pos: "11", modifier: "",
        amount: 420000, discount: 0, extras: [{ cpt: "D0120", modifier: "25", amount: 150000 }], claimType: "electronic", flags: ["ATHENA", "MBILLED", "HOLD"],
        holdReason: "Retención automática: reclamo electrónico en cola de validación.",
        history: [
          { at: at(-2, 9), action: "Registro creado", by: "Paola Asistente" },
          { at: at(-1, 9), action: "Enviado a cobro (MBILLED)", by: "Paola Asistente" },
          { at: at(-1, 9), action: "Retención automática (HOLD)", by: "sistema" },
        ],
      },
      {
        id: "b3", clinicId: CLINIC_ID, patientId: "p4", appointmentId: "a4", cpt: "D7140", dx: "K08.3", pos: "11", modifier: "",
        amount: 600000, discount: 0, claimType: "manual", flags: ["MBILLED", "MGRHOLD"],
        holdReason: "Retención manual: requiere revisión humana antes del envío.",
        history: [
          { at: at(-2, 14), action: "Registro creado", by: "Carlos Admin" },
          { at: at(-1, 10), action: "Enviado a cobro (MBILLED)", by: "Carlos Admin" },
          { at: at(-1, 10), action: "Retención manual (MGRHOLD)", by: "sistema" },
        ],
      },
      {
        id: "b4", clinicId: CLINIC_ID, patientId: "p6", cpt: "D8080", dx: "M26.4", pos: "11", modifier: "",
        amount: 4500000, discount: 0, claimType: "electronic", flags: ["ATHENA", "MBILLED", "FACTURADO", "ACH"],
        history: [
          { at: at(-9, 9), action: "Registro creado", by: "Paola Asistente" },
          { at: at(-8, 9), action: "Enviado a cobro (MBILLED)", by: "Paola Asistente" },
          { at: at(-8, 9), action: "Retención automática (HOLD)", by: "sistema" },
          { at: at(-7, 11), action: "Liberado y facturado (Release from Hold → FACTURADO)", by: "Carlos Admin" },
          { at: at(-6, 8), action: "Pago automático activado (ACH)", by: "Carlos Admin" },
        ],
      },
      {
        id: "b5", clinicId: CLINIC_ID, patientId: "p2", appointmentId: "a2", cpt: "D0120", dx: "Z01.20", pos: "11", modifier: "",
        amount: 150000, discount: 0, claimType: "electronic", flags: [], history: [{ at: at(0, 8), action: "Registro creado", by: "Paola Asistente" }],
      },
    ],
    procedures: [
      { cpt: "D0120", description: "Evaluación oral periódica", price: 150000, defaultDx: ["Z01.20"] },
      { cpt: "D1110", description: "Profilaxis (adulto)", price: 250000, defaultDx: ["Z01.20"] },
      { cpt: "D2330", description: "Resina compuesta — 1 superficie", price: 420000, defaultDx: ["K02.9"] },
      { cpt: "D2740", description: "Corona de porcelana/cerámica", price: 2800000, defaultDx: ["K08.531"] },
      { cpt: "D3310", description: "Endodoncia — anterior", price: 1200000, defaultDx: ["K04.0"] },
      { cpt: "D4341", description: "Raspado y alisado radicular (cuadrante)", price: 550000, defaultDx: ["K05.30"] },
      { cpt: "D7140", description: "Exodoncia simple", price: 600000, defaultDx: ["K08.3"] },
      { cpt: "D8080", description: "Ortodoncia integral (adolescente/adulto)", price: 4500000, defaultDx: ["M26.4"] },
    ],
    onboarding: { usersCreated: true, servicesDefined: true, tourDone: false },
  };
}
