"use client";
/** Página pública de pago (el paciente abre el link que le envía la clínica).
 *  Muestra el monto y las opciones que la clínica configuró: pagar con tarjeta
 *  (link de SU pasarela), transferencia, o avisar por WhatsApp. Sin sesión.
 *
 *  Registro visual: el sistema editorial de la landing (components/Landing.tsx).
 *  Acá la sobriedad ES la función — una página de pago que parece un aviso
 *  publicitario no inspira confianza. Papel, filete, cifra grande y nada más. */
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
    <div className="min-h-dvh bg-paper font-body text-clinic-text">
      {/* ===== Masthead ===== */}
      <header className="ed-rule-double bg-paper">
        <div className="mx-auto max-w-md px-5">
          <div className="flex items-center justify-between gap-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-clinic-muted">
            <span>Pago en línea</span>
            <span className="shrink-0">Novudent</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md px-5 py-8">
        <div className="ed-figure">
          {loading ? (
            <p className="px-5 py-14 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-clinic-muted">Cargando…</p>
          ) : error ? (
            /* Mismo tratamiento que el estado de error de /firmar: banda mono,
               título y explicación. Un error suelto en rojo en el medio de una
               caja vacía es justo donde se nota que una página quedó a medio
               diseñar — y encima es la pantalla donde el paciente ya venía con
               la guardia alta, porque vino a pagar. */
            <>
              <div className="border-b border-clinic-border px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-state-err">
                No se pudo cargar
              </div>
              <div className="px-5 py-8 sm:px-7">
                <h1 className="font-display text-xl font-extrabold leading-tight tracking-[-0.02em] text-navy-800">
                  El cobro no se pudo abrir
                </h1>
                <p className="mt-2 text-[15px] leading-relaxed text-clinic-muted">{error}</p>
                <p className="mt-4 border-l-2 border-clinic-border bg-paper-2 px-4 py-3 text-[13px] leading-relaxed text-clinic-muted">
                  Escribile a la clínica para que te reenvíe el link de pago.
                </p>
              </div>
            </>
          ) : info ? (
            <>
              <div className="border-b border-clinic-border px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-clinic-text">
                {info.clinicName}
              </div>

              <div className="px-5 py-6 sm:px-7 sm:py-8">
                <h1 className="font-display text-2xl font-extrabold leading-tight tracking-[-0.025em] text-navy-800">
                  Pago de {q.concept ?? "tu cuenta"}
                </h1>
                {q.amount != null && (
                  <>
                    <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-clinic-muted">Total a pagar</p>
                    <div className="mt-1 font-display text-5xl font-extrabold tabular-nums tracking-[-0.03em] text-navy-800">
                      {formatMoney(q.amount, info.currency)}
                    </div>
                  </>
                )}

                <div className="mt-7 space-y-3">
                  {info.checkoutUrl && /^https:\/\//i.test(info.checkoutUrl) ? (
                    <a
                      href={info.checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[44px] w-full items-center justify-center border border-navy-800 bg-navy-800 px-6 py-3 text-center text-sm font-bold text-white transition-colors duration-200 hover:bg-navy-700"
                    >
                      Pagar con tarjeta
                    </a>
                  ) : (
                    <p className="border-l-2 border-clinic-border bg-paper-2 px-4 py-3 text-[13px] leading-relaxed text-clinic-muted">
                      El pago con tarjeta online no está habilitado. Coordiná el pago con la clínica.
                    </p>
                  )}

                </div>

                {/* La transferencia va ANTES del "ya pagué": primero se paga, después se avisa. */}
                {info.bankInfo && (
                  <div className="mt-6 border-t border-clinic-border pt-5">
                    <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-clinic-muted">
                      Transferencia bancaria
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-clinic-text">{info.bankInfo}</p>
                  </div>
                )}

                {waLink && (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 flex min-h-[44px] w-full items-center justify-center border border-clinic-border px-6 py-3 text-center text-sm font-bold text-clinic-text transition-colors duration-200 hover:bg-paper-2"
                  >
                    Ya pagué — avisar por WhatsApp
                  </a>
                )}
              </div>
            </>
          ) : null}
        </div>

        <p className="mt-5 font-mono text-[11px] uppercase leading-relaxed tracking-[0.18em] text-clinic-muted">
          Pago seguro · Novudent — software de gestión odontológica
        </p>
      </div>
    </div>
  );
}
