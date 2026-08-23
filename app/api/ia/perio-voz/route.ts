import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { requireFeature } from "@/lib/server/require-feature";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";
import { SITE_ORDER } from "@/lib/perio-voice";

/**
 * Dictado periodontal por voz — Novudent IA.
 *
 * POST { audio: base64, mimeType }
 *  →  { ok, tooth, pd, bop, mobility?, transcript }
 *
 * El dentista dicta la pieza y sus 6 profundidades de sondaje en orden
 * MV/V/DV/ML/L/DL; Gemini transforma el audio en JSON estructurado listo
 * para el periodontograma. La key de Gemini vive SOLO acá (server) — nunca
 * en el cliente.
 *
 * Env: GEMINI_API_KEY, GEMINI_AUDIO_MODEL (default gemini-2.5-flash).
 */

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // ~10 MB

// Site labels in order for the prompt — built from SITE_ORDER so they can't diverge.
// SITE_ORDER = ["MV", "V", "DV", "ML", "L", "DL"]
const SITE_LABELS: Record<string, string> = {
  MV: "mesio-vestibular",
  V: "vestibular",
  DV: "disto-vestibular",
  ML: "mesio-lingual/palatino",
  L: "lingual/palatino",
  DL: "disto-lingual/palatino",
};

const SITES_ENUMERATED = SITE_ORDER.map(
  (code, i) => `pd[${i}]=${code} (${SITE_LABELS[code]})`
).join(", ");

const PROMPT = `Sos un asistente clínico de una clínica dental en Paraguay.
Un odontólogo acaba de DICTAR por voz la medición periodontal de UNA pieza dental.

Tu tarea: extraé del audio UNA pieza dental y sus mediciones de sondaje periodontal.

Los 6 sitios en ORDEN FIJO son: ${SITES_ENUMERATED}.
El odontólogo dicta los 6 valores de profundidad de sondaje (pd) en ESE orden exacto.

Respondé SOLO este JSON (sin markdown, sin explicación adicional):
{"tooth":"16","pd":[3,2,4,5,3,2],"bop":[true,false,false,true,false,false],"mobility":1,"transcript":"..."}

Reglas:
- "tooth": número de pieza en notación FDI (ej. "16", "21"). Solo el número, sin texto.
- "pd": array de 6 enteros (profundidad en mm, rango 1-15), en el orden MV/V/DV/ML/L/DL.
  Si un sitio no se dictó, usar null para ese índice.
- "bop": array de 6 booleanos. true donde el odontólogo indicó sangrado al sondaje.
  Mapeá "sangra mesial", "sangra vestibular", "sangra lingual", etc. al sitio correcto.
  Si no menciona sangrado en ningún sitio, todos son false.
- "mobility": movilidad dentaria (0, 1, 2 o 3). Omitir la clave si no se menciona.
- "transcript": transcripción literal del audio, para auditoría.

Si el audio es inaudible, ambiguo, o no menciona una pieza dental válida:
{"tooth":"","pd":[],"bop":[],"transcript":""}`;

export async function POST(req: NextRequest) {
  // Solo usuarios autenticados de este proyecto Firebase.
  let _user;
  try {
    _user = await verifyIdToken(req);
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status });
  }

  // Rate limit por usuario (frena el abuso de cuota Gemini).
  const _rl = await rateLimit(`ia:${_user.uid}`, { limit: 20, windowMs: 60_000 });
  if (!_rl.ok) return tooManyRequests(_rl.retryAfterSec);
  // Tope adicional por IP: el límite por-uid se evade creando múltiples sesiones
  // anónimas (demo). Por-IP frena la rotación que multiplicaría la cuota de Gemini.
  const _rlIp = await rateLimit(`ia-ip:${clientIp(req)}`, { limit: 40, windowMs: 60_000 });
  if (!_rlIp.ok) return tooManyRequests(_rlIp.retryAfterSec);

  /* MEMBRESÍA + SUSCRIPCIÓN + PLAN. `verifyIdToken` solo prueba que el token es
   * de una cuenta real del proyecto; como el registro por email está abierto,
   * eso lo cumple cualquier desconocido. Esto exige además ser miembro activo de
   * una clínica al día cuyo plan incluya la función, ANTES de gastar Gemini. */
  try {
    await requireFeature(_user.uid, "ia");
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 403;
    return NextResponse.json({ ok: false, error: e instanceof AuthError ? e.message : "No autorizado" }, { status });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "GEMINI_API_KEY no configurada en el servidor" },
      { status: 500 }
    );
  }

  let body: { audio?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const audio = body.audio || "";
  if (!audio) {
    return NextResponse.json({ ok: false, error: "audio requerido" }, { status: 400 });
  }
  // base64 → bytes aprox (×0.75)
  if (audio.length * 0.75 > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Audio demasiado largo (máx ~10MB)" },
      { status: 413 }
    );
  }

  // Limpiamos el sufijo de codec que agrega MediaRecorder (ej. "audio/webm;codecs=opus").
  const mime = String(body.mimeType || "audio/webm").split(";")[0].trim();

  const model = process.env.GEMINI_AUDIO_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mime, data: audio } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[PerioVoz] Gemini error:", data?.error?.message || res.status);
      return NextResponse.json(
        { ok: false, error: "El asistente de IA no está disponible en este momento. Probá de nuevo en unos minutos." },
        { status: 502 }
      );
    }

    const raw: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("") || "";

    // El modelo a veces envuelve el JSON en ```json ... ```
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed: {
      tooth?: string;
      pd?: unknown[];
      bop?: unknown[];
      mobility?: unknown;
      transcript?: string;
    };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[PerioVoz] JSON parse error. Raw:", cleaned.slice(0, 300));
      return NextResponse.json(
        { ok: false, error: "No se pudo interpretar el dictado. Intentá de nuevo." },
        { status: 422 }
      );
    }

    const tooth = String(parsed.tooth ?? "").trim();
    const pd = Array.isArray(parsed.pd) ? parsed.pd : [];
    const bop = Array.isArray(parsed.bop) ? parsed.bop : [];
    const transcript = String(parsed.transcript ?? "").slice(0, 4000);

    // Mobility: include only if present and valid (0-3).
    const mobilityRaw = parsed.mobility;
    const mobility =
      mobilityRaw !== undefined && mobilityRaw !== null && [0, 1, 2, 3].includes(Number(mobilityRaw))
        ? (Number(mobilityRaw) as 0 | 1 | 2 | 3)
        : undefined;

    return NextResponse.json({
      ok: true,
      tooth,
      pd,
      bop,
      ...(mobility !== undefined ? { mobility } : {}),
      transcript,
    });
  } catch (e) {
    console.error("[PerioVoz] error:", e);
    return NextResponse.json(
      { ok: false, error: "El asistente de IA no está disponible en este momento. Probá de nuevo en unos minutos." },
      { status: 502 }
    );
  }
}
