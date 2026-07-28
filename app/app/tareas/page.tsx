"use client";
/** Tareas de Gestión (spec 3.2 / 6.5 / 7.2): bandeja unificada de tareas de
 *  captura, control, cobranza, cita y personalizadas, con asignación y cierre
 *  por resolución (aceptó / contacto posterior / rechazó). Las automáticas se
 *  materializan desde presupuestos/deudas/tratamientos con "Generar". */
import { useMemo, useState } from "react";
import { useStore, fmtDate, fmtGs, fullName, waLink } from "@/lib/store";
import { can } from "@/lib/rbac";
import { patientBalance } from "@/lib/budgets";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { ListChecks, Plus, RefreshCw, MessageCircle, Trash2 } from "lucide-react";
import type { MgmtTask, MgmtTaskType } from "@/lib/types";

const TYPE_LABEL: Record<MgmtTaskType, string> = { cita: "Cita", captura: "Captura", control: "Control", cobranza: "Cobranza", personalizada: "Personalizada" };
const TYPE_TONE: Record<MgmtTaskType, "info" | "ok" | "warn" | "err" | "muted"> = { cita: "info", captura: "warn", control: "ok", cobranza: "err", personalizada: "muted" };
const RES_LABEL: Record<string, string> = { acepto: "Aceptó", contacto_posterior: "Contacto posterior", rechazo: "Rechazó" };

