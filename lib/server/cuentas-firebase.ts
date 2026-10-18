/** `CuentasDeServidor` sobre Firebase Auth (Identity Toolkit). Es lo que hacían las rutas `team-users`, `clinicas` y `change-password`
 *  cada una por su lado; se va con la fase F. */
import { AuthError } from "./auth-error";
import { isValidId } from "./ids";
import type { CuentasDeServidor } from "./cuentas";

const clave = () => encodeURIComponent(process.env.FIREBASE_WEB_API_KEY!);

/** Identity Toolkit crea la cuenta sin iniciar sesión en el navegador del admin. */
async function crearOCuentaRecuperar(email: string, password: string): Promise<string> {
  const call = async (endpoint: string) => {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${clave()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
  };
  const created = await call("signUp");
  if (created.ok && isValidId(created.data.localId)) return created.data.localId;
  const code = String(created.data?.error?.message ?? "");
  if (code.includes("EMAIL_EXISTS")) {
    // Un corte después de signUp puede dejar una cuenta sin ficha. Con la misma
    // contraseña provisional, el admin puede terminar el alta al reintentar.
    const recovered = await call("signInWithPassword");
    if (recovered.ok && isValidId(recovered.data.localId)) return recovered.data.localId;
    throw new AuthError("Ese email ya tiene una cuenta. Usá otro email o la contraseña provisional original.", 409);
  }
  if (code.includes("WEAK_PASSWORD")) throw new AuthError("La contraseña es demasiado débil.", 400);
  if (code.includes("INVALID_EMAIL")) throw new AuthError("El email no es válido.", 400);
  if (code.includes("OPERATION_NOT_ALLOWED")) throw new AuthError("El ingreso por email no está habilitado en Firebase.", 503);
  throw new Error("No se pudo crear la cuenta en Firebase Auth.");
}

/** Rota la contraseña real en Firebase Auth con el ID token de la persona (`accounts:update`). */
async function cambiarClave(idToken: string, nuevaClave: string): Promise<void> {
  const upd = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${clave()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, password: nuevaClave, returnSecureToken: false }),
    signal: AbortSignal.timeout(8000),
  });
  if (upd.ok) return;
  const updData = await upd.json().catch(() => ({} as any));
  const code = String(updData?.error?.message || "");
  if (code.includes("WEAK_PASSWORD")) throw new AuthError("La contraseña es demasiado débil.", 400);
  if (code.includes("TOKEN_EXPIRED") || code.includes("INVALID_ID_TOKEN") || code.includes("CREDENTIAL_TOO_OLD")) throw new AuthError("Tu sesión expiró. Volvé a iniciar sesión.", 401);
  throw new Error(`accounts:update ${code || upd.status}`);
}

export const cuentasFirebase: CuentasDeServidor = {
  estaConfigurado: () => !!process.env.FIREBASE_WEB_API_KEY,
  crearOCuentaRecuperar,
  cambiarClave,
};
