import { describe, it, expect } from "vitest";
import { newSignToken, canSign, validateSignPayload } from "./firma";

describe("newSignToken", () => {
  it("genera tokens largos, únicos y url-safe", () => {
    const a = newSignToken(), b = newSignToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(24);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("canSign", () => {
  it("solo permite firmar documentos pendientes", () => {
    expect(canSign({ status: "pendiente" } as any)).toBe(true);
    expect(canSign({ status: "firmado" } as any)).toBe(false);
    expect(canSign({ status: "anulado" } as any)).toBe(false);
    expect(canSign(null as any)).toBe(false);
  });
});

describe("validateSignPayload", () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  it("acepta un payload válido", () => {
    const r = validateSignPayload({ signatureImage: png, signedByName: "Juan Pérez" });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.signedByName).toBe("Juan Pérez"); expect(r.signatureImage).toBe(png); }
  });
  it("rechaza imagen que no es PNG data URL", () => {
    expect(validateSignPayload({ signatureImage: "http://x/a.png", signedByName: "X" }).ok).toBe(false);
    expect(validateSignPayload({ signatureImage: "", signedByName: "X" }).ok).toBe(false);
  });
  it("rechaza nombre vacío y recorta nombres largos", () => {
    expect(validateSignPayload({ signatureImage: png, signedByName: "  " }).ok).toBe(false);
    const long = validateSignPayload({ signatureImage: png, signedByName: "a".repeat(300) });
    expect(long.ok).toBe(true);
    if (long.ok) expect(long.signedByName.length).toBeLessThanOrEqual(120);
  });
  it("rechaza imágenes gigantes", () => {
    const huge = "data:image/png;base64," + "A".repeat(3_000_000);
    expect(validateSignPayload({ signatureImage: huge, signedByName: "X" }).ok).toBe(false);
  });
});
