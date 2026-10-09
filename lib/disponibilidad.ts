/* Disponibilidad para «Dar cita»: en qué horarios entra una consulta de cierta duración
 * en la agenda de un profesional (y del box, si se eligió uno). Todo en hora local, como
 * el resto de la agenda. Funciones puras: se testean en lib/disponibilidad.test.ts. */
import { bloqueoAplica } from "./bloqueos";

/** Días (0 = domingo … 6 = sábado) y franja en que atiende un profesional. */
export interface Horario {
  dias: number[];
  desde: string; // "08:00"
  hasta: string; // "18:00"
}

/** Mientras no haya horario por profesional, el mismo de la reserva online: lunes a
 *  sábado de 08:00 a 18:00 (ver app/api/reservas/route.ts). */
export const HORARIO_POR_DEFECTO: Horario = { dias: [1, 2, 3, 4, 5, 6], desde: "08:00", hasta: "18:00" };

/** Cada cuánto arranca un turno posible. */
export const PASO_MIN = 30;

/** Estados que liberan el horario. */
const LIBERAN = new Set(["cancelada", "ausente"]);

type Ocupacion = { id?: string; start: string; end: string; dentistId: string; boxId?: string; status: string };
type Bloqueo = { start: string; end: string; dentistId: string; boxId?: string };

const aMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Las citas activas del profesional (o del box, si se eligió uno) que ocupan horario, como intervalos [inicio, fin). */
function ocupacionesDe(opts: { dentistId: string; citas: Ocupacion[]; boxId?: string; ignorarId?: string }) {
  return opts.citas
    .filter((c) => c.id !== opts.ignorarId && !LIBERAN.has(c.status))
    .filter((c) => c.dentistId === opts.dentistId || (!!opts.boxId && c.boxId === opts.boxId))
    .map((c) => [Date.parse(c.start), Date.parse(c.end)] as const);
}

/** Horarios de inicio ("HH:MM") en que entra una consulta de `duracionMin` el día `fecha` sin pisar otra cita del profesional (ni del
 *  box, si se eligió), ni un espacio bloqueado (lib/bloqueos.ts), ni quedar en el pasado. Con `permitirSuperponer` («Sobreagendar»)
 *  las citas no ocupan; los bloqueos, el pasado y el horario de atención se respetan siempre. `incluir` suma horarios fuera de los pasos
 *  de la grilla (sobreagendar una cita que empieza 09:20), con las mismas condiciones. */
export function huecosDelDia(
  fecha: Date,
  duracionMin: number,
  opts: {
    dentistId: string; citas: Ocupacion[]; ahora: number; boxId?: string; horario?: Horario; paso?: number; ignorarId?: string;
    bloqueos?: readonly Bloqueo[]; permitirSuperponer?: boolean; incluir?: readonly string[];
  },
): string[] {
  const horario = opts.horario ?? HORARIO_POR_DEFECTO;
  if (duracionMin <= 0 || !horario.dias.includes(fecha.getDay())) return [];
  const paso = opts.paso ?? PASO_MIN;
  const base = new Date(fecha); base.setHours(0, 0, 0, 0);
  const ocupadas = opts.permitirSuperponer ? [] : ocupacionesDe(opts);
  const bloqueadas = (opts.bloqueos ?? [])
    .filter((b) => bloqueoAplica(b, { dentistId: opts.dentistId, boxId: opts.boxId }))
    .map((b) => [Date.parse(b.start), Date.parse(b.end)] as const);
  const desde = aMin(horario.desde);
  const hasta = aMin(horario.hasta);
  const candidatos = new Set<number>();
  for (let t = desde; t + duracionMin <= hasta; t += paso) candidatos.add(t);
  for (const h of opts.incluir ?? []) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(h)) continue;
    const t = aMin(h);
    if (t >= desde && t + duracionMin <= hasta) candidatos.add(t);
  }
  const out: string[] = [];
  for (const t of [...candidatos].sort((a, b) => a - b)) {
    const ini = base.getTime() + t * 60_000;
    const fin = ini + duracionMin * 60_000;
    if (ini < opts.ahora) continue;
    if (ocupadas.some(([s, e]) => ini < e && fin > s)) continue;
    if (bloqueadas.some(([s, e]) => ini < e && fin > s)) continue;
    out.push(hhmm(t));
  }
  return out;
}

/** Por qué un día no tiene horarios para ofrecer: no atiende, ya pasó (hoy, tarde), la consulta no entra en el horario de atención, está
 *  todo bloqueado (ni sobreagendando hay lugar) o está todo ocupado. `null` si hay lugar. Así la grilla de «Dar cita» no muestra el
 *  mismo «Sin lugar» para un domingo que para un día lleno. */
