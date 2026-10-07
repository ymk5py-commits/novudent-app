import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { allClearLayers } from "../components/odontogram-engine/registry/svgLayers";

/** Contrato de las plantillas SVG del odontograma (public/odontogram/teeth-svgs).
 *
 *  El motor vendorizado (components/odontogram-engine) clona cada plantilla una vez por
 *  pieza y prende/apaga capas por `id` con `data-active` (CSS `[data-active="0"]{display:none}`).
 *  El arte se puede rehacer, pero nunca a costa de ese contrato: el `viewBox` (los tamaños
 *  de la grilla dependen de él), los ids de las capas y sus `data-active`, y que cada
 *  degradé/patrón tenga un id propio. Es DOM-free a propósito (entorno node de vitest):
 *  lee los archivos como texto. */

const DIR = fileURLToPath(new URL("../public/odontogram/teeth-svgs/", import.meta.url));

/** Servidores de pintura: viven en <defs> y se referencian con url(#id). */
const PAINT = new Set(["linearGradient", "radialGradient", "pattern", "clipPath", "mask", "filter"]);

type Elemento = { tag: string; id?: string; attrs: Record<string, string>; enDefs: boolean; pos: number };

function leer(nombre: string) {
  const txt = readFileSync(`${DIR}${nombre}.svg`, "utf8");
  const defsIni = txt.indexOf("<defs>");
  const defsFin = txt.indexOf("</defs>");
  const elementos: Elemento[] = [];
  for (const m of txt.matchAll(/<([a-zA-Z]+)\s([^>]*?)\/?>/g)) {
    const attrs: Record<string, string> = {};
    for (const a of m[2].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const pos = m.index ?? 0;
    elementos.push({ tag: m[1], id: attrs.id, attrs, enDefs: pos > defsIni && pos < defsFin, pos });
  }
  return { txt, elementos };
}

/** Bloque de texto de un elemento con id (de su etiqueta de apertura a su cierre). */
function bloque(txt: string, id: string): string {
  const ini = txt.lastIndexOf("<", txt.indexOf(`id="${id}"`));
  const tag = /^<(\w+)/.exec(txt.slice(ini))![1];
  const cabeza = txt.indexOf(">", ini);
  if (txt[cabeza - 1] === "/") return txt.slice(ini, cabeza + 1);
  let prof = 0;
  let i = ini;
  for (;;) {
    const abre = txt.indexOf(`<${tag}`, i + 1);
    const cierra = txt.indexOf(`</${tag}>`, i + 1);
    if (abre !== -1 && abre < cierra) { prof++; i = abre; continue; }
    if (prof === 0) return txt.slice(ini, cierra + tag.length + 3);
    prof--; i = cierra;
  }
}

// Capas que el motor maneja por id (applyStateToSvgSingle + registry/svgLayers.ts).
const LATERAL = [
  "base", "bone-base", "gum-base", "mods", "tooth-variants", "tooth-under-gum", "tooth-radix", "tooth-crownprep",
  "tooth-broken-incisal", "tooth-broken-mesial", "tooth-broken-distal", "tooth-broken-mesial-distal",
  "tooth-broken-mesial-incisal", "tooth-broken-distal-incisal", "tooth-broken-mesial-distal-incisal",
  "no-tooth-after-extraction", "tooth", "tooth-base", "tooth-base-beauty", "tooth-healthy-pulp", "tooth-inflam-pulp",
  "tooth-bruxism-wear", "tooth-bruxism-neck-wear", "endos", "endo-filling", "surfaces", "subcaries", "caries",
  "caries-buccal", "caries-mesial", "caries-distal", "caries-occlusal", "caries-root", "caries-subcrown", "fillings",
  "amalgam", "composite", "gic", "temporary", "filling-amalgam-occlusal", "filling-composite-buccal",
  "filling-gic-mesial", "filling-temporary-distal", "restorations", "implant", "implant-base", "zircon", "zircon-crown",
  "metal", "metal-crown", "emax", "emax-crown", "gold", "gold-crown", "metal-ceramic", "metal-ceramic-crown",
  "prosthesis", "plan", "extraction-plan",
];
const LECHE = ["milktooth", "milktooth-base", "milktooth-beauty", "milktooth-healthy-pulp", "milktooth-inflam-pulp"];
const OCLUSAL = [
  "base", "bone-base", "gum-base", "tooth-variants", "tooth-crownprep", "tooth-broken-mesial", "tooth-broken-distal",
  "tooth-broken-mesial-distal", "tooth", "tooth-base", "background-cusp", "cusps", "fissure", "surfaces", "subcaries",
  "caries", "caries-buccal", "caries-lingual", "caries-mesial", "caries-distal", "caries-occlusal", "fillings",
  "amalgam", "composite", "filling-composite-occlusal", "restorations", "implant", "implant-base", "zircon",
  "zircon-crown", "zircon-onlay", "emax", "emax-onlay", "fissure-sealing", "plan", "extraction-plan", "crown-needed",
];

/** viewBox original (no se toca: la grilla y los márgenes dependen de él), capas
 *  críticas y cuántas capas con id traía el archivo de origen (no se borran ni renombran). */
const PLANTILLAS: Record<string, { viewBox: string; capas: string[]; capasOriginales: number }> = {
  "11": { viewBox: "0 0 39.7 70.8", capas: [...LATERAL, ...LECHE], capasOriginales: 207 },
  "13": { viewBox: "0 0 40.3 71", capas: [...LATERAL, ...LECHE], capasOriginales: 207 },
  "14": { viewBox: "0 0 39.8 71.2", capas: [...LATERAL, ...LECHE], capasOriginales: 218 },
  "16": { viewBox: "0 0 42.9 70.9", capas: LATERAL, capasOriginales: 202 },
  "14_occl": { viewBox: "0 0 48.8 41.5", capas: [...OCLUSAL, "milktooth", "milktooth-base"], capasOriginales: 147 },
  "16_occl": { viewBox: "0 0 48.2 41.5", capas: OCLUSAL, capasOriginales: 143 },
};

describe("plantillas SVG del odontograma", () => {
  for (const [nombre, esperado] of Object.entries(PLANTILLAS)) {
    describe(`${nombre}.svg`, () => {
      const { txt, elementos } = leer(nombre);
      const capas = elementos.filter((e) => e.id && !e.enDefs && e.tag !== "svg");

      it("conserva su viewBox exacto", () => {
        expect(/<svg[^>]*viewBox="([^"]+)"/.exec(txt)?.[1]).toBe(esperado.viewBox);
      });

      it("conserva las capas que usa el motor, cada una con su data-active", () => {
        const porId = new Map(capas.map((e) => [e.id, e]));
        for (const id of esperado.capas) {
          expect(porId.has(id), `falta la capa #${id}`).toBe(true);
          expect(porId.get(id)!.attrs["data-active"], `#${id} sin data-active`).toMatch(/^[01]$/);
        }
        // Toda capa con id fuera de <defs> lleva data-active (el motor apaga por ese atributo).
        for (const e of capas) expect(e.attrs["data-active"], `#${e.id} sin data-active`).toMatch(/^[01]$/);
        expect(capas.length, "se borró o renombró alguna capa con id").toBeGreaterThanOrEqual(esperado.capasOriginales);
      });

      it("no repite ids y cada url(#…) apunta a un degradé/patrón definido en el mismo archivo", () => {
        const ids = elementos.filter((e) => e.id).map((e) => e.id);
        expect(ids.length).toBe(new Set(ids).size);
        const pintura = new Set(elementos.filter((e) => PAINT.has(e.tag)).map((e) => e.id));
        const refs = [...txt.matchAll(/url\(#([^)"']+)\)/g)].map((m) => m[1]);
        expect(refs.length).toBeGreaterThan(0);
        for (const r of refs) expect(pintura.has(r), `url(#${r}) no existe en ${nombre}.svg`).toBe(true);
      });

      it("la pieza ya no es el gris plano #ebebeb", () => {
        const base = capas.find((e) => e.id === "tooth-base")!;
        if (base.tag === "path") {
          expect(base.attrs.style).not.toMatch(/#ebebeb/i);
          expect(base.attrs.style).toMatch(/fill:\s*url\(#og/);
        }
        // Ninguna silueta (variantes, leche, debajo de la encía) queda gris.
        const siluetas = capas.filter((e) => /^(tooth-(base|broken-|radix|crownprep|under-gum)|milktooth-base|background-cusp)/.test(e.id!));
        expect(siluetas.length).toBeGreaterThan(0);
        for (const s of siluetas) expect(s.attrs.style ?? "", `#${s.id} sigue gris`).not.toMatch(/#ebebeb|#c8c9c9/i);
      });

      it("los brillos son un grupo que el motor prende y apaga como unidad", () => {
        // Adentro no puede haber ninguna capa que el motor maneje por su cuenta (la apagaría
        // o prendería suelta). Los únicos ids permitidos son los reflejos que ya traía el
        // archivo de origen (`tooth-base-beauty-1`…), que se conservan.
        const delMotor = new Set(allClearLayers());
        for (const id of ["tooth-base-beauty", "milktooth-beauty"]) {
          if (!capas.some((e) => e.id === id)) continue;
          const b = bloque(txt, id);
          expect(b.startsWith("<g")).toBe(true);
          const internos = [...b.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]).slice(1);
          for (const i of internos) {
            expect(delMotor.has(i), `#${i} adentro de #${id} es una capa del motor`).toBe(false);
            expect(i, `#${i} adentro de #${id}`).toMatch(new RegExp(`^${id}-\\d+$`));
          }
        }
      });
    });
  }

  it("ningún degradé, patrón ni clipPath repite id entre archivos (las plantillas se clonan en el mismo documento)", () => {
    const vistos = new Map<string, string>();
    for (const nombre of Object.keys(PLANTILLAS)) {
      for (const e of leer(nombre).elementos) {
        if (!PAINT.has(e.tag) || !e.id) continue;
        expect(vistos.get(e.id), `#${e.id} está en ${vistos.get(e.id)} y en ${nombre}`).toBeUndefined();
        vistos.set(e.id, nombre);
      }
    }
  });
});
