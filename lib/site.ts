/**
 * Dominio canónico del sitio, en un solo lugar.
 *
 * Sin esto no había `metadataBase`, así que Next.js no emitía ni `<link rel=
 * "canonical">` ni `og:url` absolutos: Google indexaba por su cuenta y se
 * quedaba con la URL de Vercel (`novudent-app.vercel.app`) en vez del dominio
 * propio. Fijar el canonical al dominio propio en TODAS las páginas —incluso en
 * las que responden también por la .vercel.app— le dice a Google que consolide
 * el ranking en un único lugar.
 *
 * Se puede sobreescribir por env (`NEXT_PUBLIC_SITE_URL`) para el día que el
 * dominio cambie, sin tocar código. El valor NO lleva barra final.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://novudent.novumholding.lat").replace(/\/$/, "");

export const SITE_NAME = "Novudent";
