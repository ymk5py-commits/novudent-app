import { describe, it, expect } from "vitest";
import { carpetaDeSalida, leerArgumentos } from "./exportar-firestore.mjs";

describe("leerArgumentos", () => {
  it("los valores por defecto", () => {
    expect(leerArgumentos([], {})).toMatchObject({ credencial: "firebase-cli", proyecto: "novudent-664f3", soloMedir: false, permitirIncompleto: false, clinicas: [], salida: null, base: null });
  });
  it("lee cada opción, y --clinica se repite", () => {
    const o = leerArgumentos(["--salida", "/x", "--credencial", "servicio", "--proyecto", "otro", "--base", "http://h", "--clinica", "a", "--clinica", "b", "--solo-medir", "--permitir-incompleto"], {});
    expect(o).toMatchObject({ salida: "/x", credencial: "servicio", proyecto: "otro", base: "http://h", clinicas: ["a", "b"], soloMedir: true, permitirIncompleto: true });
  });
  it("el proyecto por defecto sale de FIREBASE_PROJECT_ID", () => {
    expect(leerArgumentos([], { FIREBASE_PROJECT_ID: "mi-proyecto" }).proyecto).toBe("mi-proyecto");
  });
  it("una opción desconocida, un valor que falta o una credencial inválida fallan con un mensaje claro", () => {
    expect(() => leerArgumentos(["--rara"], {})).toThrow(/Opción desconocida/);
    expect(() => leerArgumentos(["--salida"], {})).toThrow(/Falta el valor de --salida/);
    expect(() => leerArgumentos(["--salida", "--solo-medir"], {})).toThrow(/Falta el valor/);
    expect(() => leerArgumentos(["--credencial", "magia"], {})).toThrow(/--credencial debe ser/);
  });
});

describe("carpetaDeSalida", () => {
  const base = { directorioActual: "/home/yo/proyecto", casa: "/home/yo", hoy: new Date("2026-10-09T12:00:00Z") };
  it("por defecto va a ~/novudent-export/<fecha>", () => {
    expect(carpetaDeSalida(null, base)).toBe("/home/yo/novudent-export/2026-10-09");
  });
  it("no deja guardar dentro del repositorio (ni en el propio directorio)", () => {
    expect(() => carpetaDeSalida("/home/yo/proyecto/salida", base)).toThrow(/dentro del repositorio/);
    expect(() => carpetaDeSalida("salida", base)).not.toThrow(); // relativa al cwd real de la prueba, que no es /home/yo/proyecto
    expect(() => carpetaDeSalida("/home/yo/proyecto", base)).toThrow(/dentro del repositorio/);
  });
  it("una carpeta hermana del repositorio sí vale", () => {
    expect(carpetaDeSalida("/home/yo/proyecto-export", base)).toBe("/home/yo/proyecto-export");
  });
});
