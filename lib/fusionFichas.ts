/** Fusión de dos fichas de paciente (Administración › Fusión de fichas): la ficha que se mantiene absorbe a la duplicada SIN perder nada.
 *  Es irreversible, así que acá se decide qué pasa con cada dato:
 *   · lo que la ficha que se mantiene ya tiene, manda; lo que le falta se completa con lo de la duplicada (teléfono, correo, convenio, foto…);
 *   · los textos médicos (alertas, enfermedades, medicamentos) se UNEN: perder una alergia es lo peor que puede pasar;
 *   · las listas (historial, evoluciones, archivos, recetas, periodontogramas, encuestas) se juntan sin repetir;
 *   · la ortodoncia de la duplicada pasa entera si la otra no tiene, y si las dos tienen se unen los controles;
 *   · la quita de «Sin próxima cita» (`seguimiento`): manda la de la ficha que se mantiene; si no tiene, la de la duplicada;
 *   · el odontograma se junta PIEZA POR PIEZA: el editor guarda siempre las 32 piezas (las sanas con el estado por defecto del motor),
 *     así que una pieza sana de la ficha que se mantiene no tapa los hallazgos de la duplicada; si las dos tienen hallazgos
 *     distintos en la misma pieza, manda la ficha que se mantiene (`piezasEnConflicto` dice cuáles para avisarlo). */
import { DEFAULT_ODONTOGRAM_STATUS, type OdontogramStatus, type OrthoRecord, type Patient } from "./types";
import { PIEZA_SIN_HALLAZGOS } from "./odontogramaSinHallazgos";
import { normalizarQuita } from "./seguimiento";

const vacio = (x: unknown): boolean => x === undefined || x === null || (typeof x === "string" && x.trim() === "");

/** La importación de pacientes sin CI guarda `s/d-<hora>-<fila>` para no dejar el campo vacío: no es una CI. */
const esCIdeRelleno = (x: unknown): boolean => typeof x === "string" && /^s\/d\b/i.test(x.trim());

