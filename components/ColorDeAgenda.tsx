"use client";
/** Color de agenda de cada persona del equipo (Administración › Usuarios y profesionales).
 *
 *  `SelectorDeColor`: la paleta de 8 colores (lib/coloresUsuario.ts) como un grupo de botones de opción. Son
 *  `<input type="radio">` de verdad con la apariencia sacada (no `sr-only`): el teclado (flechas, Tab) funciona solo.
 *  `ColorDeUsuario`: el círculo con las iniciales de la fila de cada persona; al tocarlo se abre la paleta debajo y
 *  elegir un color lo guarda al instante. Ocupa un lugar en la fila (`flex-wrap`) y la paleta pasa a la línea de abajo. */
import { useId, useState } from "react";
import { opcionesDeColor } from "@/lib/coloresUsuario";
import type { User } from "@/lib/types";

export function SelectorDeColor({ valor, onChange, aria }: { valor: string; onChange: (hex: string) => void; aria: string }) {
  const grupo = useId();
  return (
    <div role="radiogroup" aria-label={aria} className="flex flex-wrap items-center gap-2.5 p-1">
      {opcionesDeColor(valor).map((c) => (
        <input
          key={c.hex}
          type="radio"
          name={grupo}
          aria-label={c.nombre}
          title={c.nombre}
          checked={c.hex.toLowerCase() === valor.toLowerCase()}
          onChange={() => onChange(c.hex)}
          style={{ background: c.hex }}
          className="h-7 w-7 cursor-pointer appearance-none rounded-full outline-none ring-offset-2 transition-shadow hover:ring-2 hover:ring-clinic-border checked:ring-2 checked:ring-clinic-text focus-visible:ring-2 focus-visible:ring-azure-500"
        />
      ))}
    </div>
  );
}

export function ColorDeUsuario({ usuario, onCambiar }: { usuario: User; onCambiar: (hex: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const iniciales = usuario.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <>
      <button
        type="button"
        aria-expanded={abierto}
        aria-label={`Cambiar el color de agenda de ${usuario.name}`}
        title="Cambiar el color en la agenda"
        onClick={() => setAbierto(!abierto)}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold text-white outline-none ring-offset-2 transition-shadow hover:ring-2 hover:ring-clinic-border focus-visible:ring-2 focus-visible:ring-azure-500"
        style={{ background: usuario.color }}
      >
        {iniciales}
      </button>
      {abierto && (
        <div className="order-last flex basis-full flex-wrap items-center gap-x-3 rounded-xl bg-clinic-bg px-3 py-1.5">
          <span className="text-xs font-semibold text-clinic-muted">Color en la agenda</span>
          <SelectorDeColor valor={usuario.color} aria={`Color de agenda de ${usuario.name}`} onChange={onCambiar} />
        </div>
      )}
    </>
  );
}
