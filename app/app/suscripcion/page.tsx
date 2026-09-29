"use client";
/** Suscripción de la plataforma (solo Administrador).
 *  La oferta comercial sale de la misma fuente que la landing. Hasta que el
 *  cobro en guaraníes esté configurado, un cambio de plan se solicita al equipo;
 *  solo una suscripción confirmada por el servidor modifica el acceso. */
import { useState } from "react";
import Link from "next/link";
import { ShieldAlert, Check, ExternalLink, ArrowRight, AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/rbac";
import { Card, Badge, Btn } from "@/components/ui";
import { PLANS, planOf, publicPlanId, type PlanId } from "@/lib/plan";
import { PLANES, CONDICIONES, gs } from "@/lib/landing/precios";
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
  const [anual, setAnual] = useState(false);

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
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="whitespace-nowrap text-lg font-extrabold text-clinic-text">Plan {planActual.label}</h2>
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
            <div className="min-w-0 text-left sm:text-right">
              <div className="text-xs font-semibold text-clinic-muted">Precio publicado</div>
              <div className="font-mono text-2xl font-extrabold text-clinic-text">{gs(planActual.priceGs)}<span className="ml-1 text-xs font-semibold text-clinic-muted">/ mes</span></div>
            </div>
          </div>
        </Card>
      </Reveal>

      {/* Planes */}
      <Reveal>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-clinic-text">Planes Novudent</h2>
            <p className="text-sm text-clinic-muted">Los mismos planes y precios que mostramos en la web.</p>
          </div>
          <div role="group" aria-label="Período de pago" className="inline-flex rounded-xl border border-clinic-border bg-white p-1 text-sm font-semibold">
            <button type="button" onClick={() => setAnual(false)} aria-pressed={!anual} className={`min-h-9 rounded-lg px-3 ${!anual ? "bg-azure-600 text-white" : "text-clinic-muted"}`}>Mensual</button>
            <button type="button" onClick={() => setAnual(true)} aria-pressed={anual} className={`min-h-9 rounded-lg px-3 ${anual ? "bg-azure-600 text-white" : "text-clinic-muted"}`}>Anual</button>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {PLANES.map((oferta) => {
            const id: PlanId = oferta.id === "multi" ? "cadena" : oferta.id;
            const p = PLANS[id];
            const esActual = p.id === planActual.id && activa;
            return (
              <Card key={id} className={`flex flex-col p-6 ${esActual ? "ring-2 ring-azure-400" : ""}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-clinic-text">Plan {p.label}</h3>
                  {esActual && <Badge tone="ok">Tu plan</Badge>}
                </div>
                <p className="mt-1 text-xs text-clinic-muted">{oferta.para} · {oferta.profesionales}</p>
                <div className="mt-4 font-mono text-2xl font-extrabold text-clinic-text">
                  {gs(anual ? p.annualGs : p.priceGs)}
                  <span className="ml-1 text-xs font-semibold text-clinic-muted">/ {anual ? "año" : "mes"}</span>
                </div>
                <p className="mt-1 text-xs text-clinic-muted">{anual ? `Equivale a ${gs(Math.round(p.annualGs / 12))} por mes` : `Pagando el año: ${gs(p.annualGs)}`}</p>
                <ul className="mt-5 flex-1 space-y-2 border-t border-clinic-border pt-4">
                  {p.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-xs font-semibold text-clinic-text">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-azure-600" strokeWidth={2.5} /> {b}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  {esActual ? (
                    <Btn variant="outline" disabled className="w-full justify-center">Plan actual</Btn>
                  ) : <Link href={`/acceso?plan=${publicPlanId(id)}`} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-azure-600 px-4 py-2 text-sm font-semibold text-white hover:bg-azure-700">Solicitar Plan {p.label} <ArrowRight className="h-4 w-4" /></Link>}
                </div>
              </Card>
            );
          })}
        </div>
      </Reveal>

      <div className="grid gap-3 rounded-2xl border border-clinic-border bg-white p-5 text-xs text-clinic-muted sm:grid-cols-3">
        <p><b className="block text-clinic-text">Puesta en marcha</b>{gs(CONDICIONES.setupGs)}, pago único. Incluye configuración, migración y capacitación.</p>
        <p><b className="block text-clinic-text">Profesional adicional</b>{gs(CONDICIONES.profesionalExtraGs)} por mes, previa habilitación del equipo.</p>
        <p><b className="block text-clinic-text">Pago anual</b>Descuento frente a 12 mensualidades: {CONDICIONES.mesesGratisAnual} meses sin cargo en Solo y Clínica; más descuento en Multi.</p>
      </div>
      <p className="text-xs text-clinic-muted">Los importes publicados no modifican automáticamente una suscripción existente. Para conocer o cambiar tu cobro actual, usá “Gestionar pago y facturas” si aparece arriba, o solicitá el plan.</p>
    </div>
  );
}
