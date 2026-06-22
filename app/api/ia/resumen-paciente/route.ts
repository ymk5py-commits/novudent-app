import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";

/**
 * Resumen Clínico — Novudent IA.
 *
 * POST { patient: {...}, context: { appointments, budgets, balance } }
 *  →  { ok, summary }
 *
 * "Preparar consulta": el profesional abre la ficha y obtiene un brief
 * de 4-6 líneas con lo esencial antes de atender: último tratamiento,
 * pendientes, deuda, alertas. El cliente arma el payload desde su
 * store (los datos ya viven en el browser); este endpoint solo aporta
 * el LLM con la key segura del lado servidor.
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
  // Tope adicional por IP: el límite por-uid se evade creando múltiples sesiones
  // anónimas (demo). Por-IP frena la rotación que multiplicaría la cuota de Gemini.
  const _rlIp = rateLimit(`ia-ip:${clientIp(req)}`, { limit: 40, windowMs: 60_000 });
  if (!_rlIp.ok) return tooManyRequests(_rlIp.retryAfterSec);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "GEMINI_API_KEY no configurada en el servidor" },
      { status: 500 }
    );
  }

  let body: { patient?: unknown; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  if (!body.patient) {
    return NextResponse.json({ ok: false, error: "patient requerido" }, { status: 400 });
  }

  // Cap del payload — el cliente manda un subset compacto, no la DB.
  const payload = JSON.stringify({ patient: body.patient, context: body.context || {} });
  if (payload.length > 60_000) {
    return NextResponse.json({ ok: false, error: "Payload demasiado grande" }, { status: 413 });
  }

  const PROMPT = `Sos el asistente clínico de una clínica dental paraguaya.
Con los datos del paciente (JSON abajo), prepará un BRIEF PRE-CONSULTA
para el profesional que está por atenderlo. Formato:

• Una línea de presentación: nombre, edad si se puede calcular, aseguradora.
• Último tratamiento / evolución relevante (qué y cuándo).
• Tratamientos o planes PENDIENTES (presupuestos presentados sin aceptar, plan de ortodoncia activo, próximas citas).
• Situación de pago: deuda o cuotas pendientes si las hay (montos en guaraníes con formato Gs. X.XXX.XXX).
• ⚠ Alertas si corresponde: formularios sin completar, historial desactualizado, NPS bajo, inasistencias.

Reglas:
- Máximo 6 viñetas, lenguaje clínico directo, en español.
- NO inventes datos: si algo no está en el JSON, no lo menciones.
- Si no hay nada relevante en una categoría, omitila (no escribas "sin datos").

DATOS:
${payload}`;

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
      console.error("[Resumen] Gemini error:", data?.error?.message || res.status);
      return NextResponse.json({ ok: false, error: "El asistente de IA no está disponible en este momento. Probá de nuevo en unos minutos." }, { status: 502 });
    }
    const summary: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("")
        .trim() || "";
    if (!summary) {
      return NextResponse.json({ ok: false, error: "Sin respuesta del modelo" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, summary: summary.slice(0, 4000) });
  } catch (e) {
    console.error("[Resumen] error:", e);
    return NextResponse.json({ ok: false, error: "El asistente de IA no está disponible en este momento. Probá de nuevo en unos minutos." }, { status: 502 });
  }
}
