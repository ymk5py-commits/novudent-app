import type { FieldConfig, FieldContext, Patient } from "./types";

/* Campos del paciente por contexto (paridad Dentalink): la clínica decide qué datos
 * se piden y cuáles son obligatorios al crear un paciente desde «Nuevo paciente», al
 * agendar y en la reserva online. La matriz se guarda en clinic.config.patientFields;
 * lo que no está configurado toma POR_DEFECTO: los datos que pidió Novum en la
 * revisión del 27/9/2026 (obligatorios: nombre, apellido, CI, teléfono, fecha de
 * nacimiento, sexo y género; y el responsable si el paciente es menor de edad). */

export type CampoKey =
  | "nombreLegal" | "nombreSocial" | "apellidos" | "documento" | "email" | "convenio"
  | "numeroInterno" | "sexo" | "genero" | "fechaNacimiento" | "ciudad" | "municipio"
  | "direccion" | "telefonoFijo" | "telefonoMovil" | "actividad" | "empleador"
  | "observaciones" | "apoderado" | "referencia" | "dniRepLegal"
  | "barrio" | "parentesco" | "ruc" | "razonSocial" | "codigoReferido";

/** Secciones del formulario de alta. */
export type GrupoCampo = "principal" | "contacto" | "responsable" | "facturacion" | "otros";
export const GRUPOS: { key: GrupoCampo; label: string }[] = [
  { key: "principal", label: "Datos principales" },
  { key: "contacto", label: "Contacto y domicilio" },
  { key: "responsable", label: "Responsable (paciente menor de edad)" },
  { key: "facturacion", label: "Facturación y convenio" },
  { key: "otros", label: "Otros datos" },
];

export type TipoCampo = "texto" | "email" | "tel" | "fecha" | "sexo" | "genero" | "textoLargo";

type PropPaciente =
  | "firstName" | "socialName" | "lastName" | "document" | "email" | "insurer" | "internalNumber"
  | "sex" | "gender" | "birthDate" | "city" | "municipio" | "address" | "landline" | "phone"
  | "activity" | "employer" | "observaciones" | "guardian" | "referencia" | "legalRepDoc"
  | "barrio" | "parentesco" | "ruc" | "razonSocial" | "codigoReferido";

export interface Campo {
  key: CampoKey;
  label: string;
  /** Propiedad de `Patient` donde se guarda. */
  prop: PropPaciente;
  tipo: TipoCampo;
  /** Largo máximo aceptado (la reserva online lo aplica del lado del servidor). */
  max: number;
  grupo: GrupoCampo;
}

/** Los campos de la matriz: los 21 de Dentalink más los que pidió Novum (barrio,
 *  parentesco del responsable, RUC, razón social y código de referido), por sección. */
export const CAMPOS: Campo[] = [
  { key: "nombreLegal", label: "Nombre legal", prop: "firstName", tipo: "texto", max: 60, grupo: "principal" },
  { key: "nombreSocial", label: "Nombre social", prop: "socialName", tipo: "texto", max: 60, grupo: "principal" },
  { key: "apellidos", label: "Apellidos", prop: "lastName", tipo: "texto", max: 60, grupo: "principal" },
  { key: "documento", label: "Cédula / DNI", prop: "document", tipo: "texto", max: 20, grupo: "principal" },
  { key: "fechaNacimiento", label: "Fecha de nacimiento", prop: "birthDate", tipo: "fecha", max: 10, grupo: "principal" },
  { key: "sexo", label: "Sexo", prop: "sex", tipo: "sexo", max: 1, grupo: "principal" },
  { key: "genero", label: "Género", prop: "gender", tipo: "genero", max: 5, grupo: "principal" },
  { key: "telefonoMovil", label: "Teléfono móvil", prop: "phone", tipo: "tel", max: 25, grupo: "contacto" },
  { key: "telefonoFijo", label: "Teléfono fijo", prop: "landline", tipo: "tel", max: 25, grupo: "contacto" },
  { key: "email", label: "Email", prop: "email", tipo: "email", max: 120, grupo: "contacto" },
  { key: "ciudad", label: "Ciudad", prop: "city", tipo: "texto", max: 80, grupo: "contacto" },
  { key: "municipio", label: "Municipio / comuna", prop: "municipio", tipo: "texto", max: 80, grupo: "contacto" },
  { key: "barrio", label: "Barrio", prop: "barrio", tipo: "texto", max: 80, grupo: "contacto" },
  { key: "direccion", label: "Dirección", prop: "address", tipo: "texto", max: 160, grupo: "contacto" },
  { key: "apoderado", label: "Responsable", prop: "guardian", tipo: "texto", max: 80, grupo: "responsable" },
  { key: "dniRepLegal", label: "CI del responsable", prop: "legalRepDoc", tipo: "texto", max: 20, grupo: "responsable" },
  { key: "parentesco", label: "Qué es del paciente", prop: "parentesco", tipo: "texto", max: 40, grupo: "responsable" },
  { key: "ruc", label: "RUC", prop: "ruc", tipo: "texto", max: 20, grupo: "facturacion" },
  { key: "razonSocial", label: "Razón social", prop: "razonSocial", tipo: "texto", max: 120, grupo: "facturacion" },
  { key: "convenio", label: "Convenio", prop: "insurer", tipo: "texto", max: 80, grupo: "facturacion" },
  { key: "numeroInterno", label: "Número interno", prop: "internalNumber", tipo: "texto", max: 30, grupo: "otros" },
  { key: "actividad", label: "Actividad o profesión", prop: "activity", tipo: "texto", max: 80, grupo: "otros" },
  { key: "empleador", label: "Empleador", prop: "employer", tipo: "texto", max: 80, grupo: "otros" },
  { key: "referencia", label: "Referido por (de quién)", prop: "referencia", tipo: "texto", max: 80, grupo: "otros" },
  { key: "codigoReferido", label: "Código de referido", prop: "codigoReferido", tipo: "texto", max: 30, grupo: "otros" },
  { key: "observaciones", label: "Observaciones", prop: "observaciones", tipo: "textoLargo", max: 500, grupo: "otros" },
];

