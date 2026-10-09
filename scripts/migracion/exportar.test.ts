import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ErrorDeLectura } from "./cliente.mjs";
import { crearEscritorDeArchivos, escritorNulo, exportarFirestore } from "./exportar.mjs";
import { armarInforme, proyectar } from "./informe.mjs";

const COLECCIONES = { porClinica: ["users", "patients", "directMessages"], raiz: ["clinics", "directory", "subscriptions"], noSeMigra: ["serviceAccounts"] };

type Fs = Record<string, unknown>;
const documento = (ruta: string, campos: Fs | null) => ({ name: `projects/p/databases/(default)/documents/${ruta}`, ...(campos ? { createTime: "t", fields: campos } : {}) });
const s = (v: string) => ({ stringValue: v });
const i = (v: number) => ({ integerValue: String(v) });

/** Un cliente falso con una base en memoria: `base["clinics/c1/patients"] = [documentos…]`. */
function clienteFalso(base: Record<string, unknown[]>, opciones: { colecciones?: Record<string, string[]>; falla?: Record<string, ErrorDeLectura> } = {}) {
  return {
    async *listarDocumentos(padre: string, coleccion: string) {
      const ruta = [padre, coleccion].filter(Boolean).join("/");
      if (opciones.falla?.[ruta]) throw opciones.falla[ruta];
      for (const d of base[ruta] ?? []) yield d;
    },
    async listarColecciones(ruta = "") { return opciones.colecciones?.[ruta] ?? []; },
  };
}

const carpetas: string[] = [];
const temporal = () => { const d = mkdtempSync(join(tmpdir(), "export-")); carpetas.push(d); return d; };
afterEach(() => { while (carpetas.length) rmSync(carpetas.pop()!, { recursive: true, force: true }); });

const baseDeEjemplo = () => ({
  clinics: [documento("clinics/c1", { name: s("Clínica Uno") }), documento("clinics/cl_demo", { name: s("Demo") })],
  "clinics/c1/users": [documento("clinics/c1/users/u1", { name: s("Ana") })],
  "clinics/c1/patients": [documento("clinics/c1/patients/p1", { nombre: s("Luis"), edad: i(40) }), documento("clinics/c1/patients/p 2", { nombre: s("Eva") })],
  "clinics/cl_demo/patients": [documento("clinics/cl_demo/patients/d1", { nombre: s("Demo") })],
  directory: [documento("directory/u1", { clinicId: s("c1") })],
});
const coleccionesDeLaBase = { "": ["clinics", "directory", "serviceAccounts"], "clinics/c1": ["users", "patients"], "clinics/cl_demo": ["patients"] };

