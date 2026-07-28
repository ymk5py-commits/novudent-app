/**
 * Suscripción SaaS — helpers puros de estado y acceso.
 *
 * Regla de oro: el plan efectivo sale del doc `subscriptions/{cid}` (que solo
 * escribe el usuario de servicio desde el webhook de la pasarela), NO de
 * `clinics/{cid}.plan` — ese doc lo puede escribir el admin de la propia
 * clínica, así que confiar en él permitiría auto-ascenderse de plan gratis.
 *
 * Puro y sin dependencias de Firestore → testeable (TDD).
 */
import type { PlanId } from "./plan";
import type { Subscription } from "./types";

/** Estados que habilitan escritura. El resto queda en solo-lectura. */
const ESTADOS_VIGENTES: readonly string[] = ["trialing", "active"];

/** Días antes del fin del trial en los que ya avisamos. */
const AVISO_TRIAL_DIAS = 3;
const DIA_MS = 86_400_000;

/**
 * ¿La suscripción habilita escritura?
 *
 * Sin doc de suscripción devuelve `true` a propósito (**grandfathering**): las
 * clínicas que ya existían cuando se agregó el cobro no tienen doc todavía y no
 * se las puede dejar en solo-lectura de un día para el otro. El doc se crea al
 * migrarlas o al primer pago.
 *
 * Chequea la FECHA además del status: si se perdió un webhook de impago, el
 * período vencido igual corta el acceso (defensa en profundidad).
 */
export function isSubscriptionActive(
  sub: Subscription | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!sub) return true; // grandfathering
  if (!ESTADOS_VIGENTES.includes(sub.status)) return false;
  if (sub.currentPeriodEndMs != null && nowMs >= sub.currentPeriodEndMs) return false;
  return true;
}

/**
 * Plan efectivo. Prioridad: suscripción → doc de clínica (legacy) → "clinica".
 * Se conserva aunque la suscripción esté vencida: al vencer pasamos a
 * solo-lectura, no degradamos el plan (así ven sus datos tal como los cargaron).
 */
export function subscriptionPlanId(
  sub: Subscription | null | undefined,
  clinic?: { plan?: string } | null
): PlanId {
  const id = sub?.plan ?? clinic?.plan ?? "clinica";
  return (["solo", "clinica", "cadena"] as const).includes(id as PlanId) ? (id as PlanId) : "clinica";
}

export type AccessMode = "full" | "readonly";

/** Modo de acceso de la app: al vencer, la clínica puede leer/exportar pero no escribir. */
export function accessMode(
  sub: Subscription | null | undefined,
  nowMs: number = Date.now()
): AccessMode {
  return isSubscriptionActive(sub, nowMs) ? "full" : "readonly";
}

export interface SubscriptionNotice {
  tone: "warn" | "err";
  text: string;
}

/** Banner a mostrar en la app, o null si no hay nada que avisar. */
export function subscriptionNotice(
  sub: Subscription | null | undefined,
  nowMs: number = Date.now()
): SubscriptionNotice | null {
  if (!sub) return null;

  if (sub.status === "past_due") {
    return { tone: "err", text: "No pudimos procesar tu último pago. Regularizá la suscripción para volver a editar; mientras tanto podés consultar y exportar tus datos." };
  }
  if (sub.status === "canceled" || sub.status === "expired") {
    return { tone: "err", text: "Tu suscripción terminó. Tu información sigue disponible para consulta y exportación — reactivá el plan para seguir trabajando." };
  }
  if (sub.currentPeriodEndMs != null && nowMs >= sub.currentPeriodEndMs) {
    return { tone: "err", text: "Tu período venció. Regularizá el pago para volver a editar; tus datos siguen disponibles para consulta." };
  }
  if (sub.status === "trialing" && sub.currentPeriodEndMs != null) {
    const diasRestantes = Math.ceil((sub.currentPeriodEndMs - nowMs) / DIA_MS);
    if (diasRestantes <= AVISO_TRIAL_DIAS) {
      return {
        tone: "warn",
        text: diasRestantes <= 1
          ? "Tu prueba gratis termina hoy. Activá tu plan para no perder el acceso de escritura."
          : `Tu prueba gratis termina en ${diasRestantes} días. Activá tu plan cuando quieras.`,
      };
    }
  }
  return null;
}
