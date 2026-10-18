import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { crearAlmacenEnMemoria } from "./almacen.mjs";
import { ejecutarCarga, ErrorDeCarga } from "./cargar.mjs";
import { hashDeDocumento } from "./canonico.mjs";
import { COLECCIONES, baseSintetica, carpetaTemporal, escribirExportacion, gotrueFalso, limpiarCarpetas } from "./fixtures";

afterEach(limpiarCarpetas);

const TODAS = [...COLECCIONES.porClinica, ...COLECCIONES.raiz];
const nuevoAlmacen = () => crearAlmacenEnMemoria({ colecciones: TODAS });
type AlmacenDePrueba = ReturnType<typeof nuevoAlmacen>;

async function preparar(opciones: Parameters<typeof escribirExportacion>[1] = {}) {
  const carpeta = carpetaTemporal();
  const manifiesto = await escribirExportacion(carpeta, opciones);
  return { carpeta, manifiesto };
}
const correr = (carpeta: string, almacen: AlmacenDePrueba | null, extra: Record<string, unknown> = {}) =>
  ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen, gotrue: gotrueFalso(), modo: "cargar", ...extra });
const filaDe = (informe: { colecciones: Array<{ clinica: string | null; coleccion: string }> }, coleccion: string, clinica: string | null = null) =>
  informe.colecciones.find((f) => f.coleccion === coleccion && f.clinica === clinica) as any;
const leerTodo = async (a: AlmacenDePrueba, coleccion: string, clinica: string | null) => a.leerPagina({ coleccion, clinica, despuesDe: null, limite: 1000 });

describe("cargar", () => {
  it("carga todo y el informe coincide con el manifiesto, documento por documento", async () => {
    const { carpeta, manifiesto } = await preparar();
    const almacen = nuevoAlmacen();
    const informe = await correr(carpeta, almacen);
    expect(informe.ok).toBe(true);
    expect(informe.diferencias).toBe(0);
    // cantidades por colección contra el manifiesto
    const c1p = filaDe(informe, "patients", "c1");
    expect(c1p).toMatchObject({ manifiesto: { docs: 2 }, base: { docs: 2 }, iguales: 2, faltan: [], distintos: [], sobran: [], carga: { insertados: 2, actualizados: 0, iguales: 0, fallidos: [] } });
    expect(c1p.manifiesto.sha256).toBe(manifiesto.clinicas.c1.colecciones.patients.sha256);
    expect(informe.totales).toMatchObject({ manifiesto: manifiesto.totales.documentos - manifiesto.raiz.directory.docs, base: manifiesto.totales.documentos - manifiesto.raiz.directory.docs, diferencias: 0 });
    // los documentos quedaron en el almacén y se verificó cada uno por su SHA-256 (hash de la forma canónica)
    const p = (await leerTodo(almacen, "patients", "c1")).find((d) => d.id === "p1")!;
    expect(hashDeDocumento("p1", p.data)).toBe(hashDeDocumento("p1", baseSintetica()["clinics/c1/patients"][0].data!));
    expect(informe.hashes).toBe(true);
  });

  it("no carga `directory` ni `serviceAccounts`", async () => {
    const { carpeta } = await preparar();
    const almacen = nuevoAlmacen();
    const gotrue = gotrueFalso();
    await correr(carpeta, almacen, { gotrue });
    expect(await leerTodo(almacen, "directory", null)).toEqual([]);
    expect(informe_sin(await correr(carpeta, almacen, { gotrue }), "directory")).toBe(true);
  });

  it("dos cargas seguidas: la segunda no inserta ni actualiza nada, no duplica y no crea cuentas nuevas", async () => {
    const { carpeta } = await preparar();
    const almacen = nuevoAlmacen();
    const gotrue = gotrueFalso();
    const primera = await ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen, gotrue, modo: "cargar" });
    const volcadoPrimera = JSON.stringify(almacen._volcado());
    const segunda = await ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen, gotrue, modo: "cargar" });
    expect(primera.ok && segunda.ok).toBe(true);
    expect(segunda.totales.cargados).toMatchObject({ insertados: 0, actualizados: 0 });
    expect(segunda.totales.cargados.iguales).toBe(primera.totales.cargados.insertados);
    expect(segunda.usuarios).toMatchObject({ creados: 0, existentes: 2 });
    expect(gotrue.usuarios).toHaveLength(2);
    expect(JSON.stringify(almacen._volcado())).toBe(volcadoPrimera);
  });

  it("crea una cuenta por cada usuario real y reescribe SOLO authUid con el uuid nuevo (el id no cambia; los de la demo no se tocan)", async () => {
    const { carpeta } = await preparar();
    const almacen = nuevoAlmacen();
    const gotrue = gotrueFalso();
    const informe = await ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen, gotrue, modo: "cargar" });
    expect(gotrue.creados.map((u) => u.email)).toEqual(["ana@example.com", "luis@example.com"]);
    expect(informe.usuarios).toMatchObject({ reales: 2, deLaDemo: 1, creados: 2, porCrear: 0 });
    const usuarios = await leerTodo(almacen, "users", "c1");
    const ana = usuarios.find((u) => u.id === "fbUidAna")!.data;
    const luis = usuarios.find((u) => u.id === "u2")!.data;
    const original = baseSintetica()["clinics/c1/users"];
    expect(ana).toEqual({ ...original[0].data, authUid: "uuid-1" }); // id y todo lo demás igual; mustChangePassword también
    expect(luis).toEqual({ ...original[1].data, authUid: "uuid-2" });
    expect((await leerTodo(almacen, "users", "cl_demo"))[0].data).toEqual(baseSintetica()["clinics/cl_demo/users"][0].data); // demo intacta
  });

  it("un tamaño de lote chico da el mismo resultado", async () => {
    const { carpeta } = await preparar();
    const a = nuevoAlmacen();
    const b = nuevoAlmacen();
    await correr(carpeta, a, { tamanoDeLote: 1 });
    await correr(carpeta, b);
    expect(JSON.stringify(a._volcado())).toBe(JSON.stringify(b._volcado()));
  });
});

