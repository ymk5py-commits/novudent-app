import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { crearAlmacenEnMemoria } from "./carga/almacen.mjs";
import { COLECCIONES, carpetaTemporal, escribirExportacion, gotrueFalso, limpiarCarpetas } from "./carga/fixtures";
import { leerArgumentos, principal, validarDestino } from "./cargar-postgres.mjs";

afterEach(limpiarCarpetas);

const CLAVE = "clave-service-role-SUPERSECRETA";
const URL_BASE = "postgres://supabase_admin:CLAVEDELABASE@127.0.0.1:18101/postgres";
const ENTORNO = { NOVUDENT_CARGA_SERVICE_KEY: CLAVE };

describe("leerArgumentos", () => {
  it("no tiene ningún valor por defecto para la base ni para GoTrue", () => {
    expect(leerArgumentos([], {})).toMatchObject({ urlBase: null, urlGotrue: null, claveServicio: null, soloVerificar: false, dryRun: false, exportacion: null, informe: null });
  });
  it("lee las opciones y las variables de entorno explícitas (NOVUDENT_CARGA_*)", () => {
    const o = leerArgumentos(["--exportacion", "/x", "--url-base", "postgres://u@h/db", "--url-gotrue", "http://h/auth/v1", "--solo-verificar", "--permitir-incompleto", "--ignorar-desconocidas", "--lote", "50", "--informe", "/tmp/i.md"], {});
    expect(o).toMatchObject({ exportacion: "/x", urlBase: "postgres://u@h/db", urlGotrue: "http://h/auth/v1", soloVerificar: true, permitirIncompleto: true, ignorarDesconocidas: true, tamanoDeLote: 50, informe: "/tmp/i.md" });
    const e = leerArgumentos([], { NOVUDENT_CARGA_DB_URL: "postgres://u:p@h/db", NOVUDENT_CARGA_GOTRUE_URL: "http://h/auth/v1", NOVUDENT_CARGA_SERVICE_KEY: "k" });
    expect(e).toMatchObject({ urlBase: "postgres://u:p@h/db", urlGotrue: "http://h/auth/v1", claveServicio: "k" });
  });
  it("una opción desconocida o un argumento suelto no se repiten en el mensaje (podrían ser una URL con la clave)", () => {
    for (const mal of ["--url-base=postgres://u:SECRETO@h/db", "postgres://u:SECRETO@h/db", "--clave=SECRETO"]) {
      let mensaje = "";
      try { leerArgumentos([mal], {}); } catch (e) { mensaje = (e as Error).message; }
      expect(mensaje).toMatch(/Opción desconocida|Argumento inesperado/);
      expect(mensaje).not.toContain("SECRETO");
    }
    expect(() => leerArgumentos(["--url-base=x"], {})).toThrow(/--url-base=/); // pero dice cuál opción es y que el valor va separado
  });
  it("--aceptar-sin-correo se lee como opción", () => {
    expect(leerArgumentos(["--aceptar-sin-correo"], {}).aceptarSinCorreo).toBe(true);
    expect(leerArgumentos([], {}).aceptarSinCorreo).toBe(false);
  });
  it("la clave de servicio solo se lee del entorno (no hay opción para ponerla en la línea de comandos)", () => {
    expect(() => leerArgumentos(["--clave-servicio", "x"], {})).toThrow(/Opción desconocida/);
  });
  it("--sobrescribir se lee como opción", () => {
    expect(leerArgumentos(["--sobrescribir"], {}).sobrescribir).toBe(true);
    expect(leerArgumentos([], {}).sobrescribir).toBe(false);
  });
  it("--dry-run y --solo-verificar no se combinan; las opciones desconocidas y los valores que faltan fallan", () => {
    expect(() => leerArgumentos(["--dry-run", "--solo-verificar"], {})).toThrow(/no se combinan/);
    expect(() => leerArgumentos(["--rara"], {})).toThrow(/Opción desconocida/);
    expect(() => leerArgumentos(["--url-base"], {})).toThrow(/Falta el valor de --url-base/);
    expect(() => leerArgumentos(["--lote", "0"], {})).toThrow(/--lote/);
    expect(() => leerArgumentos(["--lote", "abc"], {})).toThrow(/--lote/);
  });
});

