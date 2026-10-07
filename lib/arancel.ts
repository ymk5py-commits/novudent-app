/** Arancel de precios (Administración › Arancel de precios): buscar, ajustar precios en bloque y cargarlos desde una planilla.
 *  Todo es lógica pura: la pantalla solo muestra el resultado y guarda con las acciones de siempre del store. */
import type { Procedure, ProcedureCategory } from "./types";
import { CATEGORY_LABEL, procedureCategory } from "./categorias";

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
export const categoriaDe = (p: Procedure): ProcedureCategory => p.category ?? procedureCategory(p.cpt, []);

/* ───────────── Montos y códigos ───────────── */

const DECORACION_DE_MONEDA = /(guaran[ií]es?|gs\.?|pyg|us\$|usd|₲|\$)/gi;
const GRUPOS_DE_MILES = /^\d{1,3}(?:[.,]\d{3})+$/;

/** Lee un monto como lo escribe una persona o lo pega Excel: «1.500.000», «1,500,000», «Gs. 250.000», «12,50», «250 000».
 *  Un punto o coma seguido de exactamente tres dígitos es de miles («1.500» = 1500); en otro caso es decimal. `null` si no es un monto. */
export function parsearPrecio(texto: string): number | null {
  const t = texto.replace(DECORACION_DE_MONEDA, "").replace(/\s+/g, "");
  if (!/^\d[\d.,]*$/.test(t)) return null;

  const separadores = t.match(/[.,]/g) ?? [];
  if (separadores.length === 0) return Number(t);

  const ultimo = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  const cabeza = t.slice(0, ultimo);
  const cola = t.slice(ultimo + 1);
  const mezclados = cabeza.includes(".") && cabeza.includes(",");
  if (mezclados) return null;

  const tipoUltimo = t[ultimo];
  const otroTipo = tipoUltimo === "." ? "," : ".";
  let entero: string;
  let decimales = "";

  if (cabeza.includes(otroTipo)) {
    // «1.500.000,50»: el último separador es el decimal y el otro tipo agrupa los miles.
    if (cabeza.includes(tipoUltimo) || !GRUPOS_DE_MILES.test(cabeza)) return null;
    entero = cabeza.replaceAll(otroTipo, "");
    decimales = cola;
  } else if (cabeza.includes(tipoUltimo)) {
    // «1.500.000»: el mismo separador varias veces solo puede ser de miles.
    if (!GRUPOS_DE_MILES.test(t) || t.split(tipoUltimo).length < 3) return null;
    entero = t.replaceAll(tipoUltimo, "");
  } else if (cola.length === 3 && cabeza !== "0" && cabeza.length <= 3) {
    entero = cabeza + cola; // «1.500» → 1500
  } else {
    entero = cabeza;
    decimales = cola;
  }
  if (decimales === "") return Number(entero);
  return Math.round(Number(`${entero}.${decimales}`) * 100) / 100;
}

/** El porcentaje del ajuste en bloque: «10», «+7,5», «-5 %». Entre -90 y 500; fuera de eso es casi seguro un error de tipeo. */
export function parsearPorcentaje(texto: string): number | null {
  const t = texto.replace(/[%\s]/g, "").replace(/[−–]/g, "-").replace(",", ".");
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n >= -90 && n <= 500 ? n : null;
}

const FORMA_DE_CODIGO = /^[A-Z0-9][A-Z0-9._-]{0,19}$/;
/** El código del servicio es el id de su documento en la base: nada de barras ni espacios. `null` si no sirve. */
export function normalizarCodigo(texto: string): string | null {
  const c = texto.trim().toUpperCase();
  return FORMA_DE_CODIGO.test(c) ? c : null;
}

/* ───────────── Buscar ───────────── */

/** Búsqueda por código, descripción o categoría: sin importar mayúsculas ni tildes; todas las palabras tienen que aparecer. */
export function filtrarServicios(procs: Procedure[], busqueda: string, categoria: ProcedureCategory | "todas"): Procedure[] {
  const palabras = sinTildes(busqueda).split(/\s+/).filter(Boolean);
  return procs.filter((p) => {
    const cat = categoriaDe(p);
    if (categoria !== "todas" && cat !== categoria) return false;
    if (palabras.length === 0) return true;
    const pajar = sinTildes(`${p.cpt} ${p.description} ${CATEGORY_LABEL[cat]}`);
    return palabras.every((w) => pajar.includes(w));
  });
}