function informe_sin(informe: { colecciones: Array<{ coleccion: string }> }, coleccion: string) {
  return !informe.colecciones.some((f) => f.coleccion === coleccion);
}

describe("verificación completa (la diferencia más chica hace fallar)", () => {
  async function cargado() {
    const { carpeta } = await preparar();
    const almacen = nuevoAlmacen();
    const gotrue = gotrueFalso();
    await ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen, gotrue, modo: "cargar" });
    const verificar = () => ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen, gotrue, modo: "solo-verificar" });
    return { carpeta, almacen, gotrue, verificar };
  }

  it("--solo-verificar sobre una carga correcta: sin diferencias", async () => {
    const { verificar } = await cargado();
    const informe = await verificar();
    expect(informe.ok).toBe(true);
    expect(informe.modo).toBe("solo-verificar");
    expect(informe.totales.diferencias).toBe(0);
  });

  it("detecta un documento distinto, aunque sea un solo carácter", async () => {
    const { almacen, verificar } = await cargado();
    await almacen.upsertar({ coleccion: "patients", clinica: "c1", filas: [{ id: "p1", data: { ...baseSintetica()["clinics/c1/patients"][0].data, nombre: "Persona Sintética Uno!" } }] });
    const informe = await verificar();
    expect(informe.ok).toBe(false);
    expect(filaDe(informe, "patients", "c1").distintos).toEqual(["p1"]);
    expect(informe.diferencias).toBe(1);
  });

  it("detecta un documento que sobra y una clínica entera que no estaba en la exportación (el cargador no borra: lo informa)", async () => {
    const { almacen, verificar } = await cargado();
    await almacen.upsertar({ coleccion: "leads", clinica: null, filas: [{ id: "extra", data: { x: 1 } }] }); // sobra en la raíz
    await almacen.upsertar({ coleccion: "appointments", clinica: "otra_clinica", filas: [{ id: "z", data: {} }, { id: "w", data: {} }] }); // clínica ajena
    const informe = await verificar();
    expect(informe.ok).toBe(false);
    expect(filaDe(informe, "leads").sobran).toEqual(["extra"]);
    expect(informe.sobrantesDeClinicas).toEqual([{ coleccion: "appointments", clinica: "otra_clinica", docs: 2 }]);
    expect(informe.diferencias).toBe(3);
  });

  it("detecta un documento faltante", async () => {
    const { carpeta } = await preparar();
    const almacen = nuevoAlmacen();
    await correr(carpeta, almacen);
    const incompleto = nuevoAlmacen();
    for (const [clave, docs] of almacen._volcado() as Array<[string, Array<[string, any]>]>) {
      const [coleccion, clinica] = clave.split("|");
      await incompleto.upsertar({ coleccion, clinica: clinica || null, filas: docs.filter(([id]) => id !== "a1").map(([id, data]) => ({ id, data })) });
    }
    const informe = await ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen: incompleto, gotrue: gotrueFalso([{ id: "uuid-1", email: "ana@example.com" }, { id: "uuid-2", email: "luis@example.com" }]), modo: "solo-verificar" });
    expect(informe.ok).toBe(false);
    expect(filaDe(informe, "appointments", "c1").faltan).toEqual(["a1"]);
  });

  it("detecta un authUid que no es el de GoTrue", async () => {
    const { almacen, verificar } = await cargado();
    const luis = (await leerTodo(almacen, "users", "c1")).find((u) => u.id === "u2")!;
    await almacen.upsertar({ coleccion: "users", clinica: "c1", filas: [{ id: "u2", data: { ...luis.data, authUid: "fbUidLuis" } }] }); // quedó el uid viejo
    const informe = await verificar();
    expect(informe.ok).toBe(false);
    expect(filaDe(informe, "users", "c1").distintos).toEqual(["u2"]);
  });

  it("--solo-verificar no escribe nada ni crea cuentas, aunque falten", async () => {
    const { carpeta } = await preparar();
    const almacen = nuevoAlmacen();
    const original = almacen.upsertar.bind(almacen);
    let escrituras = 0;
    almacen.upsertar = (async (lote: any) => { escrituras++; return original(lote); }) as typeof almacen.upsertar;
    const gotrue = gotrueFalso();
    const informe = await ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen, gotrue, modo: "solo-verificar" });
    expect(escrituras).toBe(0);
    expect(gotrue.creados).toEqual([]);
    expect(informe.ok).toBe(false); // está todo vacío: faltan todos los documentos
    expect(informe.totales.faltan).toBeGreaterThan(0);
    expect(informe.usuarios).toMatchObject({ porCrear: 2 });
  });
});

