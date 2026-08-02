/** Constantes compartidas del seguro anti-página-en-blanco.
 *
 *  Viven en un módulo PLANO —sin `"use client"`— a propósito: `app/layout.tsx`
 *  es un Server Component y las interpola dentro de un script inline. Si se
 *  importan desde un archivo marcado `"use client"`, Next las convierte en
 *  proxies de referencia de cliente y al interpolarlas sale literalmente
 *  `[object Object]` en el HTML — el build pasa igual, y el seguro queda roto
 *  en silencio. Ya pasó una vez; por eso están acá.
 *
 *  El mecanismo completo está documentado en components/HydrationGuard.tsx. */

/** Marca que el script inline le pone a <html> si React no hidrató a tiempo.
 *  La consume la regla `html.motion-fallback [style*="opacity:0"]` de
 *  app/globals.css. */
export const MOTION_FALLBACK_CLASS = "motion-fallback";

/** Cuánto se espera antes de dar la hidratación por perdida. Generoso a
 *  propósito: una hidratación lenta en 3G tiene que ganarle al temporizador.
 *  Solo queremos atrapar el caso "el bundle no va a llegar nunca". */
export const HYDRATION_GRACE_MS = 4000;
