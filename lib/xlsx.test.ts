import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { strToU8, unzipSync, zipSync } from "fflate";
import type { Procedure } from "./types";
import {
  leerXlsx, hojaPorDefecto, tipoDeArchivo, textoDeArchivo, ArchivoNoLegible, MAX_BYTES_DEL_ARCHIVO, MAX_FILAS_DEL_ARCHIVO,
  type LibroDeCalculo,
} from "./xlsx";
import { analizarCargaDeFilas } from "./arancel";

const fixture = (nombre: string) => new Uint8Array(readFileSync(new URL(`./__fixtures__/${nombre}`, import.meta.url)));
const filasDe = (libro: LibroDeCalculo, hoja: string) => libro.hojas.find((h) => h.nombre === hoja)?.filas.map((f) => [f.numero, ...f.celdas]);

/* ───────────── Armar un .xlsx en memoria ───────────── */

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
type HojaFalsa = { nombre: string; filas: string; estado?: "hidden" | "veryHidden" };

/** Un libro mínimo como el que guarda Excel: `filas` es lo que va dentro de <sheetData>; `compartidas`, el contenido de cada <si>. */
function partesDeLibro(hojas: HojaFalsa[], compartidas?: string[]): Record<string, string> {
  const partes: Record<string, string> = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook ${NS}><sheets>${hojas.map((h, i) => `<sheet name="${h.nombre}" sheetId="${i + 1}"${h.estado ? ` state="${h.estado}"` : ""} r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}${compartidas ? `<Relationship Id="rIdSS" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>` : ""}</Relationships>`,
  };
  hojas.forEach((h, i) => { partes[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><worksheet ${NS}><sheetData>${h.filas}</sheetData></worksheet>`; });
  if (compartidas) partes["xl/sharedStrings.xml"] = `<?xml version="1.0" encoding="UTF-8"?><sst ${NS} count="${compartidas.length}" uniqueCount="${compartidas.length}">${compartidas.map((s) => `<si>${s}</si>`).join("")}</sst>`;
  return partes;
}
const zip = (partes: Record<string, string | Uint8Array>) => zipSync(Object.fromEntries(Object.entries(partes).map(([k, v]) => [k, typeof v === "string" ? strToU8(v) : v])));
const libro = (hojas: HojaFalsa[], compartidas?: string[]) => zip(partesDeLibro(hojas, compartidas));
const unaHoja = (filas: string, compartidas?: string[]) => libro([{ nombre: "Hoja1", filas }], compartidas);
const enLinea = (texto: string) => `t="inlineStr"><is><t>${texto}</t></is>`;

/** Cambia el tamaño descomprimido que el índice del zip declara para una parte (para simular un zip tramposo). */
function declararTamano(z: Uint8Array, nombre: string, tamano: number): Uint8Array {
  const copia = z.slice();
  const dv = new DataView(copia.buffer);
  for (let i = 0; i + 46 <= copia.length; i++) {
    if (dv.getUint32(i, true) !== 0x02014b50) continue;
    const largo = dv.getUint16(i + 28, true);
    if (new TextDecoder().decode(copia.subarray(i + 46, i + 46 + largo)) === nombre) { dv.setUint32(i + 24, tamano, true); return copia; }
  }
  throw new Error(`${nombre} no está en el zip`);
}

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
/** Un archivo con cabecera OLE (el formato de los .xls viejos y de los .xlsx con contraseña) que nombra estos flujos. */
function ole(...flujos: string[]): Uint8Array {
  const nombres = flujos.flatMap((f) => [...f].flatMap((ch) => [ch.charCodeAt(0), 0]));
  return new Uint8Array([...OLE, ...new Array(504).fill(0), ...nombres, ...new Array(64).fill(0)]);
}

async function rechazo(bytes: Uint8Array): Promise<ArchivoNoLegible> {
  try { await leerXlsx(bytes); } catch (e) { if (e instanceof ArchivoNoLegible) return e; throw e; }
  throw new Error("se esperaba que no se pudiera leer");
}

/* ───────────── Excel reales ───────────── */

describe("leerXlsx — un Excel real hecho con openpyxl (texto en línea, rutas absolutas)", () => {
  it("devuelve las hojas visibles en su orden, sin la oculta", async () => {
    const l = await leerXlsx(fixture("arancel-prueba.xlsx"));
    expect(l.hojas.map((h) => h.nombre)).toEqual(["Hoja1", "Aranceles", "Laboratorio"]);
    expect(l.hojas[0].filas).toEqual([]);
  });
  it("cada fila con su número de la hoja: sin la vacía, con tildes, el texto con formato mixto y la fórmula sin resultado como fórmula", async () => {
    const l = await leerXlsx(fixture("arancel-prueba.xlsx"));
    expect(filasDe(l, "Aranceles")).toEqual([
      [1, "Prestación", "Precio"],
      [2, "Limpieza con ultrasonido", "180000"],
      [3, "Extracción de muela del juicio", "950000"],
      [5, "Blanqueamiento con férula", "Gs. 450.000"],
      [6, "Carillas de porcelana (por pieza)", "=B2*10"],
      [7, "Profilaxis (adulto)", "270000"],
      [8, "Corona de porcelana/cerámica", "2900000"],
      [9, "Ortodoncia — control mensual", "350000"],
    ]);
    expect(filasDe(l, "Laboratorio")).toEqual([[1, "Código", "Descripción", "Precio"], [2, "LAB01", "Corona de zirconio (laboratorio)", "1200000"]]);
  });
  it("por defecto se abre la primera hoja con datos", async () => {
    const l = await leerXlsx(fixture("arancel-prueba.xlsx"));
    expect(l.hojas[hojaPorDefecto(l)].nombre).toBe("Aranceles");
    expect(hojaPorDefecto({ hojas: [{ nombre: "Vacía", filas: [] }] })).toBe(0);
  });
  it("y se analiza como cualquier carga: nombre y precio, sin código", async () => {
    const l = await leerXlsx(fixture("arancel-prueba.xlsx"));
    const demo: Procedure[] = [
      { cpt: "D1110", description: "Profilaxis (adulto)", price: 250000, defaultDx: [], category: "prevencion" },
      { cpt: "D2740", description: "Corona de porcelana/cerámica", price: 2800000, defaultDx: [], category: "protesis" },
    ];
    const hoja = l.hojas[hojaPorDefecto(l)];
    const a = analizarCargaDeFilas(hoja.filas.map((f) => ({ linea: f.numero, campos: f.celdas })), demo);
    expect([a.nuevos, a.cambian, a.iguales, a.errores]).toEqual([4, 2, 0, 1]);
    expect(a.filas.map((f) => [f.linea, f.estado, f.estado === "error" ? f.motivo : f.cpt])).toEqual([
      [2, "nuevo", "S0001"], [3, "nuevo", "S0002"], [5, "nuevo", "S0003"],
      [6, "error", expect.stringMatching(/fórmula «=B2\*10».*Excel/)],
      [7, "cambia", "D1110"], [8, "cambia", "D2740"], [9, "nuevo", "S0004"],
    ]);
  });
});

describe("leerXlsx — un Excel real con cadenas compartidas (xlsxwriter guarda como Excel)", () => {
  it("cadenas compartidas, formato mixto, fórmula con su resultado, decimales y booleanos; la columna A vacía no cuenta", async () => {
    const l = await leerXlsx(fixture("arancel-cadenas-compartidas.xlsx"));
    expect(l.hojas.map((h) => h.nombre)).toEqual(["Precios"]); // «Oculta» es veryHidden
    expect(filasDe(l, "Precios")).toEqual([
      [2, "Prestación", "Precio"],
      [3, "Limpieza con ultrasonido", "180000"],
      [4, "Corona de porcelana/cerámica", "2880000"],
      [5, "Extracción de muela del juicio", "950000.5"],
      [6, "Ortodoncia — control mensual", "Gs. 350.000", "VERDADERO"],
      [7, "Limpieza con ultrasonido", "190000"],
    ]);
  });
});

/* ───────────── Casos armados en memoria ───────────── */

describe("leerXlsx — lo que puede traer una hoja", () => {
  it("texto con formato mixto: junta los pedazos e ignora la guía fonética (rPh)", async () => {
    const l = await leerXlsx(unaHoja('<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>', [
      '<r><rPr><b/></rPr><t>Corona </t></r><r><t xml:space="preserve">de porcelana</t></r><rPh sb="0" eb="1"><t>コロナ</t></rPh><phoneticPr fontId="1"/>',
      "<t/>",
    ]));
    expect(filasDe(l, "Hoja1")).toEqual([[1, "Corona de porcelana"]]);
  });
  it("entidades de XML y caracteres escapados por Excel (_x000D_)", async () => {
    const l = await leerXlsx(unaHoja(`<row r="1"><c r="A1" ${enLinea("Ni&amp;o &lt;3 &quot;sí&quot; &#x41;&#66; &#128512;")}</c><c r="B1" ${enLinea("a_x000D_b _x005F_x000D_")}</c></row>`));
    expect(filasDe(l, "Hoja1")).toEqual([[1, 'Ni&o <3 "sí" AB 😀', "a\rb _x000D_"]]);
  });
  it("las celdas vacías no se escriben: la columna sale de la referencia (C7), no de la posición", async () => {
    const l = await leerXlsx(unaHoja(`<row r="1"><c r="A1" ${enLinea("uno")}</c></row><row r="7"><c r="C7"><v>3</v></c></row>`));
    expect(filasDe(l, "Hoja1")).toEqual([[1, "uno"], [7, "", "", "3"]]);
  });
  it("celdas y filas sin referencia siguen en orden", async () => {
    const l = await leerXlsx(unaHoja(`<row><c ${enLinea("a")}</c><c><v>2</v></c></row><row><c r="B2"><v>3</v></c><c><v>4</v></c></row>`));
    expect(filasDe(l, "Hoja1")).toEqual([[1, "a", "2"], [2, "", "3", "4"]]);
  });
  it("una fila con celdas vacías o solo espacios no cuenta", async () => {
    const l = await leerXlsx(unaHoja(`<row r="1"><c r="A1" s="3"/><c r="B1" ${enLinea("   ")}</c></row><row r="2" spans="1:2" ht="20"/><row r="3"><c r="A3"><v>1</v></c></row>`));
    expect(filasDe(l, "Hoja1")).toEqual([[3, "1"]]);
  });
  it("números como texto plano: sin exponente ni los decimales de más del punto flotante", async () => {
    const valores = ["1.5E+5", "1E-7", "165000.00000000003", "12.5", "-3", "0.30000000000000004", "1E+21", "007"];
    const l = await leerXlsx(unaHoja(`<row r="1">${valores.map((v, i) => `<c r="${String.fromCharCode(65 + i)}1"><v>${v}</v></c>`).join("")}</row>`));
    expect(filasDe(l, "Hoja1")).toEqual([[1, "150000", "0.0000001", "165000", "12.5", "-3", "0.3", "1000000000000000000000", "7"]]);
  });
  it("booleanos, errores, texto de fórmula (str), fechas ISO (d) y fórmulas sin resultado", async () => {
    const l = await leerXlsx(unaHoja(
      '<row r="1"><c r="A1" t="b"><v>0</v></c><c r="B1" t="e"><v>#DIV/0!</v></c><c r="C1" t="str"><f>A1&amp;"x"</f><v>FALSOx</v></c>'
      + '<c r="D1" t="d"><v>2026-10-08T00:00:00</v></c><c r="E1"><f>B1*2</f></c><c r="F1"><f t="shared" si="0"/></c><c r="G1" t="s"><v>99</v></c></row>',
    ));
    expect(filasDe(l, "Hoja1")).toEqual([[1, "FALSO", "#DIV/0!", "FALSOx", "2026-10-08T00:00:00", "=B1*2"]]);
  });
  it("con prefijos de espacio de nombres (x:sheet, x:row, x:c) y comillas simples", async () => {
    const partes = partesDeLibro([{ nombre: "Hoja1", filas: "" }]);
    partes["xl/workbook.xml"] = `<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><x:sheets><x:sheet name='Hoja&amp;1' sheetId='1' r:id='rId1'/></x:sheets></x:workbook>`;
    partes["xl/worksheets/sheet1.xml"] = `<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row r='1'><x:c r='A1' t='inlineStr'><x:is><x:t>Hola</x:t></x:is></x:c><x:c r='B1'><x:v>5</x:v></x:c></x:row></x:sheetData></x:worksheet>`;
    const l = await leerXlsx(zip(partes));
    expect(filasDe(l, "Hoja&1")).toEqual([[1, "Hola", "5"]]);
  });
  it("encuentra las partes aunque la ruta sea absoluta, tenga «..» o use otras mayúsculas", async () => {
    const partes = partesDeLibro([{ nombre: "A", filas: `<row r="1"><c r="A1"><v>1</v></c></row>` }, { nombre: "B", filas: `<row r="1"><c r="A1"><v>2</v></c></row>` }]);
    partes["xl/_rels/workbook.xml.rels"] = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="/XL/Worksheets/Sheet1.xml"/><Relationship Id="rId2" Type="${REL}/worksheet" Target="../xl/worksheets/./sheet2.xml"/></Relationships>`;
    const l = await leerXlsx(zip(partes));
    expect(l.hojas.map((h) => [h.nombre, h.filas[0]?.celdas[0]])).toEqual([["A", "1"], ["B", "2"]]);
  });
  it("sin _rels/.rels busca el libro donde lo deja Excel (xl/workbook.xml)", async () => {
    const partes = partesDeLibro([{ nombre: "Hoja1", filas: `<row r="1"><c r="A1"><v>1</v></c></row>` }]);
    delete partes["_rels/.rels"];
    expect(filasDe(await leerXlsx(zip(partes)), "Hoja1")).toEqual([[1, "1"]]);
  });
  it("las hojas de gráficos no se ofrecen", async () => {
    const partes = partesDeLibro([{ nombre: "Datos", filas: `<row r="1"><c r="A1"><v>1</v></c></row>` }, { nombre: "Gráfico", filas: "" }]);
    partes["xl/_rels/workbook.xml.rels"] = partes["xl/_rels/workbook.xml.rels"].replace(`Id="rId2" Type="${REL}/worksheet"`, `Id="rId2" Type="${REL}/chartsheet"`);
    expect((await leerXlsx(zip(partes))).hojas.map((h) => h.nombre)).toEqual(["Datos"]);
  });
});

/* ───────────── Qué es el archivo ───────────── */

describe("tipoDeArchivo y textoDeArchivo — antes de leer", () => {
  it("reconoce un zip (.xlsx), un OLE (.xls viejo o con contraseña), texto y binario", () => {
    expect(tipoDeArchivo(fixture("arancel-prueba.xlsx"))).toBe("zip");
    expect(tipoDeArchivo(ole("Workbook"))).toBe("ole");
    expect(tipoDeArchivo(strToU8("Código;Precio\nD1;100"))).toBe("texto");
    expect(tipoDeArchivo(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))).toBe("texto"); // «Texto Unicode» de Excel (UTF-16)
    expect(tipoDeArchivo(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x0a, 0x00, 0x01]))).toBe("binario"); // un PDF
  });
  it("decodifica UTF-8 (con o sin BOM), el CSV «ANSI» de Excel en español y el texto Unicode (UTF-16)", () => {
    expect(textoDeArchivo(new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8("Extracción;1")]))).toBe("Extracción;1");
    expect(textoDeArchivo(new Uint8Array([0x45, 0x78, 0x74, 0x72, 0x61, 0x63, 0x63, 0x69, 0xf3, 0x6e]))).toBe("Extracción");
    const utf16 = new Uint8Array([0xff, 0xfe, ...[..."Año\t1"].flatMap((c) => [c.charCodeAt(0), 0])]);
    expect(textoDeArchivo(utf16)).toBe("Año\t1");
  });
});

