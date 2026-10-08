"use client";
/** Buscador de prestaciones del arancel: se escribe el código o parte del nombre y se elige de la lista. Con un arancel de cientos de
 *  servicios (el de una clínica real llega a miles de filas) un `<select>` con todos no se puede usar: acá se filtra mientras se
 *  escribe (sin importar tildes ni mayúsculas, todas las palabras tienen que aparecer) y se muestran de a pocos, los más parecidos
 *  primero (`buscarPrestaciones`). Al elegir una, se avisa con `onElegir` y el campo queda vacío para buscar la siguiente. */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { fmtGs } from "@/lib/store";
import { buscarPrestaciones, categoriaDe } from "@/lib/arancel";
import { CATEGORY_LABEL } from "@/lib/categorias";
import type { Procedure } from "@/lib/types";
import { inputCls } from "@/components/ui";

/** Cuántas se muestran a la vez: el resto se alcanza escribiendo más. */
const MAXIMO = 30;

export function BuscadorPrestacion({ procs, onElegir, etiqueta = "Buscar prestación", placeholder = "Escribí el código o el nombre…", mostrarPrecio = true, excluir }: {
  procs: Procedure[];
  onElegir: (p: Procedure) => void;
  /** Nombre accesible del campo. */
  etiqueta?: string;
  placeholder?: string;
  /** Con `false` no se ve el precio (el dentista arma el plan sin ver montos). */
  mostrarPrecio?: boolean;
  /** Códigos que no se ofrecen (los que ya se eligieron). */
  excluir?: ReadonlySet<string>;
}) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const { visibles, total } = useMemo(() => buscarPrestaciones(procs, texto, MAXIMO, excluir), [procs, texto, excluir]);

  const elegir = (i: number) => {
    const p = visibles[i];
    if (!p) return;
    onElegir(p);
    setTexto("");
    setActivo(0);
    setAbierto(false);
    campo.current?.focus();
  };

  if (procs.length === 0) {
    return <p className="rounded-xl bg-clinic-bg px-3 py-2.5 text-xs text-clinic-muted">Todavía no hay prestaciones cargadas. Se cargan en Configuración › Arancel de precios (a mano o desde un Excel).</p>;
  }

  return (
    <div ref={caja} className="relative">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
        <input
          ref={campo}
          role="combobox"
          aria-label={etiqueta}
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={abierto && visibles.length > 0 ? `${id}-op-${activo}` : undefined}
          autoComplete="off"
          className={`${inputCls} pl-9`}
          placeholder={placeholder}
          value={texto}
          onFocus={() => setAbierto(true)}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true); setActivo(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setActivo((a) => Math.min(visibles.length - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter" && abierto && visibles.length > 0) { e.preventDefault(); elegir(activo); }
            else if (e.key === "Escape" && abierto) { e.stopPropagation(); setAbierto(false); }
          }}
        />
      </div>
      {abierto && (
        <ul id={`${id}-lista`} role="listbox" aria-label="Prestaciones del arancel" className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-clinic-border bg-white py-1 shadow-pop">
          {visibles.length === 0 && <li className="px-3 py-2 text-xs text-clinic-muted">No hay prestaciones con ese código o nombre.</li>}
          {visibles.map((p, i) => (
            <li
              key={p.cpt}
              id={`${id}-op-${i}`}
              role="option"
              aria-selected={i === activo}
              onMouseDown={(e) => { e.preventDefault(); elegir(i); }}
              onMouseEnter={() => setActivo(i)}
              className={`flex cursor-pointer items-baseline gap-2 px-3 py-2 text-sm ${i === activo ? "bg-azure-50 text-azure-800" : "text-clinic-text"}`}
            >
              <b className="shrink-0 tabular-nums text-xs">{p.cpt}</b>
              <span className="min-w-0 flex-1 truncate">{p.description}</span>
              <span className="hidden shrink-0 text-[11px] text-clinic-muted sm:inline">{CATEGORY_LABEL[categoriaDe(p)]}</span>
              {mostrarPrecio && <span className="shrink-0 tabular-nums text-xs font-bold">{fmtGs(p.price)}</span>}
            </li>
          ))}
          {total > visibles.length && (
            <li aria-hidden className="border-t border-clinic-border px-3 py-1.5 text-[11px] text-clinic-muted">Mostrando {visibles.length} de {total}: escribí más para acotar.</li>
          )}
        </ul>
      )}
    </div>
  );
}
