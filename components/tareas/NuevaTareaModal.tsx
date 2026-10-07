"use client";
/** "Nueva tarea personalizada" (paridad Dentalink): detalle*, fecha* y
 *  presupuesto de referencia. Se abre desde la bandeja (con buscador de
 *  paciente), desde la ficha del paciente (con el paciente ya puesto) y desde
 *  Mi agenda. Con paciente, además, la tarea puede «tacharse sola» cuando el
 *  paciente agenda, acepta el presupuesto o paga (lib/tareasAuto.ts). */
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useStore, fullName } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import { useTareas } from "@/lib/useTareas";
import { BUDGET_STATUS_INFO } from "@/lib/budgets";
import { diaDe, esFecha } from "@/lib/tareas";
import { crearAutoCierre, EVENTOS_AUTOCIERRE } from "@/lib/tareasAuto";
import type { AutoCierre, MgmtTask, Patient } from "@/lib/types";
import { Btn, Field, Modal, inputCls } from "@/components/ui";

export function NuevaTareaModal({
  paciente,
  fechaInicial,
  onClose,
  onCreada,
}: {
  /** Paciente fijo (desde la ficha). Sin él, la bandeja ofrece un buscador. */
  paciente?: Patient;
  fechaInicial: string;
  onClose: () => void;
  onCreada?: (t: MgmtTask) => void;
}) {
  const { db } = useStore();
  const alcance = useAlcance();
  const { hoy, crearPersonalizada } = useTareas();
  const [elegido, setElegido] = useState<Patient | null>(paciente ?? null);
  const [busqueda, setBusqueda] = useState("");
  const [detalle, setDetalle] = useState("");
  const [fecha, setFecha] = useState(fechaInicial >= hoy ? fechaInicial : hoy);
  const [budgetId, setBudgetId] = useState("");
  const [evento, setEvento] = useState<"" | AutoCierre["evento"]>("");
  const [planAuto, setPlanAuto] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Mismo criterio que el buscador global: con alcance, solo sus pacientes, y
  // por documento solo quien ve datos personales.
  const resultados = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (paciente || t.length < 2) return [];
    return db.patients
      .filter((p) => alcance.vePaciente(p.id))
      .filter((p) => fullName(p).toLowerCase().includes(t) || (alcance.puede("patients.personal") && p.document.includes(t)))
      .slice(0, 6);
  }, [busqueda, paciente, db.patients, alcance]);

  // El presupuesto de referencia es un plan de tratamiento: lo elige quien ve planes.
  const verPlanes = alcance.puede("plans.view") || alcance.puede("budgets.manage");
  const presupuestos = elegido && verPlanes
    ? db.budgets
      .filter((b) => b.patientId === elegido.id && b.status !== "anulado" && alcance.veDoctor(b.dentistId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  // «Se tacha sola cuando acepte el presupuesto»: solo sirve un plan que todavía espera respuesta.
  const presentados = presupuestos.filter((b) => b.status === "presentado");
  const citasAgendadas = elegido
    ? db.appointments.filter((a) => a.patientId === elegido.id && a.status !== "cancelada" && a.status !== "ausente" && diaDe(a.start) >= hoy).length
    : 0;

  const crear = () => {
    if (!detalle.trim()) { setError("Escribí el detalle de la tarea."); return; }
    if (!esFecha(fecha) || fecha < hoy) { setError("Elegí una fecha de hoy en adelante."); return; }
    if (elegido && evento === "presupuesto" && !planAuto) { setError("Elegí qué presupuesto tiene que aceptar."); return; }
    const autoCierre = elegido && evento
      ? crearAutoCierre({ evento, patientId: elegido.id, hoy, appointments: db.appointments, budgetId: planAuto || undefined })
      : undefined;
    const t = crearPersonalizada({
      detalle, fecha,
      patientId: elegido?.id,
      patientName: elegido ? fullName(elegido) : undefined,
      budgetId: budgetId || (evento === "presupuesto" ? planAuto : "") || undefined,
      autoCierre,
    });
    if (t) onCreada?.(t);
    onClose();
  };

  return (
    <Modal title="Nueva tarea personalizada" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); crear(); }}>
        {!paciente && (
          <div>
            <span className="mb-1 block text-[13px] font-semibold text-clinic-muted">Paciente</span>
            {elegido ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-azure-300 bg-azure-50 px-3 py-2 text-sm font-bold text-clinic-text">
                <span className="truncate">{fullName(elegido)}</span>
                <button type="button" onClick={() => { setElegido(null); setBudgetId(""); setEvento(""); setPlanAuto(""); }} aria-label="Quitar paciente" className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-white">
                  <X className="h-4 w-4 text-clinic-muted" />
                </button>
              </div>
            ) : (
              <>
                <input
                  className={inputCls}
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscá al paciente por su nombre"
                  aria-label="Buscar paciente"
                />
                {resultados.length > 0 && (
                  <ul className="mt-1 overflow-hidden rounded-xl border border-clinic-border">
                    {resultados.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => { setElegido(p); setBusqueda(""); }} className="block w-full px-3 py-2 text-left text-sm font-semibold text-clinic-text hover:bg-clinic-bg">
                          {fullName(p)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <span className="mt-1 block text-[11px] text-clinic-muted">Sin paciente, queda como una tarea interna de la clínica.</span>
              </>
            )}
          </div>
        )}

        <Field label="Detalle *">
          <textarea
            rows={3}
            className={inputCls}
            value={detalle}
            onChange={(e) => { setDetalle(e.target.value); setError(null); }}
            placeholder="Ej.: Agendar cita para evaluación de prótesis"
          />
        </Field>
        <Field label="Fecha *">
          <input type="date" className={inputCls} min={hoy} value={fecha} onChange={(e) => { setFecha(e.target.value); setError(null); }} />
        </Field>
        {elegido && (
          <Field label="Se tacha sola cuando el paciente…" hint="Opcional: la tarea se marca hecha apenas pase.">
            <select className={inputCls} value={evento} onChange={(e) => { setEvento(e.target.value as typeof evento); setPlanAuto(""); setError(null); }}>
              <option value="">Nada: la marco yo</option>
              {EVENTOS_AUTOCIERRE.filter((e) => e.id !== "presupuesto" || verPlanes).map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </Field>
        )}
        {elegido && evento === "presupuesto" && (
          presentados.length > 0 ? (
            <Field label="¿Qué presupuesto tiene que aceptar? *">
              <select className={inputCls} value={planAuto} onChange={(e) => { setPlanAuto(e.target.value); setError(null); }}>
                <option value="">Elegí un presupuesto</option>
                {presentados.map((b) => <option key={b.id} value={b.id}>Plan #{b.id} · {b.name ?? "Presupuesto"}</option>)}
              </select>
            </Field>
          ) : (
            <p className="rounded-xl bg-state-warnbg px-3 py-2 text-xs font-semibold text-state-warn">Este paciente no tiene presupuestos presentados esperando respuesta.</p>
          )
        )}
        {elegido && evento === "cita" && citasAgendadas > 0 && (
          <p className="text-xs text-clinic-muted">Ya tiene {citasAgendadas === 1 ? "una cita agendada" : `${citasAgendadas} citas agendadas`}: la tarea se tacha cuando agende OTRA.</p>
        )}
        {presupuestos.length > 0 && (
          <Field label="Presupuesto de referencia" hint="Opcional: el plan del que habla la tarea.">
            <select className={inputCls} value={budgetId} onChange={(e) => setBudgetId(e.target.value)}>
              <option value="">Sin presupuesto de referencia</option>
              {presupuestos.map((b) => (
                <option key={b.id} value={b.id}>
                  Plan #{b.id} · {b.name ?? "Presupuesto"} ({BUDGET_STATUS_INFO[b.status].label.toLowerCase()})
                </option>
              ))}
            </select>
          </Field>
        )}
        {error && <p role="alert" className="rounded-xl bg-state-errbg px-3 py-2 text-sm font-semibold text-state-err">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cerrar</Btn>
          <Btn type="submit">Crear tarea</Btn>
        </div>
      </form>
    </Modal>
  );
}
