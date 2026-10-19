import { describe, expect, it } from "vitest";
import { ErrorDeGoTrue, crearClienteGoTrue } from "./gotrue.mjs";

const CLAVE = "clave-de-servicio-SECRETA";

type Llamada = { url: string; metodo: string; cabeceras: Record<string, string>; cuerpo: unknown; redirect?: string };

/** Un `fetch` falso: responde lo que diga `respuestas` (en orden) y anota cada llamada. */
function fetchFalso(respuestas: Array<{ estado?: number; json?: unknown; cabeceras?: Record<string, string> } | Error>) {
  const llamadas: Llamada[] = [];
  const pedir = async (url: string, init: { method?: string; headers: Record<string, string>; body?: string; redirect?: string }) => {
    llamadas.push({ url, metodo: init.method ?? "GET", cabeceras: init.headers, cuerpo: init.body ? JSON.parse(init.body) : undefined, redirect: init.redirect });
    const r = respuestas.shift();
    if (!r) throw new Error("no quedan respuestas");
    if (r instanceof Error) throw r;
    const estado = r.estado ?? 200;
    return { ok: estado >= 200 && estado < 300, status: estado, headers: { get: (n: string) => r.cabeceras?.[n.toLowerCase()] ?? null }, json: async () => r.json ?? {} };
  };
  return { pedir: pedir as unknown as typeof fetch, llamadas, quedan: () => respuestas.length };
}
const sinEspera = async () => {};
const cliente = (f: ReturnType<typeof fetchFalso>, extra = {}) => crearClienteGoTrue({ url: "http://127.0.0.1:18100/auth/v1/", clave: CLAVE, fetch: f.pedir, esperar: sinEspera, ...extra });
const usuarioGoTrue = (id: string, email: string, anonimo = false, app_metadata: Record<string, unknown> = {}) => ({ id, email, is_anonymous: anonimo, app_metadata });

