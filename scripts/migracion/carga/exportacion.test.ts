import { appendFileSync, mkdirSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ErrorDeExportacion, leerDocumentos, leerManifiesto, planDeCarga, ubicarExportacion, verificarArchivos } from "./exportacion.mjs";
import { COLECCIONES, baseSintetica, carpetaTemporal, escribirExportacion, limpiarCarpetas } from "./fixtures";

afterEach(limpiarCarpetas);

async function exportacion(opciones: Parameters<typeof escribirExportacion>[1] = {}) {
  const carpeta = carpetaTemporal();
  const manifiesto = await escribirExportacion(carpeta, opciones);
  return { carpeta, manifiesto };
}
const mal = (e: unknown) => (e as Error).message;

describe("ubicarExportacion", () => {
  const entorno = (carpeta: string) => ({ casa: carpeta, raizDelRepo: "/no/es/este/repo", directorioActual: "/" });

  it("usa la carpeta indicada si tiene manifiesto.json", async () => {
    const { carpeta } = await exportacion();
    expect(ubicarExportacion(carpeta, entorno("/tmp"))).toBe(carpeta);
  });

  it("por defecto mira ~/novudent-export y, si ahí hay carpetas por fecha, toma la más nueva que tenga manifiesto", async () => {
    const casa = carpetaTemporal("casa-");
    for (const dia of ["2026-10-09", "2026-10-17"]) await escribirExportacion(join(casa, "novudent-export", dia));
    mkdirSync(join(casa, "novudent-export", "2026-10-30")); // la más nueva no tiene manifiesto (exportación que no terminó): no vale
    expect(ubicarExportacion(null, entorno(casa))).toBe(join(casa, "novudent-export", "2026-10-17"));
  });

  it("falla con un mensaje claro si no hay ninguna exportación", () => {
    const casa = carpetaTemporal("casa-");
    expect(() => ubicarExportacion(null, entorno(casa))).toThrow(/No encuentro una exportación/);
    expect(() => ubicarExportacion(join(casa, "nada"), entorno(casa))).toThrow(/No encuentro una exportación/);
  });

  it("se niega a leer datos de pacientes que estén dentro del repositorio (también por un enlace simbólico)", async () => {
    const repo = carpetaTemporal("repo-");
    await escribirExportacion(join(repo, "export"));
    const e = { casa: "/tmp", raizDelRepo: repo, directorioActual: repo };
    expect(() => ubicarExportacion(join(repo, "export"), e)).toThrow(/dentro del repositorio/);
    expect(() => ubicarExportacion("export", e)).toThrow(/dentro del repositorio/); // relativa al directorio actual, que es el repo
    const fuera = carpetaTemporal("fuera-");
    symlinkSync(join(repo, "export"), join(fuera, "atajo"));
    expect(() => ubicarExportacion(join(fuera, "atajo"), { ...e, directorioActual: "/" })).toThrow(/dentro del repositorio/);
  });
});

