import type { Metadata } from "next";
import { NavLanding, FooterLanding } from "@/components/landing/Chrome";
import SolicitarAcceso from "@/components/SolicitarAcceso";
import { Check } from "lucide-react";

export const metadata: Metadata = {
  title: "Solicitá tu acceso — 30 días de prueba",
  description:
    "Dejanos tus datos y te mostramos Novudent funcionando con los de tu clínica. Respuesta en menos de 24 horas hábiles, 30 días de prueba y migración de datos incluida (Dentalink, planillas o papel).",
  alternates: { canonical: "/acceso" },
};

/** Página de conversión: el formulario es el contenido. Sin cross-links ni
 *  distracciones — nav, formulario, garantías, footer. */
export default function AccesoPage() {
  return (
    <div className="bg-sv-paper font-logo text-[17px] font-normal leading-relaxed text-sv-ink">
      <NavLanding />

      <section className="sv-mesh sv-grain relative overflow-hidden pb-24 pt-28 sm:pt-36">
        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <nav aria-label="Ruta" className="mb-6 flex items-center gap-2 text-[12px] font-light uppercase tracking-[0.18em] text-white/45">
              <a href="/" className="transition-colors hover:text-white">Inicio</a>
              <span aria-hidden>/</span>
              <span className="text-sv-mint">Acceso</span>
            </nav>
            <h1 className="font-logo text-[2.75rem] font-extralight leading-[1.02] tracking-[-0.02em] text-white sm:text-[4.25rem]">
              Empecemos con
              <br /><span className="text-sv-mint">tu clínica</span>.
            </h1>
            <p className="mt-6 max-w-md text-lg font-light leading-relaxed text-white/65">
              Dejanos tus datos y te mostramos Novudent funcionando con los de tu
              clínica — antes de que pagues un peso.
            </p>
            <ul className="mt-8 space-y-3">
              {["Migración de tus datos incluida", "Capacitación del equipo", "30 días de prueba, sin tarjeta", "Respuesta en menos de 24 h hábiles"].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-[15px] font-light text-white/85">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-sv-mint" strokeWidth={1.75} /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-6">
            {/* SolicitarAcceso ya trae su tarjeta blanca: va suelto, sin wrapper */}
            <SolicitarAcceso />
          </div>
        </div>
      </section>

      <FooterLanding />
    </div>
  );
}
