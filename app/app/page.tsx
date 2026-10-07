"use client";
import Link from "next/link";
/** Dashboard estilo "Spike admin" adaptado a Novudent: banner de bienvenida,
 *  stats pastel, ingresos de la semana (barras), donut de estados y agenda. */
import { useEffect, useRef } from "react";
import { useInView, useMotionValue, animate } from "framer-motion";
import {
  CalendarDays, Users, FileText, PauseCircle, ArrowRight, RotateCcw, CheckCircle2, Circle, MoreHorizontal,
  AlertTriangle, FileSpreadsheet, Wallet, Package, CalendarX,
} from "lucide-react";
import { useStore, fmtTime, fmtGs, fullName } from "@/lib/store";
import { patientBalance } from "@/lib/budgets";
import { pendientesPorPaciente } from "@/lib/documentosClinicos";
import { HREF_DOCUMENTOS_PENDIENTES, HREF_RETENCIONES } from "@/lib/pendientes";
import { can, ROLE_DESCRIPCION } from "@/lib/rbac";
import { useAlcance } from "@/lib/useAlcance";
import { Card, Badge, StatusBadge } from "@/components/ui";
import { Isologo } from "@/components/Marca";
import { ContralorCard } from "@/components/NovudentIA";
import { MiAgenda } from "@/components/agenda/MiAgenda";
import { WeekBarsChart, StatusDonutChart } from "@/components/Charts";
import { useClinicPlan } from "@/components/PlanGate";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

/* ---- count-up ---- */
function Count({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-30px" });
  const mv = useMotionValue(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(mv, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { if (ref.current) ref.current.textContent = Math.round(v).toLocaleString("es-PY"); },
    });
    return () => c.stop();
  }, [inView, value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref}>0</span>;
}

/* ---- Indicador clínico ---- */
function SpikeStat({
  label, value, icon: Icon, tone, href,
}: { label: string; value: number; icon: any; tone: "azure" | "green" | "amber" | "red"; href: string }) {
  const tones = {
    azure: { icon: "bg-azure-50 text-azure-700", edge: "border-t-azure-500" },
    green: { icon: "bg-state-okbg text-state-ok", edge: "border-t-state-ok" },
    amber: { icon: "bg-state-warnbg text-state-warn", edge: "border-t-state-warn" },
    red: { icon: "bg-state-errbg text-state-err", edge: "border-t-state-err" },
  }[tone];
  return (
    <Link href={href} className={`group block h-full rounded-[18px] border border-t-[3px] border-clinic-border bg-white p-5 shadow-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-azure-200 hover:shadow-pop ${tones.edge}`}>
      <span className={`grid h-10 w-10 place-items-center rounded-[10px] ${tones.icon}`}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <p className="mt-4 text-[28px] font-bold leading-none tabular-nums text-clinic-text"><Count value={value} /></p>
      <p className="mt-0.5 text-sm font-medium text-clinic-muted">{label}</p>
    </Link>
  );
}

/* Las gráficas (barras semanales y donut de estados) viven en
 * components/Charts.tsx — Recharts con tooltips interactivos. */

/** Primer nombre para el saludo; con título («Dra. Sofía Benítez») va el título y el nombre. */
function saludo(nombre: string): string {
  const [primero, segundo] = nombre.trim().split(/\s+/);
  return /^dra?\.?$/i.test(primero) && segundo ? `${primero} ${segundo}` : primero;
}