describe("validarDestino", () => {
  const base = { dryRun: false, soloVerificar: false, urlBase: URL_BASE, urlGotrue: "http://127.0.0.1:18100/auth/v1", claveServicio: CLAVE };
  it("cargar y verificar exigen la base, GoTrue y la clave", () => {
    expect(() => validarDestino({ ...base })).not.toThrow();
    expect(() => validarDestino({ ...base, urlBase: null })).toThrow(/--url-base/);
    expect(() => validarDestino({ ...base, urlGotrue: null })).toThrow(/--url-gotrue/);
    expect(() => validarDestino({ ...base, claveServicio: null })).toThrow(/NOVUDENT_CARGA_SERVICE_KEY/);
    expect(() => validarDestino({ ...base, soloVerificar: true, urlBase: null })).toThrow(/--url-base/);
  });
  it("el simulacro puede ir sin nada (solo valida la exportación), pero una URL a medias es un error", () => {
    const vacio = { dryRun: true, soloVerificar: false, urlBase: null, urlGotrue: null, claveServicio: null };
    expect(() => validarDestino(vacio)).not.toThrow();
    expect(() => validarDestino({ ...vacio, urlGotrue: "http://h/auth/v1" })).toThrow(/NOVUDENT_CARGA_SERVICE_KEY/);
    expect(() => validarDestino({ ...vacio, claveServicio: "k" })).toThrow(/--url-gotrue/);
  });
  it("GoTrue por http:// solo si es este equipo, una red privada o un nombre interno; a cualquier otro servidor hace falta https:// (la clave de servicio viaja en cada pedido)", () => {
    const base = { dryRun: false, soloVerificar: false, urlBase: URL_BASE, claveServicio: CLAVE };
    const bien = ["https://api-novudent.novumholding.lat/auth/v1", "http://127.0.0.1:18100/auth/v1", "http://localhost:8000/auth/v1", "http://[::1]:8000/auth/v1", "http://10.0.6.3:9999", "http://172.16.0.5:9999", "http://172.31.255.1:9999", "http://192.168.1.20:8000/auth/v1", "http://auth:9999"];
    const mal = ["http://api-novudent.novumholding.lat/auth/v1", "http://203.0.113.5:8000/auth/v1", "http://172.32.0.1/auth/v1", "http://172.15.0.1/auth/v1", "http://8.8.8.8/auth/v1"];
    for (const url of bien) expect(() => validarDestino({ ...base, urlGotrue: url }), url).not.toThrow();
    for (const url of mal) expect(() => validarDestino({ ...base, urlGotrue: url }), url).toThrow(/https/);
  });
  it("la URL de la base tiene que ser postgres:// y la de GoTrue http(s)://, sin repetir la clave en el mensaje", () => {
    expect(() => validarDestino({ ...base, urlBase: "mysql://u:CLAVEDELABASE@h/db" })).toThrow(/postgres/);
    try { validarDestino({ ...base, urlBase: "http://u:CLAVEDELABASE@h/db" }); } catch (e) { expect((e as Error).message).not.toContain("CLAVEDELABASE"); }
    expect(() => validarDestino({ ...base, urlGotrue: "ftp://h" })).toThrow(/GoTrue/);
  });
});

/** Corre `principal` con dependencias de mentira y devuelve todo lo que imprimió. */
async function correr(argv: string[], { carpeta, almacen = crearAlmacenEnMemoria({ colecciones: [...COLECCIONES.porClinica, ...COLECCIONES.raiz] }), gotrue = gotrueFalso(), env = ENTORNO } = {} as { carpeta: string; almacen?: ReturnType<typeof crearAlmacenEnMemoria>; gotrue?: ReturnType<typeof gotrueFalso>; env?: Record<string, string> }) {
  const salida: string[] = [];
  const errores: string[] = [];
  const llamadas: { almacen?: { url: string; soloLectura: boolean }; gotrue?: { url: string; clave: string } } = {};
  const codigo = await principal(["--exportacion", carpeta, ...argv], {
    env,
    colecciones: COLECCIONES,
    crearAlmacen: async (o: { url: string; soloLectura: boolean }) => { llamadas.almacen = o; return almacen; },
    crearGoTrue: (o: { url: string; clave: string }) => { llamadas.gotrue = o; return gotrue; },
    escribir: (t: string) => salida.push(t),
    avisar: (t: string) => errores.push(t),
  });
  return { codigo, salida: salida.join("\n"), errores: errores.join("\n"), todo: `${salida.join("\n")}\n${errores.join("\n")}`, llamadas, almacen, gotrue };
}
const completo = ["--url-base", URL_BASE, "--url-gotrue", "http://127.0.0.1:18100/auth/v1"];

