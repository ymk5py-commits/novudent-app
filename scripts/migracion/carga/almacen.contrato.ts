/** El contrato que cumple todo «almacén» (donde el cargador escribe y lee): la versión en memoria de las pruebas y la de Postgres. Se corre contra las dos,
 *  como `lib/backend/contrato-de-datos.ts` hace con la capa de datos. */
import { describe, expect, it } from "vitest";
import { canonizar } from "./canonico.mjs";

export type Almacen = {
  preparar(colecciones: string[]): Promise<{ problemas: string[] }>;
  upsertar(lote: { coleccion: string; clinica: string | null; filas: Array<{ id: string; data: Record<string, unknown> }> }): Promise<{ insertados: number; actualizados: number; iguales: number; fallidos: Array<{ id: string; codigo: string; mensaje: string }> }>;
  leerPagina(consulta: { coleccion: string; clinica: string | null; despuesDe: string | null; limite: number }): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  clinicasEn(coleccion: string): Promise<string[]>;
  cerrar(): Promise<void>;
};

export type FabricaDeAlmacen = (opciones: { soloLectura?: boolean }) => Promise<{ almacen: Almacen; limpiar(): Promise<void> }>;

const rico = { nombre: "Ñandú — “comillas” \\ barra \n salto", n: 1500000, ratio: 0.5, neg: -3, nada: null, no: false, vacio: "", lista: [1, "2", { k: [] }], anidado: { b: 2, a: { z: null } }, grande: "9007199254740993", emoji: "🦷" };

