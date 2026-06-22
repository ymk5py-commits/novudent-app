import { describe, it, expect } from "vitest";
import { botikaMessage } from "./botika";
import type { DB } from "./types";

const dbWith = (template?: string): DB =>
  ({ clinics: [{ id: "c", name: "Aura", config: template ? { botika: { templates: { confirmCita: template } } } : {} }] } as unknown as DB);

describe("botikaMessage", () => {
  it("sustituye los placeholders de la plantilla configurada", () => {
    const db = dbWith("Hola {paciente}, tu cita es el {fecha} a las {hora}.");
    expect(botikaMessage(db, "confirmCita", { paciente: "Ana", fecha: "lunes", hora: "10:00" }))
      .toBe("Hola Ana, tu cita es el lunes a las 10:00.");
  });
  it("placeholders sin valor quedan vacíos", () => {
    const db = dbWith("Hola {paciente}, saldo {saldo}.");
    expect(botikaMessage(db, "confirmCita", { paciente: "Ana" })).toBe("Hola Ana, saldo .");
  });
  it("cae a la plantilla por defecto si la clínica no configuró una", () => {
    const msg = botikaMessage(dbWith(), "confirmCita", { paciente: "Ana", clinica: "Aura" });
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toContain("Ana");        // sustituyó {paciente}
    expect(msg).not.toContain("{paciente}");
  });
});
