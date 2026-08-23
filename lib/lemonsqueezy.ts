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

/** Eventos de LS que aplicamos. El resto se ignora (order_created, etc.). */
const EVENTOS_APLICABLES: readonly string[] = [
  "subscription_created",
  "subscription_updated",
  "subscription_resumed",
  "subscription_unpaused",
  "subscription_paused",
  "subscription_cancelled",
  "subscription_expired",
  "subscription_payment_success",
  "subscription_payment_failed",
  "subscription_payment_recovered",
  "subscription_payment_refunded",
];

/** `data.attributes.status` de LS → nuestro estado. Esta es la fuente de verdad. */
const STATUS_LS: Record<string, SubscriptionStatus> = {
  on_trial: "trialing",
  active: "active",
  past_due: "past_due",
  cancelled: "canceled",
  canceled: "canceled",
  unpaid: "expired",
  expired: "expired",
  paused: "expired", // pausar el cobro no puede seguir habilitando escritura
};

/**
 * Evento de LS → estado de nuestra suscripción. `null` = evento que ignoramos.
 *
 * ⚠️ EL NOMBRE DEL EVENTO NO ES EL ESTADO. Lemon Squeezy dispara
 * `subscription_updated` en TODOS los cambios del ciclo de vida —incluidos la
 * cancelación y el impago— y no garantiza el orden de entrega respecto de
 * `subscription_cancelled`/`subscription_expired`. Mapear el nombre a "active",
 * como se hacía antes, convertía el corte a solo-lectura en una carrera: la
 * clínica cancelaba, llegaba `subscription_cancelled` (cortaba bien) y el
 * `subscription_updated` del MISMO cambio la volvía a activar. Y una clínica en
 * `past_due` seguía escribiendo durante las ~2 semanas de reintentos de cobro,
 * porque su `renews_at` todavía apuntaba al futuro.
 *
 * Por eso el estado sale de `attributes.status` y el evento solo decide SI
 * procesamos. `attrStatus` es opcional para no romper llamadas viejas, pero el
 * webhook siempre lo pasa; sin él caemos a un mapeo conservador por evento.
 */
export function statusFromLsEvent(
  evento: string,
  attrStatus?: string | null
): SubscriptionStatus | null {
  if (!EVENTOS_APLICABLES.includes(evento)) return null;

  const porAtributo = attrStatus ? STATUS_LS[String(attrStatus).toLowerCase()] : undefined;
  if (porAtributo) return porAtributo;

  /* Sin `attributes.status` utilizable. Conservador: los eventos ambiguos
   * (`updated`, refund) NO activan; solo confirmamos lo que el nombre del
   * evento afirma sin ambigüedad. */
  switch (evento) {
    case "subscription_created":
    case "subscription_resumed":
    case "subscription_unpaused":
    case "subscription_payment_success":
    case "subscription_payment_recovered":
      return "active";
    case "subscription_payment_failed":
      return "past_due";
    case "subscription_payment_refunded":
    case "subscription_paused":
    case "subscription_cancelled":
      return "canceled";
    case "subscription_expired":
      return "expired";
    default:
      return null; // `subscription_updated` sin status: no se aplica nada
  }
}

/**
 * Arma el link de checkout hospedado de LS para una clínica.
 *
 * El `clinic_id` viaja como custom data y vuelve en el webhook: es lo que nos
 * dice a QUIÉN activarle el plan. Lo inyecta el servidor desde el token del
 * usuario (no el cliente), así nadie paga apuntando a otra clínica por error.
 *
 * Devuelve `null` si la base no está configurada o no es https (una env mal
 * cargada no debe convertirse en un open-redirect desde nuestra propia app).
 */
