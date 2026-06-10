"use client";
/** Dashboard: hoy + checklist de onboarding (sec. 5.2). */
import { useMemo } from "react";
import { CheckCircle2, Circle, CalendarDays, Users, Receipt, ArrowRight, RotateCcw } from "lucide-react";
import { useStore, fmtTime, fmtGs, fullName } from "@/lib/store";
import { can } from "@/lib/rbac";
import { Card, Badge, StatusBadge, Btn } from "@/components/ui";
import { StatCard } from "@/components/StatCard";
import { FileText, PauseCircle } from "lucide-react";

export default function Dashboard() {
  const { db, session, setOnboarding, resetDemo } = useStore();
  if (!session) return null;

  const today = new Date();
  const isToday = (iso: string) => {
    const d = new Date(iso);
    return d.toDateString() === today.toDateString();
  };
  const todays = db.appointments
    .filter((a) => isToday(a.start) && a.status !== "cancelada")
    .sort((a, b) => a.start.localeCompare(b.start));

  const pendingForms = db.patients.filter((p) => p.forms.some((f) => f.status === "pendiente")).length;
  const onHold = db.billing.filter((b) => b.flags.includes("HOLD") || b.flags.includes("MGRHOLD")).length;

  /* tendencia real: citas por día de la semana actual */
  const mon = new Date(today);
  mon.setHours(0, 0, 0, 0);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const weekTrend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return db.appointments.filter((a) => new Date(a.start).toDateString() === d.toDateString()).length;
  });

  const checklist = useMemo(
    () => [
      { key: "usersCreated" as const, label: "Crear usuarios del equipo", done: db.onboarding.usersCreated, href: "/app/configuracion" },
      { key: "servicesDefined" as const, label: "Definir servicios y aranceles", done: db.onboarding.servicesDefined, href: "/app/configuracion" },
      { key: "tourDone" as const, label: "Recorrer la Agenda y el Buscador de Pacientes", done: db.onboarding.tourDone, href: "/app/agenda" },
    ],
    [db.onboarding]
  );
  const pendingChecklist = checklist.filter((c) => !c.done);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-clinic-text">Hola, {session.name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-clinic-muted">
            {today.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <Btn variant="outline" onClick={resetDemo} tip="Restaura los datos de demostración">
          <RotateCcw className="h-3.5 w-3.5" /> Reiniciar demo
        </Btn>
      </div>

      {/* KPIs (StatCard de 21st.dev: count-up + sparkline) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          href="/app/agenda"
          label="Citas de hoy"
          value={todays.length}
          icon={<CalendarDays className="h-5 w-5" strokeWidth={2} />}
          tone="azure"
          trend={weekTrend}
        />
        <StatCard
          href="/app/pacientes"
          label="Formularios pendientes"
          value={pendingForms}
          icon={<FileText className="h-5 w-5" strokeWidth={2} />}
          tone={pendingForms > 0 ? "amber" : "green"}
        />
        <StatCard
          href="/app/facturacion"
          label="Reclamos en retención"
          value={onHold}
          icon={<PauseCircle className="h-5 w-5" strokeWidth={2} />}
          tone={onHold > 0 ? "amber" : "green"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Agenda de hoy */}
        <Card className="p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-extrabold text-clinic-text">Agenda de hoy</h2>
            <a href="/app/agenda" className="inline-flex items-center gap-1 text-xs font-bold text-azure-600 hover:text-azure-700">
              Ver agenda completa <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
          {todays.length === 0 ? (
            <p className="py-8 text-center text-sm text-clinic-muted">Sin citas para hoy.</p>
          ) : (
            <div className="divide-y divide-clinic-border">
              {todays.map((a) => {
                const p = db.patients.find((x) => x.id === a.patientId);
                return (
                  <a key={a.id} href={`/app/pacientes/${a.patientId}`} className="flex items-center gap-4 py-3 hover:bg-clinic-bg -mx-2 px-2 rounded-lg">
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

        {/* Onboarding checklist */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-extrabold text-clinic-text">Puesta en marcha</h2>
          <p className="mt-0.5 text-xs text-clinic-muted">
            {pendingChecklist.length === 0 ? "¡Todo listo! La clínica está configurada." : `${pendingChecklist.length} paso(s) pendiente(s)`}
          </p>
          <div className="mt-4 space-y-2">
            {checklist.map((c) => (
              <div key={c.key} className="flex items-center gap-3 rounded-xl border border-clinic-border p-3">
                <button
                  onClick={() => can(session.role, "practice.config") && setOnboarding(c.key, !c.done)}
                  aria-label={c.done ? "Marcar pendiente" : "Marcar hecho"}
                >
                  {c.done ? <CheckCircle2 className="h-5 w-5 text-state-ok" /> : <Circle className="h-5 w-5 text-clinic-border" />}
                </button>
                <a href={c.href} className={`flex-1 text-sm font-semibold ${c.done ? "text-clinic-muted line-through" : "text-clinic-text hover:text-azure-700"}`}>
                  {c.label}
                </a>
              </div>
            ))}
          </div>
          {!db.onboarding.tourDone && (
            <div className="mt-4 rounded-xl bg-azure-50 p-3 text-xs leading-relaxed text-azure-700">
              💡 <b>Tour rápido:</b> en <b>Agenda</b> hacé clic en una franja vacía para crear una cita.
              En <b>Pacientes</b>, los íconos 📄 y 📋 indican formularios e historial pendientes — el lápiz ✏️ los completa.
            </div>
          )}
        </Card>
      </div>

      {/* Aviso de rol */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-clinic-muted">
          <Badge tone="info">RBAC</Badge>
          Estás como <b className="text-clinic-text">{session.role === "admin" ? "Administrador" : session.role === "dentist" ? "Dentista" : "Asistente"}</b>:
          {session.role === "dentist" && <> podés escribir en el historial clínico, pero <b>no</b> enviar a cobro ni gestionar formularios.</>}
          {session.role === "assistant" && <> podés gestionar agenda, formularios y facturación, pero el historial clínico es <b>solo lectura</b>.</>}
          {session.role === "admin" && <> tenés acceso completo, incluida la configuración de la práctica.</>}
        </div>
      </Card>
    </div>
  );
}
