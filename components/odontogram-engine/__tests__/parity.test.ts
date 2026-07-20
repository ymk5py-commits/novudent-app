// @ts-nocheck
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { svgCases } from "./parity/matrix";
import { __renderActiveLayers } from "../odontogram";
import { AXES } from "../registry/axes";
import { LOCAL_VALUE_MAPS } from "../fhir/codesystems";

// NOTE: `import.meta.url` is captured here (rather than passed inline as the
// second argument to `new URL(...)`) because Vite statically pattern-matches
// `new URL('literal', import.meta.url)` as its asset-URL syntax and rewrites
// it to a root-relative public path in this jsdom/SSR test context, which
// breaks fileURLToPath resolution. Capturing it in a variable first dodges
// that static rewrite while still resolving to the real file: URL at runtime.
const testFileUrl = import.meta.url;
const read = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`./parity/${name}`, testFileUrl)), "utf8"));
const svgText = (name: string) => readFileSync(fileURLToPath(new URL(`../assets/teeth-svgs/${name}.svg`, testFileUrl)), "utf8");

describe("SP2 parity oracle (current engine must match frozen goldens)", () => {
  // Generous timeout: rendering 500+ SVG fingerprints via jsdom parsing exceeds
  // vitest's default 5000ms in this environment (see parity/capture.test.ts).
  it("SVG fingerprints match", () => {
    const golden = read("svg-fingerprints.json");
    const cases = svgCases();
    expect(cases.length).toBe(golden.length);
    const texts: Record<string,string> = {};
    cases.forEach((c, i) => {
      texts[c.template] ??= svgText(c.template);
      const layers = __renderActiveLayers(texts[c.template], c.toothNo, c.state);
      expect(layers, `${golden[i].template} #${i}`).toEqual(golden[i].layers);
    });
  }, 30000);
});

describe("registry catalog matches today's tables", () => {
  it("enum/set/restoration axis values equal their LOCAL_VALUE_MAPS group exactly", () => {
    for (const ax of AXES) {
      if (!ax.valueGroup) continue;
      const expected = Object.values(LOCAL_VALUE_MAPS[ax.valueGroup]).map(e => e.code).sort();
      expect((ax.values ?? []).map(v => v.id).sort(), ax.id).toEqual(expected);
    }
  });
});
