/**
 * Test de integración del webhook de cobro — ejercita la RUTA REAL.
 *
 * Es el punto más sensible del SaaS: es lo único que puede activar un plan. Si
 * la verificación de firma falla, cualquiera se autoactiva Cadena gratis.
 *
 * Firestore se mockea (la escritura real necesita el usuario de servicio); todo
 * lo demás —firma HMAC, mapeo de evento, idempotencia, códigos de respuesta— es
 * el código de producción.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";

const SECRET = "secreto_de_prueba";

const setDocument = vi.fn(async () => {});
const createIfAbsent = vi.fn(async () => true);

vi.mock("@/lib/server/firestore-rest", () => ({
  setDocument: (...a: unknown[]) => setDocument(...(a as [])),
  createIfAbsent: (...a: unknown[]) => createIfAbsent(...(a as [])),
  isServerFirestoreConfigured: () => true,
}));

import { POST } from "./route";

const sign = (raw: string, secret = SECRET) => createHmac("sha256", secret).update(raw).digest("hex");

const payload = (over: Record<string, unknown> = {}) => ({
  meta: { event_name: "subscription_created", custom_data: { clinic_id: "cl_aura" }, ...(over.meta as object ?? {}) },
  data: {
    id: "sub_777",
    attributes: {
      customer_id: 42,
      variant_id: 111,
      status: "active",
      renews_at: "2026-09-01T00:00:00.000000Z",
      updated_at: "2026-08-01T10:00:00.000000Z",
      urls: { customer_portal: "https://novudent.lemonsqueezy.com/portal/xyz" },
    },
  },
});

/** Request como el que manda LS: cuerpo crudo + header X-Signature. */
const req = (body: unknown, signature?: string) => {
  const raw = JSON.stringify(body);
  return new Request("https://novudent-app.vercel.app/api/webhooks/lemonsqueezy", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-signature": signature ?? sign(raw) },
    body: raw,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  createIfAbsent.mockResolvedValue(true);
  vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("LS_VARIANT_CLINICA", "111");
  vi.stubEnv("LS_VARIANT_SOLO", "110");
  vi.stubEnv("LS_VARIANT_CADENA", "112");
});

describe("POST /api/webhooks/lemonsqueezy", () => {
  it("pago válido → activa el plan que corresponde a la variante", async () => {
    const res = await POST(req(payload()));
    expect(res.status).toBe(200);
    expect(setDocument).toHaveBeenCalledTimes(1);

    const [path, doc] = setDocument.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(path).toBe("subscriptions/cl_aura");
    expect(doc).toMatchObject({
      clinicId: "cl_aura",
      plan: "clinica",
      status: "active",
      provider: "lemonsqueezy",
      lsSubscriptionId: "sub_777",
      customerPortalUrl: "https://novudent.lemonsqueezy.com/portal/xyz",
    });
    expect(doc.currentPeriodEndMs).toBe(Date.parse("2026-09-01T00:00:00.000000Z"));
  });

  it("FIRMA FALSIFICADA → 401 y NO escribe nada", async () => {
    // El ataque que importa: POSTear "la clínica X compró Cadena" sin pagar.
    const body = payload();
    const res = await POST(req(body, sign(JSON.stringify(body), "secreto_del_atacante")));
    expect(res.status).toBe(401);
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("CUERPO ALTERADO después de firmar → 401 y NO escribe", async () => {
    const raw = JSON.stringify(payload());
    const firmaBuena = sign(raw);
    const alterado = JSON.parse(raw);
    alterado.meta.custom_data.clinic_id = "cl_del_atacante";
    const res = await POST(req(alterado, firmaBuena));
    expect(res.status).toBe(401);
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("sin firma → 401", async () => {
    const raw = JSON.stringify(payload());
    const r = new Request("https://x/api", { method: "POST", body: raw });
    expect((await POST(r)).status).toBe(401);
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("evento repetido (reintento de LS) → no lo re-aplica", async () => {
    createIfAbsent.mockResolvedValue(false); // ya estaba registrado
    const res = await POST(req(payload()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("variante NO mapeada → ignora sin activar (no regala un plan)", async () => {
    const p = payload();
    p.data.attributes.variant_id = 999;
    const res = await POST(req(p));
    expect(res.status).toBe(200); // 200 para que LS no reintente para siempre
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("sin clinic_id → ignora (no sabemos a quién activarle)", async () => {
    const res = await POST(req(payload({ meta: { event_name: "subscription_created", custom_data: {} } })));
    expect(res.status).toBe(200);
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("impago → deja el plan pero marca past_due (pasa a solo lectura)", async () => {
    const res = await POST(req(payload({ meta: { event_name: "subscription_payment_failed", custom_data: { clinic_id: "cl_aura" } } })));
    expect(res.status).toBe(200);
    const [, doc] = setDocument.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(doc).toMatchObject({ plan: "clinica", status: "past_due" });
  });

  it("cancelación y vencimiento se registran", async () => {
    for (const [evento, esperado] of [["subscription_cancelled", "canceled"], ["subscription_expired", "expired"]] as const) {
      vi.clearAllMocks();
      createIfAbsent.mockResolvedValue(true);
      await POST(req(payload({ meta: { event_name: evento, custom_data: { clinic_id: "cl_aura" } } })));
      const [, doc] = setDocument.mock.calls[0] as unknown as [string, Record<string, unknown>];
      expect(doc.status).toBe(esperado);
    }
  });

  it("sin secret configurado → 503 y NO escribe (no queda abierto)", async () => {
    vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", "");
    const res = await POST(req(payload()));
    expect(res.status).toBe(503);
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("si falla la escritura → 500 para que LS reintente", async () => {
    setDocument.mockRejectedValueOnce(new Error("firestore caído"));
    const res = await POST(req(payload()));
    expect(res.status).toBe(500);
  });
});
