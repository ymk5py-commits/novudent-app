/** «Sin próxima cita» (Pacientes › Análisis de estudios específicos): a quién hay que volver a contactar.
 *
 *  Un paciente ESTÁ EN LA LISTA cuando no está deshabilitado, no tiene ninguna cita que venga (una anulada o una «No asiste» no cuenta) y
 *  o bien ya asistió (alguna cita «Atendido» o «Atendiéndose») o bien tiene un plan de tratamiento vigente (borrador, presentado o
 *  aceptado). Sale de la lista cuando su plan terminó o cuando alguien lo quitó a mano. Todo es PURO: recibe los datos y la hora. */
import { diaDe, fechaLocal } from "./tareas";
import type { Appointment, AppointmentStatus, Budget, BudgetStatus, Patient, QuitaDeLista } from "./types";

export type CitaDeSeguimiento = Pick<Appointment, "patientId" | "start" | "status"> & Partial<Pick<Appointment, "tipoConsulta">>;
export type PlanDeSeguimiento = Pick<Budget, "patientId" | "status" | "createdAt">;
export type PacienteDeSeguimiento = Pick<Patient, "id"> & Partial<Pick<Patient, "disabled" | "seguimiento">>;
export type TipoDeConsulta = NonNullable<Appointment["tipoConsulta"]>;

export interface EntradaDeSeguimiento<C extends CitaDeSeguimiento, B extends PlanDeSeguimiento> {
  paciente: PacienteDeSeguimiento;
  citas: readonly C[];
  presupuestos: readonly B[];
  ahora: Date;
  tipo?: TipoDeConsulta;
}

export interface SeguimientoDePaciente<C extends CitaDeSeguimiento, B extends PlanDeSeguimiento> {
  /** ¿Va en la tabla? No deshabilitado y con alguna cita (o, en la vista general, algún plan). */
  enVista: boolean;
  /** Citas que cuentan (las anuladas no). */
  citas: number;
  /** Planes del paciente, de cualquier estado. */
  planes: number;
  /** La última cita que ya pasó (o ya se atendió), con el estado que tenga. */
  ultima?: C;
  /** La primera cita que viene (no anulada ni «No asiste»). */
  proxima?: C;
  /** La última cita «Atendido» o «Atendiéndose». */
  ultimaAtendida?: C;
  /** El plan más reciente que no está anulado. */
  plan?: B;
  /** Cae en «Sin próxima cita». */
  enLista: boolean;
  /** Desde cuándo está sin cita (AAAA-MM-DD, día local): su última asistencia o, si nunca asistió, el plan vigente más nuevo. */
  desde: string | null;
  desdeDe: "asistencia" | "plan" | null;
  /** Días locales desde `desde` hasta hoy (nunca negativo). */
  dias: number | null;
  /** Tiene planes y todos los que no están anulados están completados. */
  finalizado: boolean;
  /** La quita a mano que lo mantiene afuera (null si no la hay, si volvió a asistir o si su plan terminó). */
  quita: QuitaDeLista | null;
  /** Por qué no está en la lista un paciente que, de otro modo, sí estaría. */
  salida: "finalizado" | "quitado" | null;
}

const ASISTIDA: ReadonlySet<AppointmentStatus> = new Set(["completada", "en_atencion"]);
const PLAN_VIGENTE: ReadonlySet<BudgetStatus> = new Set(["borrador", "presentado", "aceptado"]);
const DIA_MS = 86_400_000;

const instante = (iso: string): number => Date.parse(iso);
/** El instante de una fecha guardada; una que no se lee cuenta como la más vieja de todas. */
const cuando = (iso: string): number => (Number.isFinite(instante(iso)) ? instante(iso) : -Infinity);
/** El más reciente por `createdAt`; si hay empate gana el primero. */
const masNuevo = <T extends { createdAt: string }>(xs: readonly T[]): T | undefined =>
  xs.reduce<T | undefined>((m, x) => (!m || cuando(x.createdAt) > cuando(m.createdAt) ? x : m), undefined);