describe("no pisar datos más nuevos sin permiso", () => {
  it("si la base ya tiene documentos DISTINTOS a los de la exportación, cargar se niega (sin crear cuentas ni escribir) salvo con sobrescribir", async () => {
    const { carpeta } = await preparar();
    const almacen = nuevoAlmacen();
    await almacen.upsertar({ coleccion: "patients", clinica: "c1", filas: [{ id: "p1", data: { nombre: "Edición hecha DESPUÉS de exportar" } }] });
    const antes = JSON.stringify(almacen._volcado());
    const gotrue = gotrueFalso();
    const error = await correr(carpeta, almacen, { gotrue }).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorDeCarga);
    expect(error.message).toMatch(/sobrescribir/);
    expect(error.message).toMatch(/clinics\/c1\/patients/);
    expect(error.message).not.toMatch(/DESPUÉS/);
    expect(JSON.stringify(almacen._volcado())).toBe(antes);
    expect(gotrue.creados).toEqual([]);

    const informe = await correr(carpeta, almacen, { gotrue, sobrescribir: true });
    expect(informe.ok).toBe(true);
    expect(informe.totales.cargados.actualizados).toBe(1);
  });

  it("no estorba a una segunda carga igual, ni a una base con documentos de más (eso no se pisa, solo se informa)", async () => {
    const { carpeta } = await preparar();
    const almacen = nuevoAlmacen();
    const gotrue = gotrueFalso();
    await correr(carpeta, almacen, { gotrue });
    expect((await correr(carpeta, almacen, { gotrue })).ok).toBe(true);
    await almacen.upsertar({ coleccion: "leads", clinica: null, filas: [{ id: "nuevo-en-vivo", data: {} }] });
    const informe = await correr(carpeta, almacen, { gotrue });
    expect(informe.totales.sobran).toBe(1);
    expect(informe.ok).toBe(false);
  });
});

