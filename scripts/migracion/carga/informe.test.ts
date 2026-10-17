import { afterEach, describe, expect, it } from "vitest";
import { crearAlmacenEnMemoria } from "./almacen.mjs";
import { ejecutarCarga } from "./cargar.mjs";
import { armarInforme } from "./informe.mjs";
import { COLECCIONES, baseSintetica, carpetaTemporal, escribirExportacion, gotrueFalso, limpiarCarpetas } from "./fixtures";

afterEach(limpiarCarpetas);

async function correr(modo: "cargar" | "solo-verificar" | "simulacro", { almacen = crearAlmacenEnMemoria({ colecciones: [...COLECCIONES.porClinica, ...COLECCIONES.raiz] }), base = baseSintetica() } = {}) {
  const carpeta = carpetaTemporal();
  await escribirExportacion(carpeta, { base });
  const informe = await ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen, gotrue: gotrueFalso(), modo });
  return { informe, almacen, carpeta };
}

describe("armarInforme", () => {
  it("una carga correcta: dice SIN DIFERENCIAS, muestra cantidades por colección contra el manifiesto y el destino (sin clave)", async () => {
    const { informe } = await correr("cargar");
    informe.destino = "supabase_admin@127.0.0.1:18101/postgres";
    const texto = armarInforme(informe);
    expect(texto).toMatch(/SIN DIFERENCIAS/);
    expect(texto).toContain("supabase_admin@127.0.0.1:18101/postgres");
    expect(texto).toMatch(/\| clinics\/c1\/patients \| 2 \| 2 \| 2 \|/); // manifiesto, base, iguales
    expect(texto).toMatch(/cuentas de GoTrue/i);
    expect(texto).not.toMatch(/HAY DIFERENCIAS/);
  });

  it("con diferencias: dice HAY DIFERENCIAS y lista los ids (nunca el contenido), con tope", async () => {
    const base = baseSintetica();
    for (let i = 0; i < 30; i++) base["clinics/c1/patients"].push({ id: `masivo${i}`, data: { nombre: "SECRETO" } });
    const { informe, almacen, carpeta } = await correr("cargar", { base });
    await almacen.upsertar({ coleccion: "patients", clinica: "c1", filas: Array.from({ length: 30 }, (_, i) => ({ id: `masivo${i}`, data: { nombre: "OTRO SECRETO" } })) });
    const verificado = await ejecutarCarga({ carpeta, colecciones: COLECCIONES, almacen, gotrue: gotrueFalso([{ id: "u-1", email: "ana@example.com" }, { id: "u-2", email: "luis@example.com" }]), modo: "solo-verificar" });
    const texto = armarInforme(verificado);
    expect(informe.ok).toBe(true);
    expect(texto).toMatch(/HAY DIFERENCIAS/);
    expect(texto).toContain("masivo0");
    expect(texto).toMatch(/y 10 más/); // 30 ids, se muestran 20
    expect(texto).not.toContain("SECRETO");
  });

  it("el simulacro se rotula como tal y habla de lo que se haría", async () => {
    const { informe } = await correr("simulacro");
    const texto = armarInforme(informe);
    expect(texto).toMatch(/SIMULACRO/);
    expect(texto).toMatch(/no se escribió nada/i);
    expect(texto).toMatch(/Se insertarían/);
  });

  it("muestra las clínicas ajenas, las advertencias y los documentos que no se pudieron cargar", async () => {
    const base = baseSintetica();
    base["clinics/c1/patients"].push({ id: "malo", data: { nombre: "a\u0000b" } });
    const almacen = crearAlmacenEnMemoria({ colecciones: [...COLECCIONES.porClinica, ...COLECCIONES.raiz] });
    await almacen.upsertar({ coleccion: "appointments", clinica: "ajena", filas: [{ id: "z", data: {} }] });
    const { informe } = await correr("cargar", { almacen, base });
    const texto = armarInforme(informe);
    expect(texto).toMatch(/ajena/);
    expect(texto).toMatch(/malo/);
    expect(texto).toMatch(/no se pudo cargar|NO se pudieron cargar/i);
    expect(texto).toMatch(/directory/); // advertencia: se exportó y no se carga
  });
});
