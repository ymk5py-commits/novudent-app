/** Suite de contrato de `DatosDeBackend`: las mismas pruebas para TODA implementación (memoria, Firestore, y más adelante Supabase). Si una
 *  implementación nueva las pasa, la tienda se comporta igual con ella. Usa `vitest`, así que solo se importa desde archivos `*.test.ts`. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { COLECCIONES_DE_LA_TIENDA } from "./colecciones";
import type { DatosDeBackend, Doc, OpcionesDeLectura } from "./tipos";

export interface BancoDePruebas {
  backend: DatosDeBackend;
  /** El usuario con sesión que ve el backend (lo que devuelve su `usuarioActual`). */
  usuarioId: string | null;
  /** Escribe un documento de cualquier ruta (`clinics/cl1/patients/p1`, `directory/u1`) sin pasar por permisos: arma el escenario. */
  sembrar(ruta: string, data: Doc): Promise<void>;
  /** Borra todos los documentos. */
  vaciar(): Promise<void>;
  cerrar?(): Promise<void>;
}

const CID = "cl1";
const sinDirectos: OpcionesDeLectura = { directos: () => "ninguno" };
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function esperar(condicion: () => boolean, ms = 5000) {
  const limite = Date.now() + ms;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error("se agotó la espera");
    await pausa(25);
  }
}

