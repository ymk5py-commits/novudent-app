import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyLsSignature, statusFromLsEvent, subscriptionFromLsPayload, buildCheckoutUrl } from "./lemonsqueezy";

const SECRET = "test_signing_secret";
const sign = (raw: string, secret = SECRET) => createHmac("sha256", secret).update(raw).digest("hex");

describe("verifyLsSignature", () => {
  const raw = JSON.stringify({ meta: { event_name: "subscription_created" } });

  it("acepta una firma válida", () => {
    expect(verifyLsSignature(raw, sign(raw), SECRET)).toBe(true);
  });

  it("RECHAZA una firma de otro secreto (webhook falsificado)", () => {
    // Sin esto cualquiera puede POSTear al endpoint y activarse el plan Cadena gratis.
    expect(verifyLsSignature(raw, sign(raw, "secreto_del_atacante"), SECRET)).toBe(false);
  });

  it("RECHAZA si el cuerpo fue alterado después de firmar", () => {
    const alterado = JSON.stringify({ meta: { event_name: "subscription_created" }, hack: true });
    expect(verifyLsSignature(alterado, sign(raw), SECRET)).toBe(false);
  });

  it("rechaza firma vacía, mal formada o secreto ausente", () => {
    expect(verifyLsSignature(raw, "", SECRET)).toBe(false);
    expect(verifyLsSignature(raw, "no-es-hex", SECRET)).toBe(false);
    expect(verifyLsSignature(raw, sign(raw), "")).toBe(false);
  });

  it("rechaza una firma de largo distinto sin romper (timingSafeEqual explota si difieren)", () => {
    expect(verifyLsSignature(raw, "abcd", SECRET)).toBe(false);
  });
});

describe("statusFromLsEvent", () => {
  it("mapea los eventos que dan acceso", () => {
    expect(statusFromLsEvent("subscription_created")).toBe("active");
    expect(statusFromLsEvent("subscription_resumed")).toBe("active");
    expect(statusFromLsEvent("subscription_unpaused")).toBe("active");
    expect(statusFromLsEvent("subscription_payment_success")).toBe("active");
  });

  it("mapea los eventos que cortan el acceso", () => {
    expect(statusFromLsEvent("subscription_payment_failed")).toBe("past_due");
    expect(statusFromLsEvent("subscription_cancelled")).toBe("canceled");
    expect(statusFromLsEvent("subscription_expired")).toBe("expired");
  });

  it("ignora eventos que no conocemos (no cambia el estado)", () => {
    expect(statusFromLsEvent("order_created")).toBeNull();
    expect(statusFromLsEvent("cualquier_cosa")).toBeNull();
  });
});

describe("subscriptionFromLsPayload", () => {
  const payload = {
    meta: {
      event_name: "subscription_created",
      custom_data: { clinic_id: "cl_aura" },
    },
    data: {
      id: "sub_123",
      attributes: {
        customer_id: 99,
        variant_id: 555,
        status: "active",
        renews_at: "2026-08-19T00:00:00.000000Z",
        urls: { customer_portal: "https://novudent.lemonsqueezy.com/portal/abc" },
      },
    },
  };

  it("arma la suscripción con el plan que corresponde a la variante", () => {
    const sub = subscriptionFromLsPayload(payload, { "555": "clinica" });
    expect(sub).toMatchObject({
      clinicId: "cl_aura",
      plan: "clinica",
      status: "active",
      provider: "lemonsqueezy",
      lsSubscriptionId: "sub_123",
      lsCustomerId: "99",
      lsVariantId: "555",
      customerPortalUrl: "https://novudent.lemonsqueezy.com/portal/abc",
    });
    expect(sub!.currentPeriodEndMs).toBe(Date.parse("2026-08-19T00:00:00.000000Z"));
  });

  it("devuelve null si el webhook no trae clinic_id (no sabemos a quién activar)", () => {
    const sinClinica = { ...payload, meta: { ...payload.meta, custom_data: {} } };
    expect(subscriptionFromLsPayload(sinClinica, { "555": "clinica" })).toBeNull();
  });

  it("devuelve null si la variante no está mapeada (no adivinamos el plan)", () => {
    // Preferimos no activar nada antes que regalar un plan que no compró.
    expect(subscriptionFromLsPayload(payload, { "999": "cadena" })).toBeNull();
  });

  it("el impago deja el plan pero marca past_due", () => {
    const impago = { ...payload, meta: { ...payload.meta, event_name: "subscription_payment_failed" } };
    const sub = subscriptionFromLsPayload(impago, { "555": "clinica" });
    expect(sub).toMatchObject({ plan: "clinica", status: "past_due" });
  });
});

