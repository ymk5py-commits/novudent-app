"use client";
/* Pide al servidor que le avise al paciente por correo sobre su cita
 * (app/api/notificaciones/cita). En la demo no se manda nada: la demo no tiene sesión
 * de Firebase ni un paciente real al otro lado. */
import { backendDeDatos } from "./backend";
import type { TipoCorreoCita } from "./correoCita";

export type ResultadoAviso = { ok: true; demo?: boolean } | { ok: false; error: string };

export async function enviarAvisoCita(clinicId: string, appointmentId: string, tipo: TipoCorreoCita): Promise<ResultadoAviso> {
  if (clinicId === "cl_demo") return { ok: true, demo: true };
  try {
    const token = await backendDeDatos.token();
    const r = await fetch("/api/notificaciones/cita", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ appointmentId, tipo }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) return { ok: false, error: data.error || `No se pudo enviar (HTTP ${r.status}).` };
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor para enviar el correo." };
  }
}