describe("principal", () => {
  it("carga, verifica y sale con 0; deja el informe en la carpeta de la exportación (solo para el dueño)", async () => {
    const carpeta = carpetaTemporal();
    await escribirExportacion(carpeta);
    const r = await correr(completo, { carpeta });
    expect(r.codigo).toBe(0);
    expect(r.salida).toMatch(/SIN DIFERENCIAS/);
    expect(r.llamadas.almacen).toMatchObject({ url: URL_BASE, soloLectura: false });
    expect(r.llamadas.gotrue).toMatchObject({ clave: CLAVE });
    const informes = readdirSync(carpeta).filter((n) => n.startsWith("informe-de-carga-"));
    expect(informes).toHaveLength(1);
    expect(statSync(join(carpeta, informes[0])).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(carpeta, informes[0]), "utf8")).toMatch(/SIN DIFERENCIAS/);
  });

  it("sale con 2 si hay diferencias (sobran documentos en la base)", async () => {
    const carpeta = carpetaTemporal();
    await escribirExportacion(carpeta);
    const almacen = crearAlmacenEnMemoria({ colecciones: [...COLECCIONES.porClinica, ...COLECCIONES.raiz] });
    await almacen.upsertar({ coleccion: "leads", clinica: null, filas: [{ id: "intruso", data: {} }] });
    const r = await correr(completo, { carpeta, almacen });
    expect(r.codigo).toBe(2);
    expect(r.salida).toMatch(/HAY DIFERENCIAS/);
  });

  it("se niega a pisar documentos distintos de la base y sale con 1; con --sobrescribir lo hace", async () => {
    const carpeta = carpetaTemporal();
    await escribirExportacion(carpeta);
    const almacen = crearAlmacenEnMemoria({ colecciones: [...COLECCIONES.porClinica, ...COLECCIONES.raiz] });
    await almacen.upsertar({ coleccion: "leads", clinica: null, filas: [{ id: "l1", data: { cambiado: true } }] });
    const bloqueada = await correr(completo, { carpeta, almacen });
    expect(bloqueada.codigo).toBe(1);
    expect(bloqueada.errores).toMatch(/--sobrescribir/);
    expect((await correr([...completo, "--sobrescribir"], { carpeta, almacen })).codigo).toBe(0);
  });

  it("--solo-verificar abre la base en solo lectura y no crea nada", async () => {
    const carpeta = carpetaTemporal();
    await escribirExportacion(carpeta);
    const gotrue = gotrueFalso();
    const r = await correr([...completo, "--solo-verificar"], { carpeta, gotrue });
    expect(r.llamadas.almacen?.soloLectura).toBe(true);
    expect(gotrue.creados).toEqual([]);
    expect(r.codigo).toBe(2); // la base está vacía: faltan todos los documentos
  });

  it("--dry-run abre la base en solo lectura, no escribe nada y sale con 0 aunque haya cambios por hacer; no deja informe salvo --informe", async () => {
    const carpeta = carpetaTemporal();
    await escribirExportacion(carpeta);
    const r = await correr([...completo, "--dry-run"], { carpeta });
    expect(r.codigo).toBe(0);
    expect(r.llamadas.almacen?.soloLectura).toBe(true);
    expect(r.salida).toMatch(/SIMULACRO/);
    expect(readdirSync(carpeta).some((n) => n.startsWith("informe-de-carga-"))).toBe(false);
    const destino = join(carpetaTemporal(), "plan.md");
    await correr([...completo, "--dry-run", "--informe", destino], { carpeta });
    expect(existsSync(destino)).toBe(true);
  });

  it("--dry-run sin base ni GoTrue solo valida la exportación", async () => {
    const carpeta = carpetaTemporal();
    await escribirExportacion(carpeta);
    const r = await correr(["--dry-run"], { carpeta, env: {} });
    expect(r.codigo).toBe(0);
    expect(r.llamadas.almacen).toBeUndefined();
    expect(r.salida).toMatch(/solo se validó la exportación/);
  });

  it("sin la URL de la base (no hay valor por defecto) falla con código 1 y sin tocar nada", async () => {
    const carpeta = carpetaTemporal();
    await escribirExportacion(carpeta);
    const r = await correr([], { carpeta });
    expect(r.codigo).toBe(1);
    expect(r.errores).toMatch(/--url-base/);
    expect(r.llamadas.almacen).toBeUndefined();
  });

  it("una exportación alterada falla con 1 y el mensaje la señala", async () => {
    const carpeta = carpetaTemporal();
    await escribirExportacion(carpeta);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(carpeta, "raiz/leads.jsonl"), "{}\n");
    const r = await correr(completo, { carpeta });
    expect(r.codigo).toBe(1);
    expect(r.errores).toMatch(/leads/);
  });

  it("jamás imprime la clave de servicio ni la contraseña de la base", async () => {
    const carpeta = carpetaTemporal();
    await escribirExportacion(carpeta);
    const r = await correr(completo, { carpeta });
    expect(r.todo).not.toContain(CLAVE);
    expect(r.todo).not.toContain("CLAVEDELABASE");
    expect(r.todo).toContain("supabase_admin@127.0.0.1:18101/postgres"); // sí dice a qué base va
  });

  it("se niega a escribir el informe dentro del repositorio", async () => {
    const carpeta = carpetaTemporal();
    await escribirExportacion(carpeta);
    const r = await correr([...completo, "--informe", join(process.cwd(), "informe-no.md")], { carpeta });
    expect(r.codigo).toBe(1);
    expect(r.errores).toMatch(/repositorio/);
    expect(existsSync(join(process.cwd(), "informe-no.md"))).toBe(false);
  });

  it("--ayuda imprime el uso y sale con 0 sin hacer nada más", async () => {
    const salida: string[] = [];
    const codigo = await principal(["--ayuda"], { env: {}, escribir: (t: string) => salida.push(t), avisar: () => {} });
    expect(codigo).toBe(0);
    expect(salida.join("\n")).toMatch(/Uso: node scripts\/migracion\/cargar-postgres\.mjs/);
  });
});

