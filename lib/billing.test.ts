import { describe, it, expect } from "vitest";
import { recordTotal, canSubmit, canRelease, submitToBilling, releaseFromHold } from "./billing";
import type { BillingRecord } from "./types";

const rec = (over: Partial<BillingRecord> = {}): BillingRecord =>
  ({ id: "b1", clinicId: "c", patientId: "p1", cpt: "D0120", dx: ["K02"], amount: 100000, discount: 0, extras: [], claimType: "electronic", flags: [], history: [], ...over } as unknown as BillingRecord);

describe("recordTotal", () => {
  it("principal − descuento + adicionales", () => {
    expect(recordTotal({ amount: 100000, discount: 20000, extras: [{ amount: 5000 } as any, { amount: 3000 } as any] })).toBe(88000);
  });
  it("sin extras ni descuento", () => {
    expect(recordTotal({ amount: 100000, discount: 0, extras: undefined })).toBe(100000);
  });
});

describe("máquina de estados de facturación", () => {
  it("submit electrónico → MBILLED + HOLD", () => {
    const r = submitToBilling(rec({ claimType: "electronic" }), "Carlos");
    expect(r.flags).toContain("MBILLED");
    expect(r.flags).toContain("HOLD");
    expect(r.flags).not.toContain("MGRHOLD");
    expect(r.holdReason).toBeTruthy();
  });
  it("submit manual → MBILLED + MGRHOLD", () => {
    const r = submitToBilling(rec({ claimType: "manual" }), "Carlos");
    expect(r.flags).toContain("MBILLED");
    expect(r.flags).toContain("MGRHOLD");
    expect(r.flags).not.toContain("HOLD");
  });
  it("submit es idempotente si ya está MBILLED", () => {
    const before = rec({ flags: ["MBILLED"] });
    expect(canSubmit(before)).toBe(false);
    expect(submitToBilling(before, "Carlos").flags).toEqual(["MBILLED"]);
  });
  it("release quita HOLD/MGRHOLD y agrega FACTURADO", () => {
    const r = releaseFromHold(rec({ flags: ["MBILLED", "HOLD"] }), "Carlos");
    expect(r.flags).not.toContain("HOLD");
    expect(r.flags).not.toContain("MGRHOLD");
    expect(r.flags).toContain("FACTURADO");
    expect(r.holdReason).toBeUndefined();
  });
  it("release no hace nada sin retención", () => {
    const before = rec({ flags: ["MBILLED"] });
    expect(canRelease(before)).toBe(false);
    expect(releaseFromHold(before, "Carlos").flags).toEqual(["MBILLED"]);
  });
});
