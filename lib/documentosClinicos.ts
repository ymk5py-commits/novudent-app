import { escapeHtml } from "./html";
import { PLANTILLAS_DE_FABRICA } from "./plantillasDocumento";
import { can } from "./rbac";
import type {
  Budget, CampoDocumento, DocumentoClinico, EstadoDocumento, Patient, PatientForm, PlantillaDocumento, RolId,
  SeccionDocumento, TipoCampoDocumento,
} from "./types";

/* Documentos clínicos de la Ficha clínica (Documentos ▾ › Documentos clínicos): plantillas
 * que la clínica ofrece (la Historia Clínica, textos de indicaciones) y los documentos que se
 * hacen con ellas para un paciente. Todo lo de acá es puro y testeado: nada toca el store.
 * Spec: docs/superpowers/specs/2026-10-06-documentos-clinicos-design.md */

/* ═══ Plantillas ═══ */

const TIPOS_DE_CAMPO: readonly TipoCampoDocumento[] = ["texto", "parrafo", "numero", "seleccion", "casillas"];

const limpio = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function normalizarCampo(raw: unknown, usados: Set<string>): CampoDocumento | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = limpio(r.id);
  const etiqueta = limpio(r.etiqueta);
  const tipo = r.tipo as TipoCampoDocumento;
  if (!id || !etiqueta || usados.has(id) || !TIPOS_DE_CAMPO.includes(tipo)) return null;
  let opciones: string[] | undefined;
  if (tipo === "seleccion" || tipo === "casillas") {
    opciones = [...new Set((Array.isArray(r.opciones) ? r.opciones : []).map(limpio).filter(Boolean))];
    if (opciones.length === 0) return null; // una lista sin opciones no se puede responder
  }
  usados.add(id);
  return { id, etiqueta, tipo, ...(opciones ? { opciones } : {}), ...(r.soloMujeres === true ? { soloMujeres: true } : {}) };
}

function normalizarSeccion(raw: unknown, ids: Set<string>, camposUsados: Set<string>): SeccionDocumento | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = limpio(r.id);
  const titulo = limpio(r.titulo);
  if (!id || !titulo || ids.has(id)) return null;
  const campos = (Array.isArray(r.campos) ? r.campos : [])
    .map((c) => normalizarCampo(c, camposUsados))
    .filter((c): c is CampoDocumento => c !== null);
  if (campos.length === 0) return null;
  ids.add(id);
  return { id, titulo, campos };
}

/** Limpia una lista de plantillas que puede venir rota (edición a medias, datos viejos): descarta
 *  lo que no se puede usar y nunca lanza. Devuelve objetos nuevos, sin compartir referencias
 *  con la entrada. Los ids de campo son únicos en toda la plantilla porque son la clave bajo la
 *  que se guardan los valores. */
export function normalizarPlantillas(lista: readonly PlantillaDocumento[]): PlantillaDocumento[] {
  const vistos = new Set<string>();
  const out: PlantillaDocumento[] = [];
  for (const raw of Array.isArray(lista) ? lista : []) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as unknown as Record<string, unknown>;
    const id = limpio(r.id);
    const nombre = limpio(r.nombre);
    if (!id || !nombre || vistos.has(id)) continue;
    const base = {
      id,
      nombre,
      ...(r.porRevisar === true ? { porRevisar: true as const } : {}),
      ...(r.inactiva === true ? { inactiva: true as const } : {}),
    };
    if (r.tipo === "texto") {
      vistos.add(id);
      out.push({ ...base, tipo: "texto", cuerpo: typeof r.cuerpo === "string" ? r.cuerpo : "" });
    } else if (r.tipo === "formulario") {
      const idsDeSecciones = new Set<string>();
      const camposUsados = new Set<string>();
      const secciones = (Array.isArray(r.secciones) ? r.secciones : [])
        .map((s) => normalizarSeccion(s, idsDeSecciones, camposUsados))
        .filter((s): s is SeccionDocumento => s !== null);
      if (secciones.length === 0) continue;
      vistos.add(id);
      out.push({ ...base, tipo: "formulario", secciones });
    }
  }
  return out;
}

