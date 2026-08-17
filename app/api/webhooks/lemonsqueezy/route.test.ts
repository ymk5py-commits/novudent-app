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
/* Devuelve el doc pedido por ruta. Por defecto no hay nada: ni token de
   checkout ni suscripción previa, que es el caso de una primera compra. */
const docs: Record<string, Record<string, unknown> | null> = {};
const getDocument = vi.fn(async (path: string) => docs[path] ?? null);

vi.mock("@/lib/server/firestore-rest", () => ({
  setDocument: (...a: unknown[]) => setDocument(...(a as [])),
  getDocument: (...a: unknown[]) => getDocument(...(a as [string])),
  createIfAbsent: (...a: unknown[]) => createIfAbsent(...(a as [])),
  isServerFirestoreConfigured: () => true,
}));

import { POST } from "./route";

const sign = (raw: string, secret = SECRET) => createHmac("sha256", secret).update(raw).digest("hex");

/** Token de checkout válido: el flujo normal SIEMPRE lo lleva (lo pone el
 *  servidor al armar el link). Se registra en `docs` en cada beforeEach. */
const TOKEN_OK = "t".repeat(40);

/** Saca el token del payload — simula el ataque de borrarlo del checkout. */
const sinToken = (p: any) => {
  const { novudent_token, ...resto } = p.meta.custom_data;
  return { ...p, meta: { ...p.meta, custom_data: resto } };
};

const payload = (over: Record<string, unknown> = {}) => ({
  meta: { event_name: "subscription_created", custom_data: { clinic_id: "cl_aura", novudent_token: TOKEN_OK }, ...(over.meta as object ?? {}) },
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
  for (const k of Object.keys(docs)) delete docs[k];
  docs[`checkoutTokens/${TOKEN_OK}`] = { token: TOKEN_OK, clinicId: "cl_aura" };
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
    const res = await POST(req(payload({ meta: { event_name: "subscription_payment_failed", custom_data: { clinic_id: "cl_aura", novudent_token: TOKEN_OK } } })));
    expect(res.status).toBe(200);
    const [, doc] = setDocument.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(doc).toMatchObject({ plan: "clinica", status: "past_due" });
  });

  it("cancelación y vencimiento se registran", async () => {
    for (const [evento, esperado] of [["subscription_cancelled", "canceled"], ["subscription_expired", "expired"]] as const) {
      vi.clearAllMocks();
      createIfAbsent.mockResolvedValue(true);
      await POST(req(payload({ meta: { event_name: evento, custom_data: { clinic_id: "cl_aura", novudent_token: TOKEN_OK } } })));
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

/* ── El pago apuntado a otra clínica ─────────────────────────────────────────
 * El clinicId es público (es el link `/reservar/{clinicId}` que la clínica
 * publica) y viajaba como parámetro editable de la URL de checkout. Sin defensa,
 * pagar el plan más barato apuntando a un competidor le pisaba la suscripción. */
describe("defensa del pago apuntado a otra clínica", () => {
  const conToken = (token: string, clinicId = "cl_aura") =>
    payload({ meta: { event_name: "subscription_created", custom_data: { clinic_id: clinicId, novudent_token: token } } });

  it("el TOKEN manda sobre el clinic_id de la URL", async () => {
    const t = "t".repeat(40);
    docs[`checkoutTokens/${t}`] = { token: t, clinicId: "cl_real" };
    // El atacante puso otro clinic_id en la URL, pero el token dice cuál es
    const r = await POST(req(conToken(t, "cl_victima")));
    expect(r.status).toBe(200);
    expect(setDocument).toHaveBeenCalledWith("subscriptions/cl_real", expect.objectContaining({ clinicId: "cl_real" }));
  });

  it("token desconocido → no se aplica nada", async () => {
    const r = await POST(req(conToken("x".repeat(40))));
    expect(await r.json()).toMatchObject({ ignored: true });
    expect(setDocument).not.toHaveBeenCalled();
  });

  /* El token es OBLIGATORIO para estrenar una suscripción. Cuando era opcional,
   * la defensa se desactivaba borrando un parámetro del checkout: el atacante
   * ponía el clinic_id de la víctima y le pisaba la suscripción. */
  it("SIN token no se puede estrenar una suscripción (aunque no haya ninguna)", async () => {
    const r = await POST(req(sinToken(payload())));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ rejected: true });
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("SIN token NO se puede pisar el trial de una clínica ajena (era EL ataque)", async () => {
    // Toda clínica recién dada de alta pasa 30 días así: sin lsSubscriptionId.
    // Esa era justo la rama que autorizaba la "primera compra".
    docs["subscriptions/cl_aura"] = {
      clinicId: "cl_aura", plan: "clinica", status: "trialing",
      currentPeriodEndMs: Date.now() + 10 * 86_400_000,
      provider: "manual", updatedAt: "2026-08-01T00:00:00.000Z",
    };
    const r = await POST(req(sinToken(payload())));
    expect(await r.json()).toMatchObject({ rejected: true });
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("SIN token sí pasa la RENOVACIÓN de la misma suscripción (las previas al token)", async () => {
    docs["subscriptions/cl_aura"] = {
      clinicId: "cl_aura", plan: "clinica", status: "active",
      currentPeriodEndMs: Date.now() + 5 * 86_400_000,
      lsSubscriptionId: "sub_777", updatedAt: "2026-08-01T00:00:00.000Z",
    };
    const r = await POST(req(sinToken(payload())));
    expect(r.status).toBe(200);
    expect(setDocument).toHaveBeenCalled();
  });

  it("clinic_id con path traversal → se descarta antes de tocar Firestore", async () => {
    const t = "t".repeat(40);
    docs[`checkoutTokens/${t}`] = { token: t, clinicId: "../clinics/cl_victima#" };
    const r = await POST(req(conToken(t)));
    expect(await r.json()).toMatchObject({ ignored: true });
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("BLOQUEA pisar una suscripción VIGENTE con un pago de otra suscripción", async () => {
    docs["subscriptions/cl_aura"] = {
      clinicId: "cl_aura", plan: "cadena", status: "active",
      currentPeriodEndMs: Date.now() + 30 * 86_400_000,
      lsSubscriptionId: "sub_de_la_victima", updatedAt: "2026-08-01T00:00:00.000Z",
    };
    const r = await POST(req(payload())); // llega sub_777, distinta de la vigente
    expect(r.status).toBe(200); // 200: el pago existe, LS no debe reintentar
    expect(await r.json()).toMatchObject({ rejected: true });
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("deja pasar la renovación de la MISMA suscripción", async () => {
    docs["subscriptions/cl_aura"] = {
      clinicId: "cl_aura", plan: "clinica", status: "active",
      currentPeriodEndMs: Date.now() + 5 * 86_400_000,
      lsSubscriptionId: "sub_777", updatedAt: "2026-08-01T00:00:00.000Z",
    };
    const r = await POST(req(payload()));
    expect(r.status).toBe(200);
    expect(setDocument).toHaveBeenCalled();
  });

  it("CON token deja pasar la primera compra sobre el TRIAL del alta (sin id de LS)", async () => {
    docs["subscriptions/cl_aura"] = {
      clinicId: "cl_aura", plan: "clinica", status: "trialing",
      currentPeriodEndMs: Date.now() + 10 * 86_400_000,
      provider: "manual", updatedAt: "2026-08-01T00:00:00.000Z",
    };
    const r = await POST(req(payload()));
    expect(r.status).toBe(200);
    expect(setDocument).toHaveBeenCalled();
  });
});
