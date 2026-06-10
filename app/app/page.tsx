"use client";
/** Dashboard estilo "Spike admin" adaptado a Novudent: banner de bienvenida,
 *  stats pastel, ingresos de la semana (barras), donut de estados y agenda. */
import { useEffect, useRef } from "react";
import { motion, useInView, useMotionValue, animate } from "framer-motion";
import {
  CalendarDays, Users, FileText, PauseCircle, ArrowRight, RotateCcw, CheckCircle2, Circle, MoreHorizontal, Sparkles,
} from "lucide-react";
import { useStore, fmtTime, fmtGs, fullName } from "@/lib/store";
import { can } from "@/lib/rbac";
import { Card, Badge, StatusBadge, Btn } from "@/components/ui";
import { ToothGlyph } from "@/components/Odontogram";

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

/* ---- stat pastel (Spike) ---- */
function SpikeStat({
  label, value, icon: Icon, tone, href,
}: { label: string; value: number; icon: any; tone: "azure" | "green" | "amber" | "red"; href: string }) {
  const tones = {
    azure: "bg-azure-50 text-azure-600",
    green: "bg-state-okbg text-state-ok",
    amber: "bg-state-warnbg text-state-warn",
    red: "bg-state-errbg text-state-err",
  }[tone];
  return (
    <a href={href} className="group rounded-2xl border border-clinic-border bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-pop">
      <span className={`grid h-12 w-12 place-items-center rounded-2xl transition-transform group-hover:scale-105 ${tones}`}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <p className="mt-4 text-3xl font-extrabold tabular-nums text-clinic-text"><Count value={value} /></p>
      <p className="mt-0.5 text-sm font-medium text-clinic-muted">{label}</p>
    </a>
  );
}

