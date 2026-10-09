/** El exportador completo contra Firestore de verdad (el emulador), con la API REST y el token «owner» (que se salta las reglas, como el CLI
 *  de Firebase en producción). Requiere Java y el CLI de Firebase: `npm run test:backend`. */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, GeoPoint, setDoc, Timestamp, writeBatch, type Firestore } from "firebase/firestore";
import { crearCliente } from "./cliente.mjs";
import { crearEscritorDeArchivos, exportarFirestore } from "./exportar.mjs";
import colecciones from "../../lib/backend/colecciones.json";

const PROYECTO = "novudent-exportar";
const REGLAS_CERRADAS = "rules_version = '2'; service cloud.firestore { match /databases/{d}/documents { match /{document=**} { allow read, write: if false; } } }";
let entorno: RulesTestEnvironment;
let carpeta: string;

beforeAll(async () => {
  carpeta = mkdtempSync(join(tmpdir(), "export-emu-"));
  entorno = await initializeTestEnvironment({ projectId: PROYECTO, firestore: { rules: REGLAS_CERRADAS } });
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, "clinics/c1"), { name: "Clínica Uno", plan: "clinica", config: { moneda: "PYG" } });
    await setDoc(doc(db, "clinics/cl_demo"), { name: "Demo" });
    await setDoc(doc(db, "clinics/c1/users/u1"), { name: "Ana", role: "admin" });
    await setDoc(doc(db, "clinics/c1/patients/p1"), { nombre: "Luis", fecha: Timestamp.fromDate(new Date("2026-01-02T03:04:05Z")), lugar: new GeoPoint(-25.3, -57.6), lista: [1, "a", { x: true }] });
    await setDoc(doc(db, "clinics/c1/directMessages/m1"), { participants: ["u1", "u2"], text: "hola" });
    await setDoc(doc(db, "clinics/c1/inventada/x"), { a: 1 });
    await setDoc(doc(db, "clinics/fantasma/patients/p9"), { nombre: "Sin clínica" });
    await setDoc(doc(db, "directory/u1"), { clinicId: "c1" });
    await setDoc(doc(db, "serviceAccounts/svc"), { x: 1 });
    // Más de 300 documentos: obliga a pasar de página (el tamaño de página de la exportación es 300).
    for (const desde of [0, 350]) {
      const lote = writeBatch(db);
      for (let n = desde; n < desde + 350; n++) lote.set(doc(db, `clinics/c1/stock/s${String(n).padStart(4, "0")}`), { n });
      await lote.commit();
    }
  });
}, 60_000);

afterAll(async () => {
  await entorno.cleanup();
  rmSync(carpeta, { recursive: true, force: true });
});

describe("exportarFirestore contra el emulador", () => {
  it("exporta todo, pasa de página y reconoce lo raro", async () => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    expect(host, "falta FIRESTORE_EMULATOR_HOST: corré `npm run test:backend`").toBeTruthy();
    const cliente = crearCliente({ proyecto: PROYECTO, token: "owner", base: `http://${host}/v1/projects/${PROYECTO}/databases/(default)/documents` });
    const m = await exportarFirestore({ cliente, colecciones, escritor: crearEscritorDeArchivos(carpeta) });

    expect(m.noLeidas).toEqual([]); // el token «owner» se salta las reglas cerradas, incluido directMessages
    expect(m.clinicas.c1.colecciones.stock.docs).toBe(700);
    expect(m.clinicas.c1.colecciones.directMessages.docs).toBe(1);
    expect(m.hallazgos).toMatchObject({ timestamp: 1, geopoint: 1 });
    expect(m.noMigradas).toEqual(["serviceAccounts"]);
    expect(m.desconocidas.clinicas).toEqual({ c1: ["inventada"] });
    expect(m.documentosFantasma).toEqual(["clinics/fantasma"]);
    expect(m.clinicas.fantasma).toMatchObject({ sinDocumento: true, documentos: 1 });
    expect(m.raiz.clinics.docs).toBe(2);
    expect(m.raiz.directory.docs).toBe(1);

    const archivo = join(carpeta, "clinicas/c1/patients.jsonl");
    expect(JSON.parse(readFileSync(archivo, "utf8").trim())).toEqual({
      id: "p1",
      data: { nombre: "Luis", fecha: "2026-01-02T03:04:05Z", lugar: { latitude: -25.3, longitude: -57.6 }, lista: [1, "a", { x: true }] },
    });
    expect(m.clinicas.c1.colecciones.patients.sha256).toBe(createHash("sha256").update(readFileSync(archivo)).digest("hex"));
    const ids = readFileSync(join(carpeta, "clinicas/c1/stock.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l).id);
    expect(new Set(ids).size).toBe(700);
  });

  it("sin credencial válida el emulador (con reglas cerradas) niega y queda anotado", async () => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    const cliente = crearCliente({ proyecto: PROYECTO, token: "cualquiera", base: `http://${host}/v1/projects/${PROYECTO}/databases/(default)/documents`, esperar: async () => {}, reintentos: 0 });
    const m = await exportarFirestore({ cliente, colecciones, escritor: { abrir: () => ({ escribir() {}, cerrar() {} }) } });
    expect(m.noLeidas.length).toBeGreaterThan(0);
    expect(m.totales.documentos).toBe(0);
  });
});
