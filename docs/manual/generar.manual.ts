/** Arma el manual: valida el contenido, junta las capturas, escribe `salida/manual.html` y lo pasa a PDF con WeasyPrint.
 *    npm run manual:pdf
 *  Estricto por defecto: falla si falta una captura o sobra una. `MANUAL_PERMISIVO=1` deja pasar las que faltan (salen marcadas
 *  en el PDF) para ir viendo cómo queda mientras se escribe un capítulo. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";
import { CAPITULOS } from "./contenido";
import { montarHtml, revisarCapturas, validar } from "./montar";
import { svgLogotipo } from "../../lib/marca";

const SALIDA = join(__dirname, "salida");

/** Ancho y alto de un PNG, leídos de su encabezado. */
function tamanoPng(ruta: string): { ancho: number; alto: number } {
  const b = readFileSync(ruta);
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
}

test("armar el manual en PDF", async () => {
  test.setTimeout(300_000);
  const permisivo = process.env.MANUAL_PERMISIVO === "1";

  const problemas = validar(CAPITULOS);
  if (problemas.length) throw new Error(`El contenido tiene ${problemas.length} problema(s):\n- ${problemas.join("\n- ")}`);

  const carpeta = join(SALIDA, "capturas");
  const capturas: Record<string, string[]> = {};
  if (existsSync(carpeta)) {
    for (const d of readdirSync(carpeta, { withFileTypes: true })) {
      if (d.isDirectory() && !d.name.startsWith("_")) {
        capturas[d.name] = readdirSync(join(carpeta, d.name)).filter((f) => f.endsWith(".png")).map((f) => f.replace(/\.png$/, "")).sort();
      }
    }
  }
  const { faltan, sobran } = revisarCapturas(CAPITULOS, capturas);
  if ((faltan.length || sobran.length) && !permisivo) {
    throw new Error(`Capturas que se piden y no existen: ${faltan.join(", ") || "ninguna"}\nCapturas que existen y ningún paso usa: ${sobran.join(", ") || "ninguna"}\n(¿corriste npm run manual:capturas?)`);
  }
  if (faltan.length) console.warn(`⚠ faltan ${faltan.length} captura(s): ${faltan.join(", ")}`);

  const rutaMenus = join(SALIDA, "menus.json");
  const menus = existsSync(rutaMenus) ? JSON.parse(readFileSync(rutaMenus, "utf8")) : undefined;

  const html = montarHtml({
    capitulos: CAPITULOS,
    capturas,
    rutaCaptura: (p, n) => `capturas/${p}/${n}.png`,
    tamano: (p, n) => { const r = join(carpeta, p, `${n}.png`); return existsSync(r) ? tamanoPng(r) : null; },
    fecha: new Date().toLocaleDateString("es-PY", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Asuncion" }),
    menus,
    logoSvg: svgLogotipo("blanco"),
    css: readFileSync(join(__dirname, "estilo.css"), "utf8"),
  });

  mkdirSync(SALIDA, { recursive: true });
  const rutaHtml = join(SALIDA, "manual.html");
  const rutaPdf = join(SALIDA, "manual-novudent.pdf");
  writeFileSync(rutaHtml, html);
  execFileSync("python3", ["-m", "weasyprint", "--optimize-images", rutaHtml, rutaPdf], { stdio: "inherit" });

  const paginas = /Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [rutaPdf], { encoding: "utf8" }))?.[1];
  const imagenes = Object.values(capturas).reduce((n, l) => n + l.length, 0);
  console.log(`\nManual listo: ${rutaPdf}\n${paginas} páginas · ${CAPITULOS.flatMap((c) => c.procedimientos).length} procedimientos · ${imagenes} capturas`);
});
