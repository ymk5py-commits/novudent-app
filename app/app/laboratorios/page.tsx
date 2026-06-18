"use client";
/** Laboratorios: gestión de órdenes de laboratorio dental.
 *  RBAC: crear/editar requiere admin o asistente (engagement.forms).
 *  Plan gate: módulo "laboratorios" (Plan Clínica o Cadena). */
import { useState, useMemo } from "react";
import {
  ShieldAlert,
  Plus,
  FlaskConical,
  Clock,
  CheckCircle,
  Pencil,
  Trash2,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { useStore, fmtGs, fmtDate, fullName } from "@/lib/store";
import { can } from "@/lib/rbac";
import type { LabOrder, LabStatus } from "@/lib/types";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";
import { PlanLocked, useClinicPlan } from "@/components/PlanGate";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

/* ===== Helpers de estado ===== */
const LAB_STATUS_LABEL: Record<LabStatus, string> = {
  enviado: "Enviado",
  en_proceso: "En proceso",
  recibido: "Recibido",
  entregado: "Entregado",
};

type StatusTone = "info" | "warn" | "hold" | "ok";

const LAB_STATUS_TONE: Record<LabStatus, StatusTone> = {
  enviado: "info",
  en_proceso: "warn",
  recibido: "hold",
  entregado: "ok",
};

/** Orden del flujo: permite solo avanzar al siguiente estado */
const STATUS_FLOW: LabStatus[] = ["enviado", "en_proceso", "recibido", "entregado"];

function nextStatus(current: LabStatus): LabStatus | null {
  const idx = STATUS_FLOW.indexOf(current);
  return idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
}

type FilterStatus = "todos" | LabStatus;

const FILTER_PILLS: { value: FilterStatus; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "enviado", label: "Enviado" },
  { value: "en_proceso", label: "En proceso" },
  { value: "recibido", label: "Recibido" },
  { value: "entregado", label: "Entregado" },
];

