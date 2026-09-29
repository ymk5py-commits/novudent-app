/**
 * Planes de Novudent — fuente de verdad de límites y módulos por plan.
 * Nombres, precios, beneficios y límites salen de la misma oferta que la landing.
 * El id interno `cadena` conserva compatibilidad con suscripciones anteriores;
 * su nombre comercial es Multi.
 *
 * El plan vive en clinics/{id}.plan (lo fija el dueño al crear la clínica
 * en /superadmin). Clínicas existentes sin campo → "clinica" (no romper).
 */

import { PLANES, type PlanPublico, type PlanPublicoId } from "./landing/precios";

export type PlanId = "solo" | "clinica" | "cadena";

export const publicPlanId = (id: PlanId): PlanPublicoId => id === "cadena" ? "multi" : id;

function oferta(id: PlanPublicoId): PlanPublico {
  const plan = PLANES.find((p) => p.id === id);
  if (!plan) throw new Error(`Falta el Plan ${id} en la oferta pública.`);
  return plan;
}

const SOLO = oferta("solo");
const CLINICA = oferta("clinica");
const MULTI = oferta("multi");

/** Módulos/capacidades que se prenden o apagan según el plan */
export type PlanFeature =
  | "caja"            // financiamiento, morosidad y cuentas por cobrar
  | "inventario"      // stock de insumos
  | "reportes"        // informes de gestión + exportables
  | "integraciones"   // Botika (WhatsApp con IA)
  | "ia"              // Novudent IA: nota de voz, resumen, contralor, reportes IA
  | "radiografia_ia"  // Análisis IA de radiografías (panorámica/bitewing/periapical)
  | "firma_electronica" // Firma electrónica de consentimientos (consultorio o remota)
  | "crm"             // CRM / embudo de pacientes + campañas (Cadena, como Titanium)
  | "laboratorios"    // Órdenes de laboratorio
  | "liquidaciones"   // Liquidación de comisiones a profesionales
  | "boxes";          // Gestión de box/sillones

export interface PlanDef {
  id: PlanId;
  label: string;
  priceGs: number;
  annualGs: number;
  tagline: string;
  /** máx. profesionales (dentistas) activos según la oferta pública */
  maxDentists: number;
  /** máx. usuarios activos totales; Infinity = sin límite */
  maxUsers: number;
  features: PlanFeature[];
  bullets: string[];
}

export const PLANS: Record<PlanId, PlanDef> = {
  solo: {
    id: "solo",
    label: SOLO.nombre,
    priceGs: SOLO.mensualGs,
    annualGs: SOLO.anualGs,
    tagline: `${SOLO.para} · ${SOLO.profesionales}`,
    maxDentists: SOLO.maxProfesionales,
    maxUsers: 3,
    features: [],
    bullets: SOLO.incluye,
  },
  clinica: {
    id: "clinica",
    label: CLINICA.nombre,
    priceGs: CLINICA.mensualGs,
    annualGs: CLINICA.anualGs,
    tagline: `${CLINICA.para} · ${CLINICA.profesionales}`,
    maxDentists: CLINICA.maxProfesionales,
    maxUsers: 12,
    features: ["caja", "inventario", "reportes", "integraciones", "ia", "radiografia_ia", "firma_electronica", "laboratorios", "liquidaciones", "boxes"],
    bullets: CLINICA.incluye,
  },
  cadena: {
    id: "cadena",
    label: MULTI.nombre,
    priceGs: MULTI.mensualGs,
    annualGs: MULTI.anualGs,
    tagline: `${MULTI.para} · ${MULTI.profesionales}`,
    maxDentists: MULTI.maxProfesionales,
    maxUsers: Infinity,
    features: ["caja", "inventario", "reportes", "integraciones", "ia", "radiografia_ia", "firma_electronica", "crm", "laboratorios", "liquidaciones", "boxes"],
    bullets: MULTI.incluye,
  },
};

/** Normaliza el plan guardado (clínicas viejas sin campo → clinica).
 *  Acepta un objeto { plan? } o directamente un PlanId string. */
export function planOf(clinic?: { plan?: string } | string | null): PlanDef {
  const id = (typeof clinic === "string" ? clinic : (clinic?.plan ?? "clinica")) as PlanId;
  return PLANS[id] ?? PLANS.clinica;
}

export function planHas(clinic: { plan?: string } | string | null | undefined, feature: PlanFeature): boolean {
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
    return `Tu Plan ${p.label} permite hasta ${p.maxUsers} usuarios activos. Pasate al Plan ${p.id === "solo" ? "Clínica" : "Multi"} para agregar más.`;
  }
  if (newRole === "dentist") {
    const dentists = active.filter((u) => u.role === "dentist").length;
    if (dentists >= p.maxDentists) {
      return p.maxDentists === 1
        ? "Tu Plan Solo incluye 1 profesional. Pasate al Plan Clínica (hasta 4 profesionales) para sumar a tu equipo."
        : p.id === "clinica"
          ? `Tu Plan Clínica permite hasta ${p.maxDentists} profesionales. Pasate al Plan Multi para sumar a tu equipo.`
          : `Tu Plan Multi incluye hasta ${p.maxDentists} profesionales. Consultanos para agregar otro profesional.`;
    }
  }
  return null;
}

/** Etiqueta corta del plan para badges ("Plan Solo", "Plan Clínica"…) */
export function planLabel(clinic?: { plan?: string } | null): string {
  return `Plan ${planOf(clinic).label}`;
}