export function buildCheckoutUrl(
  base: string | undefined | null,
  opts: { clinicId: string; token?: string; email?: string; name?: string }
): string | null {
  if (!base) return null;
  let url: URL;
  try { url = new URL(base); } catch { return null; }
  if (url.protocol !== "https:") return null;

  /* EL TOKEN ES LO QUE MANDA. El clinic_id viaja como parámetro de una URL que
   * el comprador tiene delante y puede editar antes de pagar. Y los clinicId son
   * PÚBLICOS por diseño: son el link de reservas que la clínica publica en su
   * Instagram (`/reservar/{clinicId}`). O sea que cualquiera podía abrir su
   * propio checkout, cambiar el clinic_id por el de otra clínica, pagar el plan
   * más barato y pisarle la suscripción a un competidor por 45 dólares.
   *
   * El token es un valor aleatorio que solo existe en el servidor asociado a una
   * clínica; adivinar el de otro es inviable. Se manda ADEMÁS del clinic_id para
   * no romper nada mientras conviven, pero el webhook le cree al token. */
  if (opts.token) url.searchParams.set("checkout[custom][novudent_token]", opts.token);
  url.searchParams.set("checkout[custom][clinic_id]", opts.clinicId);
  if (opts.email) url.searchParams.set("checkout[email]", opts.email);
  if (opts.name) url.searchParams.set("checkout[name]", opts.name);
  return url.toString();
}

/** Token de checkout que viene en el webhook, si el pago se originó en un
 *  checkout nuestro. Sin él caemos al clinic_id, que exige verificación extra. */
export function tokenDePayload(payload: any): string | null {
  const t = payload?.meta?.custom_data?.novudent_token;
  return typeof t === "string" && t.length >= 16 ? t : null;
}

/**
 * ¿Se puede aplicar esta suscripción entrante sobre la que ya existe?
 *
 * Segunda línea de defensa, y la que protege a las suscripciones creadas ANTES
 * del token (esas siguen renovando con el clinic_id pelado). Sin esto, un pago
 * hecho apuntando a otra clínica le pisa la suscripción: bajarle el plan de
 * Cadena a Solo le apaga módulos, y cancelar ese pago después la deja en
 * solo-lectura. Cuesta 45 dólares dejar frenada a una clínica.
 *
 * `porToken` dice si la clínica se resolvió con el token del checkout (que el
 * comprador no puede elegir) o con el `clinic_id` pelado (que sí edita en la
 * URL antes de pagar). SIN token solo se admite la RENOVACIÓN de una
 * suscripción ya conocida — nunca estrenar una.
 *
 * Esa distinción es el arreglo del agujero: antes el token era opcional, así
 * que se desactivaba la defensa entera borrando un parámetro del checkout. El
 * atacante ponía el `clinic_id` de la víctima, pagaba el plan más barato y le
 * pisaba la suscripción; después la cancelaba desde el portal de LS y la
 * dejaba en solo-lectura. Y como toda clínica recién dada de alta pasa 30 días
 * en trial SIN `lsSubscriptionId`, la rama de "primera compra" la autorizaba:
 * cada cliente nuevo era blanco durante su primer mes por 45 dólares.
 *
 * Con token, se permite el paso cuando hay una explicación legítima:
 *  · no hay suscripción todavía → primera compra;
 *  · la actual no tiene id de LS → es el trial manual del alta, y esta es la
 *    primera compra de verdad;
 *  · es LA MISMA suscripción de LS → renovación, cambio de plan o impago;
 *  · la actual ya no está vigente → la clínica se dio de baja y vuelve.
 *
 * Se bloquea el caso que no tiene explicación buena: una suscripción VIGENTE a
 * la que le llega un pago de OTRA suscripción distinta.
 */
