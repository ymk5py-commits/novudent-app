import { describe, it, expect } from "vitest";
import { isSubscriptionActive, subscriptionPlanId, accessMode, subscriptionNotice } from "./subscription";
import type { Subscription } from "./types";

const NOW = Date.UTC(2026, 6, 19); // 19-jul-2026
const DIA = 86_400_000;

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  clinicId: "cl_1",
  plan: "clinica",
  status: "active",
  currentPeriodEndMs: NOW + 15 * DIA,
  provider: "lemonsqueezy",
  updatedAt: new Date(NOW).toISOString(),
  ...over,
});

describe("isSubscriptionActive", () => {
  it("activa: status active y período vigente", () => {
    expect(isSubscriptionActive(sub(), NOW)).toBe(true);
  });

  it("activa: en trial vigente", () => {
    expect(isSubscriptionActive(sub({ status: "trialing" }), NOW)).toBe(true);
  });

  it("NO activa: período vencido aunque el status diga active (webhook perdido)", () => {
    // Defensa en profundidad: si LS no nos avisó del impago, la fecha manda.
    expect(isSubscriptionActive(sub({ status: "active", currentPeriodEndMs: NOW - DIA }), NOW)).toBe(false);
  });

  it("NO activa: past_due / canceled / expired", () => {
    for (const status of ["past_due", "canceled", "expired"] as const) {
      expect(isSubscriptionActive(sub({ status }), NOW)).toBe(false);
    }
  });

  it("activa sin fecha de fin (plan a medida / manual sin vencimiento)", () => {
    expect(isSubscriptionActive(sub({ currentPeriodEndMs: undefined }), NOW)).toBe(true);
  });

  it("GRANDFATHERING: clínica sin doc de suscripción sigue activa", () => {
    // Crítico para el deploy: las clínicas que ya existen no tienen doc todavía,
    // no se las puede dejar en solo-lectura de un día para el otro.
    expect(isSubscriptionActive(undefined, NOW)).toBe(true);
    expect(isSubscriptionActive(null, NOW)).toBe(true);
  });
});

describe("subscriptionPlanId", () => {
  it("el plan de la SUSCRIPCIÓN gana sobre el del doc de clínica", () => {
    // El admin de clínica puede escribir clinics/{cid}.plan; la suscripción la
    // escribe solo el webhook. Si difieren, manda la suscripción.
    expect(subscriptionPlanId(sub({ plan: "solo" }), { plan: "cadena" })).toBe("solo");
  });

  it("sin suscripción cae al plan del doc de clínica (legacy)", () => {
    expect(subscriptionPlanId(undefined, { plan: "cadena" })).toBe("cadena");
  });

  it("sin suscripción ni plan → clinica (default histórico, no romper)", () => {
    expect(subscriptionPlanId(undefined, undefined)).toBe("clinica");
  });

  it("conserva el plan aunque la suscripción esté vencida (solo lectura, no downgrade)", () => {
    expect(subscriptionPlanId(sub({ plan: "cadena", status: "past_due" }), {})).toBe("cadena");
  });
});

describe("accessMode", () => {
  it("full cuando está activa", () => {
    expect(accessMode(sub(), NOW)).toBe("full");
  });

  it("readonly cuando venció o no pagó", () => {
    expect(accessMode(sub({ status: "past_due" }), NOW)).toBe("readonly");
    expect(accessMode(sub({ currentPeriodEndMs: NOW - DIA }), NOW)).toBe("readonly");
  });

  it("full para clínica sin suscripción (grandfathering)", () => {
    expect(accessMode(undefined, NOW)).toBe("full");
  });
});

describe("subscriptionNotice", () => {
  it("sin aviso cuando está todo al día", () => {
    expect(subscriptionNotice(sub(), NOW)).toBeNull();
  });

  it("avisa el impago con tono de regularizar", () => {
    const n = subscriptionNotice(sub({ status: "past_due" }), NOW);
    expect(n?.tone).toBe("err");
    expect(n?.text).toMatch(/pago/i);
  });

  it("avisa que el trial está por terminar (3 días o menos)", () => {
    const n = subscriptionNotice(sub({ status: "trialing", currentPeriodEndMs: NOW + 2 * DIA }), NOW);
    expect(n?.tone).toBe("warn");
    expect(n?.text).toMatch(/prueba/i);
  });

  it("no molesta si el trial recién arranca", () => {
    expect(subscriptionNotice(sub({ status: "trialing", currentPeriodEndMs: NOW + 20 * DIA }), NOW)).toBeNull();
  });
});
