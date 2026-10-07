"use client";
/** Una fila de Mi agenda: casillero, título, de qué paciente es y a dónde ir a resolverla. */
import Link from "next/link";
import { ArrowRight, CheckSquare, Sparkles, Square } from "lucide-react";
import { fechaCorta } from "@/lib/tareas";
import type { ItemAgenda } from "@/lib/miAgenda";
import { Badge } from "@/components/ui";

export function FilaAgenda({ item, hoy, onCambiar }: { item: ItemAgenda; hoy: string; onCambiar: (i: ItemAgenda) => void }) {
  const { hecha } = item;
  const Icono = hecha ? CheckSquare : Square;
  const color = hecha ? (item.hechaPor === "sola" ? "text-clinic-muted" : "text-state-ok") : "text-clinic-border";
  const titulo = item.href
    ? <Link href={item.href} className="hover:text-azure-700 hover:underline">{item.titulo}</Link>
    : item.titulo;

  return (
    <li className="flex items-start gap-2.5 rounded-lg px-1.5 py-2 hover:bg-clinic-bg">
      {item.accion ? (
        <button
          type="button"
          onClick={() => onCambiar(item)}
          aria-pressed={hecha}
          aria-label={`${hecha ? "Marcar como pendiente" : "Marcar como hecha"}: ${item.titulo}`}
          className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-azure-600"
        >
          <Icono aria-hidden className={`h-[18px] w-[18px] ${color}`} strokeWidth={2.2} />
        </button>
      ) : (
        <span className="mt-px grid h-6 w-6 shrink-0 place-items-center">
          <Icono aria-hidden className={`h-[18px] w-[18px] ${color}`} strokeWidth={2.2} />
          <span className="sr-only">{hecha ? (item.hechaPor === "sola" ? "Se tachó sola" : "Hecha") : "Pendiente"}</span>
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className={`break-words text-sm font-semibold ${hecha ? "text-clinic-muted line-through" : "text-clinic-text"}`}>{titulo}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-clinic-muted">
          {item.paciente && (
            <Link href={`/app/pacientes/${item.paciente.id}`} className="font-bold text-azure-700 hover:underline">{item.paciente.nombre}</Link>
          )}
          {item.detalle && <span>{item.detalle}</span>}
          {item.leyenda && (
            <span className="inline-flex items-center gap-1 text-azure-700"><Sparkles aria-hidden className="h-3 w-3" />{item.leyenda}</span>
          )}
          {hecha && item.hechaPor === "sola" && <span>Se tachó sola</span>}
        </p>
      </div>

      {item.atrasada && <Badge tone="err">Atrasada · {fechaCorta(item.fecha, hoy)}</Badge>}
      {item.href && !hecha && (
        <Link href={item.href} aria-label={`Ir a: ${item.titulo}`} className="mt-0.5 shrink-0 text-clinic-muted hover:text-azure-700">
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      )}
    </li>
  );
}