/* ===== Página principal ===== */
export default function LaboratoriosPage() {
  const store = useStore();
  const { db, session } = store;
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("todos");
  const [newOpen, setNewOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState<LabOrder | null>(null);

  const plan = useClinicPlan();
  if (!session) return null;
  if (!plan.features.includes("laboratorios")) return <PlanLocked feature="laboratorios" />;

  const canWrite = can(session.role, "engagement.forms");

  /* Órdenes más recientes primero */
  const sortedOrders = useMemo(
    () => [...db.labOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [db.labOrders],
  );

  const filtered = useMemo(
    () =>
      filterStatus === "todos"
        ? sortedOrders
        : sortedOrders.filter((o) => o.status === filterStatus),
    [sortedOrders, filterStatus],
  );

  /* Resumen de stats */
  const total = db.labOrders.length;
  const pendingCount = db.labOrders.filter((o) => o.status !== "entregado").length;
  const now = new Date();
  const overdueCount = db.labOrders.filter(
    (o) => o.dueAt && o.status !== "entregado" && new Date(o.dueAt) < now,
  ).length;

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <Reveal y={0}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-clinic-text">Laboratorios</h1>
            <p className="text-sm text-clinic-muted">
              Órdenes de laboratorio y seguimiento de trabajos.
            </p>
          </div>
          {canWrite && (
            <Btn onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> Nueva orden
            </Btn>
          )}
        </div>
      </Reveal>

      {/* Stat cards */}
      <Stagger className="grid gap-4 sm:grid-cols-3">
        <StaggerItem>
          <Card className="h-full p-5">
            <div className="flex items-center gap-2 text-azure-600">
              <FlaskConical className="h-4 w-4" />
              <span className="text-xs font-extrabold uppercase tracking-wide">Total</span>
            </div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-clinic-text">{total}</div>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="h-full p-5">
            <div className="flex items-center gap-2 text-state-warn">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-extrabold uppercase tracking-wide">Pendientes</span>
            </div>
            <div
              className={`mt-1 font-mono text-2xl font-extrabold ${
                pendingCount > 0 ? "text-state-warn" : "text-clinic-text"
              }`}
            >
              {pendingCount}
            </div>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="h-full p-5">
            <div className="flex items-center gap-2 text-state-err">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-extrabold uppercase tracking-wide">Vencidas</span>
            </div>
            <div
              className={`mt-1 font-mono text-2xl font-extrabold ${
                overdueCount > 0 ? "text-state-err" : "text-clinic-text"
              }`}
            >
              {overdueCount}
            </div>
            {overdueCount > 0 && (
              <div className="mt-1 text-[11px] text-clinic-muted">
                fecha de entrega vencida
              </div>
            )}
          </Card>
        </StaggerItem>
      </Stagger>

      {/* Filtros por estado */}
      <Reveal>
        <div className="flex flex-wrap gap-2">
          {FILTER_PILLS.map((pill) => (
            <button
              key={pill.value}
              onClick={() => setFilterStatus(pill.value)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                filterStatus === pill.value
                  ? "bg-azure-600 text-white shadow-sm"
                  : "bg-white border border-clinic-border text-clinic-muted hover:border-azure-300 hover:text-azure-700"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </Reveal>

      {/* Tabla de órdenes */}
      <Reveal>
        {filtered.length === 0 ? (
          <Empty
            title="Sin órdenes"
            desc={
              filterStatus === "todos"
                ? "Aún no hay órdenes de laboratorio."
                : `No hay órdenes en estado "${LAB_STATUS_LABEL[filterStatus as LabStatus]}".`
            }
          />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                  <th className="px-5 py-3">Paciente</th>
                  <th className="px-5 py-3">Laboratorio</th>
                  <th className="px-5 py-3">Trabajo</th>
                  <th className="px-5 py-3">Enviado</th>
                  <th className="px-5 py-3">Entrega</th>
                  <th className="px-5 py-3 text-right">Costo</th>
                  <th className="px-5 py-3">Estado</th>
                  {canWrite && <th className="px-5 py-3 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-clinic-border">
                {filtered.map((order) => {
                  const patient = db.patients.find((p) => p.id === order.patientId);
                  const professional = order.professionalId
                    ? db.users.find((u) => u.id === order.professionalId)
                    : null;
                  const isOverdue =
                    order.dueAt &&
                    order.status !== "entregado" &&
                    new Date(order.dueAt) < now;
                  const next = nextStatus(order.status);

                  return (
                    <tr
                      key={order.id}
                      className={isOverdue ? "bg-state-errbg/30" : "hover:bg-clinic-bg/60"}
                    >
                      <td className="px-5 py-3">
                        <span className="block font-semibold text-clinic-text">
                          {patient ? fullName(patient) : "—"}
                        </span>
                        {professional && (
                          <span className="text-[11px] text-clinic-muted">
                            Dr. {professional.name}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-clinic-text">{order.lab}</td>
                      <td className="px-5 py-3">
                        <span className="font-medium text-clinic-text">{order.workType}</span>
                        {order.notes && (
                          <span className="mt-0.5 block truncate max-w-[140px] text-[11px] text-clinic-muted">
                            {order.notes}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-clinic-muted">
                        {fmtDate(order.sentAt)}
                      </td>
                      <td className="px-5 py-3">
                        {order.dueAt ? (
                          <span
                            className={`font-mono text-xs ${
                              isOverdue ? "font-bold text-state-err" : "text-clinic-muted"
                            }`}
                          >
                            {fmtDate(order.dueAt)}
                            {isOverdue && (
                              <AlertTriangle className="ml-1 inline h-3 w-3 text-state-err" />
                            )}
                          </span>
                        ) : (
                          <span className="text-[11px] text-clinic-muted">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs">
                        {order.cost != null ? fmtGs(order.cost) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={LAB_STATUS_TONE[order.status]}>
                          {LAB_STATUS_LABEL[order.status]}
                        </Badge>
                      </td>
                      {canWrite && (
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Avanzar estado */}
                            {next && (
                              <button
                                onClick={() =>
                                  store.updateLabOrder({ ...order, status: next })
                                }
                                className="flex items-center gap-1 rounded-lg bg-state-infobg px-2.5 py-1.5 text-[11px] font-semibold text-state-info hover:opacity-80"
                                title={`Pasar a "${LAB_STATUS_LABEL[next]}"`}
                              >
                                <ChevronDown className="h-3 w-3 rotate-[-90deg]" />
                                {LAB_STATUS_LABEL[next]}
                              </button>
                            )}
                            {order.status === "entregado" && (
                              <span title="Entregado">
                                <CheckCircle className="h-5 w-5 text-state-ok" />
                              </span>
                            )}
                            {/* Editar notas */}
                            <button
                              onClick={() => setEditingNotes(order)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-clinic-bg"
                              title="Editar notas"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {/* Eliminar */}
                            <button
                              onClick={() => {
                                if (confirm("¿Eliminar esta orden?"))
                                  store.deleteLabOrder(order.id);
                              }}
                              className="grid h-8 w-8 place-items-center rounded-lg text-state-err hover:bg-state-errbg"
                              title="Eliminar orden"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </Reveal>

      {/* Modales */}
      {canWrite && newOpen && (
        <NewOrderModal
          onClose={() => setNewOpen(false)}
          onSave={(o) => {
            store.addLabOrder(o);
            setNewOpen(false);
          }}
        />
      )}
      {canWrite && editingNotes && (
        <EditNotesModal
          order={editingNotes}
          onClose={() => setEditingNotes(null)}
          onSave={(o) => {
            store.updateLabOrder(o);
            setEditingNotes(null);
          }}
        />
      )}
    </div>
  );
}

/* ===== Modal: nueva orden ===== */
function NewOrderModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (o: LabOrder) => void;
}) {
  const { db, session } = useStore();
  const today = new Date().toISOString().slice(0, 10);

  const [patientId, setPatientId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [lab, setLab] = useState("");
  const [workType, setWorkType] = useState("");
  const [sentAt, setSentAt] = useState(today);
  const [dueAt, setDueAt] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");

  const dentists = db.users.filter((u) => u.role === "dentist" && u.active);
  const valid = patientId && lab.trim() && workType.trim() && sentAt;

  function handleSave() {
    if (!valid) return;
    onSave({
      id: crypto.randomUUID(),
      patientId,
      professionalId: professionalId || undefined,
      lab: lab.trim(),
      workType: workType.trim(),
      sentAt: new Date(sentAt).toISOString(),
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      cost: cost !== "" ? Number(cost) : undefined,
      status: "enviado",
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <Modal title="Nueva orden de laboratorio" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Paciente *">
          <select
            className={inputCls}
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
          >
            <option value="">Seleccionar paciente…</option>
            {[...db.patients]
              .sort((a, b) => fullName(a).localeCompare(fullName(b)))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {fullName(p)}
                </option>
              ))}
          </select>
        </Field>

        <Field label="Profesional (opcional)">
          <select
            className={inputCls}
            value={professionalId}
            onChange={(e) => setProfessionalId(e.target.value)}
          >
            <option value="">Sin asignar</option>
            {dentists.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Laboratorio *">
            <input
              className={inputCls}
              value={lab}
              onChange={(e) => setLab(e.target.value)}
              placeholder="Ej: LabDental Central"
            />
          </Field>
          <Field label="Tipo de trabajo *">
            <input
              className={inputCls}
              value={workType}
              onChange={(e) => setWorkType(e.target.value)}
              placeholder="Corona, Prótesis, Férula…"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha de envío *">
            <input
              type="date"
              className={inputCls}
              value={sentAt}
              onChange={(e) => setSentAt(e.target.value)}
            />
          </Field>
          <Field label="Fecha de entrega">
            <input
              type="date"
              className={inputCls}
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Costo (Gs)">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0"
          />
        </Field>

        <Field label="Notas">
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Indicaciones, color, etc."
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            Cancelar
          </Btn>
          <Btn disabled={!valid} onClick={handleSave}>
            Crear orden
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ===== Modal: editar notas / datos de una orden ===== */
function EditNotesModal({
  order,
  onClose,
  onSave,
}: {
  order: LabOrder;
  onClose: () => void;
  onSave: (o: LabOrder) => void;
}) {
  const { db } = useStore();
  const [notes, setNotes] = useState(order.notes ?? "");
  const [status, setStatus] = useState<LabStatus>(order.status);
  const [cost, setCost] = useState(order.cost != null ? String(order.cost) : "");
  const [dueAt, setDueAt] = useState(order.dueAt ? order.dueAt.slice(0, 10) : "");

  const patient = db.patients.find((p) => p.id === order.patientId);

  return (
    <Modal title={`Editar orden — ${patient ? fullName(patient) : order.patientId}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-xl bg-clinic-bg p-3 text-sm">
          <span className="font-semibold text-clinic-text">{order.lab}</span>
          <span className="mx-2 text-clinic-muted">·</span>
          <span className="text-clinic-muted">{order.workType}</span>
        </div>

        <Field label="Estado">
          <select
            className={inputCls}
            value={status}
            onChange={(e) => setStatus(e.target.value as LabStatus)}
          >
            {STATUS_FLOW.map((s) => (
              <option key={s} value={s}>
                {LAB_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha de entrega">
            <input
              type="date"
              className={inputCls}
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </Field>
          <Field label="Costo (Gs)">
            <input
              type="number"
              min={0}
              className={inputCls}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Notas">
          <textarea
            className={`${inputCls} resize-none`}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Indicaciones, seguimiento…"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            Cancelar
          </Btn>
          <Btn
            onClick={() =>
              onSave({
                ...order,
                status,
                notes: notes.trim() || undefined,
                cost: cost !== "" ? Number(cost) : undefined,
                dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
              })
            }
          >
            Guardar
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
