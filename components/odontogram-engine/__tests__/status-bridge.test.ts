import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initOdontogram, destroyOdontogram, collectExportPayload, importStatus } from "../odontogram";

/** collectExportPayload() infiere `teeth: {}` (objeto vacío sin index signature) porque el
 *  motor lo puebla con asignaciones dinámicas (teeth[toothNo] = ...) — el tipo completo del
 *  payload se define recién en Task 7 (lib/types.ts OdontogramStatus). Acá solo necesitamos
 *  indexar por pieza, así que castea localmente en vez de adelantar esa dependencia. */
type TestPayload = { version: string; globals: Record<string, boolean>; teeth: Record<string, Record<string, unknown>> };
const payloadOf = () => collectExportPayload() as unknown as TestPayload;

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
    const before = payloadOf();
    // "caries-occlusal" (superficie oclusal) y "tooth-base" (diente permanente
    // presente) son los ids reales del registry (components/odontogram-engine/
    // fhir/codesystems.ts LOCAL_VALUE_MAPS.caries/.toothSelection) — hydrateState
    // descarta silenciosamente cualquier valor no reconocido por VALID_CARIES/
    // VALID_TOOTH_SELECTION.
    before.teeth["16"] = { ...before.teeth["16"], caries: ["caries-occlusal"], toothSelection: "tooth-base" };
    importStatus(before);
    const after = payloadOf();
    expect(after.teeth["16"].caries).toEqual(["caries-occlusal"]);
  });
});
