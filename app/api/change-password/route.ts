import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { getDocument, patchFields, isServerFirestoreConfigured } from "@/lib/server/datos";
import { cambiarClave, cuentasEstaConfigurado } from "@/lib/server/cuentas";
import { directorioDe } from "@/lib/server/directorio";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";
import { isValidId } from "@/lib/server/ids";

/**
 * Cambio de contraseña inicial — del lado SERVIDOR.
 *
 * El gate de contraseña (mustChangePassword) NO puede confiar en el cliente:
 * las reglas hacen `mustChangePassword` inmutable desde el navegador, así que
 * la ÚNICA forma de limpiarlo es por acá, y solo DESPUÉS de rotar la contraseña
 * real. Flujo:
 *   1) Verifica el token de sesión (identidad del usuario).
 *   2) Cambia la contraseña con ese mismo token (Firebase: Identity Toolkit
 *      accounts:update; Supabase: PUT /auth/v1/user), ver lib/server/cuentas.
 *   3) Resuelve la clínica del usuario (directorio) y, con la credencial del
 *      servidor, limpia mustChangePassword en su doc (patch puntual, no clobber).
 *
 * Así el usuario no puede saltarse el cambio: no puede limpiar el flag sin que
 * el servidor haya rotado su contraseña.
 *
 * POST { newPassword }  (Authorization: Bearer <idToken>)
 */

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = await rateLimit(`change-pass:${clientIp(req)}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  if (!cuentasEstaConfigurado() || !isServerFirestoreConfigured()) {
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
  // La demo entra con una sesión anónima: no tiene contraseña que cambiar ni ficha de usuario.
  if (user.isAnonymous) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });

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
  // El clinicId lo manda el cliente: se valida la gramática antes de que llegue
  // a un path de Firestore (un `#` acá hacía que el PATCH perdiera su updateMask
  // y reemplazara el documento entero de la clínica).
  const hintClinicId = isValidId(body.clinicId) ? body.clinicId : null;

  // Reusar el Bearer token para el cambio (identifica al usuario en Auth).
  const idToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();

  try {
    // 2) rotar la contraseña real en el servicio de ingreso
    try {
      await cambiarClave(idToken, newPassword);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      console.error("[change-password] cambio de contraseña", e instanceof Error ? e.message : e);
      return NextResponse.json({ ok: false, error: "No se pudo cambiar la contraseña." }, { status: 502 });
    }

    // 3) limpiar el flag como service user (en la clínica del usuario). La
    // clínica sale del directorio; si falta (datos a medias), usamos el
    // clinicId que envía el cliente PERO validando que el doc del usuario exista
    // ahí (no creamos docs basura ni tocamos otra clínica).
    let clinicId = null;
    let userId = user.uid; // id del documento de usuario (otro que el uid de login en los usuarios migrados a Supabase)
    const dir = await directorioDe(user.uid);
    if (dir) {
      clinicId = dir.clinicId;
      userId = dir.userId;
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
    await patchFields(`clinics/${clinicId}/users/${userId}`, { mustChangePassword: false });

    return NextResponse.json({ ok: true, clinicId });
  } catch (e) {
    console.error("[change-password] error", e);
    return NextResponse.json({ ok: false, error: "No se pudo cambiar la contraseña. Intentá de nuevo." }, { status: 502 });
  }
}
