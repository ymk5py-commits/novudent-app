import type { DB, Appointment, Patient, Budget, Payment, Expense, StockItem, StockMove, WaitlistEntry, OutboxTask, ConsentTemplate } from "./types";

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
    phone: "+595 981 111 111", email: "maria@example.com", birthDate: "1988-04-12", insurer: "Asismed", sex: "F", gender: "F", city: "Asunción", municipio: "Asunción",
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
    prescriptions: [
      {
        id: "rx1", date: at(-7, 11), dentistId: "u2", dentistName: "Dra. Sofía Benítez",
        items: [
          { drug: "Amoxicilina 500 mg", dose: "1 cápsula", freq: "cada 8 horas", days: "7 días" },
          { drug: "Ibuprofeno 400 mg", dose: "1 comprimido", freq: "cada 8 horas", days: "3 días" },
        ],
        notes: "Tomar con alimentos. Suspender ibuprofeno si hay molestias gástricas.",
      },
    ],
    nps: { score: 7, at: at(-20, 9) },
  },
  {
    id: "p2", clinicId: CLINIC_ID, firstName: "Juan", lastName: "Ríos", document: "4.567.890",
    phone: "+595 982 222 222", birthDate: "1995-09-03", sex: "M", gender: "M", city: "Lambaré", municipio: "Lambaré",
    forms: [{ id: "f3", templateName: "Anamnesis inicial", status: "pendiente", fields: [{ label: "Alergias", value: "" }, { label: "Medicación actual", value: "" }] }],
    historyUpdatePending: false,
    emr: [],
  },
  {
    id: "p3", clinicId: CLINIC_ID, firstName: "Camila", lastName: "Ortega", document: "5.678.901",
    phone: "+595 983 333 333", email: "cami@example.com", birthDate: "2001-01-26", insurer: "OSDE PY", sex: "F", gender: "F", city: "San Lorenzo", municipio: "San Lorenzo",
    forms: [],
    historyUpdatePending: false,
    emr: [{ id: "n3", authorId: "u2", authorName: "Dra. Sofía Benítez", createdAt: at(-14, 9), kind: "tratamiento", text: "Profilaxis realizada (D1110). Encías saludables, leve gingivitis en sector anteroinferior." }],
    nps: { score: 10, comment: "Excelente todo 😊", at: at(-13, 11) },
  },
  {
    id: "p4", clinicId: CLINIC_ID, firstName: "Andrés", lastName: "Mejía", document: "2.345.678",
    phone: "+595 984 444 444", birthDate: "1979-11-30", sex: "M", gender: "M", city: "Asunción", municipio: "Asunción",
    forms: [{ id: "f4", templateName: "Historia médica (actualización)", status: "pendiente", fields: [{ label: "Cambios de salud", value: "" }, { label: "Nueva medicación", value: "" }] }],
    historyUpdatePending: true,
    emr: [{ id: "n4", authorId: "u2", authorName: "Dra. Sofía Benítez", createdAt: at(-3, 11), kind: "diagnostico", text: "Resto radicular pieza 28 (K08.3). Indicada exodoncia simple." }],
    odontogram: {
      "28": { condition: "extraccion", note: "Resto radicular — exodoncia programada", updatedAt: at(-3, 11), updatedBy: "Dra. Sofía Benítez" },
      "36": { condition: "endodoncia", note: "Endodoncia 2023, asintomática", updatedAt: at(-120, 9), updatedBy: "Dra. Sofía Benítez" },
      "46": { condition: "implante", note: "Implante + corona 2022", updatedAt: at(-200, 9), updatedBy: "Dra. Sofía Benítez" },
    },
    nps: { score: 9, comment: "Muy buena atención de la doctora, la exodoncia fue rápida.", at: at(-1, 13) },
  },
  {
    id: "p5", clinicId: CLINIC_ID, firstName: "Lucía", lastName: "Ferreira", document: "6.789.012",
    phone: "+595 985 555 555", birthDate: "1992-06-17", insurer: "Asismed", sex: "F", gender: "F", city: "Luque", municipio: "Luque",
    forms: [], historyUpdatePending: false, emr: [],
  },
  {
    id: "p6", clinicId: CLINIC_ID, firstName: "Marco", lastName: "Giménez", document: "1.234.567",
    phone: "+595 986 666 666", birthDate: "1985-02-08", sex: "M", gender: "M", city: "Fernando de la Mora", municipio: "Fernando de la Mora",
    forms: [], historyUpdatePending: false,
    emr: [{ id: "n5", authorId: "u2", authorName: "Dra. Sofía Benítez", createdAt: at(-1, 16), kind: "plan", text: "Inicio de ortodoncia (D8080). Estudio cefalométrico solicitado." }],
    ortho: {
      active: true,
      applianceType: "Brackets metálicos autoligado",
      diagnosis: "Clase II división 1 — apiñamiento moderado superior e inferior",
      startDate: at(-30, 10),
      monthlyFee: 375000,
      totalMonths: 24,
      progressReal: 12,
      upperArch: "NiTi 0.016",
      lowerArch: "NiTi 0.014",
      elasticType: "Clase II (3/16\", 4.5 oz)",
      elasticConfig: "16→26, uso nocturno",
      nextControlDate: at(26, 17),
      hygieneCurve: 2.0,
      nextSessionNotes: "Cambio a arco 0.018. Reforzar higiene en sector anteroinferior (31-41).",
      controls: [
        { date: at(-30, 10), note: "Instalación de aparatología superior. Indicaciones de higiene entregadas.", by: "Dra. Sofía Benítez" },
        { date: at(-2, 17), note: "Activación + cambio de ligaduras. Buena higiene, leve gingivitis en 31-41.", by: "Dra. Sofía Benítez" },
      ],
    },
  },
];

