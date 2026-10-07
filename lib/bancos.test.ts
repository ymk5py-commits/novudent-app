import { describe, it, expect } from "vitest";
import {
  nombreValido, agregarEntidad, renombrarEntidad, alternarActiva, quitarEntidad, sugerenciasDeBancos, agregarSugeridas, agruparPorTipo,
  ENTIDADES_SUGERIDAS_PY, MAX_ENTIDADES, type EntidadFinanciera,
} from "./bancos";

const E = (id: string, name: string, type: EntidadFinanciera["type"] = "banco", active = true): EntidadFinanciera => ({ id, name, type, active });

describe("nombreValido — el nombre que escribe la persona", () => {
  it("recorta y junta los espacios de más", () => {
    expect(nombreValido("  Banco   Itaú  ")).toBe("Banco Itaú");
  });
  it("rechaza lo vacío, lo de una letra y lo larguísimo", () => {
    for (const malo of ["", "   ", "A", "x".repeat(61)]) expect(nombreValido(malo), malo).toBeNull();
  });
  it("acepta los extremos", () => {
    expect(nombreValido("BN")).toBe("BN");
    expect(nombreValido("x".repeat(60))).toBe("x".repeat(60));
  });
});

describe("agregarEntidad", () => {
  it("suma la entidad como activa, sin tocar la lista que le pasaron", () => {
    const antes = [E("1", "Banco Itaú")];
    const r = agregarEntidad(antes, { name: " Banco Continental ", type: "banco" }, "2");
    expect(r).toEqual({ ok: true, lista: [E("1", "Banco Itaú"), E("2", "Banco Continental")] });
    expect(antes).toHaveLength(1);
  });
  it("no deja repetir un nombre, aunque cambien mayúsculas, tildes o espacios", () => {
    const lista = [E("1", "Banco Itaú")];
    for (const repetido of ["banco itau", "BANCO  ITAÚ", " Banco Itaú "]) {
      const r = agregarEntidad(lista, { name: repetido, type: "banco" }, "9");
      expect(r.ok, repetido).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/ya está/i);
    }
  });
  it("explica el nombre inválido", () => {
    const r = agregarEntidad([], { name: " ", type: "banco" }, "1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nombre/i);
  });
  it("pone un tope a la lista", () => {
    const llena = Array.from({ length: MAX_ENTIDADES }, (_, i) => E(String(i), `Entidad ${i}`));
    const r = agregarEntidad(llena, { name: "Una más", type: "banco" }, "x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/máximo/i);
  });
});

describe("renombrarEntidad", () => {
  it("cambia el nombre y deja el resto igual", () => {
    const r = renombrarEntidad([E("1", "Banco Itaú"), E("2", "Visión Banco")], "2", "Visión Banco S.A.E.C.A.");
    expect(r).toEqual({ ok: true, lista: [E("1", "Banco Itaú"), E("2", "Visión Banco S.A.E.C.A.")] });
  });
  it("puede guardar el mismo nombre con otras mayúsculas (no choca consigo misma)", () => {
    const r = renombrarEntidad([E("1", "banco itaú")], "1", "Banco Itaú");
    expect(r.ok).toBe(true);
  });
  it("no deja usar el nombre de otra entidad", () => {
    const r = renombrarEntidad([E("1", "Banco Itaú"), E("2", "Visión Banco")], "2", "banco itau");
    expect(r.ok).toBe(false);
  });
});

describe("alternarActiva / quitarEntidad", () => {
  it("activa y desactiva una entidad", () => {
    const l = [E("1", "A1"), E("2", "B2")];
    expect(alternarActiva(l, "2")).toEqual([E("1", "A1"), E("2", "B2", "banco", false)]);
    expect(alternarActiva(alternarActiva(l, "2"), "2")).toEqual(l);
  });
  it("saca una entidad por id", () => {
    expect(quitarEntidad([E("1", "A1"), E("2", "B2")], "1")).toEqual([E("2", "B2")]);
    expect(quitarEntidad([E("1", "A1")], "no-existe")).toEqual([E("1", "A1")]);
  });
});

describe("sugerenciasDeBancos — lo que se ofrece al anotar un cheque", () => {
  it("solo bancos, financieras y cooperativas activas, ordenadas y sin repetir", () => {
    const l = [
      E("1", "Visión Banco"), E("2", "Banco Atlas"), E("3", "Visa", "tarjeta"), E("4", "Banco Viejo", "banco", false),
      E("5", "Financiera El Comercio", "financiera"), E("6", "Coop. Medalla Milagrosa", "cooperativa"), E("7", "banco atlas"),
    ];
    expect(sugerenciasDeBancos(l)).toEqual(["Banco Atlas", "Coop. Medalla Milagrosa", "Financiera El Comercio", "Visión Banco"]);
  });
  it("sin entidades no ofrece nada", () => {
    expect(sugerenciasDeBancos([])).toEqual([]);
    expect(sugerenciasDeBancos(undefined)).toEqual([]);
  });
});

describe("agregarSugeridas — la lista orientativa de Paraguay", () => {
  it("trae bancos conocidos y no repite nombres", () => {
    const nombres = ENTIDADES_SUGERIDAS_PY.map((e) => e.name.toLowerCase());
    expect(new Set(nombres).size).toBe(nombres.length);
    expect(nombres).toContain("banco itaú");
    expect(ENTIDADES_SUGERIDAS_PY.some((e) => e.type === "tarjeta")).toBe(true);
  });
  it("agrega solo las que faltan y la segunda vez no agrega nada", () => {
    const uno = agregarSugeridas([E("x", "banco ITAU")], (i) => `n${i}`);
    expect(uno.agregadas).toBe(ENTIDADES_SUGERIDAS_PY.length - 1);
    expect(uno.lista).toHaveLength(ENTIDADES_SUGERIDAS_PY.length);
    expect(uno.lista.filter((e) => e.name.toLowerCase().includes("itaú") || e.name.toLowerCase().includes("itau"))).toHaveLength(1);
    expect(uno.lista.every((e) => e.active)).toBe(true);
    const dos = agregarSugeridas(uno.lista, (i) => `m${i}`);
    expect(dos.agregadas).toBe(0);
    expect(dos.lista).toEqual(uno.lista);
  });
  it("no se pasa del tope", () => {
    const casiLlena = Array.from({ length: MAX_ENTIDADES - 2 }, (_, i) => E(String(i), `Entidad ${i}`));
    const r = agregarSugeridas(casiLlena, (i) => `n${i}`);
    expect(r.lista).toHaveLength(MAX_ENTIDADES);
    expect(r.agregadas).toBe(2);
  });
});

describe("agruparPorTipo — para mostrar la lista ordenada", () => {
  it("agrupa en el orden banco, financiera, cooperativa, tarjeta, con cada grupo por nombre y sin grupos vacíos", () => {
    const l = [E("1", "Visa", "tarjeta"), E("2", "Visión Banco"), E("3", "Banco Atlas"), E("4", "Financiera El Comercio", "financiera")];
    expect(agruparPorTipo(l).map((g) => [g.tipo, g.entidades.map((e) => e.name)])).toEqual([
      ["banco", ["Banco Atlas", "Visión Banco"]],
      ["financiera", ["Financiera El Comercio"]],
      ["tarjeta", ["Visa"]],
    ]);
  });
  it("una lista vacía no tiene grupos", () => {
    expect(agruparPorTipo([])).toEqual([]);
    expect(agruparPorTipo(undefined)).toEqual([]);
  });
});
