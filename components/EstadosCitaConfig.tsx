"use client";
/** Administrador de estados de cita (paridad con el de Dentalink): nombre, color,
 *  comportamiento base, si anula el cupo y tipo. Los de fábrica (reservados) se pueden
 *  renombrar y recolorear pero no borrar ni cambiar de comportamiento; los internos se
 *  pueden desactivar; los propios se crean y se borran. */
import { useMemo, useState } from "react";
import { Plus, RotateCcw, Trash2, Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { ESTADOS_CITA, ESTADOS_DEFAULT, ESTADO_LABEL, anulaCupo, idParaEstado, normalizarEstados } from "@/lib/estadosCita";
import type { AppointmentStatus, EstadoCita } from "@/lib/types";
import { Btn, Badge, inputCls } from "@/components/ui";

const TIPO_LABEL: Record<EstadoCita["tipo"], string> = { reservado: "Reservado", interno: "Uso interno", propio: "Estado propio" };
const TIPO_TONE: Record<EstadoCita["tipo"], "info" | "warn" | "muted"> = { reservado: "info", interno: "warn", propio: "muted" };

export function EstadosCitaConfig() {
  const { db, updateClinicConfig } = useStore();
  const guardados = db.clinics[0]?.config.estadosCita;
  const [lista, setLista] = useState<EstadoCita[]>(() => normalizarEstados(guardados ?? ESTADOS_DEFAULT));
  const [nuevo, setNuevo] = useState({ label: "", color: "#0369C9", base: "pendiente" as AppointmentStatus });
  const [guardado, setGuardado] = useState(false);

  const sucio = useMemo(() => JSON.stringify(lista) !== JSON.stringify(normalizarEstados(guardados ?? ESTADOS_DEFAULT)), [lista, guardados]);

  const editar = (id: string, patch: Partial<EstadoCita>) => setLista((l) => l.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const borrar = (id: string) => setLista((l) => l.filter((e) => e.id !== id));
  const agregar = () => {
    const label = nuevo.label.trim();
    if (!label) return;
    setLista((l) => [...l, { id: idParaEstado(label, l), label, color: nuevo.color, base: nuevo.base, tipo: "propio" }]);
    setNuevo({ label: "", color: "#0369C9", base: "pendiente" });
  };
  const guardar = () => {
    updateClinicConfig({ estadosCita: normalizarEstados(lista) });
    setGuardado(true);
    window.setTimeout(() => setGuardado(false), 2500);
  };
  const restablecer = () => { if (window.confirm("¿Volver a los estados de fábrica? Los estados propios se borran.")) setLista(ESTADOS_DEFAULT); };

  return (
    <div className="space-y-3">
      <div className="rounded border border-state-infobg bg-state-infobg/60 px-3 py-2 text-[13px] text-clinic-text">
        <b>«Anulación»</b> significa que al aplicar ese estado a una cita, se libera el cupo en la agenda y queda disponible para agendar.
        El <b>comportamiento</b> es lo que entiende el resto del sistema (tareas, historial, recordatorios).
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-clinic-border text-left text-[13px] font-bold text-clinic-text">
              <th className="px-2 py-2">Nombre</th>
              <th className="px-2 py-2">Color</th>
              <th className="px-2 py-2">Comportamiento</th>
              <th className="px-2 py-2">Anulación</th>
              <th className="px-2 py-2">Tipo</th>
              <th className="px-2 py-2">Activo</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => {
              const fabrica = e.tipo === "reservado";
              return (
                <tr key={e.id} className={`border-b border-clinic-border ${e.activo === false ? "opacity-50" : ""}`}>
                  <td className="px-2 py-1.5">
                    <input aria-label={`Nombre del estado ${e.label}`} className={`${inputCls} max-w-[260px]`} value={e.label} onChange={(ev) => editar(e.id, { label: ev.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <label className="inline-flex items-center gap-2">
                      <input type="color" aria-label={`Color de ${e.label}`} value={e.color} onChange={(ev) => editar(e.id, { color: ev.target.value })} className="h-7 w-10 cursor-pointer rounded border border-clinic-border bg-white p-0.5" />
                      <span className="tabular-nums text-xs text-clinic-muted">{e.color.toUpperCase()}</span>
                    </label>
                  </td>
                  <td className="px-2 py-1.5">
                    {fabrica ? (
                      <span className="text-clinic-muted">{ESTADO_LABEL[e.base]}</span>
                    ) : (
                      <select aria-label={`Comportamiento de ${e.label}`} className={`${inputCls} max-w-[200px]`} value={e.base} onChange={(ev) => editar(e.id, { base: ev.target.value as AppointmentStatus })}>
                        {ESTADOS_CITA.map((b) => <option key={b} value={b}>{ESTADO_LABEL[b]}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-clinic-muted">{anulaCupo(e) ? "Sí" : "No"}</td>
                  <td className="px-2 py-1.5"><Badge tone={TIPO_TONE[e.tipo]}>{TIPO_LABEL[e.tipo]}</Badge></td>
                  <td className="px-2 py-1.5">
                    {fabrica ? <span className="text-clinic-muted">Siempre</span> : (
                      <input type="checkbox" aria-label={`Activar ${e.label}`} checked={e.activo !== false} onChange={(ev) => editar(e.id, { activo: ev.target.checked ? undefined : false })} className="accent-azure-600" />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {e.tipo === "propio" && (
                      <button type="button" onClick={() => borrar(e.id)} aria-label={`Borrar ${e.label}`} className="grid h-7 w-7 place-items-center rounded text-state-err hover:bg-state-errbg"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="px-2 py-2">
                <input aria-label="Nombre del nuevo estado" placeholder="Nuevo estado (ej. Control 6 meses)" className={`${inputCls} max-w-[260px]`} value={nuevo.label} onChange={(ev) => setNuevo((n) => ({ ...n, label: ev.target.value }))} onKeyDown={(ev) => ev.key === "Enter" && agregar()} />
              </td>
              <td className="px-2 py-2">
                <input type="color" aria-label="Color del nuevo estado" value={nuevo.color} onChange={(ev) => setNuevo((n) => ({ ...n, color: ev.target.value }))} className="h-7 w-10 cursor-pointer rounded border border-clinic-border bg-white p-0.5" />
              </td>
              <td className="px-2 py-2">
                <select aria-label="Comportamiento del nuevo estado" className={`${inputCls} max-w-[200px]`} value={nuevo.base} onChange={(ev) => setNuevo((n) => ({ ...n, base: ev.target.value as AppointmentStatus }))}>
                  {ESTADOS_CITA.map((b) => <option key={b} value={b}>{ESTADO_LABEL[b]}</option>)}
                </select>
              </td>
              <td className="px-2 py-2 text-clinic-muted">{nuevo.base === "cancelada" ? "Sí" : "No"}</td>
              <td className="px-2 py-2"><Badge tone="muted">Estado propio</Badge></td>
              <td className="px-2 py-2" />
              <td className="px-2 py-2 text-right">
                <Btn variant="outline" onClick={agregar} disabled={!nuevo.label.trim()}><Plus className="h-4 w-4" /> Crear nuevo estado</Btn>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Btn variant="ghost" onClick={restablecer}><RotateCcw className="h-4 w-4" /> Restablecer configuración original</Btn>
        <div className="flex items-center gap-2">
          {guardado && <span className="flex items-center gap-1 text-[13px] font-semibold text-state-ok"><Check className="h-4 w-4" /> Estados guardados</span>}
          <Btn onClick={guardar} disabled={!sucio}>Guardar estados</Btn>
        </div>
      </div>
    </div>
  );
}
