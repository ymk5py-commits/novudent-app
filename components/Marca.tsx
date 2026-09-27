/** Logotipo e isologo de Novudent como SVG en línea (sin fuentes ni archivos).
 *  Los trazos y colores viven en lib/marca.ts. El tamaño lo da la altura: pasale
 *  `className="h-8 w-auto"` y el ancho sale solo. */
import { useId } from "react";
import { ISO, LOGO, isoInterno, PALABRA, tintaDe, type Tono } from "@/lib/marca";

/** «NOVUdent» con el diente. `tono`: "color" sobre claro, "blanco" sobre navy,
 *  "negro" para impresión en blanco y negro. */
export function Logotipo({ tono = "color", className = "h-8 w-auto", titulo = "Novudent" }: { tono?: Tono; className?: string; titulo?: string }) {
  const id = useId().replace(/:/g, "");
  const t = tintaDe(tono);
  const { x, y, escala } = LOGO.iso;
  return (
    <svg viewBox={LOGO.viewBox} className={className} role="img" aria-label={titulo}>
      <path fill={t} d={PALABRA.novu} />
      <path fill={t} d={PALABRA.dent} />
      <g transform={`translate(${x} ${y}) scale(${escala})`} dangerouslySetInnerHTML={{ __html: isoInterno(tono, `lg${id}`) }} />
    </svg>
  );
}

/** Solo el diente. Decorativo por defecto (sin `titulo`). */
export function Isologo({ tono = "color", className = "h-8 w-auto", titulo }: { tono?: Tono; className?: string; titulo?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox={`0 0 ${ISO.ancho} ${ISO.alto}`}
      className={className}
      {...(titulo ? { role: "img", "aria-label": titulo } : { "aria-hidden": true })}
      dangerouslySetInnerHTML={{ __html: isoInterno(tono, `is${id}`) }}
    />
  );
}
