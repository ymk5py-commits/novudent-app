import { describe, expect, it } from "vitest";
import { crearAlmacenPostgres } from "./almacen.mjs";
import { contratoDeAlmacen } from "./almacen.contrato";
import { COLECCIONES } from "./fixtures";
import { URL_DE_PRUEBA, clientePg, crearEsquemaDePrueba } from "./postgres-prueba.mjs";

// Estas pruebas necesitan una base Postgres de verdad: se saltean si no hay NOVUDENT_PRUEBA_DB_URL (ver stack-de-prueba.sh).
describe.skipIf(!URL_DE_PRUEBA)("almacén de Postgres", () => {
  for (const estilo of ["camel", "snake"] as const) {
    contratoDeAlmacen(`postgres (tablas ${estilo})`, async ({ soloLectura }) => {
      const base = await crearEsquemaDePrueba(COLECCIONES, { estilo });
      return {
        almacen: await crearAlmacenPostgres({ url: URL_DE_PRUEBA!, soloLectura, esquema: base.esquema }),
        limpiar: () => base.borrar(),
      };
    });
  }

  it("la sesión de solo lectura la rechaza la propia base (aunque alguien salteara el chequeo del almacén)", async () => {
    const base = await crearEsquemaDePrueba(COLECCIONES);
    try {
      const almacen = await crearAlmacenPostgres({ url: URL_DE_PRUEBA!, soloLectura: true, esquema: base.esquema });
      await almacen.preparar(["patients"]);
      const { Client } = await clientePg();
      // Mismo cliente de la sesión de solo lectura: se lo pedimos escondido en el almacén no existe; abrimos otra sesión con el mismo ajuste.
      const c = new Client({ connectionString: URL_DE_PRUEBA });
      await c.connect();
      await c.query("set default_transaction_read_only = on");
      await expect(c.query(`insert into "${base.esquema}"."patients" (clinic_id, id, data) values ('c', 'i', '{}')`)).rejects.toThrow(/read-only/);
      await c.end();
      await almacen.cerrar();
    } finally {
      await base.borrar();
    }
  });

  it("dos cargas a la vez contra la misma base no se pisan: la segunda se niega", async () => {
    const base = await crearEsquemaDePrueba(COLECCIONES);
    try {
      const primera = await crearAlmacenPostgres({ url: URL_DE_PRUEBA!, esquema: base.esquema });
      await expect(crearAlmacenPostgres({ url: URL_DE_PRUEBA!, esquema: base.esquema })).rejects.toThrow(/otra carga/i);
      await primera.cerrar();
      const tercera = await crearAlmacenPostgres({ url: URL_DE_PRUEBA!, esquema: base.esquema });
      await tercera.cerrar();
    } finally {
      await base.borrar();
    }
  });

  it("falla con un mensaje claro si una tabla de clínica se usa sin clínica (o al revés)", async () => {
    const base = await crearEsquemaDePrueba(COLECCIONES);
    try {
      const almacen = await crearAlmacenPostgres({ url: URL_DE_PRUEBA!, esquema: base.esquema });
      await almacen.preparar(["patients", "clinics"]);
      await expect(almacen.upsertar({ coleccion: "patients", clinica: null, filas: [{ id: "x", data: {} }] })).rejects.toThrow(/es de clínica/);
      await expect(almacen.upsertar({ coleccion: "clinics", clinica: "c1", filas: [{ id: "x", data: {} }] })).rejects.toThrow(/clinic_id/);
      await almacen.cerrar();
    } finally {
      await base.borrar();
    }
  });

  it("se niega a trabajar con un rol sujeto a RLS (la verificación no vería todas las filas)", async () => {
    const base = await crearEsquemaDePrueba(COLECCIONES);
    const rol = `rol_t_${Math.random().toString(36).slice(2, 10)}`;
    const clave = `c${Math.random().toString(36).slice(2, 12)}`;
    await base.consultar(`create role ${rol} login password '${clave}'`);
    try {
      const u = new URL(URL_DE_PRUEBA!);
      u.username = rol;
      u.password = clave;
      const almacen = await crearAlmacenPostgres({ url: u.toString(), soloLectura: true, esquema: base.esquema });
      const { problemas } = await almacen.preparar(["patients"]);
      expect(problemas).toHaveLength(1);
      expect(problemas[0]).toMatch(/BYPASSRLS/);
      expect(problemas[0]).toContain(rol);
      await almacen.cerrar();
    } finally {
      await base.consultar(`drop role ${rol}`);
      await base.borrar();
    }
  });
});
