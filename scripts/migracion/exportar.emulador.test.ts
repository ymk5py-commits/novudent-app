/** El exportador completo contra Firestore de verdad (el emulador), con la API REST y el token «owner» (que se salta las reglas, como el CLI
 *  de Firebase en producción). Requiere Java y el CLI de Firebase: `npm run test:backend`. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
const RAIZ_DEL_REPO = fileURLToPath(new URL("../../", import.meta.url));
const PROGRAMA = join(RAIZ_DEL_REPO, "scripts/migracion/exportar-firestore.mjs");
/** Carpetas que crean las pruebas de la línea de comandos (las de afuera y las que SI el programa fallara quedarían en el repositorio). */
const temporales: string[] = [];

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
  for (const t of temporales) rmSync(t, { recursive: true, force: true });
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

describe("la línea de comandos contra el emulador", () => {
  const TOKEN_CORRECTO = "owner";
  /** Corre el programa de verdad (otro proceso de node), como lo haría `npm run migracion:exportar`. */
  function correr(args: string[], { token = TOKEN_CORRECTO, cwd = RAIZ_DEL_REPO, programa = PROGRAMA }: { token?: string; cwd?: string; programa?: string } = {}) {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    expect(host, "falta FIRESTORE_EMULATOR_HOST: corré `npm run test:backend`").toBeTruthy();
    const base = `http://${host}/v1/projects/${PROYECTO}/databases/(default)/documents`;
    return spawnSync(process.execPath, [programa, "--credencial", "entorno", "--proyecto", PROYECTO, "--base", base, ...args], {
      cwd,
      env: { ...process.env, GOOGLE_OAUTH_ACCESS_TOKEN: token },
      encoding: "utf8",
    });
  }
  /** Una carpeta de salida que todavía no existe, afuera del repositorio. */
  function salidaNueva() {
    const tmp = mkdtempSync(join(tmpdir(), "export-cli-"));
    temporales.push(tmp);
    return join(tmp, "salida");
  }
  const modo = (ruta: string) => statSync(ruta).mode & 0o777;
  const jsonl = (dir: string) => (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith(".jsonl"));

  it("exporta con código 0, carpeta 700 y archivos 600, y no imprime el token ni datos de pacientes", () => {
    const salida = salidaNueva();
    const r = correr(["--salida", salida]);
    expect(r.status, r.stderr).toBe(0);
    expect(modo(salida)).toBe(0o700);
    expect(modo(join(salida, "clinicas"))).toBe(0o700);
    expect(modo(join(salida, "clinicas/c1/patients.jsonl"))).toBe(0o600);
    expect(modo(join(salida, "manifiesto.json"))).toBe(0o600);
    expect(modo(join(salida, "informe-de-volumen.md"))).toBe(0o600);
    expect(readFileSync(join(salida, "informe-de-volumen.md"), "utf8")).toContain("Informe de volumen");
    expect(JSON.parse(readFileSync(join(salida, "manifiesto.json"), "utf8"))).toMatchObject({ proyecto: PROYECTO, soloMedir: false });
    for (const secreto of [TOKEN_CORRECTO, "Luis", "Clínica Uno", "Sin clínica", "hola"]) {
      expect(r.stderr).not.toContain(secreto);
      expect(r.stdout).not.toContain(secreto);
    }
  });

  it("si alguna colección no se puede leer sale con código 2, y con --permitir-incompleto con 0", () => {
    const sinPermiso = correr(["--salida", salidaNueva()], { token: "cualquiera" });
    expect(sinPermiso.status, sinPermiso.stderr).toBe(2);
    expect(sinPermiso.stderr).toContain("NO se pudieron leer");
    expect(sinPermiso.stderr).not.toContain("cualquiera");

    const permitido = correr(["--salida", salidaNueva(), "--permitir-incompleto"], { token: "cualquiera" });
    expect(permitido.status, permitido.stderr).toBe(0);
  });

  it("--solo-medir cuenta pero no guarda ningún dato de pacientes", () => {
    const salida = salidaNueva();
    const r = correr(["--salida", salida, "--solo-medir"]);
    expect(r.status, r.stderr).toBe(0);
    expect(jsonl(salida)).toEqual([]);
    expect(existsSync(join(salida, "manifiesto.json"))).toBe(true);
    expect(existsSync(join(salida, "informe-de-volumen.md"))).toBe(true);
    expect(JSON.parse(readFileSync(join(salida, "manifiesto.json"), "utf8"))).toMatchObject({ soloMedir: true });
  });

  it("se niega a guardar dentro del repositorio (código 1, sin crear la carpeta), corra desde donde corra", () => {
    const enLaRaiz = join(RAIZ_DEL_REPO, "export-prueba-cli");
    const enUnaSubcarpeta = join(RAIZ_DEL_REPO, "export-prueba-cli-2");
    temporales.push(enLaRaiz, enUnaSubcarpeta); // por si el programa fallara y la creara: no dejar datos en el repositorio
    const a = correr(["--salida", enLaRaiz]);
    expect(a.status, a.stderr).toBe(1);
    expect(a.stderr).toContain("dentro del repositorio");
    expect(existsSync(enLaRaiz)).toBe(false);

    const b = correr(["--salida", "../../export-prueba-cli-2"], { cwd: join(RAIZ_DEL_REPO, "scripts/migracion") });
    expect(b.status, b.stderr).toBe(1);
    expect(b.stderr).toContain("dentro del repositorio");
    expect(existsSync(enUnaSubcarpeta)).toBe(false);
  });

  it("invocado por un enlace simbólico también corre, y un error sale con código 1 (no 0 en silencio)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "export-enlace-"));
    temporales.push(tmp);
    const enlace = join(tmp, "enlace.mjs");
    symlinkSync(PROGRAMA, enlace);
    const rara = correr(["--rara"], { programa: enlace });
    expect(rara.status, rara.stderr).toBe(1);
    expect(rara.stderr).toContain("Opción desconocida");

    const ayuda = correr(["--ayuda"], { programa: enlace });
    expect(ayuda.status, ayuda.stderr).toBe(0);
    expect(ayuda.stdout).toContain("Uso:");
  });
});
