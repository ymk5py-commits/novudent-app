"use client";
/** Menú de un espacio bloqueado de la agenda (lib/bloqueos.ts): qué está bloqueado y «Quitar este bloqueo» o, si es parte de una
 *  repetición, «Quitar toda la serie» (con confirmación). Se abre al tocar el bloqueo en la semanal o en la Diaria global, o «Quitar» en la
 *  Diaria. Las citas que hay en ese horario no se tocan. */
import type { RefObject } from "react";
import { Lock, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { rangoDeBloqueo, TODOS_LOS_PROFESIONALES } from "@/lib/bloqueos";
import type { AgendaBlock } from "@/lib/types";
import { Desplegable, ItemMenu } from "@/components/Desplegable";

/** «Todos los profesionales» o el nombre del profesional bloqueado. */
export function quienBloquea(b: AgendaBlock, users: { id: string; name: string }[]): string {
  return b.dentistId === TODOS_LOS_PROFESIONALES ? "Todos los profesionales" : users.find((u) => u.id === b.dentistId)?.name ?? "Profesional";
}

export function MenuBloqueo({ bloqueo, ancla, onCerrar, onQuitar }: {
  /** El bloqueo tocado; `null` = cerrado. */
  bloqueo: AgendaBlock | null;
  ancla: RefObject<HTMLElement | null>;
  onCerrar: () => void;
  onQuitar: (ids: string[]) => void;
}) {
  const { db } = useStore();
  const serie = bloqueo?.serieId ? db.agendaBlocks.filter((b) => b.serieId === bloqueo.serieId) : [];
  const box = bloqueo?.boxId ? db.boxes.find((x) => x.id === bloqueo.boxId)?.name : undefined;
  return (
    <Desplegable ancla={ancla} abierto={!!bloqueo} onCerrar={onCerrar} ancho={260} etiqueta="Espacio bloqueado">
      {bloqueo && (
        <>
          <div className="px-3 pb-1.5 pt-2 text-[13px]">
            <p className="flex items-center gap-1.5 font-bold text-clinic-text"><Lock aria-hidden className="h-3.5 w-3.5 text-clinic-muted" /> Bloqueado · {rangoDeBloqueo(bloqueo)}</p>
            {bloqueo.reason && <p className="mt-0.5 text-clinic-text">{bloqueo.reason}</p>}
            <p className="mt-0.5 text-[12px] text-clinic-muted">{quienBloquea(bloqueo, db.users)}{box ? ` · ${box}` : ""}</p>
            {serie.length > 1 && <p className="mt-0.5 text-[12px] text-clinic-muted">Se repite: {serie.length} bloqueos en la serie.</p>}
          </div>
          <div className="my-1 border-t border-clinic-border" />
          <ItemMenu peligro onClick={() => { onCerrar(); onQuitar([bloqueo.id]); }}>
            <Trash2 aria-hidden className="h-3.5 w-3.5" /> Quitar este bloqueo
          </ItemMenu>
          {serie.length > 1 && (
            <ItemMenu
              peligro
              onClick={() => {
                onCerrar();
                if (window.confirm(`¿Quitar los ${serie.length} bloqueos de esta serie? Las citas no se tocan.`)) onQuitar(serie.map((b) => b.id));
              }}
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" /> Quitar toda la serie
            </ItemMenu>
          )}
        </>
      )}
    </Desplegable>
  );
}