export function contratoDeAlmacen(nombre: string, fabrica: FabricaDeAlmacen) {
  describe(`almacén: ${nombre}`, () => {
    async function conAlmacen(prueba: (a: Almacen) => Promise<void>, opciones: { soloLectura?: boolean } = {}) {
      const { almacen, limpiar } = await fabrica(opciones);
      try {
        await almacen.preparar(["clinics", "patients", "users", "subscriptions"]);
        await prueba(almacen);
      } finally {
        await almacen.cerrar();
        await limpiar();
      }
    }
    const todo = async (a: Almacen, coleccion: string, clinica: string | null, limite = 2) => {
      const filas = [];
      let despuesDe: string | null = null;
      for (;;) {
        const pagina = await a.leerPagina({ coleccion, clinica, despuesDe, limite });
        filas.push(...pagina);
        if (pagina.length < limite) return filas;
        despuesDe = pagina[pagina.length - 1].id;
      }
    };

    it("preparar avisa de las colecciones que no tienen tabla", async () => {
      await conAlmacen(async (a) => {
        const { problemas } = await a.preparar(["patients", "tabla_que_no_existe_9"]);
        expect(problemas).toHaveLength(1);
        expect(problemas[0]).toMatch(/tabla_que_no_existe_9/);
        expect((await a.preparar(["patients"])).problemas).toEqual([]);
      });
    });

    it("upsertar inserta, y repetirlo no cambia nada: cuenta insertados, actualizados e iguales", async () => {
      await conAlmacen(async (a) => {
        const filas = [{ id: "p1", data: { a: 1 } }, { id: "p2", data: { a: 2 } }];
        expect(await a.upsertar({ coleccion: "patients", clinica: "c1", filas })).toMatchObject({ insertados: 2, actualizados: 0, iguales: 0, fallidos: [] });
        expect(await a.upsertar({ coleccion: "patients", clinica: "c1", filas })).toMatchObject({ insertados: 0, actualizados: 0, iguales: 2, fallidos: [] });
        expect((await todo(a, "patients", "c1")).map((f) => f.id)).toEqual(["p1", "p2"]);
        const mezcla = [{ id: "p1", data: { a: 1 } }, { id: "p2", data: { a: 99 } }, { id: "p3", data: {} }];
        expect(await a.upsertar({ coleccion: "patients", clinica: "c1", filas: mezcla })).toMatchObject({ insertados: 1, actualizados: 1, iguales: 1 });
      });
    });

    it("reemplaza el documento ENTERO, como el setDoc sin merge de la app: un campo que ya no está se borra", async () => {
      await conAlmacen(async (a) => {
        await a.upsertar({ coleccion: "patients", clinica: "c1", filas: [{ id: "p1", data: { a: 1, b: 2 } }] });
        await a.upsertar({ coleccion: "patients", clinica: "c1", filas: [{ id: "p1", data: { a: 1 } }] });
        expect((await todo(a, "patients", "c1"))[0].data).toEqual({ a: 1 });
      });
    });

    it("cada clínica tiene su espacio: el mismo id en dos clínicas son dos documentos", async () => {
      await conAlmacen(async (a) => {
        await a.upsertar({ coleccion: "patients", clinica: "c1", filas: [{ id: "p1", data: { de: "c1" } }] });
        await a.upsertar({ coleccion: "patients", clinica: "c2", filas: [{ id: "p1", data: { de: "c2" } }] });
        expect((await todo(a, "patients", "c1"))[0].data).toEqual({ de: "c1" });
        expect((await todo(a, "patients", "c2"))[0].data).toEqual({ de: "c2" });
        expect((await a.clinicasEn("patients")).sort()).toEqual(["c1", "c2"]);
      });
    });

    it("las colecciones de la raíz (sin clínica) funcionan igual", async () => {
      await conAlmacen(async (a) => {
        await a.upsertar({ coleccion: "clinics", clinica: null, filas: [{ id: "c1", data: { name: "Uno" } }, { id: "cl_demo", data: { name: "Demo" } }] });
        await a.upsertar({ coleccion: "subscriptions", clinica: null, filas: [{ id: "c1", data: { plan: "solo" } }] });
        expect((await todo(a, "clinics", null)).map((f) => f.id)).toEqual(["c1", "cl_demo"]);
        expect(await todo(a, "subscriptions", null)).toEqual([{ id: "c1", data: { plan: "solo" } }]);
      });
    });

    it("lee de a páginas, sin repetir ni saltear, y los datos vuelven idénticos (mismo contenido aunque cambie el orden de las claves)", async () => {
      await conAlmacen(async (a) => {
        const ids = ["a", "b", "c", "d", "e", "ñ-1", "p 2 ñ%.1"];
        await a.upsertar({ coleccion: "patients", clinica: "c1", filas: ids.map((id) => ({ id, data: { ...rico, id } })) });
        const leidas = await todo(a, "patients", "c1", 3);
        expect(leidas.map((f) => f.id).sort()).toEqual([...ids].sort());
        for (const f of leidas) expect(canonizar(f.data)).toBe(canonizar({ ...rico, id: f.id }));
      });
    });

    it("clinicasEn solo lista las clínicas que tienen filas", async () => {
      await conAlmacen(async (a) => {
        expect(await a.clinicasEn("users")).toEqual([]);
        await a.upsertar({ coleccion: "users", clinica: "c9", filas: [{ id: "u", data: {} }] });
        expect(await a.clinicasEn("users")).toEqual(["c9"]);
      });
    });

    it("un documento que la base no puede guardar (un NUL en un texto) falla solo él, sin tirar abajo el resto del lote", async () => {
      await conAlmacen(async (a) => {
        const filas = [{ id: "ok1", data: { a: 1 } }, { id: "malo", data: { texto: "hola\u0000chau" } }, { id: "ok2", data: { a: 2 } }];
        const r = await a.upsertar({ coleccion: "patients", clinica: "c1", filas });
        expect(r.insertados).toBe(2);
        expect(r.fallidos).toHaveLength(1);
        expect(r.fallidos[0].id).toBe("malo");
        expect(JSON.stringify(r.fallidos)).not.toMatch(/hola/); // ni el contenido del documento en el mensaje
        expect((await todo(a, "patients", "c1")).map((f) => f.id)).toEqual(["ok1", "ok2"]);
      });
    });

    it("un almacén de solo lectura se niega a escribir (y puede leer)", async () => {
      await conAlmacen(async (a) => {
        await expect(a.upsertar({ coleccion: "patients", clinica: "c1", filas: [{ id: "p2", data: {} }] })).rejects.toThrow(/solo lectura/);
        expect(await todo(a, "patients", "c1")).toEqual([]);
        expect(await a.clinicasEn("patients")).toEqual([]);
      }, { soloLectura: true });
    });
  });
}
