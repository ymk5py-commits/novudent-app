/** SEO del sitio público (frente E, 8-oct-2026): qué páginas se indexan, la miga de pan para los buscadores y la verificación de Search
 *  Console / Bing. El panel y las páginas por link NO se indexan (`noindex` en sus layouts y `disallow` en app/robots.ts).
 *  Tests: lib/seo.test.ts. */
import type { Metadata } from "next";
import { SITE_URL } from "./site";

export interface PaginaPublica {
  ruta: string;
  /** Nombre corto (la miga de pan). */
  nombre: string;
  prioridad: number;
  frecuencia: "weekly" | "monthly" | "yearly";
  /** Último cambio de su CONTENIDO (AAAA-MM-DD). Al cambiar una página pública, actualizá esta fecha: el sitemap le dice a Google cuándo
   *  cambió cada una (antes era la fecha de cada pedido, o sea «todo cambia siempre», y Google deja de creerle). */
  actualizado: string;
}

/** Lo que se indexa: el sitemap sale de acá (app/sitemap.ts). */
export const PAGINAS_PUBLICAS: PaginaPublica[] = [
  { ruta: "/", nombre: "Inicio", prioridad: 1, frecuencia: "weekly", actualizado: "2026-10-08" },
  { ruta: "/odontograma", nombre: "Odontograma", prioridad: 0.9, frecuencia: "monthly", actualizado: "2026-09-27" },
  { ruta: "/capacidades", nombre: "Capacidades", prioridad: 0.9, frecuencia: "monthly", actualizado: "2026-09-26" },
  { ruta: "/como-se-trabaja", nombre: "Cómo se trabaja", prioridad: 0.8, frecuencia: "monthly", actualizado: "2026-09-27" },
  { ruta: "/en-accion", nombre: "En acción", prioridad: 0.7, frecuencia: "monthly", actualizado: "2026-09-27" },
  { ruta: "/precios", nombre: "Precios", prioridad: 0.9, frecuencia: "monthly", actualizado: "2026-09-27" },
  { ruta: "/acceso", nombre: "Pedir acceso", prioridad: 0.5, frecuencia: "yearly", actualizado: "2026-09-27" },
  { ruta: "/privacidad", nombre: "Privacidad", prioridad: 0.2, frecuencia: "yearly", actualizado: "2026-09-26" },
  { ruta: "/terminos", nombre: "Términos", prioridad: 0.2, frecuencia: "yearly", actualizado: "2026-09-26" },
  { ruta: "/cookies", nombre: "Cookies", prioridad: 0.2, frecuencia: "yearly", actualizado: "2026-09-26" },
];

/** La miga de pan de una página interna como dato estructurado (Inicio › la página): Google la muestra en el resultado en vez de la URL. */
export function jsonLdMigas(nombre: string, ruta: string, base: string = SITE_URL) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${base}/` },
      { "@type": "ListItem", position: 2, name: nombre, item: `${base}${ruta}` },
    ],
  };
}

/** La verificación del dominio en Google Search Console y Bing Webmaster Tools: sale de variables de entorno de Vercel
 *  (`GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, el valor de `content` que dan ellos). Sin variables no emite nada. */
export function verificacionDeBuscadores(env: Record<string, string | undefined>): Metadata["verification"] | undefined {
  const google = env.GOOGLE_SITE_VERIFICATION?.trim();
  const bing = env.BING_SITE_VERIFICATION?.trim();
  if (!google && !bing) return undefined;
  return { ...(google ? { google } : {}), ...(bing ? { other: { "msvalidate.01": bing } } : {}) };
}