describe("leerManifiesto y planDeCarga", () => {
  it("lista lo que se carga: primero las clínicas, después el resto de la raíz y por último cada clínica; no incluye directory ni serviceAccounts", async () => {
    const { carpeta } = await exportacion();
    const { entradas, advertencias } = planDeCarga(leerManifiesto(carpeta), COLECCIONES);
    expect(entradas.map((e: { clinica: string | null; coleccion: string }) => `${e.clinica ?? "-"}/${e.coleccion}`)).toEqual([
      "-/clinics", "-/subscriptions", "-/leads",
      "cl_demo/users", "cl_demo/patients", "c1/users", "c1/patients", "c1/appointments",
    ]);
    expect(entradas[0]).toMatchObject({ clinica: null, coleccion: "clinics", archivo: "raiz/clinics.jsonl", docs: 2 });
    expect(entradas.find((e: { coleccion: string }) => e.coleccion === "directory")).toBeUndefined();
    expect(advertencias.join("\n")).toMatch(/directory/); // se avisa que no se carga
  });

  it("una exportación de --solo-medir no sirve: no tiene los datos", async () => {
    const { carpeta } = await exportacion({ extra: { soloMedir: true } });
    expect(() => planDeCarga(leerManifiesto(carpeta), COLECCIONES)).toThrow(/--solo-medir/);
  });

  it("una exportación parcial (--clinica) o incompleta (colecciones sin leer) se rechaza, salvo que se pida lo contrario", async () => {
    const parcial = await exportacion({ extra: { clinicasFiltradas: ["c1"] } });
    expect(() => planDeCarga(leerManifiesto(parcial.carpeta), COLECCIONES)).toThrow(/parcial/i);
    expect(planDeCarga(leerManifiesto(parcial.carpeta), COLECCIONES, { permitirIncompleto: true }).entradas.length).toBeGreaterThan(0);

    const incompleta = await exportacion({ extra: { noLeidas: [{ ruta: "clinics/c1/patients", estado: 403, permiso: true }] } });
    expect(() => planDeCarga(leerManifiesto(incompleta.carpeta), COLECCIONES)).toThrow(/incompleta/i);
    expect(planDeCarga(leerManifiesto(incompleta.carpeta), COLECCIONES, { permitirIncompleto: true }).advertencias.join(" ")).toMatch(/incompleta/i);
  });

  it("una colección que no está en el manifiesto de la app se rechaza (si no, esos datos se perderían sin aviso), salvo --ignorar-desconocidas", async () => {
    const base = baseSintetica();
    base["clinics/c1/inventada"] = [{ id: "x1", data: { a: 1 } }];
    const { carpeta } = await exportacion({ base, colecciones: { ...{ "": ["clinics"], "clinics/c1": ["users", "inventada"] } } });
    expect(() => planDeCarga(leerManifiesto(carpeta), COLECCIONES)).toThrow(/inventada/);
    const plan = planDeCarga(leerManifiesto(carpeta), COLECCIONES, { ignorarDesconocidas: true });
    expect(plan.entradas.map((e: { coleccion: string }) => e.coleccion)).not.toContain("inventada");
    expect(plan.advertencias.join(" ")).toMatch(/inventada/);
  });

  it("avisa de una clínica sin documento (solo tiene subcolecciones) y de los documentos fantasma", async () => {
    const base = baseSintetica();
    base.clinics.push({ id: "huerfana", data: null }); // la API la devuelve «fantasma»: no existe pero tiene subcolecciones
    base["clinics/huerfana/users"] = [{ id: "uh", data: { id: "uh", name: "Sin clínica" } }];
    const { carpeta } = await exportacion({ base, colecciones: { "": ["clinics"], "clinics/huerfana": ["users"] } });
    const { advertencias, entradas } = planDeCarga(leerManifiesto(carpeta), COLECCIONES);
    expect(advertencias.join("\n")).toMatch(/huerfana.*sin documento|sin documento.*huerfana/);
    expect(entradas.map((e: { clinica: string | null }) => e.clinica)).toContain("huerfana"); // sus datos se cargan igual
  });

  it("un manifiesto que apunta a un archivo fuera de la exportación (../) se rechaza", async () => {
    const { carpeta, manifiesto } = await exportacion();
    manifiesto.raiz.clinics.archivo = "../robado.jsonl";
    writeFileSync(join(carpeta, "manifiesto.json"), JSON.stringify(manifiesto));
    expect(() => planDeCarga(leerManifiesto(carpeta), COLECCIONES)).toThrow(/archivo/);
  });

  it("un manifiesto ilegible o que no es de esta versión da un error claro", async () => {
    const carpeta = carpetaTemporal();
    writeFileSync(join(carpeta, "manifiesto.json"), "{no es json");
    expect(() => leerManifiesto(carpeta)).toThrow(/manifiesto/i);
    writeFileSync(join(carpeta, "manifiesto.json"), JSON.stringify({ hola: 1 }));
    expect(() => planDeCarga(leerManifiesto(carpeta), COLECCIONES)).toThrow(/manifiesto/i);
  });
});

