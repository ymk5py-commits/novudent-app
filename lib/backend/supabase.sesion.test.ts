/** La sesión sobre GoTrue y la traducción de errores, con un cliente falso (sin red). El contrato de datos y el tiempo real se prueban contra un stack
 *  de verdad en `supabase.contrato.supabase.test.ts`. */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearSesionSupabase, traducirError, traducirErrorDeIngreso } from "./supabase";

type Evento = (evento: string) => void;

function clienteFalso(opciones: { sesion?: { user: { id: string }; access_token: string } | null; rpc?: Record<string, unknown>; errorIngreso?: unknown } = {}) {
  let oyente: Evento | null = null;
  const llamadas: string[] = [];
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: opciones.sesion ?? null } })),
    signInWithPassword: vi.fn(async () => (opciones.errorIngreso ? { data: { user: null }, error: opciones.errorIngreso } : { data: { user: { id: "uid-login" } }, error: null })),
    signInAnonymously: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn((fn: Evento) => { oyente = fn; return { data: { subscription: { unsubscribe() {} } } }; }),
  };
  const rpc = vi.fn(async (nombre: string) => { llamadas.push(nombre); return { data: opciones.rpc?.[nombre] ?? null, error: null }; });
  return { cliente: { auth, rpc } as unknown as SupabaseClient, auth, rpc, llamadas, emitir: (e: string) => oyente?.(e) };
}

describe("traducirErrorDeIngreso (GoTrue → códigos de Firebase Auth que ya entiende la pantalla)", () => {
  const caso = (e: object) => traducirErrorDeIngreso(e).code;
  it("credenciales malas, correo sin confirmar o usuario inexistente → auth/invalid-credential", () => {
    expect(caso({ code: "invalid_credentials", status: 400 })).toBe("auth/invalid-credential");
    expect(caso({ code: "email_not_confirmed", status: 400 })).toBe("auth/invalid-credential");
    expect(caso({ status: 400, message: "Invalid login credentials" })).toBe("auth/invalid-credential");
  });
  it("demasiados intentos → auth/too-many-requests", () => {
    expect(caso({ code: "over_request_rate_limit", status: 429 })).toBe("auth/too-many-requests");
    expect(caso({ status: 429 })).toBe("auth/too-many-requests");
  });
  it("usuario bloqueado → auth/user-disabled, email inválido → auth/invalid-email", () => {
    expect(caso({ code: "user_banned" })).toBe("auth/user-disabled");
    expect(caso({ code: "email_address_invalid" })).toBe("auth/invalid-email");
  });
  it("sin red → auth/network-request-failed", () => {
    expect(caso(new TypeError("Failed to fetch"))).toBe("auth/network-request-failed");
    expect(caso({ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 })).toBe("auth/network-request-failed");
  });
  it("lo desconocido conserva el mensaje", () => {
    const e = traducirErrorDeIngreso({ code: "algo_raro", message: "boom" });
    expect([e.code, e.message]).toEqual(["auth/algo-raro", "boom"]);
  });
});

describe("traducirError (Postgres/PostgREST → los code de la interfaz)", () => {
  it("42501 → permission-denied; JWT vencido → unauthenticated; sin red → unavailable; PGRST116 → not-found", () => {
    expect(traducirError({ code: "42501", message: "x" }).code).toBe("permission-denied");
    expect(traducirError({ code: "PGRST303", message: "JWT expired" }).code).toBe("unauthenticated");
    expect(traducirError(new TypeError("Failed to fetch")).code).toBe("unavailable");
    expect(traducirError({ code: "PGRST116", message: "0 rows" }).code).toBe("not-found");
  });
  it("el resto conserva su código (o «unknown»)", () => {
    expect(traducirError({ code: "23505", message: "dup" }).code).toBe("23505");
    expect(traducirError({ message: "algo" }).code).toBe("unknown");
  });
  it("no re-envuelve un error ya traducido", () => {
    const e = traducirError({ code: "42501", message: "x" });
    expect(traducirError(e)).toBe(e);
  });
});