/** Limpia el registro de quita que viene de Firestore (que se puede editar a mano o venir de una versión vieja): `cerradoAt` tiene que ser
 *  una fecha legible y el motivo no puede estar vacío; el resto se descarta. `undefined` = no hay una quita que valga. */
export function normalizarQuita(raw: unknown): QuitaDeLista | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const { cerradoAt, motivo, por } = raw as Record<string, unknown>;
  if (typeof cerradoAt !== "string" || !Number.isFinite(instante(cerradoAt))) return undefined;
  const m = typeof motivo === "string" ? motivo.trim() : "";
  if (!m) return undefined;
  return { cerradoAt, motivo: m, por: typeof por === "string" ? por.trim() : "" };
}

/** Días de calendario entre dos AAAA-MM-DD (aritmética de fechas, sin husos: nunca restes instantes a ojo). */
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);
}

export function seguimientoDe<C extends CitaDeSeguimiento, B extends PlanDeSeguimiento>(e: EntradaDeSeguimiento<C, B>): SeguimientoDePaciente<C, B> {
  const { paciente } = e;
  const t = e.ahora.getTime();

  // Citas del paciente que cuentan: sin las anuladas ni las de fecha ilegible, de la más vieja a la más nueva. En una vista por tipo de
  // consulta («asistió» y «cita futura» se calculan con las de ese tipo) solo entran las de ese tipo; los planes cuentan siempre.
  const citas = e.citas
    .filter((c) => c.patientId === paciente.id && c.status !== "cancelada" && (!e.tipo || c.tipoConsulta === e.tipo) && Number.isFinite(instante(c.start)))
    .sort((a, b) => instante(a.start) - instante(b.start));
  const yaPaso = (c: C) => instante(c.start) <= t || ASISTIDA.has(c.status);
  const proxima = citas.find((c) => !yaPaso(c) && c.status !== "ausente");
  const ultima = citas.filter(yaPaso).at(-1);
  const ultimaAtendida = citas.filter((c) => ASISTIDA.has(c.status)).at(-1);

  const planes = e.presupuestos.filter((b) => b.patientId === paciente.id);
  const sinAnular = planes.filter((b) => b.status !== "anulado");
  const vigentes = sinAnular.filter((b) => PLAN_VIGENTE.has(b.status));
  const finalizado = sinAnular.length > 0 && sinAnular.every((b) => b.status === "completado");

  const candidato = !paciente.disabled && !proxima && (!!ultimaAtendida || vigentes.length > 0);

  // La quita a mano vale mientras no vuelva a asistir DESPUÉS de que se la hizo (la asistencia de ese mismo momento o anterior no cuenta) y
  // mientras su plan no haya terminado (entonces la razón de estar afuera es esa y «volver a incluir» no cambiaría nada).
  const registro = normalizarQuita(paciente.seguimiento);
  const volvioAAsistir = !!registro && citas.some((c) => ASISTIDA.has(c.status) && instante(c.start) > instante(registro.cerradoAt));
  const quita = registro && !volvioAAsistir && !finalizado ? registro : null;
  const enLista = candidato && !finalizado && !quita;

  let desde: string | null = null;
  let desdeDe: SeguimientoDePaciente<C, B>["desdeDe"] = null;
  if (candidato) {
    if (ultimaAtendida) { desde = diaDe(ultimaAtendida.start); desdeDe = "asistencia"; }
    else {
      const p = masNuevo(vigentes);
      if (p && Number.isFinite(instante(p.createdAt))) { desde = diaDe(p.createdAt); desdeDe = "plan"; }
    }
  }

  return {
    // La tabla general lista a quien tenga citas o planes; las de un tipo, a quien tenga citas de ese tipo.
    enVista: !paciente.disabled && (citas.length > 0 || (!e.tipo && planes.length > 0)),
    citas: citas.length, planes: planes.length,
    ultima, proxima, ultimaAtendida, plan: masNuevo(sinAnular),
    enLista, desde, desdeDe,
    dias: desde ? Math.max(0, diasEntre(desde, fechaLocal(e.ahora))) : null,
    finalizado, quita,
    salida: !candidato ? null : finalizado ? "finalizado" : quita ? "quitado" : null,
  };
}

