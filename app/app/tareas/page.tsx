"use client";
/** Tareas de gestión (paridad Dentalink): bandeja que se llena y se vacía sola.
 *
 *  Las automáticas —cobranza, captura, control, cita— NO se guardan: las deriva
 *  `lib/tareas.ts` del estado de la clínica en cada render. Por eso se cierran
 *  solas: si el paciente pagó, la condición deja de cumplirse y la tarea no se
 *  deriva más. Lo guardado en `mgmtTasks` son las manuales y los OVERRIDES: la
 *  decisión humana sobre una derivada (postergarla, asignarla, cerrarla). */
import { useMemo, useState } from "react";
import { useStore, fmtDate, fullName, waLink } from "@/lib/store";
import { can } from "@/lib/rbac";
import { derivarTareas, fusionarTareas, clasificarTareas, type TaskRow } from "@/lib/tareas";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { ListChecks, Plus, MessageCircle, Trash2, Clock, ShieldAlert } from "lucide-react";
import type { MgmtTask, MgmtTaskType } from "@/lib/types";

const TYPE_LABEL: Record<MgmtTaskType, string> = { cita: "Cita", captura: "Captura", control: "Control", cobranza: "Cobranza", personalizada: "Personalizada" };
const TYPE_TONE: Record<MgmtTaskType, "info" | "ok" | "warn" | "err" | "muted"> = { cita: "info", captura: "warn", control: "ok", cobranza: "err", personalizada: "muted" };
const RES_LABEL: Record<string, string> = { acepto: "Aceptó", contacto_posterior: "Contacto posterior", rechazo: "Rechazó" };
const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function TareasPage() {
  const { db, session, addMgmtTask, updateMgmtTask, deleteMgmtTask } = useStore();
  const cid = db.clinics[0]?.id ?? "";
  const canManage = session ? can(session.role, "engagement.forms") : false;
  const [vista, setVista] = useState<"dia" | "atrasadas" | "todas">("dia");
  const [typeFilter, setTypeFilter] = useState<"todas" | MgmtTaskType>("todas");
  const [soloMias, setSoloMias] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);

  const hoy = hoyISO();

  const { delDia, atrasadas, todas } = useMemo(() => {
    const derivadas = derivarTareas({
      patients: db.patients,
      budgets: db.budgets,
      payments: db.payments,
      appointments: db.appointments,
      deadlines: db.clinics[0]?.config?.taskDeadlines,
    }, hoy);
    const fusionadas = fusionarTareas(derivadas, db.mgmtTasks, hoy, showClosed);
    const c = clasificarTareas(fusionadas, hoy);
    return { delDia: c.delDia, atrasadas: c.atrasadas, todas: fusionadas };
  }, [db.patients, db.budgets, db.payments, db.appointments, db.mgmtTasks, db.clinics, hoy, showClosed]);

  const tasks = useMemo(() => {
    const base = vista === "dia" ? delDia : vista === "atrasadas" ? atrasadas : todas;
    return base
      .filter((t) => typeFilter === "todas" || t.type === typeFilter)
      .filter((t) => !soloMias || t.assigneeId === session?.userId)
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  }, [delDia, atrasadas, todas, vista, typeFilter, soloMias, session?.userId]);

  // Guard de RUTA, no solo de botones: la lista muestra una fila por paciente
  // con deuda y su monto, o sea la cartera de cuentas por cobrar entera. Sin
  // esto, un dentista la ve escribiendo la URL aunque el ítem del nav no esté.
  // (Va después de los hooks: no se puede return antes de llamarlos todos.)
  if (!session) return null;
  if (!canManage) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-lg font-extrabold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">La bandeja de tareas la gestionan el <b>Administrador</b> y la <b>Asistente</b>.</p>
      </Card>
    );
  }

  const sel = tasks.find((t) => t.id === selId) ?? null;

  /** Aplica un cambio a una tarea. Si es manual, actualiza su doc. Si es derivada,
   *  crea o actualiza el OVERRIDE: el doc que guarda la decisión humana sobre una
   *  tarea que no existe como fila. */
  const aplicar = (t: TaskRow, cambio: Partial<MgmtTask>) => {
    if (!t.derivedKey) { updateMgmtTask({ ...t, ...cambio, updatedAt: new Date().toISOString() }); return; }
    const existente = db.mgmtTasks.find((x) => x.derivedKey === t.derivedKey);
    if (existente) { updateMgmtTask({ ...existente, ...cambio, updatedAt: new Date().toISOString() }); return; }
    addMgmtTask({
      id: `ov_${t.derivedKey.replace(":", "_")}_${Date.now()}`,
      clinicId: cid,
      type: t.type,
      patientId: t.patientId,
      derivedKey: t.derivedKey,
      title: t.title,
      status: "pendiente",
      createdAt: new Date().toISOString(),
      ...cambio,
    });
  };

  /** Cerrar una derivada guarda CONTRA QUÉ se cerró. Sin eso el cierre queda
   *  pegado a la clave (`cobranza:p1`), que dura toda la vida del paciente: el
   *  día que firme un plan nuevo y no pague, la tarea nunca volvería a salir. */
  const cerrar = (t: TaskRow, resolution: MgmtTask["resolution"]) =>
    aplicar(t, { status: "cerrada", resolution, ...(t.instanceKey ? { closedInstance: t.instanceKey } : {}) });
  const postergar = (t: TaskRow, dias: number) => {
    const d = new Date(); d.setUTCDate(d.getUTCDate() + dias);
    aplicar(t, { snoozedUntil: d.toISOString().slice(0, 10) });
  };

  const pName = (t: MgmtTask) => { const p = t.patientId ? db.patients.find((x) => x.id === t.patientId) : undefined; return p ? fullName(p) : t.patientName ?? "—"; };
  const pPhone = (t: MgmtTask) => (t.patientId ? db.patients.find((x) => x.id === t.patientId)?.phone : undefined);
  const FILTERS: ("todas" | MgmtTaskType)[] = ["todas", "captura", "control", "cobranza", "cita", "personalizada"];

  return (
    <Reveal className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-azure-50 text-azure-600"><ListChecks className="h-5 w-5" /></span>
        <div>
          <h1 className="text-lg font-extrabold text-clinic-text">Tareas de gestión</h1>
          <p className="text-xs text-clinic-muted">{delDia.length} para hoy · se generan y se cierran solas.</p>
        </div>
        <Btn className="ml-auto" onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Nueva tarea</Btn>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-clinic-border pb-2">
        {([["dia", "Tareas del día", delDia.length], ["atrasadas", "Atrasadas", atrasadas.length], ["todas", "Todas", todas.length]] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => { setVista(k); setSelId(null); }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${vista === k ? "bg-navy-800 text-white" : "text-clinic-muted hover:text-clinic-text"}`}>
            {label}
            {n > 0 && <span className={`rounded px-1.5 py-0.5 text-[10px] ${vista === k ? "bg-white/20" : k === "atrasadas" ? "bg-state-errbg text-state-err" : "bg-clinic-bg"}`}>{n}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setTypeFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${typeFilter === f ? "bg-azure-600 text-white" : "border border-clinic-border bg-white text-clinic-muted hover:text-clinic-text"}`}>
            {f === "todas" ? "Todas" : TYPE_LABEL[f]}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-bold text-clinic-muted">
          <input type="checkbox" checked={soloMias} onChange={(e) => setSoloMias(e.target.checked)} /> Sólo mías
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-clinic-muted">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Ver cerradas
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <Empty title="Nada pendiente" desc="Cuando haya un saldo sin cobrar, un presupuesto sin aceptar o una cita sin confirmar, la tarea aparece acá sola." />
          ) : tasks.map((t) => (
            <button key={t.id} onClick={() => setSelId(t.id)}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${selId === t.id ? "border-azure-400 bg-azure-50" : "border-clinic-border bg-white hover:border-azure-300"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TYPE_TONE[t.type]}>{TYPE_LABEL[t.type]}</Badge>
                <span className="text-sm font-bold text-clinic-text">{t.title}</span>
                {t.dueDate && t.dueDate < hoy && <Badge tone="err">Atrasada</Badge>}
                {t.status === "cerrada" && t.resolution && <Badge tone="muted">{RES_LABEL[t.resolution]}</Badge>}
              </div>
              <div className="mt-1 text-xs text-clinic-muted">{pName(t)}{t.detail ? ` · ${t.detail}` : ""}</div>
            </button>
          ))}
        </div>

        <Card className="h-fit p-4">
          {!sel ? (
            <p className="py-8 text-center text-xs text-clinic-muted">Seleccione una tarea para ver su detalle</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge tone={TYPE_TONE[sel.type]}>{TYPE_LABEL[sel.type]}</Badge>
                {sel.derivedKey && <span className="text-[10px] font-bold uppercase tracking-wide text-clinic-muted">Automática</span>}
              </div>
              <p className="text-sm font-bold text-clinic-text">{sel.title}</p>
              {sel.detail && <p className="text-xs text-clinic-muted">{sel.detail}</p>}
              {sel.patientId && <a href={`/app/pacientes/${sel.patientId}`} className="block text-xs font-bold text-azure-700 hover:underline">{pName(sel)}</a>}
              <dl className="space-y-1 border-t border-clinic-border pt-3 text-xs">
                <div className="flex justify-between"><dt className="text-clinic-muted">Origen</dt><dd className="font-bold text-clinic-text">{fmtDate(sel.createdAt)}</dd></div>
                {sel.dueDate && <div className="flex justify-between"><dt className="text-clinic-muted">Vence</dt><dd className={`font-bold ${sel.dueDate < hoy ? "text-state-err" : "text-clinic-text"}`}>{sel.dueDate}</dd></div>}
              </dl>

              {sel.status !== "cerrada" && (
                <div className="space-y-3 border-t border-clinic-border pt-3">
                  <Field label="Asignar a">
                    <select value={sel.assigneeId ?? ""} onChange={(e) => aplicar(sel, { assigneeId: e.target.value || undefined })} className={inputCls}>
                      <option value="">Sin asignar</option>
                      {db.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </Field>
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-clinic-muted"><Clock className="h-3 w-3" /> Postergar</p>
                    <div className="flex gap-1.5">
                      {([["1 día", 1], ["1 semana", 7], ["1 mes", 30]] as const).map(([label, d]) => (
                        <button key={d} onClick={() => { postergar(sel, d); setSelId(null); }} className="rounded-lg border border-clinic-border px-2 py-1 text-[11px] font-bold text-clinic-muted hover:text-clinic-text">{label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-bold text-clinic-muted">Cerrar caso</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => { cerrar(sel, "acepto"); setSelId(null); }} className="rounded-lg border border-state-ok/40 bg-state-okbg px-2 py-1 text-[11px] font-bold text-state-ok hover:brightness-95">Aceptó</button>
                      <button onClick={() => { cerrar(sel, "contacto_posterior"); setSelId(null); }} className="rounded-lg border border-state-warn/40 bg-state-warnbg px-2 py-1 text-[11px] font-bold text-state-warn hover:brightness-95">Contacto posterior</button>
                      <button onClick={() => { cerrar(sel, "rechazo"); setSelId(null); }} className="rounded-lg border border-state-err/40 bg-state-errbg px-2 py-1 text-[11px] font-bold text-state-err hover:brightness-95">Rechazó</button>
                    </div>
                  </div>
                  {pPhone(sel) && (
                    <a href={waLink(pPhone(sel)!, `Hola ${pName(sel)}, te contactamos de la clínica.`)} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-clinic-border py-2 text-xs font-bold text-state-ok hover:bg-state-okbg">
                      <MessageCircle className="h-3.5 w-3.5" /> Escribir por WhatsApp
                    </a>
                  )}
                  {!sel.derivedKey && (
                    <button onClick={() => { if (confirm("¿Eliminar tarea?")) { deleteMgmtTask(sel.id); setSelId(null); } }}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold text-clinic-muted hover:text-state-err">
                      <Trash2 className="h-3 w-3" /> Eliminar tarea
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {showForm && (
        <TaskForm
          clinicId={cid}
          patients={db.patients.map((p) => ({ id: p.id, name: fullName(p) }))}
          users={db.users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }))}
          onClose={() => setShowForm(false)}
          onSave={(t) => { addMgmtTask(t); setShowForm(false); }}
        />
      )}
    </Reveal>
  );
}

function TaskForm({ clinicId, patients, users, onClose, onSave }: {
  clinicId: string;
  patients: { id: string; name: string }[];
  users: { id: string; name: string }[];
  onClose: () => void;
  onSave: (t: MgmtTask) => void;
}) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [patientId, setPatientId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const guardar = () => {
    if (!title.trim()) return;
    onSave({
      id: `mt_${Date.now()}`,
      clinicId,
      type: "personalizada",
      patientId: patientId || undefined,
      patientName: patients.find((p) => p.id === patientId)?.name,
      title: title.trim(),
      detail: detail.trim() || undefined,
      assigneeId: assigneeId || undefined,
      status: "pendiente",
      dueDate: dueDate || undefined,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <Modal title="Nueva tarea de gestión" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Ej. Llamar para confirmar control" /></Field>
        <Field label="Detalle"><textarea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} className={inputCls} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paciente">
            <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className={inputCls}>
              <option value="">— (sin paciente)</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Asignar a">
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputCls}>
              <option value="">Sin asignar</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Vencimiento (opcional)"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} /></Field>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-clinic-border px-4 py-2 text-sm font-bold text-clinic-muted hover:text-clinic-text">Cancelar</button>
          <Btn onClick={guardar}>Crear tarea</Btn>
        </div>
      </div>
    </Modal>
  );
}
