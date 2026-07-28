"use client";
/** Aviso de cobro de la suscripción (impago, vencimiento, fin de prueba).
 *  El estado sale de `subscriptions/{cid}` — colección que el cliente solo lee.
 *  Al vencer NO bloqueamos el acceso: la clínica conserva consulta y exportación
 *  de sus historias clínicas (dato médico sensible) y pierde solo la escritura. */
import { AlertTriangle, CreditCard } from "lucide-react";
import { useSubscriptionNotice } from "@/components/PlanGate";

export function SubscriptionBanner() {
  const notice = useSubscriptionNotice();
  if (!notice) return null;

  const err = notice.tone === "err";
  return (
    <div
      role="status"
      className={`mb-5 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${
        err
          ? "border-state-err/30 bg-state-errbg text-state-err"
          : "border-state-warn/30 bg-state-warnbg text-state-warn"
      }`}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 text-sm font-semibold">{notice.text}</p>
      <a
        href="/app/suscripcion"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold text-white transition-transform hover:-translate-y-0.5 ${
          err ? "bg-state-err" : "bg-state-warn"
        }`}
      >
        <CreditCard className="h-3.5 w-3.5" /> {err ? "Regularizar pago" : "Activar plan"}
      </a>
    </div>
  );
}
