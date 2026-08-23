import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Sitemap del sitio público.
 *
 * Cada sección de la landing es también una PÁGINA con metadata propia (ver
 * components/landing/Chrome.tsx): eso es lo que hace crecer este archivo. Las
 * páginas por-token (reserva, firma, encuesta, pago, videoconsulta) quedan
 * fuera a propósito — ver robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const ahora = new Date();
  return [
    { url: SITE_URL, lastModified: ahora, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/odontograma`, lastModified: ahora, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/capacidades`, lastModified: ahora, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/como-se-trabaja`, lastModified: ahora, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/en-accion`, lastModified: ahora, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/precios`, lastModified: ahora, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/acceso`, lastModified: ahora, changeFrequency: "yearly", priority: 0.5 },
  ];
}
