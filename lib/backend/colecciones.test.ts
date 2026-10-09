import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  COLECCIONES_DE_CLINICA, COLECCIONES_DE_LA_TIENDA, COLECCIONES_QUE_NO_SE_MIGRAN, COLECCIONES_RAIZ, COLECCIONES_SOLO_SERVIDOR,
} from "./colecciones";
import { buildSeed } from "../seed";

const reglas = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const INICIO_CLINICA = reglas.indexOf("match /clinics/{cid} {");
const FIN_CLINICA = reglas.indexOf("match /{document=**}");
const nombresDeMatch = (texto: string) => [...texto.matchAll(/match \/([A-Za-z]+)\/\{[A-Za-z]+\}/g)].map((m) => m[1]);

describe("manifiesto de colecciones", () => {
  it("las subcolecciones de clinics/{cid} en firestore.rules son exactamente las del manifiesto", () => {
    expect(INICIO_CLINICA).toBeGreaterThan(0);
    expect(FIN_CLINICA).toBeGreaterThan(INICIO_CLINICA);
    const enReglas = nombresDeMatch(reglas.slice(INICIO_CLINICA + 10, FIN_CLINICA));
    expect([...new Set(enReglas)].sort()).toEqual([...COLECCIONES_DE_CLINICA].sort());
  });

  it("las colecciones de primer nivel en firestore.rules son las del manifiesto más las que no se migran", () => {
    // `match /databases/{database}/documents` es la raíz de Firestore, no una colección.
    const enReglas = ["clinics", ...nombresDeMatch(reglas.slice(0, INICIO_CLINICA)).filter((n) => n !== "databases")];
    expect([...new Set(enReglas)].sort()).toEqual([...COLECCIONES_RAIZ, ...COLECCIONES_QUE_NO_SE_MIGRAN].sort());
  });

  it("no hay nombres repetidos", () => {
    expect(new Set(COLECCIONES_DE_CLINICA).size).toBe(COLECCIONES_DE_CLINICA.length);
  });

  it("la tienda carga todas menos las que escribe solo el servidor", () => {
    expect(COLECCIONES_SOLO_SERVIDOR).toEqual(["slotLocks"]);
    expect([...COLECCIONES_DE_LA_TIENDA].sort()).toEqual(COLECCIONES_DE_CLINICA.filter((n) => n !== "slotLocks").sort());
  });

  it("coincide con las listas de la base (DB): cada colección de la tienda es una lista de la semilla, y al revés", () => {
    const semilla = buildSeed() as unknown as Record<string, unknown>;
    const listas = Object.keys(semilla).filter((k) => Array.isArray(semilla[k]) && k !== "clinics");
    expect(listas.sort()).toEqual([...COLECCIONES_DE_LA_TIENDA].sort());
  });
});