export function describeContratoDeDatos(nombre: string, abrir: () => Promise<BancoDePruebas>): void {
  describe(`contrato de datos · ${nombre}`, () => {
    let banco: BancoDePruebas;
    const b = () => banco.backend;
    const leer = async (opciones: OpcionesDeLectura = sinDirectos) => (await b().leerClinica(CID, opciones))!;

    beforeAll(async () => { banco = await abrir(); }, 60_000);
    afterAll(async () => { await banco.cerrar?.(); });
    beforeEach(async () => {
      await banco.vaciar();
      await banco.sembrar(`clinics/${CID}`, { id: CID, name: "Clínica", plan: "clinica", config: { moneda: "PYG" } });
    });

    describe("lectura", () => {
      it("devuelve null si la clínica no existe", async () => {
        expect(await b().leerClinica("otra", sinDirectos)).toBeNull();
      });

      it("trae el documento de la clínica, la suscripción (o null) y una lista por cada colección de la tienda", async () => {
        const l = await leer();
        expect(l.clinica).toMatchObject({ id: CID, name: "Clínica" });
        expect(l.suscripcion).toBeNull();
        expect(Object.keys(l.colecciones).sort()).toEqual([...COLECCIONES_DE_LA_TIENDA].sort());
        for (const lista of Object.values(l.colecciones)) expect(lista).toEqual([]);
        await banco.sembrar(`subscriptions/${CID}`, { plan: "clinica", status: "active" });
        expect((await leer()).suscripcion).toEqual({ plan: "clinica", status: "active" });
      });

      it("no mezcla documentos de otra clínica", async () => {
        await banco.sembrar(`clinics/otra`, { id: "otra" });
        await banco.sembrar(`clinics/otra/patients/p9`, { id: "p9" });
        await banco.sembrar(`clinics/${CID}/patients/p1`, { id: "p1" });
        expect((await leer()).colecciones.patients).toEqual([{ id: "p1" }]);
      });

      it("pasa a `directos` el padrón de usuarios y el usuario de la sesión, y aplica el filtro que devuelve", async () => {
        await banco.sembrar(`clinics/${CID}/users/u1`, { id: "u1", role: "admin" });
        await banco.sembrar(`clinics/${CID}/directMessages/m1`, { id: "m1", participants: ["u1", "u2"] });
        await banco.sembrar(`clinics/${CID}/directMessages/m2`, { id: "m2", participants: ["u3", "u2"] });
        await banco.sembrar(`clinics/${CID}/directMessages/m3`, { id: "m3", participants: ["u1", "u3"] });
        const directos = vi.fn(() => "todos" as const);
        const todos = await leer({ directos });
        expect(directos).toHaveBeenCalledWith([{ id: "u1", role: "admin" }], banco.usuarioId);
        expect(todos.colecciones.directMessages.map((d) => d.id)).toEqual(["m1", "m2", "m3"]);
        expect((await leer({ directos: () => "ninguno" })).colecciones.directMessages).toEqual([]);
        const mios = await leer({ directos: () => ({ participante: "u1" }) });
        expect(mios.colecciones.directMessages.map((d) => d.id)).toEqual(["m1", "m3"]);
      });

      it("clinicaDelUsuario devuelve la clínica del directorio, o null si el usuario no figura", async () => {
        await banco.sembrar("directory/u1", { clinicId: CID, email: "a@b.c" });
        expect(await b().clinicaDelUsuario("u1")).toBe(CID);
        expect(await b().clinicaDelUsuario("nadie")).toBeNull();
      });
    });

    describe("escritura", () => {
      it("guardar crea el documento y, si ya existe, lo REEMPLAZA entero", async () => {
        await b().guardar(CID, "patients", "p1", { id: "p1", nombre: "Ana", telefono: "123" });
        await b().guardar(CID, "patients", "p1", { id: "p1", nombre: "Ana María" });
        expect((await leer()).colecciones.patients).toStrictEqual([{ id: "p1", nombre: "Ana María" }]);
      });

      it("guardar descarta los undefined", async () => {
        await b().guardar(CID, "patients", "p2", { id: "p2", a: 1, b: undefined });
        expect((await leer()).colecciones.patients).toStrictEqual([{ id: "p2", a: 1 }]);
      });

      it("quitar borra el documento, y borrar uno que no existe no falla", async () => {
        await b().guardar(CID, "patients", "p1", { id: "p1" });
        await b().guardar(CID, "patients", "p2", { id: "p2" });
        await b().quitar(CID, "patients", "p1");
        await b().quitar(CID, "patients", "no-existe");
        expect((await leer()).colecciones.patients).toEqual([{ id: "p2" }]);
      });

      it("fijarCampo cambia solo ese campo, y con undefined lo borra", async () => {
        await b().guardar(CID, "patients", "p1", { id: "p1", nombre: "Ana", seguimiento: { motivo: "x" } });
        await b().fijarCampo(CID, "patients", "p1", "nombre", "Ana María");
        await b().fijarCampo(CID, "patients", "p1", "seguimiento", undefined);
        expect((await leer()).colecciones.patients).toStrictEqual([{ id: "p1", nombre: "Ana María" }]);
      });

      it("fijarCampo sobre un documento que no existe rechaza con code not-found", async () => {
        await expect(b().fijarCampo(CID, "patients", "no-existe", "a", 1)).rejects.toMatchObject({ code: "not-found" });
      });

      it("mezclarClinica fusiona: mapas en profundidad, arreglos reemplazados, el resto se conserva", async () => {
        await banco.sembrar(`clinics/${CID}`, { id: CID, name: "Clínica", config: { a: { x: 1, y: 2 }, lista: [1, 2, 3], z: 9 } });
        await b().mezclarClinica(CID, { config: { a: { y: 20 }, lista: [7] } });
        expect((await leer()).clinica).toStrictEqual({ id: CID, name: "Clínica", config: { a: { x: 1, y: 20 }, lista: [7], z: 9 } });
      });

      it("mezclarClinica: un mapa vacío en el parche vacía ese mapa (como Firestore) y no toca los hermanos", async () => {
        await banco.sembrar(`clinics/${CID}`, { id: CID, name: "Clínica", config: { a: { x: 1 }, b: { y: 2 }, lista: [1] } });
        await b().mezclarClinica(CID, { config: { a: {}, lista: [] } });
        expect((await leer()).clinica).toStrictEqual({ id: CID, name: "Clínica", config: { a: {}, b: { y: 2 }, lista: [] } });
      });

      it("mezclarClinica con null guarda null (no borra la clave)", async () => {
        await banco.sembrar(`clinics/${CID}`, { id: CID, name: "Clínica", config: { a: 1, b: 2 } });
        await b().mezclarClinica(CID, { config: { a: null } });
        expect((await leer()).clinica).toStrictEqual({ id: CID, name: "Clínica", config: { a: null, b: 2 } });
      });

      it("fijarCampo con null guarda null, solo undefined borra", async () => {
        await b().guardar(CID, "patients", "p1", { id: "p1", x: 1 });
        await b().fijarCampo(CID, "patients", "p1", "x", null);
        expect((await leer()).colecciones.patients).toStrictEqual([{ id: "p1", x: null }]);
        await b().fijarCampo(CID, "patients", "p1", "x", undefined);
        expect((await leer()).colecciones.patients).toStrictEqual([{ id: "p1" }]);
      });

      it("fijarCampo rechaza un nombre de campo con punto (Firestore lo leería como una ruta anidada) o vacío, y no toca el documento", async () => {
        await b().guardar(CID, "patients", "p1", { id: "p1", a: { b: 1 } });
        await expect(b().fijarCampo(CID, "patients", "p1", "a.b", 2)).rejects.toThrow();
        await expect(b().fijarCampo(CID, "patients", "p1", "", 2)).rejects.toThrow();
        expect((await leer()).colecciones.patients).toStrictEqual([{ id: "p1", a: { b: 1 } }]);
      });

      it("un id vacío o con barra rechaza (no lanza de forma síncrona) y no escribe nada", async () => {
        const llamadas: Array<() => Promise<void>> = [
          ...["", "a/b"].map((id) => () => b().guardar(CID, "patients", id, { id })),
          ...["", "a/b"].map((id) => () => b().quitar(CID, "patients", id)),
          ...["", "a/b"].map((id) => () => b().fijarCampo(CID, "patients", id, "a", 1)),
        ];
        for (const llamar of llamadas) {
          let promesa: Promise<void> | undefined;
          expect(() => { promesa = llamar(); }).not.toThrow(); // un error de uso llega como rechazo, no como excepción al llamar
          await expect(promesa).rejects.toThrow();
        }
        expect((await leer()).colecciones.patients).toEqual([]);
      });

      it("lote aplica guardar, guardarClinica y mezclarClinica juntos", async () => {
        await b().lote(CID, [
          { tipo: "guardar", col: "users", id: "u1", data: { id: "u1", name: "Ana" } },
          { tipo: "guardar", col: "procedures", id: "D01", data: { cpt: "D01", price: 10 } },
          { tipo: "guardarClinica", data: { id: CID, name: "Nueva" } },
          { tipo: "mezclarClinica", data: { extra: 1 } },
        ]);
        const l = await leer();
        expect(l.clinica).toStrictEqual({ id: CID, name: "Nueva", extra: 1 });
        expect(l.colecciones.users).toEqual([{ id: "u1", name: "Ana" }]);
        expect(l.colecciones.procedures).toEqual([{ cpt: "D01", price: 10 }]);
      });
    });

    describe("escucha en vivo", () => {
      it("escucharColeccion entrega el estado actual y cada cambio, y deja de hacerlo al desuscribir", async () => {
        const vistos: Doc[][] = [];
        const parar = b().escucharColeccion(CID, "outbox", (docs) => vistos.push(docs));
        await esperar(() => vistos.length >= 1);
        expect(vistos[0]).toEqual([]);
        await b().guardar(CID, "outbox", "t1", { id: "t1", status: "pendiente" });
        await esperar(() => vistos.at(-1)?.length === 1);
        parar();
        const cantidad = vistos.length;
        await b().guardar(CID, "outbox", "t2", { id: "t2" });
        await pausa(300);
        expect(vistos.length).toBe(cantidad);
      });

      it("escucharColeccion con participante entrega solo los suyos", async () => {
        await banco.sembrar(`clinics/${CID}/directMessages/m1`, { id: "m1", participants: ["u1", "u2"] });
        await banco.sembrar(`clinics/${CID}/directMessages/m2`, { id: "m2", participants: ["u3", "u2"] });
        let ultimo: Doc[] = [];
        const parar = b().escucharColeccion(CID, "directMessages", (docs) => { ultimo = docs; }, { participante: "u1" });
        await esperar(() => ultimo.length === 1);
        expect(ultimo[0].id).toBe("m1");
        await b().guardar(CID, "directMessages", "m3", { id: "m3", participants: ["u1", "u9"] });
        await esperar(() => ultimo.length === 2);
        parar();
        expect(ultimo.map((d) => d.id).sort()).toEqual(["m1", "m3"]);
      });

      it("escucharColeccion con ordenarPor entrega de menor a mayor", async () => {
        await banco.sembrar(`clinics/${CID}/teamMessages/a`, { id: "a", createdAt: "2026-01-02" });
        await banco.sembrar(`clinics/${CID}/teamMessages/b`, { id: "b", createdAt: "2026-01-01" });
        await banco.sembrar(`clinics/${CID}/teamMessages/c`, { id: "c", createdAt: "2026-01-03" });
        let ultimo: Doc[] = [];
        const parar = b().escucharColeccion(CID, "teamMessages", (docs) => { ultimo = docs; }, { ordenarPor: "createdAt" });
        await esperar(() => ultimo.length === 3);
        parar();
        expect(ultimo.map((d) => d.id)).toEqual(["b", "a", "c"]);
      });

      it("escucharClinica entrega el documento y sus cambios", async () => {
        const vistos: Array<Doc | null> = [];
        const parar = b().escucharClinica(CID, (c) => vistos.push(c));
        await esperar(() => vistos.length >= 1);
        expect(vistos[0]).toMatchObject({ id: CID, name: "Clínica" });
        await b().mezclarClinica(CID, { config: { moneda: "USD" } });
        await esperar(() => (vistos.at(-1) as Doc | null)?.config !== vistos[0]?.config);
        parar();
        expect((vistos.at(-1) as Doc).config).toEqual({ moneda: "USD" });
      });

      it("escucharSuscripcion entrega null si no hay y el documento cuando aparece", async () => {
        const vistos: Array<Doc | null> = [];
        const parar = b().escucharSuscripcion(CID, (s) => vistos.push(s));
        await esperar(() => vistos.length >= 1);
        expect(vistos[0]).toBeNull();
        await banco.sembrar(`subscriptions/${CID}`, { plan: "cadena" });
        await esperar(() => vistos.at(-1) !== null);
        parar();
        expect(vistos.at(-1)).toEqual({ plan: "cadena" });
      });
    });
  });
}
