// @ts-nocheck
import { describe, it, expect, beforeEach } from "vitest";
import { VALID_ORTHO_APPLIANCE, VALID_ORTHO_DRIFT, VALID_ORTHO_VERTICAL,
  __setToothStateForTest, __getToothStateForTest, __collectExportPayloadForTest } from "../odontogram";
import { setI18nLanguage, t } from "../i18n/useI18n";
beforeEach(() => setI18nLanguage("en"));
describe("SP14 Task 1: ortho axes + round-trip", () => {
  it("value sets", () => {
    expect(Array.from(VALID_ORTHO_APPLIANCE).sort()).toEqual(["band","bracket","none"]);
    expect(Array.from(VALID_ORTHO_DRIFT).sort()).toEqual(["distal","mesial","none"]);
    expect(Array.from(VALID_ORTHO_VERTICAL).sort()).toEqual(["extrusion","intrusion","none"]);
  });
  it("export stamps 2.10 + round-trips all four (JSON)", () => {
    __setToothStateForTest(11, { toothSelection:"tooth-base", orthoAppliance:"bracket", orthoDrift:"mesial", orthoVertical:"extrusion", orthoRotation:true });
    const p = __collectExportPayloadForTest();
    expect(p.version).toBe("2.10");
    expect(p.teeth[11]).toMatchObject({ orthoAppliance:"bracket", orthoDrift:"mesial", orthoVertical:"extrusion", orthoRotation:true });
  });
  it("hydrate reads back; unknown→none/false; legacy→none/false", () => {
    __setToothStateForTest(12, { toothSelection:"tooth-base", orthoDrift:"bogus" as any });
    expect(__getToothStateForTest(12)!.orthoDrift).toBe("none");
    __setToothStateForTest(13, { toothSelection:"tooth-base" });
    expect(__getToothStateForTest(13)!.orthoAppliance).toBe("none");
    expect(__getToothStateForTest(13)!.orthoRotation).toBe(false);
  });
  it("i18n labels exist", () => { expect(t("ortho.appliance.bracket")).not.toContain("ortho."); });
});
