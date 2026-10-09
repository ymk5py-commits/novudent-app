import { describe, it, expect, vi } from "vitest";
import { resolverToken, tokenDeEntorno, tokenDeFirebaseCli, tokenDeServicio } from "./credenciales.mjs";

const authFalso = (cuenta: unknown, token: unknown = { access_token: "TOKEN-RENOVADO" }) => () => ({
  getGlobalDefaultAccount: () => cuenta,
  getAccessToken: vi.fn(async () => token),
});

describe("firebase-cli", () => {
  it("renueva el token con la sesión del CLI y dice de qué cuenta es", async () => {
    const r = await tokenDeFirebaseCli({ cargarAuth: authFalso({ user: { email: "dueno@x.com" }, tokens: { refresh_token: "r" } }) });
    expect(r).toEqual({ token: "TOKEN-RENOVADO", cuenta: "dueno@x.com" });
  });
  it("sin sesión iniciada explica qué hacer", async () => {
    await expect(tokenDeFirebaseCli({ cargarAuth: authFalso(undefined) })).rejects.toThrow(/firebase login/);
  });
  it("si no se puede renovar, lo dice", async () => {
    await expect(tokenDeFirebaseCli({ cargarAuth: authFalso({ tokens: { refresh_token: "r" } }, {}) })).rejects.toThrow(/reauth/);
  });
});

describe("servicio", () => {
  const env = { FIREBASE_WEB_API_KEY: "k", SERVICE_USER_EMAIL: "svc@x.com", SERVICE_USER_PASSWORD: "p" };
  it("inicia sesión con el usuario de servicio y devuelve el idToken", async () => {
    const pedir = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ idToken: "ID" }) }) as unknown as Response);
    expect(await tokenDeServicio(env, pedir as unknown as typeof fetch)).toEqual({ token: "ID", cuenta: "svc@x.com" });
    expect((pedir.mock.calls[0] as unknown as [string])[0]).toContain("accounts:signInWithPassword?key=k");
  });
  it("avisa qué variables faltan, sin llamar a la red", async () => {
    const pedir = vi.fn();
    await expect(tokenDeServicio({ FIREBASE_WEB_API_KEY: "k" }, pedir as unknown as typeof fetch)).rejects.toThrow(/SERVICE_USER_EMAIL, SERVICE_USER_PASSWORD/);
    expect(pedir).not.toHaveBeenCalled();
  });
  it("si el inicio de sesión falla, no repite la contraseña en el mensaje", async () => {
    const pedir = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "INVALID_PASSWORD" } }) }) as unknown as Response;
    const error = await tokenDeServicio(env, pedir as unknown as typeof fetch).catch((e) => e);
    expect(error.message).toContain("INVALID_PASSWORD");
    expect(error.message).not.toContain(env.SERVICE_USER_PASSWORD + "x");
  });
});

describe("entorno y resolverToken", () => {
  it("lee GOOGLE_OAUTH_ACCESS_TOKEN", () => {
    expect(tokenDeEntorno({ GOOGLE_OAUTH_ACCESS_TOKEN: "owner" }).token).toBe("owner");
    expect(() => tokenDeEntorno({})).toThrow(/GOOGLE_OAUTH_ACCESS_TOKEN/);
  });
  it("elige el modo y rechaza uno desconocido", async () => {
    expect((await resolverToken({ modo: "entorno", env: { GOOGLE_OAUTH_ACCESS_TOKEN: "t" } })).token).toBe("t");
    await expect(resolverToken({ modo: "otro" })).rejects.toThrow(/desconocida/);
  });
});
