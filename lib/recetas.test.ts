import { describe, it, expect } from "vitest";
import { anularReceta, baseDeDuplicado, recetaHtml, recetasVisibles } from "./recetas";
import type { Prescription } from "./types";

const rx = (id: string, extra: Partial<Prescription> = {}): Prescription => ({
  id, date: "2026-10-04T12:00:00.000Z", dentistId: "u2", dentistName: "Dra. Sofía", items: [{ drug: "Amoxicilina 500 mg", dose: "1 cápsula", freq: "cada 8 horas", days: "7 días" }], ...extra,
});
const lista = [rx("r1", { budgetId: "g1" }), rx("r2"), rx("r3", { budgetId: "g1", voidedAt: "2026-10-04T13:00:00.000Z", voidedBy: "Ana" }), rx("r4", { budgetId: "g2" })];

describe("recetasVisibles", () => {
  it("por defecto oculta las anuladas", () => {
    expect(recetasVisibles(lista, { tratamiento: "todas", mostrarAnuladas: false }).map((r) => r.id)).toEqual(["r1", "r2", "r4"]);
    expect(recetasVisibles(lista, { tratamiento: "todas", mostrarAnuladas: true })).toHaveLength(4);
  });
  it("filtra por tratamiento o por las que no tienen", () => {
    expect(recetasVisibles(lista, { tratamiento: "g1", mostrarAnuladas: true }).map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(recetasVisibles(lista, { tratamiento: "sin", mostrarAnuladas: false }).map((r) => r.id)).toEqual(["r2"]);
  });
});

describe("anular y duplicar", () => {
  it("anular deja quién y cuándo, y no pisa una anulación anterior", () => {
    const a = anularReceta(rx("x"), { now: "2026-10-05T10:00:00.000Z", by: "Ana" });
    expect(a).toMatchObject({ voidedAt: "2026-10-05T10:00:00.000Z", voidedBy: "Ana" });
    expect(anularReceta(a, { now: "2026-10-06T10:00:00.000Z", by: "Bea" })).toBe(a);
  });
  it("duplicar copia medicamentos, indicaciones y tratamiento, sin compartir referencias", () => {
    const orig = rx("x", { notes: "Con comida", budgetId: "g1" });
    const base = baseDeDuplicado(orig);
    expect(base).toEqual({ items: orig.items, notes: "Con comida", budgetId: "g1" });
    base.items[0].drug = "otra";
    expect(orig.items[0].drug).toBe("Amoxicilina 500 mg");
    expect("notes" in baseDeDuplicado(rx("y"))).toBe(false);
  });
});

describe("recetaHtml", () => {
  it("escapa el texto y lleva medicamentos e indicaciones", () => {
    const h = recetaHtml(rx("x", { notes: "No <tomar> alcohol" }), { clinica: "Clínica", paciente: "Juan", fecha: "04-oct." });
    expect(h).toContain("Amoxicilina 500 mg");
    expect(h).toContain("1 cápsula — cada 8 horas — 7 días");
    expect(h).toContain("No &lt;tomar&gt; alcohol");
    expect(h).not.toContain("<tomar>");
  });
});
