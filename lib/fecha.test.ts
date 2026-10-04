import { describe, it, expect } from "vitest";
import { fechaLocal, parseFecha } from "./tareas";

describe("parseFecha", () => {
  it("una fecha de calendario es ese día en hora local, en cualquier huso", () => {
    const d = parseFecha("2026-11-04");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 4]);
    expect(fechaLocal(d)).toBe("2026-11-04");
  });
  it("un instante ISO completo se lee tal cual", () => {
    expect(parseFecha("2026-11-04T15:30:00.000Z").toISOString()).toBe("2026-11-04T15:30:00.000Z");
  });
});
