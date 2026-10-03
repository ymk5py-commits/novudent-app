"use client";
/** Piezas compartidas del módulo de tareas: la etiqueta de tipo, el check de
 *  estado, el desplegable y los nombres de paciente/profesional/usuario. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, CheckSquare, Square } from "lucide-react";
import { useStore, fullName } from "@/lib/store";
import { TIPO_TAREA_LABEL, type EstadoFila, type FilaTarea } from "@/lib/tareas";
import type { MgmtTaskType } from "@/lib/types";

/** Colores de cada tipo. Mismas familias que Dentalink donde se puede (captura
 *  azul, cobranza naranja, control verde); la cita va en violeta y no en
 *  magenta porque el magenta no se distingue del naranja en el gráfico de
 *  estadísticas (validado con el script de dataviz: ver CHART_COLOR). */
const TIPO_BADGE: Record<MgmtTaskType, string> = {
  personalizada: "bg-azure-50 text-azure-700 ring-azure-200",
  captura: "bg-blue-50 text-blue-800 ring-blue-200",
  cobranza: "bg-orange-50 text-orange-800 ring-orange-200",
  control: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  cita: "bg-violet-50 text-violet-800 ring-violet-200",
  cheque: "bg-amber-50 text-amber-800 ring-amber-200",
};

/** Color de la marca en el gráfico, por tipo (la etiqueta y la barra hablan del
 *  mismo tipo con la misma familia de color). Validado con
 *  `validate_palette.js --pairs all` sobre blanco: separación CVD ≥ 9,2 y
 *  visión normal ≥ 16,3 entre los cuatro. El aqua queda bajo 3:1 de contraste:
 *  por eso el gráfico lleva además los totales escritos y la tabla. */
export const CHART_COLOR: Record<"captura" | "cobranza" | "control" | "cita", string> = {
  captura: "#2a78d6",
  cobranza: "#eb6834",
  control: "#1baf7a",
  cita: "#4a3aa7",
};

export function TipoBadge({ type, apagada, children }: { type: MgmtTaskType; apagada?: boolean; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 tabular-nums text-[13px] font-semibold ring-1 ring-inset ${
        apagada ? "bg-clinic-bg text-clinic-muted ring-clinic-border" : TIPO_BADGE[type]
      }`}
    >
      {children ?? TIPO_TAREA_LABEL[type]}
    </span>
  );
}

/** El casillero de la fila: vacío si está pendiente, ✓ si se trabajó. */
export function EstadoCheck({ estado }: { estado: EstadoFila }) {
  if (estado === "pendiente") return <Square aria-hidden className="h-[18px] w-[18px] shrink-0 text-clinic-border" strokeWidth={2.2} />;
  return <CheckSquare aria-hidden className={`h-[18px] w-[18px] shrink-0 ${estado === "sistema" ? "text-clinic-muted" : "text-state-ok"}`} strokeWidth={2.2} />;
}

export const ESTADO_LABEL: Record<EstadoFila, string> = {
  pendiente: "pendiente",
  completada: "completada",
  sistema: "completada por el sistema",
};

/** Por qué se cerró sola, según el tipo (lo que dice el panel de una tarea
 *  "completada por el sistema"). */
export const MOTIVO_SISTEMA: Record<MgmtTaskType, string> = {
  cobranza: "La deuda se saldó.",
  captura: "El presupuesto ya no está esperando respuesta: se aceptó, empezó o se anuló.",
  control: "El paciente ya tiene una cita agendada.",
  cita: "La cita ya se resolvió: se confirmó o el paciente volvió a agendar.",
  cheque: "El cheque se cobró o se anuló.",
  personalizada: "",
};

/** Nombres para mostrar. Todo sale del store; un paciente borrado cae en el
 *  nombre denormalizado de la tarea. */
export function useNombres() {
  const { db } = useStore();
  const pacientes = useMemo(() => new Map(db.patients.map((p) => [p.id, p])), [db.patients]);
  const usuarios = useMemo(() => new Map(db.users.map((u) => [u.id, u])), [db.users]);
  // Memorizado: la bandeja lo usa como dependencia para ordenar las filas.
  return useMemo(() => ({
    paciente: (f: Pick<FilaTarea, "patientId" | "patientName">) => {
      const p = f.patientId ? pacientes.get(f.patientId) : undefined;
      return p ? fullName(p) : f.patientName ?? "";
    },
    usuario: (id?: string) => (id ? usuarios.get(id)?.name ?? "" : ""),
    pacienteDe: (id?: string) => (id ? pacientes.get(id) : undefined),
  }), [pacientes, usuarios]);
}

/** Desplegable liviano: se cierra con Escape, al hacer clic afuera y al elegir.
 *  `children` recibe `cerrar` para que cada opción lo llame. */
export function Desplegable({
  etiqueta,
  boton,
  children,
  alinear = "izquierda",
  className = "",
  ancho = "w-60",
  primario,
}: {
  /** Nombre accesible del botón (si el contenido visible no alcanza). */
  etiqueta?: string;
  boton: ReactNode;
  children: (cerrar: () => void) => ReactNode;
  /** "auto": a la izquierda en el celular (el botón queda contra el borde
   *  izquierdo) y a la derecha desde sm (el botón queda contra el borde derecho). */
  alinear?: "izquierda" | "derecha" | "auto";
  className?: string;
  ancho?: string;
  /** Botón verde de acción principal (el "Finalizar ▾" de Dentalink). */
  primario?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);
  return (
    <div ref={raiz} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={etiqueta}
        onClick={() => setAbierto((v) => !v)}
        className={primario
          ? "inline-flex min-h-10 items-center gap-1.5 rounded-[10px] bg-azure-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_16px_-8px_rgba(3,105,201,0.55)] transition-[background-color,box-shadow] hover:bg-azure-700"
          : "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-clinic-border bg-white px-2.5 py-1.5 text-xs font-bold text-clinic-text transition-colors hover:border-azure-300 hover:text-azure-700"}
      >
        {boton}
      </button>
      {abierto && (
        <div
          role="menu"
          className={`absolute z-30 mt-1 ${ancho} max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-clinic-border bg-white py-1 text-sm shadow-pop ${alinear === "derecha" ? "right-0" : alinear === "auto" ? "left-0 sm:left-auto sm:right-0" : "left-0"}`}
        >
          {children(() => setAbierto(false))}
        </div>
      )}
    </div>
  );
}

/** Una opción de un `Desplegable`. */
export function Opcion({ onClick, children, marcada, ayuda }: { onClick: () => void; children: ReactNode; marcada?: boolean; ayuda?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-clinic-text transition-colors hover:bg-clinic-bg focus-visible:bg-clinic-bg"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{children}</span>
        {ayuda && <span className="mt-0.5 block text-xs leading-snug text-clinic-muted">{ayuda}</span>}
      </span>
      {marcada && <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-azure-600" strokeWidth={3} />}
    </button>
  );
}