/* ===== Presupuestos demo (plan de tratamiento → captura → cobro) ===== */
const budgets: Budget[] = [
  {
    id: "g1", clinicId: CLINIC_ID, patientId: "p1", dentistId: "u2", createdAt: at(-5, 11), status: "presentado",
    items: [
      { id: "gi1", cpt: "D2330", description: "Resina compuesta — 1 superficie", tooth: "16", price: 420000, status: "pendiente", section: "Restauraciones" },
      { id: "gi2", cpt: "D2330", description: "Resina compuesta — 1 superficie", tooth: "24", price: 420000, status: "pendiente", section: "Restauraciones" },
      { id: "gi3", cpt: "D1110", description: "Profilaxis (adulto)", price: 250000, status: "pendiente", section: "Prevención e higiene" },
    ],
    discountPct: 15, convenio: "Asismed", installments: 2,
    notes: "Iniciar por pieza 16 (sintomática).",
    history: [
      { at: at(-5, 11), action: "Presupuesto creado", by: "Dra. Sofía Benítez" },
      { at: at(-4, 9), action: "Presentado al paciente", by: "Paola Asistente" },
    ],
  },
  {
    id: "g2", clinicId: CLINIC_ID, patientId: "p6", dentistId: "u2", createdAt: at(-30, 10), status: "aceptado",
    planType: "ortodoncia",
    items: [{ id: "gi4", cpt: "D8080", description: "Ortodoncia integral (adolescente/adulto)", price: 4500000, status: "pendiente" }],
    installments: 12,
    notes: "Ortodoncia integral — entrega inicial + 12 cuotas mensuales.",
    patientComments: "Tiempo estimado 24 meses (entrega inicial + 12 cuotas). No incluye micro-tornillos ni exodoncias. La pérdida o despegue de brackets por falta de cuidado del paciente tiene costo adicional.",
    history: [
      { at: at(-30, 10), action: "Presupuesto creado", by: "Dra. Sofía Benítez" },
      { at: at(-30, 11), action: "Aceptado por el paciente", by: "Paola Asistente" },
    ],
  },
  {
    id: "g3", clinicId: CLINIC_ID, patientId: "p4", dentistId: "u2", createdAt: at(-10, 9), status: "completado",
    items: [
      { id: "gi5", cpt: "D7140", description: "Exodoncia simple", tooth: "28", price: 600000, status: "realizado", doneAt: at(-1, 10), doneBy: "Dra. Sofía Benítez" },
      { id: "gi6", cpt: "D0120", description: "Evaluación oral periódica", price: 150000, status: "realizado", doneAt: at(-10, 9), doneBy: "Dra. Sofía Benítez" },
    ],
    history: [
      { at: at(-10, 9), action: "Presupuesto creado", by: "Dra. Sofía Benítez" },
      { at: at(-10, 10), action: "Aceptado por el paciente", by: "Paola Asistente" },
      { at: at(-1, 10), action: "Todos los procedimientos realizados — completado", by: "Dra. Sofía Benítez" },
    ],
  },
  {
    id: "g4", clinicId: CLINIC_ID, patientId: "p3", dentistId: "u2", createdAt: at(-1, 12), status: "borrador",
    items: [
      { id: "gi7", cpt: "D9972", description: "Blanqueamiento dental (arcada)", tooth: undefined, price: 900000, status: "pendiente" },
      { id: "gi8", cpt: "D9972", description: "Blanqueamiento dental (arcada)", price: 900000, status: "pendiente" },
    ],
    notes: "Evaluar sensibilidad antes de confirmar.",
    history: [{ at: at(-1, 12), action: "Presupuesto creado", by: "Dra. Sofía Benítez" }],
  },
];