/** Las plantillas de la clínica: las que guardó en Configuración (limpias) o, si nunca las
 *  tocó, las de fábrica. Una lista guardada vacía es una decisión suya y se respeta. */
export function plantillasDeClinica(config: { plantillasDocumento?: PlantillaDocumento[] } | undefined): PlantillaDocumento[] {
  const guardadas = config?.plantillasDocumento;
  return Array.isArray(guardadas) ? normalizarPlantillas(guardadas) : PLANTILLAS_DE_FABRICA;
}

/** ¿La lista con la que se está trabajando en Configuración tiene cambios que todavía no se guardaron?
 *
 *  Se comparan las dos NORMALIZADAS. Lo que se guarda siempre pasa por `normalizarPlantillas`, que además reordena las claves de cada
 *  objeto; la lista de trabajo conserva el orden con el que se la fue armando (`{ ...x, inactiva: true }` deja `inactiva` al final) y
 *  `JSON.stringify` depende de ese orden. Comparar la de trabajo cruda con la guardada daba «hay cambios» para siempre: la barra
 *  «Descartar / Guardar plantillas» no se iba y nunca aparecía «Plantillas guardadas», aunque los cambios sí se habían guardado. */
export function hayPlantillasSinGuardar(
  lista: readonly PlantillaDocumento[],
  config: { plantillasDocumento?: PlantillaDocumento[] } | undefined,
): boolean {
  return JSON.stringify(normalizarPlantillas(lista)) !== JSON.stringify(normalizarPlantillas(plantillasDeClinica(config)));
}

/** Las que se ofrecen al crear un documento. */
export const plantillasActivas = (lista: readonly PlantillaDocumento[]): PlantillaDocumento[] => lista.filter((p) => !p.inactiva);

/* ═══ Datos del paciente ═══ */

export type Sexo = "M" | "F";

/** El sexo del paciente para decidir qué preguntas corresponden: el biológico, y si no está
 *  cargado, el género cuando es M o F. Sin dato, `undefined` (se muestran todas las preguntas). */
export function sexoDe(p: Pick<Patient, "sex" | "gender">): Sexo | undefined {
  if (p.sex === "M" || p.sex === "F") return p.sex;
  if (p.gender === "M" || p.gender === "F") return p.gender;
  return undefined;
}

/** Los campos de una sección que corresponden al paciente: las preguntas «solo mujeres» se
 *  ocultan únicamente si es hombre (sin dato de sexo se preguntan). */
export function camposVisibles(s: SeccionDocumento, sexo?: Sexo): CampoDocumento[] {
  return s.campos.filter((c) => !(c.soloMujeres && sexo === "M"));
}

/* ═══ Documentos ═══ */

export type Valores = Record<string, string | string[]>;

export interface DatosCuerpo {
  paciente: string;
  documento: string;
  fecha: string;
  profesional: string;
  clinica: string;
}

/** Reemplaza {paciente} {documento} {fecha} {profesional} {clinica}. Un dato que falta queda
 *  vacío; un {marcador} que no conocemos se deja como está (puede ser texto de la clínica). */
export function cuerpoConDatos(cuerpo: string, d: Partial<DatosCuerpo>): string {
  return cuerpo.replace(/\{(paciente|documento|fecha|profesional|clinica)\}/g, (_, k: keyof DatosCuerpo) => d[k] ?? "");
}

const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const textoDe = (v: string | string[] | undefined): string => (Array.isArray(v) ? v.join(", ") : (v ?? "").trim());

export const valorVacio = (v: string | string[] | undefined): boolean => textoDe(v) === "";

