/* Canales de ayuda de Novum (el botón «Ayuda» de la barra superior): por dónde
 * una clínica le escribe al equipo de Novudent cuando algo no se entiende o
 * necesita saber algo.
 *
 * Los datos reales todavía no están: salen de variables de entorno PÚBLICAS, que
 * Next.js incrusta en el bundle al compilar (cambiarlas pide un nuevo deploy).
 * Nunca un secreto acá: lo ve cualquiera que abra la app. Un canal mal cargado
 * (un WhatsApp que no es un número, un correo sin @) se descarta, así el panel
 * nunca muestra un botón que no lleva a ningún lado. */

export interface CanalesSoporte {
  /** Solo dígitos, con código de país (595…): listo para wa.me. */
  whatsapp?: string;
  email?: string;
  /** Texto libre, p. ej. «Lunes a viernes de 8:00 a 18:00». */
  horario?: string;
}

/** Valida y normaliza lo que venga de las variables de entorno. */
export function canalesDesde(env: { whatsapp?: string; email?: string; horario?: string }): CanalesSoporte {
  const canales: CanalesSoporte = {};
  const digitos = (env.whatsapp ?? "").replace(/\D/g, "");
  // E.164: hasta 15 dígitos con el código de país; menos de 8 no es un número real.
  if (digitos.length >= 8 && digitos.length <= 15) canales.whatsapp = digitos;
  const email = (env.email ?? "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) canales.email = email;
  const horario = (env.horario ?? "").trim();
  if (horario) canales.horario = horario;
  return canales;
}

/* Referencias ESTÁTICAS a propósito: Next.js solo reemplaza `process.env.NEXT_PUBLIC_…`
 * escrito así, literal (ni desestructurado ni con una clave variable). */
export const SOPORTE: CanalesSoporte = canalesDesde({
  whatsapp: process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP,
  email: process.env.NEXT_PUBLIC_SOPORTE_EMAIL,
  horario: process.env.NEXT_PUBLIC_SOPORTE_HORARIO,
});

/** ¿Hay por dónde escribir? El horario solo no es un canal. */
export function haySoporte(c: CanalesSoporte): boolean {
  return !!(c.whatsapp || c.email);
}

type Quien = { clinica: string; usuario: string };

/** Primer mensaje prearmado: a Novum le dice de qué clínica es y quién escribe. */
export function mensajeSoporte({ clinica, usuario }: Quien): string {
  return `Hola, equipo de Novum. Soy ${usuario}, de ${clinica}. Tengo una consulta sobre Novudent: `;
}

/** `mailto:` con asunto y cuerpo prearmados. */
export function linkCorreoSoporte(email: string, quien: Quien): string {
  const asunto = `Consulta sobre Novudent — ${quien.clinica}`;
  return `mailto:${email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensajeSoporte(quien))}`;
}
