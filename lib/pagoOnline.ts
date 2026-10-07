/** El link de la pasarela de pago que pega la clínica (Configuración › Pago online). La página de pago del paciente
 *  (`/pagar/{cid}`) solo muestra «Pagar con tarjeta» si el link empieza con `https://`: un link guardado sin eso no
 *  figuraba y nadie se enteraba. Acá se normaliza y se avisa antes de guardar. Módulo PURO. */

export type LinkDePago = { ok: true; url: string } | { ok: false; error: string };

const EXPLICACION = "Pegá el link completo de tu pasarela, por ejemplo https://link.mercadopago.com.py/tu-clinica";

/** «link.mercadopago.com.py/aura» → «https://link.mercadopago.com.py/aura». Vacío es válido: es la forma de sacar el link. */
export function normalizarLinkDePago(texto: string): LinkDePago {
  const t = texto.trim();
  if (t === "") return { ok: true, url: "" };
  if (/^http:\/\//i.test(t)) return { ok: false, error: "El link tiene que empezar con https:// (con «s»): la página de pago no muestra links http." };
  const conEsquema = /^https:\/\//i.test(t) ? t : /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? null : `https://${t}`;
  if (conEsquema === null) return { ok: false, error: `Eso no es un link de pago. ${EXPLICACION}` };
  try {
    const u = new URL(conEsquema);
    // Un dominio de verdad tiene un punto y no tiene espacios: «hola» o «pagar con tarjeta» no son links.
    if (!/^[^\s.]+(\.[^\s.]+)+$/.test(u.hostname) || /\s/.test(t)) return { ok: false, error: `Eso no es un link de pago. ${EXPLICACION}` };
    return { ok: true, url: conEsquema };
  } catch {
    return { ok: false, error: `Eso no es un link de pago. ${EXPLICACION}` };
  }
}
