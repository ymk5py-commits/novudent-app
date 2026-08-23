import Landing from "@/components/Landing";
import { SITE_URL } from "@/lib/site";
import { FAQS } from "@/lib/faqs";

/* La home es un Server Component para emitir el JSON-LD en el HTML que Google
   lee de una. <Landing/> sigue siendo cliente (usa estado/sesión) — Next lo
   prerenderiza igual, así que el contenido es indexable sin ejecutar JS. */

/** Datos estructurados: Organization + SoftwareApplication con las ofertas +
 *  FAQPage (mismas preguntas que la sección visible — requisito de Google). */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "Novudent",
      url: SITE_URL,
      parentOrganization: { "@type": "Organization", name: "NOVUM Holding" },
      areaServed: "PY",
      description:
        "Software de gestión para clínicas dentales: agenda, odontograma FDI, ficha clínica y facturación. Hecho en Paraguay por NOVUM.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#web`,
      url: SITE_URL,
      name: "Novudent",
      inLanguage: "es",
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: "Novudent",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Software de gestión odontológica",
      operatingSystem: "Web",
      url: SITE_URL,
      description:
        "Agenda inteligente, odontograma por superficies FDI, ficha clínica, presupuestos y facturación con estados para clínicas dentales.",
      publisher: { "@id": `${SITE_URL}/#org` },
      offers: [
        { "@type": "Offer", name: "Plan Solo", price: "45", priceCurrency: "USD", url: `${SITE_URL}/precios` },
        { "@type": "Offer", name: "Plan Clínica", price: "129", priceCurrency: "USD", url: `${SITE_URL}/precios` },
      ],
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Landing />
    </>
  );
}
