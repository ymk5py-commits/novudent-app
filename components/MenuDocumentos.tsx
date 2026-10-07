"use client";
/** «Documentos ▾» de la Ficha clínica (como Dentalink): un solo botón en la barra de pestañas
 *  que abre un menú con Consentimientos y Documentos clínicos. Queda activo cuando la pestaña
 *  elegida es una de las dos, y muestra cuántos documentos pendientes tiene el paciente. */
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Desplegable, ItemMenu } from "@/components/Desplegable";

export function MenuDocumentos({ opciones, actual, onElegir, pendientes }: {
  opciones: { key: string; label: string }[];
  actual: string;
  onElegir: (key: string) => void;
  pendientes: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const ancla = useRef<HTMLButtonElement>(null);
  if (opciones.length === 0) return null;
  const activa = opciones.some((o) => o.key === actual);
  return (
    <>
      <button
        ref={ancla}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className={`-mb-px flex items-center gap-1.5 rounded-none border-b-2 px-3 py-2 text-[13px] font-normal transition-colors ${
          activa ? "border-azure-600 text-azure-700" : "border-transparent text-clinic-text hover:text-azure-600"
        }`}
      >
        Documentos
        {pendientes > 0 && <span className="rounded-full bg-state-warn px-1.5 text-[11px] font-bold text-white">{pendientes}</span>}
        <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      <Desplegable ancla={ancla} abierto={abierto} onCerrar={() => setAbierto(false)} ancho={200} etiqueta="Documentos">
        {opciones.map((o) => (
          <ItemMenu key={o.key} onClick={() => { setAbierto(false); onElegir(o.key); }}>
            <span className={o.key === actual ? "font-bold text-azure-700" : ""}>{o.label}</span>
          </ItemMenu>
        ))}
      </Desplegable>
    </>
  );
}
