/** Bancos y entidades financieras (Administración): la lista de la clínica con la que se anotan los cheques y, más adelante, los
 *  cobros con tarjeta. Es un dato de la clínica (`config.entidadesFinancieras`), no un catálogo cerrado: cada una agrega o saca las suyas.
 *  Lógica pura; la pantalla (`components/BancosEntidades.tsx`) solo la muestra. */

export type TipoDeEntidad = "banco" | "financiera" | "cooperativa" | "tarjeta";

export interface EntidadFinanciera {
  id: string;
  name: string;
  type: TipoDeEntidad;
  /** Desactivada = no se ofrece al anotar un cheque, pero queda en la lista (los pagos viejos conservan su banco escrito). */
  active: boolean;
}

export const TIPO_DE_ENTIDAD_LABEL: Record<TipoDeEntidad, string> = {
  banco: "Bancos", financiera: "Financieras", cooperativa: "Cooperativas", tarjeta: "Tarjetas",
};
export const TIPO_DE_ENTIDAD_SINGULAR: Record<TipoDeEntidad, string> = {
  banco: "Banco", financiera: "Financiera", cooperativa: "Cooperativa", tarjeta: "Tarjeta",
};
const ORDEN_DE_TIPOS: TipoDeEntidad[] = ["banco", "financiera", "cooperativa", "tarjeta"];

export const MAX_ENTIDADES = 100;

type Resultado = { ok: true; lista: EntidadFinanciera[] } | { ok: false; error: string };

/** Para comparar nombres sin importar mayúsculas, tildes ni espacios de más. */
const clave = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** El nombre ya limpio (sin espacios de más), o `null` si no sirve: entre 2 y 60 letras. */
export function nombreValido(texto: string): string | null {
  const nombre = texto.replace(/\s+/g, " ").trim();
  return nombre.length >= 2 && nombre.length <= 60 ? nombre : null;
}

const ERROR_NOMBRE = "Escribí el nombre de la entidad (entre 2 y 60 letras).";

export function agregarEntidad(lista: EntidadFinanciera[], datos: { name: string; type: TipoDeEntidad }, id: string): Resultado {
  const name = nombreValido(datos.name);
  if (!name) return { ok: false, error: ERROR_NOMBRE };
  if (lista.length >= MAX_ENTIDADES) return { ok: false, error: `Máximo ${MAX_ENTIDADES} entidades: sacá alguna que no uses antes de agregar otra.` };
  if (lista.some((e) => clave(e.name) === clave(name))) return { ok: false, error: `«${name}» ya está en la lista.` };
  return { ok: true, lista: [...lista, { id, name, type: datos.type, active: true }] };
}

export function renombrarEntidad(lista: EntidadFinanciera[], id: string, nuevoNombre: string): Resultado {
  const name = nombreValido(nuevoNombre);
  if (!name) return { ok: false, error: ERROR_NOMBRE };
  if (!lista.some((e) => e.id === id)) return { ok: false, error: "Esa entidad ya no está en la lista." };
  if (lista.some((e) => e.id !== id && clave(e.name) === clave(name))) return { ok: false, error: `«${name}» ya está en la lista.` };
  return { ok: true, lista: lista.map((e) => (e.id === id ? { ...e, name } : e)) };
}

export const alternarActiva = (lista: EntidadFinanciera[], id: string): EntidadFinanciera[] =>
  lista.map((e) => (e.id === id ? { ...e, active: !e.active } : e));

export const quitarEntidad = (lista: EntidadFinanciera[], id: string): EntidadFinanciera[] => lista.filter((e) => e.id !== id);

/** Los nombres que se ofrecen al anotar un cheque: bancos, financieras y cooperativas activas, sin repetir y en orden alfabético. */
export function sugerenciasDeBancos(lista: EntidadFinanciera[] | undefined): string[] {
  const vistos = new Set<string>();
  const nombres: string[] = [];
  for (const e of lista ?? []) {
    if (!e.active || e.type === "tarjeta" || vistos.has(clave(e.name))) continue;
    vistos.add(clave(e.name));
    nombres.push(e.name);
  }
  return nombres.sort((a, b) => a.localeCompare(b, "es"));
}

/** Lista orientativa de entidades de uso corriente en Paraguay, para no arrancar de cero. La clínica la revisa y saca lo que no use. */
export const ENTIDADES_SUGERIDAS_PY: { name: string; type: TipoDeEntidad }[] = [
  { name: "Banco Itaú", type: "banco" },
  { name: "Banco Continental", type: "banco" },
  { name: "Banco Familiar", type: "banco" },
  { name: "Banco Basa", type: "banco" },
  { name: "Banco GNB", type: "banco" },
  { name: "Banco Atlas", type: "banco" },
  { name: "Banco Regional", type: "banco" },
  { name: "Visión Banco", type: "banco" },
  { name: "Sudameris Bank", type: "banco" },
  { name: "Banco Nacional de Fomento (BNF)", type: "banco" },
  { name: "Bancop", type: "banco" },
  { name: "Banco do Brasil", type: "banco" },
  { name: "Citibank", type: "banco" },
  { name: "Ueno Bank", type: "banco" },
  { name: "Interfisa", type: "banco" },
  { name: "Financiera Paraguayo Japonesa", type: "financiera" },
  { name: "Financiera El Comercio", type: "financiera" },
  { name: "Crisol y Encarnación Financiera", type: "financiera" },
  { name: "Cooperativa Universitaria", type: "cooperativa" },
  { name: "Cooperativa Medalla Milagrosa", type: "cooperativa" },
  { name: "Cooperativa Coomecipar", type: "cooperativa" },
  { name: "Cooperativa Capiatá", type: "cooperativa" },
  { name: "Cooperativa Lambaré", type: "cooperativa" },
  { name: "Visa", type: "tarjeta" },
  { name: "Mastercard", type: "tarjeta" },
  { name: "Cabal", type: "tarjeta" },
  { name: "Panal", type: "tarjeta" },
  { name: "American Express", type: "tarjeta" },
];

/** Suma las sugeridas que todavía no están (por nombre, sin importar mayúsculas ni tildes), hasta el tope. */
export function agregarSugeridas(lista: EntidadFinanciera[], nuevoId: (indice: number) => string): { lista: EntidadFinanciera[]; agregadas: number } {
  const presentes = new Set(lista.map((e) => clave(e.name)));
  const nuevas: EntidadFinanciera[] = [];
  for (const s of ENTIDADES_SUGERIDAS_PY) {
    if (lista.length + nuevas.length >= MAX_ENTIDADES) break;
    if (presentes.has(clave(s.name))) continue;
    nuevas.push({ id: nuevoId(nuevas.length), name: s.name, type: s.type, active: true });
  }
  return { lista: nuevas.length ? [...lista, ...nuevas] : lista, agregadas: nuevas.length };
}

/** La lista agrupada por tipo (bancos, financieras, cooperativas, tarjetas), cada grupo por nombre; sin grupos vacíos. */
export function agruparPorTipo(lista: EntidadFinanciera[] | undefined): { tipo: TipoDeEntidad; entidades: EntidadFinanciera[] }[] {
  return ORDEN_DE_TIPOS
    .map((tipo) => ({ tipo, entidades: (lista ?? []).filter((e) => e.type === tipo).sort((a, b) => a.name.localeCompare(b.name, "es")) }))
    .filter((g) => g.entidades.length > 0);
}
