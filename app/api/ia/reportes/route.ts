import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

/**
 * Reportes IA — Novudent IA (Fase 2).
 *
 * POST { question, datos }  →  { ok, answer }
 *
 * "Pregúntale a tus datos": el administrador escribe una pregunta en
 * lenguaje natural ("¿cuánto cobramos este mes?", "¿qué dentista
 * produjo más?", "¿cómo viene la aceptación de presupuestos?") y la
 * IA responde SOLO con los agregados que la página de Reportes ya
 * computa y envía como contexto. Regla dura: no inventar números.
 */

export async function POST(req: NextRequest) {
  // Solo usuarios autenticados de este proyecto Firebase (cierra el proxy abierto a Gemini).
  let _user;
  try {
    _user = await verifyIdToken(req);
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status });
  }
  // Rate limit por usuario (frena el abuso de la cuota de Gemini).
  const _rl = rateLimit(`ia:${_user.uid}`, { limit: 20, windowMs: 60_000 });
  if (!_rl.ok) return tooManyRequests(_rl.retryAfterSec);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "GEMINI_API_KEY no configurada en el servidor" },
      { status: 500 }
    );
  }

  let body: { question?: string; datos?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const question = String(body.question || "").trim().slice(0, 400);
  if (!question) {
    return NextResponse.json({ ok: false, error: "question requerida" }, { status: 400 });
  }
  const datos = JSON.stringify(body.datos || {});
  if (datos.length > 80_000) {
    return NextResponse.json({ ok: false, error: "Payload demasiado grande" }, { status: 413 });
  }

  const PROMPT = `Sos el analista de gestión de una clínica dental paraguaya.
Respondé la PREGUNTA del administrador usando EXCLUSIVAMENTE los DATOS
(JSON de agregados de los últimos 30 días salvo que indique otra cosa).

Reglas:
- NO inventes ni extrapoles números que no estén en los datos.
- Si la pregunta no se puede responder con estos datos, decilo claro y
  sugerí qué reporte de la página sí lo tiene.
- Montos en guaraníes con formato Gs. 1.234.567.
- Respuesta corta y accionable: 2-6 líneas o viñetas, sin preámbulos.
- Si detectás algo preocupante relacionado (ej. morosidad alta al
  preguntar por ingresos), mencionalo en UNA línea extra con "⚠".

DATOS:
${datos}

PREGUNTA: ${question}`;

  const model = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 600 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "El asistente de IA no está disponible en este momento. Probá de nuevo en unos minutos." },
        { status: 502 }
      );
    }
    const answer: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("")
        .trim() || "";
    if (!answer) {
      return NextResponse.json({ ok: false, error: "Sin respuesta del modelo" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, answer: answer.slice(0, 3000) });
  } catch (e) {
    console.error("[Consulta] error:", e);
    return NextResponse.json({ ok: false, error: "El asistente de IA no está disponible en este momento. Probá de nuevo en unos minutos." }, { status: 502 });
  }
}
