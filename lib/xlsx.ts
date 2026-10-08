/** Leer la planilla que elige la clínica (Configuración › Arancel de precios › Cargar desde Excel), todo en el navegador.
 *
 *  Un .xlsx es un zip de XML: `_rels/.rels` dice dónde está el libro (casi siempre `xl/workbook.xml`), el libro lista las hojas con
 *  su estado (las ocultas no se ofrecen) y sus relaciones (`xl/_rels/workbook.xml.rels`) dicen qué archivo es cada hoja y dónde está
 *  la tabla de cadenas compartidas. Una hoja guarda solo las celdas que tienen algo (`<c r="B7" t="s"><v>3</v></c>`): la columna
 *  sale de la referencia, no de la posición. El texto puede venir en la tabla de cadenas (Excel), «en línea» (openpyxl y otros) o
 *  con formato mixto (pedazos `<r><t>`; la guía fonética `<rPh>` no es texto). Los números salen como texto plano, sin exponente.
 *
 *  Defensas: el archivo, hasta 8 MB; del zip se descomprime solo lo necesario y se corta ANTES de inflar si lo que se va a leer
 *  declara pesar, entre todo, más de 64 MB (un zip bomb no llega a reservar memoria). Si el zip miente y una parte es más grande de
 *  lo que declara, fflate no escribe más allá de lo declarado: el XML queda cortado y se rechaza como dañado. Hasta 20.000 filas.
 *  `fflate` se carga con `import()` recién cuando alguien elige un archivo: no pesa en la pantalla. */

export const MAX_BYTES_DEL_ARCHIVO = 8 * 1024 * 1024;
export const MAX_FILAS_DEL_ARCHIVO = 20_000;
/** Lo que pueden pesar descomprimidas, entre todas, las partes que se leen (el libro, las cadenas y las hojas visibles). */
const MAX_DESCOMPRIMIDO = 64 * 1024 * 1024;
/** Celdas entre todas las hojas, contando las vacías del medio: datos en columnas lejanísimas no llenan la memoria. */
const MAX_CELDAS = 2_000_000;
/** XFD, la última columna de Excel. */
const ULTIMA_COLUMNA = 16_383;

/** Una fila con algo escrito: su número en la hoja y sus celdas como texto, desde la primera columna con datos de la hoja hasta la
 *  última con datos de esta fila (las vacías del medio quedan como ""). */
export type FilaDeHoja = { numero: number; celdas: string[] };
export type HojaDeCalculo = { nombre: string; filas: FilaDeHoja[] };
/** Las hojas visibles del libro, en su orden (también las vacías). */
export type LibroDeCalculo = { hojas: HojaDeCalculo[] };

export type MotivoDeRechazo = "xls-viejo" | "contrasena" | "no-es-xlsx" | "demasiado-grande" | "danado";

/** Un archivo que no se puede leer, con el motivo y el mensaje para la persona (en voseo, con qué hacer). */
export class ArchivoNoLegible extends Error {
  readonly motivo: MotivoDeRechazo;
  constructor(motivo: MotivoDeRechazo, mensaje: string) {
    super(mensaje);
    this.name = "ArchivoNoLegible";
    this.motivo = motivo;
  }
}

const rechazo = {
  xlsViejo: () => new ArchivoNoLegible("xls-viejo", "Es un archivo de Excel viejo (.xls), que no se puede leer. Guardalo como Excel (.xlsx) o CSV y volvé a elegirlo."),
  contrasena: () => new ArchivoNoLegible("contrasena", "El archivo está protegido con contraseña. Abrilo en Excel, sacale la contraseña (Archivo › Información › Proteger libro) y volvé a elegirlo."),
  noEsXlsx: () => new ArchivoNoLegible("no-es-xlsx", "No es un archivo de Excel (.xlsx). Guardalo como Excel (.xlsx) o CSV y volvé a elegirlo."),
  pesado: () => new ArchivoNoLegible("demasiado-grande", "El archivo pesa más de 8 MB. Dejá solo la hoja con los precios (o guardala como CSV) y volvé a elegirlo."),
  muchasFilas: () => new ArchivoNoLegible("demasiado-grande", `El archivo tiene más de ${MAX_FILAS_DEL_ARCHIVO.toLocaleString("es-PY")} filas. Dejá solo la hoja con los precios y volvé a elegirlo.`),
  danado: () => new ArchivoNoLegible("danado", "No se pudo leer el archivo: parece dañado. Abrilo en Excel, guardalo de nuevo y volvé a elegirlo."),
};

