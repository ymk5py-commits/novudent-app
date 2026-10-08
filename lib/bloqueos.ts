/* «Bloquear espacio» de la agenda (pedido de Camila, 8-oct-2026, como Dentalink): almuerzo, reunión, capacitación, vacaciones, feriado.
 * Un espacio bloqueado no se puede reservar: ni desde «Dar cita» (con o sin «Sobreagendar», ver `huecosDelDia` de lib/disponibilidad.ts) ni
 * desde la reserva online (app/api/reservas, con `turnosBloqueados` de lib/reserva-online.ts). Un bloqueo es de un solo día; «Repetir» crea
 * uno por ocurrencia, todos con el mismo `serieId`, y se quitan de a uno o toda la serie. Las citas que ya estaban en ese horario quedan
 * como están (`citasQuePisan` solo sirve para avisarlo). Módulo puro: tests en lib/bloqueos.test.ts. */
import type { AgendaBlock } from "./types";
import { esFecha, sumarDias } from "./tareas";

/** `dentistId` de un bloqueo de «Todos los profesionales». */
export const TODOS_LOS_PROFESIONALES = "*";

export const MOTIVOS_SUGERIDOS = ["Almuerzo", "Reunión", "Capacitación", "Vacaciones", "Feriado"] as const;

export type Repetir = "no" | "habiles" | "semanal";
export const OPCIONES_REPETIR: { valor: Repetir; label: string }[] = [
  { valor: "no", label: "No se repite" },
  { valor: "habiles", label: "Todos los días hábiles (lunes a sábado)" },
  { valor: "semanal", label: "Todas las semanas" },
];

/** Largo máximo del motivo (se ve en la grilla y en la Diaria). */
export const MAX_LARGO_MOTIVO = 80;
/** Paso de «Desde» y «Hasta», en minutos. */
export const PASO_BLOQUEO_MIN = 15;
/** «Hasta 24:00» = hasta el fin del día (el bloqueo sigue siendo de un solo día). */
export const FIN_DEL_DIA = "24:00";

/** Lo que se carga en el modal «Bloquear espacio». */
export interface FormBloqueo {
  /** Un profesional o `"*"`. */
  dentistId: string;
  boxId?: string;
  /** AAAA-MM-DD. */
  fecha: string;
  /** "HH:MM", de a 15 minutos. `hasta` puede ser «24:00». */
  desde: string;
  hasta: string;
  motivo?: string;
  repetir: Repetir;
  /** AAAA-MM-DD, con `repetir` distinto de «no». */
  repetirHasta?: string;
}

/** ¿El bloqueo aplica a una cita de ese profesional en ese box? Tienen que coincidir el profesional (o ser «Todos») y el box (o no tener
 *  box). Sin box elegido (una clínica sin boxes, la reserva online) un bloqueo de un box puntual no aplica: ese box no se está usando. */
export function bloqueoAplica(b: { dentistId: string; boxId?: string }, a: { dentistId: string; boxId?: string }): boolean {
  return (b.dentistId === TODOS_LOS_PROFESIONALES || b.dentistId === a.dentistId) && (!b.boxId || b.boxId === a.boxId);
}

