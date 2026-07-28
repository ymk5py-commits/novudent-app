import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyLsSignature, statusFromLsEvent, subscriptionFromLsPayload } from "./lemonsqueezy";

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
