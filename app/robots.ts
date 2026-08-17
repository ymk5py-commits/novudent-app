import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt generado por Next.
 *
 * Solo la landing es contenido público que queremos en Google. Todo lo demás se
 * bloquea del crawl: el panel (`/app`), el alta de clientes (`/superadmin`), la
 * API, y —importante por privacidad de pacientes— las páginas con datos por
 * link (reserva, firma de consentimiento, encuesta, pago, videoconsulta). Esas
 * llevan un `cid`/token en la URL; que un buscador las rastree filtraría PII.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/superadmin", "/api/", "/reservar/", "/firmar/", "/encuestas/", "/pagar/", "/videoconsulta/", "/login"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
