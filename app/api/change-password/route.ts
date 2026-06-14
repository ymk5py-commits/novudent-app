import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { getDocument, patchFields, isServerFirestoreConfigured } from "@/lib/server/firestore-rest";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";

/**
 * Cambio de contraseña inicial — del lado SERVIDOR.
 *
 * El gate de contraseña (mustChangePassword) NO puede confiar en el cliente:
 * las reglas hacen `mustChangePassword` inmutable desde el navegador, así que
 * la ÚNICA forma de limpiarlo es por acá, y solo DESPUÉS de rotar la contraseña
 * real. Flujo:
 *   1) Verifica el Firebase ID token (identidad del usuario).
 *   2) Cambia la contraseña vía Identity Toolkit accounts:update (con el idToken).
 *   3) Resuelve la clínica del usuario (directory/{uid}) y, como service user,
 *      limpia mustChangePassword en su doc (patch puntual, no clobber).
 *
 * Así el usuario no puede saltarse el cambio: no puede limpiar el flag sin que
 * el servidor haya rotado su contraseña.
 *
 * POST { newPassword }  (Authorization: Bearer <idToken>)
 */

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = rateLimit(`change-pass:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const key = process.env.FIREBASE_WEB_API_KEY;
  if (!key || !isServerFirestoreConfigured()) {
    return NextResponse.json({ ok: false, error: "Servidor sin configurar." }, { status: 503 });
  }

  // 1) identidad
  let user;
  try {
    user = await verifyIdToken(req);
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status });
  }

  let body: { newPassword?: unknown; clinicId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const newPassword = String(body.newPassword ?? "");
  if (newPassword.length < 6) {
    return NextResponse.json({ ok: false, error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
  }
  const hintClinicId = typeof body.clinicId === "string" ? body.clinicId : null;

  // Reusar el Bearer token para el cambio (identifica al usuario en Auth).
  const idToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();

  try {
    // 2) rotar la contraseña real en Firebase Auth
    const upd = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, password: newPassword, returnSecureToken: false }),
        signal: AbortSignal.timeout(8000),
      }
    );
    const updData = await upd.json().catch(() => ({} as any));
    if (!upd.ok) {
      const code = updData?.error?.message || "";
      if (code.includes("WEAK_PASSWORD"))
        return NextResponse.json({ ok: false, error: "La contraseña es demasiado débil." }, { status: 400 });
      if (code.includes("TOKEN_EXPIRED") || code.includes("INVALID_ID_TOKEN") || code.includes("CREDENTIAL_TOO_OLD"))
        return NextResponse.json({ ok: false, error: "Tu sesión expiró. Volvé a iniciar sesión." }, { status: 401 });
      console.error("[change-password] accounts:update", code || upd.status);
      return NextResponse.json({ ok: false, error: "No se pudo cambiar la contraseña." }, { status: 502 });
    }

    // 3) limpiar el flag como service user (en la clínica del usuario). La
    // clínica sale de directory/{uid}; si falta (datos a medias), usamos el
    // clinicId que envía el cliente PERO validando que el doc del usuario exista
    // ahí (no creamos docs basura ni tocamos otra clínica).
    let clinicId = null;
    const dir = await getDocument(`directory/${user.uid}`);
    if (dir?.clinicId) {
      clinicId = String(dir.clinicId);
    } else if (hintClinicId) {
      const u = await getDocument(`clinics/${hintClinicId}/users/${user.uid}`);
      if (u) clinicId = hintClinicId;
    }
    if (!clinicId) {
      // La contraseña SÍ se rotó, pero no pudimos ubicar al usuario para limpiar
      // el flag → ser honestos (no ok:true falso) para que pida ayuda al admin.
      console.error("[change-password] usuario sin clínica resoluble", user.uid);
      return NextResponse.json(
        { ok: false, error: "Tu contraseña se cambió, pero tu cuenta necesita un ajuste del administrador para continuar." },
        { status: 409 }
      );
    }
    // Si el patch falla, NO devolvemos ok:true (evita el limbo: clave nueva + gate eterno).
    await patchFields(`clinics/${clinicId}/users/${user.uid}`, { mustChangePassword: false });

    return NextResponse.json({ ok: true, clinicId });
  } catch (e) {
    console.error("[change-password] error", e);
    return NextResponse.json({ ok: false, error: "No se pudo cambiar la contraseña. Intentá de nuevo." }, { status: 502 });
  }
}