export default function Dashboard() {
  const { db, session, setOnboarding, resetDemo } = useStore();
  const plan = useClinicPlan();
  const alcance = useAlcance();
  if (!session) return null;

  const today = new Date();
  const isToday = (iso: string) => new Date(iso).toDateString() === today.toDateString();
  const todays = db.appointments.filter((a) => isToday(a.start) && a.status !== "cancelada" && alcance.veDoctor(a.dentistId)).sort((a, b) => a.start.localeCompare(b.start));
  // Documentos clínicos pendientes (documentos nuevos + formularios viejos), por paciente.
  const conPendientes = pendientesPorPaciente(db.patients, db.clinicalDocs);
  const pendingForms = conPendientes.size;
  const onHold = db.billing.filter((b) => b.flags.includes("HOLD") || b.flags.includes("MGRHOLD")).length;

  /* semana actual */
  const mon = new Date(today);
  mon.setHours(0, 0, 0, 0);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const week = db.appointments.filter((a) => {
    if (!alcance.veDoctor(a.dentistId)) return false;
    const t = new Date(a.start);
    const end = new Date(mon); end.setDate(mon.getDate() + 7);
    return t >= mon && t < end;
  });
  const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const revenue = DAYS.map((d, i) => {
    const day = new Date(mon); day.setDate(mon.getDate() + i);
    const v = week
      .filter((a) => new Date(a.start).toDateString() === day.toDateString() && a.status !== "cancelada")
      .reduce((s, a) => s + a.amount - a.discount, 0);
    return { d, v };
  });
  const weekRevenue = revenue.reduce((s, x) => s + x.v, 0);
  const statusCount = {
    ok: week.filter((a) => a.status === "confirmada").length,
    warn: week.filter((a) => a.status === "pendiente").length,
    done: week.filter((a) => a.status === "completada").length,
    err: week.filter((a) => a.status === "cancelada").length,
  };
  /* Matriz v2: el dentista no ve reportes financieros */
  const canReports = can(session.role, "billing.reports");

  /* ===== Panel de tareas críticas ===== */
  const captureBudgets = db.budgets.filter((b) => b.status === "presentado");
  const debtorCount = db.patients.filter((p) => patientBalance(p.id, db.budgets, db.payments) > 0).length;
  const cancelledWeek = week.filter((a) => a.status === "cancelada");
  const lowStock = db.stock.filter((s) => s.stock <= s.minStock);
  const hasCaja = plan.features.includes("caja");
  const hasInv = plan.features.includes("inventario");
  const criticalTasks = [
    can(session.role, "budgets.manage") && captureBudgets.length > 0 && {
      icon: FileSpreadsheet, tone: "bg-state-infobg text-state-info",
      label: `${captureBudgets.length} presupuesto${captureBudgets.length > 1 ? "s" : ""} presentado${captureBudgets.length > 1 ? "s" : ""} sin aceptar`,
      hint: "Tarea de captura: hacer seguimiento al paciente", href: "/app/presupuestos",
    },
    hasCaja && canReports && debtorCount > 0 && {
      icon: Wallet, tone: "bg-state-warnbg text-state-warn",
      label: `${debtorCount} paciente${debtorCount > 1 ? "s" : ""} con saldo pendiente`,
      hint: "Tarea de morosidad: enviar recordatorio de pago", href: "/app/caja",
    },
    cancelledWeek.length > 0 && {
      icon: CalendarX, tone: "bg-state-errbg text-state-err",
      label: `${cancelledWeek.length} cita${cancelledWeek.length > 1 ? "s" : ""} cancelada${cancelledWeek.length > 1 ? "s" : ""} esta semana`,
      hint: "Reagendar o pasar a lista de espera", href: "/app/agenda",
    },
    hasInv && can(session.role, "inventory.manage") && lowStock.length > 0 && {
      icon: Package, tone: "bg-state-warnbg text-state-warn",
      label: `${lowStock.length} insumo${lowStock.length > 1 ? "s" : ""} con stock bajo`,
      hint: lowStock.map((s) => s.name.split(" ").slice(0, 2).join(" ")).join(", "), href: "/app/inventario",
    },
    ...db.recoveryMonitors
      .filter((m) => m.status === "escalado" && !m.resolvedAt && alcance.vePaciente(m.patientId))
      .map((m) => {
        const p = db.patients.find((x) => x.id === m.patientId);
        return {
          icon: AlertTriangle, tone: "bg-state-errbg text-state-err",
          label: `🔴 Recuperación: ${p ? p.firstName + " " + p.lastName : "paciente"} reporta posible complicación`,
          hint: m.touchpoints.find((t) => t.severity === "rojo")?.summary || "Revisar y contactar",
          href: `/app/pacientes/${m.patientId}`,
        };
      }),
    ...(can(session.role, "budgets.manage")
      ? db.budgets
          .filter((b) => b.negociacion?.status === "listo_para_cerrar" && b.status === "presentado")
          .map((b) => {
            const p = db.patients.find((x) => x.id === b.patientId);
            return {
              icon: FileSpreadsheet, tone: "bg-state-okbg text-state-ok",
              label: `💰 Listo para cerrar: ${p ? p.firstName + " " + p.lastName : "paciente"}`,
              hint: b.negociacion?.financiacionElegida ? `Acordó: ${b.negociacion.financiacionElegida}` : "Confirmá las condiciones",
              href: "/app/presupuestos",
            };
          })
      : []),
  ].filter(Boolean) as { icon: any; tone: string; label: string; hint: string; href: string }[];

  const checklist = [
    { key: "usersCreated" as const, label: "Crear usuarios del equipo", done: db.onboarding.usersCreated, href: "/app/configuracion" },
    { key: "servicesDefined" as const, label: "Definir servicios y aranceles", done: db.onboarding.servicesDefined, href: "/app/configuracion" },
    { key: "tourDone" as const, label: "Recorrer la Agenda y el Buscador", done: db.onboarding.tourDone, href: "/app/agenda" },
  ];

  // Snapshot de pendientes para el Contralor IA — los mismos flujos
  // del panel de tareas críticas, con el detalle que el digest necesita.
  // Roles v3: cada rol le pasa a la IA solo lo que puede ver (sus citas, y
  // presupuestos, formularios o stock únicamente si tiene esos permisos).
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const tomorrowUnconfirmed = db.appointments.filter(
    (a) => new Date(a.start).toDateString() === tomorrow.toDateString() && a.status === "pendiente" && alcance.veDoctor(a.dentistId)
  );
  const contralorPendientes = {
    fecha: today.toISOString().slice(0, 10),
    citasMananaSinConfirmar: tomorrowUnconfirmed.map((a) => ({
      hora: fmtTime(a.start),
      paciente: (() => { const p = db.patients.find((x) => x.id === a.patientId); return p ? `${p.firstName} ${p.lastName}` : "—"; })(),
      titulo: a.title,
    })),
    presupuestosSinRespuesta: (can(session.role, "budgets.manage") ? captureBudgets : []).slice(0, 10).map((b) => ({
      paciente: (() => { const p = db.patients.find((x) => x.id === b.patientId); return p ? `${p.firstName} ${p.lastName}` : "—"; })(),
      presentadoEl: b.createdAt?.slice(0, 10),
    })),
    morosos: canReports
      ? db.patients
          .map((p) => ({ nombre: `${p.firstName} ${p.lastName}`, saldoGs: patientBalance(p.id, db.budgets, db.payments) }))
          .filter((x) => x.saldoGs > 0)
          .sort((a, b) => b.saldoGs - a.saldoGs)
          .slice(0, 8)
      : [],
    formulariosPendientes: (can(session.role, "engagement.forms") ? db.patients : [])
      .filter((p) => conPendientes.has(p.id))
      .slice(0, 10)
      .map((p) => `${p.firstName} ${p.lastName}`),
    canceladasEstaSemana: cancelledWeek.length,
    stockBajo: can(session.role, "inventory.manage") ? lowStock.map((s) => ({ insumo: s.name, stock: s.stock, minimo: s.minStock })) : [],
  };

  return (
    <div className="space-y-6">
      {/* ===== Bienvenida con la identidad del producto ===== */}
      <Reveal y={0}>
      <div className="dashboard-hero relative overflow-hidden rounded-[22px] px-6 py-7 text-white sm:px-8 sm:py-9">
        <Isologo className="pointer-events-none absolute -right-6 -top-20 h-[300px] w-auto opacity-[0.12] sm:right-8 sm:-top-16 sm:h-[350px]" />
        <div className="relative max-w-2xl">
          <div className="inline-flex items-center gap-2 border-b border-azure-300/40 pb-2 text-[12px] font-semibold text-azure-200">
            <span className="h-1.5 w-1.5 rounded-full bg-azure-300" />
            {today.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <h1 className="mt-4 text-2xl font-bold">Hola, {saludo(session.name)}</h1>
          <p className="mt-1.5 max-w-md text-sm text-white/65">
            {todays.length > 0
              ? <>Tenés <b className="text-white">{todays.length} cita{todays.length > 1 ? "s" : ""}</b> hoy{canReports && <> · producción semanal <b className="text-white">{fmtGs(weekRevenue)}</b></>}.</>
              : <>Sin citas para hoy{canReports && <> · producción semanal <b className="text-white">{fmtGs(weekRevenue)}</b></>}.</>}
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link href="/app/agenda" className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-white px-4 py-2.5 text-sm font-bold text-navy-800 transition-colors hover:bg-azure-50">
              Ir a la agenda <ArrowRight className="h-4 w-4" />
            </Link>
            {session.clinicId === "cl_demo" && (
              <button onClick={resetDemo} className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-white/25 px-4 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white">
                <RotateCcw className="h-3.5 w-3.5" /> Reiniciar demo
              </button>
            )}
          </div>
        </div>
      </div>
      </Reveal>

      {/* ===== Indicadores ===== */}
      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem><SpikeStat label="Citas de hoy" value={todays.length} icon={CalendarDays} tone="azure" href="/app/agenda" /></StaggerItem>
        <StaggerItem><SpikeStat label={alcance.pacientes ? "Mis pacientes" : "Pacientes activos"} value={alcance.pacientes ? alcance.pacientes.size : db.patients.length} icon={Users} tone="green" href="/app/pacientes" /></StaggerItem>
        {alcance.puede("engagement.forms") && <StaggerItem><SpikeStat label="Documentos pendientes" value={pendingForms} icon={FileText} tone={pendingForms > 0 ? "amber" : "green"} href={HREF_DOCUMENTOS_PENDIENTES} /></StaggerItem>}
        {alcance.puede("money.view") && <StaggerItem><SpikeStat label="Reclamos en retención" value={onHold} icon={PauseCircle} tone={onHold > 0 ? "red" : "green"} href={HREF_RETENCIONES} /></StaggerItem>}
      </Stagger>

      {/* ===== Mi agenda — lo que me toca hoy y esta semana ===== */}
      <Reveal><MiAgenda /></Reveal>

      {/* ===== Contralor IA — parte del día ===== */}
      {plan.features.includes("ia") && <Reveal><ContralorCard pendientes={contralorPendientes} /></Reveal>}

      {/* ===== Panel de tareas críticas ===== */}
      {criticalTasks.length > 0 && (
        <Reveal>
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-state-warn" />
            <h2 className="font-bold text-clinic-text">Tareas críticas</h2>
            <Badge tone="warn">{criticalTasks.length}</Badge>
          </div>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {criticalTasks.map((t) => (
              <Link key={t.label} href={t.href} className="group flex items-center gap-3 rounded-xl border border-clinic-border p-3 transition-[color,background-color,border-color,box-shadow,transform,opacity] hover:-translate-y-0.5 hover:border-azure-200 hover:shadow-card">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.tone}`}><t.icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-clinic-text">{t.label}</span>
                  <span className="block truncate text-[11px] text-clinic-muted">{t.hint}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-clinic-muted transition-transform group-hover:translate-x-0.5 group-hover:text-azure-600" />
              </Link>
            ))}
          </div>
        </Card>
        </Reveal>
      )}

      {/* ===== Gráficos (reportes financieros: solo admin/asistente — matriz v2) ===== */}
      <Reveal className="grid gap-5 lg:grid-cols-5">
        {canReports ? (
          <Card className="p-6 lg:col-span-3">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="font-bold text-clinic-text">Producción de la semana</h2>
                <p className="text-xs text-clinic-muted">Total: <b className="text-clinic-text">{fmtGs(weekRevenue)}</b> · citas no canceladas</p>
              </div>
              <span className="grid h-8 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-clinic-bg"><MoreHorizontal className="h-4 w-4" /></span>
            </div>
            <div className="chart-glow"><WeekBarsChart data={revenue} money name="Producción" /></div>
          </Card>
        ) : (
          <Card className="p-6 lg:col-span-3">
            <h2 className="font-bold text-clinic-text">Mi semana clínica</h2>
            <p className="mt-0.5 text-xs text-clinic-muted">Citas por día (los reportes financieros son del área administrativa)</p>
            <div className="mt-5">
              <WeekBarsChart name="Citas" data={DAYS.map((d, i) => {
                const day = new Date(mon); day.setDate(mon.getDate() + i);
                return { d, v: week.filter((a) => new Date(a.start).toDateString() === day.toDateString() && a.status !== "cancelada").length };
              })} />
            </div>
          </Card>
        )}
        <Card className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="font-bold text-clinic-text">Estados de citas</h2>
              <p className="text-xs text-clinic-muted">Semana actual</p>
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-clinic-bg"><MoreHorizontal className="h-4 w-4" /></span>
          </div>
          <StatusDonutChart
            glow
            centerLabel="Citas · semana"
            parts={[
              { label: "Confirmadas", v: statusCount.ok, color: "#0E9F6E" },
              { label: "Pendientes", v: statusCount.warn, color: "#D97706" },
              { label: "Completadas", v: statusCount.done, color: "#0369C9" },
              { label: "Canceladas", v: statusCount.err, color: "#DC2626" },
            ]}
          />
        </Card>
      </Reveal>

      {/* ===== Agenda de hoy + Onboarding ===== */}
      <Reveal className="grid gap-5 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-clinic-text">Agenda de hoy</h2>
            <Link href="/app/agenda" className="inline-flex items-center gap-1 text-xs font-bold text-azure-600 hover:text-azure-700">
              Ver completa <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {todays.length === 0 ? (
            <p className="py-8 text-center text-sm text-clinic-muted">Sin citas para hoy.</p>
          ) : (
            <div className="divide-y divide-clinic-border">
              {todays.map((a) => {
                const p = db.patients.find((x) => x.id === a.patientId);
                return (
                  <Link key={a.id} href={`/app/pacientes/${a.patientId}`} className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 hover:bg-clinic-bg">
                    <span className="w-12 tabular-nums text-sm font-bold text-clinic-text">{fmtTime(a.start)}</span>
                    <span className="flex-1">
                      <span className="block text-sm font-bold text-clinic-text">{p ? fullName(p) : "—"}</span>
                      <span className="block text-xs text-clinic-muted">{a.title}</span>
                    </span>
                    {alcance.puede("money.view") && <span className="hidden text-xs font-semibold text-clinic-muted sm:block">{fmtGs(a.amount - a.discount)}</span>}
                    <StatusBadge status={a.status} estadoId={a.estadoId} />
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h2 className="font-bold text-clinic-text">Puesta en marcha</h2>
          <p className="mt-0.5 text-xs text-clinic-muted">
            {checklist.filter((c) => !c.done).length === 0 ? "¡Todo listo! La clínica está configurada." : `${checklist.filter((c) => !c.done).length} paso(s) pendiente(s)`}
          </p>
          <div className="mt-4 space-y-2">
            {checklist.map((c) => (
              <div key={c.key} className="flex items-center gap-3 rounded-xl border border-clinic-border p-3 transition-colors hover:border-azure-200">
                <button onClick={() => can(session.role, "practice.config") && setOnboarding(c.key, !c.done)} aria-label={c.done ? "Marcar pendiente" : "Marcar hecho"}>
                  {c.done ? <CheckCircle2 className="h-5 w-5 text-state-ok" /> : <Circle className="h-5 w-5 text-clinic-border" />}
                </button>
                <Link href={c.href} className={`flex-1 text-sm font-semibold ${c.done ? "text-clinic-muted line-through" : "text-clinic-text hover:text-azure-700"}`}>
                  {c.label}
                </Link>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-azure-50 p-3 text-xs leading-relaxed text-azure-700">
            <Badge tone="info">RBAC</Badge>
            <span>
              {ROLE_DESCRIPCION[session.role]}
              {alcance.sinDoctores && <> Todavía no tenés doctores asignados: pedile al administrador que te asigne en Usuarios.</>}
            </span>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}
