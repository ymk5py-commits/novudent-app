import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { requireMiembro } from "@/lib/server/require-feature";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";
import { getDocument, isServerFirestoreConfigured, patchFields } from "@/lib/server/firestore-rest";
import { isValidId, isValidToken } from "@/lib/server/ids";
import { linkConfirmacion as linkConfirmacionDe, puedeResponder } from "@/lib/confirmacionCita";
import { newSignToken } from "@/lib/firma";
import { SITE_URL } from "@/lib/site";
import { can, normalizarPermisos } from "@/lib/rbac";
import { correoCita, type TipoCorreoCita } from "@/lib/correoCita";
import type { AppointmentStatus, Role } from "@/lib/types";

/**
 * Aviso al paciente por correo sobre su cita (agenda: «Enviar al correo» y «Notificar
 * por mail»). Manda por Resend (https://resend.com/docs/api-reference/emails/send-email).
 *
 * POST { appointmentId, tipo: "confirmacion" | "estado" } → { ok }
 *
 * El correo se arma acá con los datos guardados de la cita, del paciente y de la
 * clínica; el navegador solo dice QUÉ cita y QUÉ aviso. Así la ruta no sirve para
 * mandar texto arbitrario en nombre de la clínica.
 *
 * Env: RESEND_API_KEY y EMAIL_FROM («Clínica <avisos@dominio-verificado>»). Sin ellas
 * responde 503 con un mensaje claro: el resto de la agenda funciona igual.
 */

const TIPOS: TipoCorreoCita[] = ["confirmacion", "estado"];

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    uid = (await verifyIdToken(req)).uid;
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return NextResponse.json({ ok: false, error: "Sesión inválida" }, { status });
  }
  const rl = await rateLimit(`correo-cita:${uid}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  const rlIp = await rateLimit(`correo-cita-ip:${clientIp(req)}`, { limit: 60, windowMs: 60_000 });
  if (!rlIp.ok) return tooManyRequests(rlIp.retryAfterSec);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from || !isServerFirestoreConfigured()) {
    return NextResponse.json({ ok: false, error: "El envío de correos todavía no está configurado." }, { status: 503 });
  }

  let body: { appointmentId?: unknown; tipo?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }
  const appointmentId = String(body.appointmentId || "");
  const tipo = String(body.tipo || "") as TipoCorreoCita;
  if (!isValidId(appointmentId) || !TIPOS.includes(tipo)) {
    return NextResponse.json({ ok: false, error: "Parámetros inválidos" }, { status: 400 });
  }

  try {
    // Miembro activo de la clínica, y de un rol que maneje los datos del paciente (el
    // correo sale a su dirección): recepción, caja o admin.
    const yo = await requireMiembro(uid);
    const base = `clinics/${yo.clinicId}`;
    // La clínica puede darle o sacarle a cada rol el manejo de los datos del paciente (Permisos del equipo), así que se lee
    // ANTES de decidir. Sin `.catch`: si no se pudo leer, el error corta la ruta; no se cae a la matriz de fábrica, que
    // podría dejar pasar a un rol al que la clínica se lo sacó.
    const clinica = await getDocument(base);
    const permisos = normalizarPermisos((clinica?.config as { permisos?: unknown } | undefined)?.permisos);
    if (!can(yo.role as Role, "patients.personal", permisos)) {
      return NextResponse.json({ ok: false, error: "Tu rol no puede escribirle al paciente." }, { status: 403 });
    }
    const cita = await getDocument(`${base}/appointments/${appointmentId}`);
    if (!cita) return NextResponse.json({ ok: false, error: "No se encontró la cita." }, { status: 404 });
    const [paciente, profesional] = await Promise.all([
      getDocument(`${base}/patients/${String(cita.patientId || "")}`),
      cita.dentistId ? getDocument(`${base}/users/${String(cita.dentistId)}`) : Promise.resolve(null),
    ]);
    const email = String(paciente?.email || "").trim();
    if (!paciente || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "El paciente no tiene un email cargado." }, { status: 422 });
    }
    const sucursal = cita.branchId ? await getDocument(`${base}/branches/${String(cita.branchId)}`) : null;
    const config = (clinica?.config ?? {}) as { timezone?: string; email?: string };
    // Link para que el paciente confirme o anule (lib/confirmacionCita). La cita guarda su
    // token; si todavía no tiene, se genera acá y se guarda solo ese campo.
    let linkConfirmacion: string | undefined;
    if (tipo === "confirmacion" && puedeResponder({ status: String(cita.status || ""), start: String(cita.start || "") }, new Date())) {
      let token = String(cita.confirmToken || "");
      if (!isValidToken(token)) {
        token = newSignToken();
        await patchFields(`${base}/appointments/${appointmentId}`, { confirmToken: token });
      }
      linkConfirmacion = linkConfirmacionDe(SITE_URL, yo.clinicId, token, "email");
    }
    const correo = correoCita(tipo, {
      clinica: String(clinica?.name || "la clínica"),
      paciente: String(paciente.firstName || ""),
      profesional: profesional?.name ? String(profesional.name) : undefined,
      sucursal: sucursal?.name ? String(sucursal.name) : undefined,
      inicio: String(cita.start || ""),
      estado: String(cita.status || "pendiente") as AppointmentStatus,
      zonaHoraria: config.timezone,
      linkConfirmacion,
    });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: correo.asunto,
        text: correo.texto,
        html: correo.html,
        ...(config.email ? { reply_to: config.email } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error("[correo-cita] Resend", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return NextResponse.json({ ok: false, error: "El proveedor de correo no aceptó el envío. Probá de nuevo en un rato." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error("[correo-cita]", e);
    return NextResponse.json({ ok: false, error: "No se pudo enviar el correo." }, { status: 502 });
  }
}
