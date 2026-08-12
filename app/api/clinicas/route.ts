import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getDocument, setDocument, isServerFirestoreConfigured } from "@/lib/server/firestore-rest";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";
import { buildSeed } from "@/lib/seed";

export const runtime = "nodejs"; // usa node:crypto (timingSafeEqual) y Buffer

/** Comparación constante en el tiempo (evita timing attack sobre OWNER_PANEL_KEY). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Alta de clientes (solo el dueño del SaaS).
 *
 * POST /api/clinicas
 *   { ownerKey, clinicName, adminName, adminEmail, adminPassword, phone?, address? }
 *
 * Crea: cuenta de Firebase Auth para el admin + clinics/{id} con config
 * inicial + aranceles de arranque + users/{uid} (admin) + directory/{uid}
 * (índice global uid → clínica para el login multi-clínica).
 *
 * Protección: header/body ownerKey debe coincidir con OWNER_PANEL_KEY (env
 * en Vercel). Sin esa clave el endpoint no hace nada.
 */

const norm = (s: unknown) => String(s ?? "").trim();

/** Días de prueba con los que nace una clínica nueva. Configurable por env para
 *  poder estirarle la prueba a un cliente puntual sin tocar código ni redeployar
 *  (se lee en cada alta, no al arrancar el proceso). */
const TRIAL_DIAS = (() => {
  const n = Number(process.env.TRIAL_DIAS);
  return Number.isFinite(n) && n > 0 && n <= 365 ? Math.floor(n) : 30;
})();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "clinica";
}

/** Crea (o recupera, si ya existía con esa contraseña) la cuenta del admin. */
async function createOrRecoverAuthUser(email: string, password: string): Promise<string> {
  const key = encodeURIComponent(process.env.FIREBASE_WEB_API_KEY!);
  const call = async (endpoint: string) => {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  };
  const up = await call("signUp");
  if (up.ok && up.data.localId) return up.data.localId as string;
  const code = up.data?.error?.message || "";
  if (code.includes("EMAIL_EXISTS")) {
    // reintento tras un alta a medias: si la contraseña coincide, reusamos la cuenta
    const si = await call("signInWithPassword");
    if (si.ok && si.data.localId) return si.data.localId as string;
    throw new Error("Ese email ya tiene una cuenta con otra contraseña. Usá otro email o la contraseña original.");
  }
  if (code.includes("WEAK_PASSWORD")) throw new Error("La contraseña debe tener al menos 6 caracteres.");
  if (code.includes("INVALID_EMAIL")) throw new Error("El email no es válido.");
  throw new Error(`No se pudo crear la cuenta: ${code || "error desconocido"}`);
}

