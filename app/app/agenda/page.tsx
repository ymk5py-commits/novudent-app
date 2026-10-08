"use client";
import Link from "next/link";
/** Módulo de Agenda estilo Dentalink: vista Diaria (sidebar fecha + profesional +
 *  leyenda de estados; tabla Hora/Paciente/Doctor/Estado/Situación) · Diaria global ·
 *  Semanal (grilla de 30 min con menú por espacio, components/agenda/GrillaSemanal) · Reprogramación.
 *  Modales VER/Lista de espera/Crear-editar/Bloquear espacio. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, CalendarDays, CalendarRange, CalendarCheck, List, MoreHorizontal, Eye, Pencil, Trash2, Plus, User, Video,
  Hourglass, BellRing, Users, AlertTriangle, Printer, Search, Phone, ChevronDown, Mail, Check, Link2, Lock,
} from "lucide-react";
import { newSignToken } from "@/lib/firma";
import { useStore, fmtGs, fmtTime, fmtDate, fullName } from "@/lib/store";
import { linkConfirmacion } from "@/lib/confirmacionCita";
import { useAlcance } from "@/lib/useAlcance";
import { estadoDeCita } from "@/lib/estadosCita";
import { reservasPorValidar } from "@/lib/citas";
import { useEstadosCita } from "@/lib/useEstadosCita";
import type { EstadoCita } from "@/lib/types";
import { botikaEnabled, makeOutboxTask, botikaMessage } from "@/lib/botika";
import { patientBalance } from "@/lib/budgets";
import { etiquetaDeBloqueo, rangoDeBloqueo, TODOS_LOS_PROFESIONALES } from "@/lib/bloqueos";
import { textoPrestacion } from "@/lib/prestacionesCita";
import type { AgendaBlock, Appointment, Patient } from "@/lib/types";
import { DarCita } from "@/components/DarCita";
import { Desplegable, ItemMenu } from "@/components/Desplegable";
import { GrillaSemanal, type AccionEspacio } from "@/components/agenda/GrillaSemanal";
import { BloquearEspacio } from "@/components/agenda/BloquearEspacio";
import { MenuBloqueo, quienBloquea } from "@/components/agenda/MenuBloqueo";
import { ComentarioCita } from "@/components/agenda/ComentarioCita";
import { enviarAvisoCita } from "@/lib/avisoCita";
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
/** "HH:MM" local de un instante ISO. */
const horaDe = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
/** Rayado gris de un espacio bloqueado (el mismo de la grilla semanal). */
const RAYADO = "[background-image:repeating-linear-gradient(135deg,#eceff3_0,#eceff3_6px,#f7f8fa_6px,#f7f8fa_12px)]";
/* Estados de cita (nombres, orden y colores en lib/estadosCita.ts) */

type Tab = "diaria" | "global" | "semanal" | "mensual" | "reprog";