/* ===== Pagos (caja) ===== */
const payments: Payment[] = [
  { id: "pay1", clinicId: CLINIC_ID, patientId: "p6", budgetId: "g2", date: at(-30, 11), amount: 1500000, method: "efectivo", concept: "Entrega inicial ortodoncia", receivedBy: "Paola Asistente" },
  { id: "pay2", clinicId: CLINIC_ID, patientId: "p6", budgetId: "g2", date: at(-2, 10), amount: 375000, method: "transferencia", concept: "Cuota mensual ortodoncia", receivedBy: "Paola Asistente" },
  { id: "pay3", clinicId: CLINIC_ID, patientId: "p4", budgetId: "g3", date: at(-1, 11), amount: 750000, method: "tarjeta", concept: "Exodoncia 28 + consulta", receivedBy: "Carlos Admin", paymentNumber: "3625", receiptNumber: "2875" },
  { id: "pay4", clinicId: CLINIC_ID, patientId: "p3", date: at(0, 10), amount: 225000, method: "efectivo", concept: "Profilaxis (con descuento)", receivedBy: "Paola Asistente" },
  { id: "pay5", clinicId: CLINIC_ID, patientId: "p1", budgetId: "g1", date: at(0, 12), amount: 200000, method: "qr", concept: "Anticipo presupuesto resinas", receivedBy: "Paola Asistente" },
];

/* ===== Gastos ===== */
const expenses: Expense[] = [
  { id: "e1", clinicId: CLINIC_ID, date: at(0, 9), category: "Insumos", supplier: "Dental Center PY", description: "Resinas A2 y adhesivos", amount: 480000, registeredBy: "Carlos Admin" },
  { id: "e2", clinicId: CLINIC_ID, date: at(-1, 15), category: "Servicios", description: "ANDE — electricidad mayo", amount: 350000, registeredBy: "Carlos Admin" },
  { id: "e3", clinicId: CLINIC_ID, date: at(-3, 10), category: "Laboratorio", supplier: "LaboDent", description: "Corona cerámica pieza 26", amount: 900000, registeredBy: "Carlos Admin" },
];

/* ===== Inventario ===== */
const stock: StockItem[] = [
  { id: "s1", clinicId: CLINIC_ID, name: "Resina compuesta A2 (jeringa)", category: "Restauración", unit: "unidad", stock: 6, minStock: 4, cost: 180000 },
  { id: "s2", clinicId: CLINIC_ID, name: "Anestesia lidocaína 2% c/epinefrina", category: "Anestésicos", unit: "caja x50", stock: 2, minStock: 3, cost: 220000 },
  { id: "s3", clinicId: CLINIC_ID, name: "Guantes nitrilo M", category: "Descartables", unit: "caja x100", stock: 14, minStock: 5, cost: 65000 },
  { id: "s4", clinicId: CLINIC_ID, name: "Agujas cortas 30G", category: "Descartables", unit: "caja x100", stock: 8, minStock: 4, cost: 45000 },
  { id: "s5", clinicId: CLINIC_ID, name: "Ácido grabador 37%", category: "Restauración", unit: "jeringa", stock: 5, minStock: 2, cost: 35000 },
  { id: "s6", clinicId: CLINIC_ID, name: "Hipoclorito de sodio 5%", category: "Endodoncia", unit: "litro", stock: 1, minStock: 2, cost: 40000 },
];

