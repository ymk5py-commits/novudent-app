"use client";
/** Vista "Plan de tratamiento" estilo Dentalink: LISTA de planes (En ejecución / Otros)
 *  → DETALLE de 2 columnas (panel financiero + seguimiento) + prestaciones + comentarios. */
import { ReactNode, useState } from "react";
import { Copy, UserRound, Braces, Smile, ChevronLeft, ChevronRight, FileSpreadsheet, Save, Pencil, Plus, Calendar, Clock } from "lucide-react";
import { useStore, fmtGs, fmtDate, fmtTime } from "@/lib/store";
import { can } from "@/lib/rbac";
import { budgetTotal, budgetRealizado, budgetPaid, budgetBalance, financialStatus, PAYMENT_METHOD_LABEL } from "@/lib/budgets";
import { orthoProgress } from "@/lib/ortho";
import type { Patient, Budget, Payment, Appointment } from "@/lib/types";
import { Card, Badge, Empty, Btn, StatusBadge, inputCls } from "@/components/ui";
import { useClinicPlan } from "@/components/PlanGate";
import { PatientBriefButton } from "@/components/NovudentIA";
import Odontogram from "@/components/Odontogram";
import { OrtodonciaPanel } from "@/components/Ortodoncia";
import { PrestacionesList } from "@/components/Prestaciones";

function planProgress(budget: Budget, patient: Patient): number {
  if (budget.planType === "ortodoncia" && patient.ortho?.active) return orthoProgress(patient.ortho).calendarPct;
  const total = budget.items.length;
  if (!total) return 0;
  return Math.round((budget.items.filter((i) => i.status === "realizado").length / total) * 100);
}

export function PlanTratamiento({ patient }: { patient: Patient }) {
  const { db } = useStore();
  const budgets = db.budgets.filter((b) => b.patientId === patient.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [selId, setSelId] = useState<string | null>(null);

  if (!budgets.length) {
    return <Empty title="Sin planes de tratamiento" desc="Creá un presupuesto en la sección Presupuestos para iniciar un plan." />;
  }
  if (selId && budgets.some((b) => b.id === selId)) {
    return <PlanDetalle patient={patient} budgets={budgets} selId={selId} onSelect={setSelId} onBack={() => setSelId(null)} />;
  }
  return <PlanLista patient={patient} budgets={budgets} onOpen={setSelId} />;
}

/* ---------- LISTA de planes (En ejecución / Otros) ---------- */
function MiniRing({ pct }: { pct: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" stroke="currentColor" className="text-clinic-border" />
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" strokeLinecap="round" stroke="currentColor" strokeDasharray={c} strokeDashoffset={off} className="text-azure-500" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[10px] font-extrabold text-clinic-text">{pct}%</span>
    </div>
  );
}

function PlanLista({ patient, budgets, onOpen }: { patient: Patient; budgets: Budget[]; onOpen: (id: string) => void }) {
  const { db } = useStore();
  const [filtro, setFiltro] = useState<"activos" | "todos">("activos");
  const visibles = filtro === "activos" ? budgets.filter((b) => b.status !== "anulado" && b.status !== "completado") : budgets;
  const enEjecucion = visibles.filter((b) => b.status === "aceptado");
  const otros = visibles.filter((b) => b.status !== "aceptado");

  const Row = (b: Budget) => {
    const fin = financialStatus(b, db.payments);
    const prof = db.users.find((u) => u.id === b.dentistId)?.name ?? "—";
    const esp = b.planType === "ortodoncia" ? "Ortodoncia" : "General";
    const citas = db.appointments.filter((a) => a.budgetId === b.id).sort((x, y) => y.start.localeCompare(x.start));
    const ultimaCita = citas[0];
    const pays = db.payments.filter((p) => p.budgetId === b.id && !p.voidedAt).map((p) => p.date);
    const lastActivity = [b.createdAt, ultimaCita?.start, ...pays].filter(Boolean).sort().slice(-1)[0] as string | undefined;
    const finCls = fin.tone === "ok" ? "text-state-ok" : fin.tone === "err" ? "text-state-err" : "text-state-warn";
    const finIcon = fin.tone === "ok" ? "✓" : fin.tone === "err" ? "⚠" : "$";
    return (
      <button key={b.id} onClick={() => onOpen(b.id)} className="block w-full px-5 py-4 text-left transition-colors hover:bg-clinic-bg/40">
        <div className="mb-3 flex items-center gap-1.5">
          <span className="text-sm font-bold text-azure-700 hover:underline">#{b.id}: {b.name ?? esp}</span>
          <Pencil className="h-3.5 w-3.5 text-clinic-muted" />
        </div>
        <div className="grid grid-cols-2 items-start gap-y-3 sm:grid-cols-5 sm:items-center">
          <Col label="Profesional"><span className="flex items-center gap-1 text-clinic-text"><UserRound className="h-3.5 w-3.5 shrink-0 text-clinic-muted" /> {prof}</span></Col>
          <Col label="Especialidad"><span className="text-clinic-text">{esp}</span></Col>
          <Col label="Última cita">
            {ultimaCita ? (
              <div className="text-clinic-text">
                <div className="flex items-center gap-1"><Calendar className="h-3 w-3 text-clinic-muted" /> {ultimaCita.start.slice(0, 10)}</div>
                <div className="flex items-center gap-1 text-clinic-muted"><Clock className="h-3 w-3" /> {fmtTime(ultimaCita.start)}</div>
              </div>
            ) : <span className="text-clinic-muted">—</span>}
          </Col>
          <Col label="Progreso"><MiniRing pct={planProgress(b, patient)} /></Col>
          <Col label="Estado financiero"><span className={`text-sm font-bold ${finCls}`}>{finIcon} {fin.label}</span></Col>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-clinic-muted">
          {lastActivity && <span>⏱ Última actividad: {fmtDate(lastActivity)}</span>}
          <span>📅 Fecha de creación: {fmtDate(b.createdAt)}</span>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-clinic-text">Planes de tratamiento</h2>
        <div className="flex items-center gap-2">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as "activos" | "todos")} className={`${inputCls} !w-auto`}>
            <option value="activos">Tratamientos activos</option>
            <option value="todos">Todos los tratamientos</option>
          </select>
          <a href="/app/presupuestos"><Btn><Plus className="h-4 w-4" /> Nuevo plan de tratamiento</Btn></a>
        </div>
      </div>
      {enEjecucion.length > 0 && (
        <div>
          <h3 className="mb-2 border-b border-clinic-border pb-1 text-sm font-extrabold text-azure-700">En ejecución</h3>
          <Card className="divide-y divide-clinic-border p-0">{enEjecucion.map(Row)}</Card>
        </div>
      )}
      {otros.length > 0 && (
        <div>
          <h3 className="mb-2 border-b border-clinic-border pb-1 text-sm font-extrabold text-clinic-muted">Otros</h3>
          <Card className="divide-y divide-clinic-border p-0">{otros.map(Row)}</Card>
        </div>
      )}
      {enEjecucion.length === 0 && otros.length === 0 && <Empty title="Sin planes con ese filtro" desc="Cambiá a “Todos los tratamientos”." />}
    </div>
  );
}

