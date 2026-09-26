/** Rutas del sitio público — fuente única para nav, pie, cross-links y páginas legales.
 *
 *  En módulo PLANO a propósito (como lib/faqs.ts): un array exportado desde un
 *  archivo "use client" llega como client reference a los Server Components, y
 *  `.map()` revienta en el build. Agregar acá = aparecer en todos lados. */
export const RUTAS_PUBLICAS = [
  { href: "/como-se-trabaja", label: "Cómo se trabaja" },
  { href: "/odontograma", label: "Odontograma" },
  { href: "/capacidades", label: "Capacidades" },
  { href: "/en-accion", label: "En acción" },
  { href: "/precios", label: "Precios" },
] as const;

export const RUTAS_LEGALES = [
  { href: "/privacidad", label: "Privacidad" },
  { href: "/terminos", label: "Términos de uso" },
  { href: "/cookies", label: "Cookies" },
] as const;
