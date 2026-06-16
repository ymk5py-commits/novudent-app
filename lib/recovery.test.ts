import { describe, it, expect } from "vitest";
import { isSurgicalProcedure, buildMonitor, worstSeverity, SURGICAL_CPTS } from "./recovery";

describe("isSurgicalProcedure", () => {
  it("marca exodoncia (D7140) como quirúrgica", () => {
    expect(isSurgicalProcedure({ cpt: "D7140", description: "Exodoncia", price: 0 } as any)).toBe(true);
  });
  it("respeta el flag surgical explícito sobre el CPT", () => {
    expect(isSurgicalProcedure({ cpt: "D0120", description: "Consulta", price: 0, surgical: true } as any)).toBe(true);
    expect(isSurgicalProcedure({ cpt: "D7140", description: "x", price: 0, surgical: false } as any)).toBe(false);
  });
  it("no quirúrgica una consulta común", () => {
    expect(isSurgicalProcedure({ cpt: "D0120", description: "Consulta", price: 0 } as any)).toBe(false);
  });
});

describe("buildMonitor", () => {
  it("crea 3 touchpoints a +24/48/72h desde now", () => {
    const now = new Date("2026-06-16T10:00:00.000Z");
    const m = buildMonitor({ id: "m1", clinicId: "c", patientId: "p", dentistId: "d", procedure: "Exodoncia (D7140)", now });
    expect(m.touchpoints.map((t) => t.offsetHours)).toEqual([24, 48, 72]);
    expect(m.touchpoints[0].dueAt).toBe("2026-06-17T10:00:00.000Z");
    expect(m.touchpoints[2].dueAt).toBe("2026-06-19T10:00:00.000Z");
    expect(m.status).toBe("activo");
    expect(m.touchpoints.every((t) => t.status === "pendiente")).toBe(true);
  });
});

describe("worstSeverity", () => {
  it("rojo gana sobre amarillo y verde", () => {
    expect(worstSeverity([{ severity: "verde" }, { severity: "rojo" }, { severity: "amarillo" }] as any)).toBe("rojo");
  });
  it("undefined si no hay severidades", () => {
    expect(worstSeverity([{}, {}] as any)).toBeUndefined();
  });
});