/** Lo mismo para toda la clínica de una vez: agrupa las citas y los planes por paciente una sola vez (no un recorrido por paciente). */
export function seguimientoDeTodos<C extends CitaDeSeguimiento, B extends PlanDeSeguimiento>(e: {
  pacientes: readonly PacienteDeSeguimiento[]; citas: readonly C[]; presupuestos: readonly B[]; ahora: Date; tipo?: TipoDeConsulta;
}): Map<string, SeguimientoDePaciente<C, B>> {
  const agrupar = <T extends { patientId: string }>(xs: readonly T[]) => {
    const m = new Map<string, T[]>();
    for (const x of xs) { const l = m.get(x.patientId); if (l) l.push(x); else m.set(x.patientId, [x]); }
    return m;
  };
  const citasDe = agrupar(e.citas);
  const planesDe = agrupar(e.presupuestos);
  const out = new Map<string, SeguimientoDePaciente<C, B>>();
  for (const paciente of e.pacientes) {
    out.set(paciente.id, seguimientoDe({ paciente, citas: citasDe.get(paciente.id) ?? [], presupuestos: planesDe.get(paciente.id) ?? [], ahora: e.ahora, tipo: e.tipo }));
  }
  return out;
}

/** «hoy», «ayer» o «hace 23 días» (en días locales; ver `diasEntre`). */
export function haceCuanto(dias: number | null): string {
  if (dias === null || !Number.isFinite(dias)) return "—";
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${Math.round(dias)} días`;
}

/** `https://wa.me/<solo dígitos>`; `null` si no hay un teléfono (menos de 7 dígitos no es un número de WhatsApp). */
export function whatsappUrl(telefono: string | undefined): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  return digitos.length >= 7 ? `https://wa.me/${digitos}` : null;
}

/* ═══ Quitar de la lista ═══ */

/** Los motivos de «Quitar de la lista»; además está «Otro», con texto obligatorio. */
export const MOTIVOS_DE_QUITA = ["Terminó su tratamiento", "Se atiende en otra clínica", "No quiere continuar", "No se lo puede ubicar"] as const;
export const OTRO_MOTIVO = "Otro";
/** Lo más largo que puede ser el texto de «Otro» (el motivo se guarda dentro del documento del paciente). */
export const MAX_MOTIVO = 200;

export type ResultadoQuita = { ok: true; quita: QuitaDeLista } | { ok: false; error: string };

/** Arma el registro que se guarda en `Patient.seguimiento`, o dice qué falta. `motivo` es uno de `MOTIVOS_DE_QUITA` u `OTRO_MOTIVO`. */
export function armarQuita(e: { motivo: string | null; otro?: string; por: string; ahora: Date }): ResultadoQuita {
  const conocido = (MOTIVOS_DE_QUITA as readonly string[]).includes(e.motivo ?? "");
  if (!conocido && e.motivo !== OTRO_MOTIVO) return { ok: false, error: "Elegí un motivo." };
  let motivo = e.motivo as string;
  if (e.motivo === OTRO_MOTIVO) {
    motivo = (e.otro ?? "").trim();
    if (!motivo) return { ok: false, error: "Escribí el motivo." };
    if (motivo.length > MAX_MOTIVO) return { ok: false, error: `El motivo puede tener hasta ${MAX_MOTIVO} letras.` };
  }
  return { ok: true, quita: { cerradoAt: e.ahora.toISOString(), motivo, por: e.por.trim() } };
}
