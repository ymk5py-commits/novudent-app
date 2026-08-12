"use client";
/** Formulario de pedido de acceso — reemplaza a la demo abierta en la landing.
 *
 *  Novudent pasa a venderse con acceso solicitado: el visitante deja sus datos
 *  y el dueño le abre la cuenta. Manda a `/api/contacto`, que es pública pero
 *  escribe a UNA sola dirección fija (la del dueño), nunca a una que elija el
 *  visitante.
 *
 *  Sin animación de entrada, como el resto de la landing: si el formulario para
 *  pedir acceso no se ve, no hay negocio. */
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

type Estado = { fase: "listo" } | { fase: "enviando" } | { fase: "ok" } | { fase: "error"; msg: string };

const campo =
  "w-full rounded-xl border border-clinic-border bg-white px-3.5 py-2.5 text-sm text-clinic-text " +
  "placeholder:text-clinic-muted/70 focus:border-azure-400 focus:outline-none";

export default function SolicitarAcceso({ id = "acceso" }: { id?: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "listo" });

  if (estado.fase === "ok") {
    return (
      <div id={id} className="scroll-mt-24 rounded-3xl border border-state-ok/30 bg-state-okbg/60 p-8 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-state-ok text-white">
          <Check className="h-5 w-5" strokeWidth={3} />
        </span>
        <h3 className="mt-4 font-logo text-2xl text-navy-800">Recibimos tu pedido</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-clinic-muted">
          Te escribimos dentro de las próximas 24 horas hábiles para coordinar una
          demostración y abrir tu cuenta.
        </p>
      </div>
    );
  }

  const enviando = estado.fase === "enviando";

  return (
    <form
      id={id}
      noValidate
      className="scroll-mt-24 rounded-3xl border border-clinic-border bg-white p-6 shadow-card sm:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        if (enviando) return;
        const fd = new FormData(e.currentTarget);
        setEstado({ fase: "enviando" });
        try {
          const r = await fetch("/api/contacto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(fd)),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || !d.ok) throw new Error(d.error || "No pudimos enviar tu pedido.");
          setEstado({ fase: "ok" });
        } catch (err) {
          setEstado({ fase: "error", msg: err instanceof Error ? err.message : "No pudimos enviar tu pedido." });
        }
      }}
    >
      <h3 className="font-logo text-2xl text-navy-800 sm:text-3xl">Pedí tu acceso</h3>
      <p className="mt-2 text-sm leading-relaxed text-clinic-muted">
        Dejanos tus datos y te mostramos Novudent funcionando con los de tu clínica.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Nombre y apellido *</span>
          <input name="nombre" required autoComplete="name" className={campo} placeholder="Dra. María González" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Clínica</span>
          <input name="clinica" autoComplete="organization" className={campo} placeholder="Consultorio Céntrico" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Email *</span>
          <input name="email" type="email" required autoComplete="email" className={campo} placeholder="vos@tuclinica.com" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-clinic-muted">WhatsApp</span>
          <input name="telefono" type="tel" autoComplete="tel" className={campo} placeholder="+595 9xx xxx xxx" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-clinic-muted">¿Qué usás hoy? (opcional)</span>
          <textarea name="mensaje" rows={3} className={campo} placeholder="Dentalink, planillas, papel…" />
        </label>
      </div>

      {/* Trampa para bots: fuera de pantalla y fuera del tab order, no oculta con
          display:none — hay bots que ignoran los campos ocultos justamente. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>No completar<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {estado.fase === "error" && (
        <p role="alert" className="mt-4 rounded-xl bg-state-errbg px-4 py-3 text-sm font-semibold text-state-err">
          {estado.msg}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="btn-shine group mt-6 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-navy-800 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:bg-clinic-border disabled:text-clinic-muted sm:w-auto"
      >
        {enviando ? "Enviando…" : "Solicitar acceso"}
        {!enviando && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
      </button>
      <p className="mt-3 text-[11px] leading-relaxed text-clinic-muted">
        Te respondemos en menos de 24 horas hábiles. No compartimos tus datos con nadie.
      </p>
    </form>
  );
}
