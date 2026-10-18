/** El cargador de punta a punta contra un Postgres y un GoTrue de VERDAD (el stack descartable de `stack-de-prueba.sh`, por un túnel SSH). Se saltea si no
 *  están las variables NOVUDENT_PRUEBA_DB_URL, NOVUDENT_PRUEBA_GOTRUE_URL y NOVUDENT_PRUEBA_SERVICE_KEY. Es la prueba de aceptación de P5 (spec §13): dos
 *  cargas seguidas sin diferencias y con el SHA-256 de todos los documentos coincidiendo. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearAlmacenPostgres } from "./almacen.mjs";
import { ejecutarCarga } from "./cargar.mjs";
import { crearClienteGoTrue } from "./gotrue.mjs";
import { CLAVE_DE_PRUEBA, GOTRUE_DE_PRUEBA, URL_DE_PRUEBA, clientePg, crearEsquemaDePrueba } from "./postgres-prueba.mjs";
import { COLECCIONES, baseSintetica, carpetaTemporal, escribirExportacion, limpiarCarpetas } from "./fixtures";

const hay = Boolean(URL_DE_PRUEBA && GOTRUE_DE_PRUEBA && CLAVE_DE_PRUEBA);

async function borrarCuentasDePrueba() {
  const gotrue = crearClienteGoTrue({ url: GOTRUE_DE_PRUEBA!, clave: CLAVE_DE_PRUEBA! });
  for (const u of await gotrue.listarUsuarios()) {
    if (u.email.endsWith("@example.com")) {
      await fetch(`${GOTRUE_DE_PRUEBA}/admin/users/${u.id}`, { method: "DELETE", headers: { apikey: CLAVE_DE_PRUEBA!, Authorization: `Bearer ${CLAVE_DE_PRUEBA}` } });
    }
  }
  return gotrue;
}

describe.skipIf(!hay)("cargar-postgres contra Postgres y GoTrue reales", () => {
  let base: Awaited<ReturnType<typeof crearEsquemaDePrueba>>;
  let gotrue: ReturnType<typeof crearClienteGoTrue>;

  beforeEach(async () => {
    gotrue = await borrarCuentasDePrueba();
    base = await crearEsquemaDePrueba(COLECCIONES);
  });
  afterEach(async () => {
    await base.borrar();
    await borrarCuentasDePrueba();
    limpiarCarpetas();
  });

  async function correr(carpeta: string, modo: "cargar" | "solo-verificar" | "simulacro", extra: Record<string, unknown> = {}) {
    const almacen = await crearAlmacenPostgres({ url: URL_DE_PRUEBA!, soloLectura: modo !== "cargar", esquema: base.esquema });
    try {
      return await ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen, gotrue, modo, tamanoDeLote: 2, ...extra });
    } finally {
      await almacen.cerrar();
    }
  }
  const filas = async (tabla: string): Promise<any[]> => (await base.consultar(`select * from "${base.esquema}"."${tabla}" order by 1, 2`)).rows;
  const TABLAS = ["patients", "users", "clinics", "subscriptions", "leads", "appointments"];
  const todasLasFilas = async () => { const r = []; for (const t of TABLAS) r.push(await filas(t)); return r; };

  /** Un paciente con todos los casos raros de números y texto que jsonb podría normalizar. */
  const exportacionExigente = async () => {
    const datos = baseSintetica();
    datos["clinics/c1/patients"].push({
      id: "raros",
      data: {
        suma: 0.1 + 0.2, minimo: 5e-324, enorme: 1e21, negativo: -12.5, cero: 0, maximo: 9007199254740991, expo: 1.5e-7,
        texto: "línea 1\nlínea 2\ttab \"comillas\" \\ barra / ✓ 🦷 ñ", largo: "x".repeat(200_000), vacioObj: {}, vacioLista: [],
        profundo: { a: { b: { c: { d: [[1, [2, [3, { e: null }]]]] } } } },
        claveRara: { "con espacio": 1, "ñ": 2, "": 3, "a.b": 4, "$x": 5 },
      },
    });
    const carpeta = carpetaTemporal();
    await escribirExportacion(carpeta, { base: datos });
    return carpeta;
  };

  it("carga todo y la verificación completa (SHA-256 de cada documento) no encuentra diferencias, ni siquiera en números y textos raros", async () => {
    const carpeta = await exportacionExigente();
    const informe = await correr(carpeta, "cargar");
    expect(informe.diferencias).toBe(0);
    expect(informe.ok).toBe(true);
    expect(informe.totales.cargados).toMatchObject({ actualizados: 0, fallidos: 0 });
    expect(informe.totales.iguales).toBe(informe.totales.manifiesto);
    expect(informe.totales.manifiesto).toBeGreaterThan(10);
  });

  it("dos cargas seguidas: la segunda no toca una sola fila (ni su updated_at), no crea cuentas y todo coincide", async () => {
    const carpeta = await exportacionExigente();
    await correr(carpeta, "cargar");
    const antes = await todasLasFilas();
    const segunda = await correr(carpeta, "cargar");
    const despues = await todasLasFilas();
    expect(segunda.ok).toBe(true);
    expect(segunda.totales.cargados).toMatchObject({ insertados: 0, actualizados: 0 });
    expect(segunda.usuarios).toMatchObject({ creados: 0, existentes: 2 });
    expect(despues).toEqual(antes); // incluye updated_at: no hubo escrituras
    expect((await correr(carpeta, "solo-verificar")).ok).toBe(true);
  });

  it("crea las cuentas en GoTrue (sin contraseña, correo confirmado) y deja authUid = su uuid sin tocar el id del usuario", async () => {
    const carpeta = await exportacionExigente();
    await correr(carpeta, "cargar");
    const cuentas = (await gotrue.listarUsuarios()).filter((u) => u.email.endsWith("@example.com"));
    expect(cuentas.map((c) => c.email).sort()).toEqual(["ana@example.com", "luis@example.com"]);
    const usuarios = (await filas("users")).filter((f) => f.clinic_id === "c1");
    const ana = usuarios.find((f) => f.id === "fbUidAna")!;
    const luis = usuarios.find((f) => f.id === "u2")!;
    expect(ana.data.authUid).toBe(cuentas.find((c) => c.email === "ana@example.com")!.id);
    expect(luis.data.authUid).toBe(cuentas.find((c) => c.email === "luis@example.com")!.id);
    expect(ana.data).toMatchObject({ id: "fbUidAna", email: "Ana@Example.com", role: "admin", mustChangePassword: true });
    expect(luis.data.id).toBe("u2");
    const demo = (await filas("users")).find((f) => f.clinic_id === "cl_demo")!;
    expect(demo.data.authUid).toBeUndefined(); // la demo no tiene cuenta
    // La cuenta no tiene contraseña: no se puede entrar con una clave cualquiera.
    const res = await fetch(`${GOTRUE_DE_PRUEBA}/token?grant_type=password`, { method: "POST", headers: { "Content-Type": "application/json", apikey: CLAVE_DE_PRUEBA! }, body: JSON.stringify({ email: "ana@example.com", password: "cualquiera" }) });
    expect(res.status).toBe(400);
  });

  it("detecta un cambio directo en la base y la siguiente carga lo corrige", async () => {
    const carpeta = await exportacionExigente();
    await correr(carpeta, "cargar");
    await base.consultar(`update "${base.esquema}"."patients" set data = jsonb_set(data, '{nombre}', '"Persona Sintética Uni"') where clinic_id = 'c1' and id = 'p1'`);
    await base.consultar(`delete from "${base.esquema}"."appointments" where clinic_id = 'c1' and id = 'a1'`);
    await base.consultar(`insert into "${base.esquema}"."leads" (id, data) values ('intruso', '{}')`);
    const verificado = await correr(carpeta, "solo-verificar");
    expect(verificado.ok).toBe(false);
    expect(verificado.colecciones.find((f: any) => f.coleccion === "patients" && f.clinica === "c1")!.distintos).toEqual(["p1"]);
    expect(verificado.colecciones.find((f: any) => f.coleccion === "appointments")!.faltan).toEqual(["a1"]);
    expect(verificado.colecciones.find((f: any) => f.coleccion === "leads")!.sobran).toEqual(["intruso"]);
    expect(verificado.diferencias).toBe(3);

    await expect(correr(carpeta, "cargar")).rejects.toThrow(/sobrescribir/); // hay un documento distinto en la base: no lo pisa sin permiso
    const recargado = await correr(carpeta, "cargar", { sobrescribir: true });
    expect(recargado.totales.cargados).toMatchObject({ insertados: 1, actualizados: 1 });
    expect(recargado.diferencias).toBe(1); // el cargador NUNCA borra: el sobrante se informa y lo limpia una persona
    await base.consultar(`delete from "${base.esquema}"."leads" where id = 'intruso'`);
    expect((await correr(carpeta, "solo-verificar")).ok).toBe(true);
  });

  it("--dry-run no escribe nada en la base ni en GoTrue, y dice lo que haría", async () => {
    const carpeta = await exportacionExigente();
    const cuentasAntes = (await gotrue.listarUsuarios()).length;
    const informe = await correr(carpeta, "simulacro");
    expect(informe.ok).toBe(true);
    expect(informe.totales.faltan).toBe(informe.totales.manifiesto);
    expect(informe.usuarios.porCrear).toBe(2);
    for (const t of ["patients", "users", "clinics", "leads"]) expect(await filas(t)).toEqual([]);
    expect((await gotrue.listarUsuarios()).length).toBe(cuentasAntes);
  });

  it("un documento que Postgres no acepta (un NUL en un texto) se informa y el resto se carga", async () => {
    const datos = baseSintetica();
    datos["clinics/c1/patients"].push({ id: "malo", data: { nombre: "a\u0000b" } });
    const carpeta = carpetaTemporal();
    await escribirExportacion(carpeta, { base: datos });
    const informe = await correr(carpeta, "cargar");
    expect(informe.ok).toBe(false);
    expect(informe.totales.cargados.fallidos).toBe(1);
    expect(informe.colecciones.find((f: any) => f.coleccion === "patients" && f.clinica === "c1")!.carga.fallidos[0]).toMatchObject({ id: "malo", codigo: "22P05" });
    expect((await filas("patients")).map((f) => f.id).sort()).toEqual(["p 2 ñ%.1", "p1", "p1"].sort());
  });

  it("con las tablas en snake_case (direct_messages…) también funciona", async () => {
    await base.borrar();
    base = await crearEsquemaDePrueba(COLECCIONES, { estilo: "snake" });
    const carpeta = await exportacionExigente();
    const informe = await correr(carpeta, "cargar");
    expect(informe.ok).toBe(true);
    expect((await correr(carpeta, "solo-verificar")).ok).toBe(true);
  });

  it("si falta la tabla de una colección no escribe nada (ni crea cuentas)", async () => {
    await base.borrar();
    base = await crearEsquemaDePrueba(COLECCIONES, { sinTabla: ["leads"] });
    const carpeta = await exportacionExigente();
    await expect(correr(carpeta, "cargar")).rejects.toThrow(/leads/);
    expect((await gotrue.listarUsuarios()).filter((u) => u.email.endsWith("@example.com"))).toEqual([]);
    expect(await filas("patients")).toEqual([]);
  });

  it("corre sobre una sesión de Postgres de verdad en solo lectura (la propia base rechaza escribir)", async () => {
    const { Client } = await clientePg();
    const c = new Client({ connectionString: URL_DE_PRUEBA });
    await c.connect();
    await c.query("set default_transaction_read_only = on");
    await expect(c.query(`insert into "${base.esquema}"."leads" (id, data) values ('x', '{}')`)).rejects.toThrow(/read-only/);
    await c.end();
  });
});
