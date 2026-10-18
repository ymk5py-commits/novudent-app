/** `CuentasDeServidor` sobre GoTrue (Supabase Auth).
 *
 *  - Crear una cuenta usa la API de ADMINISTRACIÓN (`POST /auth/v1/admin/users`, con la clave `service_role`) con el correo ya confirmado: el
 *    registro público de GoTrue está abierto a propósito (la demo usa sesión anónima), pero una cuenta real nace solo por acá.
 *  - Cambiar la contraseña usa `PUT /auth/v1/user` con el token de la persona: GoTrue vuelve a comprobar que la sesión siga viva (una sesión
 *    cerrada con el token todavía sin vencer no puede cambiar la contraseña, cosa que la verificación local del JWT no ve). */
import { isValidId } from "./ids";
import { AuthError } from "./auth-error";
import type { CuentasDeServidor } from "./cuentas";

export interface ConfigDeCuentasSupabase {
  url?: string;
  serviceKey?: string;
  anonKey?: string;
  fetch?: typeof fetch;
}

type Respuesta = { ok: boolean; status: number; json: Record<string, unknown> };

export function crearCuentasSupabase(config: ConfigDeCuentasSupabase = {}): CuentasDeServidor {
  const base = () => (config.url ?? (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")).replace(/\/+$/, "");
  const servicio = () => config.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const anonima = () => config.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const estaConfigurado = () => !!base() && !!servicio() && !!anonima();

  async function llamar(metodo: "POST" | "PUT", ruta: string, apikey: string, bearer: string, cuerpo: unknown): Promise<Respuesta> {
    const res = await (config.fetch ?? fetch)(`${base()}/auth/v1${ruta}`, {
      method: metodo,
      headers: { apikey, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, json };
  }
  /** GoTrue identifica el error en `error_code` (versiones nuevas) o en `msg`/`message` (viejas). */
  const codigo = (r: Respuesta) => String(r.json.error_code ?? "");
  const mensaje = (r: Respuesta) => String(r.json.msg ?? r.json.message ?? "");

  async function crearOCuentaRecuperar(email: string, password: string): Promise<string> {
    const alta = await llamar("POST", "/admin/users", servicio(), servicio(), { email, password, email_confirm: true });
    const id = (alta.json as { id?: unknown }).id;
    if (alta.ok && isValidId(id)) return id;

    if (!alta.ok) {
      const c = codigo(alta);
      if (c === "email_exists" || /already been registered/i.test(mensaje(alta))) {
        // Un corte después de crear la cuenta puede dejarla sin ficha. Con la misma contraseña provisional, el alta puede terminarse al reintentar.
        const sesion = await llamar("POST", "/token?grant_type=password", anonima(), anonima(), { email, password });
        const uid = (sesion.json.user as { id?: unknown } | undefined)?.id;
        if (sesion.ok && isValidId(uid)) return uid;
        throw new AuthError("Ese email ya tiene una cuenta. Usá otro email o la contraseña provisional original.", 409);
      }
      if (c === "weak_password") throw new AuthError("La contraseña es demasiado débil.", 400);
      if (c === "email_address_invalid" || c === "validation_failed") throw new AuthError("El email no es válido.", 400);
    }
    throw new Error("No se pudo crear la cuenta en el servicio de ingreso.");
  }

  async function cambiarClave(token: string, nuevaClave: string): Promise<void> {
    const r = await llamar("PUT", "/user", anonima(), token, { password: nuevaClave });
    if (r.ok) return;
    const c = codigo(r);
    if (c === "weak_password") throw new AuthError("La contraseña es demasiado débil.", 400);
    if (c === "same_password") throw new AuthError("La contraseña nueva tiene que ser distinta de la actual.", 400);
    if (r.status === 401 || r.status === 403 || c === "bad_jwt" || c === "session_not_found") throw new AuthError("Tu sesión expiró. Volvé a iniciar sesión.", 401);
    throw new Error(`No se pudo cambiar la contraseña (${r.status} ${c})`);
  }

  return { estaConfigurado, crearOCuentaRecuperar, cambiarClave };
}

export const cuentasSupabase: CuentasDeServidor = crearCuentasSupabase();
