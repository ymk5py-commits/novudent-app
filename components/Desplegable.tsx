"use client";
/** Menú o panel flotante anclado a un botón. Se dibuja en un portal con posición fija,
 *  así no lo corta una tabla con scroll (`overflow-x-auto`) ni la tapa la fila de abajo:
 *  era el problema de los menús de estado y de ⋮ en la agenda (revisión del 27/9/2026).
 *  Se abre hacia abajo y, si no entra, hacia arriba. Cierra con Escape o con un clic
 *  afuera. Con scroll acompaña al botón (en el celular la tabla se desplaza de costado al
 *  tocarlo) y se cierra solo si el botón sale de la pantalla. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Portal } from "@/components/ui";

export function Desplegable({ ancla, abierto, onCerrar, children, ancho = 200, alinear = "izquierda", etiqueta }: {
  ancla: RefObject<HTMLElement | null>;
  abierto: boolean;
  onCerrar: () => void;
  children: ReactNode;
  /** Ancho en px del panel. */
  ancho?: number;
  alinear?: "izquierda" | "derecha";
  /** Nombre accesible del panel. */
  etiqueta?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  /** Ubica el panel pegado al botón. Devuelve false si el botón ya no está en pantalla. */
  const ubicar = useCallback(() => {
    if (!ancla.current) return false;
    const r = ancla.current.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return false;
    const alto = panel.current?.offsetHeight ?? 240;
    const abajo = r.bottom + 6;
    const top = abajo + alto > window.innerHeight - 8 && r.top - alto - 6 > 8 ? r.top - alto - 6 : abajo;
    let left = alinear === "derecha" ? r.right - ancho : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - ancho - 8));
    setPos({ top, left });
    return true;
  }, [ancla, ancho, alinear]);

  useLayoutEffect(() => {
    if (!abierto) { setPos(null); return; }
    ubicar();
  }, [abierto, ubicar]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || ancla.current?.contains(t)) return;
      onCerrar();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { onCerrar(); ancla.current?.focus(); } };
    const mover = (e: Event) => {
      if (panel.current?.contains(e.target as Node)) return; // scroll dentro del propio panel
      if (!ubicar()) onCerrar();
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", mover, true);
    window.addEventListener("resize", mover);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", mover, true);
      window.removeEventListener("resize", mover);
    };
  }, [abierto, ancla, onCerrar, ubicar]);

  if (!abierto) return null;
  return (
    <Portal>
      <div
        ref={panel}
        role="menu"
        aria-label={etiqueta}
        style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: ancho }}
        className="z-[60] overflow-hidden rounded-xl border border-clinic-border bg-white py-1 text-left text-sm shadow-pop"
      >
        {children}
      </div>
    </Portal>
  );
}

/** Ítem de menú de `Desplegable`. */
export function ItemMenu({ onClick, children, peligro, deshabilitado, titulo }: {
  onClick: () => void; children: ReactNode; peligro?: boolean; deshabilitado?: boolean; titulo?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={deshabilitado}
      title={titulo}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${peligro ? "text-state-err hover:bg-state-errbg" : "text-clinic-text hover:bg-clinic-bg"}`}
    >
      {children}
    </button>
  );
}
