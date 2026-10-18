/** Cuentas de login sobre GoTrue (API de administración y actualización de usuario), con `fetch` mockeado. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "./auth-error";
import { crearCuentasSupabase } from "./cuentas-supabase";

interface Llamada { metodo: string; url: URL; cabeceras: Record<string, string>; cuerpo: Record<string, unknown> | undefined }
let llamadas: Llamada[] = [];
let respuestas: Array<{ status?: number; json?: unknown } | "red">;

function cuentas(respondidas: typeof respuestas, config: { anon?: string } = { anon: "clave-anon" }) {
  llamadas = [];
  respuestas = [...respondidas];
  const f = vi.fn(async (url: string | URL, init?: RequestInit) => {
    llamadas.push({
      metodo: init?.method ?? "GET",
      url: new URL(String(url)),
      cabeceras: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
      cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = respuestas.shift() ?? { json: {} };
    if (r === "red") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  });
  return crearCuentasSupabase({ url: "http://kong.test", serviceKey: "clave-de-servicio", anonKey: config.anon, fetch: f as unknown as typeof fetch });
}
const falla = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e as AuthError; } throw new Error("tendría que haber fallado"); };

afterEach(() => vi.unstubAllEnvs());

describe("estaConfigurado", () => {
  it("pide la URL, la clave de servicio y la clave pública", () => {
    expect(crearCuentasSupabase({ url: "http://x", serviceKey: "s", anonKey: "a" }).estaConfigurado()).toBe(true);
    expect(crearCuentasSupabase({ url: "http://x", serviceKey: "s", anonKey: "" }).estaConfigurado()).toBe(false);
    expect(crearCuentasSupabase({ url: "http://x", serviceKey: "", anonKey: "a" }).estaConfigurado()).toBe(false);
  });
});

describe("crearOCuentaRecuperar", () => {
  it("crea la cuenta con la API de administración, con el correo ya confirmado, y devuelve su id", async () => {
    const c = cuentas([{ json: { id: "9b1c6f1e-0000-4000-8000-000000000001", email: "ana@clinica.test" } }]);
    expect(await c.crearOCuentaRecuperar("ana@clinica.test", "secreto123")).toBe("9b1c6f1e-0000-4000-8000-000000000001");
    const l = llamadas[0];
    expect([l.metodo, l.url.pathname]).toEqual(["POST", "/auth/v1/admin/users"]);
    expect(l.cabeceras.authorization).toBe("Bearer clave-de-servicio");
    expect(l.cabeceras.apikey).toBe("clave-de-servicio");
    expect(l.cuerpo).toEqual({ email: "ana@clinica.test", password: "secreto123", email_confirm: true });
  });

  it("si el email ya existe, recupera la cuenta iniciando sesión con la misma contraseña (alta interrumpida)", async () => {
    const c = cuentas([
      { status: 422, json: { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" } },
      { json: { access_token: "t", user: { id: "uuid-existente" } } },
    ]);
    expect(await c.crearOCuentaRecuperar("ana@clinica.test", "secreto123")).toBe("uuid-existente");
    expect(llamadas[1].url.pathname).toBe("/auth/v1/token");
    expect(llamadas[1].url.searchParams.get("grant_type")).toBe("password");
    expect(llamadas[1].cabeceras.apikey).toBe("clave-anon");
  });

  it("si el email ya existe con OTRA contraseña, 409 sin revelar nada más", async () => {
    const c = cuentas([{ status: 422, json: { error_code: "email_exists" } }, { status: 400, json: { error_code: "invalid_credentials" } }]);
    const e = await falla(c.crearOCuentaRecuperar("ana@clinica.test", "otra-clave"));
    expect(e).toBeInstanceOf(AuthError);
    expect(e.status).toBe(409);
  });

  it("contraseña débil → 400; email inválido → 400", async () => {
    expect((await falla(cuentas([{ status: 422, json: { error_code: "weak_password", msg: "Password should be at least 6 characters" } }]).crearOCuentaRecuperar("a@b.co", "123"))).status).toBe(400);
    expect((await falla(cuentas([{ status: 422, json: { error_code: "email_address_invalid" } }]).crearOCuentaRecuperar("raro", "secreto123"))).status).toBe(400);
    expect((await falla(cuentas([{ status: 400, json: { error_code: "validation_failed" } }]).crearOCuentaRecuperar("raro", "secreto123"))).status).toBe(400);
  });

  it("cualquier otro fallo (o la red caída) es un error genérico, sin AuthError", async () => {
    const e1 = await falla(cuentas([{ status: 500, json: { msg: "boom" } }]).crearOCuentaRecuperar("a@b.co", "secreto123"));
    expect(e1).not.toBeInstanceOf(AuthError);
    const e2 = await falla(cuentas(["red"]).crearOCuentaRecuperar("a@b.co", "secreto123"));
    expect(e2).not.toBeInstanceOf(AuthError);
  });

  it("si el servidor no entrega un id válido, falla", async () => {
    await falla(cuentas([{ json: {} }]).crearOCuentaRecuperar("a@b.co", "secreto123"));
  });
});

describe("cambiarClave", () => {
  it("actualiza la contraseña con el token de la propia persona (así GoTrue también comprueba que la sesión siga viva)", async () => {
    const c = cuentas([{ json: { id: "u" } }]);
    await c.cambiarClave("jwt-de-ana", "nueva-clave");
    const l = llamadas[0];
    expect([l.metodo, l.url.pathname]).toEqual(["PUT", "/auth/v1/user"]);
    expect(l.cabeceras.authorization).toBe("Bearer jwt-de-ana");
    expect(l.cabeceras.apikey).toBe("clave-anon");
    expect(l.cuerpo).toEqual({ password: "nueva-clave" });
  });

  it("débil → 400, igual a la actual → 400 con mensaje propio, sesión vencida o revocada → 401", async () => {
    const debil = await falla(cuentas([{ status: 422, json: { error_code: "weak_password" } }]).cambiarClave("t", "123"));
    expect([debil.status, debil.message]).toEqual([400, "La contraseña es demasiado débil."]);
    const igual = await falla(cuentas([{ status: 422, json: { error_code: "same_password" } }]).cambiarClave("t", "igual"));
    expect(igual.status).toBe(400);
    expect(igual.message).toMatch(/distinta/);
    for (const status of [401, 403]) {
      const e = await falla(cuentas([{ status, json: { error_code: "bad_jwt" } }]).cambiarClave("t", "nueva-clave"));
      expect([e.status, e.message]).toEqual([401, "Tu sesión expiró. Volvé a iniciar sesión."]);
    }
  });

  it("session_not_found (sesión cerrada con el token todavía vigente) → 401", async () => {
    const e = await falla(cuentas([{ status: 403, json: { error_code: "session_not_found" } }]).cambiarClave("t", "nueva-clave"));
    expect(e.status).toBe(401);
  });

  it("otro fallo → error genérico", async () => {
    expect(await falla(cuentas([{ status: 500, json: {} }]).cambiarClave("t", "nueva-clave"))).not.toBeInstanceOf(AuthError);
  });
});