/** Contextos que usa la app. El check-in de Dentalink todavía no existe en Novudent:
 *  el tipo lo conserva (`FieldContext`) pero no se muestra ni se aplica. */
export const CONTEXTOS: { key: Exclude<FieldContext, "checkin">; label: string }[] = [
  { key: "nuevo", label: "Nuevo paciente" },
  { key: "agenda", label: "Al agendar" },
  { key: "online", label: "Agenda online" },
];

/** Siempre presentes y obligatorios en ese contexto: no se pueden apagar. */
const FIJOS: Record<FieldContext, CampoKey[]> = {
  nuevo: ["nombreLegal", "apellidos"],
  agenda: ["nombreLegal", "apellidos"],
  // La reserva busca al paciente por CI (para no duplicarlo) y confirma por WhatsApp.
  online: ["nombreLegal", "apellidos", "documento", "telefonoMovil"],
  checkin: ["nombreLegal", "apellidos"],
};

/** No se pueden pedir en ese contexto. */
const NO_APLICA: Partial<Record<FieldContext, CampoKey[]>> = {
  // Los carga la clínica, no el paciente que reserva desde la página pública.
  online: ["numeroInterno", "observaciones"],
};

const BASE: { presentes: CampoKey[]; requeridos: CampoKey[] } = {
  presentes: [
    "nombreLegal", "apellidos", "documento", "fechaNacimiento", "sexo", "genero",
    "telefonoMovil", "email", "ciudad", "barrio", "direccion",
    "apoderado", "dniRepLegal", "parentesco", "ruc", "razonSocial", "convenio",
    "actividad", "referencia", "codigoReferido",
  ],
  requeridos: ["nombreLegal", "apellidos", "documento", "fechaNacimiento", "sexo", "genero", "telefonoMovil"],
};
/** Lo que se pide si la clínica no configuró nada (revisión de Novum, 27/9/2026). */
const POR_DEFECTO: Record<FieldContext, { presentes: CampoKey[]; requeridos: CampoKey[] }> = {
  nuevo: BASE,
  agenda: BASE,
  online: { presentes: FIJOS.online, requeridos: FIJOS.online },
  checkin: BASE,
};

export interface CampoResuelto extends Campo {
  presente: boolean;
  requerido: boolean;
  /** No se puede apagar en este contexto. */
  fijo: boolean;
  /** No se puede prender en este contexto. */
  noAplica: boolean;
}

/** Todos los campos con su estado en un contexto, aplicando la configuración de la
 *  clínica sobre los valores por defecto. Un «no» explícito apaga un campo que por
 *  defecto estaba; requerido sin presente no cuenta. */
export function camposDe(config: Record<string, FieldConfig> | undefined, ctx: FieldContext): CampoResuelto[] {
  const def = POR_DEFECTO[ctx];
  return CAMPOS.map((c) => {
    const fijo = FIJOS[ctx].includes(c.key);
    const noAplica = !fijo && (NO_APLICA[ctx] ?? []).includes(c.key);
    const cfg = config?.[c.key];
    const presente = fijo || (!noAplica && (cfg?.present?.[ctx] ?? def.presentes.includes(c.key)));
    const requerido = fijo || (presente && (cfg?.required?.[ctx] ?? def.requeridos.includes(c.key)));
    return { ...c, presente, requerido, fijo, noAplica };
  });
}

/** Solo los campos que se muestran en el contexto. */
export function visibles(config: Record<string, FieldConfig> | undefined, ctx: FieldContext): CampoResuelto[] {
  return camposDe(config, ctx).filter((c) => c.presente);
}

export type ValoresCampos = Partial<Record<CampoKey, string>>;

/** Campos del responsable: obligatorios si el paciente es menor de edad. */
export const CAMPOS_RESPONSABLE: CampoKey[] = ["apoderado", "dniRepLegal", "parentesco"];

