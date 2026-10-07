"use client";
/** La campana del panel: el número de pendientes y, al tocarla, el panel que dice CUÁLES son y
 *  lleva directo a resolverlos (cada paciente con documentos pendientes abre su pestaña
 *  Documentos clínicos; las retenciones abren Facturación filtrada). Antes llevaba a la lista de
 *  pacientes sin decir quién ni qué (revisión de Novum del 6-oct-2026). */
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight, FileText, Receipt } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import { HREF_DOCUMENTOS_PENDIENTES, HREF_RETENCIONES, listaPendientes, type FilaPendiente } from "@/lib/pendientes";
import { Desplegable } from "@/components/Desplegable";

/** Cuántas filas se muestran por sección; el resto está detrás de «Ver todos». */
const FILAS_POR_SECCION = 6;

export function CampanaPendientes() {
  const { db } = useStore();
  const alcance = useAlcance();
  const [abierto, setAbierto] = useState(false);
  const ancla = useRef<HTMLButtonElement>(null);

  const lista = useMemo(
    () => listaPendientes({
      patients: db.patients,
      docs: db.clinicalDocs,
      billing: db.billing,
      verDocumentos: alcance.puede("engagement.forms"),
      verRetenciones: alcance.puede("money.view"),
    }),
    [db.patients, db.clinicalDocs, db.billing, alcance],
  );
  const { total } = lista;
  const cerrar = () => setAbierto(false);
  // En el celular el panel no puede ser más ancho que la pantalla.
  const ancho = typeof window === "undefined" ? 360 : Math.min(360, window.innerWidth - 16);

  return (
    <>
      <button
        ref={ancla}
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        // El conteo va en la etiqueta: el número del badge no se anuncia con lector de pantalla.
        aria-label={total > 0 ? `Ver pendientes (${total})` : "Sin pendientes"}
        data-tip={abierto ? undefined : total > 0 ? `${total} pendiente(s): documentos y retenciones` : "Sin pendientes"}
        data-tip-pos="down-left"
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/30 bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <Bell className="h-[18px] w-[18px]" />
        {total > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-state-err px-1 tabular-nums text-[11px] font-bold text-white">{total}</span>}
      </button>

      <Desplegable ancla={ancla} abierto={abierto} onCerrar={cerrar} ancho={ancho} alinear="derecha" etiqueta="Pendientes">
        <div className="max-h-[70vh] overflow-y-auto">
          <p className="px-3 pb-1 pt-2 text-sm font-bold text-clinic-text">Pendientes</p>
          {total === 0 ? (
            <p className="px-3 pb-3 text-sm text-clinic-muted">Todo al día: no hay documentos ni retenciones pendientes.</p>
          ) : (
            <>
              <Seccion
                titulo="Documentos clínicos pendientes"
                icono={FileText}
                filas={lista.documentos}
                verTodos={{ href: HREF_DOCUMENTOS_PENDIENTES, texto: "Ver todos en la lista de pacientes" }}
                onElegir={cerrar}
              />
              <Seccion
                titulo="Retenciones de facturación"
                icono={Receipt}
                filas={lista.retenciones}
                verTodos={{ href: HREF_RETENCIONES, texto: "Ver todas en Facturación" }}
                onElegir={cerrar}
              />
            </>
          )}
        </div>
      </Desplegable>
    </>
  );
}

function Seccion({ titulo, icono: Icono, filas, verTodos, onElegir }: {
  titulo: string;
  icono: typeof FileText;
  filas: FilaPendiente[];
  verTodos: { href: string; texto: string };
  onElegir: () => void;
}) {
  if (filas.length === 0) return null;
  const visibles = filas.slice(0, FILAS_POR_SECCION);
  return (
    <section aria-label={titulo} className="border-t border-clinic-border first:border-t-0">
      <h3 className="px-3 pb-1 pt-2.5 text-[12px] font-bold uppercase tracking-wide text-clinic-muted">
        {titulo} <span className="tabular-nums">({filas.length})</span>
      </h3>
      <ul>
        {visibles.map((f) => (
          <li key={f.id}>
            <Link
              href={f.href}
              role="menuitem"
              onClick={onElegir}
              className="flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-clinic-bg focus-visible:bg-clinic-bg"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-state-warnbg text-state-warn"><Icono aria-hidden className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-clinic-text">{f.titulo}</span>
                <span className="block truncate text-xs text-clinic-muted">{f.detalle}</span>
              </span>
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-clinic-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={verTodos.href}
        role="menuitem"
        onClick={onElegir}
        className="block px-3 pb-2.5 pt-1 text-xs font-bold text-azure-700 hover:underline"
      >
        {filas.length > FILAS_POR_SECCION ? `${verTodos.texto} (${filas.length})` : verTodos.texto}
      </Link>
    </section>
  );
}
