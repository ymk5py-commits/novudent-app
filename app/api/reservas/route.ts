import { NextRequest, NextResponse } from "next/server";
import {
  isServerFirestoreConfigured,
  getDocument,
  listCollection,
  setDocument,
  createIfAbsent,
} from "@/lib/server/firestore-rest";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";
import { ahoraEnZona, slotAlcanzaAnticipacion, anticipacionDe } from "@/lib/reserva-online";

/**
 * Agendamiento online — Fase 3 Novudent.
 *
 * GET  ?clinicId=cl_demo&date=2026-06-15
 *   → { ok, clinic: {name}, dentists: [{id,name}], slots: {dentistId: ["08:00",...]} }
 *
 * POST { clinicId, dentistId, date, time, nombre, apellido, ci, telefono, motivo? }
 *   → crea paciente (si el CI no existe) + cita "pendiente" con
 *     fuente online + (si Botika está conectado con confirmCita ON)
 *     encola la tarea de confirmación por WhatsApp en el outbox.
 *
 * Página pública (sin login): los datos pasan por estas rutas — el
 * navegador del paciente nunca toca Firestore. El servidor se
 * autentica con el usuario de servicio (ver lib/server/firestore-rest).
 */

const SLOT_MIN = 30;
const DAY_START = 8; // 08:00
const DAY_END = 18; // 18:00 (último slot 17:30)
const BOOKING_DAYS_AHEAD = 30;