/* ===== Vista MENSUAL (calendario del mes) ===== */
function MonthView({ day, setDay, setTab, appointments }: { day: Date; setDay: (d: Date) => void; setTab: (t: Tab) => void; appointments: Appointment[] }) {
  const estados = useEstadosCita();
  const estadoDe = (x: Appointment) => estadoDeCita(x, estados);
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
  const mesYAnio = first.toLocaleDateString("es-PY", { month: "long", year: "numeric" });
  const monthLabel = mesYAnio.charAt(0).toUpperCase() + mesYAnio.slice(1); // «octubre de 2026» → «Octubre de 2026» (con CSS `capitalize` salía «Octubre De 2026»)
  const WD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <Reveal>
      <div className="mb-2 flex items-center gap-2 print:hidden">
        <button onClick={() => setDay(new Date(y, m - 1, 1))} className="grid h-9 w-9 place-items-center rounded-xl border border-clinic-border bg-white hover:bg-clinic-bg" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={() => setDay(new Date())} className="rounded-xl border border-clinic-border bg-white px-3 py-2 text-sm font-bold text-azure-600 hover:bg-clinic-bg">Este mes</button>
        <button onClick={() => setDay(new Date(y, m + 1, 1))} className="grid h-9 w-9 place-items-center rounded-xl border border-clinic-border bg-white hover:bg-clinic-bg" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
        <span className="ml-1 text-sm font-bold text-clinic-text">{monthLabel}</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-clinic-border bg-white">
        <div className="grid grid-cols-7 border-b border-clinic-border bg-clinic-bg/50 text-center text-[13px] font-semibold text-clinic-muted">
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
                      <div key={a.id} className="flex items-center gap-1 truncate text-[11px] text-clinic-muted">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: estadoDe(a).color }} />
                        <span className="truncate">{fmtTime(a.start)} {a.title || "Cita"}</span>
                      </div>
                    ))}
                    {appts.length > 3 && <div className="text-[11px] font-bold text-azure-700">+{appts.length - 3} más</div>}
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
  const { db, session, upsertAppointment, deleteAppointment, setOnboarding, addWaitlist, removeWaitlist, addOutboxTask, addAgendaBlocks, deleteAgendaBlocks } = useStore();
  const alcance = useAlcance();
  // Dentista y asistente de doctores: solo la agenda de sus doctores, en todas las vistas.
  const citas = useMemo(() => db.appointments.filter((a) => alcance.veDoctor(a.dentistId)), [db.appointments, alcance]);
  const verMontos = alcance.puede("money.view");
  const verPersonales = alcance.puede("patients.personal");
  // Dentista y asistente ven la agenda en solo lectura: los cambios los hace la recepción.
  const puedeAgendar = alcance.puede("agenda.create");
  const puedeEditar = alcance.puede("agenda.edit");
  const enEspera = db.waitlist.filter((w) => alcance.vePaciente(w.patientId)).length;
  const [tab, setTab] = useState<Tab>("diaria");
  const [day, setDay] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [proFilter, setProFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  // Filtro de box (Dentalink: la agenda por sillón): solo con dos o más boxes.
  const [boxFilter, setBoxFilter] = useState<string>("all");
  const variosBoxes = db.boxes.length > 1;
  const estados = useEstadosCita();
  const estadoDe = (x: Appointment) => estadoDeCita(x, estados);
  const [statusFilter, setStatusFilter] = useState<Set<string>>(() => new Set(estados.map((e) => e.id)));
  // «Ver y validar» del cartel de reservas online: muestra solo las que entraron por la web (ver `verYValidar`).
  const [soloOnline, setSoloOnline] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [preseleccion, setPreseleccion] = useState<{ fecha: Date; hora: string } | undefined>(undefined);
  // Cómo se abre «Dar cita» desde el menú de un espacio, el «+» de una cita o el ⋮ de la Diaria.
  const [abrirCon, setAbrirCon] = useState<{ sobreagendar?: boolean; multiconsulta?: boolean }>({});
  // «Bloquear espacio» (desde el menú de un espacio de la semanal) y el menú de un bloqueo en la Diaria y la Diaria global.
  const [bloqueando, setBloqueando] = useState<{ fecha: Date; hora: string } | null>(null);
  const anclaBloqueo = useRef<HTMLElement | null>(null);
  const [bloqueoAbierto, setBloqueoAbierto] = useState<AgendaBlock | null>(null);
  const cerrarMenuBloqueo = useCallback(() => setBloqueoAbierto(null), []);
  const [viewing, setViewing] = useState<Appointment | null>(null);
  const [waitOpen, setWaitOpen] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 7000); return () => clearTimeout(t); }, [aviso]);
  /** Avisa al paciente por correo (confirmación de la cita o su estado actual). */
  const notificar = async (a: Appointment, tipo: "confirmacion" | "estado") => {
    const r = await enviarAvisoCita(session!.clinicId, a.id, tipo);
    if (r.ok) {
      if (tipo === "confirmacion" && !r.demo) upsertAppointment({ ...a, reminderSent: true });
      setAviso({ ok: true, texto: r.demo ? "En la demo no se envían correos; la cita no se marcó como notificada." : "Correo enviado al paciente." });
    } else {
      setAviso({ ok: false, texto: r.error });
    }
  };
  const [fromWaitlist, setFromWaitlist] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!db.onboarding.tourDone) setOnboarding("tourDone", true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "semanal") gridRef.current?.scrollTo({ top: 8 * 56 - 8 }); }, [tab, weekStart]);

  const dentists = db.users.filter((u) => u.role === "dentist" && alcance.veDoctor(u.id));
  const today = new Date();
  const todayKey = dayKeyOf(today);
  const selKey = dayKeyOf(day);

  /* — Diaria / Diaria global — */
  const dayAll = useMemo(
    () => citas.filter((a) => dayKeyOf(a.start) === selKey).sort((a, b) => a.start.localeCompare(b.start)),
    [citas, selKey]
  );
  const mainBranchId = db.branches.find((b) => b.isMain)?.id;
  const dayAllPro = useMemo(
    () => dayAll.filter((a) => {
      const okBranch = branchFilter === "all" || (a.branchId ?? mainBranchId) === branchFilter;
      const okPro = proFilter === "all" || a.dentistId === proFilter;
      const okBox = boxFilter === "all" || a.boxId === boxFilter;
      return okBranch && okPro && okBox;
    }),
    [dayAll, tab, proFilter, branchFilter, boxFilter, mainBranchId]
  );
  const dayAppts = useMemo(() => {
    const t = q.trim().toLowerCase();
    return dayAllPro.filter((a) => {
      if (!statusFilter.has(estadoDe(a).id)) return false;
      if (soloOnline && a.source !== "online") return false;
      if (!t) return true;
      const p = db.patients.find((x) => x.id === a.patientId);
      return p ? fullName(p).toLowerCase().includes(t) : false;
    });
  }, [dayAllPro, statusFilter, soloOnline, q, db.patients]);

  /* — Filtro de profesional, sucursal y box, el mismo en todas las vistas — */
  const pasaFiltros = (a: Appointment) =>
    (proFilter === "all" || a.dentistId === proFilter) && (branchFilter === "all" || (a.branchId ?? mainBranchId) === branchFilter)
    && (boxFilter === "all" || a.boxId === boxFilter);

  /* — Espacios bloqueados que ve la persona: los de sus doctores y los de «Todos», dentro de los filtros de profesional y box (un bloqueo
     no tiene sucursal: aplica en todas) — */
  const bloqueosVisibles = useMemo(
    () => db.agendaBlocks.filter((b) =>
      (b.dentistId === TODOS_LOS_PROFESIONALES || alcance.veDoctor(b.dentistId))
      && (proFilter === "all" || b.dentistId === TODOS_LOS_PROFESIONALES || b.dentistId === proFilter)
      && (boxFilter === "all" || !b.boxId || b.boxId === boxFilter)),
    [db.agendaBlocks, alcance, proFilter, boxFilter],
  );
  const bloqueosDelDia = useMemo(
    () => bloqueosVisibles.filter((b) => dayKeyOf(b.start) === selKey).sort((a, b) => a.start.localeCompare(b.start)),
    [bloqueosVisibles, selKey],
  );

  /* — Semanal — */
  const weekEnd = addDays(weekStart, 7);
  const weekAppointments = useMemo(
    () => citas.filter((a) => { const t = new Date(a.start); return t >= weekStart && t < weekEnd && pasaFiltros(a); }).sort((a, b) => a.start.localeCompare(b.start)),
    [citas, weekStart, weekEnd, proFilter, branchFilter, boxFilter, mainBranchId] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const weekBlocks = useMemo(
    () => bloqueosVisibles.filter((b) => { const t = new Date(b.start); return t >= weekStart && t < weekEnd; }),
    [bloqueosVisibles, weekStart, weekEnd],
  );

  /* — Reprogramación: canceladas a reagendar — */
  const reprog = useMemo(
    () => citas.filter((a) => a.status === "cancelada" && pasaFiltros(a)).sort((a, b) => b.start.localeCompare(a.start)),
    [citas, proFilter, branchFilter, boxFilter, mainBranchId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* — Mensual: citas del mes de `day` — */
  const monthAppts = useMemo(() => {
    const y = day.getFullYear(), m = day.getMonth();
    return citas.filter((a) => { const t = new Date(a.start); return t.getFullYear() === y && t.getMonth() === m && pasaFiltros(a); });
  }, [citas, day, proFilter, branchFilter, boxFilter, mainBranchId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Reservas que entraron por la web y nadie validó, de hoy en adelante y de TODOS los días (no solo del día abierto), dentro de los
     filtros de profesional y sucursal. Solo las ve quien puede validarlas (agenda.edit). */
  const reservas = reservasPorValidar(citas.filter(pasaFiltros), new Date(new Date().setHours(0, 0, 0, 0)));
  const porValidar = reservas.length;
  const headerCount = tab === "semanal" ? weekAppointments.length : tab === "mensual" ? monthAppts.length : tab === "reprog" ? reprog.length : dayAppts.length;

  /** Cita en blanco para «Dar cita»: la fecha y la hora salen de la grilla; el profesional y el box, de los filtros de la agenda. */
  const citaBase = (extra: Partial<Appointment> = {}): Appointment => {
    const ahora = new Date().toISOString();
    return {
      id: `a_${Date.now()}`, clinicId: session!.clinicId, patientId: "", dentistId: proFilter !== "all" ? proFilter : dentists[0]?.id ?? "",
      title: "", start: ahora, end: ahora, status: "pendiente", amount: 0, discount: 0,
      ...(variosBoxes && boxFilter !== "all" ? { boxId: boxFilter } : {}), ...extra,
    };
  };
  function newAppt(base: Date) {
    const d = new Date(base); d.setHours(0, 0, 0, 0);
    const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
    // La grilla arranca en el día que se está mirando (o hoy, si es un día pasado).
    setPreseleccion(d > hoy0 ? { fecha: d, hora: "" } : undefined);
    setAbrirCon({});
    setEditing(citaBase());
  }
  /** Lo que se eligió en el menú de un espacio de la semanal. */
  function accionEspacio(accion: AccionEspacio, fecha: Date, hora: string) {
    if (accion === "bloquear") { setBloqueando({ fecha, hora }); return; }
    setPreseleccion({ fecha, hora });
    setAbrirCon({ sobreagendar: accion === "sobreagendar", multiconsulta: accion === "multiples" });
    setEditing(citaBase(accion === "video" ? { telemed: true } : {}));
  }
  /** «Sobreagendar en este horario» desde una cita (el «+» de la tarjeta, el ⋮ de la Diaria o «Ver»): mismo día, hora, profesional y box. */
  function sobreagendarDesde(a: Appointment) {
    const fecha = new Date(a.start); fecha.setHours(0, 0, 0, 0);
    setPreseleccion({ fecha, hora: horaDe(a.start) });
    setAbrirCon({ sobreagendar: true });
    setEditing(citaBase({ dentistId: a.dentistId, ...(a.boxId ? { boxId: a.boxId } : {}), ...(a.branchId ? { branchId: a.branchId } : {}) }));
    setViewing(null);
  }
  const reagendar = (a: Appointment) => {
    // Pre-carga la cita anulada (paciente, profesional, tipo, box) en una nueva.
    setPreseleccion(undefined);
    setAbrirCon({});
    setEditing({ ...a, id: `a_${Date.now()}`, status: "pendiente", estadoId: undefined, cancelReason: undefined, reminderSent: undefined, confirmedVia: undefined, videoToken: undefined, confirmToken: undefined, respondidaAt: undefined, sobrecupo: undefined });
  };
  const cerrarDarCita = useCallback(() => { setEditing(null); setFromWaitlist(null); setPreseleccion(undefined); setAbrirCon({}); }, []);
  const cerrarBloquear = useCallback(() => setBloqueando(null), []);
  /** Abre el menú de un bloqueo (Diaria y Diaria global). */
  const abrirMenuBloqueo = (b: AgendaBlock, ancla: HTMLElement) => { anclaBloqueo.current = ancla; setBloqueoAbierto(b); };
  const quitarBloqueos = (ids: string[]) => {
    deleteAgendaBlocks(ids);
    setAviso({ ok: true, texto: ids.length === 1 ? "Se quitó el bloqueo." : `Se quitaron ${ids.length} bloqueos.` });
  };
  /** Nombre accesible y texto de un bloqueo: «Bloqueado 12:00–13:00 · Almuerzo · Dra. Sofía Benítez · Box 2». */
  const nombreDeBox = (id?: string) => (id ? db.boxes.find((x) => x.id === id)?.name : undefined);
  const etiquetaBloqueo = (b: AgendaBlock) => etiquetaDeBloqueo(b, quienBloquea(b, db.users), nombreDeBox(b.boxId));
  const toggleStatus = (s: string) =>
    setStatusFilter((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  /** «Ver y validar»: solo las reservas online sin validar. Si el día abierto no tiene ninguna, va al primer día que sí. */
  const verYValidar = () => {
    setStatusFilter(new Set(estados.filter((e) => e.base === "pendiente").map((e) => e.id)));
    setSoloOnline(true);
    setQ("");
    if (reservas.length > 0 && !reservas.some((a) => dayKeyOf(a.start) === selKey)) {
      const d = new Date(reservas[0].start); d.setHours(0, 0, 0, 0);
      setDay(d);
    }
  };
  const verTodasLasCitas = () => { setSoloOnline(false); setStatusFilter(new Set(estados.map((e) => e.id))); };

  /* Cambiar estado; cancelada/ausente piden motivo. */
  const setEstado = (a: Appointment, e: EstadoCita) => {
    let cancelReason = a.cancelReason;
    if (e.base === "cancelada" || e.base === "ausente") {
      const r = window.prompt(`Motivo (${e.label.toLowerCase()}):`, a.cancelReason ?? "");
      if (r === null) return;
      cancelReason = r.trim() || undefined;
    } else {
      cancelReason = undefined;
    }
    upsertAppointment({ ...a, status: e.base, estadoId: e.id, cancelReason });
  };

  const sucursalUnica = db.branches.length <= 1;
  const selectProfesional = (
    <select aria-label="Filtrar por profesional" value={proFilter} onChange={(e) => setProFilter(e.target.value)} className={inputCls}>
      <option value="all">Todos los profesionales</option>
      {dentists.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </select>
  );
  // Con una sola sucursal se muestra, pero no se puede cambiar (queda la de la clínica).
  const selectSucursal = (
    <select aria-label="Filtrar por sucursal" value={sucursalUnica ? db.branches[0]?.id ?? "all" : branchFilter} onChange={(e) => setBranchFilter(e.target.value)} disabled={sucursalUnica} className={`${inputCls} disabled:bg-clinic-bg disabled:text-clinic-muted`}>
      {sucursalUnica ? <option value={db.branches[0]?.id ?? "all"}>{db.branches[0]?.name ?? "Sede principal"}</option> : <>
        <option value="all">Todas las sucursales</option>
        {db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </>}
    </select>
  );
  // Box (sillón): solo si la clínica tiene dos o más. Lo elegido viaja a «Dar cita» y a «Bloquear espacio».
  const selectBox = variosBoxes ? (
    <select aria-label="Filtrar por box" value={boxFilter} onChange={(e) => setBoxFilter(e.target.value)} className={inputCls}>
      <option value="all">Todos los boxes</option>
      {db.boxes.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  ) : null;
  const VISTA: Record<Tab, string> = { diaria: "Diaria", global: "Diaria global", semanal: "Semanal", mensual: "Mensual", reprog: "Reprogramación" };

  const TABS: [Tab, string, any][] = [
    ["diaria", "Diaria", List], ["semanal", "Semanal", CalendarDays], ["mensual", "Mensual", CalendarRange],
    ["global", "Diaria global", Users], ["reprog", "Reprogramación", AlertTriangle],
  ];

  return (
    <div className="print-area space-y-4">
      {/* Header estilo Dentalink: título + tabs + acciones */}
      <Reveal className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <h1 className="text-[16px] font-bold text-clinic-text">Agenda</h1>
          <span className="rounded-full bg-azure-50 px-2 py-0.5 tabular-nums text-[11px] font-bold text-azure-700">{headerCount} {headerCount === 1 ? "cita" : "citas"}</span>
        </div>
        <div className="flex flex-wrap items-center border-b border-clinic-border">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 -mb-px rounded-none border-b-2 px-3 py-1.5 text-[14px] font-normal transition-colors ${tab === k ? "border-azure-600 text-azure-700" : "border-transparent text-clinic-text hover:text-azure-600"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {puedeAgendar && <Btn onClick={() => newAppt(tab === "semanal" ? weekStart : day)}><Plus className="h-4 w-4" /> Dar cita</Btn>}
          <label className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-clinic-border bg-white px-3 py-2 text-sm font-bold text-clinic-muted hover:text-clinic-text">
            <CalendarDays className="h-4 w-4" /> Fecha
            <input type="date" value={selKey} onChange={(e) => e.target.value && setDay(new Date(e.target.value + "T00:00:00"))} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Elegir fecha" />
          </label>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl border border-clinic-border bg-white px-3 py-2 text-sm font-bold text-clinic-muted hover:text-clinic-text"><Printer className="h-4 w-4" /> Imprimir</button>
          <Btn variant="outline" onClick={() => setWaitOpen(true)}>
            <Hourglass className="h-4 w-4" /> Lista de espera
            {enEspera > 0 && <span className="rounded-full bg-azure-600 px-1.5 tabular-nums text-[11px] font-bold text-white">{enEspera}</span>}
          </Btn>
        </div>
      </Reveal>

      {aviso && (
        <p role="status" className={`rounded-xl px-4 py-2.5 text-sm font-semibold print:hidden ${aviso.ok ? "bg-state-okbg text-state-ok" : "bg-state-errbg text-state-err"}`}>{aviso.texto}</p>
      )}

      {/* Banner: citas por validar */}
      {(tab === "diaria" || tab === "global") && puedeEditar && porValidar > 0 && (
        <Reveal className="flex flex-wrap items-center gap-2 rounded-xl border border-state-ok/30 bg-state-okbg px-4 py-2.5 text-sm text-state-ok">
          <BellRing className="h-4 w-4" /> Hay {porValidar} agendamiento(s) online que deben ser validados.
          <button onClick={verYValidar} className="font-bold underline">Ver y validar</button>
        </Reveal>
      )}
      {(tab === "diaria" || tab === "global") && soloOnline && (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-azure-300/50 bg-azure-50 px-4 py-2 text-sm text-azure-700 print:hidden">
          Mostrando solo las reservas online sin validar.
          <button onClick={verTodasLasCitas} className="font-bold underline">Ver todas las citas</button>
        </p>
      )}

      {alcance.sinDoctores && (
        <p role="status" className="rounded-xl bg-state-warnbg px-4 py-3 text-sm font-semibold text-state-warn">
          Todavía no tenés doctores asignados, así que no ves ninguna agenda. Pedile al administrador que te asigne en Administración › Usuarios y profesionales.
        </p>
      )}
      {(tab === "semanal" || tab === "mensual" || tab === "reprog") && (
        <div className={`grid gap-2 sm:grid-cols-2 print:hidden ${selectBox ? "lg:max-w-3xl lg:grid-cols-3" : "lg:max-w-xl"}`}>
          {selectProfesional}
          {selectSucursal}
          {selectBox}
        </div>
      )}

      {/* Encabezado que solo sale al imprimir */}
      <div className="hidden print:block">
        <p className="text-lg font-bold">{db.clinics[0]?.name} · Agenda {VISTA[tab].toLowerCase()}</p>
        <p className="text-sm">
          {tab === "semanal" ? `Semana del ${weekStart.toLocaleDateString("es-PY", { day: "numeric", month: "long", year: "numeric" })}`
            : tab === "mensual" ? day.toLocaleDateString("es-PY", { month: "long", year: "numeric" })
            : tab === "reprog" ? "Citas anuladas para reagendar"
            : day.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          {proFilter !== "all" ? ` · ${db.users.find((u) => u.id === proFilter)?.name ?? ""}` : ""}
          {branchFilter !== "all" ? ` · ${db.branches.find((b) => b.id === branchFilter)?.name ?? ""}` : ""}
          {boxFilter !== "all" ? ` · ${nombreDeBox(boxFilter) ?? ""}` : ""}
        </p>
      </div>

      {tab === "semanal" ? (
        /* ===== SEMANAL (grilla 24h) ===== */
        <Reveal>
          <div className="mb-2 flex items-center gap-2 print:hidden">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="grid h-9 w-9 place-items-center rounded-xl border border-clinic-border bg-white hover:bg-clinic-bg" aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setWeekStart(mondayOf(new Date()))} className="rounded-xl border border-clinic-border bg-white px-3 py-2 text-sm font-bold text-azure-600 hover:bg-clinic-bg">Esta semana</button>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="grid h-9 w-9 place-items-center rounded-xl border border-clinic-border bg-white hover:bg-clinic-bg" aria-label="Semana siguiente"><ChevronRight className="h-4 w-4" /></button>
            <span className="ml-1 text-sm text-clinic-muted">Semana del {weekStart.toLocaleDateString("es-PY", { day: "numeric", month: "long" })}</span>
          </div>
          <GrillaSemanal
            weekStart={weekStart}
            citas={weekAppointments}
            bloqueos={weekBlocks}
            gridRef={gridRef}
            puedeAgendar={puedeAgendar}
            puedeBloquear={puedeEditar}
            onVer={setViewing}
            onAccion={accionEspacio}
            onSobreagendar={sobreagendarDesde}
            onQuitarBloqueos={quitarBloqueos}
          />
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
                <thead><tr className="border-b border-clinic-border text-left text-[13px] font-bold text-clinic-text">
                  <th className="px-4 py-2">Cita original</th><th className="px-2 py-2">Paciente</th><th className="px-2 py-2">Doctor</th><th className="px-2 py-2"></th>
                </tr></thead>
                <tbody className="divide-y divide-clinic-border">
                  {reprog.map((a) => {
                    const p = db.patients.find((x) => x.id === a.patientId);
                    const dent = db.users.find((x) => x.id === a.dentistId);
                    return (
                      <tr key={a.id} className="hover:bg-clinic-bg/60">
                        <td className="px-4 py-2.5"><div className="flex items-center gap-1 font-semibold text-clinic-text">{a.title || "Cita"}<ComentarioCita texto={a.notes} className="print:hidden" /></div><div className="text-xs text-clinic-muted">{new Date(a.start).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" })} · {fmtTime(a.start)}</div></td>
                        <td className="px-2 py-2.5">{p ? <Link href={`/app/pacientes/${p.id}`} className="font-semibold text-azure-700 hover:underline">{fullName(p)}</Link> : "—"}</td>
                        <td className="px-2 py-2.5 text-clinic-muted">{dent?.name ?? "—"}</td>
                        <td className="px-2 py-2.5 text-right print:hidden">{puedeAgendar && <Btn variant="outline" onClick={() => reagendar(a)}><CalendarDays className="h-3.5 w-3.5" /> Reagendar</Btn>}</td>
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
          <aside className="w-full shrink-0 space-y-3 lg:w-64 print:hidden">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <button onClick={() => setDay(addDays(day, -1))} className="grid h-8 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-clinic-bg" aria-label="Día anterior"><ChevronLeft className="h-4 w-4" /></button>
                <div className="text-center">
                  <div className="text-[13px] font-bold text-clinic-muted">{day.toLocaleDateString("es-PY", { weekday: "long" })}</div>
                  <div className="tabular-nums text-3xl font-bold text-clinic-text">{String(day.getDate()).padStart(2, "0")}</div>
                  <div className="text-xs text-clinic-muted">{day.toLocaleDateString("es-PY", { month: "long", year: "numeric" })}</div>
                </div>
                <button onClick={() => setDay(addDays(day, 1))} className="grid h-8 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-clinic-bg" aria-label="Día siguiente"><ChevronRight className="h-4 w-4" /></button>
              </div>
              {selKey !== todayKey && (
                <button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setDay(d); }} className="mt-2 w-full rounded-lg bg-clinic-bg py-1.5 text-xs font-bold text-azure-600 hover:bg-azure-50">Ir a hoy</button>
              )}
            </Card>

            <Card className="space-y-2 p-3">
              {selectProfesional}
              {selectSucursal}
              {selectBox}
            </Card>

            <Card className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-clinic-muted">Estados</span>
                <button onClick={() => setStatusFilter(new Set(estados.map((e) => e.id)))} className="text-[11px] font-bold text-azure-600 hover:underline">Marcar todos</button>
              </div>
              <div className="space-y-0.5">
                {estados.map((e) => {
                  const n = dayAllPro.filter((a) => estadoDe(a).id === e.id).length;
                  return (
                    <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm hover:bg-clinic-bg">
                      <input type="checkbox" checked={statusFilter.has(e.id)} onChange={() => toggleStatus(e.id)} className="accent-azure-600" />
                      <span className="h-3.5 w-1 rounded-full" style={{ background: e.color }} />
                      <span className="text-clinic-text">{e.label}</span>
                      <span className="ml-auto tabular-nums text-xs text-clinic-muted">{n}</span>
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
                <div className="flex gap-3" style={{ minWidth: Math.max(1, dentists.filter((d) => proFilter === "all" || d.id === proFilter).length) * 210 }}>
                  {dentists.filter((d) => proFilter === "all" || d.id === proFilter).map((d) => {
                    const list = dayAll.filter((a) => a.dentistId === d.id && statusFilter.has(estadoDe(a).id) && (!soloOnline || a.source === "online") && pasaFiltros(a)).sort((a, b) => a.start.localeCompare(b.start));
                    const bloqueos = bloqueosDelDia.filter((b) => b.dentistId === TODOS_LOS_PROFESIONALES || b.dentistId === d.id);
                    const items = [...list.map((a) => ({ start: a.start, cita: a })), ...bloqueos.map((b) => ({ start: b.start, bloqueo: b }))].sort((x, y) => x.start.localeCompare(y.start));
                    return (
                      <div key={d.id} className="min-w-[200px] flex-1">
                        <div className="mb-2 flex items-center gap-2 rounded-xl bg-clinic-bg px-3 py-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                          <span className="truncate text-sm font-bold text-clinic-text">{d.name}</span>
                          <span className="ml-auto tabular-nums text-xs text-clinic-muted">{list.length}</span>
                        </div>
                        <div className="space-y-2">
                          {items.length === 0 ? <p className="py-4 text-center text-xs text-clinic-muted">Sin citas</p> : items.map((item) => {
                            if ("bloqueo" in item && item.bloqueo) {
                              const b = item.bloqueo;
                              const contenido = (
                                <>
                                  <div className="tabular-nums text-[11px] font-bold text-clinic-text">{rangoDeBloqueo(b)}</div>
                                  <div className="flex items-center gap-1 truncate text-sm font-semibold text-clinic-muted"><Lock aria-hidden className="h-3.5 w-3.5 shrink-0" /> {b.reason || "Bloqueado"}</div>
                                  <div className="text-[11px] text-clinic-muted">Espacio bloqueado{b.boxId ? ` · ${nombreDeBox(b.boxId) ?? ""}` : ""}</div>
                                </>
                              );
                              const cls = `block w-full rounded-xl border border-clinic-border p-2.5 text-left ${RAYADO}`;
                              return puedeEditar ? (
                                <button key={`b_${b.id}`} type="button" aria-haspopup="menu" aria-label={etiquetaBloqueo(b)} title={etiquetaBloqueo(b)} onClick={(ev) => abrirMenuBloqueo(b, ev.currentTarget)} className={`${cls} transition-colors hover:border-clinic-muted`}>{contenido}</button>
                              ) : (
                                <div key={`b_${b.id}`} title={etiquetaBloqueo(b)} className={cls}>{contenido}</div>
                              );
                            }
                            const a = (item as { cita: Appointment }).cita;
                            const p = db.patients.find((x) => x.id === a.patientId);
                            return (
                              <div key={a.id} className="relative">
                                <button onClick={() => setViewing(a)} className="block w-full rounded-xl border border-clinic-border border-l-4 bg-white p-2.5 text-left shadow-card transition-shadow hover:shadow-pop" style={{ borderLeftColor: estadoDe(a).color }}>
                                  <div className="tabular-nums text-[11px] font-bold text-clinic-text">{fmtTime(a.start)}–{fmtTime(a.end)}</div>
                                  <div className="truncate pr-6 text-sm font-semibold text-clinic-text">{p ? fullName(p) : "—"}</div>
                                  <div className="flex items-center gap-1.5 truncate text-[11px] font-semibold" style={{ color: estadoDe(a).color }}>
                                    {estadoDe(a).label}
                                    {a.sobrecupo && <span className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">Sobrecupo</span>}
                                  </div>
                                </button>
                                <ComentarioCita texto={a.notes} className="absolute right-1.5 top-1.5 print:hidden" />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (<>
            {bloqueosDelDia.length > 0 && (
              <section aria-label="Espacios bloqueados" className="flex flex-wrap items-center gap-2 rounded-xl border border-clinic-border bg-white px-3 py-2 text-sm">
                <span className="flex items-center gap-1.5 font-bold text-clinic-text"><Lock aria-hidden className="h-3.5 w-3.5 text-clinic-muted" /> Espacios bloqueados:</span>
                {bloqueosDelDia.map((b) => (
                  <span key={b.id} className={`inline-flex items-center gap-2 rounded-lg border border-clinic-border px-2 py-0.5 text-[13px] text-clinic-text ${RAYADO}`}>
                    <span>{`${rangoDeBloqueo(b)} ${b.reason || "Bloqueado"} · ${quienBloquea(b, db.users)}${b.boxId ? ` · ${nombreDeBox(b.boxId) ?? ""}` : ""}`}</span>
                    {puedeEditar && (
                      <button type="button" aria-haspopup="menu" aria-label={`Quitar: ${etiquetaBloqueo(b)}`} onClick={(ev) => abrirMenuBloqueo(b, ev.currentTarget)} className="text-[12px] font-bold text-state-err hover:underline print:hidden">Quitar</button>
                    )}
                  </span>
                ))}
              </section>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre del paciente en las citas de hoy…" className="w-full rounded-xl border border-clinic-border bg-white py-2.5 pl-9 pr-3 text-sm focus:border-azure-600" />
            </div>
            {dayAppts.length === 0 ? (
              <Empty title="Sin citas para este día" desc="Usá “Dar cita” para agendar, o cambiá de fecha." />
            ) : (
              <Card className="overflow-x-auto p-0 print:overflow-visible">
                <table className="w-full min-w-[820px] text-sm print:min-w-0">
                  <thead><tr className="border-b border-clinic-border text-left text-[13px] font-bold text-clinic-text">
                    <th className="px-3 py-2">Hora</th><th className="px-2 py-2">Paciente</th><th className="px-2 py-2">Doctor</th><th className="px-2 py-2">Estado de la cita</th>{verMontos && <th className="px-2 py-2">Situación</th>}<th className="px-2 py-2"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-clinic-border">
                    {dayAppts.map((a) => {
                      const p = db.patients.find((x) => x.id === a.patientId);
                      const dent = db.users.find((x) => x.id === a.dentistId);
                      const multi = p ? dayAll.filter((x) => x.patientId === p.id).length > 1 : false;
                      return (
                        <tr key={a.id} className="align-top hover:bg-clinic-bg/50">
                          <td className="px-3 py-2">
                            <div className="inline-flex flex-col items-center rounded-lg border-l-4 bg-clinic-bg px-2 py-1 tabular-nums text-[11px] font-bold text-clinic-text" style={{ borderColor: estadoDe(a).color }}>
                              <span>{fmtTime(a.start)}</span><ChevronDown className="h-3 w-3 text-clinic-muted" /><span>{fmtTime(a.end)}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            {p ? <Link href={`/app/pacientes/${p.id}`} className="font-bold text-azure-700 hover:underline">{fullName(p)}</Link> : <span className="text-clinic-muted">—</span>}
                            {a.source === "online" && <span className="ml-2 rounded bg-state-infobg px-1.5 text-[11px] font-bold text-state-info">Online</span>}
                            {multi && <span className="ml-2 rounded bg-state-warnbg px-1.5 text-[11px] font-bold text-state-warn">Múltiples citas hoy</span>}
                            {a.sobrecupo && <span className="ml-2 rounded bg-amber-100 px-1.5 text-[11px] font-bold text-amber-800" title="Se dio sobreagendando: comparte el horario con otra cita">Sobrecupo</span>}
                            <ComentarioCita texto={a.notes} className="ml-1 align-middle print:hidden" />
                            {a.prestaciones && a.prestaciones.length > 0 && (
                              <ul aria-label="Procedimiento a realizar" className="mt-1 flex flex-wrap gap-1">
                                {a.prestaciones.map((x, i) => <li key={i} className="rounded bg-clinic-bg px-1.5 py-0.5 text-[11px] text-clinic-text">{textoPrestacion(x)}</li>)}
                              </ul>
                            )}
                            {verPersonales && p?.phone && <div className="mt-0.5 flex items-center gap-1 text-xs text-clinic-muted"><Phone className="h-3 w-3" /> {p.phone}</div>}
                          </td>
                          <td className="px-2 py-2 text-clinic-muted">{dent?.name ?? "—"}</td>
                          <td className="px-2 py-2">
                            <EstadoCell
                              appt={a}
                              editable={puedeEditar}
                              onSet={(st) => setEstado(a, st)}
                              onNotificar={verPersonales ? () => void notificar(a, "estado") : undefined}
                              sinEmail={!p?.email}
                            />
                            {(a.status === "cancelada" || a.status === "ausente") && <div className="mt-0.5 text-[11px] text-clinic-muted">{a.cancelReason || "Sin motivo"}</div>}
                          </td>
                          {verMontos && <td className="px-2 py-2"><SituacionPill patientId={a.patientId} /></td>}
                          <td className="px-2 py-2 text-right print:hidden">
                            <AccionesCita
                              onVer={() => setViewing(a)}
                              onSobreagendar={puedeAgendar ? () => sobreagendarDesde(a) : undefined}
                              onEditar={puedeEditar ? () => { setPreseleccion(undefined); setAbrirCon({}); setEditing(a); } : undefined}
                              onEliminar={puedeEditar ? () => { if (window.confirm("¿Eliminar esta cita?")) deleteAppointment(a.id); } : undefined}
                            />
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
            const live = db.appointments.find((x) => x.id === viewing.id) ?? viewing;
            return (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-clinic-muted">Estado</span><span className="flex items-center gap-1.5">{live.sobrecupo && <Badge tone="warn" tip="Se dio sobreagendando: comparte el horario con otra cita">Sobrecupo</Badge>}<StatusBadge status={live.status} estadoId={live.estadoId} /></span></div>
                <div className="flex items-center justify-between"><span className="text-clinic-muted">Paciente</span>{p ? <Link className="font-bold text-azure-600 hover:underline" href={`/app/pacientes/${p.id}`}>{fullName(p)}</Link> : "—"}</div>
                <div className="flex items-center justify-between"><span className="text-clinic-muted">Dentista</span><span className="font-semibold">{d?.name ?? "—"}</span></div>
                <div className="flex items-center justify-between"><span className="text-clinic-muted">Horario</span><span className="tabular-nums text-xs">{new Date(live.start).toLocaleDateString("es-PY", { day: "2-digit", month: "short" })}, {fmtTime(live.start)} → {fmtTime(live.end)}</span></div>
                {verMontos && <div className="flex items-center justify-between"><span className="text-clinic-muted">Total a cobrar</span><span className="tabular-nums font-bold">{fmtGs(live.amount - live.discount)}</span></div>}
                {live.prestaciones && live.prestaciones.length > 0 && (
                  <div>
                    <span className="text-clinic-muted">Procedimiento a realizar</span>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-clinic-text">
                      {live.prestaciones.map((x, i) => <li key={i}>{textoPrestacion(x)}</li>)}
                    </ul>
                  </div>
                )}
                {live.notes && <p className="rounded-xl bg-clinic-bg p-3 text-clinic-text">{live.notes}</p>}

                {live.telemed && (
                  <div className="rounded-xl border border-azure-300 bg-azure-50 p-3">
                    <div className="flex items-center gap-1.5 text-[13px] font-bold text-azure-700"><Video className="h-3.5 w-3.5" /> Videoconsulta</div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button onClick={() => { const tok = live.videoToken ?? newSignToken(); if (!live.videoToken) upsertAppointment({ ...live, videoToken: tok }); window.open(`https://meet.jit.si/nvd-${tok}`, "_blank", "noopener,noreferrer"); }} className="inline-flex items-center gap-1.5 rounded-xl bg-azure-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-azure-700"><Video className="h-4 w-4" /> Iniciar videoconsulta</button>
                      <button onClick={() => { const tok = live.videoToken ?? newSignToken(); if (!live.videoToken) upsertAppointment({ ...live, videoToken: tok }); try { navigator.clipboard?.writeText(`${window.location.origin}/videoconsulta/${live.clinicId}/${live.id}?t=${tok}`); } catch { /* sin portapapeles */ } }} className="rounded-xl border border-clinic-border px-3 py-2 text-xs font-bold text-clinic-muted hover:text-clinic-text">Copiar link del paciente</button>
                    </div>
                  </div>
                )}

                {p && verPersonales && puedeEditar && (
                  <div className="rounded-xl border border-clinic-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[13px] font-bold text-clinic-muted"><BellRing className="h-3.5 w-3.5" /> Confirmación de cita</span>
                      {live.respondidaAt ? <Badge tone="ok" tip="El paciente respondió desde el link">Respondió</Badge> : live.reminderSent ? <Badge tone="ok" tip="Ya se envió el recordatorio">Enviado</Badge> : <Badge tone="warn" tip="Aún sin recordatorio">Pendiente</Badge>}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!p.email}
                        title={p.email ? `Se manda a ${p.email}` : "El paciente no tiene email cargado"}
                        onClick={() => void notificar(live, "confirmacion")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-azure-50 px-3.5 py-2 text-xs font-bold text-azure-700 transition-colors hover:bg-azure-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Mail className="h-4 w-4" /> Enviar al correo
                      </button>
                      <button
                        type="button"
                        title="El paciente confirma o anula desde este link, sin entrar a ningún lado"
                        onClick={() => {
                          const tok = live.confirmToken ?? newSignToken();
                          if (!live.confirmToken) upsertAppointment({ ...live, confirmToken: tok });
                          try { navigator.clipboard?.writeText(linkConfirmacion(window.location.origin, live.clinicId, tok, "whatsapp")); } catch { /* sin portapapeles */ }
                          setAviso({ ok: true, texto: "Link de confirmación copiado." });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-clinic-border px-3 py-2 text-xs font-bold text-clinic-muted hover:text-clinic-text"
                      >
                        <Link2 className="h-4 w-4" /> Copiar link
                      </button>
                      <button onClick={() => upsertAppointment({ ...live, reminderSent: !live.reminderSent })} className="rounded-xl border border-clinic-border px-3 py-2 text-xs font-bold text-clinic-muted hover:text-clinic-text">{live.reminderSent ? "Marcar como no enviado" : "Marcar como enviado"}</button>
                    </div>
                    {live.respondidaAt && (
                      <p className="mt-2 text-[12px] text-clinic-muted">El paciente respondió desde el link el {fmtDate(live.respondidaAt)} a las {fmtTime(live.respondidaAt)}.</p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-2 print:hidden">
                  {puedeAgendar && <Btn variant="outline" onClick={() => sobreagendarDesde(live)}><CalendarCheck className="h-3.5 w-3.5" /> Sobreagendar en este horario</Btn>}
                  {puedeEditar && <Btn variant="outline" onClick={() => { setPreseleccion(undefined); setAbrirCon({}); setEditing(live); setViewing(null); }}><Pencil className="h-3.5 w-3.5" /> Editar</Btn>}
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
          puedeAgendar={puedeAgendar}
          onSchedule={(entry) => {
            setFromWaitlist(entry.id);
            setPreseleccion(undefined);
            setAbrirCon({});
            setEditing(citaBase({ patientId: entry.patientId, title: entry.reason }));
            setWaitOpen(false);
          }}
        />
      )}

      {/* Modal DAR CITA / EDITAR */}
      {editing && (
        <DarCita
          cita={editing}
          esNueva={!db.appointments.some((x) => x.id === editing.id)}
          preseleccion={preseleccion?.hora ? preseleccion : undefined}
          desdeFecha={preseleccion && !preseleccion.hora ? preseleccion.fecha : undefined}
          sobreagendar={abrirCon.sobreagendar}
          multiconsulta={abrirCon.multiconsulta}
          onClose={cerrarDarCita}
          onGuardar={(nuevas, espera) => {
            for (const a of nuevas) {
              const old = db.appointments.find((x) => x.id === a.id);
              upsertAppointment(a);
              if (!old && botikaEnabled(db, "confirmCita")) {
                const p = db.patients.find((x) => x.id === a.patientId);
                if (p?.phone) addOutboxTask(makeOutboxTask({ db, type: "confirmar_cita", patient: p, refId: a.id, by: session!.name, message: botikaMessage(db, "confirmCita", { paciente: p.firstName, clinica: db.clinics[0].name, titulo: a.title || "Cita", fecha: new Date(a.start).toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" }), hora: fmtTime(a.start) }) }));
              }
            }
            if (espera) {
              addWaitlist({ id: `w_${Date.now()}`, clinicId: session!.clinicId, patientId: espera.patientId, reason: espera.motivo, preference: espera.preferencia || "Sin preferencia", createdAt: new Date().toISOString() });
            }
            if (fromWaitlist && nuevas.length > 0) removeWaitlist(fromWaitlist);
            setEditing(null); setFromWaitlist(null); setPreseleccion(undefined); setAbrirCon({});
          }}
        />
      )}

      {/* Modal BLOQUEAR ESPACIO (desde el menú de un espacio de la semanal) */}
      {bloqueando && (
        <BloquearEspacio
          fecha={bloqueando.fecha}
          hora={bloqueando.hora}
          dentistId={proFilter !== "all" ? proFilter : undefined}
          boxId={variosBoxes && boxFilter !== "all" ? boxFilter : undefined}
          onClose={cerrarBloquear}
          onGuardar={(bs) => {
            addAgendaBlocks(bs);
            setBloqueando(null);
            setAviso({ ok: true, texto: bs.length === 1 ? "Espacio bloqueado." : `Se bloquearon ${bs.length} espacios.` });
          }}
        />
      )}
      {/* Menú de un bloqueo en la Diaria y la Diaria global (la semanal tiene el suyo) */}
      <MenuBloqueo bloqueo={bloqueoAbierto} ancla={anclaBloqueo} onCerrar={cerrarMenuBloqueo} onQuitar={quitarBloqueos} />
    </div>
  );
}

/* ===== Celda "Estado de la cita" con desplegable para cambiarlo =====
   El menú se dibuja en un portal (components/Desplegable): dentro de la tabla con scroll
   quedaba cortado y aparecía una barra interna. Arriba, «Notificar por mail». */
function EstadoCell({ appt, onSet, editable, onNotificar, sinEmail }: {
  appt: Appointment; onSet: (e: EstadoCita) => void; editable: boolean;
  /** Avisa al paciente por correo el estado actual. Sin esto no se muestra la opción. */
  onNotificar?: () => void;
  sinEmail?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const estados = useEstadosCita();
  const actual = estadoDeCita(appt, estados);
  const punto = <span className="h-2 w-2 rounded-full" style={{ background: actual.color }} />;
  if (!editable) {
    return <span className="flex items-center gap-1.5 px-1 py-0.5 text-sm font-semibold" style={{ color: actual.color }}>{punto}{actual.label}</span>;
  }
  return (
    <>
      <button ref={ref} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-sm font-semibold hover:bg-clinic-bg" style={{ color: actual.color }}>
        {punto}
        {actual.label}
        <ChevronDown className={`h-3.5 w-3.5 text-clinic-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <Desplegable ancla={ref} abierto={open} onCerrar={() => setOpen(false)} ancho={220} etiqueta="Estado de la cita">
        {onNotificar && (
          <>
            <ItemMenu onClick={() => { setOpen(false); onNotificar(); }} deshabilitado={sinEmail} titulo={sinEmail ? "El paciente no tiene email cargado" : undefined}>
              <Mail className="h-3.5 w-3.5 text-azure-600" /> Notificar por mail{sinEmail ? " (sin email)" : ""}
            </ItemMenu>
            <div className="my-1 border-t border-clinic-border" />
          </>
        )}
        {estados.map((st) => (
          <ItemMenu key={st.id} onClick={() => { onSet(st); setOpen(false); }}>
            <span className="h-2 w-2 rounded-full" style={{ background: st.color }} />
            <span className={st.id === actual.id ? "font-bold" : ""}>{st.label}</span>
            {st.id === actual.id && <Check className="ml-auto h-3.5 w-3.5 text-azure-600" />}
          </ItemMenu>
        ))}
      </Desplegable>
    </>
  );
}

/* ===== Menú ⋮ de la cita (Ver / Sobreagendar / Editar / Eliminar), también en un portal ===== */
function AccionesCita({ onVer, onSobreagendar, onEditar, onEliminar }: { onVer: () => void; onSobreagendar?: () => void; onEditar?: () => void; onEliminar?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-clinic-bg" aria-label="Acciones de la cita">
        <MoreHorizontal className="h-4 w-4 text-clinic-muted" />
      </button>
      <Desplegable ancla={ref} abierto={open} onCerrar={() => setOpen(false)} ancho={onSobreagendar ? 250 : 160} alinear="derecha" etiqueta="Acciones de la cita">
        <ItemMenu onClick={() => { setOpen(false); onVer(); }}><Eye className="h-3.5 w-3.5" /> Ver</ItemMenu>
        {onSobreagendar && <ItemMenu onClick={() => { setOpen(false); onSobreagendar(); }}><CalendarCheck className="h-3.5 w-3.5 text-amber-600" /> Sobreagendar en este horario</ItemMenu>}
        {onEditar && <ItemMenu onClick={() => { setOpen(false); onEditar(); }}><Pencil className="h-3.5 w-3.5" /> Editar</ItemMenu>}
        {onEliminar && <ItemMenu peligro onClick={() => { setOpen(false); onEliminar(); }}><Trash2 className="h-3.5 w-3.5" /> Eliminar</ItemMenu>}
      </Desplegable>
    </>
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
function WaitlistModal({ onClose, onSchedule, puedeAgendar }: { onClose: () => void; onSchedule: (e: import("@/lib/types").WaitlistEntry) => void; puedeAgendar: boolean }) {
  const { db, addWaitlist, removeWaitlist } = useStore();
  // Roles v3: dentista y asistente ven y agregan solo a sus pacientes.
  const alcance = useAlcance();
  const pacientes = db.patients.filter((p) => alcance.vePaciente(p.id));
  const [adding, setAdding] = useState(false);
  const [patientId, setPatientId] = useState(pacientes[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [preference, setPreference] = useState("");
  const list = db.waitlist.filter((w) => alcance.vePaciente(w.patientId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <Modal title="Lista de espera" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-clinic-muted">Pacientes esperando un hueco — agendalos cuando se libere un horario.</p>
          {puedeAgendar && <Btn variant="outline" onClick={() => setAdding((v) => !v)}><Plus className="h-3.5 w-3.5" /> Agregar</Btn>}
        </div>

        {adding && (
          <div className="grid gap-2 rounded-xl border border-clinic-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <select className={inputCls} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              {pacientes.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
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
                  {puedeAgendar && <Btn onClick={() => onSchedule(w)}><CalendarDays className="h-3.5 w-3.5" /> Agendar</Btn>}
                  {puedeAgendar && <button onClick={() => removeWaitlist(w.id)} className="grid h-8 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err" title="Quitar de la lista"><Trash2 className="h-4 w-4" /></button>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
