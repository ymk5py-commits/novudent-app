/**
 * Webhook de Lemon Squeezy — activa/suspende la suscripción de una clínica.
 *
 * Es el ÚNICO camino por el que se escribe `subscriptions/{cid}` (el cliente
 * solo la lee; ver firestore.rules). Por eso todo acá es defensivo:
 *   1. Firma HMAC-SHA256 obligatoria sobre el cuerpo CRUDO — sin esto,
 *      cualquiera POSTea "la clínica X compró Cadena" y se activa gratis.
 *   2. Idempotencia: LS reintenta ante cualquier error; un evento repetido no
 *      debe re-aplicarse.
 *   3. Variante no mapeada → no se toca nada (mejor no activar que regalar).
 *
 * Env (Vercel): LEMONSQUEEZY_WEBHOOK_SECRET, LS_VARIANT_SOLO, LS_VARIANT_CLINICA,
 * LS_VARIANT_CADENA + los del usuario de servicio (SERVICE_USER_*).
 * Si no están configuradas, responde 503 sin romper (igual que /api/email).
 */
import { NextResponse } from "next/server";
import { verifyLsSignature, subscriptionFromLsPayload, tokenDePayload, puedeAplicarSuscripcion, type VariantPlanMap } from "@/lib/lemonsqueezy";
import { isValidToken, isValidId } from "@/lib/server/ids";
import { isSubscriptionActive } from "@/lib/subscription";
import type { Subscription } from "@/lib/types";
import { setDocument, getDocument, createIfAbsent, isServerFirestoreConfigured } from "@/lib/server/firestore-rest";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

/** variant_id de LS → plan. Se configura por env para no hardcodear ids de la tienda. */
function variantPlanMap(): VariantPlanMap {
  const map: VariantPlanMap = {};
  if (process.env.LS_VARIANT_SOLO) map[process.env.LS_VARIANT_SOLO] = "solo";
  if (process.env.LS_VARIANT_CLINICA) map[process.env.LS_VARIANT_CLINICA] = "clinica";
  if (process.env.LS_VARIANT_CADENA) map[process.env.LS_VARIANT_CADENA] = "cadena";
  return map;
}

/** Id estable por transición de estado, para no re-aplicar reintentos de LS. */
function eventKey(payload: any): string {
  const sub = payload?.data?.id ?? "sin-sub";
  const evt = payload?.meta?.event_name ?? "sin-evento";
  const at = payload?.data?.attributes?.updated_at ?? "";
  return `ls_${sub}_${evt}_${at}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
}

export async function POST(req: Request) {
  const rl = rateLimit(`ls-webhook:${clientIp(req)}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret || !isServerFirestoreConfigured()) {
    return NextResponse.json({ ok: false, error: "Cobro no configurado en el servidor." }, { status: 503 });
  }

  // OJO: el cuerpo CRUDO, sin parsear — la firma se calcula sobre estos bytes.
  const raw = await req.text();
  const signature = req.headers.get("x-signature") ?? "";
  if (!verifyLsSignature(raw, signature, secret)) {
    console.error("[LS] firma inválida — se descarta el webhook");
    return NextResponse.json({ ok: false, error: "Firma inválida" }, { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(raw); }
  catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }

  /* A QUÉ CLÍNICA se le acredita el pago. El token manda sobre el clinic_id:
   * el clinic_id viaja en la URL del checkout, a la vista del comprador y
   * editable antes de pagar, y además es público (es el link de reservas de la
   * clínica). El token es aleatorio y solo el servidor sabe a qué clínica
   * pertenece.
   *
   * El token es OBLIGATORIO para estrenar una suscripción. Cuando era opcional,
   * la defensa entera se desactivaba borrando un parámetro del checkout: el
   * atacante ponía `clinic_id=<víctima>`, pagaba el plan más barato y le pisaba
   * la suscripción (bajándole el plan, y después cancelándola desde el portal
   * de LS). El guard de pertenencia no lo frenaba porque toda clínica recién
   * dada de alta pasa 30 días en trial SIN `lsSubscriptionId`, y esa es
   * justamente la rama que autoriza la primera compra. O sea: cada cliente
   * nuevo era blanco durante su primer mes.
   *
   * Sin token solo se admite la RENOVACIÓN de una suscripción ya conocida: más
   * abajo, `puedeAplicarSuscripcion` exige que el `lsSubscriptionId` guardado
   * coincida con el del evento. Eso cubre a las suscripciones anteriores al
   * token sin volver a abrir la puerta. */
  let clinicIdResuelto: string | undefined;
  const token = tokenDePayload(payload);
  if (token) {
    if (!isValidToken(token)) {
      console.error("[LS] token de checkout con formato inválido — no se aplica nada");
      return NextResponse.json({ ok: true, ignored: true });
    }
    const doc = await getDocument(`checkoutTokens/${token}`).catch(() => null);
    if (!doc || typeof doc.clinicId !== "string") {
      console.error("[LS] token de checkout desconocido — no se aplica nada");
      return NextResponse.json({ ok: true, ignored: true });
    }
    clinicIdResuelto = doc.clinicId;
  }

  const sub = subscriptionFromLsPayload(payload, variantPlanMap(), clinicIdResuelto);
  if (!sub) {
    // Evento que no nos toca (order_created, variante sin mapear, etc.).
    // 200 a propósito: si devolvemos error, LS reintenta para siempre.
    return NextResponse.json({ ok: true, ignored: true });
  }

  // El clinicId puede venir del payload (editable por el comprador): se valida
  // la gramática antes de que llegue a un path de Firestore.
  if (!isValidId(sub.clinicId)) {
    console.error("[LS] clinic_id con formato inválido — no se aplica nada");
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    /* GUARD DE PERTENENCIA — segunda línea de defensa, y la única que protege a
     * las suscripciones anteriores al token. Un pago que llega a una clínica que
     * YA tiene una suscripción vigente de OTRA suscripción de LS no se aplica:
     * ese es exactamente el ataque de bajarle el plan o cancelárselo a otro. */
    const actual = (await getDocument(`subscriptions/${sub.clinicId}`).catch(() => null)) as
      | (Subscription & Record<string, unknown>) | null;
    const permitido = puedeAplicarSuscripcion(actual, sub, (s) => isSubscriptionActive(s), !!clinicIdResuelto);
    if (!permitido.ok) {
      console.error(`[LS] RECHAZADO — ${permitido.motivo}`);
      // 200: el pago existe y LS no tiene por qué reintentar. Queda en el log
      // para que el dueño lo resuelva a mano (probablemente sea un reembolso).
      return NextResponse.json({ ok: true, rejected: true });
    }

    // Idempotencia: si el evento ya se procesó, createIfAbsent devuelve false.
    const nuevo = await createIfAbsent(`webhookEvents/${eventKey(payload)}`, {
      provider: "lemonsqueezy",
      clinicId: sub.clinicId,
      event: payload?.meta?.event_name ?? "",
      receivedAt: new Date().toISOString(),
    });
    if (!nuevo) return NextResponse.json({ ok: true, duplicate: true });

    await setDocument(`subscriptions/${sub.clinicId}`, sub as unknown as Record<string, unknown>);
    console.log(`[LS] ${payload?.meta?.event_name} → ${sub.clinicId} = ${sub.plan}/${sub.status}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // 500 para que LS reintente (la idempotencia cubre el reintento).
    console.error("[LS] error aplicando la suscripción:", e);
    return NextResponse.json({ ok: false, error: "No se pudo aplicar la suscripción." }, { status: 500 });
  }
}