describe("exportarFirestore", () => {
  it("escribe un JSONL por colección y clínica, con id y datos decodificados", async () => {
    const salida = temporal();
    await exportarFirestore({ cliente: clienteFalso(baseDeEjemplo(), { colecciones: coleccionesDeLaBase }), colecciones: COLECCIONES, escritor: crearEscritorDeArchivos(salida) });
    const lineas = readFileSync(join(salida, "clinicas/c1/patients.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lineas).toEqual([{ id: "p1", data: { nombre: "Luis", edad: 40 } }, { id: "p 2", data: { nombre: "Eva" } }]);
    expect(JSON.parse(readFileSync(join(salida, "raiz/directory.jsonl"), "utf8").trim())).toEqual({ id: "u1", data: { clinicId: "c1" } });
    expect(readdirSync(join(salida, "raiz")).sort()).toEqual(["clinics.jsonl", "directory.jsonl"]);
  });

  it("el manifiesto trae cantidades, bytes y el SHA-256 de cada archivo", async () => {
    const salida = temporal();
    const m = await exportarFirestore({ cliente: clienteFalso(baseDeEjemplo(), { colecciones: coleccionesDeLaBase }), colecciones: COLECCIONES, escritor: crearEscritorDeArchivos(salida) });
    const e = m.clinicas.c1.colecciones.patients;
    expect(e.docs).toBe(2);
    expect(e.bytes).toBe(statSync(join(salida, "clinicas/c1/patients.jsonl")).size);
    expect(e.sha256).toBe(createHash("sha256").update(readFileSync(join(salida, "clinicas/c1/patients.jsonl"))).digest("hex"));
    expect(m.clinicas.c1.documentos).toBe(3);
    expect(m.totales.documentos).toBe(7); // clínicas (2) + directory (1) + users de c1 (1) + patients de c1 (2) + patients de la demo (1)
  });

  it("no migra serviceAccounts, y avisa de las colecciones que no conoce (pero las exporta igual)", async () => {
    const base = { ...baseDeEjemplo(), "clinics/c1/inventado": [documento("clinics/c1/inventado/x", { a: s("1") })], nueva: [documento("nueva/n1", { a: s("1") })] };
    const salida = temporal();
    const m = await exportarFirestore({
      cliente: clienteFalso(base, { colecciones: { ...coleccionesDeLaBase, "": [...coleccionesDeLaBase[""], "nueva"], "clinics/c1": ["users", "patients", "inventado"] } }),
      colecciones: COLECCIONES, escritor: crearEscritorDeArchivos(salida),
    });
    expect(m.noMigradas).toEqual(["serviceAccounts"]);
    expect(m.desconocidas).toEqual({ raiz: ["nueva"], clinicas: { c1: ["inventado"] } });
    expect(readFileSync(join(salida, "clinicas/c1/inventado.jsonl"), "utf8")).toContain('"id":"x"');
    expect(readFileSync(join(salida, "raiz/nueva.jsonl"), "utf8")).toContain('"id":"n1"');
  });

  it("una colección que la base niega queda anotada como no leída y la exportación sigue", async () => {
    const falla = { "clinics/c1/directMessages": new ErrorDeLectura("denegado", { estado: 403, ruta: "clinics/c1/directMessages", permiso: true }) };
    const m = await exportarFirestore({
      cliente: clienteFalso(baseDeEjemplo(), { colecciones: { ...coleccionesDeLaBase, "clinics/c1": ["users", "directMessages", "patients"] }, falla }),
      colecciones: COLECCIONES, escritor: escritorNulo,
    });
    expect(m.noLeidas).toEqual([{ ruta: "clinics/c1/directMessages", estado: 403, permiso: true }]);
    expect(m.clinicas.c1.colecciones.directMessages.incompleta).toBe(true);
    expect(m.clinicas.c1.colecciones.patients.docs).toBe(2);
  });

  it("una clínica sin documento (solo subcolecciones) se exporta y queda marcada", async () => {
    const base = { clinics: [{ name: "projects/p/databases/(default)/documents/clinics/huerfana" }], "clinics/huerfana/patients": [documento("clinics/huerfana/patients/p1", { n: s("x") })] };
    const m = await exportarFirestore({ cliente: clienteFalso(base, { colecciones: { "": ["clinics"], "clinics/huerfana": ["patients"] } }), colecciones: COLECCIONES, escritor: escritorNulo });
    expect(m.documentosFantasma).toEqual(["clinics/huerfana"]);
    expect(m.clinicas.huerfana).toMatchObject({ sinDocumento: true, documentos: 1 });
    expect(m.raiz.clinics.docs).toBe(0);
  });

  it("--clinica limita las subcolecciones a las clínicas pedidas", async () => {
    const m = await exportarFirestore({ cliente: clienteFalso(baseDeEjemplo(), { colecciones: coleccionesDeLaBase }), colecciones: COLECCIONES, escritor: escritorNulo, clinicas: ["c1"] });
    expect(Object.keys(m.clinicas)).toEqual(["c1"]);
  });

  it("--clinica con un id que no existe falla con la lista de las que sí hay (nada de exportación vacía con código 0)", async () => {
    const salida = temporal();
    const cliente = clienteFalso(baseDeEjemplo(), { colecciones: coleccionesDeLaBase });
    await expect(exportarFirestore({ cliente, colecciones: COLECCIONES, escritor: crearEscritorDeArchivos(salida), clinicas: ["c1", "c11", "otra"] }))
      .rejects.toThrow("Clínicas que no existen en Firestore: c11, otra. Las que hay: c1, cl_demo");
    expect(existsSync(join(salida, "clinicas"))).toBe(false); // ni siquiera las subcolecciones de la que sí existe
    await expect(exportarFirestore({ cliente: clienteFalso({}), colecciones: COLECCIONES, escritor: escritorNulo, clinicas: ["c1"] }))
      .rejects.toThrow("Clínicas que no existen en Firestore: c1. Las que hay: (ninguna)");
  });

  it("--clinica no culpa al pedido si la lista de clínicas no se pudo leer (eso ya queda como «no leída»)", async () => {
    const falla = { clinics: new ErrorDeLectura("denegado", { estado: 403, ruta: "clinics", permiso: true }) };
    const m = await exportarFirestore({ cliente: clienteFalso(baseDeEjemplo(), { colecciones: coleccionesDeLaBase, falla }), colecciones: COLECCIONES, escritor: escritorNulo, clinicas: ["c1"] });
    expect(m.noLeidas).toEqual([{ ruta: "clinics", estado: 403, permiso: true }]);
  });

  it("el manifiesto anota el filtro de --clinica (clinicasFiltradas), y es null si no hubo filtro", async () => {
    const cliente = () => clienteFalso(baseDeEjemplo(), { colecciones: coleccionesDeLaBase });
    const filtrado = await exportarFirestore({ cliente: cliente(), colecciones: COLECCIONES, escritor: escritorNulo, clinicas: ["c1"] });
    expect(filtrado.clinicasFiltradas).toEqual(["c1"]);
    const completo = await exportarFirestore({ cliente: cliente(), colecciones: COLECCIONES, escritor: escritorNulo });
    expect(completo.clinicasFiltradas).toBeNull();
    const vacio = await exportarFirestore({ cliente: cliente(), colecciones: COLECCIONES, escritor: escritorNulo, clinicas: [] });
    expect(vacio.clinicasFiltradas).toBeNull();
    expect(Object.keys(vacio.clinicas).sort()).toEqual(["c1", "cl_demo"]); // [] es «sin filtro», no «ninguna clínica»
  });

  it("--solo-medir cuenta y calcula el SHA-256 sin escribir ningún archivo", async () => {
    const salida = temporal();
    const m = await exportarFirestore({ cliente: clienteFalso(baseDeEjemplo(), { colecciones: coleccionesDeLaBase }), colecciones: COLECCIONES, escritor: escritorNulo });
    expect(m.clinicas.c1.colecciones.patients.sha256).toHaveLength(64);
    expect(readdirSync(salida)).toEqual([]);
  });

  it("anota los documentos más grandes y los tipos que no son JSON puro", async () => {
    const base = { clinics: [documento("clinics/c1", { f: { timestampValue: "2026-01-02T03:04:05Z" } })], "clinics/c1/patients": [documento("clinics/c1/patients/p1", { x: s("a".repeat(500)) }), documento("clinics/c1/patients/p2", { x: s("b") })] };
    const m = await exportarFirestore({ cliente: clienteFalso(base, { colecciones: { "": ["clinics"], "clinics/c1": ["patients"] } }), colecciones: COLECCIONES, escritor: escritorNulo });
    expect(m.mayores[0]).toMatchObject({ ruta: "clinics/c1/patients", id: "p1" });
    expect(m.hallazgos.timestamp).toBe(1);
  });

  it("los ids con caracteres raros (%, espacios, #) van a una carpeta propia y no se escapan", async () => {
    const salida = temporal();
    const base = {
      clinics: [documento("clinics/100%", { n: s("x") }), documento("clinics/a b#c", { n: s("x") })],
      "clinics/100%/patients": [documento("clinics/100%/patients/p", { n: s("x") })],
      "clinics/a b#c/patients": [documento("clinics/a b#c/patients/p", { n: s("x") })],
    };
    await exportarFirestore({
      cliente: clienteFalso(base, { colecciones: { "": ["clinics"], "clinics/100%": ["patients"], "clinics/a b#c": ["patients"] } }),
      colecciones: COLECCIONES, escritor: crearEscritorDeArchivos(salida),
    });
    expect(readdirSync(join(salida, "clinicas")).sort()).toEqual(["100%25", "a%20b%23c"]);
    expect(readFileSync(join(salida, "clinicas/100%25/patients.jsonl"), "utf8")).toContain('"id":"p"');
  });
});

describe("informe", () => {
  const manifiesto = async () => exportarFirestore({ cliente: clienteFalso(baseDeEjemplo(), { colecciones: coleccionesDeLaBase }), colecciones: COLECCIONES, escritor: escritorNulo });

  it("proyecta el tamaño con 30 clínicas a partir del promedio de las reales (sin contar la demo)", async () => {
    const m = await manifiesto();
    const p = proyectar(m, 30)!;
    expect(p.clinicasReales).toBe(1);
    expect(p.promedioPorClinica).toBe(m.clinicas.c1.bytes);
    expect(p.exportado).toBe(m.clinicas.c1.bytes * 30);
    expect(p.enPostgres).toBe(p.exportado * 1.5);
  });

  it("sin clínicas reales no hay proyección", () => {
    expect(proyectar({ clinicas: { cl_demo: { bytes: 10 } } } as never)).toBeNull();
  });

  it("el informe resume, lista las clínicas y no incluye ningún dato de pacientes", async () => {
    const texto = armarInforme(await manifiesto(), { proyecto: "novudent-664f3", credencial: "dueno@x.com" });
    expect(texto).toContain("# Informe de volumen de Firestore");
    expect(texto).toContain("`c1`");
    expect(texto).toContain("Proyección para 30 clínicas");
    expect(texto).toContain("No se migran");
    expect(texto).not.toMatch(/Luis|Eva|Ana/);
  });

  it("una exportación filtrada con --clinica lo grita arriba del informe; una completa no dice nada", async () => {
    const cliente = () => clienteFalso(baseDeEjemplo(), { colecciones: coleccionesDeLaBase });
    const filtrado = armarInforme(await exportarFirestore({ cliente: cliente(), colecciones: COLECCIONES, escritor: escritorNulo, clinicas: ["c1"] }));
    const lineas = filtrado.split("\n").filter(Boolean);
    expect(lineas[0]).toBe("# Informe de volumen de Firestore");
    expect(lineas[1]).toBe("⚠️ Exportación PARCIAL: solo las clínicas c1. No sirve para migrar.");
    const varias = armarInforme(await exportarFirestore({ cliente: cliente(), colecciones: COLECCIONES, escritor: escritorNulo, clinicas: ["c1", "cl_demo"] }));
    expect(varias).toContain("⚠️ Exportación PARCIAL: solo las clínicas c1, cl_demo. No sirve para migrar.");
    const completo = armarInforme(await exportarFirestore({ cliente: cliente(), colecciones: COLECCIONES, escritor: escritorNulo }));
    expect(completo).not.toContain("PARCIAL");
    expect(armarInforme({ ...(await manifiesto()), clinicasFiltradas: undefined } as never)).not.toContain("PARCIAL"); // un manifiesto viejo, sin el campo
  });

  it("si algo no se pudo leer, el informe lo dice y avisa que la exportación está incompleta", async () => {
    const falla = { "clinics/c1/directMessages": new ErrorDeLectura("denegado", { estado: 403, ruta: "clinics/c1/directMessages", permiso: true }) };
    const m = await exportarFirestore({ cliente: clienteFalso(baseDeEjemplo(), { colecciones: { ...coleccionesDeLaBase, "clinics/c1": ["directMessages"] }, falla }), colecciones: COLECCIONES, escritor: escritorNulo });
    const texto = armarInforme(m);
    expect(texto).toContain("Lo que NO se pudo leer");
    expect(texto).toContain("incompleta");
  });
});
