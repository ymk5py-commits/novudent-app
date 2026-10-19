/**
 * Verificación LOCAL del token de sesión de GoTrue (Supabase Auth), sin llamar a ningún servicio.
 *
 * El token es un JWT firmado con HS256 con el secreto del proyecto (`SUPABASE_JWT_SECRET`, el mismo que usan GoTrue, PostgREST y Realtime).
 * Verificar la firma y el vencimiento alcanza para saber que lo emitió NUESTRO GoTrue y que sigue vigente; a diferencia de Firebase (que
 * pegaba a Identity Toolkit en cada pedido) esto cuesta microsegundos. Lo que NO cubre es una sesión revocada antes de que venza el token
 * (cerrar sesión): dura a lo sumo `JWT_EXPIRY` (1 hora). Para los pasos que cambian credenciales (`change-password`) se le pregunta
 * igual a GoTrue con el mismo token (ver `cuentas.ts`).
 *
 * Reemplaza a la verificación de Firebase cuando `NEXT_PUBLIC_BACKEND=supabase` (la elige `auth.ts`).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { AuthError, type VerifiedUser } from "./auth-error";

/** Saca el token del encabezado `Authorization: Bearer …`. 401 si falta o está vacío. */
export function extraerBearer(req: Request): string {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  const token = m?.[1].trim();
  if (!token) throw new AuthError("Falta el token de autenticación");
  return token;
}

const aJson = (parte: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(Buffer.from(parte, "base64url").toString("utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** Verifica un JWT de GoTrue y devuelve la persona. Lanza `AuthError` (401 si el token no vale, 503 si el servidor no tiene el secreto).
 *  `ahoraMs` se inyecta para poder probar el vencimiento. */
export function verificarJwtSupabase(token: string, secreto: string | undefined, ahoraMs: number = Date.now()): VerifiedUser {
  if (!secreto) throw new AuthError("Servidor sin SUPABASE_JWT_SECRET", 503);
  const partes = token.split(".");
  if (partes.length !== 3 || partes.some((p) => p === "")) throw new AuthError("Sesión inválida o expirada");
  const [cabecera, carga, firma] = partes;

  // Solo HS256: aceptar el algoritmo que declare el token abre la puerta a `alg: none` y a la confusión HS/RS.
  if (aJson(cabecera)?.alg !== "HS256") throw new AuthError("Sesión inválida o expirada");
  const esperada = createHmac("sha256", secreto).update(`${cabecera}.${carga}`).digest();
  const recibida = Buffer.from(firma, "base64url");
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) throw new AuthError("Sesión inválida o expirada");

  const c = aJson(carga);
  if (!c) throw new AuthError("Sesión inválida o expirada");
  if (typeof c.exp !== "number" || c.exp * 1000 <= ahoraMs) throw new AuthError("Sesión inválida o expirada");
  // Las claves `anon` y `service_role` también son JWT firmados con este secreto, pero no son una persona: sin `sub` y con otro rol.
  if (c.role !== "authenticated" || c.aud !== "authenticated" || typeof c.sub !== "string" || c.sub === "") throw new AuthError("Sesión inválida o expirada");

  return {
    uid: c.sub,
    email: typeof c.email === "string" && c.email !== "" ? c.email : undefined,
    isAnonymous: c.is_anonymous === true,
  };
}
