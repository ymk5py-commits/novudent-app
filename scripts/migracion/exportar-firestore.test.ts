import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { carpetaDeSalida, leerArgumentos, validarBase } from "./exportar-firestore.mjs";

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

describe("validarBase (--base nunca manda una credencial real a otro servidor)", () => {
  const MENSAJE = /--base solo se acepta con --credencial entorno, o apuntando a este equipo \(el emulador\): no mandamos un token real a otro servidor\./;
  const LOCALES = ["http://localhost:8080/v1/x", "http://127.0.0.1:8080/v1/x", "http://[::1]:8080/v1/x", "https://localhost/x", "http://LOCALHOST:8080/x"];
  const MODOS = ["firebase-cli", "servicio", "entorno"];

  it("sin --base no hay nada que validar, con cualquier credencial", () => {
    for (const modo of MODOS) expect(() => validarBase(null, modo)).not.toThrow();
    for (const modo of MODOS) expect(() => validarBase(undefined, modo)).not.toThrow();
  });
  it("un host de este equipo (localhost, 127.0.0.1, ::1) vale con todas las credenciales", () => {
    for (const base of LOCALES) for (const modo of MODOS) expect(() => validarBase(base, modo), `${base} · ${modo}`).not.toThrow();
  });
  it("otro servidor se rechaza con firebase-cli y con servicio, y vale con entorno (ese token lo puso la persona a propósito)", () => {
    const googleapis = "https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents";
    expect(() => validarBase(googleapis, "firebase-cli")).toThrow(MENSAJE);
    expect(() => validarBase(googleapis, "servicio")).toThrow(MENSAJE);
    expect(() => validarBase(googleapis, "entorno")).not.toThrow();
    expect(() => validarBase("https://ejemplo.com/x", "firebase-cli")).toThrow(MENSAJE);
  });
  it("un nombre que solo se parece a un host local no engaña (lo que cuenta es el host de verdad)", () => {
    for (const base of ["http://localhost.ejemplo.com/x", "http://127.0.0.1.ejemplo.com/x", "http://localhost@ejemplo.com/x", "http://ejemplo.com/localhost", "http://ejemplo.com:8080/?h=127.0.0.1", "http://10.0.0.5:8080/x"]) {
      expect(() => validarBase(base, "firebase-cli"), base).toThrow(MENSAJE);
    }
  });
  it("una URL mal formada falla con un mensaje claro (con cualquier credencial)", () => {
    for (const base of ["", "no es una url", "localhost:8080", "//localhost/x", "ftp://localhost/x"]) {
      for (const modo of MODOS) expect(() => validarBase(base, modo), `«${base}» · ${modo}`).toThrow(/--base no es una URL válida/);
    }
  });
});
