/** La IA de «Mi agenda»: dictar la semana y el resumen semanal.
 *
 *  Acá vive todo lo que no es red: el texto que se le pide al modelo, la validación de lo que
 *  devuelve (un modelo se equivoca con las fechas y a veces responde con prosa) y el emparejamiento
 *  del nombre dictado con una ficha. Ese emparejamiento es LOCAL: ningún nombre de paciente sale
 *  del navegador hacia la IA.
 *
 *  Módulo PURO: no importa React, ni Firestore, ni el store. */
import { diaDe, esFecha, fechaLarga, sumarDias, type FilaTarea } from "./tareas";
import { rangoDe, type Agenda, type ItemAgenda, type Rango } from "./miAgenda";
import type { Appointment, MgmtTaskType, Patient } from "./types";

/* ─── Dictar la semana ────────────────────────────────────────────────────── */

/** Una tarea que propone la IA. Nunca se guarda sola: la persona la revisa primero. */
export interface PropuestaTarea {
  titulo: string;
  /** YYYY-MM-DD, de hoy en adelante. */
  fecha: string;
  /** El nombre tal como se dictó. Se empareja con una ficha en el navegador. */
  paciente?: string;
}

const MAX_TAREAS = 20;
const MAX_TITULO = 200;
const MAX_PACIENTE = 80;
/** Más lejos que esto es un error del modelo, no un plan. */
const MAX_DIAS_ADELANTE = 366;

