import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AuthError } from "./auth";
import { extraerBearer, verificarJwtSupabase } from "./auth-supabase";

const SECRETO = "secreto-de-prueba-de-32-caracteres!";
const AHORA = 1_800_000_000_000; // ms
const b64 = (o: unknown) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");

/** Arma un JWT como los de GoTrue (HS256), con la carga que se le pase. */
function jwt(carga: Record<string, unknown>, opciones: { secreto?: string; cabecera?: Record<string, unknown>; firma?: string } = {}): string {
  const cab = b64(opciones.cabecera ?? { alg: "HS256", typ: "JWT" });
  const cuerpo = b64(carga);
  const firma = opciones.firma ?? createHmac("sha256", opciones.secreto ?? SECRETO).update(`${cab}.${cuerpo}`).digest("base64url");
  return `${cab}.${cuerpo}.${firma}`;
}
const valida = { sub: "9b1c6f1e-0000-4000-8000-000000000001", role: "authenticated", aud: "authenticated", email: "Ana@Clinica.test", exp: AHORA / 1000 + 3600 };
const intenta = (token: string, secreto: string | null = SECRETO) => () => verificarJwtSupabase(token, secreto ?? undefined, AHORA);

describe("verificarJwtSupabase", () => {
  it("devuelve uid, email e isAnonymous=false para una sesión de email", () => {
    expect(verificarJwtSupabase(jwt(valida), SECRETO, AHORA)).toEqual({ uid: valida.sub, email: "Ana@Clinica.test", isAnonymous: false });
  });

  it("marca isAnonymous con el claim is_anonymous (sesión de la demo, sin email)", () => {
    const { email: _e, ...sinEmail } = valida;
    expect(verificarJwtSupabase(jwt({ ...sinEmail, is_anonymous: true }), SECRETO, AHORA)).toEqual({ uid: valida.sub, email: undefined, isAnonymous: true });
  });

  it("rechaza una firma hecha con otro secreto (401)", () => {
    const e = (() => { try { intenta(jwt(valida, { secreto: "otro-secreto-otro-secreto-otro-sec" }))(); } catch (x) { return x; } })();
    expect(e).toBeInstanceOf(AuthError);
    expect((e as AuthError).status).toBe(401);
  });

  it("rechaza un token con la carga alterada después de firmar", () => {
    const [cab, , firma] = jwt(valida).split(".");
    expect(intenta(`${cab}.${b64({ ...valida, sub: "otro" })}.${firma}`)).toThrow(AuthError);
  });

  it("rechaza alg=none y cualquier algoritmo que no sea HS256 (confusión de algoritmo)", () => {
    expect(intenta(jwt(valida, { cabecera: { alg: "none", typ: "JWT" }, firma: "" }))).toThrow(AuthError);
    expect(intenta(jwt(valida, { cabecera: { alg: "HS512", typ: "JWT" } }))).toThrow(AuthError);
    expect(intenta(jwt(valida, { cabecera: { alg: "RS256", typ: "JWT" } }))).toThrow(AuthError);
  });

  it("rechaza un token vencido y uno sin vencimiento", () => {
    expect(intenta(jwt({ ...valida, exp: AHORA / 1000 - 1 }))).toThrow(/expir/i);
    const { exp: _x, ...sinExp } = valida;
    expect(intenta(jwt(sinExp))).toThrow(AuthError);
  });

  it("rechaza las claves anon y service_role (sin sub, otro rol): no son personas", () => {
    expect(intenta(jwt({ role: "anon", iss: "supabase", exp: valida.exp }))).toThrow(AuthError);
    expect(intenta(jwt({ role: "service_role", iss: "supabase", exp: valida.exp }))).toThrow(AuthError);
    expect(intenta(jwt({ ...valida, role: "service_role" }))).toThrow(AuthError);
  });

  it("rechaza un token mal formado o vacío", () => {
    for (const t of ["", "a.b", "a.b.c.d", "no-es-un-jwt", "....", `${b64("{no es json")}.${b64(valida)}.x`]) expect(intenta(t)).toThrow(AuthError);
  });

  it("sin secreto configurado responde 503 (no 401: es un problema del servidor)", () => {
    const e = (() => { try { intenta(jwt(valida), null)(); } catch (x) { return x; } })();
    expect((e as AuthError).status).toBe(503);
  });
});

describe("extraerBearer", () => {
  const req = (authorization?: string) => new Request("http://x.test/api", { headers: authorization ? { authorization } : {} });
  it("lee el token del encabezado Authorization", () => {
    expect(extraerBearer(req("Bearer abc.def.ghi"))).toBe("abc.def.ghi");
    expect(extraerBearer(req("bearer   abc  "))).toBe("abc");
  });
  it("falta o está vacío → 401", () => {
    for (const r of [req(), req("Bearer"), req("Bearer    "), req("Basic abc")]) expect(() => extraerBearer(r)).toThrow(AuthError);
  });
});
