import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { requireFeature } from "@/lib/server/require-feature";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";
import { esFecha } from "@/lib/tareas";
import { parsearPropuestas, promptAgendaSemana, transcripcionDe } from "@/lib/agendaIA";

/**
 * Dictar la semana — Mi agenda (Novudent IA).
 *
 * POST { texto? | audio? (base64), mimeType?, hoy }  →  { ok, tareas, transcripcion }
 *
 * Una persona del equipo dicta (o escribe) lo que tiene que hacer en la semana; Gemini lo separa en
 * tareas con día y, si corresponde, el nombre del paciente. NO guarda nada: devuelve propuestas que la
 * persona revisa en pantalla. El nombre del paciente vuelve tal como se dictó y se empareja con la ficha
 * en el navegador: ningún dato de pacientes viaja hacia acá.
 *
 * Env: GEMINI_API_KEY (Vercel → novudent-app). La key vive SOLO acá (server).
 */

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // ~10MB ≈ varios minutos de audio
const MAX_TEXTO = 4000;

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
  try {
    await requireFeature(_user.uid, "ia");
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 403;
    return NextResponse.json({ ok: false, error: e instanceof AuthError ? e.message : "No autorizado" }, { status });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "GEMINI_API_KEY no configurada en el servidor" }, { status: 500 });
  }

  let body: { texto?: unknown; audio?: unknown; mimeType?: unknown; hoy?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const hoy = body.hoy;
  if (!esFecha(hoy)) {
    return NextResponse.json({ ok: false, error: "Falta la fecha de hoy" }, { status: 400 });
  }
  const texto = typeof body.texto === "string" ? body.texto.trim() : "";
  const audio = typeof body.audio === "string" ? body.audio : "";
  if (!texto && !audio) {
    return NextResponse.json({ ok: false, error: "Dictá o escribí lo que tenés que hacer." }, { status: 400 });
  }
  if (texto.length > MAX_TEXTO) {
    return NextResponse.json({ ok: false, error: "El texto es demasiado largo. Dividilo en partes." }, { status: 413 });
  }
  // base64 → bytes aprox (x0.75)
  if (audio.length * 0.75 > MAX_AUDIO_BYTES) {
    return NextResponse.json({ ok: false, error: "Audio demasiado largo (máx ~10MB)" }, { status: 413 });
  }

  // Gemini acepta audio/ogg, mp3, wav, aac, flac, aiff. MediaRecorder del browser produce webm/ogg
  // con codecs — limpiamos el sufijo.
  const mime = String(body.mimeType || "audio/webm").split(";")[0].trim();
  const model = audio
    ? process.env.GEMINI_AUDIO_MODEL || "gemini-2.5-flash"
    : process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts: Record<string, unknown>[] = [{ text: promptAgendaSemana(hoy) }];
  if (audio) parts.push({ inline_data: { mime_type: mime, data: audio } });
  else parts.push({ text: `DICTADO:\n${texto}` });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[Agenda semana] Gemini error:", data?.error?.message || res.status);
      return NextResponse.json({ ok: false, error: "El asistente de IA no está disponible en este momento. Probá de nuevo en unos minutos." }, { status: 502 });
    }
    const raw: string =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";

    // Lo que devuelve el modelo no se confía: fechas, largos y duplicados se validan acá.
    const tareas = parsearPropuestas(raw, hoy);
    if (tareas.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No encontré tareas en lo que dijiste. Probá con algo como: «el jueves llamar a María López por su presupuesto»." },
        { status: 422 },
      );
    }
    return NextResponse.json({ ok: true, tareas, transcripcion: transcripcionDe(raw) });
  } catch (e) {
    console.error("[Agenda semana] error:", e);
    return NextResponse.json({ ok: false, error: "El asistente de IA no está disponible en este momento. Probá de nuevo en unos minutos." }, { status: 502 });
  }
}