/** Saca los campos sin respuesta (texto vacío, casillas sin marcar). */
export function limpiarValores(v: Valores): Valores {
  const out: Valores = {};
  for (const [k, val] of Object.entries(v)) {
    if (Array.isArray(val)) {
      const marcadas = val.filter((x) => typeof x === "string" && x !== "");
      if (marcadas.length > 0) out[k] = marcadas;
    } else if (typeof val === "string" && val.trim() !== "") {
      out[k] = val;
    }
  }
  return out;
}

/** Un documento nuevo, pendiente, con su propia COPIA de la plantilla: editar la plantilla
 *  después no cambia lo que ya se hizo. Un texto trae el cuerpo con los datos ya puestos. */
export function nuevoDocumento(o: {
  id: string;
  clinicId: string;
  patientId: string;
  plantilla: PlantillaDocumento;
  dentistId?: string;
  by: { id: string; name: string };
  now: string;
  datos?: Partial<DatosCuerpo>;
}): DocumentoClinico {
  const p = o.plantilla;
  return {
    id: o.id,
    clinicId: o.clinicId,
    patientId: o.patientId,
    plantillaId: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    ...(p.tipo === "formulario"
      ? { secciones: copia(p.secciones ?? []), valores: {} }
      : { cuerpo: cuerpoConDatos(p.cuerpo ?? "", o.datos ?? {}) }),
    ...(o.dentistId ? { dentistId: o.dentistId } : {}),
    ...(p.porRevisar ? { porRevisar: true } : {}),
    estado: "pendiente",
    createdAt: o.now,
    createdBy: o.by.id,
    createdByName: o.by.name,
  };
}

interface Cambios {
  valores?: Valores;
  cuerpo?: string;
  now: string;
}

function conCambios(doc: DocumentoClinico, c: Cambios): DocumentoClinico {
  return {
    ...doc,
    ...(c.valores ? { valores: limpiarValores(c.valores) } : {}),
    ...(c.cuerpo !== undefined && doc.tipo === "texto" ? { cuerpo: c.cuerpo } : {}),
    updatedAt: c.now,
  };
}

/** Guarda lo escrito sin cambiar el estado (un borrador sigue pendiente; uno completado,
 *  completado). Un documento anulado no se toca. */
export function guardarCambios(doc: DocumentoClinico, c: Cambios): DocumentoClinico {
  return doc.estado === "anulado" ? doc : conCambios(doc, c);
}

/** «Continuar»: lo deja completado. Quién y cuándo se quedan con la PRIMERA vez; corregirlo
 *  después solo actualiza `updatedAt`. */
export function completarDocumento(doc: DocumentoClinico, c: Cambios & { by: { id: string; name: string } }): DocumentoClinico {
  if (doc.estado === "anulado") return doc;
  return {
    ...conCambios(doc, c),
    estado: "completado",
    completedAt: doc.completedAt ?? c.now,
    completedBy: doc.completedBy ?? c.by.name,
  };
}

/** Un documento clínico no se borra: se anula y queda en la ficha. Idempotente. */
export function anularDocumento(doc: DocumentoClinico, o: { now: string; by: string }): DocumentoClinico {
  return doc.estado === "anulado" ? doc : { ...doc, estado: "anulado", voidedAt: o.now, voidedBy: o.by };
}

/** Lo que se imprime o se manda por correo: solo lo respondido, por sección. Las preguntas que
 *  no corresponden al paciente no salen aunque tengan un valor viejo. */
export function respuestasParaImprimir(doc: DocumentoClinico, sexo?: Sexo): { titulo: string; filas: { etiqueta: string; valor: string }[] }[] {
  if (doc.tipo !== "formulario") return [];
  const out: { titulo: string; filas: { etiqueta: string; valor: string }[] }[] = [];
  for (const s of doc.secciones ?? []) {
    const filas = camposVisibles(s, sexo).flatMap((c) => {
      const valor = textoDe(doc.valores?.[c.id]);
      return valor ? [{ etiqueta: c.etiqueta, valor }] : [];
    });
    if (filas.length > 0) out.push({ titulo: s.titulo, filas });
  }
  return out;
}

