import { describe, it, expect } from "vitest";
import { CAPITULOS } from "./contenido";
import { validar } from "./montar";

describe("contenido del manual", () => {
  it("no tiene problemas: ids únicos, marcas cerradas, referencias que existen, capturas con cómo sacarlas", () => {
    expect(validar(CAPITULOS)).toEqual([]);
  });
});
