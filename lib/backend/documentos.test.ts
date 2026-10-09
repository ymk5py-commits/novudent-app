import { describe, it, expect } from "vitest";
import { limpiar, mezclarProfundo } from "./documentos";

describe("limpiar", () => {
  it("saca los undefined y devuelve una copia", () => {
    const original = { a: 1, b: undefined, c: { d: undefined, e: [1, undefined] } };
    const copia = limpiar(original);
    expect(copia).toStrictEqual({ a: 1, c: { e: [1, null] } });
    expect(copia).not.toBe(original);
  });
});

describe("mezclarProfundo (igual que setDoc con merge:true de Firestore)", () => {
  it("mezcla los mapas en profundidad y conserva lo que el parche no menciona", () => {
    const base = { name: "A", config: { a: { x: 1, y: 2 }, z: 9 } };
    expect(mezclarProfundo(base, { config: { a: { y: 20 } } })).toStrictEqual({ name: "A", config: { a: { x: 1, y: 20 }, z: 9 } });
  });
  it("reemplaza los arreglos enteros y los valores simples, incluido null", () => {
    const base = { lista: [1, 2, 3], n: 1, texto: "a" };
    expect(mezclarProfundo(base, { lista: [7], n: null })).toStrictEqual({ lista: [7], n: null, texto: "a" });
  });
  it("un valor simple pisa un mapa y un mapa pisa un valor simple", () => {
    expect(mezclarProfundo({ a: { x: 1 } }, { a: 5 })).toStrictEqual({ a: 5 });
    expect(mezclarProfundo({ a: 5 }, { a: { x: 1 } })).toStrictEqual({ a: { x: 1 } });
  });
  it("ignora los undefined del parche y no modifica los originales", () => {
    const base = { a: { x: 1 } };
    const parche = { a: { y: undefined }, b: undefined };
    const r = mezclarProfundo(base, parche);
    expect(r).toStrictEqual({ a: { x: 1 } });
    expect(base).toStrictEqual({ a: { x: 1 } });
    expect(parche.a).toStrictEqual({ y: undefined });
  });
});
