import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

/**
 * Contralor IA — Novudent IA (Fase 2).
 *
 * POST { pendientes }  →  { ok, digest }
 *
 * Supervisa los flujos clínicos y administrativos: recibe el snapshot
 * de pendientes que el dashboard ya computa (formularios sin
 * completar, presupuestos presentados sin respuesta, morosos, citas
 * de mañana sin confirmar, canceladas de la semana, stock bajo) y
 * devuelve un parte diario PRIORIZADO con acciones concretas para el
 * equipo — qué atacar primero y por qué.
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

  let body: { pendientes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const pendientes = JSON.stringify(body.pendientes || {});
  if (pendientes.length > 60_000) {
    return NextResponse.json({ ok: false, error: "Payload demasiado grande" }, { status: 413 });
  }

  const PROMPT = `Sos el CONTRALOR de una clínica dental paraguaya: supervisás
que ningún flujo clínico ni administrativo quede colgado.

Con el snapshot de PENDIENTES (JSON), redactá el parte del día para el
equipo de recepción/administración:

Formato:
🔴 URGENTE — lo que hay que hacer HOY (con quién/cuántos y la acción concreta)
🟡 ESTA SEMANA — lo que no puede pasar de esta semana
🟢 AL DÍA — una línea reconociendo lo que está en orden (si lo hay)

Reglas:
- Priorizá por impacto: dinero por cobrar > citas de mañana sin
  confirmar > presupuestos sin seguimiento > formularios > stock.
- Acciones CONCRETAS ("llamar a X", "reponer Y"), no genéricas.
- Montos Gs. 1.234.567. Máximo 10 líneas en total.
- NO inventes datos: solo lo que está en el JSON. Si una categoría
  viene vacía, no la menciones.
- Si no hay NADA pendiente: una sola línea celebrándolo.

PENDIENTES:
${pendientes}`;

  const model = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
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
    const digest: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("")
        .trim() || "";
    if (!digest) {
      return NextResponse.json({ ok: false, error: "Sin respuesta del modelo" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, digest: digest.slice(0, 3000) });
  } catch (e) {
    console.error("[Contralor] error:", e);
    return NextResponse.json({ ok: false, error: "El asistente de IA no está disponible en este momento. Probá de nuevo en unos minutos." }, { status: 502 });
  }
}
