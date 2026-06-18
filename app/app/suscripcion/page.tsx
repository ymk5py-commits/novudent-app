"use client";
/** Suscripción y facturas de la plataforma (solo Administrador).
 *  Preparada para la extensión oficial "Run Payments with Stripe" de Firebase:
 *  al conectar las claves, esta página lee customers/subscriptions/invoices
 *  sincronizados por la extensión y habilita el Customer Portal. */
import { ShieldAlert, CreditCard, Check, ExternalLink, FileText, Mail, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/rbac";
import { Card, Badge, Btn } from "@/components/ui";
import { planOf } from "@/lib/plan";
import { Reveal } from "@/components/motion";

export default function SubscriptionPage() {
  const { session, db } = useStore();
  // Plan real contratado por la clínica (lo fija el dueño al crear la cuenta)
  const PLAN = planOf(db.clinics[0]);
  const price = PLAN.priceUsd ?? 0;
  const DEMO_INVOICES = [
    { n: "NOV-2026-0003", date: "01 jun 2026", amount: price, status: "pagada" },
    { n: "NOV-2026-0002", date: "01 may 2026", amount: price, status: "pagada" },
    { n: "NOV-2026-0001", date: "01 abr 2026", amount: price, status: "pagada" },
  ];
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
          <h1 className="text-2xl font-extrabold text-clinic-text">Suscripción y facturas</h1>
          <p className="text-sm text-clinic-muted">Plan de {db.clinics[0]?.name ?? "tu clínica"} en Novudent.</p>
        </div>
        <Badge tone="warn" tip="Stripe aún no está conectado — los datos de esta página son de demostración">Modo demo · Stripe pendiente</Badge>
      </div>

      <Reveal className="grid gap-5 lg:grid-cols-5">
        {/* Plan actual */}
        <Card className="relative overflow-hidden p-7 lg:col-span-3">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-azure-50 blur-2xl" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-azure-600">Plan actual</span>
              <Badge tone="ok">Activo</Badge>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-4xl font-extrabold text-clinic-text">Plan {PLAN.label}</span>
              <span className="mb-1 font-mono text-sm text-clinic-muted">{PLAN.priceUsd ? `USD ${PLAN.priceUsd}/mes` : "precio a medida"}</span>
            </div>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {PLAN.bullets.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-clinic-text">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-azure-600" strokeWidth={2.5} /> {f}
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-2">
              <Btn disabled tip="Disponible al conectar Stripe (Customer Portal)"><CreditCard className="h-4 w-4" /> Gestionar pago</Btn>
              <Btn variant="outline" disabled tip="Disponible al conectar Stripe">Cambiar de plan <ExternalLink className="h-3.5 w-3.5" /></Btn>
            </div>
          </div>
        </Card>

        {/* Qué se activa con Stripe */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Al conectar Stripe</h2></div>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-start gap-2.5 text-clinic-text"><CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-azure-600" /> Cobro automático mensual con tarjeta (Checkout seguro de Stripe).</li>
            <li className="flex items-start gap-2.5 text-clinic-text"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-azure-600" /> Facturas oficiales descargables (PDF) en esta página.</li>
            <li className="flex items-start gap-2.5 text-clinic-text"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-azure-600" /> Cada factura llega también por correo, automáticamente.</li>
            <li className="flex items-start gap-2.5 text-clinic-text"><ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-azure-600" /> Portal del cliente: cambiar tarjeta, plan o descargar historial.</li>
          </ul>
          <p className="mt-4 rounded-xl bg-clinic-bg p-3 text-[11px] leading-relaxed text-clinic-muted">
            Implementación lista en <span className="font-mono">docs/ROADMAP-PAGOS.md</span> — solo
            faltan las claves de tu cuenta Stripe.
          </p>
        </Card>
      </Reveal>

      {/* Historial de facturas (demo) */}
      <Reveal>
      <Card className="overflow-x-auto">
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 className="font-extrabold text-clinic-text">Historial de facturas</h2>
          <Badge tone="muted">Datos de ejemplo</Badge>
        </div>
        <div className="overflow-x-auto">
        <table className="mt-3 w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
              <th className="px-6 py-3">Factura</th>
              <th className="px-6 py-3">Fecha</th>
              <th className="px-6 py-3 text-right">Importe</th>
              <th className="px-6 py-3">Estado</th>
              <th className="px-6 py-3 text-right">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-clinic-border">
            {DEMO_INVOICES.map((inv) => (
              <tr key={inv.n} className="hover:bg-clinic-bg/60">
                <td className="px-6 py-3.5 font-mono text-xs font-bold text-clinic-text">{inv.n}</td>
                <td className="px-6 py-3.5 text-clinic-muted">{inv.date}</td>
                <td className="px-6 py-3.5 text-right font-mono text-xs font-bold">USD {inv.amount}.00</td>
                <td className="px-6 py-3.5"><Badge tone="ok">Pagada</Badge></td>
                <td className="px-6 py-3.5 text-right">
                  <Btn variant="outline" disabled tip="Disponible al conectar Stripe"><FileText className="h-3.5 w-3.5" /> Descargar</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
      </Reveal>
    </div>
  );
}