/** "HH:MM" (o «24:00») → minutos desde la medianoche; `null` si no es una hora. */
function minutosDe(hhmm: string | undefined): number | null {
  if (hhmm === FIN_DEL_DIA) return 1440;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Día de la semana (0 = domingo) de una fecha AAAA-MM-DD, sin husos de por medio. */
const diaDeLaSemana = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay();

/** La misma fecha un año después (el tope de «Repetir hasta»). */
function unAnioDespues(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Los días (AAAA-MM-DD) en que cae un bloqueo con su repetición. Nunca más de un año, aunque «Repetir hasta» diga más. */
export function expandirRepeticion(f: { fecha: string; repetir: Repetir; repetirHasta?: string }): string[] {
  if (!esFecha(f.fecha)) return [];
  if (f.repetir === "no" || !f.repetirHasta || !esFecha(f.repetirHasta)) return [f.fecha];
  const tope = [f.repetirHasta, unAnioDespues(f.fecha)].sort()[0];
  const out: string[] = [];
  const paso = f.repetir === "semanal" ? 7 : 1;
  for (let d = f.fecha; d <= tope; d = sumarDias(d, paso)) {
    if (f.repetir === "habiles" && diaDeLaSemana(d) === 0) continue;
    out.push(d);
  }
  return out;
}

/** El primer problema del formulario, o `null` si se puede guardar. */
export function errorDeBloqueo(f: FormBloqueo): string | null {
  if (!f.dentistId) return "Elegí un profesional (o «Todos los profesionales»).";
  if (!esFecha(f.fecha)) return "Elegí la fecha del bloqueo.";
  const desde = minutosDe(f.desde);
  const hasta = minutosDe(f.hasta);
  if (desde === null || desde >= 1440 || hasta === null) return "Elegí desde y hasta qué hora se bloquea.";
  if (desde % PASO_BLOQUEO_MIN !== 0 || hasta % PASO_BLOQUEO_MIN !== 0) return "Los horarios van de a 15 minutos.";
  if (hasta <= desde) return "«Hasta» tiene que ser después de «Desde».";
  if (f.repetir !== "no") {
    if (!f.repetirHasta || !esFecha(f.repetirHasta)) return "Elegí hasta cuándo se repite («Repetir hasta»).";
    if (f.repetirHasta < f.fecha) return "«Repetir hasta» no puede ser antes de la fecha del bloqueo.";
    const tope = unAnioDespues(f.fecha);
    if (f.repetirHasta > tope) {
      const [y, m, d] = tope.split("-");
      return `Se puede repetir hasta un año: elegí una fecha hasta el ${d}/${m}/${y}.`;
    }
    if (expandirRepeticion(f).length === 0) return "Entre esas fechas no hay ningún día hábil.";
  }
  return null;
}

/** Instante ISO de una fecha y hora LOCALES (las de la clínica, como `inicioDe` de lib/disponibilidad.ts). «24:00» es la medianoche siguiente. */
function instante(fecha: string, hora: string): string {
  const [y, mo, d] = fecha.split("-").map(Number);
  const min = minutosDe(hora) ?? 0;
  return new Date(y, mo - 1, d, Math.floor(min / 60), min % 60).toISOString();
}

/** El motivo, limpio: sin `<` ni `>` ni caracteres de control, sin espacios de más y hasta 80 letras. */
function motivoLimpio(m: string | undefined): string {
  return (m ?? "").replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_LARGO_MOTIVO).trim();
}

/** Los bloqueos a guardar: uno por día de la repetición. Con más de uno, todos llevan `serieId` = `idBase` (para «Quitar toda la serie»).
 *  Los campos vacíos no se guardan (Firestore no acepta `undefined`). El formulario tiene que venir revisado (`errorDeBloqueo`). */
export function armarBloqueos(
  f: FormBloqueo,
  extra: { clinicId: string; createdAt: string; createdBy: string; idBase: string },
): AgendaBlock[] {
  const fechas = expandirRepeticion(f);
  const serie = fechas.length > 1;
  const reason = motivoLimpio(f.motivo);
  return fechas.map((fecha, i) => ({
    id: serie ? `${extra.idBase}_${i + 1}` : extra.idBase,
    clinicId: extra.clinicId,
    dentistId: f.dentistId,
    ...(f.boxId ? { boxId: f.boxId } : {}),
    start: instante(fecha, f.desde),
    end: instante(fecha, f.hasta),
    ...(reason ? { reason } : {}),
    createdAt: extra.createdAt,
    createdBy: extra.createdBy,
    ...(serie ? { serieId: extra.idBase } : {}),
  }));
}

/** Estados que liberan el horario (igual que en lib/disponibilidad.ts). */
const LIBERAN = new Set(["cancelada", "ausente"]);

/** Las citas activas que algún bloqueo pisa (para avisar «Ya hay N citas en ese horario; siguen en la agenda»). Las que solo tocan el
 *  borde no cuentan; cada cita se cuenta una vez aunque la pisen varios bloqueos de una serie. */
export function citasQuePisan<C extends { dentistId: string; boxId?: string; status: string; start: string; end: string }>(
  bloqueos: readonly { dentistId: string; boxId?: string; start: string; end: string }[],
  citas: readonly C[],
): C[] {
  return citas.filter((c) => {
    if (LIBERAN.has(c.status)) return false;
    const ini = Date.parse(c.start);
    const fin = Date.parse(c.end);
    return bloqueos.some((b) => bloqueoAplica(b, c) && ini < Date.parse(b.end) && fin > Date.parse(b.start));
  });
}

/** «12:00–13:00» en la hora local; un bloqueo que termina a la medianoche siguiente dice «24:00». */
export function rangoDeBloqueo(b: { start: string; end: string }): string {
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const ini = new Date(b.start);
  const fin = new Date(b.end);
  const finDelDia = fin.getHours() === 0 && fin.getMinutes() === 0 && fin.toDateString() !== ini.toDateString();
  return `${hhmm(ini)}–${finDelDia ? FIN_DEL_DIA : hhmm(fin)}`;
}
