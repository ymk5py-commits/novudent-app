"use client";
/** Página pública de pago (el paciente abre el link que le envía la clínica).
 *  Muestra el monto y las opciones que la clínica configuró: pagar con tarjeta
 *  (link de SU pasarela), transferencia, o avisar por WhatsApp. Sin sesión. */
import { useEffect, useState } from "react";
import { formatMoney, type CurrencyCode } from "@/lib/currency";

type Info = { clinicName: string; checkoutUrl?: string; bankInfo?: string; phone?: string; currency: CurrencyCode };

export default function PagarPublic({ params }: { params: { cid: string } }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState<{ amount?: number; concept?: string; patient?: string }>({});

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const amt = Number(sp.get("amount"));
    setQ({ amount: Number.isFinite(amt) && amt > 0 ? amt : undefined, concept: sp.get("concept") ?? undefined, patient: sp.get("patient") ?? undefined });
    fetch(`/api/pago?cid=${encodeURIComponent(params.cid)}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "No se pudo cargar."); return d; })
      .then(setInfo).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [params.cid]);

  const waLink = info?.phone ? `https://wa.me/${info.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, ${q.patient ?? ""} aboné ${q.amount ? formatMoney(q.amount, info.currency) : "el saldo"} (${q.concept ?? "pago"}).`)}` : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-clinic-bg to-white px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl border border-clinic-border bg-white p-6 shadow-card sm:p-8">
          {loading ? (
            <p className="py-12 text-center text-sm text-clinic-muted">Cargando…</p>
          ) : error ? (
            <p className="py-12 text-center text-sm text-state-err">{error}</p>
          ) : info ? (
            <>
              <div className="mb-1 text-center text-xs font-bold uppercase tracking-wide text-azure-600">{info.clinicName}</div>
              <h1 className="mb-1 text-center text-xl font-extrabold text-clinic-text">Pago de {q.concept ?? "tu cuenta"}</h1>
              {q.amount != null && <div className="mb-6 text-center font-mono text-4xl font-extrabold text-azure-600">{formatMoney(q.amount, info.currency)}</div>}

              <div className="space-y-3">
                {info.checkoutUrl && /^https:\/\//i.test(info.checkoutUrl) ? (
                  <a href={info.checkoutUrl} target="_blank" rel="noopener noreferrer" className="block w-full rounded-xl bg-azure-600 py-3 text-center text-sm font-bold text-white transition-colors hover:bg-azure-700">Pagar con tarjeta</a>
                ) : (
                  <p className="rounded-xl bg-clinic-bg px-4 py-3 text-center text-sm text-clinic-muted">El pago con tarjeta online no está habilitado. Coordiná el pago con la clínica.</p>
                )}

                {info.bankInfo && (
                  <div className="rounded-xl border border-clinic-border p-4">
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Transferencia bancaria</div>
                    <p className="whitespace-pre-wrap text-sm text-clinic-text">{info.bankInfo}</p>
                  </div>
                )}

                {waLink && (
                  <a href={waLink} target="_blank" rel="noopener noreferrer" className="block w-full rounded-xl border border-clinic-border py-2.5 text-center text-sm font-bold text-[#128C7E] transition-colors hover:bg-[#25D366]/10">Ya pagué — avisar por WhatsApp</a>
                )}
              </div>
            </>
          ) : null}
        </div>
        <p className="mt-4 text-center text-[11px] text-clinic-muted">Pago seguro · Novudent</p>
      </div>
    </div>
  );
}
