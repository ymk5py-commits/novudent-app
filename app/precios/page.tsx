import type { Metadata } from "next";
import { PaginaSeccion } from "@/components/landing/Chrome";
import { SeccionPrecios } from "@/components/Landing";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Precios y planes — Solo, Clínica y Cadena",
  description:
    "Plan Solo $45/mes (1 sillón), Plan Clínica $129/mes (hasta 5 sillones, el más elegido) y Plan Cadena a medida. Sin contratos largos, migración de datos incluida y 30 días de prueba.",
  alternates: { canonical: "/precios" },
};

/** Ofertas como JSON-LD también en la página de precios (además de la home). */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Novudent — Software de gestión odontológica",
  description:
    "Software dental completo: agenda, odontograma FDI, ficha clínica, presupuestos y facturación con estados. Prueba gratuita de 30 días.",
  brand: { "@type": "Brand", name: "Novudent" },
  url: `${SITE_URL}/precios`,
  offers: [
    { "@type": "Offer", name: "Plan Solo", price: "45", priceCurrency: "USD", availability: "https://schema.org/InStock", url: `${SITE_URL}/precios` },
    { "@type": "Offer", name: "Plan Clínica", price: "129", priceCurrency: "USD", availability: "https://schema.org/InStock", url: `${SITE_URL}/precios` },
  ],
};

export default function PreciosPage() {
  return (
    <PaginaSeccion
      activa="/precios"
      etiqueta="Precios"
      titulo={<>Un precio claro por clínica, <span className="text-sv-mint">no por usuario</span>.</>}
      intro="Todos los planes incluyen odontograma, agenda, ficha clínica y soporte. Los usuarios que necesites, dentro del plan. Empezás con 30 días gratis y migración de datos sin costo."
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SeccionPrecios />
    </PaginaSeccion>
  );
}