describe("verificarArchivos", () => {
  const entradasDe = async (carpeta: string) => planDeCarga(leerManifiesto(carpeta), COLECCIONES).entradas;

  it("una exportación íntegra no tiene problemas", async () => {
    const { carpeta } = await exportacion();
    expect(await verificarArchivos(carpeta, await entradasDe(carpeta))).toEqual([]);
  });

  it("detecta un archivo alterado (mismo largo, otro contenido) por su SHA-256", async () => {
    const { carpeta } = await exportacion();
    const entradas = await entradasDe(carpeta);
    const ruta = join(carpeta, "clinicas/c1/patients.jsonl");
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace("Persona Sintética Uno", "Persona Sintética Uni"));
    const problemas = await verificarArchivos(carpeta, entradas);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatchObject({ coleccion: "patients", clinica: "c1" });
    expect(problemas[0].motivo).toMatch(/SHA-256/);
  });

  it("detecta un archivo cortado o con líneas de más (cantidad y tamaño no coinciden) y uno que falta", async () => {
    const { carpeta } = await exportacion();
    const entradas = await entradasDe(carpeta);
    appendFileSync(join(carpeta, "raiz/leads.jsonl"), `${JSON.stringify({ id: "l2", data: {} })}\n`);
    truncateSync(join(carpeta, "clinicas/c1/appointments.jsonl"), 10);
    rmSync(join(carpeta, "clinicas/cl_demo/users.jsonl"));
    const problemas = await verificarArchivos(carpeta, entradas);
    expect(problemas.map((p: { coleccion: string }) => p.coleccion).sort()).toEqual(["appointments", "leads", "users"]);
    expect(problemas.find((p: { coleccion: string }) => p.coleccion === "users")!.motivo).toMatch(/no está/);
  });
});

describe("leerDocumentos", () => {
  const primera = async (carpeta: string, coleccion: string, clinica: string | null = null) => {
    const entrada = planDeCarga(leerManifiesto(carpeta), COLECCIONES).entradas.find((e: { clinica: string | null; coleccion: string }) => e.coleccion === coleccion && e.clinica === clinica);
    return entrada;
  };
  const juntar = async (it: AsyncIterable<{ id: string; data: unknown }>) => { const r = []; for await (const d of it) r.push(d); return r; };

  it("entrega cada documento con su id y sus datos, en el orden del archivo, con los caracteres especiales intactos", async () => {
    const { carpeta } = await exportacion();
    const docs = await juntar(leerDocumentos(carpeta, await primera(carpeta, "patients", "c1")));
    expect(docs.map((d) => d.id)).toEqual(["p1", "p 2 ñ%.1"]);
    expect(docs[0].data).toMatchObject({ nombre: "Persona Sintética Uno", deuda: 1500000, ratio: 0.5, vacio: "", texto: "Ñandú — “comillas” \\ barra \n salto" });
  });

  it("falla sin copiar el contenido de la línea si una línea no es un documento válido", async () => {
    const casos: Array<[string, RegExp]> = [
      ["{esto no es json SECRETO", /no es JSON/],
      [JSON.stringify({ data: { a: 1 } }), /no tiene id/],
      [JSON.stringify({ id: "x", data: [1, 2] }), /datos/],
      [JSON.stringify({ id: "x", data: "SECRETO" }), /datos/],
    ];
    for (const [linea, esperado] of casos) {
      const { carpeta } = await exportacion();
      const entrada = await primera(carpeta, "leads");
      writeFileSync(join(carpeta, "raiz/leads.jsonl"), `${linea}\n`);
      const error = await juntar(leerDocumentos(carpeta, entrada)).catch((e) => e);
      expect(error).toBeInstanceOf(ErrorDeExportacion);
      expect(mal(error)).toMatch(esperado);
      expect(mal(error)).toMatch(/línea 1/);
      expect(mal(error)).not.toMatch(/SECRETO/);
    }
  });

  it("falla si un id aparece dos veces en el mismo archivo (se pisarían sin avisar)", async () => {
    const { carpeta } = await exportacion();
    const entrada = await primera(carpeta, "leads");
    const l = JSON.stringify({ id: "l1", data: { a: 1 } });
    writeFileSync(join(carpeta, "raiz/leads.jsonl"), `${l}\n${l}\n`);
    await expect(juntar(leerDocumentos(carpeta, entrada))).rejects.toThrow(/repetido/);
  });
});
