/** Fusión de dos fichas de paciente (Administración › Fusión de fichas): la ficha que se mantiene absorbe a la duplicada SIN perder nada.
 *  Es irreversible, así que acá se decide qué pasa con cada dato:
 *   · lo que la ficha que se mantiene ya tiene, manda; lo que le falta se completa con lo de la duplicada (teléfono, correo, convenio, foto…);
 *   · los textos médicos (alertas, enfermedades, medicamentos) se UNEN: perder una alergia es lo peor que puede pasar;
 *   · las listas (historial, evoluciones, archivos, recetas, periodontogramas, encuestas) se juntan sin repetir;
 *   · la ortodoncia de la duplicada pasa entera si la otra no tiene, y si las dos tienen se unen los controles. */
import { DEFAULT_ODONTOGRAM_STATUS, type OdontogramStatus, type OrthoRecord, type Patient } from "./types";

const vacio = (x: unknown): boolean => x === undefined || x === null || (typeof x === "string" && x.trim() === "");

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

export function fusionarFichas(keep: Patient, remove: Patient): Patient {
  const m: Patient = { ...keep };
  const aEscribir = m as unknown as Record<string, unknown>;
  for (const k of COMPLETAR) {
    if (vacio(keep[k]) && !vacio(remove[k])) aEscribir[k] = remove[k];
  }
  for (const k of ["medicalAlerts", "conditions", "medications"] as const) {
    const unido = unirTextosMedicos(keep[k], remove[k]);
    if (unido !== undefined) m[k] = unido;
  }
  m.historyUpdatePending = !!(keep.historyUpdatePending || remove.historyUpdatePending);
  if (!keep.historyUpdateDate && remove.historyUpdateDate) m.historyUpdateDate = remove.historyUpdateDate;

  m.forms = unir(keep.forms, remove.forms, (f) => f.id) ?? [];
  m.emr = unir(keep.emr, remove.emr, (n) => n.id) ?? [];
  const files = unir(keep.files, remove.files, (f) => f.id);
  if (files) m.files = files;
  const perio = unir(keep.perio, remove.perio, (s) => s.id);
  if (perio) m.perio = perio;
  const prescriptions = unir(keep.prescriptions, remove.prescriptions, (r) => r.id);
  if (prescriptions) m.prescriptions = prescriptions;
  const ortho = unirOrtodoncia(keep.ortho, remove.ortho);
  if (ortho) m.ortho = ortho;

  const npsHistory = unir(keep.npsHistory, remove.npsHistory, (n) => `${n.at}|${n.score}`);
  if (npsHistory) m.npsHistory = npsHistory;
  const ultimo = [keep.nps, remove.nps, ...(npsHistory ?? [])].filter((n): n is NonNullable<Patient["nps"]> => !!n).sort((x, y) => y.at.localeCompare(x.at))[0];
  if (ultimo) m.nps = ultimo;

  if (keep.odontogram || remove.odontogram) {
    const odontogram: OdontogramStatus = {
      ...DEFAULT_ODONTOGRAM_STATUS,
      ...(remove.odontogram ?? {}),
      ...(keep.odontogram ?? {}),
      globals: { ...(remove.odontogram?.globals ?? {}), ...(keep.odontogram?.globals ?? {}) },
      teeth: { ...(remove.odontogram?.teeth ?? {}), ...(keep.odontogram?.teeth ?? {}) },
    };
    m.odontogram = odontogram;
    const por = keep.odontogramUpdatedBy ?? remove.odontogramUpdatedBy;
    const en = keep.odontogramUpdatedAt ?? remove.odontogramUpdatedAt;
    if (por !== undefined) m.odontogramUpdatedBy = por;
    if (en !== undefined) m.odontogramUpdatedAt = en;
  }
  return m;
}
