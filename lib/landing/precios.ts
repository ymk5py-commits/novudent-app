/**
 * Precios PÚBLICOS de la landing, en guaraníes (definidos por el dueño el 2026-09-25).
 *
 * ⚠️ Todavía NO coinciden con lo que cobra la app (`lib/plan.ts`: precios en USD, plan
 * "Cadena" en vez de "Multi", Clínica con 5 profesionales en vez de 4). Alinear la app es una
 * decisión aparte porque cambia lo que pagan las clínicas; hasta entonces, esto es solo la
 * vidriera. Qué incluye cada plan sí sale del gating real de `lib/plan.ts`.
 */
export type PlanPublicoId = "solo" | "clinica" | "multi";

export interface PlanPublico {
  id: PlanPublicoId;
  nombre: string;
  para: string;              // a quién le sirve, en una línea
  profesionales: string;     // el límite, como lo lee un dueño
  mensualGs: number;
  anualGs: number;           // con 2 meses gratis (Multi: descuento propio, decidido a propósito)
  recomendado?: boolean;
  incluye: string[];
}

export const PLANES: PlanPublico[] = [
  {
    id: "solo",
    nombre: "Solo",
    para: "Consultorio individual",
    profesionales: "1 profesional",
    mensualGs: 330_000,
    anualGs: 3_300_000,
    incluye: ["Agenda y lista de espera", "Reservas online para pacientes", "Ficha clínica y odontograma por superficies", "Presupuestos"],
  },
  {
    id: "clinica",
    nombre: "Clínica",
    para: "El plan de la mayoría",
    profesionales: "Hasta 4 profesionales",
    mensualGs: 620_000,
    anualGs: 6_200_000,
    recomendado: true,
    incluye: [
      "Todo lo del plan Solo",
      "Caja diaria, cuotas y cuentas por cobrar",
      "Confirmación de citas por WhatsApp (Botika)",
      "Consentimientos con firma electrónica",
      "Inventario, laboratorios y liquidaciones",
      "IA clínica: radiografías y notas por voz",
    ],
  },
  {
    id: "multi",
    nombre: "Multi",
    para: "Varias sillas o sucursales",
    profesionales: "Hasta 10 profesionales",
    mensualGs: 980_000,
    anualGs: 9_000_000,
    incluye: ["Todo lo del plan Clínica", "Varios boxes y sucursales", "CRM de pacientes", "Reportes por profesional y sucursal"],
  },
];

export const CONDICIONES = {
  setupGs: 1_500_000,        // pago único: configuración (con su documento) + migración de datos + capacitación
  diasPuestaEnMarcha: 5,     // una semana hábil
  profesionalExtraGs: 90_000, // por mes
  mesesGratisAnual: 2,
};

/** "Gs. 620.000" — separador de miles paraguayo, sin decimales. */
export const gs = (n: number) => `Gs. ${n.toLocaleString("es-PY", { maximumFractionDigits: 0 })}`;

/** La semana de puesta en marcha, día por día (definida por el dueño el 2026-09-26).
 *  Es la misma que muestra la presentación en PDF: si cambia acá, hay que cambiarla allá. */
export const PUESTA_EN_MARCHA = [
  {
    dias: "Días 1–2",
    desde: 1,
    hasta: 2,
    titulo: "Relevamiento y configuración",
    texto: "Relevamos cómo trabaja tu equipo —cómo agendan, cómo cobran, qué aranceles y convenios manejan— y configuramos la clínica, las sucursales, los usuarios con su rol, los aranceles y los consentimientos.",
  },
  { dias: "Días 3–4", desde: 3, hasta: 4, titulo: "Migración de datos", texto: "Pasamos tus pacientes desde otro sistema, planillas de Excel o papel." },
  { dias: "Día 5", desde: 5, hasta: 5, titulo: "Capacitación", texto: "Enseñamos a cada rol lo suyo: recepción, profesionales y administración." },
] as const;

/** Lo que queda por escrito en el documento de configuración (se entrega al terminar el día 2). */
export const DOCUMENTO_CONFIGURACION = ["Clínica y sucursales", "Usuarios y roles", "Aranceles", "Convenios", "Consentimientos y documentos"] as const;