/** El JSON de la respuesta, venga como venga: limpio, entre ```json o rodeado de prosa. */
function extraerJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const limpio = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const intentar = (t: string): unknown => { try { return JSON.parse(t); } catch { return undefined; } };
  const directo = intentar(limpio);
  if (directo !== undefined) return directo;
  for (const [abre, cierra] of [["{", "}"], ["[", "]"]] as const) {
    const a = limpio.indexOf(abre);
    const c = limpio.lastIndexOf(cierra);
    if (a !== -1 && c > a) {
      const r = intentar(limpio.slice(a, c + 1));
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Lo que devolvió el modelo → propuestas válidas. Nunca tira: lo que no se entiende se descarta.
 *  Una fecha inválida, pasada o absurda cae en `hoy`: es mejor una tarea para hoy, que se ve, que una
 *  atrasada de entrada o una perdida en dos años. */
export function parsearPropuestas(raw: unknown, hoy: string): PropuestaTarea[] {
  const data = extraerJson(raw);
  const lista: unknown[] = Array.isArray(data) ? data : esObjeto(data) && Array.isArray(data.tareas) ? data.tareas : [];
  const limite = sumarDias(hoy, MAX_DIAS_ADELANTE);
  const vistas = new Set<string>();
  const out: PropuestaTarea[] = [];

  for (const x of lista) {
    if (!esObjeto(x) || typeof x.titulo !== "string") continue;
    const titulo = x.titulo.trim().slice(0, MAX_TITULO);
    if (!titulo) continue;

    const dia = typeof x.fecha === "string" ? x.fecha.slice(0, 10) : "";
    const fecha = esFecha(dia) && dia >= hoy && dia <= limite ? dia : hoy;

    const clave = `${titulo.toLowerCase()}|${fecha}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);

    const paciente = typeof x.paciente === "string" ? x.paciente.trim().slice(0, MAX_PACIENTE) : "";
    out.push({ titulo, fecha, ...(paciente ? { paciente } : {}) });
    if (out.length === MAX_TAREAS) break;
  }
  return out;
}

/** Sin tildes, en minúscula y sin signos: «Pérez, José» y «perez jose» son lo mismo. */
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ");
const palabras = (s: string) => normalizar(s).split(/\s+/).filter(Boolean);

/** Tratamientos y artículos que se dictan antes del nombre («doña María», «el señor López»). Se sacan del
 *  nombre dictado, nunca de la ficha: «De la Cruz» sigue encontrándose. */
const SIN_VALOR = new Set(["don", "dona", "senor", "senora", "sr", "sra", "srta", "dr", "dra", "doctor", "doctora", "paciente", "el", "la", "los", "las", "al"]);

/** Las fichas que coinciden con el nombre dictado, la más parecida primero (máximo 5). Todas las palabras
 *  dictadas tienen que estar en el nombre de la ficha, enteras: «Ana» no es «Susana». Con varias, gana la
 *  que tiene menos palabras de más: «Juan Pérez» antes que «Juan Carlos Pérez González». */
export function emparejarPaciente<T extends Pick<Patient, "firstName" | "lastName">>(nombre: string, pacientes: readonly T[]): T[] {
  const buscadas = palabras(nombre).filter((w) => !SIN_VALOR.has(w));
  if (buscadas.length === 0) return [];
  return pacientes
    .map((p) => {
      const suyas = palabras(`${p.firstName} ${p.lastName}`);
      return { p, extra: suyas.length - buscadas.length, ok: buscadas.every((w) => suyas.includes(w)), nombre: `${p.firstName} ${p.lastName}` };
    })
    .filter((x) => x.ok)
    .sort((a, b) => a.extra - b.extra || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, 5)
    .map((x) => x.p);
}

/** El pedido al modelo. Va con el día de la semana de hoy para que «el jueves» y «mañana» salgan bien. */
export function promptAgendaSemana(hoy: string): string {
  return `Sos el asistente de agenda de una clínica dental en Paraguay.
Una persona del equipo te dicta (por voz o por texto) lo que tiene que hacer en la semana.

Hoy es ${fechaLarga(hoy)} (${hoy}).

Separalo en TAREAS concretas, una por cada cosa a hacer. De cada una devolvé:
- "titulo": qué hay que hacer, en una frase corta y sin muletillas ("Llamar a Juan Pérez por el presupuesto").
- "fecha": el día en que se hace, en formato YYYY-MM-DD. «hoy» es ${hoy}; «mañana» es el día siguiente;
  «el jueves» es el próximo jueves (hoy mismo si hoy es jueves); «la semana que viene» sin más es el lunes
  próximo. Si no se menciona ningún día, usá hoy.
- "paciente": el nombre y apellido del paciente tal como se dictó, SOLO si la tarea habla de un paciente.
  Si no, no pongas este campo.

Respondé SOLO este JSON (sin markdown, sin explicación):
{"tareas":[{"titulo":"...","fecha":"YYYY-MM-DD","paciente":"..."}],"transcripcion":"..."}

"transcripcion" es lo que se dijo, literal (solo si hay audio; si es texto, dejalo vacío).
No inventes tareas ni pacientes que no se dijeron. Máximo ${MAX_TAREAS} tareas.
Si no hay ninguna tarea: {"tareas":[],"transcripcion":""}`;
}

/* ─── Resumen semanal ─────────────────────────────────────────────────────── */

/** Lo que sale del navegador hacia el resumen semanal: solo CONTEOS. Ni nombres de pacientes ni el
 *  texto de las tareas (la gente escribe «llamar a Juan Pérez»). */
export interface DatosResumenSemana {
  hoy: string;
  semana: Rango;
  misTareas: { total: number; hechas: number; pendientes: number; atrasadas: number };
  rutina: { punto: string; hecha: boolean; detalle: string }[];
  bandeja: { pendientes: number; atrasadas: number; porTipo: Partial<Record<MgmtTaskType, number>> };
  citas: {
    semana: { total: number; confirmadas: number; pendientes: number; completadas: number; canceladas: number; ausentes: number };
    proximaSemana: number;
  };
  /** Solo si el rol ve montos (`billing.reports`). */
  produccionSemanaGs?: number;
}

export function resumenSemanaDatos(o: {
  hoy: string;
  agenda: Agenda;
  /** La bandeja que ve la persona (ya filtrada por rol y alcance). */
  filasBandeja: readonly FilaTarea[];
  appointments: readonly Pick<Appointment, "start" | "status" | "dentistId">[];
  veDoctor: (dentistId: string | undefined) => boolean;
  verMontos: boolean;
  produccionSemanaGs?: number;
}): DatosResumenSemana {
  const semana = rangoDe("semana", o.hoy);
  const items: ItemAgenda[] = [...o.agenda.atrasadas, ...o.agenda.dias.flatMap((d) => d.items)];
  const mias = items.filter((i) => i.origen !== "rutina");

  const pendientes = o.filasBandeja.filter((f) => f.estado === "pendiente" && f.fecha <= semana.hasta);
  const porTipo: Partial<Record<MgmtTaskType, number>> = {};
  for (const f of pendientes) porTipo[f.type] = (porTipo[f.type] ?? 0) + 1;

  const visibles = o.appointments.filter((a) => o.veDoctor(a.dentistId));
  const proxima = { desde: sumarDias(semana.hasta, 1), hasta: sumarDias(semana.hasta, 7) };
  const enSemana = visibles.filter((a) => { const d = diaDe(a.start); return d >= semana.desde && d <= semana.hasta; });
  const cuenta = (...estados: Appointment["status"][]) => enSemana.filter((a) => estados.includes(a.status)).length;

  return {
    hoy: o.hoy,
    semana,
    misTareas: {
      total: mias.length,
      hechas: mias.filter((i) => i.hecha).length,
      pendientes: mias.filter((i) => !i.hecha).length,
      atrasadas: mias.filter((i) => i.atrasada).length,
    },
    rutina: items.filter((i) => i.origen === "rutina").map((i) => ({ punto: i.titulo, hecha: i.hecha, detalle: i.detalle ?? "" })),
    bandeja: { pendientes: pendientes.length, atrasadas: pendientes.filter((f) => f.fecha < o.hoy).length, porTipo },
    citas: {
      semana: {
        total: enSemana.length,
        confirmadas: cuenta("confirmada", "en_atencion", "en_sala"),
        pendientes: cuenta("pendiente"),
        completadas: cuenta("completada"),
        canceladas: cuenta("cancelada"),
        ausentes: cuenta("ausente"),
      },
      proximaSemana: visibles.filter((a) => {
        const d = diaDe(a.start);
        return d >= proxima.desde && d <= proxima.hasta && a.status !== "cancelada" && a.status !== "ausente";
      }).length,
    },
    ...(o.verMontos && o.produccionSemanaGs != null ? { produccionSemanaGs: o.produccionSemanaGs } : {}),
  };
}
