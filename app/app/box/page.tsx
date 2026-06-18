"use client";
/** Módulo Box / Sillones — gestión de operatorios y uso del día. */
import { useState } from "react";
import {
  Plus, Pencil, Trash2, Armchair, CalendarDays, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useStore, fmtTime, fullName } from "@/lib/store";
import { can } from "@/lib/rbac";
import { planOf } from "@/lib/plan";
import { PlanLocked } from "@/components/PlanGate";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";
import type { Box } from "@/lib/types";

/* ===== helpers ===== */
function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(iso: string, d: Date): boolean {
  return iso.slice(0, 10) === toDateKey(d);
}

/* ===== Paleta de colores para los boxes ===== */
const COLOR_OPTIONS = [
  { label: "Azul", value: "#3B82F6" },
  { label: "Verde", value: "#22C55E" },
  { label: "Violeta", value: "#8B5CF6" },
  { label: "Ámbar", value: "#F59E0B" },
  { label: "Rosa", value: "#EC4899" },
  { label: "Cian", value: "#06B6D4" },
];

/* ===== Componente principal ===== */
export default function BoxPage() {
  const { db, session, upsertAppointment, addBox, updateBox, deleteBox } = useStore();

  // ── Plan gate ──────────────────────────────────────────────────────────────
  const plan = planOf(db.clinics[0]);
  if (!plan.features.includes("boxes")) {
    return <PlanLocked feature="boxes" />;
  }

  // ── RBAC ───────────────────────────────────────────────────────────────────
  const isAdmin = session ? can(session.role, "practice.config") : false;

  // ── Estado local ───────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [editingBox, setEditingBox] = useState<Box | null>(null);
  const [addingBox, setAddingBox] = useState(false);

  // ── Datos del día ──────────────────────────────────────────────────────────
  const dayAppts = db.appointments.filter((a) => sameDay(a.start, selectedDate));
  const assigned = dayAppts.filter((a) => a.boxId);
  const unassigned = dayAppts.filter((a) => !a.boxId);

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Reveal className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-clinic-text">Box / Sillones</h1>
          <p className="text-sm text-clinic-muted">
            Gestión de operatorios y asignación de citas por sillón
          </p>
        </div>
        {isAdmin && (
          <Btn onClick={() => setAddingBox(true)}>
            <Plus className="h-4 w-4" /> Nuevo box
          </Btn>
        )}
      </Reveal>

      {/* ── Gestión de boxes ──────────────────────────────────────────────── */}
      <Reveal delay={0.05}>
        <Card className="p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-clinic-muted">
            Sillones configurados
          </h2>
          {db.boxes.length === 0 ? (
            <Empty
              title="Sin boxes registrados"
              desc={isAdmin ? "Creá el primero con el botón Nuevo box." : "El administrador aún no configuró los boxes."}
            />
          ) : (
            <div className="flex flex-wrap gap-3">
              {db.boxes.map((box) => (
                <div
                  key={box.id}
                  className="flex items-center gap-2.5 rounded-2xl border border-clinic-border bg-white px-4 py-3 shadow-card"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: box.color ?? "#94A3B8" }}
                  />
                  <span className="text-sm font-bold text-clinic-text">{box.name}</span>
                  {isAdmin && (
                    <div className="ml-1 flex gap-1">
                      <button
                        onClick={() => setEditingBox(box)}
                        className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted transition-colors hover:bg-clinic-bg hover:text-azure-600"
                        aria-label={`Editar ${box.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteBox(box.id)}
                        className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted transition-colors hover:bg-state-errbg hover:text-state-err"
                        aria-label={`Eliminar ${box.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </Reveal>

      {/* ── Selector de fecha ─────────────────────────────────────────────── */}
      <Reveal delay={0.1} className="flex items-center gap-3">
        <div className="flex overflow-hidden rounded-xl border border-clinic-border bg-white">
          <button
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            className="px-2.5 py-2 hover:bg-clinic-bg"
            aria-label="Día anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const t = new Date();
              t.setHours(0, 0, 0, 0);
              setSelectedDate(t);
            }}
            className="border-x border-clinic-border px-3 py-2 text-sm font-bold text-azure-600 hover:bg-clinic-bg"
          >
            Hoy
          </button>
          <button
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            className="px-2.5 py-2 hover:bg-clinic-bg"
            aria-label="Día siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-clinic-border bg-white px-4 py-2">
          <CalendarDays className="h-4 w-4 text-azure-600" />
          <span className="text-sm font-bold text-clinic-text">
            {selectedDate.toLocaleDateString("es-PY", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          <Badge tone={toDateKey(selectedDate) === toDateKey(new Date()) ? "ok" : "muted"}>
            {toDateKey(selectedDate) === toDateKey(new Date()) ? "Hoy" : toDateKey(selectedDate)}
          </Badge>
        </div>
        <span className="text-sm text-clinic-muted">
          {dayAppts.length} cita{dayAppts.length !== 1 ? "s" : ""} en total
        </span>
      </Reveal>

      {/* ── Vista por box ─────────────────────────────────────────────────── */}
      <Reveal delay={0.13}>
        {db.boxes.length === 0 ? (
          <Empty
            title="No hay boxes configurados"
            desc="Agregá al menos un box para ver la distribución del día."
          />
        ) : (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${Math.min(db.boxes.length, 4)}, minmax(0, 1fr))`,
            }}
          >
            {db.boxes.map((box) => {
              const boxAppts = assigned
                .filter((a) => a.boxId === box.id)
                .sort((a, b) => a.start.localeCompare(b.start));
              return (
                <Card key={box.id} className="overflow-hidden">
                  {/* cabecera del box */}
                  <div
                    className="flex items-center gap-2 px-4 py-3"
                    style={{
                      borderBottom: `3px solid ${box.color ?? "#94A3B8"}`,
                      background: box.color ? `${box.color}12` : undefined,
                    }}
                  >
                    <Armchair className="h-4 w-4" style={{ color: box.color ?? "#94A3B8" }} />
                    <span className="text-sm font-extrabold text-clinic-text">{box.name}</span>
                    <Badge tone="muted">{boxAppts.length} cita{boxAppts.length !== 1 ? "s" : ""}</Badge>
                  </div>
                  {/* lista de citas del box */}
                  <div className="divide-y divide-clinic-border/60">
                    {boxAppts.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-clinic-muted">Sin citas asignadas</p>
                    ) : (
                      boxAppts.map((appt) => {
                        const pat = db.patients.find((p) => p.id === appt.patientId);
                        return (
                          <div key={appt.id} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] font-bold text-clinic-muted">
                                {fmtTime(appt.start)}
                              </span>
                              <StatusDot status={appt.status} />
                            </div>
                            <div className="mt-0.5 truncate text-sm font-semibold text-clinic-text">
                              {appt.title || "Cita"}
                            </div>
                            {pat && (
                              <div className="truncate text-xs text-clinic-muted">
                                {fullName(pat)}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Reveal>

      {/* ── Citas sin asignar ─────────────────────────────────────────────── */}
      <Reveal delay={0.18}>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-clinic-muted">
              Sin box asignado
            </h2>
            {unassigned.length > 0 && (
              <Badge tone="warn">{unassigned.length} sin asignar</Badge>
            )}
          </div>
          {unassigned.length === 0 ? (
            <Empty
              title="Todas las citas del día tienen box asignado"
              desc="Buen trabajo — no quedan citas sin operatorio."
            />
          ) : (
            <div className="space-y-2">
              {unassigned
                .sort((a, b) => a.start.localeCompare(b.start))
                .map((appt) => {
                  const pat = db.patients.find((p) => p.id === appt.patientId);
                  return (
                    <div
                      key={appt.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl bg-clinic-bg p-3"
                    >
                      <span className="font-mono text-[11px] font-bold text-clinic-muted w-10 shrink-0">
                        {fmtTime(appt.start)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-clinic-text">
                          {appt.title || "Cita"}
                        </div>
                        {pat && (
                          <div className="truncate text-xs text-clinic-muted">
                            {fullName(pat)}
                          </div>
                        )}
                      </div>
                      {/* picker de asignación */}
                      {db.boxes.length > 0 && (
                        <select
                          className="rounded-xl border border-clinic-border bg-white px-3 py-1.5 text-sm font-semibold text-clinic-text focus:border-azure-500 focus:outline-none"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              upsertAppointment({ ...appt, boxId: e.target.value });
                            }
                          }}
                        >
                          <option value="" disabled>
                            Asignar a…
                          </option>
                          {db.boxes.map((box) => (
                            <option key={box.id} value={box.id}>
                              {box.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {db.boxes.length === 0 && (
                        <span className="text-xs text-clinic-muted">
                          (Crea boxes primero)
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </Card>
      </Reveal>

      {/* ── Modal: agregar box ────────────────────────────────────────────── */}
      {addingBox && (
        <BoxFormModal
          onClose={() => setAddingBox(false)}
          onSave={(b) => {
            addBox(b);
            setAddingBox(false);
          }}
        />
      )}

      {/* ── Modal: editar box ─────────────────────────────────────────────── */}
      {editingBox && (
        <BoxFormModal
          box={editingBox}
          onClose={() => setEditingBox(null)}
          onSave={(b) => {
            updateBox(b);
            setEditingBox(null);
          }}
        />
      )}
    </div>
  );
}

/* ===== Modal crear / editar box ===== */
function BoxFormModal({
  box,
  onClose,
  onSave,
}: {
  box?: Box;
  onClose: () => void;
  onSave: (b: Box) => void;
}) {
  const [name, setName] = useState(box?.name ?? "");
  const [color, setColor] = useState(box?.color ?? COLOR_OPTIONS[0].value);
  const isNew = !box;

  return (
    <Modal title={isNew ? "Nuevo box" : "Editar box"} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSave({
            id: box?.id ?? crypto.randomUUID(),
            name: name.trim(),
            color,
          });
        }}
      >
        <Field label="Nombre del box">
          <input
            required
            autoFocus
            className={inputCls}
            placeholder="Ej.: Box 1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Color identificador">
          <div className="flex flex-wrap gap-2 pt-1">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setColor(opt.value)}
                title={opt.label}
                className={`h-8 w-8 rounded-full border-2 transition-all ${
                  color === opt.value
                    ? "border-navy-800 scale-110 shadow-md"
                    : "border-transparent hover:scale-105"
                }`}
                style={{ background: opt.value }}
                aria-label={opt.label}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded border-none bg-transparent"
              title="Color personalizado"
            />
            <span className="text-xs text-clinic-muted">o ingresá un color personalizado</span>
          </div>
        </Field>
        {/* preview */}
        <div className="flex items-center gap-2.5 rounded-xl border border-clinic-border p-3">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ background: color }}
          />
          <span className="text-sm font-bold text-clinic-text">
            {name.trim() || "Nombre del box"}
          </span>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="outline" onClick={onClose}>
            Cancelar
          </Btn>
          <Btn type="submit" disabled={!name.trim()}>
            {isNew ? "Crear box" : "Guardar cambios"}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

/* ===== Pequeño indicador de estado para las citas en el grid ===== */
function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmada: "bg-state-ok",
    pendiente: "bg-state-warn",
    completada: "bg-azure-500",
    cancelada: "bg-state-err",
  };
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${map[status] ?? "bg-clinic-muted"}`}
      title={status}
    />
  );
}
