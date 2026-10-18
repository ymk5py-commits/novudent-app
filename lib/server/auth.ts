/**
 * Verificación del token de sesión del lado servidor (route handlers).
 *
 * Según `NEXT_PUBLIC_BACKEND` (ver `backend.ts`):
 *  - `supabase`: se verifica LOCALMENTE el JWT de GoTrue con `SUPABASE_JWT_SECRET` (`auth-supabase.ts`); no se llama a ningún servicio.
 *  - `firestore` (por defecto): el ID token de Firebase, que se valida contra Identity Toolkit (abajo).
 *
 * Se usa para cerrar las rutas /api/ia/* (antes eran un proxy abierto a Gemini) y todas las que actúan en nombre de una persona.
 */
import { AuthError, type VerifiedUser } from "./auth-error";
import { extraerBearer, verificarJwtSupabase } from "./auth-supabase";
import { backendDelServidor } from "./backend";

export { AuthError, type VerifiedUser };

/** Lanza AuthError si el token falta o es inválido; si no, devuelve la persona. `uid` es el de LOGIN (ver `VerifiedUser`). */
export async function verifyIdToken(req: Request): Promise<VerifiedUser> {
  if (backendDelServidor() === "supabase") return verificarJwtSupabase(extraerBearer(req), process.env.SUPABASE_JWT_SECRET);
  return verificarTokenDeFirebase(req);
}

/* ---------- Firebase (se va con la fase F) ----------
 *
 * No hay service account (org policy lo bloquea), así que validamos el token contra el endpoint REST de Identity Toolkit con la web API
 * key del proyecto: si el token es válido y no expiró, `accounts:lookup` devuelve la cuenta. Eso confirma que quien llama es un usuario
 * real de NUESTRO proyecto Firebase. */

const VERIFY_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

async function verificarTokenDeFirebase(req: Request): Promise<VerifiedUser> {
  const key = process.env.FIREBASE_WEB_API_KEY;
  if (!key) throw new AuthError("Servidor sin FIREBASE_WEB_API_KEY", 503);

  const authz = req.headers.get("authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new AuthError("Falta el token de autenticación");
  const idToken = m[1].trim();
  if (!idToken) throw new AuthError("Token vacío");

  let res: Response;
  try {
    res = await fetch(`${VERIFY_URL}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new AuthError("No se pudo verificar la sesión", 503);
  }
  const data = await res.json().catch(() => ({} as any));
  const user = data?.users?.[0];
  if (!res.ok || !user) throw new AuthError("Sesión inválida o expirada");

  return {
    uid: user.localId,
    email: user.email,
    // Cuenta anónima = sin providerUserInfo y sin email (demo).
    isAnonymous: !user.email && !(user.providerUserInfo?.length),
  };
}
