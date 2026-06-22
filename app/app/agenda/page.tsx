"use client";
/** Módulo de Agenda estilo Dentalink: vista Diaria (sidebar fecha + profesional +
 *  leyenda de estados; tabla Hora/Paciente/Doctor/Estado/Situación) · Diaria global ·
 *  Semanal (grilla 24h) · Reprogramación. Modales VER/Lista de espera/Crear-editar. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, CalendarDays, CalendarRange, List, MoreHorizontal, Eye, Pencil, Trash2, Plus, User, Video,
  MessageCircle, Hourglass, BellRing, Users, AlertTriangle, Printer, Search, Phone, ChevronDown,
} from "lucide-react";
import { buildICS, toICSDate, downloadICS, type ICSEvent } from "@/lib/ical";
import { newSignToken } from "@/lib/firma";
import { useStore, fmtGs, fmtTime, fmtDate, fullName, waLink, fillReminder } from "@/lib/store";
import { botikaEnabled, makeOutboxTask, botikaMessage } from "@/lib/botika";
import { patientBalance } from "@/lib/budgets";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import { Card, Btn, Modal, Field, inputCls, StatusBadge, Badge, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";

/* ===== helpers de fecha ===== */
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
const dayKeyOf = (d: Date | string) => new Date(d).toLocaleDateString("en-CA");
const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const STATUS_BG: Record<AppointmentStatus, string> = {
  confirmada: "bg-state-okbg border-state-ok/30 text-state-ok",
  en_atencion: "bg-azure-50 border-azure-400/50 text-azure-700",
  pendiente: "bg-state-warnbg border-state-warn/30 text-state-warn",
  completada: "bg-state-infobg border-azure-300/40 text-azure-700",
  cancelada: "bg-state-errbg border-state-err/30 text-state-err line-through",
  ausente: "bg-state-warnbg border-state-warn/30 text-state-warn",
};
/* Estados de cita estilo Dentalink */
const ALL_STATUSES: AppointmentStatus[] = ["confirmada", "en_atencion", "pendiente", "completada", "cancelada", "ausente"];
const STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmada: "Confirmado", en_atencion: "En atención", pendiente: "No confirmado", completada: "Atendido", cancelada: "Cancelado", ausente: "Ausente",
};
const STATUS_DOT: Record<AppointmentStatus, string> = {
  confirmada: "#0E9F6E", en_atencion: "#14A6C0", pendiente: "#94A3B8", completada: "#2E83F5", cancelada: "#E24B4A", ausente: "#F59E0B",
};

type Tab = "diaria" | "global" | "semanal" | "mensual" | "reprog";