/* ───────────── Lo que no se puede leer ───────────── */

describe("leerXlsx — lo que no se puede leer, con un mensaje claro", () => {
  it("un .xls viejo: «Guardalo como Excel (.xlsx) o CSV»", async () => {
    const e = await rechazo(ole("Root Entry", "Workbook"));
    expect(e.motivo).toBe("xls-viejo");
    expect(e.message).toMatch(/\.xls\b.*Guardalo como Excel \(\.xlsx\) o CSV/);
  });
  it("un .xlsx protegido con contraseña", async () => {
    const e = await rechazo(ole("Root Entry", "EncryptionInfo", "EncryptedPackage"));
    expect(e.motivo).toBe("contrasena");
    expect(e.message).toMatch(/contraseña/);
  });
  it("una planilla de LibreOffice (.ods) o de Numbers, o cualquier zip que no es un Excel", async () => {
    const ods = zip({ mimetype: "application/vnd.oasis.opendocument.spreadsheet", "content.xml": "<office:document-content/>" });
    const numbers = zip({ "Index/Document.iwa": new Uint8Array([1, 2, 3]) });
    const docx = zip({ "word/document.xml": "<w:document/>", "_rels/.rels": `<Relationships><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>` });
    for (const bytes of [ods, numbers, docx]) {
      const e = await rechazo(bytes);
      expect(e.motivo).toBe("no-es-xlsx");
      expect(e.message).toMatch(/Guardalo como Excel \(\.xlsx\) o CSV/);
    }
  });
  it("un archivo que no es un zip", async () => {
    expect((await rechazo(strToU8("Código;Precio"))).motivo).toBe("no-es-xlsx");
  });
  it("más de 8 MB", async () => {
    const grande = new Uint8Array(MAX_BYTES_DEL_ARCHIVO + 1);
    grande.set([0x50, 0x4b, 0x03, 0x04]);
    const e = await rechazo(grande);
    expect(e.motivo).toBe("demasiado-grande");
    expect(e.message).toMatch(/8 MB/);
  });
  it("más de 20.000 filas", async () => {
    const filas = Array.from({ length: MAX_FILAS_DEL_ARCHIVO + 1 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`).join("");
    const e = await rechazo(unaHoja(filas));
    expect(e.motivo).toBe("demasiado-grande");
    expect(e.message).toMatch(/20\.000 filas/);
  });
  it("una parte que descomprimida pasaría el tope se corta ANTES de inflarla (zip bomb)", async () => {
    const tramposo = declararTamano(unaHoja(`<row r="1"><c r="A1"><v>1</v></c></row>`), "xl/worksheets/sheet1.xml", 0xfffffff0);
    expect((await rechazo(tramposo)).motivo).toBe("demasiado-grande");
  });
  it("un zip que declara una parte más chica que lo que pesa comprimida miente: se rechaza sin inflarla", async () => {
    const filas = Array.from({ length: 2000 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`).join("");
    const tramposo = declararTamano(unaHoja(filas), "xl/worksheets/sheet1.xml", 120);
    expect((await rechazo(tramposo)).motivo).toBe("danado");
  });
  it("si declara menos de lo que es (pero más que lo comprimido), no infla de más: el XML queda cortado y se ve como dañado", async () => {
    const filas = Array.from({ length: 2000 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`).join("");
    const bytes = unaHoja(filas);
    let comprimido = 0;
    let real = 0;
    unzipSync(bytes, { filter: (f) => { if (f.name === "xl/worksheets/sheet1.xml") { comprimido = f.size; real = f.originalSize; } return false; } });
    expect(comprimido * 2).toBeLessThan(real);
    expect((await rechazo(declararTamano(bytes, "xl/worksheets/sheet1.xml", comprimido * 2))).motivo).toBe("danado");
  });
  it("un zip cortado a la mitad, o al que le falta la hoja", async () => {
    const entero = fixture("arancel-prueba.xlsx");
    expect((await rechazo(entero.slice(0, entero.length / 2))).motivo).toBe("danado");
    const partes = partesDeLibro([{ nombre: "Hoja1", filas: "" }]);
    delete partes["xl/worksheets/sheet1.xml"];
    expect((await rechazo(zip(partes))).motivo).toBe("danado");
  });
});

describe("leerXlsx — rendimiento", () => {
  it("lee un .xlsx de 3.000 filas (como lo guarda Excel) en menos de 2 segundos", async () => {
    const nombres = Array.from({ length: 3000 }, (_, i) => `<t>Prestación número ${i + 1} — con tildes y un nombre largo</t>`);
    const filas = Array.from({ length: 3000 }, (_, i) => `<row r="${i + 2}" spans="1:3"><c r="A${i + 2}" t="s"><v>${i}</v></c><c r="B${i + 2}" s="1"><v>${150000 + i * 1000}</v></c><c r="C${i + 2}" t="s"><v>3000</v></c></row>`);
    const bytes = unaHoja(`<row r="1"><c r="A1" t="s"><v>3001</v></c><c r="B1" t="s"><v>3002</v></c></row>${filas.join("")}`, [...nombres, "<t>Operatoria</t>", "<t>Prestación</t>", "<t>Precio</t>"]);
    const inicio = performance.now();
    const l = await leerXlsx(bytes);
    const a = analizarCargaDeFilas(l.hojas[0].filas.map((f) => ({ linea: f.numero, campos: f.celdas })), []);
    const ms = performance.now() - inicio;
    expect(l.hojas[0].filas).toHaveLength(3001);
    expect(a.nuevos).toBe(3000);
    expect(ms).toBeLessThan(2000);
  });
});