function Col({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wide text-clinic-muted">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

/* ---------- DETALLE (2 columnas) ---------- */
function PlanDetalle({
  patient, budgets, selId, onSelect, onBack,
}: { patient: Patient; budgets: Budget[]; selId: string; onSelect: (id: string) => void; onBack: () => void }) {
  const { db } = useStore();
  const hasIA = useClinicPlan().features.includes("ia");
  const budget = budgets.find((b) => b.id === selId) ?? budgets[0];
  const isOrtho = budget.planType === "ortodoncia";
  const professional = db.users.find((u) => u.id === budget.dentistId);
  const citas = db.appointments.filter((a) => a.budgetId === budget.id).sort((a, b) => b.start.localeCompare(a.start));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-bold text-azure-700 hover:underline">
          <ChevronLeft className="h-4 w-4" /> Planes
        </button>
        {budgets.length > 1 && budgets.map((b) => (
          <button
            key={b.id}
            onClick={() => onSelect(b.id)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${b.id === budget.id ? "border-azure-500 bg-azure-50 text-azure-700" : "border-clinic-border bg-white text-clinic-muted hover:border-azure-300"}`}
          >
            #{b.id}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[330px_1fr]">
        <PlanFinanciero budget={budget} payments={db.payments} citas={citas} professional={professional?.name} hasIA={hasIA} patient={patient} />
        <PlanClinico key={budget.id} budget={budget} patient={patient} isOrtho={isOrtho} />
      </div>

      <ComentariosPaciente key={budget.id} budget={budget} />
    </div>
  );
}

/* ---------- Columna financiera (izquierda, panel navy) ---------- */
function PlanFinanciero({
  budget, payments, citas, professional, hasIA, patient,
}: { budget: Budget; payments: Payment[]; citas: Appointment[]; professional?: string; hasIA: boolean; patient: Patient }) {
  const [copied, setCopied] = useState(false);
  const total = budgetTotal(budget);
  const realizado = budgetRealizado(budget);
  const abonado = budgetPaid(budget.id, payments);
  const saldo = budgetBalance(budget, payments);
  const pagos = payments.filter((p) => p.budgetId === budget.id && !p.voidedAt).sort((a, b) => b.date.localeCompare(a.date));
  const copyId = () => {
    try { navigator.clipboard?.writeText(`Plan #${budget.id}`); } catch { /* sin portapapeles */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="h-fit overflow-hidden p-0">
      <div className="mesh-hero px-5 py-4 text-white">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-azure-200">Plan de tratamiento</span>
          <button onClick={copyId} className="inline-flex items-center gap-1 text-[11px] text-white/70 transition-colors hover:text-white" title="Copiar ID del plan">
            <Copy className="h-3 w-3" /> {copied ? "Copiado" : `#${budget.id}`}
          </button>
        </div>
        <h2 className="font-logo text-xl leading-tight">{budget.planType === "ortodoncia" ? "Ortodoncia" : "Plan general"}</h2>
        {hasIA && (
          <div className="mt-3">
            <PatientBriefButton patient={patient} context={{ budgets: [{ estado: budget.status, items: budget.items.length, total }] }} />
          </div>
        )}
      </div>

      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-clinic-muted">Descuento comercial</span>
          <span className="font-bold text-clinic-text">{budget.discountPct ?? 0}%{budget.convenio ? ` · ${budget.convenio}` : ""}</span>
        </div>
        <Money label="Presupuesto total" value={total} strong />
        <Money label="Realizado" value={realizado} />
        <Money label="Abonado" value={abonado} />
        <div className="flex items-center justify-between border-t border-clinic-border pt-3">
          <span className="text-sm font-bold text-clinic-text">Saldo por abonar</span>
          <span className={`font-mono text-lg font-extrabold ${saldo > 0 ? "text-state-err" : "text-state-ok"}`}>{fmtGs(Math.max(0, saldo))}</span>
        </div>

        <div className="rounded-xl bg-clinic-bg p-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Abonos</div>
          {pagos.length === 0 ? (
            <p className="text-xs text-clinic-muted">No hay abonos</p>
          ) : (
            <ul className="space-y-1">
              {pagos.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-xs">
                  <span className="text-clinic-muted">{fmtDate(p.date)} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method}</span>
                  <span className="font-mono font-bold text-clinic-text">{fmtGs(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-clinic-border pt-3 text-sm">
          <UserRound className="h-4 w-4 text-azure-600" />
          <span className="text-clinic-muted">Profesional a cargo:</span>
          <span className="font-bold text-clinic-text">{professional ?? "—"}</span>
        </div>

        {citas.length > 0 && (
          <div className="border-t border-clinic-border pt-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Citas del paciente</div>
            <ul className="space-y-1">
              {citas.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-clinic-muted">{fmtDate(a.start)} · {a.title}</span>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function Money({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-clinic-muted">{label}</span>
      <span className={`font-mono ${strong ? "text-base font-extrabold text-clinic-text" : "font-bold text-clinic-text"}`}>{fmtGs(value)}</span>
    </div>
  );
}

/* ---------- Comentarios para el paciente ---------- */
function ComentariosPaciente({ budget }: { budget: Budget }) {
  const { session, upsertBudget } = useStore();
  const canWrite = session ? can(session.role, "emr.write") : false;
  const [text, setText] = useState(budget.patientComments ?? "");
  const dirty = text.trim() !== (budget.patientComments ?? "").trim();
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-extrabold text-clinic-text">Comentarios para el paciente</h3>
        {canWrite && dirty && <Btn onClick={() => upsertBudget({ ...budget, patientComments: text.trim() || undefined })}><Save className="h-4 w-4" /> Guardar</Btn>}
      </div>
      <p className="mb-2 text-[11px] text-clinic-muted">Se incluyen en la impresión del presupuesto.</p>
      <textarea rows={3} className={inputCls} value={text} disabled={!canWrite} onChange={(e) => setText(e.target.value)} placeholder="Indicaciones, forma de pago, observaciones para el paciente…" />
    </Card>
  );
}

/* ---------- Columna clínica (derecha) ---------- */
function PlanClinico({ budget, patient, isOrtho }: { budget: Budget; patient: Patient; isOrtho: boolean }) {
  const { session, setTooth } = useStore();
  const canWriteEmr = session ? can(session.role, "emr.write") : false;
  const [tab, setTab] = useState<"esp" | "plan" | "odo">(isOrtho ? "esp" : "plan");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl border border-clinic-border bg-white p-1">
        {isOrtho ? (
          <TabBtn active={tab === "esp"} onClick={() => setTab("esp")} icon={Braces} label="Ortodoncia" />
        ) : (
          <TabBtn active={tab === "plan"} onClick={() => setTab("plan")} icon={FileSpreadsheet} label="Plan de tratamiento" />
        )}
        <TabBtn active={tab === "odo"} onClick={() => setTab("odo")} icon={Smile} label="Odontograma" />
      </div>
      {tab === "esp" && isOrtho && <OrtodonciaPanel patient={patient} budget={budget} />}
      {tab === "plan" && !isOrtho && <PrestacionesList budget={budget} />}
      {tab === "odo" && (
        <Odontogram
          value={patient.odontogram ?? {}}
          editable={canWriteEmr}
          authorName={session?.name ?? ""}
          onChange={(tooth, rec) => setTooth(patient.id, tooth, rec)}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
        active ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
