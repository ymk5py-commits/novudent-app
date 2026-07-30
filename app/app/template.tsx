"use client";
/** Punto de re-montaje por ruta del panel (Next.js `template.tsx`).
 *
 *  La transición de entrada NO va acá: la hace `<PageTransition>` en el Shell,
 *  que además respeta `prefers-reduced-motion`. Acá había un `motion.div`
 *  duplicado que animaba lo mismo por encima y traía dos problemas:
 *
 *  1. Ignoraba `prefers-reduced-motion` — animaba igual para quien pidió no
 *     tener animaciones.
 *  2. framer-motion le dejaba `will-change: transform` pegado al terminar, y un
 *     elemento con `will-change: transform` pasa a ser el bloque contenedor de
 *     sus descendientes `position: fixed` (CSS Will Change §3). Resultado: TODO
 *     modal de la app se posicionaba contra la página en vez de contra la
 *     ventana. Se veía claro en el odontograma — el diálogo de Ajustes quedaba
 *     corrido hacia abajo y su backdrop no llegaba a tapar el header.
 *
 *  El archivo se conserva porque `template.tsx` es lo que fuerza el re-montaje
 *  del árbol en cada navegación; simplemente ya no envuelve en nada.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