export default function TareasPage() {
  const { db, session, addMgmtTask, updateMgmtTask, deleteMgmtTask } = useStore();
  const cid = db.clinics[0]?.id ?? "";
  const canManage = session ? can(session.role, "engagement.forms") : false;
  const [typeFilter, setTypeFilter] = useState<"todas" | MgmtTaskType>("todas");
  const [showClosed, setShowClosed] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const pName = (t: MgmtTask) => { const p = t.patientId ? db.patients.find((x) => x.id === t.patientId) : undefined; return p ? fullName(p) : t.patientName ?? "—"; };
  const pPhone = (t: MgmtTask) => (t.patientId ? db.patients.find((x) => x.id === t.patientId)?.phone : undefined);

  const tasks = useMemo(
    () => [...db.mgmtTasks]
      .filter((t) => typeFilter === "todas" || t.type === typeFilter)
      .filter((t) => showClosed || t.status !== "cerrada")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [db.mgmtTasks, typeFilter, showClosed],
  );

  const openCount = db.mgmtTasks.filter((t) => t.status !== "cerrada").length;

  const generar = () => {
    const existing = db.mgmtTasks;
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() - 45 * 86_400_000).toISOString();
    let created = 0;
    db.budgets.filter((b) => b.status === "presentado").forEach((b) => {
      if (existing.some((t) => t.type === "captura" && t.budgetId === b.id)) return;
      const p = db.patients.find((x) => x.id === b.patientId);
      addMgmtTask({ id: `mt_${Date.now()}_c${b.id}`, clinicId: cid, type: "captura", patientId: b.patientId, patientName: p ? fullName(p) : undefined, title: "Presupuesto presentado sin aceptar", detail: b.name ?? "Presupuesto", budgetId: b.id, status: "pendiente", createdAt: now });
      created++;
    });
    db.patients.forEach((p) => {
      const saldo = patientBalance(p.id, db.budgets, db.payments);
      if (saldo <= 0) return;
      if (existing.some((t) => t.type === "cobranza" && t.patientId === p.id && t.status !== "cerrada")) return;
      addMgmtTask({ id: `mt_${Date.now()}_d${p.id}`, clinicId: cid, type: "cobranza", patientId: p.id, patientName: fullName(p), title: "Saldo pendiente de pago", detail: fmtGs(saldo), status: "pendiente", createdAt: now });
      created++;
    });
    db.budgets.filter((b) => b.status === "completado" && (b.createdAt ?? "") >= cutoff).forEach((b) => {
      if (existing.some((t) => t.type === "control" && t.budgetId === b.id)) return;
      const future = db.appointments.some((a) => a.patientId === b.patientId && a.start > now && a.status !== "cancelada");
      if (future) return;
      const p = db.patients.find((x) => x.id === b.patientId);
      addMgmtTask({ id: `mt_${Date.now()}_k${b.id}`, clinicId: cid, type: "control", patientId: b.patientId, patientName: p ? fullName(p) : undefined, title: "Control post-tratamiento", detail: "Tratamiento finalizado — agendar control.", budgetId: b.id, status: "pendiente", createdAt: now });
      created++;
    });
    alert(created > 0 ? `Se generaron ${created} tarea(s) nueva(s).` : "No hay tareas nuevas para generar — todo al día.");
  };

  const cerrar = (t: MgmtTask, resolution: MgmtTask["resolution"]) =>
    updateMgmtTask({ ...t, status: "cerrada", resolution, updatedAt: new Date().toISOString() });

  const FILTERS: ("todas" | MgmtTaskType)[] = ["todas", "captura", "control", "cobranza", "cita", "personalizada"];

  return (
    <Reveal className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-azure-50 text-azure-600"><ListChecks className="h-5 w-5" /></span>
          <div>
            <h1 className="text-lg font-extrabold text-clinic-text">Tareas de gestión</h1>
            <p className="text-[11px] text-clinic-muted">{openCount} tarea(s) abierta(s) · captura, control, cobranza y más.</p>
          </div>
        </div>
        {canManage && (
          <div className="ml-auto flex items-center gap-2">
            <Btn variant="outline" onClick={generar}><RefreshCw className="h-4 w-4" /> Generar automáticas</Btn>
            <Btn onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Nueva tarea</Btn>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setTypeFilter(f)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${typeFilter === f ? "bg-navy-800 text-white" : "border border-clinic-border bg-white text-clinic-muted hover:text-clinic-text"}`}>
            {f === "todas" ? "Todas" : TYPE_LABEL[f]}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-bold text-clinic-muted">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Ver cerradas
        </label>
      </div>

      {tasks.length === 0 ? (
        <Empty title="Sin tareas" desc="Generá las tareas automáticas o creá una manual." />
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <Card key={t.id} className={`p-4 ${t.status === "cerrada" ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TYPE_TONE[t.type]}>{TYPE_LABEL[t.type]}</Badge>
                    <span className="text-sm font-bold text-clinic-text">{t.title}</span>
                    {t.status === "cerrada" && t.resolution && <Badge tone="muted">{RES_LABEL[t.resolution]}</Badge>}
                    {t.status === "en_proceso" && <Badge tone="info">En proceso</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-clinic-muted">
                    {t.patientId ? <a href={`/app/pacientes/${t.patientId}`} className="font-bold text-azure-700 hover:underline">{pName(t)}</a> : <span className="font-bold text-clinic-text">{pName(t)}</span>}
                    {t.detail ? ` · ${t.detail}` : ""} · {fmtDate(t.createdAt)}
                  </div>
                </div>
                {canManage && t.status !== "cerrada" && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select value={t.assigneeId ?? ""} onChange={(e) => updateMgmtTask({ ...t, assigneeId: e.target.value || undefined })} className="rounded-lg border border-clinic-border px-2 py-1 text-xs text-clinic-text focus:border-azure-400 focus:outline-none">
                      <option value="">Sin asignar</option>
                      {db.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <select value={t.status} onChange={(e) => updateMgmtTask({ ...t, status: e.target.value as MgmtTask["status"] })} className="rounded-lg border border-clinic-border px-2 py-1 text-xs text-clinic-text focus:border-azure-400 focus:outline-none">
                      <option value="pendiente">Pendiente</option>
                      <option value="en_proceso">En proceso</option>
                    </select>
                    {pPhone(t) && <a href={waLink(pPhone(t)!, `Hola ${pName(t)}, te contactamos de la clínica.`)} target="_blank" rel="noopener noreferrer" className="grid h-7 w-7 place-items-center rounded-lg border border-clinic-border text-state-ok hover:bg-state-okbg" title="WhatsApp" aria-label={`Escribir por WhatsApp a ${pName(t)}`}><MessageCircle className="h-3.5 w-3.5" /></a>}
                  </div>
                )}
                {canManage && <button onClick={() => { if (confirm("¿Eliminar tarea?")) deleteMgmtTask(t.id); }} className="rounded-lg p-1.5 text-clinic-muted hover:bg-clinic-bg hover:text-state-err" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
              {canManage && t.status !== "cerrada" && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-clinic-border pt-3">
                  <span className="text-[11px] font-bold text-clinic-muted">Cerrar caso:</span>
                  <button onClick={() => cerrar(t, "acepto")} className="rounded-lg border border-state-ok/40 bg-state-okbg px-2 py-1 text-[11px] font-bold text-state-ok hover:brightness-95">Aceptó</button>
                  <button onClick={() => cerrar(t, "contacto_posterior")} className="rounded-lg border border-state-warn/40 bg-state-warnbg px-2 py-1 text-[11px] font-bold text-state-warn hover:brightness-95">Contacto posterior</button>
                  <button onClick={() => cerrar(t, "rechazo")} className="rounded-lg border border-state-err/40 bg-state-errbg px-2 py-1 text-[11px] font-bold text-state-err hover:brightness-95">Rechazó</button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

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
