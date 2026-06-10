"use client";
/** Módulo de Agenda (sec. 3.1): vista calendario semanal + vista lista, sincronizadas. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, CalendarDays, List, MoreHorizontal, Eye, Pencil, Trash2, Plus, User,
  MessageCircle, Hourglass, BellRing,
} from "lucide-react";
import { useStore, fmtGs, fmtTime, fmtDate, fullName, waLink, fillReminder } from "@/lib/store";
import { botikaEnabled, makeOutboxTask, botikaMessage } from "@/lib/botika";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import { Card, Btn, Modal, Field, inputCls, StatusBadge, Badge, Empty } from "@/components/ui";

/* ===== helpers de semana ===== */
function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const STATUS_BG: Record<AppointmentStatus, string> = {
  confirmada: "bg-state-okbg border-state-ok/30 text-state-ok",
  pendiente: "bg-state-warnbg border-state-warn/30 text-state-warn",
  completada: "bg-state-infobg border-azure-300/40 text-azure-700",
  cancelada: "bg-state-errbg border-state-err/30 text-state-err line-through",
};

export default function AgendaPage() {
  const { db, session, upsertAppointment, deleteAppointment, setOnboarding, removeWaitlist, addOutboxTask } = useStore();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [viewing, setViewing] = useState<Appointment | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [waitOpen, setWaitOpen] = useState(false);
  const [fromWaitlist, setFromWaitlist] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  /* marcar tour al visitar agenda */
  useEffect(() => {
    if (!db.onboarding.tourDone) setOnboarding("tourDone", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* auto-scroll a las 08:00 */
  useEffect(() => {
    gridRef.current?.scrollTo({ top: 8 * 56 - 8 });
  }, [view, weekStart]);

  const weekEnd = addDays(weekStart, 7);
  const weekAppointments = useMemo(
    () =>
      db.appointments
        .filter((a) => {
          const t = new Date(a.start);
          return t >= weekStart && t < weekEnd;
        })
        .sort((a, b) => a.start.localeCompare(b.start)),
    [db.appointments, weekStart, weekEnd]
  );

  const today = new Date();

  function quickCreate(dayIdx: number, hour: number) {
    const start = addDays(weekStart, dayIdx);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 1);
    setEditing({
      id: `a_${Date.now()}`,
      clinicId: session!.clinicId,
      patientId: db.patients[0]?.id ?? "",
      dentistId: db.users.find((u) => u.role === "dentist")?.id ?? "",
      title: "",
      start: start.toISOString(),
      end: end.toISOString(),
      status: "pendiente",
      amount: 0,
      discount: 0,
    });
  }

  return (
    <div className="space-y-5">
      {/* Header: navegación + toggle de vista */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-clinic-text">Agenda</h1>
          <p className="text-sm text-clinic-muted">
            Semana del {weekStart.toLocaleDateString("es-PY", { day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-clinic-border bg-white">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="px-2.5 py-2 hover:bg-clinic-bg" aria-label="Semana anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setWeekStart(mondayOf(new Date()))} className="border-x border-clinic-border px-3 py-2 text-sm font-bold text-azure-600 hover:bg-clinic-bg">
              Hoy
            </button>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="px-2.5 py-2 hover:bg-clinic-bg" aria-label="Semana siguiente">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex overflow-hidden rounded-xl border border-clinic-border bg-white">
            <button
              onClick={() => setView("calendar")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-bold ${view === "calendar" ? "bg-azure-600 text-white" : "hover:bg-clinic-bg"}`}
            >
              <CalendarDays className="h-4 w-4" /> Calendario
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-bold ${view === "list" ? "bg-azure-600 text-white" : "hover:bg-clinic-bg"}`}
            >
              <List className="h-4 w-4" /> Lista
            </button>
          </div>
          <Btn variant="outline" onClick={() => setWaitOpen(true)}>
            <Hourglass className="h-4 w-4" /> Lista de espera
            {db.waitlist.length > 0 && <span className="rounded-full bg-azure-600 px-1.5 font-mono text-[10px] font-bold text-white">{db.waitlist.length}</span>}
          </Btn>
          <Btn onClick={() => quickCreate(((today.getDay() + 6) % 7), Math.min(today.getHours() + 1, 22))}>
            <Plus className="h-4 w-4" /> Nueva cita
          </Btn>
        </div>
      </div>

      {view === "calendar" ? (
        /* ===== VISTA CALENDARIO SEMANAL (00:00–23:59) ===== */
        <Card className="overflow-hidden">
          {/* cabecera de días */}
          <div className="grid border-b border-clinic-border" style={{ gridTemplateColumns: "56px repeat(7,1fr)" }}>
            <div />
            {DAYS.map((d, i) => {
              const date = addDays(weekStart, i);
              const isToday = date.toDateString() === today.toDateString();
              return (
                <div key={d} className={`border-l border-clinic-border px-2 py-2.5 text-center ${isToday ? "bg-azure-50" : ""}`}>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-clinic-muted">{d}</div>
                  <div className={`text-lg font-extrabold ${isToday ? "text-azure-600" : "text-clinic-text"}`}>{date.getDate()}</div>
                </div>
              );
            })}
          </div>
          {/* grilla 24h */}
          <div ref={gridRef} className="max-h-[560px] overflow-y-auto">
            <div className="relative grid" style={{ gridTemplateColumns: "56px repeat(7,1fr)" }}>
              {/* columna de horas */}
              <div>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="flex h-14 items-start justify-end border-b border-clinic-border/60 pr-2 pt-1">
                    <span className="font-mono text-[10px] text-clinic-muted">{String(h).padStart(2, "0")}:00</span>
                  </div>
                ))}
              </div>
              {/* días */}
              {Array.from({ length: 7 }, (_, dayIdx) => {
                const date = addDays(weekStart, dayIdx);
                const isToday = date.toDateString() === today.toDateString();
                const dayAppts = weekAppointments.filter((a) => new Date(a.start).getDay() === ((dayIdx + 1) % 7));
                return (
                  <div key={dayIdx} className={`relative border-l border-clinic-border ${isToday ? "bg-azure-50/40" : ""}`}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <button
                        key={h}
                        onClick={() => quickCreate(dayIdx, h)}
                        className="block h-14 w-full border-b border-clinic-border/60 transition-colors hover:bg-azure-50"
                        aria-label={`Crear cita ${DAYS[dayIdx]} ${h}:00`}
                      />
                    ))}
                    {/* citas posicionadas */}
                    {dayAppts.map((a) => {
                      const s = new Date(a.start);
                      const e = new Date(a.end);
                      const top = (s.getHours() + s.getMinutes() / 60) * 56;
                      const height = Math.max(28, ((e.getTime() - s.getTime()) / 3600000) * 56 - 3);
                      const p = db.patients.find((x) => x.id === a.patientId);
                      const dent = db.users.find((x) => x.id === a.dentistId);
                      return (
                        <button
                          key={a.id}
                          onClick={(ev) => { ev.stopPropagation(); setViewing(a); }}
                          style={{ top, height }}
                          className={`absolute left-1 right-1 overflow-hidden rounded-lg border px-2 py-1 text-left text-[11px] font-semibold shadow-card transition-all duration-150 hover:z-10 hover:-translate-y-px hover:shadow-pop ${STATUS_BG[a.status]}`}
                        >
                          <div className="flex items-center gap-1 truncate">
                            {dent && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dent.color }} title={dent.name} />}
                            <span className="truncate">{fmtTime(a.start)} · {a.title || "Cita"}</span>
                          </div>
                          {p && <div className="truncate font-normal opacity-80">{fullName(p)}</div>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      ) : (
        /* ===== VISTA LISTA DE TAREAS ===== */
        <Card className="overflow-x-auto">
          {weekAppointments.length === 0 ? (
            <Empty title="Sin citas esta semana" desc="Creá una desde el botón Nueva cita o haciendo clic en el calendario." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Inicio</th>
                  <th className="px-4 py-3">Fin</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Importe total</th>
                  <th className="px-4 py-3 text-right">Descuento</th>
                  <th className="px-4 py-3 text-right">Total a cobrar</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-clinic-border">
                {weekAppointments.map((a) => {
                  const p = db.patients.find((x) => x.id === a.patientId);
                  return (
                    <tr key={a.id} className="hover:bg-clinic-bg/60">
                      <td className="px-4 py-3">
                        <div className="font-bold text-clinic-text">{a.title || "Cita"}</div>
                        {p && (
                          <a href={`/app/pacientes/${p.id}`} className="inline-flex items-center gap-1 text-xs text-azure-600 hover:underline">
                            <User className="h-3 w-3" /> {fullName(p)}
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{new Date(a.start).toLocaleDateString("es-PY", { day: "2-digit", month: "short" })} {fmtTime(a.start)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{fmtTime(a.end)}</td>
                      <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{fmtGs(a.amount)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-state-warn">{a.discount ? "−" + fmtGs(a.discount) : "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-bold text-clinic-text">{fmtGs(a.amount - a.discount)}</td>
                      <td className="relative px-2 py-3">
                        <button onClick={() => setMenuFor(menuFor === a.id ? null : a.id)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-clinic-bg" aria-label="Acciones">
                          <MoreHorizontal className="h-4 w-4 text-clinic-muted" />
                        </button>
                        {menuFor === a.id && (
                          <div className="absolute right-2 top-11 z-20 w-36 overflow-hidden rounded-xl border border-clinic-border bg-white shadow-pop">
                            <button onClick={() => { setViewing(a); setMenuFor(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-clinic-bg"><Eye className="h-3.5 w-3.5" /> Ver</button>
                            <button onClick={() => { setEditing(a); setMenuFor(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-clinic-bg"><Pencil className="h-3.5 w-3.5" /> Editar</button>
                            <button onClick={() => { deleteAppointment(a.id); setMenuFor(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-state-err hover:bg-state-errbg"><Trash2 className="h-3.5 w-3.5" /> Eliminar</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Modal VER */}
      {viewing && (
        <Modal title={viewing.title || "Cita"} onClose={() => setViewing(null)}>
          {(() => {
            const p = db.patients.find((x) => x.id === viewing.patientId);
            const d = db.users.find((x) => x.id === viewing.dentistId);
            const clinic = db.clinics[0];
            const live = db.appointments.find((x) => x.id === viewing.id) ?? viewing;
            const reminderMsg = p
              ? fillReminder(
                  clinic.config.reminderTemplate ?? "Hola {paciente}, te recordamos tu cita en {clinica} el {fecha} a las {hora}.",
                  {
                    paciente: p.firstName,
                    fecha: new Date(live.start).toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" }),
                    hora: fmtTime(live.start),
                    clinica: clinic.name,
                  }
                )
              : "";
            return (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-clinic-muted">Estado</span><StatusBadge status={live.status} /></div>
                <div className="flex items-center justify-between"><span className="text-clinic-muted">Paciente</span>{p ? <a className="font-bold text-azure-600 hover:underline" href={`/app/pacientes/${p.id}`}>{fullName(p)}</a> : "—"}</div>
                <div className="flex items-center justify-between"><span className="text-clinic-muted">Dentista</span><span className="font-semibold">{d?.name ?? "—"}</span></div>
                <div className="flex items-center justify-between"><span className="text-clinic-muted">Horario</span><span className="font-mono text-xs">{new Date(live.start).toLocaleString("es-PY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} → {fmtTime(live.end)}</span></div>
                <div className="flex items-center justify-between"><span className="text-clinic-muted">Total a cobrar</span><span className="font-mono font-bold">{fmtGs(live.amount - live.discount)}</span></div>
                {live.notes && <p className="rounded-xl bg-clinic-bg p-3 text-clinic-text">{live.notes}</p>}

                {/* Confirmación de citas */}
                {p && (
                  <div className="rounded-xl border border-clinic-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-clinic-muted">
                        <BellRing className="h-3.5 w-3.5" /> Confirmación de cita
                      </span>
                      {live.reminderSent ? <Badge tone="ok" tip="Ya se envió el recordatorio">Enviado</Badge> : <Badge tone="warn" tip="Aún sin recordatorio">Pendiente</Badge>}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <a
                        href={waLink(p.phone, reminderMsg)}
                        target="_blank" rel="noopener noreferrer"
                        onClick={() => upsertAppointment({ ...live, reminderSent: true })}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366]/10 px-3.5 py-2 text-xs font-bold text-[#128C7E] transition-colors hover:bg-[#25D366]/20"
                      >
                        <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
                      </a>
                      <button
                        onClick={() => upsertAppointment({ ...live, reminderSent: !live.reminderSent })}
                        className="rounded-xl border border-clinic-border px-3 py-2 text-xs font-bold text-clinic-muted hover:text-clinic-text"
                      >
                        {live.reminderSent ? "Marcar como no enviado" : "Marcar como enviado"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Btn variant="outline" onClick={() => { setEditing(live); setViewing(null); }}><Pencil className="h-3.5 w-3.5" /> Editar</Btn>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Modal LISTA DE ESPERA */}
      {waitOpen && (
        <WaitlistModal
          onClose={() => setWaitOpen(false)}
          onSchedule={(entry) => {
            const start = new Date();
            start.setDate(start.getDate() + 1);
            start.setHours(9, 0, 0, 0);
            const end = new Date(start); end.setHours(10);
            setFromWaitlist(entry.id);
            setEditing({
              id: `a_${Date.now()}`, clinicId: session!.clinicId, patientId: entry.patientId,
              dentistId: db.users.find((u) => u.role === "dentist")?.id ?? "",
              title: entry.reason, start: start.toISOString(), end: end.toISOString(),
              status: "pendiente", amount: 0, discount: 0,
            });
            setWaitOpen(false);
          }}
        />
      )}

      {/* Modal CREAR/EDITAR */}
      {editing && (
        <ApptForm
          appt={editing}
          onClose={() => { setEditing(null); setFromWaitlist(null); }}
          onSave={(a) => {
            const old = db.appointments.find((x) => x.id === a.id);
            const isNew = !old;
            upsertAppointment(a);
            if (fromWaitlist) removeWaitlist(fromWaitlist);
            /* Botika: cita cancelada → ofrecer reagendamiento automático */
            if (old && old.status !== "cancelada" && a.status === "cancelada" && botikaEnabled(db, "reagendar")) {
              const p = db.patients.find((x) => x.id === a.patientId);
              if (p?.phone) {
                addOutboxTask(
                  makeOutboxTask({
                    db, type: "reagendar", patient: p, refId: a.id, by: session!.name,
                    message: botikaMessage(db, "reagendar", {
                      paciente: p.firstName,
                      clinica: db.clinics[0].name,
                      titulo: a.title || "Cita",
                      fecha: new Date(a.start).toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" }),
                      hora: fmtTime(a.start),
                    }),
                  })
                );
              }
            }
            /* Botika: cita nueva → encolar confirmación automática */
            if (isNew && a.status !== "cancelada" && botikaEnabled(db, "confirmCita")) {
              const p = db.patients.find((x) => x.id === a.patientId);
              if (p?.phone) {
                addOutboxTask(
                  makeOutboxTask({
                    db, type: "confirmar_cita", patient: p, refId: a.id, by: session!.name,
                    message: botikaMessage(db, "confirmCita", {
                      paciente: p.firstName,
                      clinica: db.clinics[0].name,
                      titulo: a.title || "Cita",
                      fecha: new Date(a.start).toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" }),
                      hora: fmtTime(a.start),
                    }),
                  })
                );
              }
            }
            setEditing(null); setFromWaitlist(null);
          }}
        />
      )}
    </div>
  );
}

/* ===== Lista de espera ===== */
function WaitlistModal({ onClose, onSchedule }: { onClose: () => void; onSchedule: (e: import("@/lib/types").WaitlistEntry) => void }) {
  const { db, addWaitlist, removeWaitlist } = useStore();
  const [adding, setAdding] = useState(false);
  const [patientId, setPatientId] = useState(db.patients[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [preference, setPreference] = useState("");
  const list = [...db.waitlist].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <Modal title="Lista de espera" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-clinic-muted">Pacientes esperando un hueco — agendalos cuando se libere un horario.</p>
          <Btn variant="outline" onClick={() => setAdding((v) => !v)}><Plus className="h-3.5 w-3.5" /> Agregar</Btn>
        </div>

        {adding && (
          <div className="grid gap-2 rounded-xl border border-clinic-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <select className={inputCls} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              {db.patients.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
            </select>
            <input className={inputCls} placeholder="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
            <input className={inputCls} placeholder="Preferencia horaria" value={preference} onChange={(e) => setPreference(e.target.value)} />
            <Btn
              disabled={!reason.trim()}
              onClick={() => {
                addWaitlist({ id: `w_${Date.now()}`, clinicId: db.clinics[0].id, patientId, reason: reason.trim(), preference: preference.trim() || "Sin preferencia", createdAt: new Date().toISOString() });
                setReason(""); setPreference(""); setAdding(false);
              }}
            >
              Guardar
            </Btn>
          </div>
        )}

        {list.length === 0 ? (
          <Empty title="Lista de espera vacía" />
        ) : (
          <ul className="space-y-2">
            {list.map((w) => {
              const p = db.patients.find((x) => x.id === w.patientId);
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-clinic-bg p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-clinic-text">{p ? fullName(p) : "—"}</span>
                    <span className="block text-xs text-clinic-muted">{w.reason} · {w.preference} · en espera desde {fmtDate(w.createdAt)}</span>
                  </span>
                  <Btn onClick={() => onSchedule(w)}><CalendarDays className="h-3.5 w-3.5" /> Agendar</Btn>
                  <button onClick={() => removeWaitlist(w.id)} className="grid h-8 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err" title="Quitar de la lista">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function ApptForm({ appt, onClose, onSave }: { appt: Appointment; onClose: () => void; onSave: (a: Appointment) => void }) {
  const { db } = useStore();
  const [form, setForm] = useState(appt);
  const [conflict, setConflict] = useState<string | null>(null);
  const isNew = !db.appointments.some((x) => x.id === appt.id);

  const toLocal = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  /** Validación de negocio: el dentista no puede tener dos citas solapadas. */
  function findConflict(a: Appointment): string | null {
    const s = new Date(a.start).getTime();
    const e = new Date(a.end).getTime();
    if (e <= s) return "La hora de fin debe ser posterior a la de inicio.";
    const clash = db.appointments.find(
      (x) =>
        x.id !== a.id &&
        x.dentistId === a.dentistId &&
        x.status !== "cancelada" &&
        new Date(x.start).getTime() < e &&
        new Date(x.end).getTime() > s
    );
    if (clash) {
      const p = db.patients.find((y) => y.id === clash.patientId);
      return `El dentista ya tiene una cita en ese horario: "${clash.title}"${p ? ` con ${fullName(p)}` : ""} (${fmtTime(clash.start)}–${fmtTime(clash.end)}).`;
    }
    return null;
  }

  return (
    <Modal title={isNew ? "Nueva cita" : "Editar cita"} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const c = findConflict(form);
          setConflict(c);
          if (!c) onSave(form);
        }}
      >
        <Field label="Título"><input required className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej.: Profilaxis" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paciente">
            <select className={inputCls} value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
              {db.patients.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
            </select>
          </Field>
          <Field label="Dentista">
            <select className={inputCls} value={form.dentistId} onChange={(e) => setForm({ ...form, dentistId: e.target.value })}>
              {db.users.filter((u) => u.role === "dentist").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio"><input type="datetime-local" required className={inputCls} value={toLocal(form.start)} onChange={(e) => setForm({ ...form, start: new Date(e.target.value).toISOString() })} /></Field>
          <Field label="Fin"><input type="datetime-local" required className={inputCls} value={toLocal(form.end)} onChange={(e) => setForm({ ...form, end: new Date(e.target.value).toISOString() })} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Estado">
            <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AppointmentStatus })}>
              <option value="pendiente">Pendiente</option>
              <option value="confirmada">Confirmada</option>
              <option value="completada">Completada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </Field>
          <Field label="Importe (Gs)"><input type="number" min={0} className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} /></Field>
          <Field label="Descuento (Gs)"><input type="number" min={0} className={inputCls} value={form.discount} onChange={(e) => setForm({ ...form, discount: +e.target.value })} /></Field>
        </div>
        <Field label="Notas"><textarea className={inputCls} rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        {conflict && (
          <p role="alert" className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-state-err">
            ⚠ {conflict}
          </p>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-clinic-muted">Total a cobrar: <b className="font-mono text-clinic-text">{fmtGs(form.amount - form.discount)}</b></span>
          <div className="flex gap-2">
            <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
            <Btn type="submit">{isNew ? "Crear cita" : "Guardar cambios"}</Btn>
          </div>
        </div>
      </form>
    </Modal>
  );
}
