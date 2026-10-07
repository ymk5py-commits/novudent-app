import { describe, it, expect } from "vitest";
import { proximosCumpleanos } from "./cumpleanos";

const ficha = (id: string, birthDate?: string) => ({ id, birthDate });
// Siempre hora local, como el navegador de la clínica: el resultado no depende del huso de quien corre el test.
const hoy = new Date(2026, 9, 7, 10, 30); // 7 de octubre de 2026, 10:30

describe("proximosCumpleanos", () => {
  it("el que cumple mañana es «en 1 día», no «hoy» (la fecha YYYY-MM-DD se lee en hora local)", () => {
    const r = proximosCumpleanos([ficha("a", "1988-10-08")], hoy);
    expect(r.map((c) => [c.p.id, c.inDays, c.turns])).toEqual([["a", 1, 38]]);
  });
  it("el que cumple hoy es «hoy»", () => {
    expect(proximosCumpleanos([ficha("a", "1990-10-07")], hoy).map((c) => [c.inDays, c.turns])).toEqual([[0, 36]]);
  });
  it("dentro de siete días entra y a los ocho no; los que ya cumplieron este año quedan para el próximo", () => {
    const r = proximosCumpleanos([ficha("a", "2000-10-14"), ficha("b", "2000-10-15"), ficha("c", "2000-10-06")], hoy);
    expect(r.map((c) => c.p.id)).toEqual(["a"]);
  });
  it("a fin de año mira el año que viene", () => {
    const r = proximosCumpleanos([ficha("a", "1995-01-02")], new Date(2026, 11, 30, 9, 0));
    expect(r.map((c) => [c.inDays, c.turns])).toEqual([[3, 32]]);
  });
  it("los ordena por cercanía y se saltea los que no tienen fecha o la tienen rota", () => {
    const r = proximosCumpleanos([ficha("a", "1980-10-12"), ficha("b"), ficha("c", "no-es-fecha"), ficha("d", "1985-10-08")], hoy);
    expect(r.map((c) => c.p.id)).toEqual(["d", "a"]);
  });
});