/* ───────────── Qué es el archivo ───────────── */

const FIRMA_OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** `zip`: un .xlsx (o .xlsm, .ods, .docx…: hay que abrirlo para saber). `ole`: un .xls viejo o un .xlsx con contraseña.
 *  `texto`: CSV, TSV o TXT (también el «Texto Unicode» de Excel). `binario`: otra cosa (un PDF, una foto…). */
export type TipoDeArchivo = "zip" | "ole" | "texto" | "binario";

export function tipoDeArchivo(bytes: Uint8Array): TipoDeArchivo {
  const empieza = (firma: number[]) => firma.every((b, i) => bytes[i] === b);
  if (empieza([0x50, 0x4b, 0x03, 0x04]) || empieza([0x50, 0x4b, 0x05, 0x06]) || empieza([0x50, 0x4b, 0x07, 0x08])) return "zip";
  if (empieza(FIRMA_OLE)) return "ole";
  if (empieza([0xff, 0xfe]) || empieza([0xfe, 0xff])) return "texto";
  return bytes.subarray(0, 4096).includes(0) ? "binario" : "texto";
}

/** El texto de un CSV/TSV/TXT: UTF-8 (con o sin BOM), UTF-16 (el «Texto Unicode» de Excel) o el CSV «ANSI» que guarda Excel en
 *  español (windows-1252). */
export function textoDeArchivo(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}

/** Si un archivo OLE nombra este flujo (los nombres van en UTF-16). */
function nombraFlujo(bytes: Uint8Array, nombre: string): boolean {
  const patron = [...nombre].flatMap((c) => [c.charCodeAt(0), 0]);
  buscar: for (let i = bytes.indexOf(patron[0]); i >= 0 && i <= bytes.length - patron.length; i = bytes.indexOf(patron[0], i + 1)) {
    for (let j = 1; j < patron.length; j++) if (bytes[i + j] !== patron[j]) continue buscar;
    return true;
  }
  return false;
}

/* ───────────── XML ───────────── */

const P = "(?:[\\w.-]+:)?"; // un prefijo de espacio de nombres opcional («x:row»)
const elemento = (nombre: string, flags = "") => new RegExp(`<${P}${nombre}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${P}${nombre}>)`, flags);
const RE_FILA = elemento("row", "g");
const RE_CELDA = elemento("c", "g");
const RE_V = elemento("v");
const RE_F = elemento("f");
const RE_T = elemento("t", "g");
const RE_SI = elemento("si", "g");
const RE_FONETICA = new RegExp(`<${P}rPh\\b[\\s\\S]*?<\\/${P}rPh>`, "g");
const RE_HOJA = new RegExp(`<${P}sheet\\b([^>]*?)\\/?>`, "g");
const RE_RELACION = new RegExp(`<${P}Relationship\\b([^>]*?)\\/?>`, "g");

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodificarEntidades(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(?:#[xX]([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g, (_, hex: string, dec: string, nombre: string) => {
    if (nombre) return ENTIDADES[nombre];
    const cp = hex ? parseInt(hex, 16) : parseInt(dec, 10);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : "�";
  });
}
/** El texto de una celda: entidades de XML y los caracteres que Excel escapa como `_xHHHH_` (un `_x000D_` es un retorno). */
const decodificarTexto = (s: string) => decodificarEntidades(s).replace(/_x([0-9a-fA-F]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

function atributos(texto: string): Record<string, string> {
  const res: Record<string, string> = {};
  for (const m of texto.matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) res[m[1]] = decodificarEntidades(m[2] ?? m[3] ?? "");
  return res;
}

/** El texto de un `<si>` o un `<is>`: todos los pedazos `<t>`, sin la guía fonética. */
function textoConFormato(xml: string): string {
  let texto = "";
  for (const m of xml.replace(RE_FONETICA, "").matchAll(RE_T)) texto += m[2] ?? "";
  return decodificarTexto(texto);
}

/** Un número como lo mostraría Excel: hasta 15 cifras (165000.00000000003 → 165000) y sin exponente (1.5E+5 → 150000). */
function numeroComoTexto(v: string): string {
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v)) return v;
  const n = Number(Number(v).toPrecision(15));
  return Number.isFinite(n) ? n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 }) : v;
}

