import { describe, it, expect, vi } from "vitest";
import { crearCliente, ErrorDeLectura } from "./cliente.mjs";

const respuesta = (cuerpo: unknown, estado = 200) => ({ ok: estado >= 200 && estado < 300, status: estado, json: async () => cuerpo }) as unknown as Response;
const sinEspera = async () => {};
const doc = (nombre: string) => ({ name: `projects/p/databases/(default)/documents/${nombre}`, createTime: "t", fields: {} });
async function todos<T>(it: AsyncIterable<T>) { const salida: T[] = []; for await (const x of it) salida.push(x); return salida; }

describe("listarDocumentos", () => {
  it("sigue la paginación hasta que no hay más páginas y manda el token y showMissing", async () => {
    const pedidos: Array<{ url: string; auth: string }> = [];
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      pedidos.push({ url, auth: (init.headers as Record<string, string>).Authorization });
      if (!url.includes("pageToken")) return respuesta({ documents: [doc("clinics/a"), doc("clinics/b")], nextPageToken: "T1" });
      if (url.includes("pageToken=T1")) return respuesta({ documents: [doc("clinics/c")], nextPageToken: "T2" });
      return respuesta({ documents: [doc("clinics/d")] });
    });
    const cliente = crearCliente({ proyecto: "p", token: "secreto", fetch: fetch as unknown as typeof globalThis.fetch, esperar: sinEspera });
    const nombres = (await todos(cliente.listarDocumentos("", "clinics"))).map((d: { name: string }) => d.name.split("/").pop());
    expect(nombres).toEqual(["a", "b", "c", "d"]);
    expect(pedidos).toHaveLength(3);
    expect(pedidos.every((p) => p.auth === "Bearer secreto")).toBe(true);
    expect(pedidos[0].url).toContain("/documents/clinics?");
    expect(pedidos[0].url).toContain("showMissing=true");
  });

  it("codifica cada tramo de la ruta (ids con espacios o barras no se escapan de su colección)", async () => {
    const fetch = vi.fn(async () => respuesta({}));
    const cliente = crearCliente({ proyecto: "p", token: "t", fetch: fetch as unknown as typeof globalThis.fetch, esperar: sinEspera });
    await todos(cliente.listarDocumentos("clinics/cl 1", "patients"));
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toContain("/documents/clinics/cl%201/patients?");
  });

  it("reintenta con espera creciente ante 503 y cortes de red, y sigue", async () => {
    const esperas: number[] = [];
    const fetch = vi.fn()
      .mockResolvedValueOnce(respuesta({}, 503))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(respuesta({ documents: [doc("clinics/a")] }));
    const cliente = crearCliente({ proyecto: "p", token: "t", fetch: fetch as unknown as typeof globalThis.fetch, esperar: async (ms) => { esperas.push(ms); } });
    expect(await todos(cliente.listarDocumentos("", "clinics"))).toHaveLength(1);
    expect(esperas).toEqual([500, 1000]);
  });

  it("un 403 es un error de permiso (no se reintenta)", async () => {
    const fetch = vi.fn(async () => respuesta({}, 403));
    const cliente = crearCliente({ proyecto: "p", token: "t", fetch: fetch as unknown as typeof globalThis.fetch, esperar: sinEspera });
    const error = await todos(cliente.listarDocumentos("clinics/c1", "directMessages")).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorDeLectura);
    expect(error).toMatchObject({ estado: 403, permiso: true, ruta: "clinics/c1/directMessages" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("después de agotar los reintentos falla sin marcar permiso", async () => {
    const fetch = vi.fn(async () => respuesta({}, 500));
    const cliente = crearCliente({ proyecto: "p", token: "t", fetch: fetch as unknown as typeof globalThis.fetch, esperar: sinEspera, reintentos: 2 });
    const error = await todos(cliente.listarDocumentos("", "clinics")).catch((e) => e);
    expect(error).toMatchObject({ estado: 500, permiso: false });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("el mensaje de error no incluye el token", async () => {
    const fetch = vi.fn(async () => respuesta({}, 403));
    const cliente = crearCliente({ proyecto: "p", token: "TOKEN-SECRETO", fetch: fetch as unknown as typeof globalThis.fetch, esperar: sinEspera });
    const error = await todos(cliente.listarDocumentos("", "clinics")).catch((e) => e);
    expect(String(error.message)).not.toContain("TOKEN-SECRETO");
  });

  it("reintenta json() que falla una vez con TypeError", async () => {
    const esperas: number[] = [];
    let llamadas = 0;
    const fetch = vi.fn(async () => {
      llamadas++;
      if (llamadas === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => { throw new TypeError("network error during streaming"); }
        } as unknown as Response;
      }
      return respuesta({ documents: [doc("clinics/a")] });
    });
    const cliente = crearCliente({ proyecto: "p", token: "t", fetch: fetch as unknown as typeof globalThis.fetch, esperar: async (ms) => { esperas.push(ms); } });
    expect(await todos(cliente.listarDocumentos("", "clinics"))).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(esperas).toEqual([500]);
  });

  it("json() que siempre falla con SyntaxError que cita el cuerpo no expone el contenido en el error", async () => {
    const fetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected token in {"nombre":"Luis Gómez"}'); }
      } as unknown as Response;
    });
    const cliente = crearCliente({ proyecto: "p", token: "t", fetch: fetch as unknown as typeof globalThis.fetch, esperar: async () => {}, reintentos: 2 });
    const error = await todos(cliente.listarDocumentos("", "clinics")).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorDeLectura);
    expect(error).toMatchObject({ permiso: false });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(String(error.message)).not.toContain("Luis");
    expect(String(error.message)).not.toContain("Unexpected token");
  });
});

describe("listarColecciones", () => {
  it("lista las colecciones de primer nivel y las de un documento, con paginación", async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      const cuerpo = JSON.parse(String(init.body));
      if (url.endsWith("/documents:listCollectionIds")) return respuesta({ collectionIds: ["clinics", "directory"] });
      return cuerpo.pageToken ? respuesta({ collectionIds: ["patients"] }) : respuesta({ collectionIds: ["users"], nextPageToken: "T" });
    });
    const cliente = crearCliente({ proyecto: "p", token: "t", fetch: fetch as unknown as typeof globalThis.fetch, esperar: sinEspera });
    expect(await cliente.listarColecciones()).toEqual(["clinics", "directory"]);
    expect(await cliente.listarColecciones("clinics/c1")).toEqual(["users", "patients"]);
    expect((fetch.mock.calls[1] as unknown as [string])[0]).toContain("/documents/clinics/c1:listCollectionIds");
  });
});
