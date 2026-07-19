import { describe, it, expect, beforeEach } from "vitest";
import { initOdontogram, destroyOdontogram, collectExportPayload, importStatus } from "../odontogram";

describe("puente de datos del motor (collectExportPayload/importStatus públicas)", () => {
  beforeEach(async () => {
    document.body.innerHTML = '<div id="toothGrid"></div><div id="root"></div>';
    await initOdontogram();
  });

  it("collectExportPayload devuelve {version, globals, teeth} con las 32 piezas permanentes", () => {
    const payload = collectExportPayload();
    expect(payload.version).toBe("2.10");
    expect(Object.keys(payload.teeth).length).toBeGreaterThanOrEqual(32);
  });

  it("importStatus + collectExportPayload hacen round-trip de un hallazgo simple", () => {
    const before = collectExportPayload();
    before.teeth["16"] = { ...before.teeth["16"], caries: ["O"], toothSelection: "permanent" };
    importStatus(before);
    const after = collectExportPayload();
    expect(after.teeth["16"].caries).toEqual(["O"]);
  });
});
