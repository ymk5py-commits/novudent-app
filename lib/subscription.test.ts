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

/* La suscripción de prueba que `POST /api/clinicas` le escribe a cada clínica
 * nueva. Antes NO se escribía nada, y sin documento `isSubscriptionActive`
 * devuelve true por grandfathering: la clínica quedaba gratis PARA SIEMPRE.
 * Estos casos fijan que el trial efectivamente arranca un reloj y que ese reloj
 * llega a cero — o sea, que el cobro es exigible. */
describe("suscripción de prueba del alta de clínica", () => {
  const TRIAL_DIAS = 30;
  /** Réplica del doc que arma app/api/clinicas/route.ts (paso 7). */
  const pruebaNueva = (altaMs: number): Subscription => ({
    clinicId: "cl_nueva",
    plan: "clinica",
    status: "trialing",
    currentPeriodEndMs: altaMs + TRIAL_DIAS * DIA,
    provider: "manual",
    updatedAt: new Date(altaMs).toISOString(),
    updatedBy: "alta:panel-dueño",
  });

  it("recién dada de alta, la clínica puede trabajar", () => {
    expect(isSubscriptionActive(pruebaNueva(NOW), NOW)).toBe(true);
  });

  it("conserva el plan contratado durante la prueba", () => {
    expect(subscriptionPlanId(pruebaNueva(NOW), { plan: "solo" })).toBe("clinica");
  });

  it("avisa antes de que se termine la prueba", () => {
    const n = subscriptionNotice(pruebaNueva(NOW), NOW + (TRIAL_DIAS - 2) * DIA);
    expect(n).not.toBeNull();
  });

  it("VENCE: pasados los 30 días deja de estar activa — esto es lo que no pasaba", () => {
    expect(isSubscriptionActive(pruebaNueva(NOW), NOW + (TRIAL_DIAS + 1) * DIA)).toBe(false);
  });

  it("al vencer pasa a solo-lectura, no borra el acceso a los datos", () => {
    expect(accessMode(pruebaNueva(NOW), NOW + (TRIAL_DIAS + 1) * DIA)).toBe("readonly");
  });

  it("sin documento seguiría siendo gratis para siempre — el bug que esto corrige", () => {
    expect(isSubscriptionActive(null, NOW + 3650 * DIA)).toBe(true);
  });
});
