import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  // «hoy» a las 23:30 hora local: en un huso detrás de UTC, `toISOString()` ya diría el día siguiente.
  const base = { raizDelRepo: "/home/yo/proyecto", directorioActual: "/home/yo/proyecto", casa: "/home/yo", hoy: new Date(2026, 9, 9, 23, 30) };
  it("por defecto va a ~/novudent-export/<fecha local>", () => {
    expect(carpetaDeSalida(null, base)).toBe("/home/yo/novudent-export/2026-10-09");
  });
  it("no deja guardar dentro del repositorio (ni en su raíz, ni con una ruta relativa)", () => {
    expect(() => carpetaDeSalida("/home/yo/proyecto/salida", base)).toThrow(/dentro del repositorio/);
    expect(() => carpetaDeSalida("salida", base)).toThrow(/dentro del repositorio/); // el directorio actual ES el repositorio
    expect(() => carpetaDeSalida("/home/yo/proyecto", base)).toThrow(/dentro del repositorio/);
  });
  it("la guarda se ancla en la raíz del repositorio, no en el directorio desde donde se corre", () => {
    const desdeUnaSubcarpeta = { ...base, directorioActual: "/home/yo/proyecto/scripts/migracion" };
    expect(() => carpetaDeSalida("../../export", desdeUnaSubcarpeta)).toThrow(/dentro del repositorio/);
    expect(() => carpetaDeSalida("/home/yo/proyecto/scripts/x", desdeUnaSubcarpeta)).toThrow(/dentro del repositorio/);
    expect(carpetaDeSalida("../../../fuera", desdeUnaSubcarpeta)).toBe("/home/yo/fuera");
    // y al revés: desde afuera, una ruta relativa que cae adentro también se rechaza
    expect(() => carpetaDeSalida("proyecto/export", { ...base, directorioActual: "/home/yo" })).toThrow(/dentro del repositorio/);
  });
  it("una carpeta cuyo nombre empieza con «..» pero está adentro del repositorio no se confunde con una de afuera", () => {
    expect(() => carpetaDeSalida("/home/yo/proyecto/..export", base)).toThrow(/dentro del repositorio/);
    expect(() => carpetaDeSalida("/home/yo/proyecto/...x", base)).toThrow(/dentro del repositorio/);
  });
  it("una carpeta hermana del repositorio, o cualquiera de afuera, sí vale", () => {
    expect(carpetaDeSalida("/home/yo/proyecto-export", base)).toBe("/home/yo/proyecto-export");
    expect(carpetaDeSalida("/tmp/otra", base)).toBe("/tmp/otra");
  });
  it("sigue los enlaces simbólicos: una carpeta de afuera que apunta adentro del repositorio no vale", () => {
    const tmp = mkdtempSync(join(tmpdir(), "salida-enlace-"));
    try {
      const repo = join(tmp, "repo");
      const fuera = join(tmp, "fuera");
      mkdirSync(join(repo, "interna"), { recursive: true });
      mkdirSync(fuera);
      symlinkSync(join(repo, "interna"), join(fuera, "enlace"));
      const opciones = { raizDelRepo: repo, directorioActual: fuera, casa: fuera, hoy: base.hoy };
      expect(() => carpetaDeSalida(join(fuera, "enlace"), opciones)).toThrow(/dentro del repositorio/);
      expect(() => carpetaDeSalida(join(fuera, "enlace", "nueva", "mas"), opciones)).toThrow(/dentro del repositorio/); // aunque todavía no exista
      expect(carpetaDeSalida(join(fuera, "otra"), opciones)).toBe(join(fuera, "otra"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
