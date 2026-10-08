import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { requireFeature } from "@/lib/server/require-feature";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";
import { getDocument } from "@/lib/server/firestore-rest";
import { can, normalizarPermisos, type PermisosDeLaClinica } from "@/lib/rbac";
import type { Role } from "@/lib/types";

/**
 * Resumen semanal — Mi agenda (Novudent IA).
 *
 * POST { datos }  →  { ok, resumen }
 *
 * Recibe los CONTEOS de la semana de una persona (sus tareas, la rutina, la bandeja, las citas) —el
 * navegador los arma con `resumenSemanaDatos`, sin nombres de pacientes ni textos de tareas— y devuelve
 * un resumen corto con lo que no puede quedar para la semana que viene. La producción en guaraníes solo
 * se usa si el rol de quien pide ve reportes financieros: acá se vuelve a controlar, no se confía en el
 * navegador.
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
  const _rl = await rateLimit(`ia:${_user.uid}`, { limit: 20, windowMs: 60_000 });
  if (!_rl.ok) return tooManyRequests(_rl.retryAfterSec);
  // Tope adicional por IP: el límite por-uid se evade creando múltiples sesiones
  // anónimas (demo). Por-IP frena la rotación que multiplicaría la cuota de Gemini.
  const _rlIp = await rateLimit(`ia-ip:${clientIp(req)}`, { limit: 40, windowMs: 60_000 });
  if (!_rlIp.ok) return tooManyRequests(_rlIp.retryAfterSec);

  /* MEMBRESÍA + SUSCRIPCIÓN + PLAN, ANTES de gastar Gemini (ver lib/server/require-feature.ts). */
  let rol: string;
  let permisos: PermisosDeLaClinica | undefined;
  try {
    const autorizado = await requireFeature(_user.uid, "ia");
    rol = autorizado.role;
    // La clínica puede darle o sacarle a cada rol los reportes financieros (Permisos del equipo). Si no se pudo leer queda la
    // matriz de fábrica, que para este permiso es la más estricta (solo el administrador): los montos no salen de más.
    const clinica = await getDocument(`clinics/${autorizado.clinicId}`).catch(() => null);
    permisos = normalizarPermisos((clinica?.config as { permisos?: unknown } | undefined)?.permisos);
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 403;
    return NextResponse.json({ ok: false, error: e instanceof AuthError ? e.message : "No autorizado" }, { status });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "GEMINI_API_KEY no configurada en el servidor" }, { status: 500 });
  }

  let body: { datos?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const datos = body.datos;
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) {
    return NextResponse.json({ ok: false, error: "Faltan los datos de la semana" }, { status: 400 });
  }
  const limpios: Record<string, unknown> = { ...(datos as Record<string, unknown>) };
  // Los montos son de quien ve reportes financieros (billing.reports).
  if (!can(rol as Role, "billing.reports", permisos)) delete limpios.produccionSemanaGs;
  const json = JSON.stringify(limpios);
  if (json.length > 20_000) {
    return NextResponse.json({ ok: false, error: "Payload demasiado grande" }, { status: 413 });
  }

  const PROMPT = `Sos el asistente de una clínica dental paraguaya. Con los DATOS de la semana de una
persona del equipo (JSON, solo conteos), escribí su resumen semanal:

1) Cómo va la semana: sus tareas (hechas, pendientes, atrasadas) y las citas (confirmadas,
   por confirmar, canceladas y ausentes).
2) Lo que no puede quedar para la semana que viene: atrasadas, rutina sin resolver y lo pendiente
   de la bandeja por tipo.
3) Una sugerencia concreta para empezar mañana.

Reglas:
- Máximo 8 líneas, con viñetas cortas, tono cercano (español rioplatense).
- Usá SOLO los números del JSON. No inventes datos ni nombres.
- Si viene "produccionSemanaGs", mencionala en Gs. con puntos de miles (1.234.567).
- Si una categoría viene vacía o en cero, no la menciones.
- Si no hay nada pendiente, una sola línea celebrándolo.

DATOS:
${json}`;

  const model = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 700 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[Agenda resumen] Gemini error:", data?.error?.message || res.status);
      return NextResponse.json({ ok: false, error: "El asistente de IA no está disponible en este momento. Probá de nuevo en unos minutos." }, { status: 502 });
    }
    const resumen: string =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("").trim() || "";
    if (!resumen) {
      return NextResponse.json({ ok: false, error: "Sin respuesta del modelo" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, resumen: resumen.slice(0, 3000) });
  } catch (e) {
    console.error("[Agenda resumen] error:", e);
    return NextResponse.json({ ok: false, error: "El asistente de IA no está disponible en este momento. Probá de nuevo en unos minutos." }, { status: 502 });
  }
}
