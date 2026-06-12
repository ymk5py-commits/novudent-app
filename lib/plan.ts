/**
 * Planes de Novudent — fuente de verdad de límites y módulos por plan.
 * Alineado con la sección de precios de la landing:
 *   Solo $45 · Clínica $129 (el más elegido) · Cadena a medida.
 *
 * El plan vive en clinics/{id}.plan (lo fija el dueño al crear la clínica
 * en /superadmin). Clínicas existentes sin campo → "clinica" (no romper).
 */

export type PlanId = "solo" | "clinica" | "cadena";

/** Módulos/capacidades que se prenden o apagan según el plan */
export type PlanFeature =
  | "caja"          // financiamiento, morosidad y cuentas por cobrar
  | "inventario"    // stock de insumos
  | "reportes"      // informes de gestión + exportables
  | "integraciones" // Botika (WhatsApp con IA)
  | "ia";           // Novudent IA: nota de voz, resumen, contralor, reportes IA

export interface PlanDef {
  id: PlanId;
  label: string;
  priceUsd: number | null; // null = a medida
  tagline: string;
  /** máx. profesionales (dentistas) activos; Infinity = sin límite */
  maxDentists: number;
  /** máx. usuarios activos totales; Infinity = sin límite */
  maxUsers: number;
  features: PlanFeature[];
  bullets: string[];
}

export const PLANS: Record<PlanId, PlanDef> = {
  solo: {
    id: "solo",
    label: "Solo",
    priceUsd: 45,
    tagline: "Odontólogo independiente: 1 sillón, odontograma, agenda y facturación básica.",
    maxDentists: 1,
    maxUsers: 3,
    features: [],
    bullets: ["1 profesional", "Agenda + odontograma", "Pacientes y presupuestos", "Facturación básica", "Agenda online"],
  },
  clinica: {
    id: "clinica",
    label: "Clínica",
    priceUsd: 129,
    tagline: "Para clínicas en crecimiento: hasta 5 sillones con todo Novudent adentro.",
    maxDentists: 5,
    maxUsers: 12,
    features: ["caja", "inventario", "reportes", "integraciones", "ia"],
    bullets: ["Hasta 5 profesionales", "Financiamiento y morosidad", "Inventario e informes", "Novudent IA completa", "Botika (WhatsApp IA)", "Soporte prioritario"],
  },
  cadena: {
    id: "cadena",
    label: "Cadena",
    priceUsd: null,
    tagline: "Multi-sucursal: comisiones, laboratorio, integraciones propias y account manager.",
    maxDentists: Infinity,
    maxUsers: Infinity,
    features: ["caja", "inventario", "reportes", "integraciones", "ia"],
    bullets: ["Profesionales ilimitados", "Todo el Plan Clínica", "Integraciones a medida", "Account manager"],
  },
};

/** Normaliza el plan guardado (clínicas viejas sin campo → clinica) */
export function planOf(clinic?: { plan?: string } | null): PlanDef {
  const id = (clinic?.plan ?? "clinica") as PlanId;
  return PLANS[id] ?? PLANS.clinica;
}

export function planHas(clinic: { plan?: string } | null | undefined, feature: PlanFeature): boolean {
  return planOf(clinic).features.includes(feature);
}

/** null si puede agregar; texto del error amigable si el plan no lo permite */
export function planUserLimitError(
  clinic: { plan?: string } | null | undefined,
  users: { role: string; active: boolean }[],
  newRole: string
): string | null {
  const p = planOf(clinic);
  const active = users.filter((u) => u.active);
  if (active.length >= p.maxUsers) {
    return `Tu Plan ${p.label} permite hasta ${p.maxUsers} usuarios activos. Pasate al Plan ${p.id === "solo" ? "Clínica" : "Cadena"} para agregar más.`;
  }
  if (newRole === "dentist") {
    const dentists = active.filter((u) => u.role === "dentist").length;
    if (dentists >= p.maxDentists) {
      return p.maxDentists === 1
        ? "Tu Plan Solo incluye 1 profesional. Pasate al Plan Clínica (hasta 5 profesionales) para sumar a tu equipo."
        : `Tu Plan ${p.label} permite hasta ${p.maxDentists} profesionales. Pasate al Plan Cadena para un equipo más grande.`;
    }
  }
  return null;
}

/** Etiqueta corta del plan para badges ("Plan Solo", "Plan Clínica"…) */
export function planLabel(clinic?: { plan?: string } | null): string {
  return `Plan ${planOf(clinic).label}`;
}
