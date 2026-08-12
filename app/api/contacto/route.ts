import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

/**
 * Pedido de acceso desde la landing — PÚBLICO, sin sesión.
 *
 * Ruta aparte de `/api/email` a propósito, y no es duplicación: aquella exige
 * `verifyIdToken` y bloquea anónimos porque manda desde el dominio verificado
 * de una clínica a destinatarios ARBITRARIOS — abrirla al público sería un
 * open-relay de manual. Esta manda a UNA sola dirección fija, la del dueño, que
 * el visitante no elige ni ve. Ese es el detalle que la hace segura.
 *
 * Env (Vercel): RESEND_API_KEY, EMAIL_FROM, LEADS_EMAIL (a dónde llegan).
 */
export const runtime = "nodejs";

const MAX = { nombre: 120, clinica: 120, email: 160, telefono: 40, mensaje: 1200 };

/** Recorta y normaliza. Todo lo que entra es texto de un desconocido. */
const limpiar = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** Escapa antes de meter nada en el HTML del correo: el cuerpo lo escribe un
 *  visitante anónimo, así que sin esto tenemos inyección de HTML en la bandeja
 *  del dueño (links falsos, texto que se hace pasar por Novudent). */
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export async function POST(req: NextRequest) {
  /* Limita por IP: no hay sesión con la cual limitar. Cinco por hora alcanza de
     sobra para alguien que pide acceso de verdad y corta el envío masivo. */
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocida";
  const rl = rateLimit(`contacto:${ip}`, { limit: 5, windowMs: 3_600_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 }); }

  /* Trampa para bots: un campo que el CSS esconde. Una persona no lo completa
     nunca; los bots que rellenan todo, sí. Se responde 200 para no enseñarles
     que fueron detectados. */
  if (limpiar(body.website, 100)) return NextResponse.json({ ok: true });

  const nombre = limpiar(body.nombre, MAX.nombre);
  const clinica = limpiar(body.clinica, MAX.clinica);
  const email = limpiar(body.email, MAX.email);
  const telefono = limpiar(body.telefono, MAX.telefono);
  const mensaje = limpiar(body.mensaje, MAX.mensaje);

  if (!nombre || !email) {
    return NextResponse.json({ ok: false, error: "Necesitamos tu nombre y tu email." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Ese email no parece válido." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = process.env.LEADS_EMAIL;
  if (!apiKey || !from || !to) {
    console.error("[Contacto] faltan envs: RESEND_API_KEY / EMAIL_FROM / LEADS_EMAIL");
    /* 503 con mensaje humano: el visitante no tiene por qué enterarse de que
       falta una variable de entorno, pero tampoco puede quedarse creyendo que
       su pedido salió cuando no salió. */
    return NextResponse.json(
      { ok: false, error: "No pudimos registrar tu pedido ahora. Escribinos directamente y te respondemos." },
      { status: 503 },
    );
  }

  const filas: [string, string][] = [
    ["Nombre", nombre], ["Clínica", clinica || "—"],
    ["Email", email], ["Teléfono", telefono || "—"],
  ];

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email, // responder desde la bandeja le contesta a quien pidió
        subject: `Pedido de acceso — ${nombre}${clinica ? ` (${clinica})` : ""}`,
        html: `<h2 style="font:600 18px system-ui;margin:0 0 12px">Nuevo pedido de acceso</h2>
<table style="font:14px system-ui;border-collapse:collapse">
${filas.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5B6B85">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join("")}
</table>
${mensaje ? `<p style="font:14px system-ui;margin:16px 0 0;white-space:pre-wrap">${esc(mensaje)}</p>` : ""}`,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error("[Contacto] Resend:", res.status);
      return NextResponse.json({ ok: false, error: "No pudimos enviar tu pedido. Probá de nuevo en un momento." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[Contacto] error:", e);
    return NextResponse.json({ ok: false, error: "No pudimos enviar tu pedido. Probá de nuevo en un momento." }, { status: 502 });
  }
}
