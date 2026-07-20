// @ts-nocheck
// SP5 Task 1: caries fields foundation — additive registry scaffolding only
// (no render/UI wiring yet; see later SP5 tasks). Mirrors
// diagnosis-axes.test.ts's shape for the new `rootCaries` enum axis. The
// `secondaryCaries`/`radiographicDepth` per-surface scalar-map fields are
// handled exactly like `cariesDepths` — special-cased outside AXES, with
// their own independent per-surface maps.
import { describe, it, expect } from "vitest";
import { VALID_ROOT_CARIES, VALID_CARS, VALID_RADIOGRAPHIC_DEPTH } from "../../odontogram";
import { AXES } from "../axes";

describe("SP5 Task 1: caries fields VALID_* sets", () => {
  it("VALID_ROOT_CARIES has none/active/arrested/active-cavitated", () => {
    expect(VALID_ROOT_CARIES).toEqual(new Set(["none", "active", "arrested", "active-cavitated"]));
  });

  it("VALID_CARS has the 7 CARS scores (0..6)", () => {
    expect(VALID_CARS).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
  });

  it("VALID_RADIOGRAPHIC_DEPTH has none/E1/E2/D1/D2/D3", () => {
    expect(VALID_RADIOGRAPHIC_DEPTH).toEqual(new Set(["none", "E1", "E2", "D1", "D2", "D3"]));
  });
});

describe("SP5 Task 1: registry catalog stays 1:1 after adding rootCaries", () => {
  it("rootCaries applies only to a present tooth and carries the caries-root svgLayer", () => {
    const ax = AXES.find(a => a.id === "rootCaries");
    expect(ax?.svgLayer).toBe("caries-root");
    expect(ax?.appliesWhen?.({ toothPresent: true } as never, {} as never)).toBe(true);
    expect(ax?.appliesWhen?.({ toothPresent: false } as never, {} as never)).toBe(false);
  });

  it("secondaryCaries/radiographicDepth have NO AXES row (special-cased like cariesDepths)", () => {
    expect(AXES.find(a => a.field === "secondaryCaries")).toBeUndefined();
    expect(AXES.find(a => a.field === "radiographicDepth")).toBeUndefined();
  });
});
