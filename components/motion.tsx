"use client";
/** Capa de movimiento reutilizable (framer-motion) para todo Novudent.
 *  Objetivo: que las páginas se sientan coreografiadas y no estáticas —
 *  entrada al hacer scroll, escalonado de listas y transición entre rutas.
 *  TODO respeta `prefers-reduced-motion` (accesibilidad y mareo). */
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Curva ease-out-expo: arranca rápido y asienta suave. Sin rebote (el rebote
 *  es el tic de "animación genérica"). La misma curva del count-up del dashboard. */
export const EASE = [0.16, 1, 0.3, 1] as const;

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
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
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
  return (
    <motion.div
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
  return (
    <motion.div className={className} variants={itemVariants}>
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
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      key={pathname}
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
