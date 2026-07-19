import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initOdontogram, destroyOdontogram, collectExportPayload, importStatus } from "../odontogram";

describe("puente de datos del motor (collectExportPayload/importStatus públicas)", () => {
  beforeEach(async () => {
    document.body.innerHTML = '<div id="toothGrid"></div><div id="root"></div>';
    await initOdontogram();
  });

  afterEach(() => {
    destroyOdontogram();
  });

  it("collectExportPayload devuelve {version, globals, teeth} con las 32 piezas permanentes", () => {
    const payload = collectExportPayload();
    expect(payload.version).toBe("2.10");
    expect(Object.keys(payload.teeth).length).toBeGreaterThanOrEqual(32);
  });

  it("importStatus + collectExportPayload hacen round-trip de un hallazgo simple", () => {
    const before = collectExportPayload();
    // "caries-occlusal" (superficie oclusal) y "tooth-base" (diente permanente
    // presente) son los ids reales del registry (components/odontogram-engine/
    // fhir/codesystems.ts LOCAL_VALUE_MAPS.caries/.toothSelection) — hydrateState
    // descarta silenciosamente cualquier valor no reconocido por VALID_CARIES/
    // VALID_TOOTH_SELECTION.
    before.teeth["16"] = { ...before.teeth["16"], caries: ["caries-occlusal"], toothSelection: "tooth-base" };
    importStatus(before);
    const after = collectExportPayload();
    expect(after.teeth["16"].caries).toEqual(["caries-occlusal"]);
  });
});