/* ───────────── Ajuste en bloque ───────────── */

/** Sube o baja un precio un porcentaje. `redondeo` es el múltiplo al que se lleva (0 = sin redondeo: la unidad de la moneda). */
export function ajustarPrecio(precio: number, porcentaje: number, redondeo: number, decimales = 0): number {
  const paso = redondeo > 0 ? redondeo : 1 / 10 ** decimales;
  const redondeado = Math.round((precio * (1 + porcentaje / 100)) / paso) * paso;
  return Math.max(0, Number(redondeado.toFixed(decimales)));
}

/** Lo que suman los precios de estos servicios (para mostrar el antes y el después de un ajuste). */
export function totalDelArancel(procs: Procedure[]): number {
  return Math.round(procs.reduce((suma, p) => suma + p.price, 0) * 100) / 100;
}

export type CambioDePrecio = { cpt: string; antes: number; despues: number };

/** Los precios que cambiarían, con el antes y el después. Es la vista previa y también lo que permite deshacer. */
export function planAjuste(procs: Procedure[], porcentaje: number, redondeo: number, decimales = 0): CambioDePrecio[] {
  return procs.flatMap((p) => {
    const despues = ajustarPrecio(p.price, porcentaje, redondeo, decimales);
    return despues === p.price ? [] : [{ cpt: p.cpt, antes: p.price, despues }];
  });
}

/** Los servicios del plan con su precio puesto en `despues` (aplicar) o en `antes` (deshacer): solo los que hay que guardar. */
export function aplicarCambios(procs: Procedure[], cambios: CambioDePrecio[], sentido: "despues" | "antes"): Procedure[] {
  const porCodigo = new Map(cambios.map((c) => [c.cpt, c]));
  return procs.flatMap((p) => {
    const c = porCodigo.get(p.cpt);
    return c ? [{ ...p, price: c[sentido] }] : [];
  });
}

/* ───────────── Cargar desde una planilla ───────────── */

export type FilaDeCarga =
  | { linea: number; estado: "nuevo"; cpt: string; description: string; price: number; category?: ProcedureCategory }
  | {
      linea: number; estado: "cambia"; cpt: string; description: string; price: number; category?: ProcedureCategory;
      antes: { description: string; price: number; category?: ProcedureCategory };
    }
  | { linea: number; estado: "igual"; cpt: string }
  | { linea: number; estado: "error"; texto: string; motivo: string };

export type AnalisisDeCarga = { filas: FilaDeCarga[]; nuevos: number; cambian: number; iguales: number; errores: number; truncado: boolean };

export const MAX_FILAS_DE_CARGA = 500;
const PRECIO_MAXIMO = 1_000_000_000_000;
const LARGO_MAXIMO_DESCRIPCION = 200;

type Columna = "codigo" | "descripcion" | "categoria" | "precio";
const NOMBRES_DE_COLUMNA: Record<Columna, string[]> = {
  codigo: ["codigo", "cod", "code", "cpt", "cdt"],
  descripcion: ["descripcion", "servicio", "prestacion", "nombre", "detalle", "tratamiento"],
  categoria: ["categoria", "tipo", "rubro"],
  precio: ["precio", "arancel", "valor", "monto", "costo", "importe", "tarifa"],
};
const COLUMNAS_SEGUN_CANTIDAD: Record<number, Columna[]> = {
  2: ["codigo", "precio"],
  3: ["codigo", "descripcion", "precio"],
  4: ["codigo", "descripcion", "categoria", "precio"],
};

