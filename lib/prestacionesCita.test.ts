import { describe, it, expect } from "vitest";
import { tituloDeCita, planesParaCita, alternarItem, budgetIdDeCita, textoPrestacion, nombreDelPlan, prestacionDeItem, estaTildado } from "./prestacionesCita";
import type { Budget, BudgetItem, PrestacionCita } from "./types";

/* «Procedimiento a realizar» de «Dar cita» (pedido de Camila, 8-oct-2026): «¿cómo se define qué procedimiento se va a realizar el paciente
   para que aparezca en la agenda?». Se eligen prestaciones de sus planes de tratamiento, del arancel o un motivo escrito a mano. */

const item = (id: string, extra: Partial<BudgetItem> = {}): BudgetItem =>
  ({ id, cpt: "D2330", description: "Resina compuesta — 1 superficie", price: 420000, status: "pendiente", ...extra });
const plan = (id: string, extra: Partial<Budget> = {}): Budget => ({
  id, clinicId: "cl_demo", patientId: "p1", dentistId: "u2", createdAt: "2026-10-01T12:00:00.000Z", status: "presentado",
  items: [item(`${id}_1`, { tooth: "16" })], history: [], ...extra,
});
const todos = () => true;

describe("tituloDeCita", () => {
  it("sin prestaciones queda el título de siempre (el tipo de consulta o el que traía)", () => {
    expect(tituloDeCita(undefined, "Consulta")).toBe("Consulta");
    expect(tituloDeCita([], "Ortodoncia")).toBe("Ortodoncia");
  });

  it("con una, su descripción; con varias, la primera y « +N»", () => {
    const p: PrestacionCita[] = [{ description: "Profilaxis (adulto)" }, { description: "Blanqueamiento" }, { description: "Control" }];
    expect(tituloDeCita(p.slice(0, 1), "Consulta")).toBe("Profilaxis (adulto)");
    expect(tituloDeCita(p, "Consulta")).toBe("Profilaxis (adulto) +2");
  });
});

describe("planesParaCita", () => {
  it("ofrece los planes del paciente que siguen abiertos, de los doctores que se ven, con sus prestaciones pendientes", () => {
    const budgets = [
      plan("g1", { items: [item("a", { tooth: "16" }), item("b", { status: "realizado" }), item("c", { cpt: "D1110", description: "Profilaxis (adulto)" })] }),
      plan("anulado", { status: "anulado" }),
      plan("completado", { status: "completado" }),
      plan("otro-paciente", { patientId: "p2" }),
      plan("otro-doctor", { dentistId: "u4" }),
    ];
    const r = planesParaCita(budgets, "p1", (id) => id === "u2");
    expect(r.map((x) => x.budget.id)).toEqual(["g1"]);
    expect(r[0].items.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("un plan sin nada pendiente no aparece, y los más nuevos van primero", () => {
    const budgets = [
      plan("viejo", { createdAt: "2026-09-01T12:00:00.000Z" }),
      plan("nuevo", { createdAt: "2026-10-05T12:00:00.000Z", status: "aceptado" }),
      plan("hecho", { items: [item("x", { status: "realizado" })] }),
    ];
    expect(planesParaCita(budgets, "p1", todos).map((x) => x.budget.id)).toEqual(["nuevo", "viejo"]);
  });

  it("sin paciente elegido no hay planes", () => {
    expect(planesParaCita([plan("g1")], "", todos)).toEqual([]);
  });
});

describe("tildar prestaciones de un plan", () => {
  it("tildar agrega la prestación con su plan, su código y su pieza; destildarla la quita y el resto queda en su orden", () => {
    const g = plan("g1");
    const it16 = g.items[0];
    const otro: PrestacionCita = { cpt: "D9972", description: "Blanqueamiento dental (arcada)" };
    const tildada = alternarItem([otro], g, it16);
    expect(tildada).toEqual([otro, { cpt: "D2330", description: "Resina compuesta — 1 superficie", tooth: "16", budgetId: "g1", itemId: "g1_1" }]);
    expect(estaTildado(tildada, "g1", "g1_1")).toBe(true);
    expect(alternarItem(tildada, g, it16)).toEqual([otro]);
  });

  it("una prestación sin pieza no lleva el campo (Firestore no acepta undefined)", () => {
    expect(prestacionDeItem(plan("g1"), item("p", { cpt: "D1110", description: "Profilaxis (adulto)" }))).not.toHaveProperty("tooth");
  });
});

describe("budgetIdDeCita", () => {
  it("la cita queda en el plan de la primera prestación tildada de un plan", () => {
    expect(budgetIdDeCita([{ description: "Otro" }, { description: "x", budgetId: "g2", itemId: "i" }, { description: "y", budgetId: "g1", itemId: "j" }], { budgetId: "g9" })).toBe("g2");
  });

  it("sin prestaciones de un plan conserva el que traía (reagendar una cita de un plan)", () => {
    expect(budgetIdDeCita([], { budgetId: "g1" })).toBe("g1");
    expect(budgetIdDeCita([{ description: "Control" }], {})).toBeUndefined();
  });

  it("si el plan venía de prestaciones que se destildaron todas, la cita deja de estar en ese plan", () => {
    expect(budgetIdDeCita([{ description: "Control" }], { budgetId: "g1", prestaciones: [{ description: "x", budgetId: "g1", itemId: "i" }] })).toBeUndefined();
  });
});

describe("textos", () => {
  it("una prestación se lee con su pieza: «Resina compuesta — 1 superficie · pieza 16»", () => {
    expect(textoPrestacion({ description: "Resina compuesta — 1 superficie", tooth: "16" })).toBe("Resina compuesta — 1 superficie · pieza 16");
    expect(textoPrestacion({ description: "Profilaxis (adulto)" })).toBe("Profilaxis (adulto)");
  });

  it("un plan sin nombre se llama «Plan de tratamiento»", () => {
    expect(nombreDelPlan(plan("g1", { name: "Plan dental integral" }))).toBe("Plan dental integral");
    expect(nombreDelPlan(plan("g1", { name: "  " }))).toBe("Plan de tratamiento");
  });
});