export async function POST(req: NextRequest) {
  // Antibruteforce sobre OWNER_PANEL_KEY: pocas creaciones por minuto por IP.
  const rl = rateLimit(`clinicas:${clientIp(req)}`, { limit: 5, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const ownerKey = process.env.OWNER_PANEL_KEY;
  if (!ownerKey) {
    return NextResponse.json({ error: "Falta configurar OWNER_PANEL_KEY en Vercel." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  // Autorización PRIMERO: una clave mala siempre da 401, sin revelar el estado
  // de configuración del servidor (no filtrar si Firestore está o no listo).
  if (!safeEqual(norm(body.ownerKey), ownerKey)) {
    return NextResponse.json({ error: "Clave de propietario incorrecta." }, { status: 401 });
  }

  if (!isServerFirestoreConfigured()) {
    return NextResponse.json({ error: "Faltan las credenciales de servidor (FIREBASE_WEB_API_KEY / SERVICE_USER_*)." }, { status: 503 });
  }

  const clinicName = norm(body.clinicName);
  const adminName = norm(body.adminName);
  const adminEmail = norm(body.adminEmail).toLowerCase();
  const adminPassword = String(body.adminPassword ?? "");
  const plan = ["solo", "clinica", "cadena"].includes(norm(body.plan)) ? norm(body.plan) : "clinica";
  if (!clinicName || !adminName || !adminEmail || adminPassword.length < 6) {
    return NextResponse.json(
      { error: "Completá nombre de la clínica, nombre del admin, email y una contraseña de 6+ caracteres." },
      { status: 400 }
    );
  }

  try {
    // 1) cuenta real del administrador en Firebase Auth
    const uid = await createOrRecoverAuthUser(adminEmail, adminPassword);

    // 2) si esa cuenta ya pertenece a una clínica, no duplicamos
    const existingDir = await getDocument(`directory/${uid}`);
    if (existingDir?.clinicId) {
      return NextResponse.json(
        { error: `Esa cuenta ya es usuario de la clínica «${existingDir.clinicId}».` },
        { status: 409 }
      );
    }

    // 3) id único y legible para la clínica
    const base = `cl_${slugify(clinicName)}`;
    let clinicId = base;
    for (let i = 0; await getDocument(`clinics/${clinicId}`); i++) {
      if (i > 20) throw new Error("No se pudo generar un id de clínica único.");
      clinicId = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }

    // 4) documento de la clínica: config inicial lista para operar
    await setDocument(`clinics/${clinicId}`, {
      id: clinicId,
      name: clinicName,
      plan, // nivel contratado — limita módulos y usuarios (lib/plan.ts)
      config: {
        timezone: "America/Asuncion",
        currency: "PYG",
        ...(norm(body.phone) ? { phone: norm(body.phone) } : {}),
        ...(norm(body.address) ? { address: norm(body.address) } : {}),
        convenios: [],
        reminderTemplate:
          "Hola {paciente} 👋 Te recordamos tu cita en {clinica} el {fecha} a las {hora}. Respondé *SI* para confirmar o avisanos si necesitás reagendar. ¡Gracias!",
        botika: {
          connected: false,
          automations: { confirmCita: true, nps: true, cobranza: false, reagendar: true },
        },
      },
      onboarding: { usersCreated: false, servicesDefined: false, tourDone: false },
      createdAt: new Date().toISOString(),
    });

    // 5) usuario admin + directorio global PRIMERO: si el alta falla a mitad,
    // un reintento con el mismo email detecta la clínica a medias vía
    // `existingDir` (paso 2) y no crea una clínica huérfana duplicada.
    await setDocument(`clinics/${clinicId}/users/${uid}`, {
      id: uid,
      authUid: uid,
      clinicId,
      name: adminName,
      email: adminEmail,
      role: "admin",
      color: "#1769E0",
      active: true,
      mustChangePassword: true, // fuerza cambio de la contraseña inicial al primer login
    });
    await setDocument(`directory/${uid}`, { clinicId, email: adminEmail });

    // 6) aranceles de arranque (el admin los ajusta en Configuración)
    for (const pr of buildSeed().procedures) {
      await setDocument(`clinics/${clinicId}/procedures/${pr.cpt}`, pr as unknown as Record<string, unknown>);
    }

    /* 7) SUSCRIPCIÓN EN PRUEBA — el paso que arranca el reloj del cobro.
     *
     * Sin este documento la clínica queda gratis PARA SIEMPRE: `isSubscriptionActive`
     * devuelve true cuando no hay suscripción (lib/subscription.ts) y firestore.rules
     * hace lo mismo con `!exists(subPath(cid))`. Ese grandfathering se escribió para
     * no dejar en solo-lectura a las clínicas que ya existían cuando se agregó el
     * cobro — pero se aplicaba igual a las nuevas, que son justamente las que hay
     * que cobrar. Una clínica se daba de alta, trabajaba meses y nada la cortaba.
     *
     * Creándolo acá, el grandfathering vuelve a significar lo que decía: solo las
     * anteriores al cobro. Y el resto de la maquinaria empieza a funcionar sola —
     * el aviso de vencimiento y el corte a solo-lectura ya estaban escritos y
     * esperaban un documento que nunca llegaba.
     *
     * Va al final a propósito: si algo de arriba falla, no queda una suscripción
     * apuntando a una clínica a medio crear. */
    const finPrueba = Date.now() + TRIAL_DIAS * 24 * 60 * 60 * 1000;
    await setDocument(`subscriptions/${clinicId}`, {
      clinicId,
      plan,
      status: "trialing",
      currentPeriodEndMs: finPrueba,
      provider: "manual",
      updatedAt: new Date().toISOString(),
      updatedBy: "alta:panel-dueño",
    });

    return NextResponse.json({
      ok: true,
      clinicId,
      clinicName,
      plan,
      admin: { name: adminName, email: adminEmail },
      bookingUrl: `/reservar/${clinicId}`,
      prueba: { dias: TRIAL_DIAS, venceEl: new Date(finPrueba).toISOString() },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error inesperado." }, { status: 500 });
  }
}