describe("buildCheckoutUrl", () => {
  const BASE = "https://novudent.lemonsqueezy.com/buy/abc-123";

  it("adosa el clinic_id como custom data (así el webhook sabe a quién activar)", () => {
    const url = buildCheckoutUrl(BASE, { clinicId: "cl_aura" });
    expect(url).toContain("checkout%5Bcustom%5D%5Bclinic_id%5D=cl_aura");
  });

  it("prellena el email del admin cuando lo tenemos", () => {
    const url = buildCheckoutUrl(BASE, { clinicId: "cl_aura", email: "admin@aura.com" });
    expect(url).toContain("checkout%5Bemail%5D=admin%40aura.com");
  });

  it("no rompe una base que ya trae query string", () => {
    const url = buildCheckoutUrl(`${BASE}?desc=0`, { clinicId: "cl_aura" });
    expect(url).toContain("desc=0");
    expect(url).toContain("clinic_id%5D=cl_aura");
  });

  it("escapa valores con caracteres raros (no rompe la URL)", () => {
    const url = buildCheckoutUrl(BASE, { clinicId: "cl con espacio&x=1" });
    expect(url).not.toMatch(/clinic_id%5D=cl con/);
    expect(() => new URL(url!)).not.toThrow();
  });

  it("devuelve null si no hay base configurada (plan sin checkout cargado)", () => {
    expect(buildCheckoutUrl("", { clinicId: "cl_aura" })).toBeNull();
    expect(buildCheckoutUrl(undefined, { clinicId: "cl_aura" })).toBeNull();
  });

  it("rechaza una base que no sea https (anti open-redirect por env mal cargada)", () => {
    expect(buildCheckoutUrl("javascript:alert(1)", { clinicId: "x" })).toBeNull();
    expect(buildCheckoutUrl("http://inseguro.com/buy/x", { clinicId: "x" })).toBeNull();
  });
});

/* ── Defensa contra el pago apuntado a otra clínica ──────────────────────────
 * El clinicId es PÚBLICO por diseño (es el link `/reservar/{clinicId}` que la
 * clínica publica). Viajaba como parámetro editable de la URL de checkout, así
 * que cualquiera podía pagar el plan más barato apuntando a un competidor y
 * pisarle la suscripción: bajarlo de Cadena a Solo le apaga módulos, y cancelar
 * ese pago después lo deja en solo-lectura. */

import { puedeAplicarSuscripcion, tokenDePayload } from "./lemonsqueezy";
import type { Subscription } from "./types";

const susc = (o: Partial<Subscription> = {}): Subscription => ({
  clinicId: "cl_victima", plan: "cadena", status: "active",
  currentPeriodEndMs: Date.UTC(2027, 0, 1), provider: "lemonsqueezy",
  lsSubscriptionId: "sub_legitima", updatedAt: "2026-08-01T00:00:00.000Z", ...o,
});
const siempreActiva = () => true;
const nuncaActiva = () => false;

describe("tokenDePayload", () => {
  it("toma el token cuando viene y es largo", () => {
    expect(tokenDePayload({ meta: { custom_data: { novudent_token: "a".repeat(32) } } })).toBe("a".repeat(32));
  });

  it("ignora un token corto: no se acepta algo adivinable", () => {
    expect(tokenDePayload({ meta: { custom_data: { novudent_token: "corto" } } })).toBeNull();
  });

  it("sin token devuelve null (pago viejo, cae al respaldo)", () => {
    expect(tokenDePayload({ meta: { custom_data: { clinic_id: "cl_x" } } })).toBeNull();
    expect(tokenDePayload({})).toBeNull();
  });
});

