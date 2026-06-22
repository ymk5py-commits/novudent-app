/** Encuestas públicas: GET la definición (para renderizar) + POST una respuesta.
 *  La respuesta se escribe con el usuario de servicio (el paciente no tiene sesión),
 *  mismo patrón que /api/reservas. */
import { NextResponse } from "next/server";
import { getDocument, setDocument, isServerFirestoreConfigured } from "@/lib/server/firestore-rest";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cid = searchParams.get("cid");
  const surveyId = searchParams.get("surveyId");
  if (!cid || !surveyId) return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 });
  const rl = rateLimit(`encuestas-get:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  if (!isServerFirestoreConfigured()) return NextResponse.json({ error: "Servidor no configurado." }, { status: 503 });
  try {
    const survey = await getDocument(`clinics/${cid}/surveys/${surveyId}`);
    if (!survey) return NextResponse.json({ error: "Encuesta no encontrada." }, { status: 404 });
    const clinic = await getDocument(`clinics/${cid}`);
    return NextResponse.json({ survey, clinicName: clinic?.name ?? "" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const rl = rateLimit(`encuestas-post:${clientIp(req)}`, { limit: 6, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  if (!isServerFirestoreConfigured()) return NextResponse.json({ error: "Servidor no configurado." }, { status: 503 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const { cid, surveyId, patientName, answers, npsScore, comment } = body ?? {};
  if (!cid || !surveyId) return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 });
  try {
    const survey = await getDocument(`clinics/${cid}/surveys/${surveyId}`);
    if (!survey || survey.active === false) return NextResponse.json({ error: "Encuesta no disponible." }, { status: 404 });
    const rid = `sr_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const docData: Record<string, unknown> = {
      id: rid,
      clinicId: cid,
      surveyId,
      patientName: typeof patientName === "string" && patientName.trim() ? patientName.trim().slice(0, 120) : undefined,
      answers: Array.isArray(answers) ? answers.slice(0, 50) : [],
      npsScore: typeof npsScore === "number" ? Math.max(0, Math.min(10, Math.round(npsScore))) : undefined,
      comment: typeof comment === "string" && comment.trim() ? comment.trim().slice(0, 1000) : undefined,
      createdAt: new Date().toISOString(),
    };
    await setDocument(`clinics/${cid}/surveyResponses/${rid}`, docData);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
