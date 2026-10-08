import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { PAGINAS_PUBLICAS } from "@/lib/seo";

/**
 * Sitemap del sitio público.
 *
 * Sale de `PAGINAS_PUBLICAS` (lib/seo.ts), con la fecha en que cambió el contenido de cada página: antes era la del pedido, y un sitemap
 * que dice «todo cambió hoy» siempre deja de ser creíble para Google. Las páginas por-token (reserva, firma, encuesta, pago,
 * videoconsulta) y el panel quedan fuera a propósito — ver robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGINAS_PUBLICAS.map((p) => ({
    url: p.ruta === "/" ? SITE_URL : `${SITE_URL}${p.ruta}`,
    lastModified: p.actualizado,
    changeFrequency: p.frecuencia,
    priority: p.prioridad,
  }));
}
