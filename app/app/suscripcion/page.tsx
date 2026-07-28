"use client";
/** Suscripción de la plataforma (solo Administrador).
 *
 *  Cobro con Lemon Squeezy (Merchant of Record): el checkout es hospedado, así
 *  que los datos de tarjeta nunca pasan por Novudent. El estado real sale de
 *  `subscriptions/{cid}` — colección que el cliente solo LEE; la escribe el
 *  webhook (app/api/webhooks/lemonsqueezy). Por eso acá no hay ningún botón que
 *  "active" un plan: la única fuente de verdad es el pago confirmado. */
import { useState } from "react";
import { ShieldAlert, CreditCard, Check, ExternalLink, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { currentIdToken } from "@/lib/firebase";
import { can } from "@/lib/rbac";
import { Card, Badge, Btn } from "@/components/ui";
import { PLANS, planOf, type PlanId } from "@/lib/plan";
import { subscriptionPlanId, isSubscriptionActive, subscriptionNotice } from "@/lib/subscription";
import type { SubscriptionStatus } from "@/lib/types";
import { Reveal } from "@/components/motion";

const ESTADO: Record<SubscriptionStatus, { label: string; tone: "ok" | "warn" | "err" }> = {
  active:   { label: "Al día",         tone: "ok" },
  trialing: { label: "Prueba gratis",  tone: "warn" },
  past_due: { label: "Pago pendiente", tone: "err" },
  canceled: { label: "Cancelada",      tone: "err" },
  expired:  { label: "Vencida",        tone: "err" },
};

const fmtFecha = (ms?: number) =>
  ms ? new Date(ms).toLocaleDateString("es-PY", { day: "2-digit", month: "long", year: "numeric" }) : null;

export default function SubscriptionPage() {
  const { session, db } = useStore();
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sub = db.subscription ?? null;
  const planActual = planOf(subscriptionPlanId(sub, db.clinics[0]));
  const activa = isSubscriptionActive(sub);
  const aviso = subscriptionNotice(sub);

  if (!session) return null;
  if (!can(session.role, "practice.config")) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-lg font-extrabold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">La suscripción de la plataforma es exclusiva del rol <b>Administrador</b>.</p>
      </Card>
    );
  }

  const contratar = async (plan: PlanId) => {
    setBusy(plan); setError(null);
    try {
      const token = await currentIdToken();
      const r = await fetch("/api/suscripcion/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ plan }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.error || "No se pudo abrir el checkout.");
      // Checkout hospedado de LS — pestaña nueva, la suscripción se activa por webhook.
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-clinic-text">Suscripción</h1>
          <p className="text-sm text-clinic-muted">Plan de {db.clinics[0]?.name ?? "tu clínica"} en Novudent.</p>
        </div>
        {sub?.customerPortalUrl && (
          <a href={sub.customerPortalUrl} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-2 rounded-xl border border-clinic-border bg-white px-4 py-2.5 text-sm font-bold text-clinic-text transition-colors hover:border-azure-300 hover:text-azure-700">
            <ExternalLink className="h-4 w-4" /> Gestionar pago y facturas
          </a>
        )}
      </div>

      {aviso && (
        <div className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${
          aviso.tone === "err" ? "border-state-err/30 bg-state-errbg text-state-err" : "border-state-warn/30 bg-state-warnbg text-state-warn"
        }`}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1 text-sm font-semibold">{aviso.text}</p>
        </div>
      )}

      {/* Estado actual */}
      <Reveal>
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-clinic-text">Plan {planActual.label}</h2>
                {sub ? <Badge tone={ESTADO[sub.status].tone}>{ESTADO[sub.status].label}</Badge>
                     : <Badge tone="info">Cuenta anterior al cobro</Badge>}
              </div>
              <p className="mt-1 max-w-lg text-sm text-clinic-muted">{planActual.tagline}</p>
              {sub?.currentPeriodEndMs && (
                <p className="mt-2 text-xs font-semibold text-clinic-muted">
                  {activa ? "Se renueva el " : "Venció el "}{fmtFecha(sub.currentPeriodEndMs)}
                </p>
              )}
              {!sub && (
                <p className="mt-2 text-xs text-clinic-muted">
                  Tu cuenta es anterior al sistema de cobro, así que sigue activa sin suscripción.
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="font-mono text-3xl font-extrabold text-clinic-text">
                {planActual.priceUsd != null ? `USD ${planActual.priceUsd}` : "A medida"}
              </div>
              {planActual.priceUsd != null && <div className="text-xs font-semibold text-clinic-muted">por mes</div>}
            </div>
          </div>
        </Card>
      </Reveal>

      {error && <p className="rounded-xl bg-state-errbg px-4 py-3 text-sm font-semibold text-state-err">{error}</p>}

      {/* Planes */}
      <Reveal>
        <div className="grid gap-4 lg:grid-cols-3">
          {(Object.keys(PLANS) as PlanId[]).map((id) => {
            const p = PLANS[id];
            const esActual = p.id === planActual.id && activa;
            return (
              <Card key={id} className={`flex flex-col p-6 ${esActual ? "ring-2 ring-azure-400" : ""}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-clinic-text">Plan {p.label}</h3>
                  {esActual && <Badge tone="ok">Tu plan</Badge>}
                </div>
                <div className="mt-3 font-mono text-2xl font-extrabold text-clinic-text">
                  {p.priceUsd != null ? `USD ${p.priceUsd}` : "A medida"}
                  {p.priceUsd != null && <span className="ml-1 text-xs font-semibold text-clinic-muted">/mes</span>}
                </div>
                <p className="mt-2 min-h-[40px] text-xs leading-relaxed text-clinic-muted">{p.tagline}</p>
                <ul className="mt-4 flex-1 space-y-2">
                  {p.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-xs font-semibold text-clinic-text">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-azure-600" strokeWidth={2.5} /> {b}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  {esActual ? (
                    <Btn variant="outline" disabled className="w-full justify-center">Plan actual</Btn>
                  ) : (
                    <Btn onClick={() => contratar(id)} disabled={busy !== null} className="w-full justify-center">
                      {busy === id
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Abriendo…</>
                        : <><CreditCard className="h-4 w-4" /> {p.priceUsd != null ? "Contratar" : "Hablemos"}</>}
                    </Btn>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </Reveal>

      <p className="flex items-start gap-1.5 text-[11px] text-clinic-muted">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-azure-500" />
        El pago se procesa en Lemon Squeezy, que actúa como vendedor registrado y emite tu factura.
        Los datos de tu tarjeta nunca pasan por Novudent. El plan se activa solo cuando el pago se confirma.
      </p>
    </div>
  );
}
