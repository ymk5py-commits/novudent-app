import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { requireMiembro } from "@/lib/server/require-feature";
import { createIfAbsent, getDocument, isServerFirestoreConfigured, listCollection } from "@/lib/server/firestore-rest";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";
import { planUserLimitError } from "@/lib/plan";
import { isSubscriptionActive, subscriptionPlanId } from "@/lib/subscription";
import { isValidId } from "@/lib/server/ids";
import type { Role, Subscription, User } from "@/lib/types";

export const runtime = "nodejs";

const ROLES: Role[] = ["admin", "cashier", "receptionist", "dentist", "assistant"];

/** Identity Toolkit crea la cuenta sin iniciar sesión en el navegador del admin. */
async function createOrRecoverUser(email: string, password: string): Promise<string> {
  const key = encodeURIComponent(process.env.FIREBASE_WEB_API_KEY!);
  const call = async (endpoint: string) => {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${key}`, {
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

export async function POST(req: NextRequest) {
  const ipLimit = await rateLimit(`team-users-ip:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
  if (!ipLimit.ok) return tooManyRequests(ipLimit.retryAfterSec);
  if (!isServerFirestoreConfigured()) {
    return NextResponse.json({ ok: false, error: "El servidor no está configurado para crear usuarios." }, { status: 503 });
  }

  let admin;
  try {
    const identity = await verifyIdToken(req);
    if (identity.isAnonymous) throw new AuthError("No autorizado", 403);
    admin = await requireMiembro(identity.uid);
    if (admin.role !== "admin" || admin.clinicId === "cl_demo") throw new AuthError("Solo el administrador de la clínica puede crear usuarios.", 403);
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 503;
    return NextResponse.json({ ok: false, error: error instanceof AuthError ? error.message : "No pudimos verificar tu acceso. Reintentá." }, { status });
  }

  const userLimit = await rateLimit(`team-users:${admin.uid}`, { limit: 10, windowMs: 60_000 });
  if (!userLimit.ok) return tooManyRequests(userLimit.retryAfterSec);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 }); }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "") as Role;
  const color = String(body.color ?? "#1769E0");
  const phone = String(body.phone ?? "").trim();
  if (!name || name.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 6 || password.length > 128 || !ROLES.includes(role) || !/^#[0-9a-fA-F]{6}$/.test(color) || phone.length > 40) {
    return NextResponse.json({ ok: false, error: "Revisá nombre, email, rol, color y contraseña (mínimo 6 caracteres)." }, { status: 400 });
  }

  try {
    const cid = admin.clinicId; // siempre del directorio verificado, jamás del body
    const [clinic, sub, users] = await Promise.all([
      getDocument(`clinics/${cid}`),
      getDocument(`subscriptions/${cid}`),
      listCollection(`clinics/${cid}`, "users", 1000),
    ]);
    if (!clinic) throw new AuthError("La clínica no está disponible.", 404);
    if (!isSubscriptionActive(sub as Subscription | null)) throw new AuthError("La suscripción está vencida; regularizala antes de agregar usuarios.", 403);

    const effectivePlan = subscriptionPlanId(sub as Subscription | null, clinic as { plan?: string });
    const sameEmail = users.find(({ data }) => String(data.email ?? "").toLowerCase() === email);
    if (sameEmail) throw new AuthError("Ese email ya está en el equipo de esta clínica. Si está inactivo, reactivá su usuario existente.", 409);
    const limit = planUserLimitError({ plan: effectivePlan }, users.map(({ data }) => ({ role: String(data.role ?? ""), active: data.active !== false })), role);
    if (limit) throw new AuthError(limit, 409);

    const uid = await createOrRecoverUser(email, password);
    const dirPath = `directory/${uid}`;
    const dirCreated = await createIfAbsent(dirPath, { clinicId: cid, email });
    if (!dirCreated) {
      const existing = await getDocument(dirPath);
      if (existing?.clinicId !== cid) throw new AuthError("Esa cuenta ya pertenece a otra clínica.", 409);
    }

    const user: User = {
      id: uid, authUid: uid, clinicId: cid, name, email, role, color,
      active: true, mustChangePassword: true,
      ...(phone ? { phone } : {}),
    };
    const created = await createIfAbsent(`clinics/${cid}/users/${uid}`, user as unknown as Record<string, unknown>);
    if (!created) {
      const existing = await getDocument(`clinics/${cid}/users/${uid}`);
      if (!existing || String(existing.email ?? "").toLowerCase() !== email || existing.clinicId !== cid) {
        throw new AuthError("La cuenta ya existe con datos diferentes. Contactá a soporte.", 409);
      }
      return NextResponse.json({ ok: true, user: existing });
    }
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    console.error("[team-users] alta falló", error);
    return NextResponse.json({ ok: false, error: "No se completó el alta. Reintentá con la misma contraseña provisional; si persiste, contactá a soporte." }, { status: 503 });
  }
}