/** ¿La fecha de nacimiento cargada es de un menor de 18 años? */
export function esMenor(valores: ValoresCampos, hoy = Date.now()): boolean {
  const v = valores.fechaNacimiento ?? "";
  if (!fechaValida(v)) return false;
  const n = new Date(`${v}T00:00:00Z`); const h = new Date(hoy);
  let edad = h.getUTCFullYear() - n.getUTCFullYear();
  if (h.getUTCMonth() < n.getUTCMonth() || (h.getUTCMonth() === n.getUTCMonth() && h.getUTCDate() < n.getUTCDate())) edad--;
  return edad < 18;
}

/** Etiquetas de los campos requeridos que quedaron vacíos. Si el paciente es menor,
 *  el responsable es obligatorio aunque la clínica no lo haya marcado. */
export function faltantes(campos: CampoResuelto[], valores: ValoresCampos): string[] {
  const menor = esMenor(valores);
  return campos
    .filter((c) => (c.presente && c.requerido) || (menor && CAMPOS_RESPONSABLE.includes(c.key)))
    .filter((c) => !(valores[c.key] ?? "").trim())
    .map((c) => c.label);
}

const SEXOS = ["F", "M"];
const GENEROS = ["F", "M", "nd", "otro"];

/** Fecha de nacimiento válida: YYYY-MM-DD, real, no futura y de este siglo o el anterior. */
function fechaValida(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v && t <= Date.now() && v >= "1900-01-01";
}

/** Normaliza un valor según el tipo del campo. `undefined` = no se guarda. */
export function normalizar(campo: Campo, valor: string | undefined): string | undefined {
  const v = (valor ?? "").replace(/[<>\u0000-\u001f]/g, " ").trim().slice(0, campo.max);
  if (!v) return undefined;
  if (campo.tipo === "sexo") return SEXOS.includes(v) ? v : undefined;
  if (campo.tipo === "genero") return GENEROS.includes(v) ? v : undefined;
  if (campo.tipo === "fecha") return fechaValida(v) ? v : undefined;
  if (campo.tipo === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : undefined;
  return v;
}

/** Los valores cargados, pasados a las propiedades del paciente. Solo toma los campos
 *  presentes en el contexto y descarta vacíos y opciones inválidas. */
export function datosPaciente(campos: CampoResuelto[], valores: ValoresCampos): Partial<Patient> {
  const out: Record<string, string> = {};
  const menor = esMenor(valores);
  for (const c of campos) {
    if (!c.presente && !(menor && CAMPOS_RESPONSABLE.includes(c.key))) continue;
    const v = normalizar(c, valores[c.key]);
    if (v !== undefined) out[c.prop] = v;
  }
  return out as Partial<Patient>;
}

/** Lo que la página pública de reserva pide además de nombre, apellidos, CI y WhatsApp,
 *  que ya tiene sus propios campos. Solo datos públicos: clave, etiqueta, tipo y si es
 *  requerido. */
export function extrasOnline(config: Record<string, FieldConfig> | undefined): { key: CampoKey; label: string; tipo: TipoCampo; requerido: boolean }[] {
  return visibles(config, "online")
    .filter((c) => !c.fijo)
    .map((c) => ({ key: c.key, label: c.label, tipo: c.tipo, requerido: c.requerido }));
}

/** Paciente nuevo con los datos cargados y la anamnesis inicial pendiente, como el
 *  alta de siempre. `document` y `phone` quedan vacíos si la clínica no los pide. */
export function nuevoPaciente(datos: Partial<Patient>, clinicId: string, ahora = Date.now(), code?: number): Patient {
  return {
    ...datos,
    ...(code != null ? { code } : {}),
    id: `p_${ahora}`,
    clinicId,
    firstName: datos.firstName ?? "",
    lastName: datos.lastName ?? "",
    document: datos.document ?? "",
    phone: datos.phone ?? "",
    forms: [
      { id: `f_${ahora}`, templateName: "Anamnesis inicial", status: "pendiente", fields: [{ label: "Alergias", value: "" }, { label: "Medicación actual", value: "" }, { label: "Antecedentes", value: "" }] },
    ],
    historyUpdatePending: false,
    emr: [],
  };
}

/** Siguiente código interno correlativo de la clínica. */
export function siguienteCodigo(pacientes: Pick<Patient, "code">[]): number {
  return pacientes.reduce((max, p) => Math.max(max, p.code ?? 0), 0) + 1;
}

/** El número que lleva el id («p3», «p_1790529600178»): define el orden de alta. */
const numeroDe = (id: string) => Number(id.replace(/\D/g, "")) || 0;

/** Códigos para los pacientes que todavía no tienen (cargados antes de que existiera):
 *  en orden de alta (el id lleva la fecha) a continuación del mayor ya asignado. Es
 *  determinista, así dos pantallas abiertas a la vez asignan lo mismo. */
export function codigosFaltantes(pacientes: Pick<Patient, "id" | "code">[]): { id: string; code: number }[] {
  let siguiente = siguienteCodigo(pacientes);
  return pacientes
    .filter((p) => p.code == null)
    .sort((a, b) => numeroDe(a.id) - numeroDe(b.id) || a.id.localeCompare(b.id))
    .map((p) => ({ id: p.id, code: siguiente++ }));
}