function valorDeCelda(tipo: string | undefined, contenido: string, compartidas: string[]): string {
  const v = RE_V.exec(contenido)?.[2];
  if (tipo === "inlineStr") return textoConFormato(contenido) || decodificarTexto(v ?? "");
  if (v === undefined || v === "") {
    // Una fórmula sin su resultado guardado (la escribió un programa y nunca la calculó Excel): se devuelve la fórmula.
    const formula = RE_F.exec(contenido)?.[2];
    return formula ? `=${decodificarEntidades(formula).trim()}` : "";
  }
  switch (tipo) {
    case "s": return compartidas[Number(v)] ?? "";
    case "b": return v === "1" ? "VERDADERO" : v === "0" ? "FALSO" : decodificarTexto(v);
    case "str": case "e": case "d": return decodificarTexto(v);
    default: return numeroComoTexto(decodificarEntidades(v).trim());
  }
}

const indiceDeColumna = (letras: string) => [...letras.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

type Presupuesto = { filas: number; celdas: number };

function leerHoja(xml: string, compartidas: string[], presupuesto: Presupuesto): FilaDeHoja[] {
  const sueltas: { numero: number; valores: [number, string][] }[] = [];
  let primeraColumna = Infinity;
  let numeroAnterior = 0;
  for (const mf of xml.matchAll(RE_FILA)) {
    const r = atributos(mf[1]).r ?? "";
    const numero = /^\d+$/.test(r) ? Number(r) : numeroAnterior + 1;
    numeroAnterior = numero;
    const valores: [number, string][] = [];
    let columnaAnterior = -1;
    for (const mc of (mf[2] ?? "").matchAll(RE_CELDA)) {
      const a = atributos(mc[1]);
      const ref = /^([A-Za-z]{1,3})\d*$/.exec(a.r ?? "");
      const columna = ref ? indiceDeColumna(ref[1]) : columnaAnterior + 1;
      columnaAnterior = columna;
      if (columna > ULTIMA_COLUMNA) continue;
      const valor = valorDeCelda(a.t, mc[2] ?? "", compartidas);
      if (valor.trim() !== "") valores.push([columna, valor]);
    }
    if (valores.length === 0) continue;
    if (++presupuesto.filas > MAX_FILAS_DEL_ARCHIVO) throw rechazo.muchasFilas();
    for (const [c] of valores) primeraColumna = Math.min(primeraColumna, c);
    sueltas.push({ numero, valores });
  }
  return sueltas.map(({ numero, valores }) => {
    const ultima = valores.reduce((m, [c]) => Math.max(m, c), 0);
    presupuesto.celdas += ultima - primeraColumna + 1;
    if (presupuesto.celdas > MAX_CELDAS) throw rechazo.pesado();
    const celdas = new Array<string>(ultima - primeraColumna + 1).fill("");
    for (const [c, valor] of valores) celdas[c - primeraColumna] = valor;
    return { numero, celdas };
  });
}

/** Un XML entero termina cerrando su elemento raíz; si no, está cortado (un zip dañado o tramposo). */
function exigirCierre(xml: string, raiz: string): void {
  const final = xml.slice(-200).replace(/[\s\0]+$/, "");
  if (!new RegExp(`</${P}${raiz}\\s*>$`).test(final)) throw rechazo.danado();
}

function decodificarXml(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

/* ───────────── Rutas dentro del zip ───────────── */

/** Una ruta de una relación (`Target`), relativa a la carpeta de la parte que la nombra o absoluta («/xl/…»). */
function resolverRuta(desde: string, destino: string): string {
  let d = destino.replace(/\\/g, "/");
  try { d = decodeURIComponent(d); } catch { /* queda como vino */ }
  const carpeta = desde.includes("/") ? desde.slice(0, desde.lastIndexOf("/") + 1) : "";
  const salida: string[] = [];
  for (const p of (d.startsWith("/") ? d.slice(1) : carpeta + d).split("/")) {
    if (p === "" || p === ".") continue;
    if (p === "..") salida.pop(); else salida.push(p);
  }
  return salida.join("/");
}
/** Dónde están las relaciones de una parte: `xl/workbook.xml` → `xl/_rels/workbook.xml.rels`. */
const relacionesDe = (parte: string) => `${parte.slice(0, parte.lastIndexOf("/") + 1)}_rels/${parte.slice(parte.lastIndexOf("/") + 1)}.rels`;

type Relacion = { tipo: string; destino: string; externa: boolean };
function leerRelaciones(xml: string): Map<string, Relacion> {
  const res = new Map<string, Relacion>();
  for (const m of xml.matchAll(RE_RELACION)) {
    const a = atributos(m[1]);
    if (a.Id && a.Target) res.set(a.Id, { tipo: a.Type ?? "", destino: a.Target, externa: a.TargetMode === "External" });
  }
  return res;
}

type Unzip = typeof import("fflate").unzipSync;

/** El zip abierto: primero solo el índice (nada se descomprime); después, parte por parte, controlando el tope antes de inflar. */
function abrirZip(bytes: Uint8Array, unzipSync: Unzip) {
  const entradas = new Map<string, { nombre: string; tamano: number; comprimido: number; metodo: number }>();
  try {
    unzipSync(bytes, {
      filter: (f) => {
        entradas.set(f.name.toLowerCase(), { nombre: f.name, tamano: f.originalSize, comprimido: f.size, metodo: f.compression });
        return false;
      },
    });
  } catch { throw rechazo.danado(); }
  let leido = 0;
  return {
    /** El texto de una parte (sin importar mayúsculas en la ruta, como pide el formato), o `null` si no está. */
    leer(ruta: string): string | null {
      const e = entradas.get(ruta.toLowerCase());
      if (!e) return null;
      if (e.metodo !== 0 && e.metodo !== 8) throw rechazo.danado();
      // Comprimido nunca pesa más que descomprimido (salvo unos bytes): si el índice dice lo contrario, miente (un zip bomb que
      // declara un tamaño chico para pasar el tope). Se rechaza sin inflar.
      if (e.comprimido > e.tamano + e.tamano / 256 + 64) throw rechazo.danado();
      if (e.tamano > MAX_DESCOMPRIMIDO - leido) throw rechazo.pesado();
      let resto = MAX_DESCOMPRIMIDO - leido;
      let partes: Record<string, Uint8Array>;
      try {
        partes = unzipSync(bytes, {
          filter: (f) => {
            if (f.name !== e.nombre || f.originalSize > resto) return false;
            resto -= f.originalSize;
            return true;
          },
        });
      } catch { throw rechazo.danado(); }
      const datos = partes[e.nombre];
      if (!datos) throw rechazo.danado();
      leido += e.tamano;
      return decodificarXml(datos);
    },
  };
}

/* ───────────── Leer el libro ───────────── */

/** Lee un .xlsx (o .xlsm) y devuelve sus hojas visibles con las filas como texto. Si no se puede, `ArchivoNoLegible` con el motivo
 *  y un mensaje claro: un .xls viejo, un archivo con contraseña, algo que no es un Excel (.ods, .numbers…), demasiado grande o dañado. */
export async function leerXlsx(bytes: Uint8Array): Promise<LibroDeCalculo> {
  if (bytes.length > MAX_BYTES_DEL_ARCHIVO) throw rechazo.pesado();
  const tipo = tipoDeArchivo(bytes);
  if (tipo === "ole") {
    if (nombraFlujo(bytes, "EncryptedPackage") || nombraFlujo(bytes, "EncryptionInfo")) throw rechazo.contrasena();
    if (nombraFlujo(bytes, "Workbook") || nombraFlujo(bytes, "Book")) throw rechazo.xlsViejo();
    throw rechazo.noEsXlsx();
  }
  if (tipo !== "zip") throw rechazo.noEsXlsx();

  const { unzipSync } = await import("fflate");
  const zip = abrirZip(bytes, unzipSync);

  // Dónde está el libro: lo dice _rels/.rels (si no está, donde lo deja Excel).
  let rutaLibro = "xl/workbook.xml";
  const xmlRaiz = zip.leer("_rels/.rels");
  if (xmlRaiz !== null) {
    exigirCierre(xmlRaiz, "Relationships");
    const documento = [...leerRelaciones(xmlRaiz).values()].find((r) => /\/officeDocument$/.test(r.tipo) && !r.externa);
    if (documento) rutaLibro = resolverRuta("", documento.destino);
  }
  const xmlLibro = zip.leer(rutaLibro);
  if (xmlLibro === null || !new RegExp(`<${P}workbook\\b`).test(xmlLibro)) throw rechazo.noEsXlsx();
  exigirCierre(xmlLibro, "workbook");

  const xmlRelaciones = zip.leer(relacionesDe(rutaLibro));
  if (xmlRelaciones !== null) exigirCierre(xmlRelaciones, "Relationships");
  const relaciones = xmlRelaciones === null ? new Map<string, Relacion>() : leerRelaciones(xmlRelaciones);

  const relCadenas = [...relaciones.values()].find((r) => /\/sharedStrings$/.test(r.tipo) && !r.externa);
  const xmlCadenas = zip.leer(resolverRuta(rutaLibro, relCadenas?.destino ?? "sharedStrings.xml"));
  if (xmlCadenas !== null) exigirCierre(xmlCadenas, "sst");
  const compartidas = xmlCadenas === null ? [] : [...xmlCadenas.matchAll(RE_SI)].map((m) => textoConFormato(m[2] ?? ""));

  const hojas: HojaDeCalculo[] = [];
  const presupuesto: Presupuesto = { filas: 0, celdas: 0 };
  for (const m of xmlLibro.matchAll(RE_HOJA)) {
    const a = atributos(m[1]);
    if (a.state === "hidden" || a.state === "veryHidden") continue;
    const id = Object.entries(a).find(([clave]) => /(^|:)id$/.test(clave))?.[1];
    const rel = id === undefined ? undefined : relaciones.get(id);
    if (!rel || rel.externa) throw rechazo.danado();
    if (!/\/worksheet$/.test(rel.tipo)) continue; // gráficos y hojas de diálogo: no tienen celdas
    const xmlHoja = zip.leer(resolverRuta(rutaLibro, rel.destino));
    if (xmlHoja === null) throw rechazo.danado();
    exigirCierre(xmlHoja, "worksheet");
    hojas.push({ nombre: a.name || `Hoja ${hojas.length + 1}`, filas: leerHoja(xmlHoja, compartidas, presupuesto) });
  }
  return { hojas };
}

/** La hoja que se abre al elegir el archivo: la primera con datos (muchos libros traen una «Hoja1» vacía adelante). */
export function hojaPorDefecto(libro: LibroDeCalculo): number {
  const i = libro.hojas.findIndex((h) => h.filas.length > 0);
  return i >= 0 ? i : 0;
}
