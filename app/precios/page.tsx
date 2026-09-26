import type { Metadata } from "next";
import { PaginaSeccion } from "@/components/landing/Chrome";
import { SeccionFaq, SeccionPrecios, TablaPlanes } from "@/components/Landing";
import { SITE_URL } from "@/lib/site";
import { PLANES, gs } from "@/lib/landing/precios";

export const metadata: Metadata = {
  title: "Precios y planes en guaraníes — Solo, Clínica y Multi",
  description:
    `Plan Solo ${gs(PLANES[0].mensualGs)}/mes (1 profesional), Plan Clínica ${gs(PLANES[1].mensualGs)}/mes (hasta 4) y Plan Multi ${gs(PLANES[2].mensualGs)}/mes (hasta 10). Pagando el año, 2 meses sin cargo.`,
  alternates: { canonical: "/precios" },
};

/** Ofertas como JSON-LD también en la página de precios (además de la home). */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Novudent — Software de gestión odontológica",
  description:
    "Software dental completo: agenda, odontograma FDI, ficha clínica, presupuestos y cobros con estados.",
  brand: { "@type": "Brand", name: "Novudent" },
  url: `${SITE_URL}/precios`,
  offers: PLANES.map((p) => ({
    "@type": "Offer", name: `Plan ${p.nombre}`, price: String(p.mensualGs), priceCurrency: "PYG",
    availability: "https://schema.org/InStock", url: `${SITE_URL}/precios`,
  })),
};

export default function PreciosPage() {
  return (
    <PaginaSeccion
      activa="/precios"
      etiqueta="Precios"
      titulo="Planes y precios en guaraníes, según el tamaño de tu clínica"
      intro="Todos los planes incluyen agenda, ficha clínica, odontograma por superficies y presupuestos. El precio depende de cuántos profesionales atienden; la puesta en marcha incluye la migración de tus datos."
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SeccionPrecios />

      <section className="mt-20 sm:mt-28" aria-labelledby="titulo-tabla">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-lp-primary">Comparar planes</p>
          <h2 id="titulo-tabla" className="text-[clamp(1.8rem,3.6vw,2.4rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-lp-ink">
            Todo lo que incluye cada plan
          </h2>
        </div>
        <TablaPlanes />
      </section>

      <section className="mx-auto mt-20 max-w-3xl sm:mt-28" aria-labelledby="titulo-faq-precios">
        <h2 id="titulo-faq-precios" className="mb-8 text-center text-[clamp(1.8rem,3.6vw,2.4rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-lp-ink">
          Preguntas frecuentes
        </h2>
        <SeccionFaq />
      </section>
    </PaginaSeccion>
  );
}