/* ---- barras: ingresos por día ---- */
function RevenueBars({ data }: { data: { d: string; v: number }[] }) {
  const max = Math.max(...data.map((x) => x.v), 1);
  return (
    <div className="flex h-44 items-end gap-3 sm:gap-4">
      {data.map((x, i) => (
        <div key={x.d} className="group flex flex-1 flex-col items-center gap-2" title={`${x.d}: ${fmtGs(x.v)}`}>
          <motion.div
            initial={{ height: 0 }}
            whileInView={{ height: `${Math.max(4, (x.v / max) * 100)}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            className={`w-full max-w-9 rounded-t-lg ${x.v === max ? "bg-azure-600" : "bg-azure-200 group-hover:bg-azure-300"} transition-colors`}
          />
          <span className="font-mono text-[10px] font-bold text-clinic-muted">{x.d}</span>
        </div>
      ))}
    </div>
  );
}

/* ---- donut de estados ---- */
function StatusDonut({ ok, warn, err }: { ok: number; warn: number; err: number }) {
  const total = Math.max(ok + warn + err, 1);
  const C = 2 * Math.PI * 42;
  const seg = (n: number) => (n / total) * C;
  let offset = 0;
  const parts = [
    { v: ok, color: "#0E9F6E", label: "Confirmadas" },
    { v: warn, color: "#D97706", label: "Pendientes" },
    { v: err, color: "#DC2626", label: "Canceladas" },
  ];
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="h-36 w-36 -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" stroke="#EEF2F8" strokeWidth="12" />
        {parts.map((p) => {
          const el = (
            <motion.circle
              key={p.label}
              cx="50" cy="50" r="42" fill="none"
              stroke={p.color} strokeWidth="12" strokeLinecap="butt"
              strokeDasharray={`${seg(p.v)} ${C}`}
              initial={{ strokeDashoffset: -0 , opacity: 0 }}
              whileInView={{ strokeDashoffset: -offset, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          );
          offset += seg(p.v);
          return el;
        })}
        <g className="rotate-90" style={{ transformOrigin: "50px 50px" }}>
          <text x="50" y="47" textAnchor="middle" className="fill-clinic-text" fontSize="20" fontWeight="800">{ok + warn + err}</text>
          <text x="50" y="61" textAnchor="middle" className="fill-clinic-muted" fontSize="7.5" fontWeight="700">CITAS · SEMANA</text>
        </g>
      </svg>
      <div className="space-y-2.5">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            <span className="w-24 text-clinic-muted">{p.label}</span>
            <span className="font-bold tabular-nums text-clinic-text">{p.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { db, session, setOnboarding, resetDemo } = useStore();
  if (!session) return null;

  const today = new Date();
  const isToday = (iso: string) => new Date(iso).toDateString() === today.toDateString();
  const todays = db.appointments.filter((a) => isToday(a.start) && a.status !== "cancelada").sort((a, b) => a.start.localeCompare(b.start));
  const pendingForms = db.patients.filter((p) => p.forms.some((f) => f.status === "pendiente")).length;
  const onHold = db.billing.filter((b) => b.flags.includes("HOLD") || b.flags.includes("MGRHOLD")).length;

  /* semana actual */
  const mon = new Date(today);
  mon.setHours(0, 0, 0, 0);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const week = db.appointments.filter((a) => {
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
    err: week.filter((a) => a.status === "cancelada").length,
  };

  const checklist = [
    { key: "usersCreated" as const, label: "Crear usuarios del equipo", done: db.onboarding.usersCreated, href: "/app/configuracion" },
    { key: "servicesDefined" as const, label: "Definir servicios y aranceles", done: db.onboarding.servicesDefined, href: "/app/configuracion" },
    { key: "tourDone" as const, label: "Recorrer la Agenda y el Buscador", done: db.onboarding.tourDone, href: "/app/agenda" },
  ];

  return (
    <div className="space-y-6">
      {/* ===== Banner de bienvenida (Spike) ===== */}
      <div className="relative overflow-hidden rounded-3xl bg-navy-800 p-7 text-white sm:p-8">
        <div className="absolute -right-8 -top-12 h-56 w-56 rounded-full bg-azure-500/25 blur-3xl" />
        <div className="absolute bottom-0 right-6 hidden gap-3 opacity-25 sm:flex">
          {["16", "11", "26"].map((n) => (
            <span key={n} className="[&_*]:!stroke-white/70 [&_svg]:h-20 [&_svg]:w-12"><ToothGlyph n={n} upper /></span>
          ))}
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-azure-200">
            <Sparkles className="h-3.5 w-3.5" />
            {today.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <h1 className="mt-2 font-logo text-3xl sm:text-4xl">Hola, {session.name.split(" ")[0]}</h1>
          <p className="mt-1.5 max-w-md text-sm text-white/65">
            {todays.length > 0
              ? <>Tenés <b className="text-white">{todays.length} cita{todays.length > 1 ? "s" : ""}</b> hoy · facturación semanal <b className="text-white">{fmtGs(weekRevenue)}</b>.</>
              : <>Sin citas para hoy · facturación semanal <b className="text-white">{fmtGs(weekRevenue)}</b>.</>}
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <a href="/app/agenda" className="btn-shine inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-navy-800 transition-all hover:-translate-y-0.5">
              Ir a la agenda <ArrowRight className="h-4 w-4" />
            </a>
            <button onClick={resetDemo} className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white">
              <RotateCcw className="h-3.5 w-3.5" /> Reiniciar demo
            </button>
          </div>
        </div>
      </div>

      {/* ===== Stats pastel ===== */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SpikeStat label="Citas de hoy" value={todays.length} icon={CalendarDays} tone="azure" href="/app/agenda" />
        <SpikeStat label="Pacientes activos" value={db.patients.length} icon={Users} tone="green" href="/app/pacientes" />
        <SpikeStat label="Formularios pendientes" value={pendingForms} icon={FileText} tone={pendingForms > 0 ? "amber" : "green"} href="/app/pacientes" />
        <SpikeStat label="Reclamos en retención" value={onHold} icon={PauseCircle} tone={onHold > 0 ? "red" : "green"} href="/app/facturacion" />
      </div>

      {/* ===== Gráficos ===== */}
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-3">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <h2 className="font-extrabold text-clinic-text">Producción de la semana</h2>
              <p className="text-xs text-clinic-muted">Total: <b className="text-clinic-text">{fmtGs(weekRevenue)}</b> · citas no canceladas</p>
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-clinic-bg"><MoreHorizontal className="h-4 w-4" /></span>
          </div>
          <RevenueBars data={revenue} />
        </Card>
        <Card className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="font-extrabold text-clinic-text">Estados de citas</h2>
              <p className="text-xs text-clinic-muted">Semana actual</p>
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-clinic-bg"><MoreHorizontal className="h-4 w-4" /></span>
          </div>
          <StatusDonut {...statusCount} />
        </Card>
      </div>

      {/* ===== Agenda de hoy + Onboarding ===== */}
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-extrabold text-clinic-text">Agenda de hoy</h2>
            <a href="/app/agenda" className="inline-flex items-center gap-1 text-xs font-bold text-azure-600 hover:text-azure-700">
              Ver completa <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
          {todays.length === 0 ? (
            <p className="py-8 text-center text-sm text-clinic-muted">Sin citas para hoy.</p>
          ) : (
            <div className="divide-y divide-clinic-border">
              {todays.map((a) => {
                const p = db.patients.find((x) => x.id === a.patientId);
                return (
                  <a key={a.id} href={`/app/pacientes/${a.patientId}`} className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 hover:bg-clinic-bg">
                    <span className="w-12 font-mono text-sm font-bold text-clinic-text">{fmtTime(a.start)}</span>
                    <span className="flex-1">
                      <span className="block text-sm font-bold text-clinic-text">{p ? fullName(p) : "—"}</span>
                      <span className="block text-xs text-clinic-muted">{a.title}</span>
                    </span>
                    <span className="hidden text-xs font-semibold text-clinic-muted sm:block">{fmtGs(a.amount - a.discount)}</span>
                    <StatusBadge status={a.status} />
                  </a>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h2 className="font-extrabold text-clinic-text">Puesta en marcha</h2>
          <p className="mt-0.5 text-xs text-clinic-muted">
            {checklist.filter((c) => !c.done).length === 0 ? "¡Todo listo! La clínica está configurada." : `${checklist.filter((c) => !c.done).length} paso(s) pendiente(s)`}
          </p>
          <div className="mt-4 space-y-2">
            {checklist.map((c) => (
              <div key={c.key} className="flex items-center gap-3 rounded-xl border border-clinic-border p-3 transition-colors hover:border-azure-200">
                <button onClick={() => can(session.role, "practice.config") && setOnboarding(c.key, !c.done)} aria-label={c.done ? "Marcar pendiente" : "Marcar hecho"}>
                  {c.done ? <CheckCircle2 className="h-5 w-5 text-state-ok" /> : <Circle className="h-5 w-5 text-clinic-border" />}
                </button>
                <a href={c.href} className={`flex-1 text-sm font-semibold ${c.done ? "text-clinic-muted line-through" : "text-clinic-text hover:text-azure-700"}`}>
                  {c.label}
                </a>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-azure-50 p-3 text-xs leading-relaxed text-azure-700">
            <Badge tone="info">RBAC</Badge>
            <span>
              {session.role === "dentist" && <>Como dentista escribís el historial clínico, pero no enviás a cobro ni gestionás formularios.</>}
              {session.role === "assistant" && <>Como asistente gestionás agenda, formularios y facturación; el historial es solo lectura.</>}
              {session.role === "admin" && <>Acceso completo, incluida la configuración de la práctica.</>}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