const stockMoves: StockMove[] = [
  { id: "m1", clinicId: CLINIC_ID, itemId: "s3", date: at(-7, 9), type: "entrada", qty: 10, reason: "Compra Dental Center PY", by: "Carlos Admin" },
  { id: "m2", clinicId: CLINIC_ID, itemId: "s1", date: at(-1, 12), type: "salida", qty: 2, reason: "Consumo consultorio 1", by: "Paola Asistente" },
  { id: "m3", clinicId: CLINIC_ID, itemId: "s2", date: at(0, 9), type: "salida", qty: 1, reason: "Cirugía paciente Mejía", by: "Paola Asistente" },
];

/* ===== Lista de espera ===== */
const waitlist: WaitlistEntry[] = [
  { id: "w1", clinicId: CLINIC_ID, patientId: "p5", reason: "Limpieza + control", preference: "Tardes después de 17:00", createdAt: at(-2, 9) },
  { id: "w2", clinicId: CLINIC_ID, patientId: "p2", reason: "Sensibilidad pieza 21 — urgencia leve", preference: "Cualquier mañana", createdAt: at(-1, 8) },
];

/* ===== Outbox Botika (demo del ciclo completo) ===== */
const outbox: OutboxTask[] = [
  {
    id: "t1", clinicId: CLINIC_ID, type: "confirmar_cita", patientId: "p6", phone: "+595 986 666 666",
    message: "Hola Marco 👋 Te recordamos tu control de ortodoncia el jueves a las 17:00 en Clínica Demo Asunción. ¿Confirmás tu asistencia?",
    refId: "a6", status: "respondido", createdAt: at(-1, 9), createdBy: "sistema",
    result: { at: at(-1, 9, 24), confirmed: true, reply: "Sí, confirmo. ¡Gracias!" },
  },
  {
    id: "t2", clinicId: CLINIC_ID, type: "nps", patientId: "p4", phone: "+595 984 444 444",
    message: "Hola Andrés 👋 ¿Del 0 al 10, cuánto recomendarías Clínica Demo Asunción a un amigo o familiar?",
    refId: "g3", status: "respondido", createdAt: at(-1, 12), createdBy: "sistema",
    // `at` alineado con p4.nps.at (mismo survey) → idempotencia por `at` no duplica npsHistory
    result: { at: at(-1, 13), nps: 9, comment: "Muy buena atención de la doctora, la exodoncia fue rápida." },
  },
  {
    id: "t3", clinicId: CLINIC_ID, type: "nps", patientId: "p3", phone: "+595 983 333 333",
    message: "Hola Camila 👋 ¿Del 0 al 10, cuánto recomendarías Clínica Demo Asunción a un amigo o familiar?",
    status: "respondido", createdAt: at(-13, 10), createdBy: "sistema",
    // `at` alineado con p3.nps.at (mismo survey) → idempotencia por `at` no duplica npsHistory
    result: { at: at(-13, 11), nps: 10, comment: "Excelente todo 😊" },
  },
  {
    id: "t4", clinicId: CLINIC_ID, type: "cobranza", patientId: "p6", phone: "+595 986 666 666",
    message: "Hola Marco 👋 Te recordamos que tenés una cuota de tu tratamiento de ortodoncia pendiente. ¿Querés que te pase los medios de pago?",
    refId: "g2", status: "pendiente", createdAt: at(0, 8), createdBy: "Carlos Admin",
  },
];