export type MotivoSinHuecos = "no-atiende" | "ya-paso" | "muy-larga" | "bloqueado" | "completo";

export const TEXTO_SIN_HUECOS: Record<MotivoSinHuecos, string> = {
  "no-atiende": "No atiende",
  "ya-paso": "Ya pasó el horario",
  "muy-larga": "No entra en el horario",
  bloqueado: "Bloqueado",
  completo: "Sin lugar",
};

export function motivoSinHuecos(fecha: Date, duracionMin: number, opts: Parameters<typeof huecosDelDia>[2]): MotivoSinHuecos | null {
  if (huecosDelDia(fecha, duracionMin, opts).length > 0) return null;
  const horario = opts.horario ?? HORARIO_POR_DEFECTO;
  if (!horario.dias.includes(fecha.getDay())) return "no-atiende";
  const desde = aMin(horario.desde);
  const hasta = aMin(horario.hasta);
  if (duracionMin > hasta - desde) return "muy-larga";
  const base = new Date(fecha); base.setHours(0, 0, 0, 0);
  // El último inicio en que entraba la consulta ya quedó atrás.
  const ultimo = desde + Math.floor((hasta - duracionMin - desde) / (opts.paso ?? PASO_MIN)) * (opts.paso ?? PASO_MIN);
  if (base.getTime() + ultimo * 60_000 < opts.ahora) return "ya-paso";
  return huecosDelDia(fecha, duracionMin, { ...opts, permitirSuperponer: true }).length === 0 ? "bloqueado" : "completo";
}

/** Las duraciones que se ofrecen en «Dar cita»: de 15 en 15 minutos, de 15 min a 8 h. La de la cita que se edita, si es otra (20 min,
 *  10 h), se suma en su lugar para no cambiarla sin querer. */
export function opcionesDeDuracion(actual: number): number[] {
  const out = Array.from({ length: 32 }, (_, i) => (i + 1) * 15);
  if (actual > 0 && !out.includes(actual)) out.push(actual);
  return out.sort((a, b) => a - b);
}

/** «15 min», «1 h», «1 h 30 min». */
export function textoDuracion(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return [h > 0 && `${h} h`, (m > 0 || h === 0) && `${m} min`].filter(Boolean).join(" ");
}

/** Cuántas citas activas del profesional (o del box, si se eligió) pisa una consulta de `duracionMin` que empieza el día `fecha` a la
 *  `hora`. Al sobreagendar, el horario se marca «Ya hay 1 cita»; al guardar, si es más de 0 la cita queda como sobrecupo. */
export function citasEnElHueco(
  fecha: Date,
  hora: string,
  duracionMin: number,
  opts: { dentistId: string; citas: Ocupacion[]; boxId?: string; ignorarId?: string },
): number {
  const ini = Date.parse(inicioDe(fecha, hora));
  const fin = ini + Math.max(1, duracionMin) * 60_000;
  return ocupacionesDe(opts).filter(([s, e]) => ini < e && fin > s).length;
}

/** `n` días seguidos a partir de `inicio` (a medianoche). */
export function diasDesde(inicio: Date, n = 7): Date[] {
  const base = new Date(inicio); base.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return d; });
}

/** Fin de la cita a partir del inicio (ISO) y la duración en horas y minutos. */
export function finDeCita(inicioISO: string, horas: number, minutos: number): string {
  return new Date(Date.parse(inicioISO) + (horas * 60 + minutos) * 60_000).toISOString();
}

/** Inicio (ISO) de un turno: el día a medianoche más "HH:MM". */
export function inicioDe(fecha: Date, hora: string): string {
  const d = new Date(fecha); const [h, m] = hora.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** Tipos de consulta de «Dar cita». `clave` se compara con la especialidad de cada
 *  profesional para filtrar la lista; «Todas» no filtra. */
export const TIPOS_CONSULTA = [
  { clave: "todas", label: "Todas" },
  { clave: "general", label: "General" },
  { clave: "estetica", label: "Odontología estética" },
  { clave: "ortodoncia", label: "Ortodoncia" },
  { clave: "rehabilitacion", label: "Rehabilitación oral" },
] as const;
export type TipoConsulta = (typeof TIPOS_CONSULTA)[number]["clave"];

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** ¿La especialidad cargada del profesional corresponde al tipo de consulta? */
export function especialidadCoincide(tipo: TipoConsulta, especialidad: string | undefined): boolean {
  if (tipo === "todas") return true;
  return normalizar(especialidad ?? "").includes(tipo);
}