/** Delimitador de una línea mirando solo fuera de comillas: tabulación (Excel) › punto y coma (CSV de acá) › coma. */
function delimitadorDe(linea: string): string | null {
  let dentro = false;
  let punto = false;
  let coma = false;
  for (const ch of linea) {
    if (ch === '"') dentro = !dentro;
    else if (!dentro) {
      if (ch === "\t") return "\t";
      if (ch === ";") punto = true;
      else if (ch === ",") coma = true;
    }
  }
  return punto ? ";" : coma ? "," : null;
}

function dividirLinea(linea: string): string[] {
  const delim = delimitadorDe(linea);
  if (!delim) return [linea.trim().replace(/^"(.*)"$/, "$1")];
  const campos: string[] = [];
  let actual = "";
  let dentro = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      if (dentro && linea[i + 1] === '"') { actual += '"'; i++; } else dentro = !dentro;
    } else if (ch === delim && !dentro) { campos.push(actual.trim()); actual = ""; }
    else actual += ch;
  }
  campos.push(actual.trim());
  return campos;
}

/** Si la línea es un encabezado («Código;Descripción;Precio»), en qué posición está cada columna. */
function leerEncabezado(campos: string[]): Partial<Record<Columna, number>> | null {
  const mapa: Partial<Record<Columna, number>> = {};
  let reconocidos = 0;
  campos.forEach((campo, i) => {
    const palabra = sinTildes(campo);
    for (const col of Object.keys(NOMBRES_DE_COLUMNA) as Columna[]) {
      if (NOMBRES_DE_COLUMNA[col].includes(palabra) && mapa[col] === undefined) { mapa[col] = i; reconocidos++; }
    }
  });
  return reconocidos >= 2 || (reconocidos > 0 && reconocidos === campos.length) ? mapa : null;
}

function categoriaDesdeTexto(texto: string): ProcedureCategory | null {
  const buscado = sinTildes(texto);
  for (const clave of Object.keys(CATEGORY_LABEL) as ProcedureCategory[]) {
    if (sinTildes(clave) === buscado || sinTildes(CATEGORY_LABEL[clave]) === buscado) return clave;
  }
  return null;
}

/** Lee filas pegadas desde Excel / Google Sheets (o un CSV) y dice, fila por fila, qué pasaría al aplicarlas.
 *  Columnas: código · descripción · [categoría] · precio. Con solo código y precio se actualizan precios de servicios que ya existen.
 *  Con un encabezado en la primera línea, las columnas pueden ir en cualquier orden. */
