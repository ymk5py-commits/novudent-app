"use client";
/** Capa de movimiento reutilizable (framer-motion) para todo Novudent.
 *  Objetivo: que las páginas se sientan coreografiadas y no estáticas —
 *  entrada al hacer scroll, escalonado de listas y transición entre rutas.
 *  TODO respeta `prefers-reduced-motion` (accesibilidad y mareo). */
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { usePathname } from "next/navigation";
import { useCallback, useRef, type ReactNode } from "react";

/** Curva ease-out-expo: arranca rápido y asienta suave. Sin rebote (el rebote
 *  es el tic de "animación genérica"). La misma curva del count-up del dashboard. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** framer-motion deja `will-change: transform` pegado al nodo cuando termina de
 *  animar. Un elemento con `will-change: transform` pasa a ser el bloque
 *  contenedor de sus descendientes `position: fixed` (CSS Will Change §3): los
 *  modales que viven adentro dejan de posicionarse contra la ventana y se
 *  posicionan contra la página. Se veía en el odontograma — el diálogo de
 *  Ajustes quedaba corrido hacia abajo y el backdrop no tapaba el header.
 *  Ya asentada la animación la pista de GPU no sirve para nada: la sacamos. */
function useDropWillChange() {
  const ref = useRef<HTMLDivElement>(null);
  const onAnimationComplete = useCallback(() => {
    if (ref.current) ref.current.style.willChange = "auto";
  }, []);
  return { ref, onAnimationComplete };
}

/** Aparición al entrar en viewport, una sola vez. Para secciones de una página. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  const wc = useDropWillChange();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      ref={wc.ref}
      onAnimationComplete={wc.onAnimationComplete}
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Contenedor que escalona la entrada de sus hijos <StaggerItem>.
 *  Útil para grillas (stats, tarjetas) donde el cascadeo lee como "hecho a mano". */
export function Stagger({
  children,
  className,
  gap = 0.07,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  const wc = useDropWillChange();
  return (
    <motion.div
      ref={wc.ref}
      onAnimationComplete={wc.onAnimationComplete}
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: "-60px" }}
      variants={{ show: { transition: { staggerChildren: reduce ? 0 : gap } } }}
    >
      {children}
    </motion.div>
  );
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** Hijo de <Stagger>. Hereda el delay escalonado del contenedor. */
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const wc = useDropWillChange();
  return (
    <motion.div ref={wc.ref} onAnimationComplete={wc.onAnimationComplete} className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

/** Transición de entrada al cambiar de ruta (App Router): re-monta por pathname,
 *  así cada página entra con un cross-fade suave en vez de un corte seco.
 *  Se cablea una sola vez en el Shell y cubre TODAS las páginas del dashboard. */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const wc = useDropWillChange();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      key={pathname}
      ref={wc.ref}
      onAnimationComplete={wc.onAnimationComplete}
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