/* ═══ Lista de la ficha y pendientes ═══ */

export interface ItemDocumento {
  id: string;
  /** «clinico» = documento nuevo (clinicalDocs); «formulario» = el formulario viejo de Patient.forms. */
  origen: "clinico" | "formulario";
  nombre: string;
  estado: EstadoDocumento;
  /** ISO o AAAA-MM-DD, para ordenar. Vacía en los formularios viejos pendientes (no tienen fecha). */
  fecha: string;
  doc?: DocumentoClinico;
  form?: PatientForm;
}

/** Los documentos del paciente: los nuevos y los formularios viejos que ya tenía, en una sola
 *  lista. Primero lo pendiente (es lo que hay que hacer) y después lo más reciente. */
export function documentosDelPaciente(p: Pick<Patient, "id" | "forms">, docs: readonly DocumentoClinico[], mostrarAnulados = false): ItemDocumento[] {
  const nuevos: ItemDocumento[] = docs
    .filter((d) => d.patientId === p.id && (mostrarAnulados || d.estado !== "anulado"))
    .map((d) => ({ id: d.id, origen: "clinico", nombre: d.nombre, estado: d.estado, fecha: d.completedAt ?? d.createdAt, doc: d }));
  const viejos: ItemDocumento[] = (p.forms ?? []).map((f) => ({
    id: f.id,
    origen: "formulario",
    nombre: f.templateName,
    estado: f.status === "pendiente" ? "pendiente" : "completado",
    fecha: f.completedAt ?? "",
    form: f,
  }));
  const peso = (i: ItemDocumento) => (i.estado === "pendiente" ? 0 : 1);
  return [...nuevos, ...viejos].sort((a, b) => peso(a) - peso(b) || b.fecha.localeCompare(a.fecha));
}

/** Cuántos documentos pendientes tiene cada paciente (documentos nuevos + formularios viejos).
 *  Solo los que tienen alguno. Es la ÚNICA fuente para contar pendientes: la campana, el
 *  inicio, el buscador y la cabecera de la ficha salen de acá. */
export function pendientesPorPaciente(patients: readonly Pick<Patient, "id" | "forms">[], docs: readonly DocumentoClinico[]): Map<string, number> {
  const out = new Map<string, number>();
  const ids = new Set(patients.map((p) => p.id));
  const sumar = (id: string) => out.set(id, (out.get(id) ?? 0) + 1);
  for (const p of patients) for (const f of p.forms ?? []) if (f.status === "pendiente") sumar(p.id);
  for (const d of docs) if (d.estado === "pendiente" && ids.has(d.patientId)) sumar(d.patientId);
  return out;
}

/** La Historia Clínica pendiente con la que arranca un paciente nuevo. `null` si la clínica
 *  no tiene (o desactivó) esa plantilla. */
export function historiaClinicaPendiente(o: {
  id: string;
  clinicId: string;
  patientId: string;
  plantillas: readonly PlantillaDocumento[];
  by: { id: string; name: string };
  now: string;
}): DocumentoClinico | null {
  const plantilla = plantillasActivas(o.plantillas).find((p) => p.id === "historia_clinica");
  return plantilla ? nuevoDocumento({ id: o.id, clinicId: o.clinicId, patientId: o.patientId, plantilla, by: o.by, now: o.now }) : null;
}

/** Las Historias Clínicas pendientes de varios pacientes recién cargados a la vez (la importación de pacientes). Cada
 *  una lleva el mismo id que le pone `crearPaciente` al alta de uno solo: repetir la carga no duplica el documento. */