function gridSlots(): string[] {
  const out: string[] = [];
  for (let h = DAY_START; h < DAY_END; h++) {
    for (let m = 0; m < 60; m += SLOT_MIN) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

function isValidId(s: string): boolean {
  return /^[a-zA-Z0-9_-]{2,64}$/.test(s);
}

/** Suma días a un YYYY-MM-DD y devuelve otro YYYY-MM-DD. Se opera en UTC puro
 *  para que el horario de verano no corra la cuenta un día. */
function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const rl = await rateLimit(`reservas-get:${clientIp(req)}`, { limit: 40, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  if (!isServerFirestoreConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Reservas online no configuradas (envs del servidor)" },
      { status: 500 }
    );
  }
  const { searchParams } = new URL(req.url);
  const clinicId = String(searchParams.get("clinicId") || "");
  const date = String(searchParams.get("date") || ""); // YYYY-MM-DD
  if (!isValidId(clinicId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "Parámetros inválidos" }, { status: 400 });
  }

  const day = new Date(`${date}T00:00:00`);
  // Domingo cerrado. Se evalúa sobre el string de fecha (medianoche local del
  // proceso), así que no depende de la hora y es estable.
  if (day.getDay() === 0) {
    return NextResponse.json({ ok: true, clinic: null, dentists: [], slots: {}, closed: true });
  }

  try {
    const clinic = await getDocument(`clinics/${clinicId}`);
    if (!clinic) {
      return NextResponse.json({ ok: false, error: "Clínica no encontrada" }, { status: 404 });
    }

    // El rango de fechas y la anticipación se miden en la zona de la CLÍNICA, no
    // en la del servidor: esto corre en Vercel (UTC) y las clínicas están en
    // UTC-3, así que con la hora del proceso, de 21:00 a medianoche hora local
    // "hoy" ya era el día siguiente y se perdía una noche de reservas.
    const tz = String((clinic.config as Record<string, unknown> | undefined)?.timezone || "UTC");
    const minLead = anticipacionDe(clinic.config as { onlineBooking?: { minLeadHoras?: number } } | undefined);
    const hoyLocal = ahoraEnZona(Date.now(), tz).fecha;
    const maxLocal = sumarDias(hoyLocal, BOOKING_DAYS_AHEAD);
    if (date < hoyLocal || date > maxLocal) {
      return NextResponse.json({ ok: false, error: "Fecha fuera del rango de reserva" }, { status: 400 });
    }
    const users = await listCollection(`clinics/${clinicId}`, "users");
    const dentists = users
      .filter((u) => u.data.role === "dentist" && u.data.active !== false)
      .map((u) => ({ id: u.id, name: String(u.data.name || "Profesional") }));

    const appts = await listCollection(`clinics/${clinicId}`, "appointments", 500);
    const busy: Record<string, Set<string>> = {};
    for (const a of appts) {
      const start = String(a.data.start || "");
      if (!start.startsWith(date)) continue;
      if (a.data.status === "cancelada") continue;
      const dId = String(a.data.dentistId || "");
      if (!busy[dId]) busy[dId] = new Set();
      busy[dId].add(start.slice(11, 16));
    }

    // Se filtra por anticipación ANTES de responder: el paciente no debería ver
    // un turno que después el POST le va a rechazar.
    const ahora = Date.now();
    const grid = gridSlots().filter((t) => slotAlcanzaAnticipacion(date, t, ahora, tz, minLead));
    const slots: Record<string, string[]> = {};
    for (const d of dentists) {
      slots[d.id] = grid.filter((t) => !busy[d.id]?.has(t));
    }

    return NextResponse.json({
      ok: true,
      clinic: { name: String(clinic.name || "Clínica") },
      dentists,
      slots,
      minLeadHoras: minLead,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  // Reserva real: límite más estricto (evita spam de citas / enumeración de CIs).
  const rl = await rateLimit(`reservas-post:${clientIp(req)}`, { limit: 8, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  if (!isServerFirestoreConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Reservas online no configuradas (envs del servidor)" },
      { status: 500 }
    );
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const clinicId = String(body.clinicId || "");
  const dentistId = String(body.dentistId || "");
  const date = String(body.date || "");
  const time = String(body.time || "");
  // Quitamos `<`/`>` y caracteres de control: estos campos quedan en el padrón y
  // luego pueden ir a HTML de email / mensajes → cortamos la inyección en el origen.
  const clean = (v: unknown, max: number) => String(v || "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max);
  const nombre = clean(body.nombre, 60);
  const apellido = clean(body.apellido, 60);
  const ci = String(body.ci || "").replace(/[^\d]/g, "").slice(0, 15);
  const telefono = String(body.telefono || "").replace(/[^\d+ ]/g, "").trim().slice(0, 25);
  const motivo = clean(body.motivo, 140);

  if (!isValidId(clinicId) || !isValidId(dentistId)) {
    return NextResponse.json({ ok: false, error: "Parámetros inválidos" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ ok: false, error: "Fecha u hora inválida" }, { status: 400 });
  }
  if (!nombre || !apellido || ci.length < 5 || telefono.length < 6) {
    return NextResponse.json(
      { ok: false, error: "Completá nombre, apellido, CI y teléfono válidos" },
      { status: 400 }
    );
  }
  const startISO = `${date}T${time}:00`;
  // Instante de la cita en la hora local del proceso. Solo se usa para derivar
  // el fin del turno y para el texto del recordatorio; el control de rango y de
  // anticipación va aparte, en la zona horaria de la clínica.
  const day = new Date(startISO);
  // Domingo cerrado (no depende de la hora, sale del string de fecha).
  if (new Date(`${date}T00:00:00`).getDay() === 0) {
    return NextResponse.json({ ok: false, error: "Horario no disponible" }, { status: 400 });
  }

  try {
    const clinic = await getDocument(`clinics/${clinicId}`);
    if (!clinic) {
      return NextResponse.json({ ok: false, error: "Clínica no encontrada" }, { status: 404 });
    }

    // El chequeo de anticipación se repite acá y no se confía en el del GET: el
    // POST es la frontera real. Un cliente puede saltearse la UI y postear un
    // turno para dentro de cinco minutos, y sin esto entraría.
    const tz = String((clinic.config as Record<string, unknown> | undefined)?.timezone || "UTC");
    const minLead = anticipacionDe(clinic.config as { onlineBooking?: { minLeadHoras?: number } } | undefined);
    const hoyLocal = ahoraEnZona(Date.now(), tz).fecha;
    const maxLocal = sumarDias(hoyLocal, BOOKING_DAYS_AHEAD);
    if (date < hoyLocal || date > maxLocal || !slotAlcanzaAnticipacion(date, time, Date.now(), tz, minLead)) {
      return NextResponse.json({ ok: false, error: "Horario no disponible" }, { status: 400 });
    }

    // Lock de slot para serializar reservas concurrentes del mismo horario.
    // Es un guard de corta vida (TTL): solo evita la carrera entre dos POST
    // simultáneos. La disponibilidad REAL la define la colección de citas (el
    // pre-chequeo de abajo), así que un lock viejo (de una reserva anterior o
    // de una cita ya cancelada) se considera obsoleto y se puede retomar — así
    // un slot liberado por cancelación vuelve a estar disponible.
    const SLOT_LOCK_TTL_MS = 60_000;
    const slotId = `${dentistId}_${date}_${time}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    const lockPath = `clinics/${clinicId}/slotLocks/${slotId}`;
    const lockData = { dentistId, date, time, at: new Date().toISOString() };
    let locked = await createIfAbsent(lockPath, lockData);
    if (!locked) {
      const existing = await getDocument(lockPath);
      const at = existing?.at ? Date.parse(String(existing.at)) : 0;
      if (!at || Date.now() - at > SLOT_LOCK_TTL_MS) {
        await setDocument(lockPath, lockData); // lock obsoleto → lo retomamos
        locked = true;
      }
    }
    if (!locked) {
      return NextResponse.json(
        { ok: false, error: "Ese horario se acaba de ocupar. Elegí otro." },
        { status: 409 }
      );
    }

    // Pre-chequeo de citas existentes (fuente de verdad de disponibilidad:
    // cubre slots ocupados por la agenda interna, no solo por reservas online).
    const appts = await listCollection(`clinics/${clinicId}`, "appointments", 500);
    const taken = appts.some(
      (a) =>
        String(a.data.dentistId) === dentistId &&
        String(a.data.start || "").startsWith(`${date}T${time}`) &&
        a.data.status !== "cancelada"
    );
    if (taken) {
      return NextResponse.json(
        { ok: false, error: "Ese horario se acaba de ocupar. Elegí otro." },
        { status: 409 }
      );
    }

    // Paciente por CI — reusar si existe, crear si no.
    const patients = await listCollection(`clinics/${clinicId}`, "patients", 500);
    let patientId = patients.find((p) => String(p.data.document || "") === ci)?.id || null;
    if (!patientId) {
      patientId = `p_${Date.now()}`;
      await setDocument(`clinics/${clinicId}/patients/${patientId}`, {
        id: patientId,
        clinicId,
        firstName: nombre,
        lastName: apellido,
        document: ci,
        phone: telefono,
        forms: [],
        emr: [],
        historyUpdatePending: false,
      });
    }

    // La cita entra "pendiente": la clínica (o Botika) la confirma.
    const end = new Date(day.getTime() + SLOT_MIN * 60 * 1000);
    const endISO = `${date}T${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}:00`;
    const apptId = `a_${Date.now()}`;
    await setDocument(`clinics/${clinicId}/appointments/${apptId}`, {
      id: apptId,
      clinicId,
      patientId,
      dentistId,
      title: motivo || "Reserva online",
      start: startISO,
      end: endISO,
      status: "pendiente",
      source: "online",
      amount: 0,
      discount: 0,
      notes: "Reservado online por el paciente",
    });

    // Botika: confirmación automática por WhatsApp si está activa.
    const botika = (clinic.config as Record<string, unknown> | undefined)?.botika as
      | { connected?: boolean; automations?: { confirmCita?: boolean }; templates?: Record<string, string> }
      | undefined;
    let botikaQueued = false;
    if (botika?.connected && botika?.automations?.confirmCita) {
      const fecha = day.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" });
      const template =
        botika.templates?.confirmCita ||
        "Hola {paciente} 👋 Recibimos tu reserva «{titulo}» en {clinica} el {fecha} a las {hora}. ¿Confirmás tu asistencia?";
      const message = template
        .replaceAll("{paciente}", nombre)
        .replaceAll("{clinica}", String(clinic.name || "la clínica"))
        .replaceAll("{fecha}", fecha)
        .replaceAll("{hora}", time)
        .replaceAll("{titulo}", motivo || "Reserva online")
        .replaceAll("{saldo}", "");
      const taskId = `t_${Date.now()}`;
      await setDocument(`clinics/${clinicId}/outbox/${taskId}`, {
        id: taskId,
        clinicId,
        type: "confirmar_cita",
        patientId,
        phone: telefono,
        message,
        refId: apptId,
        status: "pendiente",
        createdAt: new Date().toISOString(),
        createdBy: "Reserva online",
      });
      botikaQueued = true;
    }

    return NextResponse.json({ ok: true, appointmentId: apptId, botikaQueued });
  } catch (e) {
    // No filtrar detalles internos (paths de Firestore, projectId) al paciente.
    console.error("[reservas POST]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo completar la reserva. Intentá de nuevo en un momento." },
      { status: 502 }
    );
  }
}