describe("crearClienteGoTrue", () => {
  it("rechaza una URL que no sea http(s) o una clave vacía", () => {
    expect(() => crearClienteGoTrue({ url: "ftp://x", clave: CLAVE })).toThrow(/URL de GoTrue/);
    expect(() => crearClienteGoTrue({ url: "no es url", clave: CLAVE })).toThrow(/URL de GoTrue/);
    expect(() => crearClienteGoTrue({ url: "http://x/auth/v1", clave: "" })).toThrow(/clave/);
  });

  it("listarUsuarios pagina hasta que una página viene corta y manda la clave de servicio como apikey y como Bearer", async () => {
    const pagina1 = Array.from({ length: 200 }, (_, i) => usuarioGoTrue(`id${i}`, `u${i}@x.com`));
    const f = fetchFalso([{ json: { users: pagina1 } }, { json: { users: [usuarioGoTrue("idz", "z@x.com"), usuarioGoTrue("ida", "", true)] } }]);
    const usuarios = await cliente(f).listarUsuarios();
    expect(usuarios).toHaveLength(202);
    expect(usuarios[201]).toEqual({ id: "ida", email: "", esAnonimo: true, creadaPorElCargador: false });
    expect(f.llamadas.map((l) => l.url)).toEqual([
      "http://127.0.0.1:18100/auth/v1/admin/users?page=1&per_page=200",
      "http://127.0.0.1:18100/auth/v1/admin/users?page=2&per_page=200",
    ]);
    expect(f.llamadas[0].cabeceras).toMatchObject({ apikey: CLAVE, Authorization: `Bearer ${CLAVE}` });
  });

  it("distingue las cuentas que creó el cargador (app_metadata.origen = firebase) de las que ya estaban", async () => {
    const f = fetchFalso([{ json: { users: [usuarioGoTrue("a", "a@x.com", false, { origen: "firebase", firebase_uid: "fb" }), usuarioGoTrue("b", "b@x.com")] } }]);
    const [a, b] = await cliente(f).listarUsuarios();
    expect(a.creadaPorElCargador).toBe(true);
    expect(b.creadaPorElCargador).toBe(false);
  });

  it("no sigue redirecciones (la clave de servicio no puede ir a otro servidor)", async () => {
    const f = fetchFalso([{ json: { users: [] } }, { json: { id: "u", email: "a@x.com" } }]);
    const c = cliente(f);
    await c.listarUsuarios();
    await c.crearUsuario({ email: "a@x.com", nombre: "A", firebaseUid: "x" });
    expect(f.llamadas.map((l) => l.redirect)).toEqual(["error", "error"]);
  });

  it("crearUsuario manda email confirmado, sin contraseña, con el nombre y el uid viejo de Firebase como datos de rastro", async () => {
    const f = fetchFalso([{ json: usuarioGoTrue("uuid-nuevo", "ana@example.com") }]);
    const creado = await cliente(f).crearUsuario({ email: "ana@example.com", nombre: "Ana", firebaseUid: "fbUidAna" });
    expect(creado).toEqual({ id: "uuid-nuevo", email: "ana@example.com" });
    expect(f.llamadas[0].metodo).toBe("POST");
    expect(f.llamadas[0].url).toBe("http://127.0.0.1:18100/auth/v1/admin/users");
    expect(f.llamadas[0].cuerpo).toEqual({
      email: "ana@example.com",
      email_confirm: true,
      user_metadata: { name: "Ana" },
      app_metadata: { origen: "firebase", firebase_uid: "fbUidAna" },
    });
    expect(JSON.stringify(f.llamadas[0].cuerpo)).not.toMatch(/password/);
  });

  it("un correo ya registrado (422 email_exists) se distingue de los demás errores", async () => {
    const f = fetchFalso([{ estado: 422, json: { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" } }]);
    const error = await cliente(f).crearUsuario({ email: "ana@example.com", nombre: "Ana", firebaseUid: "x" }).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorDeGoTrue);
    expect(error).toMatchObject({ estado: 422, codigo: "email_exists" });
  });

  it("reintenta con espera ante 429, 5xx y cortes de red; no reintenta un 4xx", async () => {
    const esperas: number[] = [];
    const f = fetchFalso([{ estado: 503 }, new Error("ECONNRESET"), { estado: 429 }, { json: { users: [] } }]);
    expect(await cliente(f, { esperar: async (ms: number) => { esperas.push(ms); } }).listarUsuarios()).toEqual([]);
    expect(f.llamadas).toHaveLength(4);
    expect(esperas).toHaveLength(3);
    expect(esperas[1]).toBeGreaterThan(esperas[0]);

    const g = fetchFalso([{ estado: 403, json: { msg: "no" } }, { json: { users: [] } }]);
    await expect(cliente(g).listarUsuarios()).rejects.toMatchObject({ estado: 403 });
    expect(g.quedan()).toBe(1);
  });

  it("se rinde después de los reintentos", async () => {
    const f = fetchFalso(Array.from({ length: 10 }, () => ({ estado: 500 })));
    await expect(cliente(f, { reintentos: 2 }).listarUsuarios()).rejects.toMatchObject({ estado: 500 });
    expect(f.llamadas).toHaveLength(3);
  });

  it("los mensajes de error no llevan la clave, el correo ni el cuerpo de la respuesta", async () => {
    const f = fetchFalso([{ estado: 422, json: { error_code: "email_exists", msg: "ana@example.com ya existe" } }]);
    const error = await cliente(f).crearUsuario({ email: "ana@example.com", nombre: "Ana", firebaseUid: "x" }).catch((e) => e);
    expect(error.message).not.toMatch(/ana@example\.com/);
    expect(error.message).not.toContain(CLAVE);
    const red = await cliente(fetchFalso([new Error(`fallo con ${CLAVE}`)]), { reintentos: 0 }).listarUsuarios().catch((e) => e);
    expect(red.message).not.toContain(CLAVE);
  });

  it("comprobar verifica que GoTrue responda y que la clave sirva para la API de administración", async () => {
    const f = fetchFalso([{ json: {} }, { json: { users: [] } }]);
    await cliente(f).comprobar();
    expect(f.llamadas.map((l) => l.url)).toEqual(["http://127.0.0.1:18100/auth/v1/health", "http://127.0.0.1:18100/auth/v1/admin/users?page=1&per_page=1"]);
    const sinPermiso = fetchFalso([{ json: {} }, { estado: 403 }]);
    await expect(cliente(sinPermiso).comprobar()).rejects.toThrow(/clave de servicio/);
  });
});
