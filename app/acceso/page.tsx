import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { NavLanding, FooterLanding } from "@/components/landing/Chrome";
import SolicitarAcceso from "@/components/SolicitarAcceso";

export const metadata: Metadata = {
  title: "Pedí una demo de Novudent",
  description:
    "Dejanos tus datos y te mostramos Novudent funcionando. Respondemos en menos de 24 horas hábiles; la puesta en marcha, con tus datos migrados, lleva una semana.",
  alternates: { canonical: "/acceso" },
};

/** Página de conversión: el formulario es el contenido. Sin cross-links ni
 *  distracciones — nav, formulario, garantías, footer. */
export default function AccesoPage() {
  return (
    <div className="lp-root min-h-dvh font-lp text-[16px] leading-relaxed">
      <NavLanding />

      <main id="contenido" tabIndex={-1} className="mx-auto grid max-w-6xl focus:outline-none gap-10 px-4 pb-20 pt-32 sm:px-6 sm:pt-40 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <nav aria-label="Ruta" className="mb-6 flex items-center gap-2 text-[13px] font-medium text-lp-muted">
            <Link href="/" className="transition-colors hover:text-lp-ink">Inicio</Link>
            <span aria-hidden>/</span>
            <span className="text-lp-ink">Demo</span>
          </nav>
          <h1 className="text-[clamp(2.25rem,5.2vw,3.75rem)] font-bold leading-[1.05] tracking-[-0.02em] text-lp-ink">
            Empecemos con tu clínica.
          </h1>
          <p className="mt-6 max-w-md text-[18px] leading-relaxed text-lp-muted">
            Dejanos tus datos y te mostramos Novudent funcionando, antes de que pagues nada.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              "Respuesta en menos de 24 h hábiles",
              "Tu clínica funcionando en una semana",
              "Migración de tus datos y capacitación del equipo",
              "Documento de configuración de tu clínica, por escrito",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[15px] text-lp-ink">
                <Check className="mt-1 h-4 w-4 shrink-0 text-lp-primary" strokeWidth={2} aria-hidden /> {t}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-[15px] text-lp-muted">
            ¿Querés ver los números primero? <Link href="/precios" className="font-semibold text-lp-ink underline underline-offset-4">Precios</Link>
          </p>
        </div>
        <div className="min-w-0 lg:col-span-7">
          <SolicitarAcceso />
        </div>
      </main>

      <FooterLanding />
    </div>
  );
}