export function historiasClinicasPendientes(
  pacientes: readonly Pick<Patient, "id" | "clinicId">[],
  o: { plantillas: readonly PlantillaDocumento[]; by: { id: string; name: string }; now: string },
): DocumentoClinico[] {
  return pacientes.flatMap((p) => historiaClinicaPendiente({ id: `cd_${p.id}_hc`, clinicId: p.clinicId, patientId: p.id, ...o }) ?? []);
}

/* ═══ Permisos y etiquetas ═══ */

/** Ver Documentos clínicos: quien gestiona formularios o puede leer la ficha. */
export const puedeVerDocumentos = (role: RolId): boolean => can(role, "engagement.forms") || can(role, "emr.read");

/** Crear, completar y anular: quien gestiona formularios o escribe la ficha. Tiene que coincidir
 *  con la regla `clinicalDocs` de firestore.rules (hay un test que lo ata a la matriz). */
export const puedeEditarDocumentos = (role: RolId): boolean => can(role, "engagement.forms") || can(role, "emr.write");

/** «#4351 — Extra», como el selector de plan de Dentalink. */
export const etiquetaPlan = (b: Pick<Budget, "id" | "name">): string => `#${b.id} — ${b.name?.trim() || "Plan de tratamiento"}`;

/* ═══ Correo ═══ */

/** El documento como HTML para mandarlo por correo. Todo lo que escribió una persona va escapado. */
export function documentoHtml(
  doc: DocumentoClinico,
  o: { clinica: string; paciente: string; fecha: string; profesional?: string; sexo?: Sexo },
): string {
  const contenido = doc.tipo === "texto"
    ? `<div style="white-space:pre-wrap">${escapeHtml(doc.cuerpo ?? "")}</div>`
    : respuestasParaImprimir(doc, o.sexo)
        .map((s) => `<h3 style="font-size:13px;margin:16px 0 6px;color:#0369C9;text-transform:uppercase">${escapeHtml(s.titulo)}</h3>`
          + `<table style="border-collapse:collapse;width:100%">${s.filas
            .map((f) => `<tr><td style="padding:3px 8px 3px 0;color:#666;vertical-align:top;width:45%">${escapeHtml(f.etiqueta)}</td><td style="padding:3px 0;vertical-align:top">${escapeHtml(f.valor)}</td></tr>`)
            .join("")}</table>`)
        .join("") || `<p style="color:#666">Sin respuestas registradas.</p>`;
  return `<div style="font-family:'Open Sans',Arial,sans-serif;font-size:14px;color:#333;max-width:640px">
<h2 style="font-size:16px;margin:0 0 4px">${escapeHtml(doc.nombre)}</h2>
<p style="margin:0 0 16px;color:#666">${escapeHtml(o.clinica)} · ${escapeHtml(o.fecha)}${o.profesional ? ` · ${escapeHtml(o.profesional)}` : ""}</p>
<p style="margin:0 0 12px">Hola ${escapeHtml(o.paciente)}: te enviamos el documento que completamos en la clínica.</p>
${doc.porRevisar ? `<p style="margin:0 0 12px;color:#B45309"><b>Borrador pendiente de revisión por un odontólogo.</b></p>` : ""}
${contenido}
</div>`;
}

/* ═══ Utilidades del editor de plantillas (Configuración) ═══ */

/** «Antecedentes Patológicos» → «antecedentes_patologicos». */
export function slug(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Un id derivado de `base` que no esté en `usados` (se le suma _2, _3…). Nunca vacío. */
export function idUnico(base: string, usados: Iterable<string>): string {
  const set = new Set(usados);
  const raiz = slug(base) || "item";
  if (!set.has(raiz)) return raiz;
  let n = 2;
  while (set.has(`${raiz}_${n}`)) n++;
  return `${raiz}_${n}`;
}

/** Intercambia el elemento `i` con su vecino (−1 arriba, +1 abajo). Fuera de rango, una copia igual. */
export function mover<T>(lista: readonly T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta;
  const out = [...lista];
  if (i < 0 || i >= out.length || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