export function analizarCargaDePrecios(texto: string, existentes: Procedure[], decimales = 0): AnalisisDeCarga {
  const porCodigo = new Map(existentes.map((p) => [p.cpt, p]));
  const vistos = new Map<string, number>();
  const filas: FilaDeCarga[] = [];
  let truncado = false;
  let encabezado: Partial<Record<Columna, number>> | null = null;
  let primeraLinea = true;

  const lineas = texto.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  for (let i = 0; i < lineas.length; i++) {
    const linea = i + 1;
    const cruda = lineas[i];
    const campos = dividirLinea(cruda);
    if (campos.every((c) => c === "")) continue;

    if (primeraLinea) {
      primeraLinea = false;
      encabezado = leerEncabezado(campos);
      if (encabezado) {
        if (encabezado.codigo === undefined || encabezado.precio === undefined) {
          filas.push({ linea, estado: "error", texto: cruda, motivo: "El encabezado necesita al menos las columnas Código y Precio." });
          break;
        }
        continue;
      }
    }
    if (filas.length >= MAX_FILAS_DE_CARGA) { truncado = true; break; }

    const error = (motivo: string) => filas.push({ linea, estado: "error", texto: cruda, motivo });

    const dato = (col: Columna): string => {
      if (encabezado) return (campos[encabezado[col] ?? -1] ?? "").trim();
      const orden = COLUMNAS_SEGUN_CANTIDAD[campos.length];
      const pos = orden ? orden.indexOf(col) : -1;
      return pos >= 0 ? campos[pos].trim() : "";
    };
    if (!encabezado && !COLUMNAS_SEGUN_CANTIDAD[campos.length]) {
      error("Se esperan 2, 3 o 4 columnas: código, descripción, categoría y precio.");
      continue;
    }
    const sinDescripcion = encabezado ? encabezado.descripcion === undefined : campos.length === 2;

    const cptCrudo = dato("codigo");
    if (cptCrudo === "") { error("Falta el código."); continue; }
    const cpt = normalizarCodigo(cptCrudo);
    if (!cpt) { error(`Código inválido «${cptCrudo}»: usá letras, números, punto o guion (hasta 20).`); continue; }

    const precioCrudo = dato("precio");
    const leido = parsearPrecio(precioCrudo);
    if (leido === null) { error(`Precio inválido «${precioCrudo}».`); continue; }
    if (leido > PRECIO_MAXIMO) { error("El monto es demasiado grande."); continue; }
    const price = Number(leido.toFixed(decimales));

    const primeraVez = vistos.get(cpt);
    if (primeraVez !== undefined) { error(`Código repetido: ya está en la línea ${primeraVez}.`); continue; }

    const categoriaCruda = dato("categoria");
    let categoria: ProcedureCategory | undefined;
    if (categoriaCruda !== "") {
      const c = categoriaDesdeTexto(categoriaCruda);
      if (!c) { error(`La categoría «${categoriaCruda}» no existe. Usá: ${Object.values(CATEGORY_LABEL).join(", ")}.`); continue; }
      categoria = c;
    }

    const descripcion = dato("descripcion");
    if (descripcion.length > LARGO_MAXIMO_DESCRIPCION) { error(`La descripción es muy larga (máximo ${LARGO_MAXIMO_DESCRIPCION} letras).`); continue; }

    const actual = porCodigo.get(cpt);
    vistos.set(cpt, linea);

    if (!actual) {
      if (sinDescripcion) { error(`El código ${cpt} no existe: para crearlo agregá la descripción.`); continue; }
      if (descripcion === "") { error(`Falta la descripción del servicio nuevo ${cpt}.`); continue; }
      filas.push({ linea, estado: "nuevo", cpt, description: descripcion, price, ...(categoria ? { category: categoria } : {}) });
      continue;
    }

    const nuevaDescripcion = descripcion || actual.description;
    const nuevaCategoria = categoria ?? actual.category;
    const cambia = price !== actual.price || nuevaDescripcion !== actual.description || nuevaCategoria !== actual.category;
    if (!cambia) { filas.push({ linea, estado: "igual", cpt }); continue; }
    filas.push({
      linea, estado: "cambia", cpt, description: nuevaDescripcion, price, ...(nuevaCategoria ? { category: nuevaCategoria } : {}),
      antes: { description: actual.description, price: actual.price, ...(actual.category ? { category: actual.category } : {}) },
    });
  }

  const cuenta = (e: FilaDeCarga["estado"]) => filas.filter((f) => f.estado === e).length;
  return { filas, nuevos: cuenta("nuevo"), cambian: cuenta("cambia"), iguales: cuenta("igual"), errores: cuenta("error"), truncado };
}

/** Los servicios a guardar: los nuevos y los que cambian (con sus otros datos intactos). Sin los iguales ni los que tienen error. */
export function procedimientosDeLaCarga(analisis: AnalisisDeCarga, existentes: Procedure[]): Procedure[] {
  const porCodigo = new Map(existentes.map((p) => [p.cpt, p]));
  return analisis.filas.flatMap((f): Procedure[] => {
    if (f.estado === "nuevo") return [{ cpt: f.cpt, description: f.description, price: f.price, defaultDx: [], ...(f.category ? { category: f.category } : {}) }];
    if (f.estado === "cambia") {
      const actual = porCodigo.get(f.cpt);
      return actual ? [{ ...actual, description: f.description, price: f.price, ...(f.category ? { category: f.category } : {}) }] : [];
    }
    return [];
  });
}

/** El arancel como tabla para bajar a Excel: la misma que acepta la carga, así se puede editar afuera y volver. */
export function filasParaExportar(procs: Procedure[]): (string | number)[][] {
  return [
    ["Código", "Descripción", "Categoría", "Precio"],
    ...procs.map((p) => [p.cpt, p.description, CATEGORY_LABEL[categoriaDe(p)], p.price]),
  ];
}
