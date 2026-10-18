import { describe, expect, it } from "vitest";
import { canonizar, hashDeDocumento } from "./canonico.mjs";

describe("canonizar", () => {
  it("ordena las claves de los objetos, también las anidadas, y no toca el orden de los arreglos", () => {
    expect(canonizar({ b: 1, a: { d: [3, 1, 2], c: null } })).toBe('{"a":{"c":null,"d":[3,1,2]},"b":1}');
  });
  it("distingue un número de su texto y conserva null, booleanos y unicode", () => {
    expect(canonizar({ n: 1, s: "1", t: true, f: false, z: null, u: "Ñandú ✓" })).toBe('{"f":false,"n":1,"s":"1","t":true,"u":"Ñandú ✓","z":null}');
  });
  it("un objeto vacío y un arreglo vacío son cosas distintas", () => {
    expect(canonizar({ a: {}, b: [] })).toBe('{"a":{},"b":[]}');
  });
});

describe("hashDeDocumento", () => {
  it("es un SHA-256 en hexadecimal", () => {
    expect(hashDeDocumento("p1", { a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
  it("no depende del orden de las claves (jsonb las reordena)", () => {
    expect(hashDeDocumento("p1", { a: 1, b: { x: 1, y: 2 } })).toBe(hashDeDocumento("p1", { b: { y: 2, x: 1 }, a: 1 }));
  });
  it("cambia si cambia el id, un valor, un tipo o el orden de un arreglo", () => {
    const base = hashDeDocumento("p1", { a: 1, l: [1, 2] });
    expect(hashDeDocumento("p2", { a: 1, l: [1, 2] })).not.toBe(base);
    expect(hashDeDocumento("p1", { a: 2, l: [1, 2] })).not.toBe(base);
    expect(hashDeDocumento("p1", { a: "1", l: [1, 2] })).not.toBe(base);
    expect(hashDeDocumento("p1", { a: 1, l: [2, 1] })).not.toBe(base);
  });
  it("un campo de más o de menos (incluso null) cambia el hash", () => {
    expect(hashDeDocumento("p1", { a: 1 })).not.toBe(hashDeDocumento("p1", { a: 1, b: null }));
  });
});
