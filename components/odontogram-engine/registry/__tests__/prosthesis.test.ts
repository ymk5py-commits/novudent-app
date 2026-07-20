// @ts-nocheck
import { describe, it, expect } from "vitest";
import { VALID_PROSTHESIS } from "../../odontogram";
import { LOCAL_VALUE_MAPS } from "../../fhir/codesystems";

describe("prosthesis axis (SP3b foundation)", () => {
  it("VALID_PROSTHESIS has the 8 expected values", () => {
    expect(VALID_PROSTHESIS).toEqual(new Set([
      "none",
      "healing-abutment",
      "locator",
      "locator-denture",
      "bar",
      "bar-denture",
      "removable-partial",
      "removable-full",
    ]));
  });

  it("has a matching LOCAL_VALUE_MAPS.prosthesis entry for every VALID_PROSTHESIS value", () => {
    expect(Object.keys(LOCAL_VALUE_MAPS.prosthesis).sort()).toEqual([...VALID_PROSTHESIS].sort());
  });
});