/** Igualdad de datos JSON sin importar el orden de las claves (Firestore no lo conserva). */
function iguales(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => iguales(x, b[i]));
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && iguales((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

type Pieza = OdontogramStatus["teeth"][string];

/** ¿Una pieza del odontograma no tiene ningún hallazgo? Todo lo que trae es el valor por defecto del motor (lo que falta se ignora:
 *  un payload de una versión más vieja puede no traer los campos nuevos). Un campo que el motor por defecto no conoce cuenta como hallazgo. */
function sinHallazgos(pieza: unknown): boolean {
  if (typeof pieza !== "object" || pieza === null || Array.isArray(pieza)) return false;
  return Object.entries(pieza).every(([k, v]) =>
    Object.prototype.hasOwnProperty.call(PIEZA_SIN_HALLAZGOS, k) ? iguales(v, PIEZA_SIN_HALLAZGOS[k]) : v === undefined || v === null);
}

/** Las piezas donde las dos fichas tienen hallazgos DISTINTOS: ahí manda la ficha que se mantiene y los de la otra no pasan. */
export function piezasEnConflicto(keep: Patient, remove: Patient): string[] {
  const a = keep.odontogram?.teeth ?? {};
  const b = remove.odontogram?.teeth ?? {};
  return Object.keys(a)
    .filter((n) => n in b && !sinHallazgos(a[n]) && !sinHallazgos(b[n]) && !iguales(a[n], b[n]))
    .sort((x, y) => Number(x) - Number(y));
}

/** De la más nueva a la más vieja, como las deja el store al agregar (`[nuevo, ...lista]`): «Última actividad», el contexto de la IA y
 *  el periodontograma que se abre toman los primeros. */
function masNuevoPrimero<T>(lista: T[] | undefined, fecha: (x: T) => string): T[] | undefined {
  return lista && [...lista].sort((x, y) => fecha(y).localeCompare(fecha(x)));
}

/** Une dos textos médicos sin repetir: uno vacío → el otro; iguales o uno dentro del otro → el más completo; distintos → los dos. */
export function unirTextosMedicos(a?: string, b?: string): string | undefined {
  const x = (a ?? "").trim();
  const y = (b ?? "").trim();
  if (!x && !y) return undefined;
  if (!x) return y;
  if (!y) return x;
  const nx = x.toLowerCase();
  const ny = y.toLowerCase();
  if (nx === ny || nx.includes(ny)) return x;
  if (ny.includes(nx)) return y;
  return `${x} · ${y}`;
}

/** Junta dos listas sin repetir (por `clave`); la primera manda. `undefined` si ninguna existía: no se inventa una lista vacía. */
function unir<T>(a: readonly T[] | undefined, b: readonly T[] | undefined, clave: (x: T) => string): T[] | undefined {
  if (!a && !b) return undefined;
  const vistos = new Set<string>();
  const out: T[] = [];
  for (const x of [...(a ?? []), ...(b ?? [])]) {
    const k = clave(x);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(x);
  }
  return out;
}

function unirOrtodoncia(a?: OrthoRecord, b?: OrthoRecord): OrthoRecord | undefined {
  if (!a || !b) return a ?? b;
  // Si solo la duplicada tiene el tratamiento en curso, ese es el que sigue; si no, el de la ficha que se mantiene.
  const base = !a.active && b.active ? b : a;
  const otro = base === a ? b : a;
  const controls = [...(unir(base.controls, otro.controls, (c) => `${c.date}|${c.note}|${c.by}`) ?? [])].sort((x, y) => x.date.localeCompare(y.date));
  return { ...base, controls };
}

/** Datos de texto que se completan solo si la ficha que se mantiene no los tiene. */
const COMPLETAR: (keyof Patient)[] = [
  "phone", "document", "email", "birthDate", "insurer", "city", "tipo", "socialName", "internalNumber", "municipio", "address", "activity", "employer",
  "landline", "guardian", "referencia", "observaciones", "legalRepDoc", "parentesco", "codigoReferido", "barrio", "ruc", "razonSocial",
  "emergencyContact", "emergencyPhone", "photo", "gender", "sex", "foreigner",
];

/** Lo que devuelve `mergePatients` del store: o se fusionó (con las piezas del odontograma donde las dos fichas tenían hallazgos
 *  distintos y mandó la que se mantiene), o se frenó con el motivo. */
export type ResultadoFusion = { ok: true; piezasEnConflicto: string[] } | { ok: false; error: string };

/** Lo más que debería pesar el documento de un paciente (Firestore tiene un tope de 1 MiB por documento, con su propio encabezado). */
export const TOPE_FICHA_BYTES = 900_000;

/** ¿El documento de esta ficha pasa del tope? Se mira ANTES de fusionar: si Firestore rechaza el guardado de la ficha que queda pero
 *  la duplicada ya se borró, se pierden las evoluciones, los archivos y el odontograma de la duplicada. */
export function fichaDemasiadoGrande(p: Patient): boolean {
  return new TextEncoder().encode(JSON.stringify(p)).length > TOPE_FICHA_BYTES;
}

/** La clave de una tarea derivada que lleva el id del paciente (`cobranza:`, `control:` y `cheque:` + id), pasada a la ficha que queda.
 *  Las que llevan el id de un presupuesto o de una cita (`captura:`, `cita:`) no cambian: esos ids siguen existiendo. Sin esto, lo que
 *  la recepción ya había cerrado, postergado o asignado de esas tareas se perdía y la fila volvía a aparecer abierta. */
export function reasignarClaveDerivada(clave: string | undefined, removeId: string, keepId: string): string | undefined {
  if (!clave) return clave;
  const m = /^(cobranza|control|cheque):(.+)$/.exec(clave);
  return m && m[2] === removeId ? `${m[1]}:${keepId}` : clave;
}

/** Pieza por pieza: la de la ficha que se mantiene, salvo que no tenga hallazgos y la de la duplicada sí. */
function juntarPiezas(a: Record<string, Pieza>, b: Record<string, Pieza>): Record<string, Pieza> {
  const out: Record<string, Pieza> = {};
  for (const n of new Set([...Object.keys(b), ...Object.keys(a)])) {
    out[n] = !(n in a) ? b[n] : !(n in b) ? a[n] : sinHallazgos(a[n]) && !sinHallazgos(b[n]) ? b[n] : a[n];
  }
  return out;
}

export function fusionarFichas(keep: Patient, remove: Patient): Patient {
  const m: Patient = { ...keep };
  const aEscribir = m as unknown as Record<string, unknown>;
  for (const k of COMPLETAR) {
    const falta = vacio(keep[k]) || (k === "document" && esCIdeRelleno(keep[k]));
    const hayDato = !vacio(remove[k]) && !(k === "document" && esCIdeRelleno(remove[k]));
    if (falta && hayDato) aEscribir[k] = remove[k];
  }
  for (const k of ["medicalAlerts", "conditions", "medications"] as const) {
    const unido = unirTextosMedicos(keep[k], remove[k]);
    if (unido !== undefined) m[k] = unido;
  }
  m.historyUpdatePending = !!(keep.historyUpdatePending || remove.historyUpdatePending);
  if (!keep.historyUpdateDate && remove.historyUpdateDate) m.historyUpdateDate = remove.historyUpdateDate;

  m.forms = unir(keep.forms, remove.forms, (f) => f.id) ?? [];
  m.emr = masNuevoPrimero(unir(keep.emr, remove.emr, (n) => n.id), (n) => n.createdAt) ?? [];
  const files = unir(keep.files, remove.files, (f) => f.id);
  if (files) m.files = files;
  const perio = masNuevoPrimero(unir(keep.perio, remove.perio, (s) => s.id), (s) => s.date);
  if (perio) m.perio = perio;
  const prescriptions = masNuevoPrimero(unir(keep.prescriptions, remove.prescriptions, (r) => r.id), (r) => r.date);
  if (prescriptions) m.prescriptions = prescriptions;
  const ortho = unirOrtodoncia(keep.ortho, remove.ortho);
  if (ortho) m.ortho = ortho;

  // La última encuesta puede estar suelta (`nps`, de antes del historial): se suma al historial para que ninguna se pierda.
  const claveNps = (n: NonNullable<Patient["nps"]>) => `${n.at}|${n.score}`;
  const sueltas = [keep.nps, remove.nps].filter((n): n is NonNullable<Patient["nps"]> => !!n);
  const npsHistory = unir(unir(keep.npsHistory, remove.npsHistory, claveNps), sueltas, claveNps);
  if (npsHistory) m.npsHistory = npsHistory;
  const ultimo = [keep.nps, remove.nps, ...(npsHistory ?? [])].filter((n): n is NonNullable<Patient["nps"]> => !!n).sort((x, y) => y.at.localeCompare(x.at))[0];
  if (ultimo) m.nps = ultimo;

  // La quita de «Sin próxima cita» es de la persona, no de la ficha: manda la de la que se mantiene y, si esa no tiene una que valga,
  // pasa la de la duplicada (a esa persona ya se la había sacado de la lista). Un registro roto no se copia.
  const quita = normalizarQuita(keep.seguimiento) ?? normalizarQuita(remove.seguimiento);
  if (quita) m.seguimiento = quita;
  else delete m.seguimiento;

  if (keep.odontogram || remove.odontogram) {
    const odontogram: OdontogramStatus = {
      ...DEFAULT_ODONTOGRAM_STATUS,
      ...(remove.odontogram ?? {}),
      ...(keep.odontogram ?? {}),
      globals: { ...(remove.odontogram?.globals ?? {}), ...(keep.odontogram?.globals ?? {}) },
      teeth: juntarPiezas(keep.odontogram?.teeth ?? {}, remove.odontogram?.teeth ?? {}),
    };
    m.odontogram = odontogram;
    const por = keep.odontogramUpdatedBy ?? remove.odontogramUpdatedBy;
    const en = keep.odontogramUpdatedAt ?? remove.odontogramUpdatedAt;
    if (por !== undefined) m.odontogramUpdatedBy = por;
    if (en !== undefined) m.odontogramUpdatedAt = en;
  }
  return m;
}
