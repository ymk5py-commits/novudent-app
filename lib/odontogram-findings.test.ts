import { describe, it, expect } from "vitest";
import { findingToToothFields } from "./odontogram-findings";

// Valores verificados contra components/odontogram-engine/fhir/codesystems.ts
// (LOCAL_VALUE_MAPS) + components/odontogram-engine/registry/axes.ts (AXES), y
// cruzados contra el precedente ya commiteado en lib/seed.ts (Task 10):
//   toothSelection: "tooth-base" (NO "permanent"), "no-tooth-after-extraction"
//     (único id de "pieza ausente" — no existe uno separado para "ausente sin
//     contexto de extracción"), "implant".
//   caries: ids con prefijo "caries-{surface}" (ej. "caries-occlusal").
//   cariesSeverity: Map/objeto indexado por la superficie PELADA (sin prefijo
//     "caries-"), valor ICDAS 1..6 — confirmado en odontogram.ts (applyRecurrentCariesScore
//     / el picker de profundidad: `s.cariesSeverity.set(surface, ...)` con la
//     misma `surface` que arma `caries-${surface}`).
//   fillingSurfaces: palabras completas ("buccal","lingual","mesial","distal",
//     "occlusal") — NO letras sueltas ("V","M","O"). app/api/ia/copilot/route.ts
//     hoy no le pide `surface` a Gemini en ningún formato (ver lib/odontogram-findings.ts).
//   endo: "endo-filling" (NO "root-canal-filling", que es el display label en inglés).
describe("findingToToothFields", () => {
  it("caries -> marca la pieza presente con severidad moderada por defecto, sin superficie", () => {
    expect(findingToToothFields({ condition: "caries", severity: "moderado" }))
      .toEqual({ toothSelection: "tooth-base", caries: [], cariesSeverity: {} });
  });

  it("caries con superficie conocida la agrega a caries[] (con prefijo) y cariesSeverity (superficie pelada)", () => {
    expect(findingToToothFields({ condition: "caries", severity: "severo", surface: "occlusal" }))
      .toEqual({ toothSelection: "tooth-base", caries: ["caries-occlusal"], cariesSeverity: { occlusal: 5 } });
  });

  it("restaurado -> fillingMaterial composite + superficie", () => {
    expect(findingToToothFields({ condition: "restaurado", surface: "buccal" }))
      .toEqual({ toothSelection: "tooth-base", fillingMaterial: "composite", fillingSurfaces: ["buccal"] });
  });

  it("corona -> restorationType crown + restorationMaterial metal-ceramic", () => {
    expect(findingToToothFields({ condition: "corona" }))
      .toEqual({ toothSelection: "tooth-base", restorationType: "crown", restorationMaterial: "metal-ceramic" });
  });

  it("endodoncia -> endo endo-filling", () => {
    expect(findingToToothFields({ condition: "endodoncia" }))
      .toEqual({ toothSelection: "tooth-base", endo: "endo-filling" });
  });

  it("extraccion -> extractionPlan true, sin tocar toothSelection (pieza todavía presente)", () => {
    expect(findingToToothFields({ condition: "extraccion" }))
      .toEqual({ extractionPlan: true });
  });

  it("ausente -> toothSelection no-tooth-after-extraction", () => {
    expect(findingToToothFields({ condition: "ausente" }))
      .toEqual({ toothSelection: "no-tooth-after-extraction" });
  });

  it("implante -> toothSelection implant", () => {
    expect(findingToToothFields({ condition: "implante" }))
      .toEqual({ toothSelection: "implant" });
  });

  it("severidad leve -> cariesSeverity baja (ICDAS 2)", () => {
    expect(findingToToothFields({ condition: "caries", severity: "leve", surface: "mesial" }).cariesSeverity)
      .toEqual({ mesial: 2 });
  });
});