export function puedeAplicarSuscripcion(
  actual: Subscription | null | undefined,
  entrante: Subscription,
  activa: (s: Subscription) => boolean,
  porToken: boolean,
): { ok: true } | { ok: false; motivo: string } {
  if (!porToken) {
    // Sin token, el clinicId lo eligió el comprador: solo vale para seguir
    // manteniendo una suscripción que YA estaba atada a esta clínica.
    if (actual?.lsSubscriptionId && actual.lsSubscriptionId === entrante.lsSubscriptionId) {
      return { ok: true };
    }
    return {
      ok: false,
      motivo:
        `pago sin token de checkout apuntado a ${entrante.clinicId}: solo se acepta la ` +
        `renovación de una suscripción ya vinculada (llegó ${entrante.lsSubscriptionId ?? "(sin id)"})`,
    };
  }
  if (!actual) return { ok: true };
  if (!actual.lsSubscriptionId) return { ok: true };
  if (actual.lsSubscriptionId === entrante.lsSubscriptionId) return { ok: true };
  if (!activa(actual)) return { ok: true };
  return {
    ok: false,
    motivo:
      `la clínica ${actual.clinicId} ya tiene la suscripción vigente ${actual.lsSubscriptionId} ` +
      `y llegó un pago de ${entrante.lsSubscriptionId ?? "(sin id)"}`,
  };
}

/** Mapa variant_id de LS → plan de Novudent. Se configura por env (ver la route). */
export type VariantPlanMap = Record<string, PlanId>;

/**
 * Traduce el payload del webhook a nuestro doc de suscripción.
 * Devuelve `null` cuando NO hay que tocar nada:
 *  - evento desconocido,
 *  - sin clínica resuelta (no sabemos a quién activarle el plan),
 *  - variante no mapeada (preferimos no activar nada antes que regalar un plan).
 */
export function subscriptionFromLsPayload(
  payload: any,
  variantPlans: VariantPlanMap,
  /** Clínica ya resuelta por la ruta (desde el token, o del clinic_id como
   *  respaldo). Se pasa desde afuera para que esta función no vuelva a confiar
   *  en un valor que el comprador puede editar en la URL. Si se omite, cae al
   *  clinic_id del payload — solo para no romper los tests viejos. */
  clinicIdResuelto?: string,
): Subscription | null {
  const evento = payload?.meta?.event_name;
  const attrs = payload?.data?.attributes ?? {};
  const status = statusFromLsEvent(evento, attrs.status);
  if (!status) return null;

  const clinicId = clinicIdResuelto ?? payload?.meta?.custom_data?.clinic_id;
  if (!clinicId || typeof clinicId !== "string") return null;

  const variantId = attrs.variant_id != null ? String(attrs.variant_id) : "";
  const plan = variantPlans[variantId];
  if (!plan) return null;

  /* FIN DEL PERÍODO. `ends_at` es lo que manda cuando la suscripción está por
   * terminar (cancelada con período pago corriendo); si no, vale `renews_at`.
   *
   * Que esto quede `undefined` es grave, no cosmético: `setDocument` es un PATCH
   * sin updateMask, así que un `undefined` BORRA el `currentPeriodEndMs` que ya
   * estaba guardado, y una suscripción `active` sin fecha no puede vencer nunca
   * — ni para `isSubscriptionActive()` ni para `subActive()` en las reglas. Era
   * el producto gratis para siempre. Por eso el webhook conserva el valor previo
   * cuando el payload no trae ninguna fecha utilizable. */
  const fin = [attrs.ends_at, attrs.renews_at]
    .map((s: unknown) => (typeof s === "string" ? Date.parse(s) : NaN))
    .find((n: number) => Number.isFinite(n));

  /* Marca de tiempo del CAMBIO en LS (no la nuestra): con esto el webhook
   * descarta payloads rancios que lleguen fuera de orden. */
  const lsUpdatedAtMs = typeof attrs.updated_at === "string" ? Date.parse(attrs.updated_at) : NaN;

  return {
    clinicId,
    plan,
    status,
    currentPeriodEndMs: fin,
    lsUpdatedAtMs: Number.isFinite(lsUpdatedAtMs) ? lsUpdatedAtMs : undefined,
    provider: "lemonsqueezy",
    lsSubscriptionId: payload?.data?.id != null ? String(payload.data.id) : undefined,
    lsCustomerId: attrs.customer_id != null ? String(attrs.customer_id) : undefined,
    lsVariantId: variantId || undefined,
    customerPortalUrl: attrs?.urls?.customer_portal,
    updatedAt: new Date().toISOString(),
    updatedBy: "webhook:lemonsqueezy",
  };
}
