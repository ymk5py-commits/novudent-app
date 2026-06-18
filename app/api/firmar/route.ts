import { NextRequest, NextResponse } from "next/server";
import {
  isServerFirestoreConfigured,
  getDocument,
  listCollection,
  setDocument,
} from "@/lib/server/firestore-rest";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";
import { canSign, validateSignPayload } from "@/lib/firma";

/**
 * Firma electrónica de consentimientos — página PÚBLICA (sin login).
 *
 * GET  ?cid=<clinicId>&token=<token>
 *   → { ok, title, body, status, patientName } del doc cuyo `token` coincide.
 *     Devuelve SOLO lo necesario para mostrar el documento + "firmás como X".
 *     Token inválido / inexistente → 404 { ok:false } (no se filtra nada).
 *
 * POST { cid, token, signatureImage, signedByName }
 *   → valida el payload, ubica el doc por `token`, exige que esté "pendiente"
 *     (canSign) y lo marca "firmado" (firma + fecha + nombre + channel:"remoto").
 *
 * El token ES la credencial: no hay verifyIdToken. El navegador del paciente
 * nunca toca Firestore — el servidor se autentica con el usuario de servicio
 * (mismo mecanismo que /api/reservas, ver lib/server/firestore-rest).
 *
 * Seguridad:
 *   - NUNCA se enumeran tokens: el GET/POST sólo busca por igualdad de `token`
 *     y un fallo devuelve 404 genérico (no distingue "no existe" de "otro doc").
 *   - NUNCA se permite re-firmar: canSign() sólo admite status "pendiente".
 *   - NUNCA se exponen otros docs ni campos sensibles (sólo title/body/status +
 *     el nombre del paciente para el "firmás como X").
 */

function isValidId(s: string): boolean {
  return /^[a-zA-Z0-9_-]{2,64}$/.test(s);
}

// El token se genera con newSignToken (base64url, ~32 chars). Lo validamos con
// la misma gramática url-safe y un rango de largo holgado antes de tocar la DB.
function isValidToken(s: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(s);
}

/** Nombre visible del paciente ("firmás como X"). Nada más sensible. */
function patientDisplayName(p: Record<string, unknown> | null): string {
  if (!p) return "";
  const first = String(p.firstName || "").trim();
  const last = String(p.lastName || "").trim();
  return `${first} ${last}`.trim();
}

/**
 * Ubica en `clinics/{cid}/signatures` el doc cuyo `token` coincide.
 * Devuelve null si no hay match. No revela la existencia de otros docs.
 */
async function findByToken(cid: string, token: string) {
  const docs = await listCollection(`clinics/${cid}`, "signatures", 500);
  const row = docs.find((d) => String(d.data.token || "") === token);
  return row || null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cid = String(searchParams.get("cid") || "");
  const token = String(searchParams.get("token") || "");

  // Rate-limit por IP + token: frena el martilleo / fuerza bruta de tokens.
  const rl = rateLimit(`firmar-get:${clientIp(req)}:${token.slice(0, 24)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  if (!isServerFirestoreConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Firma electrónica no configurada (envs del servidor)" },
      { status: 500 }
    );
  }
  if (!isValidId(cid) || !isValidToken(token)) {
    // Params mal formados → mismo 404 genérico (no confirma nada al atacante).
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  try {
    const row = await findByToken(cid, token);
    if (!row) return NextResponse.json({ ok: false }, { status: 404 });

    const patientId = String(row.data.patientId || "");
    let patientName = "";
    if (patientId) {
      const patient = await getDocument(`clinics/${cid}/patients/${patientId}`);
      patientName = patientDisplayName(patient);
    }

    return NextResponse.json({
      ok: true,
      title: String(row.data.title || "Consentimiento"),
      body: String(row.data.body || ""),
      status: String(row.data.status || "pendiente"),
      patientName,
    });
  } catch (e) {
    // No filtrar detalles internos (paths de Firestore, projectId) al paciente.
    console.error("[firmar GET]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo cargar el documento. Intentá de nuevo en un momento." },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const cid = String(body.cid || "");
  const token = String(body.token || "");

  // Rate-limit más estricto en el POST (escribe): evita spam de firmas.
  const rl = rateLimit(`firmar-post:${clientIp(req)}:${token.slice(0, 24)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  if (!isServerFirestoreConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Firma electrónica no configurada (envs del servidor)" },
      { status: 500 }
    );
  }
  if (!isValidId(cid) || !isValidToken(token)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  // Saneo del payload de firma (PNG data URL + nombre) — helper puro probado.
  const payload = validateSignPayload(body);
  if (!payload.ok) {
    return NextResponse.json({ ok: false, error: payload.error }, { status: 400 });
  }

  try {
    const row = await findByToken(cid, token);
    if (!row) return NextResponse.json({ ok: false }, { status: 404 });

    // No re-firmar: sólo un doc "pendiente" puede firmarse.
    if (!canSign({ status: String(row.data.status || "") } as never)) {
      return NextResponse.json(
        { ok: false, error: "El documento ya fue firmado o no está disponible" },
        { status: 409 }
      );
    }

    // Escritura por el usuario de servicio (mismo mecanismo que reservas escribe
    // citas). Reescribimos el doc completo con los campos de firma sumados.
    await setDocument(`clinics/${cid}/signatures/${row.id}`, {
      ...row.data,
      status: "firmado",
      signatureImage: payload.signatureImage,
      signedByName: payload.signedByName,
      signedAt: new Date().toISOString(),
      channel: "remoto",
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[firmar POST]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo registrar la firma. Intentá de nuevo en un momento." },
      { status: 502 }
    );
  }
}
