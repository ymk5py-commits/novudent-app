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

/** WhatsApp de ventas, solo dígitos con código de país (ej. 595981123456). Sin número cargado en
 *  NEXT_PUBLIC_WHATSAPP_VENTAS, el botón no aparece: nunca un número inventado. */
export const WHATSAPP_VENTAS = (process.env.NEXT_PUBLIC_WHATSAPP_VENTAS || "").replace(/\D/g, "");

/** Correo para consultas de privacidad y datos personales (NEXT_PUBLIC_CONTACTO_LEGAL). Sin él, las
 *  páginas legales mandan al formulario de /acceso. */
export const CONTACTO_LEGAL = process.env.NEXT_PUBLIC_CONTACTO_LEGAL || "";

export const linkWhatsApp = (texto = "Hola, quiero ver Novudent funcionando en mi clínica.") =>
  WHATSAPP_VENTAS ? `https://wa.me/${WHATSAPP_VENTAS}?text=${encodeURIComponent(texto)}` : "";