/* ===== Vista MENSUAL (calendario del mes) ===== */
function MonthView({ day, setDay, setTab, appointments }: { day: Date; setDay: (d: Date) => void; setTab: (t: Tab) => void; appointments: Appointment[] }) {
  const y = day.getFullYear(), m = day.getMonth();
  const first = new Date(y, m, 1);
  const startWeekday = (first.getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayKey = dayKeyOf(new Date());
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    appointments.forEach((a) => { const k = dayKeyOf(a.start); const arr = map.get(k) ?? []; arr.push(a); map.set(k, arr); });
    map.forEach((arr) => arr.sort((a, b) => a.start.localeCompare(b.start)));
    return map;
  }, [appointments]);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const monthLabel = first.toLocaleDateString("es-PY", { month: "long", year: "numeric" });
  const WD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <Reveal>
      <div className="mb-2 flex items-center gap-2">
        <button onClick={() => setDay(new Date(y, m - 1, 1))} className="grid h-9 w-9 place-items-center rounded-xl border border-clinic-border bg-white hover:bg-clinic-bg" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={() => setDay(new Date())} className="rounded-xl border border-clinic-border bg-white px-3 py-2 text-sm font-bold text-azure-600 hover:bg-clinic-bg">Este mes</button>
        <button onClick={() => setDay(new Date(y, m + 1, 1))} className="grid h-9 w-9 place-items-center rounded-xl border border-clinic-border bg-white hover:bg-clinic-bg" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
        <span className="ml-1 text-sm font-bold capitalize text-clinic-text">{monthLabel}</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-clinic-border bg-white">
        <div className="grid grid-cols-7 border-b border-clinic-border bg-clinic-bg/50 text-center text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
          {WD.map((w) => <div key={w} className="py-2">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c, i) => {
            if (!c) return <div key={i} className="min-h-[88px] border-b border-r border-clinic-border bg-clinic-bg/20" />;
            const k = dayKeyOf(c);
            const appts = byDay.get(k) ?? [];
            const isToday = k === todayKey;
            return (
              <button key={i} onClick={() => { setDay(c); setTab("diaria"); }} className={`min-h-[88px] border-b border-r border-clinic-border p-1.5 text-left align-top transition-colors hover:bg-azure-50 ${isToday ? "bg-azure-50/60" : ""}`}>
                <div className={`mb-1 inline-grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${isToday ? "bg-azure-600 text-white" : "text-clinic-text"}`}>{c.getDate()}</div>
                {appts.length > 0 && (
                  <div className="space-y-0.5">
                    {appts.slice(0, 3).map((a) => (
                      <div key={a.id} className="flex items-center gap-1 truncate text-[10px] text-clinic-muted">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_DOT[a.status] }} />
                        <span className="truncate">{a.start.slice(11, 16)} {a.title || "Cita"}</span>
                      </div>
                    ))}
                    {appts.length > 3 && <div className="text-[10px] font-bold text-azure-700">+{appts.length - 3} más</div>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Reveal>
  );
}

export default function AgendaPage() {
  const { db, session, upsertAppointment, deleteAppointment, setOnboarding, removeWaitlist, addOutboxTask } = useStore();
  const [tab, setTab] = useState<Tab>("diaria");
  const [day, setDay] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [proFilter, setProFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<Set<AppointmentStatus>>(new Set(ALL_STATUSES));
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [viewing, setViewing] = useState<Appointment | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [waitOpen, setWaitOpen] = useState(false);
  const [fromWaitlist, setFromWaitlist] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!db.onboarding.tourDone) setOnboarding("tourDone", true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "semanal") gridRef.current?.scrollTo({ top: 8 * 56 - 8 }); }, [tab, weekStart]);

  const dentists = db.users.filter((u) => u.role === "dentist");
  const today = new Date();
  const todayKey = dayKeyOf(today);
  const selKey = dayKeyOf(day);

  /* — Diaria / Diaria global — */
  const dayAll = useMemo(
    () => db.appointments.filter((a) => dayKeyOf(a.start) === selKey).sort((a, b) => a.start.localeCompare(b.start)),
    [db.appointments, selKey]
  );
  const mainBranchId = db.branches.find((b) => b.isMain)?.id;
  const dayAllPro = useMemo(
    () => dayAll.filter((a) => {
      const okBranch = branchFilter === "all" || (a.branchId ?? mainBranchId) === branchFilter;
      const okPro = tab === "global" || proFilter === "all" || a.dentistId === proFilter;
      return okBranch && okPro;
    }),
    [dayAll, tab, proFilter, branchFilter, mainBranchId]
  );
  const dayAppts = useMemo(() => {
    const t = q.trim().toLowerCase();
    return dayAllPro.filter((a) => {
      if (!statusFilter.has(a.status)) return false;
      if (!t) return true;
      const p = db.patients.find((x) => x.id === a.patientId);
      return p ? fullName(p).toLowerCase().includes(t) : false;
    });
  }, [dayAllPro, statusFilter, q, db.patients]);

  /* — Semanal — */
  const weekEnd = addDays(weekStart, 7);
  const weekAppointments = useMemo(
    () => db.appointments.filter((a) => { const t = new Date(a.start); return t >= weekStart && t < weekEnd; }).sort((a, b) => a.start.localeCompare(b.start)),
    [db.appointments, weekStart, weekEnd]
  );

  /* — Reprogramación: canceladas a reagendar — */
  const reprog = useMemo(
    () => db.appointments.filter((a) => a.status === "cancelada").sort((a, b) => b.start.localeCompare(a.start)),
    [db.appointments]
  );

  /* — Mensual: citas del mes de `day` — */
  const monthAppts = useMemo(() => {
    const y = day.getFullYear(), m = day.getMonth();
    return db.appointments.filter((a) => { const t = new Date(a.start); return t.getFullYear() === y && t.getMonth() === m; });
  }, [db.appointments, day]);

  const porValidar = dayAllPro.filter((a) => a.source === "online" && a.status === "pendiente").length;
  const headerCount = tab === "semanal" ? weekAppointments.length : tab === "mensual" ? monthAppts.length : tab === "reprog" ? reprog.length : dayAppts.length;

  /* — Exportar agenda a .ics (calendario universal: Outlook/Apple/Google) — */
  const apptToICS = (a: Appointment): ICSEvent => {
    const pat = db.patients.find((x) => x.id === a.patientId);
    const dent = db.users.find((x) => x.id === a.dentistId);
    const branch = a.branchId ? db.branches.find((b) => b.id === a.branchId)?.name : undefined;
    return {
      uid: `${a.id}@novudent`, start: a.start, end: a.end,
      title: `${pat ? fullName(pat) : "Paciente"} — ${a.title || "Cita"}`,
      description: [dent && `Profesional: ${dent.name}`, a.telemed && "Videoconsulta", a.notes].filter(Boolean).join("\n") || undefined,
      location: [db.clinics[0]?.name, branch].filter(Boolean).join(" · ") || undefined,
    };
  };
  const exportICS = () => {
    const list = tab === "semanal" ? weekAppointments : tab === "mensual" ? monthAppts : tab === "reprog" ? reprog : dayAppts;
    if (list.length === 0) return;
    downloadICS(`agenda-novudent-${selKey}`, buildICS(list.map(apptToICS), toICSDate(new Date().toISOString())));
  };

  function newAppt(base: Date) {
    const start = new Date(base);
    if (start.getHours() === 0) start.setHours(Math.min(today.getHours() + 1, 19), 0, 0, 0);
    const end = new Date(start); end.setHours(start.getHours() + 1);
    setEditing({
      id: `a_${Date.now()}`, clinicId: session!.clinicId, patientId: db.patients[0]?.id ?? "",
      dentistId: dentists[0]?.id ?? "", title: "", start: start.toISOString(), end: end.toISOString(),
      status: "pendiente", amount: 0, discount: 0,
    });
  }
  function quickCreate(dayIdx: number, hour: number) {
    const start = addDays(weekStart, dayIdx); start.setHours(hour, 0, 0, 0);
    const end = new Date(start); end.setHours(hour + 1);
    setEditing({
      id: `a_${Date.now()}`, clinicId: session!.clinicId, patientId: db.patients[0]?.id ?? "",
      dentistId: dentists[0]?.id ?? "", title: "", start: start.toISOString(), end: end.toISOString(),
      status: "pendiente", amount: 0, discount: 0,
    });
  }
  const reagendar = (a: Appointment) => {
    // Pre-carga la cita cancelada (paciente/dentista/título/importe) en una nueva.
    const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(9, 0, 0, 0);
    const end = new Date(start); end.setHours(10);
    setEditing({ ...a, id: `a_${Date.now()}`, start: start.toISOString(), end: end.toISOString(), status: "pendiente" });
  };
  const toggleStatus = (s: AppointmentStatus) =>
    setStatusFilter((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  /* Cambiar estado; cancelada/ausente piden motivo. */
  const setEstado = (a: Appointment, s: AppointmentStatus) => {
    let cancelReason = a.cancelReason;
    if (s === "cancelada" || s === "ausente") {
      const r = window.prompt(`Motivo (${STATUS_LABEL[s].toLowerCase()}):`, a.cancelReason ?? "");
      if (r === null) return;
      cancelReason = r.trim() || undefined;
    } else {
      cancelReason = undefined;
    }
    upsertAppointment({ ...a, status: s, cancelReason });
  };

  const TABS: [Tab, string, any][] = [
    ["diaria", "Diaria", List], ["semanal", "Semanal", CalendarDays], ["mensual", "Mensual", CalendarRange],
    ["global", "Diaria global", Users], ["reprog", "Reprogramación", AlertTriangle],
  ];

  return (
    <div className="space-y-4">
      {/* Header estilo Dentalink: título + tabs + acciones */}
      <Reveal className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-extrabold text-clinic-text">Agenda</h1>
          <span className="rounded-full bg-azure-50 px-2 py-0.5 font-mono text-[11px] font-bold text-azure-700">{headerCount} citas</span>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-clinic-border bg-white p-1">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${tab === k ? "bg-navy-800 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Btn onClick={() => newAppt(tab === "semanal" ? new Date() : day)}><Plus className="h-4 w-4" /> Dar cita</Btn>
          <label className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-clinic-border bg-white px-3 py-2 text-sm font-bold text-clinic-muted hover:text-clinic-text">
            <CalendarDays className="h-4 w-4" /> Fecha
            <input type="date" value={selKey} onChange={(e) => e.target.value && setDay(new Date(e.target.value + "T00:00:00"))} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Elegir fecha" />
          </label>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl border border-clinic-border bg-white px-3 py-2 text-sm font-bold text-clinic-muted hover:text-clinic-text"><Printer className="h-4 w-4" /> Imprimir</button>
          <button onClick={exportICS} title="Exportar a tu calendario (Outlook/Apple/Google)" className="inline-flex items-center gap-1.5 rounded-xl border border-clinic-border bg-white px-3 py-2 text-sm font-bold text-clinic-muted hover:text-clinic-text"><CalendarDays className="h-4 w-4" /> Exportar (.ics)</button>
          <Btn variant="outline" onClick={() => setWaitOpen(true)}>
            <Hourglass className="h-4 w-4" /> Lista de espera
            {db.waitlist.length > 0 && <span className="rounded-full bg-azure-600 px-1.5 font-mono text-[10px] font-bold text-white">{db.waitlist.length}</span>}
          </Btn>
        </div>
      </Reveal>

      {/* Banner: citas por validar */}
      {(tab === "diaria" || tab === "global") && porValidar > 0 && (
        <Reveal className="flex flex-wrap items-center gap-2 rounded-xl border border-state-ok/30 bg-state-okbg px-4 py-2.5 text-sm text-state-ok">
          <BellRing className="h-4 w-4" /> Hay {porValidar} agendamiento(s) online que deben ser validados.
          <button onClick={() => setStatusFilter(new Set(["pendiente"]))} className="font-bold underline">Ver y validar</button>
        </Reveal>
      )}

      {tab === "semanal" ? (
        /* ===== SEMANAL (grilla 24h) ===== */
        <Reveal>
          <div className="mb-2 flex items-center gap-2">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="grid h-9 w-9 place-items-center rounded-xl border border-clinic-border bg-white hover:bg-clinic-bg" aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setWeekStart(mondayOf(new Date()))} className="rounded-xl border border-clinic-border bg-white px-3 py-2 text-sm font-bold text-azure-600 hover:bg-clinic-bg">Esta semana</button>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="grid h-9 w-9 place-items-center rounded-xl border border-clinic-border bg-white hover:bg-clinic-bg" aria-label="Semana siguiente"><ChevronRight className="h-4 w-4" /></button>
            <span className="ml-1 text-sm text-clinic-muted">Semana del {weekStart.toLocaleDateString("es-PY", { day: "numeric", month: "long" })}</span>
          </div>
          <Card className="overflow-hidden">
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
            <div ref={gridRef} className="max-h-[560px] overflow-y-auto">
              <div className="relative grid" style={{ gridTemplateColumns: "56px repeat(7,1fr)" }}>
                <div>
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="flex h-14 items-start justify-end border-b border-clinic-border/60 pr-2 pt-1">
                      <span className="font-mono text-[10px] text-clinic-muted">{String(h).padStart(2, "0")}:00</span>
                    </div>
                  ))}
                </div>
                {Array.from({ length: 7 }, (_, dayIdx) => {
                  const date = addDays(weekStart, dayIdx);
                  const isToday = date.toDateString() === today.toDateString();
                  const dayAppts2 = weekAppointments.filter((a) => new Date(a.start).getDay() === ((dayIdx + 1) % 7));
                  return (
                    <div key={dayIdx} className={`relative border-l border-clinic-border ${isToday ? "bg-azure-50/40" : ""}`}>
                      {Array.from({ length: 24 }, (_, h) => (
                        <button key={h} onClick={() => quickCreate(dayIdx, h)} className="block h-14 w-full border-b border-clinic-border/60 transition-colors hover:bg-azure-50" aria-label={`Crear cita ${DAYS[dayIdx]} ${h}:00`} />
                      ))}
                      {dayAppts2.map((a) => {
                        const s = new Date(a.start); const e = new Date(a.end);
                        const top = (s.getHours() + s.getMinutes() / 60) * 56;
                        const height = Math.max(28, ((e.getTime() - s.getTime()) / 3600000) * 56 - 3);
                        const p = db.patients.find((x) => x.id === a.patientId);
                        const dent = db.users.find((x) => x.id === a.dentistId);
                        return (
                          <button key={a.id} onClick={(ev) => { ev.stopPropagation(); setViewing(a); }} style={{ top, height }} className={`absolute left-1 right-1 overflow-hidden rounded-lg border px-2 py-1 text-left text-[11px] font-semibold shadow-card transition-all duration-150 hover:z-10 hover:-translate-y-px hover:shadow-pop ${STATUS_BG[a.status]}`}>
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
        </Reveal>
      ) : tab === "mensual" ? (
        <MonthView day={day} setDay={setDay} setTab={setTab} appointments={monthAppts} />
      ) : tab === "reprog" ? (
        /* ===== REPROGRAMACIÓN (canceladas) ===== */
        <Reveal>
          {reprog.length === 0 ? (
            <Empty title="Nada que reprogramar" desc="Las citas canceladas aparecen acá para reagendarlas." />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                  <th className="px-4 py-3">Cita original</th><th className="px-2 py-3">Paciente</th><th className="px-2 py-3">Doctor</th><th className="px-2 py-3"></th>
                </tr></thead>
                <tbody className="divide-y divide-clinic-border">
                  {reprog.map((a) => {
                    const p = db.patients.find((x) => x.id === a.patientId);
                    const dent = db.users.find((x) => x.id === a.dentistId);
                    return (
                      <tr key={a.id} className="hover:bg-clinic-bg/60">
                        <td className="px-4 py-2.5"><div className="font-semibold text-clinic-text">{a.title || "Cita"}</div><div className="text-xs text-clinic-muted">{new Date(a.start).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" })} · {fmtTime(a.start)}</div></td>
                        <td className="px-2 py-2.5">{p ? <a href={`/app/pacientes/${p.id}`} className="font-semibold text-azure-700 hover:underline">{fullName(p)}</a> : "—"}</td>
                        <td className="px-2 py-2.5 text-clinic-muted">{dent?.name ?? "—"}</td>
                        <td className="px-2 py-2.5 text-right"><Btn variant="outline" onClick={() => reagendar(a)}><CalendarDays className="h-3.5 w-3.5" /> Reagendar</Btn></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </Reveal>
      ) : (
        /* ===== DIARIA / DIARIA GLOBAL ===== */
        <Reveal className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Sidebar */}
          <aside className="w-full shrink-0 space-y-3 lg:w-64">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <button onClick={() => setDay(addDays(day, -1))} className="grid h-8 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-clinic-bg" aria-label="Día anterior"><ChevronLeft className="h-4 w-4" /></button>
                <div className="text-center">
                  <div className="text-xs font-bold uppercase tracking-wide text-clinic-muted">{day.toLocaleDateString("es-PY", { weekday: "long" })}</div>
                  <div className="font-mono text-3xl font-extrabold text-clinic-text">{String(day.getDate()).padStart(2, "0")}</div>
                  <div className="text-xs text-clinic-muted">{day.toLocaleDateString("es-PY", { month: "long", year: "numeric" })}</div>
                </div>
                <button onClick={() => setDay(addDays(day, 1))} className="grid h-8 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-clinic-bg" aria-label="Día siguiente"><ChevronRight className="h-4 w-4" /></button>
              </div>
              {selKey !== todayKey && (
                <button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setDay(d); }} className="mt-2 w-full rounded-lg bg-clinic-bg py-1.5 text-xs font-bold text-azure-600 hover:bg-azure-50">Ir a hoy</button>
              )}
            </Card>

            {tab === "diaria" && (
              <Card className="space-y-2 p-3">
                <select value={proFilter} onChange={(e) => setProFilter(e.target.value)} className={inputCls}>
                  <option value="all">Todos los profesionales</option>
                  {dentists.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {db.branches.length > 1 && (
                  <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls}>
                    <option value="all">Todas las sucursales</option>
                    {db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
              </Card>
            )}

            <Card className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-clinic-muted">Estados</span>
                <button onClick={() => setStatusFilter(new Set(ALL_STATUSES))} className="text-[11px] font-bold text-azure-600 hover:underline">Marcar todos</button>
              </div>
              <div className="space-y-0.5">
                {ALL_STATUSES.map((s) => {
                  const n = dayAllPro.filter((a) => a.status === s).length;
                  return (
                    <label key={s} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm hover:bg-clinic-bg">
                      <input type="checkbox" checked={statusFilter.has(s)} onChange={() => toggleStatus(s)} className="accent-azure-600" />
                      <span className="h-3.5 w-1 rounded-full" style={{ background: STATUS_DOT[s] }} />
                      <span className="text-clinic-text">{STATUS_LABEL[s]}</span>
                      <span className="ml-auto font-mono text-xs text-clinic-muted">{n}</span>
                    </label>
                  );
                })}
              </div>
            </Card>
          </aside>

          {/* Tabla del día */}
          <div className="min-w-0 flex-1 space-y-3">
            {tab === "global" ? (
              <div className="overflow-x-auto pb-1">
                <div className="flex gap-3" style={{ minWidth: Math.max(1, dentists.length) * 210 }}>
                  {dentists.map((d) => {
                    const list = dayAll.filter((a) => a.dentistId === d.id && statusFilter.has(a.status)).sort((a, b) => a.start.localeCompare(b.start));
                    return (
                      <div key={d.id} className="min-w-[200px] flex-1">
                        <div className="mb-2 flex items-center gap-2 rounded-xl bg-clinic-bg px-3 py-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                          <span className="truncate text-sm font-bold text-clinic-text">{d.name}</span>
                          <span className="ml-auto font-mono text-xs text-clinic-muted">{list.length}</span>
                        </div>
                        <div className="space-y-2">
                          {list.length === 0 ? <p className="py-4 text-center text-xs text-clinic-muted">Sin citas</p> : list.map((a) => {
                            const p = db.patients.find((x) => x.id === a.patientId);
                            return (
                              <button key={a.id} onClick={() => setViewing(a)} className="block w-full rounded-xl border border-clinic-border border-l-4 bg-white p-2.5 text-left shadow-card transition-shadow hover:shadow-pop" style={{ borderLeftColor: STATUS_DOT[a.status] }}>
                                <div className="font-mono text-[11px] font-bold text-clinic-text">{fmtTime(a.start)}–{fmtTime(a.end)}</div>
                                <div className="truncate text-sm font-semibold text-clinic-text">{p ? fullName(p) : "—"}</div>
                                <div className="truncate text-[11px] font-semibold" style={{ color: STATUS_DOT[a.status] }}>{STATUS_LABEL[a.status]}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (<>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre del paciente en las citas de hoy…" className="w-full rounded-xl border border-clinic-border bg-white py-2.5 pl-9 pr-3 text-sm focus:border-azure-500 focus:outline-none" />
            </div>
            {dayAppts.length === 0 ? (
              <Empty title="Sin citas para este día" desc="Usá “Dar cita” para agendar, o cambiá de fecha." />
            ) : (
              <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[820px] text-sm">
                  <thead><tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                    <th className="px-3 py-3">Hora</th><th className="px-2 py-3">Paciente</th><th className="px-2 py-3">Doctor</th><th className="px-2 py-3">Estado de la cita</th><th className="px-2 py-3">Situación</th><th className="px-2 py-3"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-clinic-border">
                    {dayAppts.map((a) => {
                      const p = db.patients.find((x) => x.id === a.patientId);
                      const dent = db.users.find((x) => x.id === a.dentistId);
                      const multi = p ? dayAll.filter((x) => x.patientId === p.id).length > 1 : false;
                      return (
                        <tr key={a.id} className="align-top hover:bg-clinic-bg/50">
                          <td className="px-3 py-3">
                            <div className="inline-flex flex-col items-center rounded-lg border-l-4 bg-clinic-bg px-2 py-1 font-mono text-[11px] font-bold text-clinic-text" style={{ borderColor: STATUS_DOT[a.status] }}>
                              <span>{fmtTime(a.start)}</span><ChevronDown className="h-3 w-3 text-clinic-muted" /><span>{fmtTime(a.end)}</span>
                            </div>
                          </td>
                          <td className="px-2 py-3">
                            {p ? <a href={`/app/pacientes/${p.id}`} className="font-bold text-azure-700 hover:underline">{fullName(p)}</a> : <span className="text-clinic-muted">—</span>}
                            {a.source === "online" && <span className="ml-2 rounded bg-state-infobg px-1.5 text-[10px] font-bold text-state-info">Online</span>}
                            {multi && <span className="ml-2 rounded bg-state-warnbg px-1.5 text-[10px] font-bold text-state-warn">Múltiples citas hoy</span>}
                            {p?.phone && <div className="mt-0.5 flex items-center gap-1 text-xs text-clinic-muted"><Phone className="h-3 w-3" /> {p.phone}</div>}
                          </td>
                          <td className="px-2 py-3 text-clinic-muted">{dent?.name ?? "—"}</td>
                          <td className="px-2 py-3">
                            <EstadoCell appt={a} onSet={(s) => setEstado(a, s)} />
                            {(a.status === "cancelada" || a.status === "ausente") && <div className="mt-0.5 text-[11px] text-clinic-muted">{a.cancelReason || "Sin motivo"}</div>}
                          </td>
                          <td className="px-2 py-3"><SituacionPill patientId={a.patientId} /></td>
                          <td className="relative px-2 py-3 text-right">
                            <button onClick={() => setMenuFor(menuFor === a.id ? null : a.id)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-clinic-bg" aria-label="Acciones"><MoreHorizontal className="h-4 w-4 text-clinic-muted" /></button>
                            {menuFor === a.id && (
                              <div className="absolute right-2 top-11 z-20 w-36 overflow-hidden rounded-xl border border-clinic-border bg-white text-left shadow-pop">
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
              </Card>
            )}
            </>)}
          </div>
        </Reveal>
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
                  { paciente: p.firstName, fecha: new Date(live.start).toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" }), hora: fmtTime(live.start), clinica: clinic.name }
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

                {live.telemed && (
                  <div className="rounded-xl border border-azure-300 bg-azure-50 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-azure-700"><Video className="h-3.5 w-3.5" /> Videoconsulta</div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button onClick={() => { const tok = live.videoToken ?? newSignToken(); if (!live.videoToken) upsertAppointment({ ...live, videoToken: tok }); window.open(`https://meet.jit.si/nvd-${tok}`, "_blank", "noopener,noreferrer"); }} className="inline-flex items-center gap-1.5 rounded-xl bg-azure-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-azure-700"><Video className="h-4 w-4" /> Iniciar videoconsulta</button>
                      <button onClick={() => { const tok = live.videoToken ?? newSignToken(); if (!live.videoToken) upsertAppointment({ ...live, videoToken: tok }); try { navigator.clipboard?.writeText(`${window.location.origin}/videoconsulta/${live.clinicId}/${live.id}?t=${tok}`); } catch { /* sin portapapeles */ } }} className="rounded-xl border border-clinic-border px-3 py-2 text-xs font-bold text-clinic-muted hover:text-clinic-text">Copiar link del paciente</button>
                    </div>
                  </div>
                )}

                {p && (
                  <div className="rounded-xl border border-clinic-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-clinic-muted"><BellRing className="h-3.5 w-3.5" /> Confirmación de cita</span>
                      {live.reminderSent ? <Badge tone="ok" tip="Ya se envió el recordatorio">Enviado</Badge> : <Badge tone="warn" tip="Aún sin recordatorio">Pendiente</Badge>}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <a href={waLink(p.phone, reminderMsg)} target="_blank" rel="noopener noreferrer" onClick={() => upsertAppointment({ ...live, reminderSent: true })} className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366]/10 px-3.5 py-2 text-xs font-bold text-[#128C7E] transition-colors hover:bg-[#25D366]/20">
                        <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
                      </a>
                      <button onClick={() => upsertAppointment({ ...live, reminderSent: !live.reminderSent })} className="rounded-xl border border-clinic-border px-3 py-2 text-xs font-bold text-clinic-muted hover:text-clinic-text">{live.reminderSent ? "Marcar como no enviado" : "Marcar como enviado"}</button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <Btn variant="outline" onClick={() => downloadICS(`cita-${live.id}`, buildICS([apptToICS(live)], toICSDate(new Date().toISOString())))}><CalendarDays className="h-3.5 w-3.5" /> Agregar al calendario</Btn>
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
            const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(9, 0, 0, 0);
            const end = new Date(start); end.setHours(10);
            setFromWaitlist(entry.id);
            setEditing({ id: `a_${Date.now()}`, clinicId: session!.clinicId, patientId: entry.patientId, dentistId: dentists[0]?.id ?? "", title: entry.reason, start: start.toISOString(), end: end.toISOString(), status: "pendiente", amount: 0, discount: 0 });
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
            if (old && old.status !== "cancelada" && a.status === "cancelada" && botikaEnabled(db, "reagendar")) {
              const p = db.patients.find((x) => x.id === a.patientId);
              if (p?.phone) addOutboxTask(makeOutboxTask({ db, type: "reagendar", patient: p, refId: a.id, by: session!.name, message: botikaMessage(db, "reagendar", { paciente: p.firstName, clinica: db.clinics[0].name, titulo: a.title || "Cita", fecha: new Date(a.start).toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" }), hora: fmtTime(a.start) }) }));
            }
            if (isNew && a.status !== "cancelada" && botikaEnabled(db, "confirmCita")) {
              const p = db.patients.find((x) => x.id === a.patientId);
              if (p?.phone) addOutboxTask(makeOutboxTask({ db, type: "confirmar_cita", patient: p, refId: a.id, by: session!.name, message: botikaMessage(db, "confirmCita", { paciente: p.firstName, clinica: db.clinics[0].name, titulo: a.title || "Cita", fecha: new Date(a.start).toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" }), hora: fmtTime(a.start) }) }));
            }
            setEditing(null); setFromWaitlist(null);
          }}
        />
      )}
    </div>
  );
}

/* ===== Celda "Estado de la cita" con desplegable para cambiarlo ===== */
function EstadoCell({ appt, onSet }: { appt: Appointment; onSet: (s: AppointmentStatus) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-sm font-semibold hover:bg-clinic-bg" style={{ color: STATUS_DOT[appt.status] }}>
        <span className="h-2 w-2 rounded-full" style={{ background: STATUS_DOT[appt.status] }} />
        {STATUS_LABEL[appt.status]}
        <ChevronDown className={`h-3.5 w-3.5 text-clinic-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-clinic-border bg-white py-1 shadow-pop">
          {ALL_STATUSES.map((s) => (
            <button key={s} onClick={() => { onSet(s); setOpen(false); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-clinic-bg ${s === appt.status ? "bg-clinic-bg" : ""}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_DOT[s] }} /> {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===== Pill de "Situación" financiera del paciente ===== */
function SituacionPill({ patientId }: { patientId: string }) {
  const { db } = useStore();
  const hasBudget = db.budgets.some((b) => b.patientId === patientId);
  if (!hasBudget) {
    return <span className="inline-flex items-center gap-1 rounded-lg bg-state-okbg px-2.5 py-1 text-xs font-bold text-state-ok"><User className="h-3.5 w-3.5" /> Diagnóstico</span>;
  }
  const saldo = patientBalance(patientId, db.budgets, db.payments);
  if (saldo > 0) {
    return <span className="inline-flex items-center gap-1 rounded-lg bg-state-errbg px-2.5 py-1 text-xs font-bold text-state-err"><AlertTriangle className="h-3.5 w-3.5" /> Deudas</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-lg bg-state-okbg px-2.5 py-1 text-xs font-bold text-state-ok">✓ Hay saldo</span>;
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
            <Btn disabled={!reason.trim()} onClick={() => { addWaitlist({ id: `w_${Date.now()}`, clinicId: db.clinics[0].id, patientId, reason: reason.trim(), preference: preference.trim() || "Sin preferencia", createdAt: new Date().toISOString() }); setReason(""); setPreference(""); setAdding(false); }}>Guardar</Btn>
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
                  <button onClick={() => removeWaitlist(w.id)} className="grid h-8 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err" title="Quitar de la lista"><Trash2 className="h-4 w-4" /></button>
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

  function findConflict(a: Appointment): string | null {
    const s = new Date(a.start).getTime();
    const e = new Date(a.end).getTime();
    if (e <= s) return "La hora de fin debe ser posterior a la de inicio.";
    const clash = db.appointments.find((x) => x.id !== a.id && x.dentistId === a.dentistId && x.status !== "cancelada" && new Date(x.start).getTime() < e && new Date(x.end).getTime() > s);
    if (clash) {
      const p = db.patients.find((y) => y.id === clash.patientId);
      return `El dentista ya tiene una cita en ese horario: "${clash.title}"${p ? ` con ${fullName(p)}` : ""} (${fmtTime(clash.start)}–${fmtTime(clash.end)}).`;
    }
    return null;
  }

  return (
    <Modal title={isNew ? "Nueva cita" : "Editar cita"} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const c = findConflict(form); setConflict(c); if (!c) onSave(form); }}>
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
        {db.branches.length > 1 && (
          <Field label="Sucursal">
            <select className={inputCls} value={form.branchId ?? db.branches.find((b) => b.isMain)?.id ?? ""} onChange={(e) => setForm({ ...form, branchId: e.target.value || undefined })}>
              {db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm text-clinic-text"><input type="checkbox" checked={!!form.telemed} onChange={(e) => setForm({ ...form, telemed: e.target.checked })} /> <Video className="h-4 w-4 text-azure-600" /> Videoconsulta (telemedicina)</label>
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
              <option value="ausente">Ausente</option>
            </select>
          </Field>
          <Field label="Importe (Gs)"><input type="number" min={0} className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} /></Field>
          <Field label="Descuento (Gs)"><input type="number" min={0} className={inputCls} value={form.discount} onChange={(e) => setForm({ ...form, discount: +e.target.value })} /></Field>
        </div>
        <Field label="Notas"><textarea className={inputCls} rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        {conflict && <p role="alert" className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-state-err">⚠ {conflict}</p>}
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
