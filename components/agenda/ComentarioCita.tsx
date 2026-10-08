"use client";
/** Comentario de la cita: vista rápida en un globo. Sin comentario no se muestra. Lo usan la agenda (Diaria, Diaria global,
 *  Reprogramación) y la grilla semanal. */
import { useRef, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { Desplegable } from "@/components/Desplegable";

export function ComentarioCita({ texto, className = "" }: { texto?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  if (!texto?.trim()) return null;
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label="Ver el comentario de la cita"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={`inline-grid h-6 w-6 place-items-center rounded-md text-azure-700 hover:bg-azure-50 ${className}`}
      >
        <MessageSquareText className="h-3.5 w-3.5" />
      </button>
      <Desplegable ancla={ref} abierto={open} onCerrar={() => setOpen(false)} ancho={260} etiqueta="Comentario de la cita">
        <p className="whitespace-pre-wrap px-3 py-2 text-sm text-clinic-text">{texto}</p>
      </Desplegable>
    </>
  );
}
