import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { requireFeature } from "@/lib/server/require-feature";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";
import { validateRadiografiaAI } from "@/lib/radiografia";

/**
 * Análisis IA de radiografías — Novudent IA.
 * POST { image: base64, mimeType, kind } → { ok, findings, summary, patientExplanation, aiModel }
 * La key de Gemini vive SOLO acá (server). Es apoyo, no diagnóstico.
 * Env: GEMINI_API_KEY, GEMINI_VISION_MODEL (default gemini-2.5-pro).
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const PROMPT = `Sos un asistente de lectura radiográfica para una clínica dental en Paraguay.
Te paso UNA radiografía dental (panorámica, bitewing o periapical). Detectá hallazgos
visibles (caries, pérdida ósea, lesión periapical, resto radicular, cálculo, etc.).

Respondé SOLO este JSON (sin markdown, sin texto extra):
{"findings":[{"box":{"x":0.12,"y":0.30,"w":0.08,"h":0.10},"label":"Caries oclusal","tooth":"16","severity":"moderado"}],
 "summary":"resumen técnico breve para el odontólogo",
 "patientExplanation":"explicación en lenguaje simple para el paciente, en español rioplatense, clara y sin alarmar"}

Reglas:
- "box": coordenadas NORMALIZADAS 0..1 sobre la imagen (x,y = esquina sup-izq; w,h = ancho/alto). Si no ubicás exacto, dá una caja aproximada.
- "label": nombre corto del hallazgo.
- "tooth": pieza FDI si la podés ubicar (ej "16"); omitir si no.
- "severity": uno de "observacion","leve","moderado","severo".
- No inventes hallazgos. Si la imagen no es una radiografía dental legible: {"findings":[],"summary":"","patientExplanation":""}.
- Esto es APOYO al diagnóstico, no reemplaza al profesional.`;

/** Parse JSON tolerante: directo, o extrayendo el primer bloque {...} si el modelo
 *  agregó texto/markdown. Devuelve undefined si no hay JSON parseable. */
function parseJsonLoose(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* probamos extraer el bloque */
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      /* sin suerte */
    }
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  let _user;
  try {
    _user = await verifyIdToken(req);
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status });
  }

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
    await requireFeature(_user.uid, "radiografia_ia");
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 403;
    return NextResponse.json({ ok: false, error: e instanceof AuthError ? e.message : "No autorizado" }, { status });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "GEMINI_API_KEY no configurada en el servidor" }, { status: 500 });
  }

  let body: { image?: string; mimeType?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const image = body.image || "";
  if (!image) return NextResponse.json({ ok: false, error: "image requerida" }, { status: 400 });
  // Acepta data URL (data:image/...;base64,XXXX) o base64 pelado.
  const b64 = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;
  if (b64.length * 0.75 > MAX_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, error: "Imagen demasiado grande (máx ~8MB)" }, { status: 413 });
  }
  const mime = String(body.mimeType || "image/jpeg").split(";")[0].trim();

  const model = process.env.GEMINI_VISION_MODEL || "gemini-2.5-pro";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
        // responseMimeType fuerza JSON válido (sin markdown ni prosa) → evita los 422.
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[Radiografia] Gemini error:", data?.error?.message || res.status);
      return NextResponse.json({ ok: false, error: "El asistente de IA no está disponible. Probá de nuevo en unos minutos." }, { status: 502 });
    }
    const raw: string =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
    // Respuesta vacía (p.ej. bloqueo de seguridad o truncado) → mensaje claro.
    if (!raw.trim()) {
      const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || "desconocido";
      console.error("[Radiografia] respuesta vacía. finishReason:", reason);
      return NextResponse.json(
        { ok: false, error: "El modelo no devolvió un análisis para esta imagen. Probá con otra radiografía o de nuevo." },
        { status: 422 }
      );
    }
    const parsed = parseJsonLoose(raw);
    if (parsed === undefined) {
      console.error("[Radiografia] JSON parse error. Raw:", raw.slice(0, 400));
      return NextResponse.json({ ok: false, error: "No se pudo interpretar el análisis. Intentá de nuevo." }, { status: 422 });
    }
    const result = validateRadiografiaAI(parsed);
    return NextResponse.json({ ok: true, ...result, aiModel: model });
  } catch (e) {
    console.error("[Radiografia] error:", e);
    return NextResponse.json({ ok: false, error: "El asistente de IA no está disponible. Probá de nuevo en unos minutos." }, { status: 502 });
  }
}
