// @ts-nocheck
import { describe, it, expect, beforeEach } from "vitest";
import { VALID_DISCOLORATION, __setToothStateForTest, __getToothStateForTest, __collectExportPayloadForTest } from "../odontogram";
import { setI18nLanguage, t } from "../i18n/useI18n";

beforeEach(() => setI18nLanguage("en"));

describe("SP12 Task 1: discoloration axis + round-trip", () => {
  it("has the 6 values", () => {
    expect(Array.from(VALID_DISCOLORATION).sort()).toEqual(["extrinsic","fluorosis","none","nonvital","other","tetracycline"]);
  });
  it("JSON export stamps 2.9 + round-trips discoloration", () => {
    __setToothStateForTest(11, { toothSelection: "tooth-base", discoloration: "tetracycline" });
    const payload = __collectExportPayloadForTest();
    expect(payload.version).toBe("2.10");
    expect(payload.teeth[11].discoloration).toBe("tetracycline");
  });
  it("hydrate reads it back; unknown → none; legacy → none", () => {
    __setToothStateForTest(12, { toothSelection: "tooth-base", discoloration: "bogus" });
    expect(__getToothStateForTest(12)!.discoloration).toBe("none");
    __setToothStateForTest(13, { toothSelection: "tooth-base" });
    expect(__getToothStateForTest(13)!.discoloration).toBe("none");
  });
  it("i18n labels exist", () => {
    expect(t("discoloration.tetracycline")).not.toContain("discoloration.");
  });
});
