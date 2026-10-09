import { describe, it, expect } from "vitest";
import { decodificarDocumento, decodificarValor, nuevosHallazgos } from "./valores.mjs";

describe("decodificarValor", () => {
  it("texto, números, booleanos y null", () => {
    const h = nuevosHallazgos();
    expect(decodificarValor({ stringValue: "Ana" }, h)).toBe("Ana");
    expect(decodificarValor({ integerValue: "30" }, h)).toBe(30);
    expect(decodificarValor({ doubleValue: 1.7 }, h)).toBe(1.7);
    expect(decodificarValor({ booleanValue: false }, h)).toBe(false);
    expect(decodificarValor({ nullValue: null }, h)).toBeNull();
    expect(h).toEqual(nuevosHallazgos());
  });

  it("mapas y arreglos anidados", () => {
    const h = nuevosHallazgos();
    const v = { mapValue: { fields: { lista: { arrayValue: { values: [{ integerValue: "1" }, { stringValue: "a" }] } }, vacio: { mapValue: {} }, sinValores: { arrayValue: {} } } } };
    expect(decodificarValor(v, h)).toEqual({ lista: [1, "a"], vacio: {}, sinValores: [] });
  });

  it("los tipos que no son JSON puro se decodifican y se cuentan", () => {
    const h = nuevosHallazgos();
    expect(decodificarValor({ timestampValue: "2026-01-02T03:04:05Z" }, h)).toBe("2026-01-02T03:04:05Z");
    expect(decodificarValor({ geoPointValue: { latitude: 1, longitude: 2 } }, h)).toEqual({ latitude: 1, longitude: 2 });
    expect(decodificarValor({ referenceValue: "projects/p/databases/(default)/documents/clinics/c1" }, h)).toContain("clinics/c1");
    expect(decodificarValor({ bytesValue: "AAEC" }, h)).toBe("AAEC");
    expect(h).toMatchObject({ timestamp: 1, geopoint: 1, referencia: 1, bytes: 1 });
  });

  it("un entero que no entra en un número se conserva como texto y se cuenta", () => {
    const h = nuevosHallazgos();
    expect(decodificarValor({ integerValue: "9007199254740993" }, h)).toBe("9007199254740993");
    expect(decodificarValor({ doubleValue: "NaN" }, h)).toBe("NaN");
    expect(h).toMatchObject({ enteroGrande: 1, decimalEspecial: 1 });
  });

  it("un tipo desconocido da null y se cuenta", () => {
    const h = nuevosHallazgos();
    expect(decodificarValor({ algoNuevoValue: 1 }, h)).toBeNull();
    expect(h.desconocido).toBe(1);
  });
});

describe("decodificarDocumento", () => {
  it("saca el id del nombre (la API devuelve nombres sin codificar) y decodifica los campos", () => {
    const d = decodificarDocumento({ name: "projects/p/databases/(default)/documents/clinics/c1/patients/p 1", createTime: "x", fields: { n: { integerValue: "5" } } }, nuevosHallazgos());
    expect(d).toEqual({ id: "p 1", data: { n: 5 }, fantasma: false });
  });
  it("no decodifica el id: la API lo devuelve tal cual", () => {
    const h = nuevosHallazgos();
    expect(decodificarDocumento({ name: "projects/p/databases/(default)/documents/col/100%", createTime: "t", fields: {} }, h).id).toBe("100%");
    expect(decodificarDocumento({ name: "projects/p/databases/(default)/documents/col/D10%25", createTime: "t", fields: {} }, h).id).toBe("D10%25");
  });
  it("un documento vacío que existe no es fantasma; uno sin createTime ni campos sí", () => {
    const h = nuevosHallazgos();
    expect(decodificarDocumento({ name: "a/b/x", createTime: "t" }, h).fantasma).toBe(false);
    expect(decodificarDocumento({ name: "a/b/y" }, h)).toEqual({ id: "y", data: {}, fantasma: true });
  });
});