describe("el programa (línea de comandos)", () => {
  const CLI = new URL("./cargar-postgres.mjs", import.meta.url).pathname;
  /** Corre el programa de verdad. Al entorno se le quitan las NOVUDENT_CARGA_*: una variable exportada en la terminal de quien corre las pruebas no puede apuntar el programa a una base real. */
  const correrProceso = (args: string[], env: Record<string, string> = {}) => {
    const entorno = { ...process.env, ...env };
    for (const k of Object.keys(entorno)) if (k.startsWith("NOVUDENT_CARGA_") && !(k in env)) delete entorno[k];
    const r = spawnSync(process.execPath, [CLI, ...args], { env: entorno, encoding: "utf8" });
    return { codigo: r.status ?? 1, salida: r.stdout, errores: r.stderr };
  };

  it("--ayuda sale con 0 e imprime el uso", async () => {
    const r = correrProceso(["--ayuda"]);
    expect(r.codigo).toBe(0);
    expect(r.salida).toMatch(/Uso: node scripts\/migracion\/cargar-postgres\.mjs/);
  });

  it("sin la URL de la base sale con 1, sin tocar nada (no hay valor por defecto)", async () => {
    const carpeta = carpetaTemporal();
    await escribirExportacion(carpeta);
    const r = correrProceso(["--exportacion", carpeta]);
    expect(r.codigo).toBe(1);
    expect(r.errores).toMatch(/--url-base/);
  });

  it("--dry-run sin base valida la exportación y sale con 0", async () => {
    const carpeta = carpetaTemporal();
    await escribirExportacion(carpeta);
    const r = correrProceso(["--exportacion", carpeta, "--dry-run"]);
    expect(r.codigo).toBe(0);
    expect(r.salida).toMatch(/SIMULACRO/);
  });

  it("se niega a leer una exportación que esté dentro del repositorio", async () => {
    const r = correrProceso(["--exportacion", process.cwd(), "--dry-run"]);
    expect(r.codigo).toBe(1);
    expect(r.errores).toMatch(/dentro del repositorio/);
  });
});