const appointments: Appointment[] = [
  { id: "a1", clinicId: CLINIC_ID, patientId: "p1", dentistId: "u2", title: "Resina pieza 16", start: at(0, 9), end: at(0, 10), status: "confirmada", amount: 420000, discount: 0, budgetId: "g1" },
  { id: "a2", clinicId: CLINIC_ID, patientId: "p2", dentistId: "u2", title: "Primera consulta", start: at(0, 11), end: at(0, 11, 40), status: "pendiente", amount: 150000, discount: 0 },
  { id: "a3", clinicId: CLINIC_ID, patientId: "p3", dentistId: "u2", title: "Profilaxis", start: at(1, 10), end: at(1, 10, 45), status: "completada", amount: 250000, discount: 25000 },
  { id: "a4", clinicId: CLINIC_ID, patientId: "p4", dentistId: "u2", title: "Exodoncia 28", start: at(2, 9, 30), end: at(2, 10, 30), status: "confirmada", amount: 600000, discount: 0 },
  { id: "a5", clinicId: CLINIC_ID, patientId: "p5", dentistId: "u2", title: "Control + limpieza", start: at(2, 15), end: at(2, 16), status: "pendiente", amount: 250000, discount: 0 },
  { id: "a6", clinicId: CLINIC_ID, patientId: "p6", dentistId: "u2", title: "Control ortodoncia", start: at(3, 17), end: at(3, 17, 30), status: "confirmada", amount: 350000, discount: 0, reminderSent: true, confirmedVia: "botika", budgetId: "g2" },
  { id: "a7", clinicId: CLINIC_ID, patientId: "p3", dentistId: "u2", title: "Blanqueamiento — evaluación", start: at(4, 14), end: at(4, 14, 30), status: "pendiente", amount: 0, discount: 0 },
  { id: "a8", clinicId: CLINIC_ID, patientId: "p1", dentistId: "u2", title: "Control post-operatorio", start: at(4, 9), end: at(4, 9, 20), status: "cancelada", amount: 0, discount: 0 },
];

