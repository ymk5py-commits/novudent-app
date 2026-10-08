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

/** El buscador de prestaciones del plan y de la cita: lo que coincide con lo escrito, en orden de relevancia y cortado en `max`,
 *  más cuántos coinciden en total (para avisar «mostrando 30 de 120»). Orden: código exacto › el código empieza con lo escrito ›
 *  el nombre empieza con lo escrito › el resto, en el orden del arancel. `excluir`: códigos que no se ofrecen (los que ya se eligieron). */
export function buscarPrestaciones(procs: Procedure[], busqueda: string, max: number, excluir?: ReadonlySet<string>): { visibles: Procedure[]; total: number } {
  const base = excluir && excluir.size > 0 ? procs.filter((p) => !excluir.has(p.cpt)) : procs;
  const coinciden = filtrarServicios(base, busqueda, "todas");
  const q = sinTildes(busqueda);
  const puntaje = (p: Procedure): number => {
    if (q === "") return 3;
    const codigo = p.cpt.toLowerCase();
    if (codigo === q) return 0;
    if (codigo.startsWith(q)) return 1;
    return sinTildes(p.description).startsWith(q) ? 2 : 3;
  };
  const ordenadas = coinciden.map((p, i) => ({ p, i, n: puntaje(p) })).sort((a, b) => a.n - b.n || a.i - b.i).map((x) => x.p);
  return { visibles: ordenadas.slice(0, max), total: coinciden.length };
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

/** `porNombre`: la fila no traía código y se buscó el servicio por su nombre (o se le dio un código automático, si es nuevo). */
export type FilaDeCarga =
  | { linea: number; estado: "nuevo"; cpt: string; description: string; price: number; category?: ProcedureCategory; porNombre?: true }
  | {
      linea: number; estado: "cambia"; cpt: string; description: string; price: number; category?: ProcedureCategory;
      antes: { description: string; price: number; category?: ProcedureCategory }; porNombre?: true;
    }
  | { linea: number; estado: "igual"; cpt: string; description?: string; porNombre?: true }
  | { linea: number; estado: "error"; texto: string; motivo: string };

export type AnalisisDeCarga = {
  filas: FilaDeCarga[]; nuevos: number; cambian: number; iguales: number; errores: number; truncado: boolean;
  /** La línea (o la fila de la hoja) del encabezado; `null` si no tiene. */
  lineaDelEncabezado: number | null;
  /** Filas con algo escrito arriba del encabezado (un título, el nombre de la clínica…): se saltean. */
  filasAntesDelEncabezado: number;
};

/** Una fila de la planilla: su número (la línea del texto pegado o la fila de la hoja de Excel) y sus celdas como texto.
 *  `texto` es la línea tal como vino, para mostrarla si tiene un error (sin él se muestran las celdas separadas por «|»). */
export type FilaDeEntrada = { linea: number; campos: string[]; texto?: string };

export const MAX_FILAS_DE_CARGA = 3000;
const PRECIO_MAXIMO = 1_000_000_000_000;
const LARGO_MAXIMO_DESCRIPCION = 200;
/** El encabezado se busca en las primeras filas con algo escrito: arriba suele haber un título. */
const FILAS_PARA_BUSCAR_ENCABEZADO = 10;

type Columna = "codigo" | "descripcion" | "categoria" | "precio";
/** Cómo se puede llamar cada columna, del nombre más claro al menos claro: si dos columnas dicen ser el precio («Costo» y
 *  «Precio»), gana la de nombre más claro. Vale el nombre entero o su primera palabra («Precio (Gs.)», «Código CDT»). */
const NOMBRES_DE_COLUMNA: Record<Columna, string[]> = {
  codigo: ["codigo", "cod", "cdt", "cpt", "code"],
  descripcion: ["descripcion", "prestacion", "servicio", "procedimiento", "tratamiento", "nombre", "detalle", "item"],
  categoria: ["categoria", "tipo", "rubro"],
  precio: ["precio", "arancel", "valor", "importe", "tarifa", "monto", "costo"],
};
const COLUMNAS_SEGUN_CANTIDAD: Record<number, Columna[]> = {
  2: ["codigo", "precio"],
  3: ["codigo", "descripcion", "precio"],
  4: ["codigo", "descripcion", "categoria", "precio"],
};

/** Para comparar nombres de servicios y de columnas: sin tildes, mayúsculas ni signos («Resina — 1 sup.» = «resina 1 sup»). */
const claveDeNombre = (s: string) => sinTildes(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Los espacios de más (y los saltos de línea dentro de una celda de Excel) quedan como un espacio. */
const espaciosSimples = (s: string) => s.replace(/\s+/g, " ").trim();

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

/** Si la fila es un encabezado («Código;Descripción;Precio», «Prestación | Precio (Gs.)»), en qué posición está cada columna.
 *  Hacen falta al menos dos celdas reconocidas: un título de una celda («Precio de lista 2026») no es un encabezado. */
function leerEncabezado(campos: string[]): Partial<Record<Columna, number>> | null {
  const mejor: Partial<Record<Columna, { pos: number; puntaje: number }>> = {};
  let reconocidos = 0;
  campos.forEach((campo, pos) => {
    const nombre = claveDeNombre(campo);
    if (!nombre) return;
    const primera = nombre.split(" ")[0];
    for (const col of Object.keys(NOMBRES_DE_COLUMNA) as Columna[]) {
      const exacto = NOMBRES_DE_COLUMNA[col].indexOf(nombre);
      const porPrimera = NOMBRES_DE_COLUMNA[col].indexOf(primera);
      // El nombre entero gana sobre la primera palabra; entre iguales, el nombre más claro y después la columna de más a la izquierda.
      const puntaje = exacto >= 0 ? exacto : porPrimera >= 0 ? 100 + porPrimera : -1;
      if (puntaje < 0) continue;
      reconocidos++;
      const actual = mejor[col];
      if (!actual || puntaje < actual.puntaje) mejor[col] = { pos, puntaje };
      break;
    }
  });
  if (reconocidos < 2) return null;
  const mapa: Partial<Record<Columna, number>> = {};
  for (const col of Object.keys(mejor) as Columna[]) mapa[col] = mejor[col]?.pos;
  return mapa;
}

/** Una fila que ya trae datos (dos celdas o más y alguna es un monto): de ahí para abajo no se busca más el encabezado. */
const pareceDatos = (campos: string[]) => campos.filter((c) => c.trim() !== "").length >= 2 && campos.some((c) => parsearPrecio(c) !== null);

/** Sin encabezado y con dos columnas, la primera es un nombre (no un código) si tiene espacios, más de 20 letras o ningún número;
 *  un código que ya existe en el arancel sigue siendo un código aunque no tenga números («ORTO»). */
function primeraEsNombre(texto: string, porCodigo: Map<string, Procedure>): boolean {
  const t = texto.trim();
  if (t === "") return false;
  const comoCodigo = normalizarCodigo(t);
  if (comoCodigo && porCodigo.has(comoCodigo)) return false;
  return /\s/.test(t) || t.length > 20 || !/\d/.test(t);
}

function textoDeLaFila(fila: FilaDeEntrada): string {
  if (fila.texto !== undefined) return fila.texto;
  const campos = [...fila.campos];
  while (campos.length > 0 && campos[campos.length - 1].trim() === "") campos.pop();
  return campos.join(" | ");
}

/** Las líneas del texto pegado (o de un CSV), cada una con su número y sus campos. */
function filasDeTexto(texto: string): FilaDeEntrada[] {
  return texto.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/).map((cruda, i) => ({ linea: i + 1, campos: dividirLinea(cruda), texto: cruda }));
}

function categoriaDesdeTexto(texto: string): ProcedureCategory | null {
  const buscado = sinTildes(texto);
  for (const clave of Object.keys(CATEGORY_LABEL) as ProcedureCategory[]) {
    if (sinTildes(clave) === buscado || sinTildes(CATEGORY_LABEL[clave]) === buscado) return clave;
  }
  return null;
}

/** Lee filas pegadas desde Excel / Google Sheets (o un CSV) y dice, fila por fila, qué pasaría al aplicarlas.
 *  Es `analizarCargaDeFilas` sobre las líneas del texto (cada línea, partida en sus campos). */
export function analizarCargaDePrecios(texto: string, existentes: Procedure[], decimales = 0): AnalisisDeCarga {
  return analizarCargaDeFilas(filasDeTexto(texto), existentes, decimales);
}

/** El análisis de una carga, igual para el texto pegado y para las filas de un archivo de Excel: dice, fila por fila, qué pasaría al
 *  aplicarla (nuevo, cambia, sin cambios o error). Nada se guarda acá.
 *
 *  - Columnas: código · descripción · [categoría] · precio. Con solo código y precio se actualizan precios de servicios que ya existen.
 *  - Con encabezado, las columnas pueden ir en cualquier orden, y el encabezado puede tener un título arriba (se busca en las primeras
 *    filas). **Sin columna de código** («Prestación | Precio») cada fila se busca por su nombre (sin tildes, mayúsculas ni signos): si
 *    el servicio existe se le cambia el precio y si no, se crea con un código automático `S0001`, `S0002`… que no choca con ninguno.
 *  - Sin encabezado y con dos columnas, la primera es un nombre si tiene espacios, más de 20 letras o ningún número (`primeraEsNombre`).
 *  - Un código o un nombre repetido en la planilla es un error de esa fila. Se leen hasta `MAX_FILAS_DE_CARGA` filas. */
export function analizarCargaDeFilas(entrada: FilaDeEntrada[], existentes: Procedure[], decimales = 0): AnalisisDeCarga {
  const porCodigo = new Map(existentes.map((p) => [p.cpt, p]));
  const porNombre = new Map<string, Procedure[]>();
  for (const p of existentes) {
    const k = claveDeNombre(p.description);
    if (k) porNombre.set(k, [...(porNombre.get(k) ?? []), p]);
  }
  const filas: FilaDeCarga[] = [];
  const conDatos = entrada.filter((f) => f.campos.some((c) => c.trim() !== ""));

  // El encabezado se busca en las primeras filas, hasta la primera que ya trae datos.
  let encabezado: Partial<Record<Columna, number>> | null = null;
  let desde = 0;
  for (let i = 0; i < Math.min(conDatos.length, FILAS_PARA_BUSCAR_ENCABEZADO); i++) {
    const e = leerEncabezado(conDatos[i].campos);
    if (e) { encabezado = e; desde = i + 1; break; }
    if (pareceDatos(conDatos[i].campos)) break;
  }
  let truncado = false;
  const resumen = (): AnalisisDeCarga => {
    const cuenta = (e: FilaDeCarga["estado"]) => filas.filter((f) => f.estado === e).length;
    return {
      filas, nuevos: cuenta("nuevo"), cambian: cuenta("cambia"), iguales: cuenta("igual"), errores: cuenta("error"), truncado,
      lineaDelEncabezado: encabezado ? conDatos[desde - 1].linea : null,
      filasAntesDelEncabezado: encabezado ? desde - 1 : 0,
    };
  };

  if (encabezado) {
    const fila = conDatos[desde - 1];
    const falta = encabezado.precio === undefined
      ? "El encabezado necesita la columna Precio."
      : encabezado.codigo === undefined && encabezado.descripcion === undefined
        ? "El encabezado necesita la columna Código o la del nombre de la prestación (Prestación, Descripción…)."
        : null;
    if (falta) {
      filas.push({ linea: fila.linea, estado: "error", texto: textoDeLaFila(fila), motivo: falta });
      return resumen();
    }
  }

  const datos = conDatos.slice(desde);
  // Los códigos automáticos no usan uno que ya existe ni uno que el mismo archivo trae (sin encabezado se pueden mezclar códigos y nombres).
  const usados = new Set(porCodigo.keys());
  if (!encabezado) for (const f of datos) { const c = normalizarCodigo(f.campos[0] ?? ""); if (c) usados.add(c); }
  let siguiente = 1;
  const codigoAutomatico = () => {
    let c: string;
    do c = `S${String(siguiente++).padStart(4, "0")}`; while (usados.has(c));
    usados.add(c);
    return c;
  };
  const lineaDelCodigo = new Map<string, number>();
  const lineaDelNombre = new Map<string, number>();

  for (const fila of datos) {
    if (filas.length >= MAX_FILAS_DE_CARGA) { truncado = true; break; }
    const { linea } = fila;
    const error = (motivo: string) => { filas.push({ linea, estado: "error", texto: textoDeLaFila(fila), motivo }); };

    let campos = fila.campos;
    if (!encabezado) {
      // Las celdas vacías del final no cuentan como columnas (el CSV que guarda Excel con columnas sobrantes, o la fila de una hoja).
      campos = [...campos];
      while (campos.length > 0 && campos[campos.length - 1].trim() === "") campos.pop();
      if (!COLUMNAS_SEGUN_CANTIDAD[campos.length]) {
        error("Se esperan 2, 3 o 4 columnas: código, descripción, categoría y precio (o solo el nombre y el precio).");
        continue;
      }
    }
    const dato = (col: Columna): string => {
      if (encabezado) return (campos[encabezado[col] ?? -1] ?? "").trim();
      const pos = COLUMNAS_SEGUN_CANTIDAD[campos.length].indexOf(col);
      return pos >= 0 ? campos[pos].trim() : "";
    };

    const precioCrudo = dato("precio");
    const leido = precioCrudo === "" ? null : parsearPrecio(precioCrudo);
    const errorDePrecio = precioCrudo === "" ? "Falta el precio."
      : leido === null ? `Precio inválido «${precioCrudo}».`
        : leido > PRECIO_MAXIMO ? "El monto es demasiado grande." : null;
    const price = leido === null ? 0 : Number(leido.toFixed(decimales));

    const categoriaCruda = dato("categoria");
    const categoria = categoriaCruda === "" ? undefined : categoriaDesdeTexto(categoriaCruda);
    const errorDeCategoria = categoria === null ? `La categoría «${categoriaCruda}» no existe. Usá: ${Object.values(CATEGORY_LABEL).join(", ")}.` : null;
    const conCategoria = (c: ProcedureCategory | null | undefined) => (c ? { category: c } : {});

    /* ── Sin código: se busca el servicio por su nombre ── */
    const sinCodigo = encabezado ? encabezado.codigo === undefined : campos.length === 2 && primeraEsNombre(campos[0], porCodigo);
    if (sinCodigo) {
      const nombre = espaciosSimples(encabezado ? dato("descripcion") : campos[0]);
      const clave = claveDeNombre(nombre);
      if (clave === "") { error("Falta el nombre de la prestación."); continue; }
      if (nombre.length > LARGO_MAXIMO_DESCRIPCION) { error(`El nombre es muy largo (máximo ${LARGO_MAXIMO_DESCRIPCION} letras).`); continue; }
      if (errorDePrecio) { error(errorDePrecio); continue; }
      const repetido = lineaDelNombre.get(clave);
      if (repetido !== undefined) { error(`Nombre repetido: ya está en la línea ${repetido}.`); continue; }
      if (errorDeCategoria) { error(errorDeCategoria); continue; }
      lineaDelNombre.set(clave, linea);

      const candidatos = porNombre.get(clave) ?? [];
      if (candidatos.length > 1) {
        error(`Hay ${candidatos.length} servicios llamados «${nombre}» en el arancel (${candidatos.map((p) => p.cpt).join(", ")}): para elegir cuál, cargalo con su código.`);
        continue;
      }
      const actual = candidatos[0];
      if (!actual) {
        const cpt = codigoAutomatico();
        lineaDelCodigo.set(cpt, linea);
        filas.push({ linea, estado: "nuevo", cpt, description: nombre, price, ...conCategoria(categoria), porNombre: true });
        continue;
      }
      const otra = lineaDelCodigo.get(actual.cpt);
      if (otra !== undefined) { error(`«${actual.description}» (${actual.cpt}) ya está en la línea ${otra}.`); continue; }
      lineaDelCodigo.set(actual.cpt, linea);
      // El nombre guardado no se toca: el de la planilla puede venir sin tildes o con otros signos.
      const nuevaCategoria = categoria ?? actual.category;
      if (price === actual.price && nuevaCategoria === actual.category) {
        filas.push({ linea, estado: "igual", cpt: actual.cpt, description: actual.description, porNombre: true });
        continue;
      }
      filas.push({
        linea, estado: "cambia", cpt: actual.cpt, description: actual.description, price, ...conCategoria(nuevaCategoria), porNombre: true,
        antes: { description: actual.description, price: actual.price, ...conCategoria(actual.category) },
      });
      continue;
    }

    /* ── Con código ── */
    const sinDescripcion = encabezado ? encabezado.descripcion === undefined : campos.length === 2;
    const cptCrudo = dato("codigo");
    if (cptCrudo === "") { error("Falta el código."); continue; }
    const cpt = normalizarCodigo(cptCrudo);
    if (!cpt) { error(`Código inválido «${cptCrudo}»: usá letras, números, punto o guion (hasta 20).`); continue; }
    if (errorDePrecio) { error(errorDePrecio); continue; }
    const primeraVez = lineaDelCodigo.get(cpt);
    if (primeraVez !== undefined) { error(`Código repetido: ya está en la línea ${primeraVez}.`); continue; }
    if (errorDeCategoria) { error(errorDeCategoria); continue; }

    const descripcion = espaciosSimples(dato("descripcion"));
    if (descripcion.length > LARGO_MAXIMO_DESCRIPCION) { error(`La descripción es muy larga (máximo ${LARGO_MAXIMO_DESCRIPCION} letras).`); continue; }

    const actual = porCodigo.get(cpt);
    lineaDelCodigo.set(cpt, linea);
    // Si más abajo una fila sin código trae este mismo nombre, es el mismo servicio: se marca como repetido.
    const claveDescripcion = claveDeNombre(descripcion || actual?.description || "");
    if (claveDescripcion && !lineaDelNombre.has(claveDescripcion)) lineaDelNombre.set(claveDescripcion, linea);

    if (!actual) {
      if (sinDescripcion) { error(`El código ${cpt} no existe: para crearlo agregá la descripción.`); continue; }
      if (descripcion === "") { error(`Falta la descripción del servicio nuevo ${cpt}.`); continue; }
      filas.push({ linea, estado: "nuevo", cpt, description: descripcion, price, ...conCategoria(categoria) });
      continue;
    }

    const nuevaDescripcion = descripcion || actual.description;
    const nuevaCategoria = categoria ?? actual.category;
    const cambia = price !== actual.price || nuevaDescripcion !== actual.description || nuevaCategoria !== actual.category;
    if (!cambia) { filas.push({ linea, estado: "igual", cpt }); continue; }
    filas.push({
      linea, estado: "cambia", cpt, description: nuevaDescripcion, price, ...conCategoria(nuevaCategoria),
      antes: { description: actual.description, price: actual.price, ...conCategoria(actual.category) },
    });
  }

  return resumen();
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