/* El 4º parámetro dice si la clínica se resolvió con el TOKEN del checkout (que
 * el comprador no elige) o con el `clinic_id` pelado de la URL (que sí edita
 * antes de pagar). Sin token solo vale renovar algo ya vinculado. */
describe("puedeAplicarSuscripcion — CON token de checkout", () => {
  it("BLOQUEA el ataque: pago de otra suscripción sobre una vigente", () => {
    const r = puedeAplicarSuscripcion(
      susc(),
      susc({ plan: "solo", lsSubscriptionId: "sub_atacante" }),
      siempreActiva,
      true,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("sub_atacante");
  });

  it("deja pasar la renovación: misma suscripción de LS", () => {
    expect(puedeAplicarSuscripcion(susc(), susc({ lsSubscriptionId: "sub_legitima" }), siempreActiva, true).ok).toBe(true);
  });

  it("deja pasar el impago de la MISMA suscripción (no la deja colgada activa)", () => {
    const r = puedeAplicarSuscripcion(susc(), susc({ status: "past_due", lsSubscriptionId: "sub_legitima" }), siempreActiva, true);
    expect(r.ok).toBe(true);
  });

  it("primera compra: no había suscripción", () => {
    expect(puedeAplicarSuscripcion(null, susc({ lsSubscriptionId: "sub_nueva" }), siempreActiva, true).ok).toBe(true);
  });

  it("primera compra sobre el TRIAL del alta: la actual no tiene id de LS", () => {
    const trial = susc({ provider: "manual", status: "trialing", lsSubscriptionId: undefined });
    expect(puedeAplicarSuscripcion(trial, susc({ lsSubscriptionId: "sub_nueva" }), siempreActiva, true).ok).toBe(true);
  });

  it("re-alta legítima: la vieja ya venció, entra una nueva", () => {
    const r = puedeAplicarSuscripcion(susc({ status: "expired" }), susc({ lsSubscriptionId: "sub_nueva" }), nuncaActiva, true);
    expect(r.ok).toBe(true);
  });
});

describe("puedeAplicarSuscripcion — SIN token (clinic_id elegido por el comprador)", () => {
  it("NO deja estrenar una suscripción cuando no había ninguna", () => {
    const r = puedeAplicarSuscripcion(null, susc({ lsSubscriptionId: "sub_nueva" }), siempreActiva, false);
    expect(r.ok).toBe(false);
  });

  it("NO deja pisar el TRIAL de una clínica ajena — era el ataque de los 45 dólares", () => {
    const trial = susc({ provider: "manual", status: "trialing", lsSubscriptionId: undefined });
    const r = puedeAplicarSuscripcion(trial, susc({ lsSubscriptionId: "sub_atacante" }), siempreActiva, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("sin token");
  });

  it("NO deja entrar sobre una suscripción vencida (eso ya es estrenar)", () => {
    const r = puedeAplicarSuscripcion(susc({ status: "expired" }), susc({ lsSubscriptionId: "sub_nueva" }), nuncaActiva, false);
    expect(r.ok).toBe(false);
  });

  it("SÍ deja renovar la misma suscripción (las creadas antes del token)", () => {
    const r = puedeAplicarSuscripcion(susc(), susc({ lsSubscriptionId: "sub_legitima" }), siempreActiva, false);
    expect(r.ok).toBe(true);
  });
});

describe("buildCheckoutUrl con token", () => {
  const BASE = "https://novudent.lemonsqueezy.com/checkout/buy/abc";

  it("manda el token además del clinic_id", () => {
    const u = buildCheckoutUrl(BASE, { clinicId: "cl_x", token: "t".repeat(32) })!;
    expect(u).toContain(encodeURIComponent("checkout[custom][novudent_token]"));
    expect(new URL(u).searchParams.get("checkout[custom][novudent_token]")).toBe("t".repeat(32));
  });

  it("sin token sigue funcionando (compatibilidad)", () => {
    const u = buildCheckoutUrl(BASE, { clinicId: "cl_x" })!;
    expect(u).not.toContain("novudent_token");
    expect(new URL(u).searchParams.get("checkout[custom][clinic_id]")).toBe("cl_x");
  });
});
