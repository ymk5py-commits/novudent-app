import { describe, it, expect } from "vitest";
import { elegirBackend } from "./index";

describe("elegirBackend", () => {
  it("por defecto (sin valor, vacío o «Firestore») es Firestore", () => {
    for (const v of [undefined, "", "  ", "firestore", "Firestore"]) expect(elegirBackend(v).tipo).toBe("firestore");
  });
  it("supabase todavía no está disponible y lo dice", () => {
    expect(() => elegirBackend("supabase")).toThrow(/P3/);
  });
  it("un valor desconocido falla en vez de caer en Firestore sin avisar", () => {
    expect(() => elegirBackend("mongo")).toThrow(/desconocido/);
  });
});