describe("simulacro (--dry-run)", () => {
  it("no escribe nada y cuenta lo que haría: documentos a insertar, a actualizar, sin cambios, y cuentas a crear", async () => {
    const { carpeta } = await preparar();
    const almacen = nuevoAlmacen();
    await almacen.upsertar({ coleccion: "leads", clinica: null, filas: [{ id: "l1", data: baseSintetica().leads[0].data! }] }); // ya está igual
    await almacen.upsertar({ coleccion: "subscriptions", clinica: null, filas: [{ id: "c1", data: { otra: "cosa" } }] }); // está distinto
    const antes = JSON.stringify(almacen._volcado());
    const gotrue = gotrueFalso();
    const informe = await ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen, gotrue, modo: "simulacro" });
    expect(JSON.stringify(almacen._volcado())).toBe(antes);
    expect(gotrue.creados).toEqual([]);
    expect(informe.modo).toBe("simulacro");
    expect(filaDe(informe, "leads")).toMatchObject({ iguales: 1, faltan: [], distintos: [] });
    expect(filaDe(informe, "subscriptions").distintos).toEqual(["c1"]);
    expect(filaDe(informe, "patients", "c1").faltan).toHaveLength(2);
    expect(informe.usuarios).toMatchObject({ porCrear: 2, creados: 0 });
  });

  it("sin base ni GoTrue solo valida la exportación (archivos íntegros) y lo dice", async () => {
    const { carpeta } = await preparar();
    const informe = await ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen: null, gotrue: null, modo: "simulacro" });
    expect(informe.archivos.problemas).toEqual([]);
    expect(informe.base).toBe(false);
    expect(informe.colecciones.length).toBeGreaterThan(0);
  });
});

describe("lo que impide empezar (nada se escribe)", () => {
  it("un archivo de la exportación alterado frena todo antes de tocar la base", async () => {
    const { carpeta } = await preparar();
    const ruta = join(carpeta, "clinicas/c1/patients.jsonl");
    writeFileSync(ruta, "{}\n");
    const almacen = nuevoAlmacen();
    const gotrue = gotrueFalso();
    await expect(ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen, gotrue, modo: "cargar" })).rejects.toThrow(/no coincide|SHA-256/);
    expect(almacen._volcado()).toEqual([]);
    expect(gotrue.creados).toEqual([]);
  });

  it("una colección sin tabla frena todo, y el mensaje dice cuáles faltan", async () => {
    const { carpeta } = await preparar();
    const almacen = crearAlmacenEnMemoria({ colecciones: TODAS.filter((c) => c !== "appointments" && c !== "leads") });
    const gotrue = gotrueFalso();
    const error = await ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen, gotrue, modo: "cargar" }).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorDeCarga);
    expect(error.message).toMatch(/appointments/);
    expect(error.message).toMatch(/leads/);
    expect(almacen._volcado()).toEqual([]);
    expect(gotrue.creados).toEqual([]);
  });

  it("cargar exige GoTrue (si no, los usuarios quedarían con un authUid que no existe)", async () => {
    const { carpeta } = await preparar();
    await expect(ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen: nuevoAlmacen(), gotrue: null, modo: "cargar" })).rejects.toThrow(/GoTrue/);
  });

  it("si GoTrue falla al crear una cuenta no se escribe ningún documento", async () => {
    const { carpeta } = await preparar();
    const almacen = nuevoAlmacen();
    const gotrue = gotrueFalso([], { falla: { "luis@example.com": new Error("GoTrue respondió 500") } });
    await expect(ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen, gotrue, modo: "cargar" })).rejects.toThrow(/500/);
    expect(almacen._volcado()).toEqual([]);
  });
});

describe("documentos que la base no acepta", () => {
  it("se informan (sin su contenido), el resto se carga y el resultado NO es ok", async () => {
    const base = baseSintetica();
    base["clinics/c1/patients"].push({ id: "malo", data: { nombre: "a\u0000b SECRETO" } });
    const { carpeta } = await preparar({ base });
    const almacen = nuevoAlmacen();
    const informe = await correr(carpeta, almacen);
    expect(informe.ok).toBe(false);
    const fila = filaDe(informe, "patients", "c1");
    expect(fila.carga.fallidos.map((f: { id: string }) => f.id)).toEqual(["malo"]);
    expect(fila.faltan).toEqual(["malo"]);
    expect(fila.iguales).toBe(2);
    expect(JSON.stringify(informe)).not.toMatch(/SECRETO/);
  });
});

describe("usuarios sin cuenta posible", () => {
  it("un usuario con authUid pero sin correo usable se advierte, no se crea y no frena la carga", async () => {
    const base = baseSintetica();
    base["clinics/c1/users"].push({ id: "u9", data: { id: "u9", authUid: "fbRaro", name: "Sin correo" } });
    const { carpeta } = await preparar({ base });
    const informe = await correr(carpeta, nuevoAlmacen());
    expect(informe.usuarios.sinCorreo).toEqual([{ clinica: "c1", id: "u9" }]);
    expect(informe.advertencias.join(" ")).toMatch(/ningún correo usable/);
  });
});
