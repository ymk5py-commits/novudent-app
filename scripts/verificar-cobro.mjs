#!/usr/bin/env node
/**
 * Diagnóstico del cobro (Lemon Squeezy) — de SOLO LECTURA.
 *
 *   node scripts/verificar-cobro.mjs [--url https://…] [--cid cl_aura]
 *
 * Deduce el estado de la configuración a partir de los códigos de respuesta,
 * sin escribir nada ni necesitar credenciales:
 *   webhook 503 → falta LEMONSQUEEZY_WEBHOOK_SECRET
 *   webhook 401 → el secret está cargado y rechazó una firma inválida ✓
 *
 * Con --cid además consulta si la clínica ya tiene suscripción (usa una sesión
 * anónima, igual que un visitante de la demo).
 */
const args = process.argv.slice(2);
const arg = (n, def) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : def; };

const BASE = (arg("--url", "https://novudent-app.vercel.app")).replace(/\/$/, "");
const CID = arg("--cid", null);
const PROJECT = "novudent-664f3";

const c = { ok: "\x1b[32m", warn: "\x1b[33m", err: "\x1b[31m", dim: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };
const line = (icon, text, detail) =>
  console.log(`  ${icon} ${text}${detail ? `\n      ${c.dim}${detail}${c.x}` : ""}`);

let listo = true;
const fallo = () => { listo = false; };

const post = async (path, body, headers = {}) => {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } catch (e) {
    return { status: 0, body: { error: String(e?.message ?? e) } };
  }
};

console.log(`\n${c.b}Diagnóstico de cobro${c.x}  ${c.dim}${BASE}${c.x}\n`);

/* 1 ─ Webhook: ¿está cargado el secret de firma? */
console.log(`${c.b}1. Webhook de Lemon Squeezy${c.x}`);
{
  const r = await post("/api/webhooks/lemonsqueezy", { meta: { event_name: "ping" } });
  if (r.status === 401) {
    line(`${c.ok}✓${c.x}`, "Secret cargado — rechaza firmas inválidas");
  } else if (r.status === 503) {
    fallo();
    line(`${c.err}✗${c.x}`, "Falta LEMONSQUEEZY_WEBHOOK_SECRET (o el usuario de servicio)",
      "Cargalo en Vercel → Settings → Environment Variables y volvé a desplegar.");
  } else if (r.status === 0) {
    fallo();
    line(`${c.err}✗${c.x}`, "No responde", r.body.error);
  } else {
    fallo();
    line(`${c.warn}?${c.x}`, `Respuesta inesperada (HTTP ${r.status})`, JSON.stringify(r.body));
  }
}

/* 2 ─ Checkout: debe exigir sesión */
console.log(`\n${c.b}2. Checkout${c.x}`);
{
  const r = await post("/api/suscripcion/checkout", { plan: "clinica" });
  if (r.status === 401 || r.status === 403) {
    line(`${c.ok}✓${c.x}`, "Exige sesión (no es un endpoint abierto)");
  } else if (r.status === 503) {
    fallo();
    line(`${c.warn}!${c.x}`, "Servidor sin configurar (falta FIREBASE_WEB_API_KEY / usuario de servicio)");
  } else {
    fallo();
    line(`${c.err}✗${c.x}`, `Debería rechazar sin sesión, devolvió HTTP ${r.status}`, JSON.stringify(r.body));
  }
  line(`${c.dim}·${c.x}`, `${c.dim}Los links LS_CHECKOUT_* solo se validan con sesión real, desde /app/suscripcion${c.x}`);
}

/* 3 ─ Suscripción de una clínica concreta */
if (CID) {
  console.log(`\n${c.b}3. Suscripción de ${CID}${c.x}`);
  try {
    const key = (await import("node:fs")).readFileSync("lib/firebase.ts", "utf8").match(/apiKey: "([^"]+)"/)?.[1];
    const auth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }), signal: AbortSignal.timeout(20_000),
    }).then((r) => r.json());

    const r = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/subscriptions/${CID}`,
      { headers: { Authorization: `Bearer ${auth.idToken}` }, signal: AbortSignal.timeout(20_000) }
    );
    if (r.status === 200) {
      const f = (await r.json()).fields ?? {};
      const v = (k) => Object.values(f[k] ?? {})[0];
      const fin = v("currentPeriodEndMs");
      line(`${c.ok}✓${c.x}`, `Plan ${v("plan")} · estado ${v("status")}`,
        fin ? `Vence: ${new Date(Number(fin)).toLocaleString("es-PY")}` : "Sin fecha de vencimiento");
    } else {
      line(`${c.dim}·${c.x}`, "Sin suscripción todavía",
        "Es lo normal antes del primer pago (la clínica queda activa por grandfathering).");
    }
  } catch (e) {
    line(`${c.warn}!${c.x}`, "No se pudo consultar", String(e?.message ?? e));
  }
}

/* Resumen */
console.log(`\n${c.b}${listo ? `${c.ok}Todo listo para cobrar.${c.x}` : `${c.warn}Falta configurar.${c.x}`}${c.x}`);
if (!listo) {
  console.log(`${c.dim}
  Envs en Vercel:
    LEMONSQUEEZY_WEBHOOK_SECRET   firma del webhook
    LS_VARIANT_SOLO/CLINICA/CADENA   variante comprada → plan
    LS_CHECKOUT_SOLO/CLINICA/CADENA  links de checkout

  Webhook de LS apuntando a:
    ${BASE}/api/webhooks/lemonsqueezy${c.x}`);
}
console.log();
process.exit(listo ? 0 : 1);
