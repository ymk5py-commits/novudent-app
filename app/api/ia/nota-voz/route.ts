import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { requireFeature } from "@/lib/server/require-feature";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";

/**
 * Notas clínicas por voz — Novudent IA.
 *
 * POST { audio: base64, mimeType, patientName?, authorName? }
 *  →  { ok, kind, text, transcript }
 *
 * El dentista dicta la evolución al terminar la consulta; Gemini
 * transcribe Y estructura en una nota clínica lista para la ficha
 * (tipo + texto profesional en tercera persona). La key de Gemini
 * vive SOLO acá (server) — nunca en el cliente.
 *
 * Env: GEMINI_API_KEY (Vercel → novudent-app). Reutilizable la misma
 * key que usa Botika.
 */

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // ~10MB ≈ varios minutos de audio

const PROMPT = `Sos un asistente clínico de una clínica dental en Paraguay.
Un profesional acaba de DICTAR por voz la evolución de una consulta.

Tu tarea:
1. Transcribí el dictado.
2. Redactalo como NOTA CLÍNICA profesional: tercera persona, concisa,
   terminología odontológica correcta, piezas en notación FDI si se
   mencionan, sin muletillas ni repeticiones del dictado.
3. Clasificá la nota en UNO de estos tipos:
   - "diagnostico"  → hallazgos, evaluación, diagnóstico
   - "tratamiento"  → procedimientos realizados HOY
   - "plan"         → próximos pasos, indicaciones, derivaciones
   - "nota"         → todo lo demás (administrativo, observaciones)

Respondé SOLO este JSON (sin markdown, sin explicación):
{"kind":"...","text":"...","transcript":"..."}

"transcript" = la transcripción literal (para auditoría).
"text" = la nota clínica redactada.
Si el audio es inaudible o vacío: {"kind":"nota","text":"","transcript":""}`;

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

  let body: { audio?: string; mimeType?: string; patientName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const audio = body.audio || "";
  if (!audio) {
    return NextResponse.json({ ok: false, error: "audio requerido" }, { status: 400 });
  }
  // base64 → bytes aprox (x0.75)
  if (audio.length * 0.75 > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Audio demasiado largo (máx ~10MB)" },
      { status: 413 }
    );
  }

  // Gemini acepta audio/ogg, mp3, wav, aac, flac, aiff. MediaRecorder
  // del browser produce webm/ogg con codecs — limpiamos el sufijo.
  const mime = String(body.mimeType || "audio/webm").split(";")[0].trim();

  const model = process.env.GEMINI_AUDIO_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contextLine = body.patientName
    ? `\nPaciente: ${String(body.patientName).slice(0, 80)}.`
    : "";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT + contextLine },
              { inline_data: { mime_type: mime, data: audio } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[Transcripción] Gemini error:", data?.error?.message || res.status);
      return NextResponse.json({ ok: false, error: "El asistente de IA no está disponible en este momento. Probá de nuevo en unos minutos." }, { status: 502 });
    }

    const raw: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("") || "";

    // El modelo a veces envuelve el JSON en ```json ... ```
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    let parsed: { kind?: string; text?: string; transcript?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: usar el texto crudo como nota simple
      parsed = { kind: "nota", text: cleaned.slice(0, 2000), transcript: "" };
    }

    const validKinds = ["diagnostico", "tratamiento", "plan", "nota"];
    const kind = validKinds.includes(parsed.kind || "") ? parsed.kind : "nota";
    const text = String(parsed.text || "").slice(0, 4000);

    if (!text) {
      return NextResponse.json(
        { ok: false, error: "No se pudo entender el dictado. Probá de nuevo más cerca del micrófono." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      kind,
      text,
      transcript: String(parsed.transcript || "").slice(0, 4000),
    });
  } catch (e) {
    console.error("[Transcripción] error:", e);
    return NextResponse.json({ ok: false, error: "El asistente de IA no está disponible en este momento. Probá de nuevo en unos minutos." }, { status: 502 });
  }
}
