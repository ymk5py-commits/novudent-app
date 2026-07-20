// @ts-nocheck
import { describe, it, expect } from "vitest";
import { AXES } from "../axes";
import { VALID_PERI_IMPLANT } from "../../odontogram";

describe("SP8 Task 1: periImplant axis", () => {
  it("has the 5 values", () => {
    expect(Array.from(VALID_PERI_IMPLANT).sort()).toEqual(
      ["mucositis","none","peri-implantitis-mild","peri-implantitis-moderate","peri-implantitis-severe"]);
  });
  it("axis exists with no svgLayer (explicit activation, apicalDx-style)", () => {
    const ax = AXES.find(a => a.id === "periImplant");
    expect(ax).toBeTruthy();
    expect(ax!.svgLayer).toBeUndefined();
    expect(ax!.skipValue).toBe("none");
  });
});
