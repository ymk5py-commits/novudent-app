"use client";
/** Buscador de paciente: se escribe la CI o el nombre y se elige de la lista «CI | NOMBRE COMPLETO». Con `onCrear`, al final de la
 *  lista aparece «Crear nuevo paciente». Se usa al dar una cita y al armar un presupuesto: con cientos de pacientes un `<select>`
 *  con todos no sirve. Solo ofrece los pacientes que la persona puede ver y los que no están deshabilitados (salvo el ya elegido). */
import { useEffect, useId, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { useStore, fullName } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import type { Patient } from "@/lib/types";
import { inputCls } from "@/components/ui";

export function BuscadorPaciente({ valor, onElegir, onCrear }: { valor: string; onElegir: (id: string) => void; onCrear?: () => void }) {
  const { db } = useStore();
  const alcance = useAlcance();
  const id = useId();
  // Los deshabilitados no se ofrecen para citas nuevas (salvo el que ya tiene la cita).
  const pacientes = db.patients.filter((p) => (alcance.vePaciente(p.id) && !p.disabled) || p.id === valor);
  const etiqueta = (p: Patient) => `${p.document || "Sin CI"} | ${fullName(p).toLocaleUpperCase("es-PY")}`;
  const elegido = pacientes.find((p) => p.id === valor);
  const [texto, setTexto] = useState(elegido ? etiqueta(elegido) : "");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => { if (elegido) setTexto(etiqueta(elegido)); }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(texto.trim());
  const filtrados = (elegido && texto === etiqueta(elegido)) || !q
    ? pacientes.slice(0, 8)
    : pacientes.filter((p) => norm(`${p.document} ${p.document.replace(/\D/g, "")} ${fullName(p)}`).includes(q)).slice(0, 8);
  const total = filtrados.length + (onCrear ? 1 : 0);
  const elegir = (i: number) => {
    if (i < filtrados.length) { onElegir(filtrados[i].id); setTexto(etiqueta(filtrados[i])); setAbierto(false); }
    else if (onCrear) { setAbierto(false); onCrear(); }
  };

  return (
    <div ref={caja} className="relative">
      <label htmlFor={`${id}-input`} className="mb-1 block text-[13px] font-semibold text-clinic-muted">Paciente</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
        <input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={abierto && total > 0 ? `${id}-op-${activo}` : undefined}
          autoComplete="off"
          className={`${inputCls} pl-9 pr-8`}
          placeholder="Escribí la CI o el nombre"
          value={texto}
          onFocus={() => setAbierto(true)}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true); setActivo(0); if (valor) onElegir(""); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setActivo((a) => Math.min(total - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter" && abierto && total > 0) { e.preventDefault(); elegir(activo); }
            else if (e.key === "Escape" && abierto) { e.stopPropagation(); setAbierto(false); }
          }}
        />
        {texto && (
          <button type="button" aria-label="Borrar paciente" onClick={() => { setTexto(""); onElegir(""); setAbierto(true); }} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-clinic-muted hover:bg-clinic-bg">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {abierto && (
        <ul id={`${id}-lista`} role="listbox" aria-label="Pacientes" className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-clinic-border bg-white py-1 shadow-pop">
          {filtrados.length === 0 && <li className="px-3 py-2 text-xs text-clinic-muted">No hay pacientes con esa CI o ese nombre.</li>}
          {filtrados.map((p, i) => (
            <li
              key={p.id}
              id={`${id}-op-${i}`}
              role="option"
              aria-selected={p.id === valor}
              onMouseDown={(e) => { e.preventDefault(); elegir(i); }}
              onMouseEnter={() => setActivo(i)}
              className={`cursor-pointer px-3 py-2 tabular-nums text-xs ${i === activo ? "bg-azure-50 text-azure-800" : "text-clinic-text"}`}
            >
              {etiqueta(p)}
            </li>
          ))}
          {onCrear && (
            <li
              id={`${id}-op-${filtrados.length}`}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => { e.preventDefault(); elegir(filtrados.length); }}
              onMouseEnter={() => setActivo(filtrados.length)}
              className={`mt-1 flex cursor-pointer items-center gap-1.5 border-t border-clinic-border px-3 py-2.5 text-sm font-bold text-azure-700 ${activo === filtrados.length ? "bg-azure-50" : ""}`}
            >
              <Plus className="h-4 w-4" /> Crear nuevo paciente
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
