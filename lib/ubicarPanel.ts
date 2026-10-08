/* Dónde va un menú flotante (`components/Desplegable`) respecto del botón que lo abre. Geometría pura, para poder probarla.
 *
 * Lo que no puede pasar nunca: que una parte del menú quede fuera de la pantalla sin forma de llegar a ella. Con estados de cita
 * propios y una ventana de 760 px de alto, los últimos estados quedaban fuera y no se podían tocar. Si el menú no entra entero
 * ni abajo ni arriba del botón, se queda del lado con más lugar, se achica hasta ese lugar (`altoMax`) y el resto se recorre
 * con scroll dentro del propio menú. */

/** Los bordes del botón en pantalla (`getBoundingClientRect`). */
export interface RectAncla { top: number; bottom: number; left: number; right: number }

export interface Ubicacion {
  top: number;
  left: number;
  /** Ancho final: el pedido, o menos si la ventana es más angosta. */
  ancho: number;
  /** Alto máximo del menú: con más contenido que esto, tiene scroll. */
  altoMax: number;
}

/** Aire que se deja contra el borde de la ventana. */
const MARGEN = 8;
/** Separación entre el botón y el menú. */
const SEPARACION = 6;
/** Menos que esto de lugar libre a un lado no sirve para un menú (una rendija): se usa toda la ventana. */
const ALTO_MINIMO_UTIL = 160;

export function ubicarPanel(args: {
  ancla: RectAncla;
  /** Alto que tendría el menú sin ningún tope (el de su contenido). */
  alto: number;
  /** Ancho pedido. */
  ancho: number;
  alinear: "izquierda" | "derecha";
  ventana: { ancho: number; alto: number };
}): Ubicacion {
  const { ancla, alto, alinear, ventana } = args;

  // Horizontal: nunca más ancho que la ventana (girar el celular la angosta con el menú abierto) y siempre adentro.
  const ancho = Math.min(args.ancho, Math.max(0, ventana.ancho - 2 * MARGEN));
  const pegado = alinear === "derecha" ? ancla.right - ancho : ancla.left;
  const left = Math.max(MARGEN, Math.min(pegado, ventana.ancho - ancho - MARGEN));

  // Vertical: lugar libre debajo y encima del botón.
  const libreAbajo = ventana.alto - ancla.bottom - SEPARACION - MARGEN;
  const libreArriba = ancla.top - SEPARACION - MARGEN;

  if (alto <= libreAbajo) return { top: ancla.bottom + SEPARACION, left, ancho, altoMax: libreAbajo };
  if (alto <= libreArriba) return { top: ancla.top - SEPARACION - alto, left, ancho, altoMax: libreArriba };

  // No entra entero: lo más cómodo es el lado con más lugar, con scroll.
  if (Math.max(libreAbajo, libreArriba) < ALTO_MINIMO_UTIL) {
    // Ventana muy baja (un celular de costado): mejor usar toda la ventana, lo más cerca del botón que se pueda.
    const altoMax = Math.max(0, ventana.alto - 2 * MARGEN);
    const real = Math.min(alto, altoMax);
    const top = Math.max(MARGEN, Math.min(ancla.bottom + SEPARACION, ventana.alto - MARGEN - real));
    return { top, left, ancho, altoMax };
  }
  if (libreAbajo >= libreArriba) return { top: ancla.bottom + SEPARACION, left, ancho, altoMax: libreAbajo };
  return { top: MARGEN, left, ancho, altoMax: libreArriba };
}
