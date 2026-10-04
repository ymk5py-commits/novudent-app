import { NextRequest, NextResponse } from "next/server";
import { getDocument, isServerFirestoreConfigured, patchFields, queryWhere } from "@/lib/server/firestore-rest";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";
import { isValidId, isValidToken } from "@/lib/server/ids";
import { canalDe, puedeResponder, respuestaCita, type AccionConfirmacion } from "@/lib/confirmacionCita";

/**
 * Confirmación de cita por link — página PÚBLICA (sin login), paridad con la
 * «Confirmación de cita» de Dentalink.
 *
 * GET  ?cid=<clinicId>&token=<token>
 *   → { ok, clinica, telefono, profesional, sucursal, inicio, fin, paciente, estado, puedeResponder }
 *     Solo lo necesario para que el paciente reconozca SU cita: el nombre de pila, nada
 *     de documento ni teléfono del paciente.
 *
 * POST { cid, token, accion: "confirmar" | "anular", v?: "wa" | "mail" }
 *   → aplica la respuesta (lib/confirmacionCita) y escribe SOLO los campos que cambian.
 *
 * Seguridad (mismo esquema que /api/firmar):
 *   - El token ES la credencial; se busca por igualdad en Firestore, nunca se enumera.
 *   - Un fallo de validación o un token que no existe devuelven el mismo 404 genérico.
 *   - Rate limit por IP + token. Escribe el usuario de servicio (lib/server/firestore-rest).
 */

async function findByToken(cid: string, token: string) {
  const rows = await queryWhere(`clinics/${cid}`, "appointments", "confirmToken", token, 2);
  return rows[0] || null;
}

const noConfigurado = () => NextResponse.json({ ok: false, error: "La confirmación de citas no está configurada." }, { status: 500 });
const noEncontrado = () => NextResponse.json({ ok: false }, { status: 404 });

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cid = String(searchParams.get("cid") || "");
  const token = String(searchParams.get("token") || "");

  const rl = await rateLimit(`confirmar-get:${clientIp(req)}:${token.slice(0, 24)}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  if (!isServerFirestoreConfigured()) return noConfigurado();
  if (!isValidId(cid) || !isValidToken(token)) return noEncontrado();

  try {
    const row = await findByToken(cid, token);
    if (!row) return noEncontrado();
    const c = row.data;
    const base = `clinics/${cid}`;
    const [clinica, paciente, profesional, sucursal] = await Promise.all([
      getDocument(base),
      c.patientId ? getDocument(`${base}/patients/${String(c.patientId)}`) : Promise.resolve(null),
      c.dentistId ? getDocument(`${base}/users/${String(c.dentistId)}`) : Promise.resolve(null),
      c.branchId ? getDocument(`${base}/branches/${String(c.branchId)}`) : Promise.resolve(null),
    ]);
    const config = (clinica?.config ?? {}) as { phone?: string; timezone?: string };
    return NextResponse.json({
      ok: true,
      clinica: String(clinica?.name || "la clínica"),
      telefono: config.phone ? String(config.phone) : "",
      zonaHoraria: config.timezone || "America/Asuncion",
      profesional: profesional?.name ? String(profesional.name) : "",
      sucursal: sucursal?.name ? String(sucursal.name) : "",
      inicio: String(c.start || ""),
      fin: String(c.end || ""),
      paciente: String(paciente?.firstName || "").trim(),
      estado: String(c.status || "pendiente"),
      puedeResponder: puedeResponder({ status: String(c.status || ""), start: String(c.start || "") }, new Date()),
    });
  } catch (e) {
    console.error("[confirmar GET]", e);
    return NextResponse.json({ ok: false, error: "No se pudo cargar la cita. Intentá de nuevo en un momento." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }
  const cid = String(body.cid || "");
  const token = String(body.token || "");
  const accion = String(body.accion || "") as AccionConfirmacion;

  const rl = await rateLimit(`confirmar-post:${clientIp(req)}:${token.slice(0, 24)}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  if (!isServerFirestoreConfigured()) return noConfigurado();
  if (!isValidId(cid) || !isValidToken(token)) return noEncontrado();
  if (accion !== "confirmar" && accion !== "anular") return NextResponse.json({ ok: false, error: "Acción inválida" }, { status: 400 });

  try {
    const row = await findByToken(cid, token);
    if (!row) return noEncontrado();
    const r = respuestaCita({ status: String(row.data.status || ""), start: String(row.data.start || "") }, accion, canalDe(String(body.v || "")), new Date());
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    if (r.cambios) await patchFields(`clinics/${cid}/appointments/${row.id}`, r.cambios);
    return NextResponse.json({ ok: true, resultado: r.resultado });
  } catch (e) {
    console.error("[confirmar POST]", e);
    return NextResponse.json({ ok: false, error: "No se pudo registrar tu respuesta. Intentá de nuevo en un momento." }, { status: 502 });
  }
}
