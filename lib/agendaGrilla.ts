/* Columnas de la grilla de la agenda (components/agenda/GrillaAgenda): una por día en la Semanal y una por profesional en la Diaria global
 * (pedido de Camila, 13-oct-2026, como Dentalink). Qué cita y qué bloqueo va en cada columna y qué celdas caen fuera del horario de
 * atención (se pintan en gris, pero se pueden tocar igual). Todo en hora local, como el resto de la agenda. Tests en lib/agendaGrilla.test.ts. */
import type { AgendaBlock, Appointment, User } from "./types";
import { HORARIO_POR_DEFECTO, type Horario } from "./disponibilidad";
import { TODOS_LOS_PROFESIONALES } from "./bloqueos";
import { MINUTOS_CELDA } from "./agendaSemana";

/** Una columna de la grilla: un día (Semanal) o un profesional en un día (Diaria global). */
export interface ColumnaDeAgenda {
  /** Estable: «d:2026-10-13» o «p:u2». */
  clave: string;
  /** «Lun» o el nombre del profesional. */
  titulo: string;
  /** El número del día o la especialidad del profesional, si tiene. */
  subtitulo?: string;
  /** Medianoche local del día de la columna. */
  fecha: Date;
  /** Solo en la Diaria global: el profesional de la columna. */
  dentistId?: string;
  /** El color de agenda del profesional (el punto del encabezado). */
  color?: string;
  /** Profesional dado de baja: su columna sale solo si tiene citas ese día, y sus espacios no se agendan (en «Dar cita» ya no está). */
  inactivo?: boolean;
  esHoy: boolean;
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const dos = (n: number) => String(n).padStart(2, "0");
const medianoche = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const claveDia = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

/** Los siete días de la semana que empieza en `lunes`. */
export function columnasDeLaSemana(lunes: Date, hoy: Date = new Date()): ColumnaDeAgenda[] {
  const inicio = medianoche(lunes);
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(inicio);
    fecha.setDate(inicio.getDate() + i);
    return { clave: `d:${claveDia(fecha)}`, titulo: DIAS[fecha.getDay()], subtitulo: String(fecha.getDate()), fecha, esHoy: mismoDia(fecha, hoy) };
  });
}

/** Una columna por profesional para el día `fecha`, en el orden en que llegan. Un dado de baja queda marcado (`inactivo`). */
export function columnasDelDia(fecha: Date, profesionales: readonly (Pick<User, "id" | "name" | "color" | "specialty"> & Partial<Pick<User, "active">>)[], hoy: Date = new Date()): ColumnaDeAgenda[] {
  const dia = medianoche(fecha);
  return profesionales.map((p) => ({
    clave: `p:${p.id}`, titulo: p.name, subtitulo: p.active === false ? "Dado de baja" : p.specialty || undefined, fecha: dia, dentistId: p.id, color: p.color,
    ...(p.active === false ? { inactivo: true } : {}), esHoy: mismoDia(dia, hoy),
  }));
}

/** ¿Va esta cita en esta columna? Semanal: mismo día. Diaria global: mismo día y mismo profesional. */
export function citaEnColumna(col: ColumnaDeAgenda, a: Pick<Appointment, "start" | "dentistId">): boolean {
  if (!mismoDia(new Date(a.start), col.fecha)) return false;
  return col.dentistId === undefined || a.dentistId === col.dentistId;
}

/** ¿Va este bloqueo en esta columna? Como una cita, pero uno de «Todos los profesionales» va en todas las columnas del día. */
export function bloqueoEnColumna(col: ColumnaDeAgenda, b: Pick<AgendaBlock, "start" | "dentistId">): boolean {
  if (!mismoDia(new Date(b.start), col.fecha)) return false;
  return col.dentistId === undefined || b.dentistId === TODOS_LOS_PROFESIONALES || b.dentistId === col.dentistId;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** ¿La celda [hora, hora + paso) cae fuera del horario de atención? Fuera = el día no está en `dias`, o la celda empieza antes de `desde` o
 *  termina después de `hasta`. Sin horario, el de siempre (`HORARIO_POR_DEFECTO`); un dato mal cargado toma su valor de siempre. */
export function fueraDeHorario(horario: Horario | undefined, fecha: Date, hora: string, paso: number = MINUTOS_CELDA): boolean {
  const h = horario ?? HORARIO_POR_DEFECTO;
  const dias = Array.isArray(h.dias) ? h.dias : HORARIO_POR_DEFECTO.dias;
  if (!dias.includes(fecha.getDay())) return true;
  const desde = minutos(HHMM.test(h.desde ?? "") ? h.desde : HORARIO_POR_DEFECTO.desde);
  const hasta = minutos(HHMM.test(h.hasta ?? "") ? h.hasta : HORARIO_POR_DEFECTO.hasta);
  const inicio = minutos(hora);
  return inicio < desde || inicio + paso > hasta;
}
