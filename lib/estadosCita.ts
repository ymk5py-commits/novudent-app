import type { AppointmentStatus, EstadoCita } from "./types";

/* Estados de la cita: un solo lugar para el orden, los nombres y los colores que usan la
 * agenda, el badge de estado, el historial y los análisis. Nombres y orden de la revisión
 * de Novum (27/9/2026): la recepción los va cambiando a medida que avanza el paciente.
 *
 * Desde el 3/10/2026 la clínica puede tener estados propios (como el «Administrador de
 * estados de agenda» de Dentalink): cada uno con nombre, color y un comportamiento
 * `base` de los siete de abajo, que es lo que entiende el resto de la app. */

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

/** Los siete de fábrica, como estados configurables. Su id es el propio `status`. */
export const ESTADOS_BASE: EstadoCita[] = ESTADOS_CITA.map((base) => ({
  id: base, label: ESTADO_LABEL[base], color: ESTADO_COLOR[base], base, tipo: "reservado",
}));

/** Estados internos de fábrica (paridad Dentalink): los pone el sistema o la recepción
 *  para dejar rastro de CÓMO se confirmó o anuló. Se comportan como su `base`. */
export const ESTADOS_INTERNOS: EstadoCita[] = [
  { id: "notificado_whatsapp", label: "Notificado por WhatsApp", color: "#60A5FA", base: "pendiente", tipo: "interno" },
  { id: "confirmado_whatsapp", label: "Confirmado por WhatsApp", color: "#34D399", base: "confirmada", tipo: "interno" },
  { id: "confirmado_telefono", label: "Confirmado por teléfono", color: "#10B981", base: "confirmada", tipo: "interno" },
  { id: "notificado_email", label: "Notificado vía email", color: "#93C5FD", base: "pendiente", tipo: "interno" },
  { id: "confirmado_email", label: "Confirmado por email", color: "#6EE7B7", base: "confirmada", tipo: "interno" },
  { id: "agenda_online", label: "Agenda Online", color: "#CBD5E1", base: "pendiente", tipo: "interno" },
  { id: "anulado_paciente", label: "Anulado por el paciente", color: "#F87171", base: "cancelada", tipo: "interno" },
  { id: "anulado_clinica", label: "Anulado por la clínica", color: "#FCA5A5", base: "cancelada", tipo: "interno" },
  { id: "cambio_fecha", label: "Cambio de fecha", color: "#FDBA74", base: "cancelada", tipo: "interno" },
];

export const ESTADOS_DEFAULT: EstadoCita[] = [...ESTADOS_BASE, ...ESTADOS_INTERNOS];

const HEX = /^#[0-9a-fA-F]{6}$/;
const esBase = (b: unknown): b is AppointmentStatus => typeof b === "string" && (ESTADOS_CITA as string[]).includes(b);

/** Lista vigente de la clínica. Sin configuración, los de fábrica. Siempre incluye los siete
 *  base (una clínica no puede quedarse sin «Anulado»), sanea lo que venga mal de Firestore y
 *  deja afuera los desactivados. */
export function estadosDeClinica(config?: { estadosCita?: EstadoCita[] } | null): EstadoCita[] {
  const lista = normalizarEstados(config?.estadosCita ?? ESTADOS_DEFAULT);
  return lista.filter((e) => e.activo !== false);
}

/** Limpia una lista: ids únicos y sin espacios, etiqueta obligatoria, base válida, color hex.
 *  Los siete base que falten se agregan al final; los que estén, se fuerzan a `reservado`. */
export function normalizarEstados(lista: readonly EstadoCita[]): EstadoCita[] {
  const vistos = new Set<string>();
  const out: EstadoCita[] = [];
  for (const raw of lista) {
    if (!raw || typeof raw !== "object") continue;
    const id = String(raw.id ?? "").trim();
    const label = String(raw.label ?? "").trim();
    if (!id || !label || vistos.has(id) || !esBase(raw.base)) continue;
    vistos.add(id);
    const esDeFabrica = (ESTADOS_CITA as string[]).includes(id);
    out.push({
      id,
      label,
      color: HEX.test(String(raw.color)) ? String(raw.color) : ESTADO_COLOR[raw.base],
      base: esDeFabrica ? (id as AppointmentStatus) : raw.base,
      tipo: esDeFabrica ? "reservado" : raw.tipo === "interno" ? "interno" : "propio",
      ...(raw.activo === false && !esDeFabrica ? { activo: false } : {}),
    });
  }
  for (const base of ESTADOS_CITA) {
    if (!vistos.has(base)) out.push(ESTADOS_BASE.find((e) => e.id === base)!);
  }
  return out;
}

/** Estado de una cita: por `estadoId` si lo tiene y sigue existiendo; si no, el de fábrica
 *  de su `status`. Nunca devuelve undefined: una cita siempre se puede pintar. */
export function estadoDeCita(a: { status: AppointmentStatus; estadoId?: string }, lista: readonly EstadoCita[] = ESTADOS_DEFAULT): EstadoCita {
  if (a.estadoId) {
    const e = lista.find((x) => x.id === a.estadoId);
    if (e) return e;
  }
  return lista.find((x) => x.id === a.status) ?? ESTADOS_BASE.find((x) => x.id === a.status) ?? ESTADOS_BASE[0];
}

/** Un estado «anula» cuando libera el cupo de la agenda (Dentalink: columna «Anulación»). */
export const anulaCupo = (e: Pick<EstadoCita, "base">): boolean => e.base === "cancelada";

/** Id corto para un estado propio nuevo, a partir del nombre y sin chocar con los existentes. */
export function idParaEstado(label: string, existentes: readonly EstadoCita[]): string {
  const slug = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "estado";
  const ids = new Set(existentes.map((e) => e.id));
  if (!ids.has(slug)) return slug;
  let n = 2;
  while (ids.has(`${slug}_${n}`)) n++;
  return `${slug}_${n}`;
}
