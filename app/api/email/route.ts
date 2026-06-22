import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

/**
 * Email saliente — Novudent (andamiaje listo para enchufar).
 * POST { to, subject, html?, text? } → envía vía Resend.
 * Env (Vercel): RESEND_API_KEY, EMAIL_FROM (ej: "Clínica <no-reply@tudominio.com>").
 * Si no están configuradas, devuelve ok:false con mensaje claro (no falla silencioso).
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let user;
  try { user = await verifyIdToken(req); }
  catch (e) { return NextResponse.json({ ok: false, error: "No autorizado" }, { status: e instanceof AuthError ? e.status : 401 }); }

  const rl = rateLimit(`email:${user.uid}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return NextResponse.json({ ok: false, error: "El envío de email no está configurado. Cargá RESEND_API_KEY y EMAIL_FROM en el servidor." }, { status: 503 });
  }

  let body: { to?: string | string[]; subject?: string; html?: string; text?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }

  const to = Array.isArray(body.to) ? body.to : body.to ? [body.to] : [];
  if (to.length === 0) return NextResponse.json({ ok: false, error: "Destinatario requerido" }, { status: 400 });
  if (!body.subject) return NextResponse.json({ ok: false, error: "Asunto requerido" }, { status: 400 });
  if (!body.html && !body.text) return NextResponse.json({ ok: false, error: "Contenido requerido" }, { status: 400 });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: to.slice(0, 50), subject: body.subject.slice(0, 200), html: body.html, text: body.text }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[Email] Resend error:", (data as { message?: string })?.message || res.status);
      return NextResponse.json({ ok: false, error: "No se pudo enviar el email. Probá de nuevo." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, id: (data as { id?: string })?.id });
  } catch (e) {
    console.error("[Email] error:", e);
    return NextResponse.json({ ok: false, error: "El servicio de email no está disponible." }, { status: 502 });
  }
}
