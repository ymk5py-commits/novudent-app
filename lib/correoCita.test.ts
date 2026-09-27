import { describe, it, expect } from "vitest";
import { correoCita } from "./correoCita";

const base = { clinica: "Clínica Demo", paciente: "María", profesional: "Dra. Sofía Benítez", inicio: "2026-10-06T13:00:00.000Z", estado: "pendiente" as const };

describe("correoCita", () => {
  it("la confirmación dice cuándo, con quién y cómo avisar si no puede ir", () => {
    const c = correoCita("confirmacion", base);
    expect(c.asunto).toBe("Tu cita en Clínica Demo: martes, 6 de octubre a las 10:00");
    expect(c.texto).toContain("Profesional: Dra. Sofía Benítez");
    expect(c.texto).toContain("respondé este correo");
  });

  it("el aviso de estado usa el nombre nuevo del estado", () => {
    const c = correoCita("estado", { ...base, estado: "cancelada" });
    expect(c.asunto).toContain("anulado");
    expect(c.texto).toContain("«Anulado»");
  });

  it("escapa el HTML de los datos cargados", () => {
    const c = correoCita("confirmacion", { ...base, paciente: "<b>Ana</b>" });
    expect(c.html).not.toContain("<b>Ana</b>");
    expect(c.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
  });
});
