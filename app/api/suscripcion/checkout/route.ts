/**
 * Genera el link de checkout de Lemon Squeezy para la clínica del usuario.
 *
 * Por qué pasa por el servidor y no se arma en el cliente: el `clinic_id` que
 * viaja en el checkout es lo que el webhook usa para decidir A QUIÉN activarle
 * el plan. Acá se resuelve desde `directory/{uid}` con el token verificado, así
 * el navegador no elige a qué clínica se le acredita el pago.
 *
 * LS es Merchant of Record y el checkout es hospedado: los datos de tarjeta
 * nunca tocan Novudent.
 *
 * Env (Vercel): LS_CHECKOUT_SOLO, LS_CHECKOUT_CLINICA, LS_CHECKOUT_CADENA.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { getDocument, setDocument, isServerFirestoreConfigured } from "@/lib/server/firestore-rest";
import { buildCheckoutUrl } from "@/lib/lemonsqueezy";
import type { PlanId } from "@/lib/plan";

export const runtime = "nodejs";

const CHECKOUT_ENV: Record<PlanId, string> = {
  solo: "LS_CHECKOUT_SOLO",
  clinica: "LS_CHECKOUT_CLINICA",
  cadena: "LS_CHECKOUT_CADENA",
};

export async function POST(req: Request) {
  let user;
  try { user = await verifyIdToken(req); }
  catch (e) { return NextResponse.json({ ok: false, error: "No autorizado" }, { status: e instanceof AuthError ? e.status : 401 }); }

  // La demo no compra planes (y su sesión es anónima).
  if (user.isAnonymous) {
    return NextResponse.json({ ok: false, error: "El modo demo no puede contratar planes." }, { status: 403 });
  }

  const rl = await rateLimit(`checkout:${user.uid}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  if (!isServerFirestoreConfigured()) {
    return NextResponse.json({ ok: false, error: "Servidor no configurado." }, { status: 503 });
  }

  let body: { plan?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }

  const plan = body.plan as PlanId;
  if (!plan || !(plan in CHECKOUT_ENV)) {
    return NextResponse.json({ ok: false, error: "Plan inválido" }, { status: 400 });
  }

  // La clínica sale del directorio server-side, NO de lo que mande el cliente.
  const dir = await getDocument(`directory/${user.uid}`);
  const clinicId = typeof dir?.clinicId === "string" ? dir.clinicId : null;
  if (!clinicId) {
    return NextResponse.json({ ok: false, error: "No pudimos identificar tu clínica." }, { status: 400 });
  }

  /* MISMO RBAC QUE LA PANTALLA. La página de suscripción exige
   * `can(role,"practice.config")` (solo admin), pero la ruta resolvía la clínica
   * únicamente por `directory/{uid}` y emitía el token — sin mirar el rol ni si
   * el usuario sigue activo. Y `directory/{uid}` NO se borra al dar de baja a un
   * empleado, así que la cuenta de un despedido seguía sirviendo.
   *
   * Con ese token, un asistente o un ex-empleado podía pagar el plan más barato:
   * si la clínica todavía está en el trial del alta, cuenta como primera compra,
   * la degrada a Solo y ata la suscripción a la cuenta de Lemon Squeezy del
   * atacante — que después la cancela desde el portal y la deja en solo-lectura.
   * Es el ataque de los $45 que el token cerró para desconocidos, reabierto para
   * cualquiera que alguna vez tuvo login en la clínica. */
  const miembro = (await getDocument(`clinics/${clinicId}/users/${user.uid}`).catch(() => null)) as
    | { role?: string; active?: boolean } | null;
  if (!miembro || miembro.active === false || miembro.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Solo un administrador de la clínica puede contratar o cambiar el plan." },
      { status: 403 },
    );
  }

  /* Token que ata este checkout a ESTA clínica.
   *
   * El clinic_id viaja como parámetro de la URL de LS, a la vista del comprador
   * y editable antes de pagar. Y los clinicId son públicos: son el link de
   * reservas que la clínica publica (`/reservar/{clinicId}`). Sin token,
   * cualquiera abría su propio checkout, ponía el id de un competidor, pagaba el
   * plan más barato y le pisaba la suscripción — o la cancelaba después y lo
   * dejaba en solo-lectura. Cuarenta y cinco dólares para frenar a otra clínica.
   *
   * El token es aleatorio y solo el servidor sabe a qué clínica corresponde.
   * NO es de un solo uso: LS reenvía el mismo custom_data en cada renovación,
   * así que tiene que seguir resolviendo mientras la suscripción viva. */
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 8);
  try {
    await setDocument(`checkoutTokens/${token}`, {
      token, clinicId, plan, uid: user.uid,
      creadoEn: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[checkout] no se pudo crear el token:", e);
    return NextResponse.json(
      { ok: false, error: "No pudimos abrir el pago ahora. Probá de nuevo en un momento." },
      { status: 503 },
    );
  }

  const url = buildCheckoutUrl(process.env[CHECKOUT_ENV[plan]], {
    clinicId,
    token,
    email: user.email,
  });
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "Ese plan todavía no tiene el cobro habilitado. Escribinos y lo activamos." },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, url });
}
