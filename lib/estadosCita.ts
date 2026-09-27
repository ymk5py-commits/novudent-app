import type { AppointmentStatus } from "./types";

/* Estados de la cita: un solo lugar para el orden, los nombres y los colores que usan la
 * agenda, el badge de estado, el historial y los análisis. Nombres y orden de la revisión
 * de Novum (27/9/2026): la recepción los va cambiando a medida que avanza el paciente. */

/** Orden en que se listan (menú de estado, filtros de la agenda). */
export const ESTADOS_CITA: AppointmentStatus[] = ["pendiente", "confirmada", "completada", "en_atencion", "en_sala", "ausente", "cancelada"];

export const ESTADO_LABEL: Record<AppointmentStatus, string> = {
  pendiente: "No confirmado",
  confirmada: "Confirmado",
  completada: "Atendido",
  en_atencion: "Atendiéndose",
  en_sala: "En sala de espera",
  ausente: "No asiste",
  cancelada: "Anulado",
};

export const ESTADO_TONO: Record<AppointmentStatus, "ok" | "warn" | "err" | "info" | "muted"> = {
  pendiente: "warn",
  confirmada: "ok",
  completada: "info",
  en_atencion: "info",
  en_sala: "info",
  ausente: "warn",
  cancelada: "err",
};

/** Color del punto/barra de cada estado en la agenda. */
export const ESTADO_COLOR: Record<AppointmentStatus, string> = {
  pendiente: "#94A3B8",
  confirmada: "#0E9F6E",
  completada: "#2E83F5",
  en_atencion: "#04A9F2",
  en_sala: "#7C3AED",
  ausente: "#F59E0B",
  cancelada: "#E24B4A",
};
