"use client";
/** Seguro contra la página en blanco.
 *
 *  EL PROBLEMA. `Reveal`/`Stagger` (components/motion.tsx) usan `whileInView`
 *  con `initial opacity 0`, y framer-motion SERIALIZA ese estado inicial en el
 *  HTML del servidor: la landing sale con ~27 nodos en `opacity:0`. Eso está
 *  bien mientras el JS hidrate — framer toma el control y los revela. Pero si
 *  el bundle no llega (red mala, CDN caída, un proxy que lo corta), el navegador
 *  se queda con ese HTML para siempre y el usuario ve una página VACÍA. No un
 *  sitio feo: vacío. En una landing eso es una venta perdida; en /firmar es un
 *  paciente que no puede leer el consentimiento que vino a firmar.
 *
 *  Importa de verdad acá: Novudent apunta a Paraguay y la región, donde el
 *  celular con señal irregular es el caso normal, no el borde.
 *
 *  CÓMO FUNCIONA. Un script inline en el layout arranca un temporizador apenas
 *  parsea el HTML. Si React hidrata a tiempo, este componente lo cancela y todo
 *  sigue como siempre. Si no hidrata, el temporizador marca <html> y una regla
 *  CSS fuerza a visible todo lo que haya quedado en opacity:0.
 *
 *  DETALLE QUE IMPORTA: si el temporizador YA disparó, este componente NO saca
 *  la marca. A alguien que ya está viendo el contenido no se le esconde para
 *  animárselo — perdería el texto de abajo del cursor. Se pierden las
 *  animaciones de esa carga y no pasa nada; el contenido es lo que importa.
 */
import { useEffect } from "react";
import { MOTION_FALLBACK_CLASS } from "@/lib/motion-fallback";

/** Cuánto se espera, ya hidratado, antes de revisar si el revelado por scroll
 *  realmente funcionó. Holgado: la animación de entrada dura 0,55 s, así que
 *  a los 6 s cualquier cosa dentro del viewport ya tendría que estar visible. */
const OBSERVER_CHECK_MS = 6000;

export default function HydrationGuard() {
  useEffect(() => {
    const w = window as unknown as { __novudentMotionTimer?: number };
    if (w.__novudentMotionTimer !== undefined) {
      clearTimeout(w.__novudentMotionTimer);
      w.__novudentMotionTimer = undefined;
    }
    // A propósito NO se remueve MOTION_FALLBACK_CLASS: ver la nota de arriba.

    /* TERCER MODO DE FALLA: hidrata bien, pero el IntersectionObserver no
       dispara. Lo vi pasar en un navegador basado en Chromium — el objeto
       existe, así que detectar la feature no sirve de nada; simplemente nunca
       llama al callback. `whileInView` depende de él, o sea que el contenido
       se queda invisible para siempre igual que si el bundle no hubiera
       llegado.
       La evidencia es inequívoca y no hace falta adivinar: si algo sigue en
       `opacity:0` estando DENTRO del viewport, el revelado está roto. Lo que
       está abajo del pliegue no se toca — ese sí tiene que esperar su scroll. */
    const t = window.setTimeout(() => {
      const atascado = Array.from(document.querySelectorAll<HTMLElement>('[style*="opacity:0"]')).some((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
      });
      if (atascado) document.documentElement.classList.add(MOTION_FALLBACK_CLASS);
    }, OBSERVER_CHECK_MS);
    return () => clearTimeout(t);
  }, []);
  return null;
}
