import { correoConfigurado, enviarCorreo } from "@/lib/server/correo";
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { requireMiembro } from "@/lib/server/require-feature";

/**
 * Email saliente — Novudent. SMTP propio o proveedor compatible, configurado solo en el servidor.
 * POST { to, subject, html?, text? } → confirmación de aceptación del servidor de correo.
 * Si no están configuradas, devuelve ok:false con mensaje claro (no falla silencioso).
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let user;
  try { user = await verifyIdToken(req); }
  catch (e) { return NextResponse.json({ ok: false, error: "No autorizado" }, { status: e instanceof AuthError ? e.status : 401 }); }

  // Las cuentas anónimas (modo demo) NO pueden enviar email: sería un open-relay
  // desde el dominio verificado de la clínica (phishing/spam). Solo usuarios reales.
  if (user.isAnonymous) {
    return NextResponse.json({ ok: false, error: "El envío de email no está disponible en el modo demo." }, { status: 403 });
  }
  try { await requireMiembro(user.uid); }
  catch (e) { return NextResponse.json({ ok: false, error: "Tu cuenta no puede enviar correos de esta clínica." }, { status: e instanceof AuthError ? e.status : 503 }); }

  const rl = await rateLimit(`email:${user.uid}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  if (!correoConfigurado()) {
    return NextResponse.json({ ok: false, error: "El envío de email no está configurado. Configurá la cuenta de correo en el servidor." }, { status: 503 });
  }

  let body: { to?: string | string[]; subject?: string; html?: string; text?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }

  const to = Array.isArray(body.to) ? body.to : body.to ? [body.to] : [];
  if (to.length === 0) return NextResponse.json({ ok: false, error: "Destinatario requerido" }, { status: 400 });
  if (!body.subject) return NextResponse.json({ ok: false, error: "Asunto requerido" }, { status: 400 });
  if (!body.html && !body.text) return NextResponse.json({ ok: false, error: "Contenido requerido" }, { status: 400 });

  try {
    const resultado = await enviarCorreo({ to: to.slice(0, 10), subject: body.subject.slice(0, 200), html: body.html, text: body.text });
    return NextResponse.json({ ok: true, id: resultado.id, estado: resultado.estado });
  } catch (e) {
    console.error("[Email] el servidor no confirmó el envío");
    return NextResponse.json({ ok: false, error: "El servicio de email no está disponible." }, { status: 502 });
  }
}
