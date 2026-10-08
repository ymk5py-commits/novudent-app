import { describe, it, expect } from "vitest";
import { buildHistorial, etiquetaDeNota } from "./historial";

describe("buildHistorial", () => {
  it("combina las 5 fuentes y ordena descendente por fecha", () => {
    const r = buildHistorial({
      appointments: [{ id: "a1", start: "2026-03-01T10:00:00Z", title: "Control", status: "confirmada" } as any],
      ortho: { controls: [{ date: "2026-04-01T10:00:00Z", note: "Activación", by: "Dra" }] } as any,
      budgets: [{ id: "b1", items: [{ id: "i1", description: "Resina", status: "realizado", doneAt: "2026-05-01T10:00:00Z", doneBy: "Dra" }] } as any],
      payments: [{ id: "p1", date: "2026-02-01T10:00:00Z", concept: "Abono", amount: 1000, receivedBy: "Caja" } as any],
      emr: [{ id: "n1", createdAt: "2026-06-01T10:00:00Z", kind: "nota", text: "Nota", authorName: "Dra" } as any],
    });
    expect(r).toHaveLength(5);
    expect(r[0].kind).toBe("nota");           // 2026-06 = más reciente
    expect(r[r.length - 1].kind).toBe("pago"); // 2026-02 = más viejo
    expect(r.map((e) => e.kind)).toEqual(expect.arrayContaining(["cita", "evolucion", "prestacion"]));
  });

  it("tolera fuentes vacías", () => {
    expect(buildHistorial({ appointments: [], budgets: [], payments: [], emr: [] })).toEqual([]);
  });

  it("ignora prestaciones realizadas sin doneAt", () => {
    const r = buildHistorial({
      appointments: [], payments: [], emr: [],
      budgets: [{ id: "b", items: [{ id: "i", description: "x", status: "realizado" }] } as any],
    });
    expect(r).toHaveLength(0);
  });
});

describe("buildHistorial · documentos clínicos", () => {
  const doc = (id: string, patch: Record<string, unknown>) => ({
    id, nombre: "Historia Clínica", estado: "completado", createdAt: "2026-07-01T10:00:00Z", createdByName: "Laura",
    completedAt: "2026-07-02T10:00:00Z", completedBy: "Dra. Sofía", ...patch,
  }) as any;
  const base = { appointments: [], budgets: [], payments: [], emr: [] };

  it("suma los documentos completados, con quién los completó", () => {
    const r = buildHistorial({ ...base, documentos: [doc("d1", {})] });
    expect(r).toEqual([expect.objectContaining({
      id: "doc_d1", at: "2026-07-02T10:00:00Z", kind: "documento", title: "Documento clínico", detail: "Historia Clínica", by: "Dra. Sofía",
    })]);
  });

  it("no suma los pendientes ni los anulados", () => {
    const r = buildHistorial({ ...base, documentos: [doc("d2", { estado: "pendiente", completedAt: undefined }), doc("d3", { estado: "anulado" })] });
    expect(r).toEqual([]);
  });

  it("se ordena con el resto, de lo más nuevo a lo más viejo", () => {
    const r = buildHistorial({
      ...base,
      emr: [{ id: "n1", createdAt: "2026-07-03T10:00:00Z", kind: "nota", text: "x", authorName: "Dra" } as any],
      documentos: [doc("d1", {})],
    });
    expect(r.map((e) => e.kind)).toEqual(["nota", "documento"]);
  });
});

/* El Historial mostraba el tipo de la nota tal como se guarda («diagnostico», «plan») mientras que Evoluciones lo mostraba bien
   («Diagnóstico»): las dos pantallas tienen que decir lo mismo. */
describe("etiquetaDeNota y la insignia de las notas del Historial", () => {
  it("cada tipo de nota tiene su nombre en español, con tilde", () => {
    expect(etiquetaDeNota("diagnostico")).toBe("Diagnóstico");
    expect(etiquetaDeNota("tratamiento")).toBe("Tratamiento");
    expect(etiquetaDeNota("plan")).toBe("Plan");
    expect(etiquetaDeNota("nota")).toBe("Nota");
  });

  it("un tipo que no conoce se muestra como vino, en vez de romper", () => {
    expect(etiquetaDeNota("otro_tipo")).toBe("otro_tipo");
    expect(etiquetaDeNota("")).toBe("");
    // Un dato raro que se llame como una propiedad de Object tampoco rompe: sigue siendo texto.
    expect(etiquetaDeNota("constructor")).toBe("constructor");
    expect(etiquetaDeNota("toString")).toBe("toString");
  });

  it("la nota del timeline lleva la etiqueta legible, no el valor guardado", () => {
    const nota = (kind: string, id: string) => ({ id, createdAt: "2026-06-01T10:00:00Z", kind, text: "x", authorName: "Dra" }) as any;
    const r = buildHistorial({
      appointments: [], budgets: [], payments: [],
      emr: [nota("diagnostico", "n1"), nota("plan", "n2"), nota("tratamiento", "n3"), nota("nota", "n4")],
    });
    expect(r.map((e) => e.badge).sort()).toEqual(["Diagnóstico", "Nota", "Plan", "Tratamiento"]);
  });
});
