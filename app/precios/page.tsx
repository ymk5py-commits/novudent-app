import type { Metadata } from "next";
import { PaginaSeccion } from "@/components/landing/Chrome";
import { SeccionPrecios } from "@/components/Landing";
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
      titulo="Un precio claro por clínica, en guaraníes."
      intro="Todos los planes incluyen agenda, ficha clínica, odontograma por superficies y presupuestos. El precio depende de cuántos profesionales atienden; la puesta en marcha incluye la migración de tus datos."
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SeccionPrecios />
    </PaginaSeccion>
  );
}