export function buildSeed(): DB {
  return {
    clinics: [
      {
        id: CLINIC_ID, name: "Clínica Demo Asunción", plan: "clinica",
        config: {
          timezone: "America/Asuncion", currency: "PYG", address: "Av. España 1234, Asunción", phone: "+595 21 555 000",
          convenios: [
            { name: "Asismed", discountPct: 15 },
            { name: "IPS", discountPct: 10 },
            { name: "OSDE PY", discountPct: 12 },
          ],
          reminderTemplate:
            "Hola {paciente} 👋 Te recordamos tu cita en {clinica} el {fecha} a las {hora}. Respondé *SI* para confirmar o avisanos si necesitás reagendar. ¡Gracias!",
          botika: {
            connected: true, // demo: conexión simulada hasta cargar credenciales reales
            automations: { confirmCita: true, nps: true, cobranza: true, reagendar: true, negociacion: true },
            negociacion: { diasGatillo: 5, maxIntentos: 2, financiacion: { maxCuotas: 3, sinInteres: true, anticipoMinPct: 0 } },
          },
          consentTemplates: [
            {
              id: "ct_consentimiento_general",
              title: "Consentimiento informado general",
              body: `Yo, el/la abajo firmante, paciente de esta clínica odontológica, declaro haber sido informado/a de manera clara y comprensible sobre mi estado de salud bucal, el diagnóstico realizado, los tratamientos propuestos y sus posibles alternativas, así como los riesgos, beneficios y eventuales complicaciones inherentes a los procedimientos indicados.

He tenido la oportunidad de realizar todas las preguntas que he considerado oportunas, las cuales han sido respondidas satisfactoriamente por el/la profesional tratante.

Entiendo que el equipo profesional puede presentarse ante circunstancias imprevistas durante el desarrollo del tratamiento que requieran decisiones clínicas en el momento, actuando siempre en beneficio de mi salud.

Doy mi consentimiento libre, voluntario e informado para que se me realicen los procedimientos diagnósticos y terapéuticos que el/la profesional tratante considere necesarios según su criterio clínico.

Asimismo, autorizo el uso de mis datos clínicos con fines estrictamente asistenciales, garantizando la confidencialidad de los mismos conforme a la normativa vigente en materia de protección de datos personales.

Me reservo el derecho de revocar este consentimiento en cualquier momento, entendiéndose que dicha revocación no tendrá efectos retroactivos sobre los procedimientos ya realizados.`,
            } satisfies ConsentTemplate,
            {
              id: "ct_consentimiento_odontologico",
              title: "Consentimiento para tratamiento odontológico",
              body: `Yo, el/la abajo firmante, declaro que he sido informado/a detalladamente sobre el tratamiento odontológico que se me realizará, incluyendo:

1. DIAGNÓSTICO Y TRATAMIENTO PROPUESTO: El/la profesional me ha explicado la condición clínica detectada, los procedimientos a realizar (restauraciones, extracciones, endodoncias, cirugías u otros según indique el plan de tratamiento), y el tiempo estimado de atención.

2. RIESGOS ESPECÍFICOS: Comprendo que los tratamientos dentales pueden tener riesgos como sangrado, inflamación, sensibilidad postoperatoria, necesidad de tratamientos adicionales, reacciones a anestésicos, o complicaciones propias de cada procedimiento, cuya probabilidad es baja pero no nula.

3. ANESTESIA LOCAL: Autorizo la aplicación de anestesia local en las dosis necesarias para realizar el tratamiento sin dolor. He comunicado al profesional mis antecedentes de alud, alergias y medicaciones actuales.

4. RADIOGRAFÍAS E IMÁGENES: Autorizo la toma de radiografías y fotografías clínicas necesarias para el diagnóstico y seguimiento del tratamiento, las cuales serán resguardadas en mi historia clínica.

5. ALTERNATIVAS: He sido informado/a de que existen alternativas terapéuticas y que la no realización del tratamiento podría implicar el agravamiento de la condición diagnosticada.

6. POSTOPERATORIO: He recibido las instrucciones de cuidado postoperatorio y me comprometo a seguirlas para favorecer mi recuperación.

Doy libremente mi consentimiento para la realización del tratamiento odontológico planificado, habiendo comprendido toda la información proporcionada.`,
            } satisfies ConsentTemplate,
          ],
        },
      },
    ],
    users: [
      { id: "u1", clinicId: CLINIC_ID, name: "Carlos Admin", email: "admin@novudent.app", role: "admin", color: "#1769E0", active: true },
      { id: "u2", clinicId: CLINIC_ID, name: "Dra. Sofía Benítez", email: "sofia@novudent.app", role: "dentist", color: "#0E9F6E", active: true, commissionPct: 30 },
      { id: "u3", clinicId: CLINIC_ID, name: "Paola Asistente", email: "paola@novudent.app", role: "assistant", color: "#B45309", active: true },
      { id: "u4", clinicId: CLINIC_ID, name: "Dr. Diego Martínez", email: "diego@novudent.app", role: "dentist", color: "#0D9488", active: true, commissionPct: 25 },
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
      { cpt: "D0120", description: "Evaluación oral periódica", price: 150000, defaultDx: ["Z01.20"], category: "diagnostico" },
      { cpt: "D1110", description: "Profilaxis (adulto)", price: 250000, defaultDx: ["Z01.20"], category: "prevencion" },
      { cpt: "D2330", description: "Resina compuesta — 1 superficie", price: 420000, defaultDx: ["K02.9"], category: "operatoria" },
      { cpt: "D2740", description: "Corona de porcelana/cerámica", price: 2800000, defaultDx: ["K08.531"], category: "protesis" },
      { cpt: "D3310", description: "Endodoncia — anterior", price: 1200000, defaultDx: ["K04.0"], category: "endodoncia" },
      { cpt: "D4341", description: "Raspado y alisado radicular (cuadrante)", price: 550000, defaultDx: ["K05.30"], category: "periodoncia" },
      { cpt: "D7140", description: "Exodoncia simple", price: 600000, defaultDx: ["K08.3"], category: "cirugia" },
      { cpt: "D8080", description: "Ortodoncia integral (adolescente/adulto)", price: 4500000, defaultDx: ["M26.4"], category: "ortodoncia" },
      { cpt: "D9972", description: "Blanqueamiento dental (arcada)", price: 900000, defaultDx: ["Z01.20"], category: "estetica" },
    ],
    budgets,
    payments,
    expenses,
    stock,
    stockMoves,
    waitlist,
    outbox,
    recoveryMonitors: [],
    radiographs: [],
    signatures: [],
    crmCards: [],
    campaigns: [],
    labOrders: [],
    settlements: [],
    boxes: [
      { id: "box1", name: "Box 1" },
      { id: "box2", name: "Box 2" },
      { id: "box3", name: "Box 3" },
    ],
    onboarding: { usersCreated: true, servicesDefined: true, tourDone: false },
  };
}
