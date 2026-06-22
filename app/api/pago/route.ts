import { NextResponse } from "next/server";
import { getDocument, isServerFirestoreConfigured } from "@/lib/server/firestore-rest";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";

/** Datos públicos de pago de una clínica (para la página /pagar/[cid]).
 *  Lectura por usuario de servicio. NO expone credenciales secretas: solo el
 *  link de checkout que la clínica configuró (de su propia pasarela) + datos de
 *  transferencia + teléfono. */
export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cid = searchParams.get("cid");
  if (!cid) return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 });
  const rl = rateLimit(`pago:${clientIp(req)}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  if (!isServerFirestoreConfigured()) return NextResponse.json({ error: "Servidor no configurado." }, { status: 503 });
  try {
    const clinic = await getDocument(`clinics/${cid}`);
    if (!clinic) return NextResponse.json({ error: "Clínica no encontrada." }, { status: 404 });
    const config = (clinic.config ?? {}) as { payments?: { checkoutUrl?: string; bankInfo?: string }; phone?: string; currency?: string };
    // Solo emitimos el checkout si es https:// — nunca un javascript:/http: (anti open-redirect/XSS).
    const rawCheckout = config.payments?.checkoutUrl;
    const checkoutUrl = rawCheckout && /^https:\/\//i.test(rawCheckout) ? rawCheckout : undefined;
    return NextResponse.json({
      clinicName: clinic.name ?? "",
      checkoutUrl,
      bankInfo: config.payments?.bankInfo,
      phone: config.phone,
      currency: config.currency ?? "PYG",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