describe("la sesión", () => {
  it("iniciarSesion devuelve el uid de LOGIN y traduce los errores", async () => {
    const ok = crearSesionSupabase(clienteFalso().cliente).sesion;
    expect(await ok.iniciarSesion("a@b.c", "x")).toBe("uid-login");
    const mal = crearSesionSupabase(clienteFalso({ errorIngreso: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" } }).cliente).sesion;
    await expect(mal.iniciarSesion("a@b.c", "x")).rejects.toMatchObject({ code: "auth/invalid-credential" });
  });

  it("la sesión de la demo se abre solo si no hay ninguna (no pisa una sesión real)", async () => {
    const con = clienteFalso({ sesion: { user: { id: "u" }, access_token: "t" } });
    expect(await crearSesionSupabase(con.cliente).sesion.iniciarSesionDeDemo()).toBe(true);
    expect(con.auth.signInAnonymously).not.toHaveBeenCalled();
    const sin = clienteFalso();
    expect(await crearSesionSupabase(sin.cliente).sesion.iniciarSesionDeDemo()).toBe(true);
    expect(sin.auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("token: el del servidor de sesión, o null sin sesión", async () => {
    expect(await crearSesionSupabase(clienteFalso({ sesion: { user: { id: "u" }, access_token: "jwt" } }).cliente).sesion.token()).toBe("jwt");
    expect(await crearSesionSupabase(clienteFalso().cliente).sesion.token()).toBeNull();
  });

  it("usuarioActual devuelve el id del DOCUMENTO (mi_clinica + mi_usuario) y lo recuerda mientras sea la misma sesión", async () => {
    const f = clienteFalso({ sesion: { user: { id: "uid-login" }, access_token: "t" }, rpc: { mi_clinica: "cl_a", mi_usuario: "u_documento" } });
    const { sesion } = crearSesionSupabase(f.cliente);
    expect(await sesion.usuarioActual()).toBe("u_documento");
    expect(await sesion.usuarioActual()).toBe("u_documento");
    expect(f.llamadas).toEqual(["mi_clinica", "mi_usuario"]); // la segunda vez no vuelve a preguntar
    await sesion.cerrarSesion();
    await sesion.usuarioActual();
    expect(f.llamadas).toEqual(["mi_clinica", "mi_usuario", "mi_clinica", "mi_usuario"]); // al cerrar sesión se olvida
  });

  it("usuarioActual sin ficha en ninguna clínica (la anónima de la demo) devuelve el uid de login, sin recordarlo", async () => {
    const f = clienteFalso({ sesion: { user: { id: "uid-anonimo" }, access_token: "t" }, rpc: { mi_clinica: null } });
    const { sesion } = crearSesionSupabase(f.cliente);
    expect(await sesion.usuarioActual()).toBe("uid-anonimo");
    await sesion.usuarioActual();
    expect(f.llamadas).toEqual(["mi_clinica", "mi_clinica"]);
  });

  it("usuarioActual sin sesión es null y no llama a la base", async () => {
    const f = clienteFalso();
    expect(await crearSesionSupabase(f.cliente).sesion.usuarioActual()).toBeNull();
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("cerrarSesion cierra solo esta sesión (no las de otros dispositivos)", async () => {
    const f = clienteFalso();
    await crearSesionSupabase(f.cliente).sesion.cerrarSesion();
    expect(f.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("recuperar la contraseña con el enlace del correo", () => {
  it("el enlace trae una sesión de recuperación: se detecta, se fija la contraseña nueva y se cierra esa sesión", async () => {
    const f = clienteFalso({ sesion: { user: { id: "u" }, access_token: "t" } });
    const { sesion } = crearSesionSupabase(f.cliente);
    f.emitir("PASSWORD_RECOVERY");
    expect(await sesion.hayEnlaceDeRecuperacion!()).toBe(true);
    await sesion.fijarClaveNueva!("Nueva-12345");
    expect(f.auth.updateUser).toHaveBeenCalledWith({ password: "Nueva-12345" });
    expect(f.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(await sesion.hayEnlaceDeRecuperacion!()).toBe(false); // ya se usó
  });

  it("el aviso de supabase-js llega DESPUÉS de getSession(): el enlace se reconoce igual por la URL de la carga", async () => {
    const f = clienteFalso({ sesion: { user: { id: "u" }, access_token: "t" } });
    const { sesion } = crearSesionSupabase(f.cliente, true); // sin emitir PASSWORD_RECOVERY
    expect(await sesion.hayEnlaceDeRecuperacion!()).toBe(true);
    await sesion.fijarClaveNueva!("Nueva-12345");
    expect(f.auth.updateUser).toHaveBeenCalledWith({ password: "Nueva-12345" });
  });

  it("…pero si el enlace no produjo una sesión válida (vencido), no hay recuperación", async () => {
    const f = clienteFalso();
    expect(await crearSesionSupabase(f.cliente, true).sesion.hayEnlaceDeRecuperacion!()).toBe(false);
  });

  it("una carga normal (aunque haya sesión) no es una recuperación", async () => {
    const f = clienteFalso({ sesion: { user: { id: "u" }, access_token: "t" } });
    expect(await crearSesionSupabase(f.cliente).sesion.hayEnlaceDeRecuperacion!()).toBe(false);
  });

  it("fijarClaveNueva sin enlace de recuperación se rechaza (nadie cambia la contraseña de una sesión normal por acá)", async () => {
    const f = clienteFalso({ sesion: { user: { id: "u" }, access_token: "t" } });
    await expect(crearSesionSupabase(f.cliente).sesion.fijarClaveNueva!("Nueva-12345")).rejects.toThrow();
    expect(f.auth.updateUser).not.toHaveBeenCalled();
  });

  it("enviarRecuperacion pide el correo con redirección a /login", async () => {
    vi.stubGlobal("window", { location: { origin: "https://novudent.test" } });
    try {
      const f = clienteFalso();
      await crearSesionSupabase(f.cliente).sesion.enviarRecuperacion("a@b.c");
      expect(f.auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.c", { redirectTo: "https://novudent.test/login" });
    } finally { vi.unstubAllGlobals(); }
  });
});
