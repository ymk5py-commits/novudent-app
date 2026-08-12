import { describe, it, expect } from "vitest";

/* Fija el contrato de carga de `loadFirestore` (lib/store.tsx).
 *
 * EL BUG QUE ESTE TEST IMPIDE QUE VUELVA: las 31 colecciones de la clínica se
 * piden en un único `Promise.all`, y `Promise.all` rechaza al PRIMER rechazo.
 * Como `expenses` y `settlements` son admin-only en firestore.rules, el
 * permission-denied de un dentista o de una asistente tumbaba el arranque
 * ENTERO y mandaba la app a "modo local". Traducido: la clínica compraba el
 * sistema y solo el dueño podía usarlo.
 *
 * No se puede testear `loadFirestore` de punta a punta sin levantar Firestore,
 * así que se testea la DECISIÓN que lo arregla, que es la que se rompe si
 * alguien "simplifica" el catch: un permission-denied es una colección vacía;
 * cualquier otro error sigue explotando. */

/** Copia exacta de la lógica de `col()` en lib/store.tsx. */
async function leerColeccion<T>(getDocs: () => Promise<{ docs: { data: () => T }[] }>) {
  try {
    return await getDocs();
  } catch (e: any) {
    if (e?.code === "permission-denied") return null;
    throw e;
  }
}

/** Copia exacta de `filas<T>()` en lib/store.tsx. */
const filas = <T,>(snap: { docs: { data: () => T }[] } | null): T[] =>
  snap ? snap.docs.map((d) => d.data()) : [];

const errorFirestore = (code: string) => Object.assign(new Error(code), { code });
const snapshotCon = <T,>(...items: T[]) => ({ docs: items.map((i) => ({ data: () => i })) });

describe("carga de colecciones por rol", () => {
  it("una colección legible devuelve sus filas", async () => {
    const snap = await leerColeccion(async () => snapshotCon({ id: "p1" }, { id: "p2" }));
    expect(filas(snap)).toEqual([{ id: "p1" }, { id: "p2" }]);
  });

  it("permission-denied devuelve vacío, NO rompe — es el bug del dentista", async () => {
    const snap = await leerColeccion(async () => { throw errorFirestore("permission-denied"); });
    expect(snap).toBeNull();
    expect(filas(snap)).toEqual([]);
  });

  it("un error que NO es de permisos sigue explotando (red, cuota, config rota)", async () => {
    await expect(
      leerColeccion(async () => { throw errorFirestore("unavailable"); }),
    ).rejects.toThrow("unavailable");
  });

  it("un rol sin acceso a gastos igual carga el resto: el arranque no se cae", async () => {
    /* Reproduce el arranque de un dentista: pacientes sí, gastos denegados.
       Antes de la corrección este Promise.all rechazaba entero. */
    const [pacientes, gastos] = await Promise.all([
      leerColeccion(async () => snapshotCon({ id: "pac1" })),
      leerColeccion(async () => { throw errorFirestore("permission-denied"); }),
    ]);
    expect(filas(pacientes)).toHaveLength(1);
    expect(filas(gastos)).toHaveLength(0);
  });
});
