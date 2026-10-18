import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { requireMiembro } from "@/lib/server/require-feature";
import { createIfAbsent, getDocument, isServerFirestoreConfigured, listCollection } from "@/lib/server/datos";
import { crearOCuentaRecuperar, cuentasEstaConfigurado } from "@/lib/server/cuentas";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";
import { planUserLimitError } from "@/lib/plan";
import { isSubscriptionActive, subscriptionPlanId } from "@/lib/subscription";
import { esIdDeRolValido, esRolDeFabrica, normalizarRolesPropios } from "@/lib/rbac";
import type { RolId, Subscription, User } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ipLimit = await rateLimit(`team-users-ip:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
  if (!ipLimit.ok) return tooManyRequests(ipLimit.retryAfterSec);
  if (!isServerFirestoreConfigured() || !cuentasEstaConfigurado()) {
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
  const role = String(body.role ?? "") as RolId;
  const color = String(body.color ?? "#1769E0");
  const phone = String(body.phone ?? "").trim();
  if (!name || name.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 6 || password.length > 128 || !(esRolDeFabrica(role) || esIdDeRolValido(role)) || !/^#[0-9a-fA-F]{6}$/.test(color) || phone.length > 40) {
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
    // Un rol propio solo vale si la clínica lo tiene creado (config.rolesPropios): el id del body no se acepta a ciegas.
    const rolesPropios = normalizarRolesPropios((clinic.config as { rolesPropios?: unknown } | undefined)?.rolesPropios);
    if (!esRolDeFabrica(role) && !rolesPropios.some((r) => r.id === role)) throw new AuthError("Ese rol no existe en tu clínica.", 400);
    if (!isSubscriptionActive(sub as Subscription | null)) throw new AuthError("La suscripción está vencida; regularizala antes de agregar usuarios.", 403);

    const effectivePlan = subscriptionPlanId(sub as Subscription | null, clinic as { plan?: string });
    const sameEmail = users.find(({ data }) => String(data.email ?? "").toLowerCase() === email);
    if (sameEmail) throw new AuthError("Ese email ya está en el equipo de esta clínica. Si está inactivo, reactivá su usuario existente.", 409);
    const limit = planUserLimitError({ plan: effectivePlan }, users.map(({ data }) => ({ role: String(data.role ?? ""), active: data.active !== false })), role);
    if (limit) throw new AuthError(limit, 409);

    const uid = await crearOCuentaRecuperar(email, password);
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
