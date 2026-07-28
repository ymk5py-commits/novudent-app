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
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { getDocument, isServerFirestoreConfigured } from "@/lib/server/firestore-rest";
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

  const rl = rateLimit(`checkout:${user.uid}`, { limit: 10, windowMs: 60_000 });
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

  const url = buildCheckoutUrl(process.env[CHECKOUT_ENV[plan]], {
    clinicId,
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
