import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Sitemap. Hoy el sitio público es una sola página (la landing con sus anclas
 * internas). El panel y las páginas por-token quedan fuera a propósito — ver
 * robots.ts. Cuando haya páginas públicas nuevas (precios, blog, casos), se
 * suman acá.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
