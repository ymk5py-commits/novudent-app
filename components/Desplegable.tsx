"use client";
/** Menú o panel flotante anclado a un botón. Se dibuja en un portal con posición fija,
 *  así no lo corta una tabla con scroll (`overflow-x-auto`) ni la tapa la fila de abajo:
 *  era el problema de los menús de estado y de ⋮ en la agenda (revisión del 27/9/2026).
 *  Se abre hacia abajo y, si no entra, hacia arriba; si no entra ni en uno ni en otro (muchos
 *  estados de cita propios en una ventana baja) se achica al lugar que hay y se recorre con
 *  scroll dentro del propio menú — la cuenta está en `lib/ubicarPanel.ts`. Cierra con Escape o
 *  con un clic afuera. Con scroll acompaña al botón (en el celular la tabla se desplaza de
 *  costado al tocarlo), se reubica al cambiar el tamaño de la ventana y se cierra solo si el
 *  botón sale de la pantalla. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Portal } from "@/components/ui";
import { ubicarPanel, type Ubicacion } from "@/lib/ubicarPanel";

export function Desplegable({ ancla, abierto, onCerrar, children, ancho = 200, alinear = "izquierda", etiqueta }: {
  ancla: RefObject<HTMLElement | null>;
  abierto: boolean;
  onCerrar: () => void;
  children: ReactNode;
  /** Ancho en px del panel (menos si la ventana es más angosta). */
  ancho?: number;
  alinear?: "izquierda" | "derecha";
  /** Nombre accesible del panel. */
  etiqueta?: string;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  // El panel vive en un portal que se monta un render DESPUÉS de abrir: guardarlo también en el estado hace que, apenas existe,
  // se vuelva a ubicar con su alto real (la primera cuenta usa una estimación).
  const [panelMontado, setPanelMontado] = useState<HTMLDivElement | null>(null);
  const refPanel = useCallback((el: HTMLDivElement | null) => { panel.current = el; setPanelMontado(el); }, []);
  const [pos, setPos] = useState<Ubicacion | null>(null);

  /** Ubica el panel pegado al botón. Devuelve false si el botón ya no está en pantalla. */
  const ubicar = useCallback(() => {
    if (!ancla.current) return false;
    const r = ancla.current.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return false;
    const p = panel.current;
    // Alto que tendría sin ningún tope: el de su contenido (`scrollHeight`) más los bordes. Sin panel todavía, una estimación.
    const alto = p ? p.scrollHeight + (p.offsetHeight - p.clientHeight) : 240;
    const nueva = ubicarPanel({ ancla: r, alto, ancho, alinear, ventana: { ancho: window.innerWidth, alto: window.innerHeight } });
    // Con scroll esto corre muy seguido: si no se movió nada, no se vuelve a dibujar.
    setPos((vieja) => (vieja && vieja.top === nueva.top && vieja.left === nueva.left && vieja.ancho === nueva.ancho && vieja.altoMax === nueva.altoMax ? vieja : nueva));
    return true;
  }, [ancla, ancho, alinear]);

  useLayoutEffect(() => {
    if (!abierto) { setPos(null); return; }
    ubicar();
  }, [abierto, ubicar, panelMontado]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || ancla.current?.contains(t)) return;
      onCerrar();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { onCerrar(); ancla.current?.focus(); } };
    const mover = (e: Event) => {
      // En `resize` el objetivo del evento es `window`, que no es un Node: `contains(window)` tira un TypeError.
      if (e.target instanceof Node && panel.current?.contains(e.target)) return; // scroll dentro del propio panel
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
        ref={refPanel}
        role="menu"
        aria-label={etiqueta}
        style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.ancho ?? ancho, maxHeight: pos?.altoMax }}
        className="z-[60] overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border border-clinic-border bg-white py-1 text-left text-sm shadow-pop"
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
