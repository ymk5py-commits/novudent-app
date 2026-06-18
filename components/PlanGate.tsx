"use client";
/** Bloqueo por plan: tarjeta de upsell cuando el módulo no está incluido
 *  en el plan contratado por la clínica. */
import { Lock, Check, ArrowRight, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { planOf, PLANS, type PlanFeature } from "@/lib/plan";
import { Card } from "@/components/ui";

const FEATURE_LABEL: Record<PlanFeature, string> = {
  caja: "Caja — financiamiento y morosidad",
  inventario: "Inventario de insumos",
  reportes: "Informes de gestión",
  integraciones: "Botika — WhatsApp con IA",
  ia: "Novudent IA",
  radiografia_ia: "Análisis IA de radiografías",
  firma_electronica: "Firma electrónica",
  crm: "CRM",
  laboratorios: "Laboratorios",
  liquidaciones: "Liquidaciones",
  boxes: "Box/Sillones",
};

/** Hook: plan vigente de la clínica activa */
export function useClinicPlan() {
  const { db } = useStore();
  return planOf(db.clinics[0]);
}

export function PlanLocked({ feature }: { feature: PlanFeature }) {
  const { db } = useStore();
  const current = planOf(db.clinics[0]);
  // el upgrade natural: solo → clinica; clinica → cadena
  const target = current.id === "solo" ? PLANS.clinica : PLANS.cadena;
  return (
    <Card className="relative overflow-hidden p-10 text-center">
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-azure-50 blur-3xl" />
      <div className="relative mx-auto max-w-md">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-navy-800 text-white shadow-[0_12px_28px_-10px_rgba(15,31,61,0.5)]">
          <Lock className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-extrabold text-clinic-text">{FEATURE_LABEL[feature]}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-clinic-muted">
          Este módulo no está incluido en tu <b>Plan {current.label}</b>.
          Desbloquealo pasándote al <b>Plan {target.label}</b>
          {target.priceUsd ? <> (USD {target.priceUsd}/mes)</> : <> (a medida)</>}.
        </p>
        <ul className="mx-auto mt-5 grid max-w-sm gap-2 text-left sm:grid-cols-2">
          {target.bullets.slice(0, 6).map((b) => (
            <li key={b} className="flex items-start gap-2 text-xs font-semibold text-clinic-text">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-azure-600" strokeWidth={2.5} /> {b}
            </li>
          ))}
        </ul>
        <a
          href="/app/suscripcion"
          className="btn-shine mt-6 inline-flex items-center gap-2 rounded-2xl bg-azure-600 px-5 py-3 text-sm font-extrabold text-white shadow-[0_8px_24px_-8px_rgba(46,131,245,0.6)] transition-all hover:-translate-y-0.5 hover:bg-azure-700"
        >
          <Sparkles className="h-4 w-4" /> Mejorar mi plan <ArrowRight className="h-4 w-4" />
        </a>
        <p className="mt-3 text-[11px] text-clinic-muted">Sin contratos largos · migración de datos incluida</p>
      </div>
    </Card>
  );
}
