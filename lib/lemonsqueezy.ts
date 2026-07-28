/**
 * Lemon Squeezy — helpers puros del webhook de suscripciones.
 *
 * LS es Merchant of Record: el checkout es hospedado, así que los datos de
 * tarjeta NUNCA tocan Novudent (nos saca del alcance PCI). Lo único que
 * recibimos son webhooks firmados que nos dicen en qué estado quedó la
 * suscripción de cada clínica.
 *
 * Puro y sin I/O → testeable (TDD). El efecto (escribir Firestore) vive en
 * app/api/webhooks/lemonsqueezy/route.ts.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Subscription, SubscriptionStatus } from "./types";
import type { PlanId } from "./plan";

/**
 * Verifica la firma HMAC-SHA256 del header `X-Signature`.
 *
 * Sin esto el endpoint es público y cualquiera puede POSTear un JSON diciendo
 * "la clínica X compró el plan Cadena" y activárselo gratis. Se compara con
 * `timingSafeEqual` para no filtrar la firma por tiempo de respuesta.
 */
export function verifyLsSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  if (!/^[0-9a-f]+$/i.test(signature)) return false;

  const esperada = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(esperada, "hex");
  const b = Buffer.from(signature, "hex");
  // timingSafeEqual tira si los largos difieren → cortamos antes.
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/** Evento de LS → estado de nuestra suscripción. `null` = evento que ignoramos. */
export function statusFromLsEvent(evento: string): SubscriptionStatus | null {
  switch (evento) {
    case "subscription_created":
    case "subscription_resumed":
    case "subscription_unpaused":
    case "subscription_payment_success":
    case "subscription_updated":
      return "active";
    case "subscription_payment_failed":
      return "past_due";
    case "subscription_cancelled":
      return "canceled";
    case "subscription_expired":
      return "expired";
    default:
      return null;
  }
}

/** Mapa variant_id de LS → plan de Novudent. Se configura por env (ver la route). */
export type VariantPlanMap = Record<string, PlanId>;

/**
 * Traduce el payload del webhook a nuestro doc de suscripción.
 * Devuelve `null` cuando NO hay que tocar nada:
 *  - evento desconocido,
 *  - sin `clinic_id` en custom_data (no sabemos a quién activarle el plan),
 *  - variante no mapeada (preferimos no activar nada antes que regalar un plan).
 */
export function subscriptionFromLsPayload(
  payload: any,
  variantPlans: VariantPlanMap
): Subscription | null {
  const evento = payload?.meta?.event_name;
  const status = statusFromLsEvent(evento);
  if (!status) return null;

  const clinicId = payload?.meta?.custom_data?.clinic_id;
  if (!clinicId || typeof clinicId !== "string") return null;

  const attrs = payload?.data?.attributes ?? {};
  const variantId = attrs.variant_id != null ? String(attrs.variant_id) : "";
  const plan = variantPlans[variantId];
  if (!plan) return null;

  const renewsAt = attrs.renews_at ? Date.parse(attrs.renews_at) : NaN;

  return {
    clinicId,
    plan,
    status,
    currentPeriodEndMs: Number.isFinite(renewsAt) ? renewsAt : undefined,
    provider: "lemonsqueezy",
    lsSubscriptionId: payload?.data?.id != null ? String(payload.data.id) : undefined,
    lsCustomerId: attrs.customer_id != null ? String(attrs.customer_id) : undefined,
    lsVariantId: variantId || undefined,
    customerPortalUrl: attrs?.urls?.customer_portal,
    updatedAt: new Date().toISOString(),
    updatedBy: "webhook:lemonsqueezy",
  };
}
