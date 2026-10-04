import type { AppointmentStatus } from "./types";

/* Link de confirmación de cita (paridad Dentalink: «Confirmación de cita» con Confirmar /
 * Anular). El paciente lo recibe por WhatsApp o por correo, lo abre sin login y responde.
 * El token del link ES la credencial; la página pública habla solo con /api/citas/confirmar,
 * que escribe con el usuario de servicio. Acá vive la lógica pura de esa respuesta. */

export type AccionConfirmacion = "confirmar" | "anular";
export type CanalConfirmacion = "whatsapp" | "email";

/** Mismo formato que newSignToken (base64url de 24 bytes); holgado en el largo. */
export const esTokenValido = (t: string): boolean => /^[A-Za-z0-9_-]{16,128}$/.test(t);

/** `?v=wa` marca que el link salió por WhatsApp; cualquier otra cosa, por correo. */
export const canalDe = (v: string | null | undefined): CanalConfirmacion => (v === "wa" ? "whatsapp" : "email");

/** Link público de confirmación. `origin` sin barra final. */
export function linkConfirmacion(origin: string, cid: string, token: string, canal: CanalConfirmacion): string {
  return `${origin.replace(/\/+$/, "")}/confirmar/${encodeURIComponent(cid)}/${encodeURIComponent(token)}?v=${canal === "whatsapp" ? "wa" : "mail"}`;
}

type CitaMin = { status: AppointmentStatus | string; start: string };

/** El paciente puede responder si la cita sigue en pie (no anulada, no atendida) y no pasó. */
export function puedeResponder(c: CitaMin, ahora: Date): boolean {
  const vigente = c.status === "pendiente" || c.status === "confirmada";
  const t = Date.parse(c.start);
  return vigente && Number.isFinite(t) && t > ahora.getTime();
}

export type Respuesta =
  | { ok: true; cambios: Record<string, unknown> | null; resultado: "confirmada" | "anulada" }
  | { ok: false; error: string; status: number };

/** Qué cambia en la cita según lo que respondió el paciente. `cambios: null` = no hay nada
 *  que escribir (confirmar algo ya confirmado). Una cita pasada, anulada o atendida no
 *  admite respuesta. */
export function respuestaCita(c: CitaMin, accion: AccionConfirmacion, canal: CanalConfirmacion, ahora: Date): Respuesta {
  if (c.status === "cancelada") return { ok: false, error: "Esta cita ya está anulada.", status: 409 };
  if (!puedeResponder(c, ahora)) return { ok: false, error: "Esta cita ya no se puede confirmar ni anular desde el link. Comunicate con la clínica.", status: 409 };
  const at = ahora.toISOString();
  if (accion === "confirmar") {
    if (c.status === "confirmada") return { ok: true, cambios: null, resultado: "confirmada" };
    return {
      ok: true,
      resultado: "confirmada",
      cambios: { status: "confirmada", estadoId: canal === "whatsapp" ? "confirmado_whatsapp" : "confirmado_email", confirmedVia: "link", respondidaAt: at },
    };
  }
  return {
    ok: true,
    resultado: "anulada",
    cambios: { status: "cancelada", estadoId: "anulado_paciente", cancelReason: "Anulada por el paciente desde el link de confirmación", respondidaAt: at },
  };
}

/** Suma el link al mensaje de recordatorio: en `{link}` si la plantilla lo tiene, si no al final. */
export function conLink(mensaje: string, link: string): string {
  if (mensaje.includes("{link}")) return mensaje.replaceAll("{link}", link);
  return `${mensaje.trimEnd()}\n\nConfirmá o anulá tu cita acá: ${link}`;
}
