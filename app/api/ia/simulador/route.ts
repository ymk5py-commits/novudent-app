import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { requireFeature } from "@/lib/server/require-feature";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";

/**
 * Simulador de sonrisas — Novudent IA.
 * POST { image: base64, mimeType, treatment } → { ok, image: dataUrl }
 * Usa el modelo de GENERACIÓN/edición de imagen de Gemini (env GEMINI_IMAGE_MODEL,
 * default gemini-2.5-flash-image). La key vive solo acá (server). Es una PROYECCIÓN
 * estética estimada, no un resultado garantizado.
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const TREATMENT_PROMPT: Record<string, string> = {
  blanqueamiento: "blanqueamiento dental: dientes notablemente más blancos y brillantes, manteniendo una tonalidad natural y creíble.",
  carillas: "carillas / estética dental: dientes parejos, bien alineados, con forma y color armónicos y naturales.",
  ortodoncia: "resultado de ortodoncia: dientes bien alineados y nivelados, mordida corregida, sonrisa armónica.",
  cierre_espacios: "cierre de espacios / implante: completar dientes faltantes y cerrar diastemas con dientes de aspecto natural.",
};

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await verifyIdToken(req);
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status });
  }

  const rl = await rateLimit(`ia:${user.uid}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  // Tope adicional por IP: el límite por-uid se evade creando múltiples sesiones
  // anónimas (demo). Por-IP frena la rotación que multiplicaría la cuota de Gemini.
  const _rlIp = await rateLimit(`ia-ip:${clientIp(req)}`, { limit: 40, windowMs: 60_000 });
  if (!_rlIp.ok) return tooManyRequests(_rlIp.retryAfterSec);

  /* MEMBRESÍA + SUSCRIPCIÓN + PLAN. `verifyIdToken` solo prueba que el token es
   * de una cuenta real del proyecto; como el registro por email está abierto,
   * eso lo cumple cualquier desconocido. Esto exige además ser miembro activo de
   * una clínica al día cuyo plan incluya la función, ANTES de gastar Gemini. */
  try {
    await requireFeature(user.uid, "ia");
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 403;
    return NextResponse.json({ ok: false, error: e instanceof AuthError ? e.message : "No autorizado" }, { status });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "GEMINI_API_KEY no configurada en el servidor" }, { status: 500 });

  let body: { image?: string; mimeType?: string; treatment?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }

  const image = body.image || "";
  if (!image) return NextResponse.json({ ok: false, error: "image requerida" }, { status: 400 });
  const b64 = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;
  if (b64.length * 0.75 > MAX_IMAGE_BYTES) return NextResponse.json({ ok: false, error: "Imagen demasiado grande (máx ~8MB)" }, { status: 413 });
  const mime = String(body.mimeType || "image/jpeg").split(";")[0].trim();
  const treatment = String(body.treatment || "carillas");

  const prompt = `Editá esta foto del rostro de un paciente para SIMULAR de forma realista el resultado estético de un tratamiento dental. Tratamiento: ${TREATMENT_PROMPT[treatment] ?? treatment}. Reglas estrictas: mantené EXACTAMENTE la misma persona, identidad, ángulo, encuadre, iluminación, tono de piel, ojos, labios, cabello y fondo; modificá ÚNICAMENTE los dientes y la sonrisa de forma natural y creíble; no agregues texto, logos ni marcas de agua. Devolvé solo la imagen editada.`;

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      const msg = (data as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`;
      console.error("[Simulador] Gemini error:", msg);
      return NextResponse.json({ ok: false, error: "El simulador de IA no está disponible. Verificá GEMINI_IMAGE_MODEL o probá de nuevo." }, { status: 502 });
    }
    const parts: { text?: string; inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string; mime_type?: string } }[] =
      (data as any)?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
    const inl = imgPart?.inlineData ?? imgPart?.inline_data;
    if (!inl?.data) {
      const txt = parts.map((p) => p.text || "").join(" ").trim();
      console.error("[Simulador] sin imagen. Texto:", txt.slice(0, 200));
      return NextResponse.json({ ok: false, error: txt || "El modelo no devolvió una imagen. Probá con otra foto." }, { status: 422 });
    }
    const outMime = (inl as { mimeType?: string; mime_type?: string }).mimeType || (inl as { mime_type?: string }).mime_type || "image/png";
    return NextResponse.json({ ok: true, image: `data:${outMime};base64,${inl.data}`, aiModel: model });
  } catch (e) {
    console.error("[Simulador] error:", e);
    return NextResponse.json({ ok: false, error: "El simulador de IA no está disponible. Probá de nuevo en unos minutos." }, { status: 502 });
  }
}
