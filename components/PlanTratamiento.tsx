"use client";
/** Vista "Plan de tratamiento" estilo Dentalink: LISTA de planes (En ejecución / Otros)
 *  → DETALLE de 2 columnas (panel financiero + seguimiento) + prestaciones + comentarios. */
import { ReactNode, useState } from "react";
import { Copy, UserRound, Braces, Smile, ChevronLeft, ChevronRight, FileSpreadsheet, Save, Pencil, Plus, Calendar, Clock, Printer, Camera, AlertTriangle, Trash2, Upload } from "lucide-react";
import { useStore, fmtGs, fmtDate, fmtTime } from "@/lib/store";
import { resizeToDataUrl } from "@/lib/image";
import { SmileSimulator } from "@/components/SmileSimulator";
import { can } from "@/lib/rbac";
import { budgetTotal, budgetRealizado, budgetPaid, budgetBalance, financialStatus, PAYMENT_METHOD_LABEL } from "@/lib/budgets";
import { orthoProgress } from "@/lib/ortho";
import type { Patient, Budget, Payment, Appointment } from "@/lib/types";
import { DEFAULT_ODONTOGRAM_STATUS } from "@/lib/types";
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
      <span className="absolute inset-0 grid place-items-center text-[11px] font-extrabold text-clinic-text">{pct}%</span>
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
      <div className="text-[11px] font-bold uppercase tracking-wide text-clinic-muted">{label}</div>
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
        <PlanFinanciero budget={budget} payments={db.payments} citas={citas} professional={professional ? professional.name + (professional.specialty ? ` · ${professional.specialty}` : "") : undefined} hasIA={hasIA} patient={patient} />
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
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-azure-200">Plan de tratamiento</span>
          <button onClick={copyId} className="inline-flex items-center gap-1 text-[11px] text-white/70 transition-colors hover:text-white" title="Copiar ID del plan">
            <Copy className="h-3 w-3" /> {copied ? "Copiado" : `#${budget.id}`}
          </button>
        </div>
        <PlanNameEdit budget={budget} />
        {hasIA && (
          <div className="mt-3">
            <PatientBriefButton patient={patient} context={{ budgets: [{ estado: budget.status, items: budget.items.length, total }] }} />
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="text-center">
          <div className="text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Presupuesto total</div>
          <div className="mt-1 font-mono text-3xl font-extrabold text-azure-600">{fmtGs(total)}</div>
        </div>
        <DescuentoRow budget={budget} />
        <div className="my-3 border-t border-clinic-border" />
        <DottedRow label="Realizado" value={fmtGs(realizado)} />
        <DottedRow label="Abonado" value={fmtGs(abonado)} />
        <DottedRow label="Saldo por abonar" value={fmtGs(Math.max(0, saldo))} strong tone={saldo > 0 ? "err" : "ok"} />

        <div className="mt-3 rounded-xl border border-clinic-border p-3">
          {pagos.length === 0 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-clinic-muted">No hay abonos</span>
              <span className="font-mono font-bold text-clinic-text">{fmtGs(0)}</span>
            </div>
          ) : (
            <>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Abonos</div>
              <ul className="space-y-1">
                {pagos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-xs">
                    <span className="text-clinic-muted">{fmtDate(p.date)} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method}</span>
                    <span className="font-mono font-bold text-clinic-text">{fmtGs(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="mt-3 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
            <Clock className="h-3.5 w-3.5" /> Vencimiento: {vencimientoDias(budget)} días
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-clinic-border pt-3 text-sm">
          <UserRound className="h-4 w-4 text-azure-600" />
          <span className="text-clinic-muted">Profesional a cargo:</span>
          <span className="font-bold text-clinic-text">{professional ?? "—"}</span>
        </div>

        {citas.length > 0 && (
          <div className="mt-3 border-t border-clinic-border pt-3">
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

function vencimientoDias(b: Budget): number {
  if (b.dueDate) return Math.max(0, Math.ceil((Date.parse(b.dueDate) - Date.now()) / 86_400_000));
  return 60;
}

/** Fila con guiones (líder punteado) estilo Dentalink: etiqueta · · · valor. */
function DottedRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "err" | "ok" }) {
  const color = tone === "err" ? "text-state-err" : tone === "ok" ? "text-state-ok" : "text-clinic-text";
  return (
    <div className="flex items-baseline gap-2 py-1 text-sm">
      <span className="text-clinic-muted">{label}</span>
      <span className="mb-1 flex-1 self-end border-b border-dotted border-clinic-border" />
      <span className={`font-mono ${strong ? "text-base font-extrabold" : "font-bold"} ${color}`}>{value}</span>
    </div>
  );
}

/** Nombre del plan editable (cabecera navy) — Dentalink: "Prueba 2 ✏️". */
function PlanNameEdit({ budget }: { budget: Budget }) {
  const { session, upsertBudget } = useStore();
  const canWrite = session ? can(session.role, "emr.write") : false;
  const label = budget.name ?? (budget.planType === "ortodoncia" ? "Ortodoncia" : "Plan general");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label);
  if (editing) {
    const save = () => { upsertBudget({ ...budget, name: name.trim() || undefined }); setEditing(false); };
    return (
      <div className="mt-1 flex items-center gap-2">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} className="min-w-0 flex-1 rounded-lg bg-white/15 px-2 py-1 font-logo text-xl text-white placeholder:text-white/50" />
        <button onClick={save} className="shrink-0 text-white/90 hover:text-white" title="Guardar"><Save className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <h2 className="mt-1 flex items-center gap-2 font-logo text-xl leading-tight">
      <span className="min-w-0 truncate">{label}</span>
      {canWrite && <button onClick={() => { setName(label); setEditing(true); }} className="shrink-0 text-white/60 hover:text-white" title="Renombrar plan"><Pencil className="h-3.5 w-3.5" /></button>}
    </h2>
  );
}

/** Descuento comercial editable inline (✏️) — Dentalink. */
function DescuentoRow({ budget }: { budget: Budget }) {
  const { session, upsertBudget } = useStore();
  const canWrite = session ? can(session.role, "emr.write") : false;
  const [editing, setEditing] = useState(false);
  const [pct, setPct] = useState(String(budget.discountPct ?? 0));
  const save = () => { upsertBudget({ ...budget, discountPct: Math.min(100, Math.max(0, Number(pct) || 0)) }); setEditing(false); };
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-clinic-muted">Descuento comercial</span>
      {editing ? (
        <span className="flex items-center gap-1">
          <input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} className="w-16 rounded-lg border border-clinic-border px-2 py-0.5 text-right font-bold text-clinic-text focus:border-azure-400" autoFocus />
          <button onClick={save} className="text-azure-700 hover:underline" title="Guardar"><Save className="h-3.5 w-3.5" /></button>
        </span>
      ) : (
        <span className="flex items-center gap-1.5 font-bold text-clinic-text">
          {budget.discountPct ?? 0}%{budget.convenio ? ` · ${budget.convenio}` : ""}
          {canWrite && <button onClick={() => { setPct(String(budget.discountPct ?? 0)); setEditing(true); }} className="text-clinic-muted hover:text-azure-700" title="Editar descuento"><Pencil className="h-3 w-3" /></button>}
        </span>
      )}
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
  const { session, setOdontogram } = useStore();
  const canWriteEmr = session ? can(session.role, "emr.write") : false;
  const [tab, setTab] = useState<"esp" | "plan" | "odo" | "facial">(isOrtho ? "esp" : "plan");

  return (
    <div className="space-y-4">
      <RipsBanner budget={budget} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-clinic-border bg-white p-1">
          {isOrtho ? (
            <TabBtn active={tab === "esp"} onClick={() => setTab("esp")} icon={Braces} label="Ortodoncia" />
          ) : (
            <TabBtn active={tab === "plan"} onClick={() => setTab("plan")} icon={FileSpreadsheet} label="Plan de tratamiento" />
          )}
          <TabBtn active={tab === "odo"} onClick={() => setTab("odo")} icon={Smile} label="Odontograma" />
          <TabBtn active={tab === "facial"} onClick={() => setTab("facial")} icon={Camera} label="Estética facial" />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => window.print()} title="Imprimir" className="rounded-lg border border-clinic-border p-2 text-clinic-muted transition-colors hover:border-azure-300 hover:text-azure-700">
            <Printer className="h-4 w-4" />
          </button>
        </div>
      </div>
      {tab === "esp" && isOrtho && <OrtodonciaPanel patient={patient} budget={budget} />}
      {tab === "plan" && !isOrtho && <PrestacionesList budget={budget} />}
      {tab === "odo" && (
        <Odontogram
          value={patient.odontogram ?? DEFAULT_ODONTOGRAM_STATUS}
          editable={canWriteEmr}
          authorName={session?.name ?? ""}
          onChange={(status) => setOdontogram(patient.id, status, session?.name ?? "")}
        />
      )}
      {tab === "facial" && <EsteticaFacial budget={budget} patient={patient} />}
    </div>
  );
}

/* ---------- Banner RIPS / Riesgos EPS (legislación CO) ---------- */
function RipsBanner({ budget }: { budget: Budget }) {
  const { session, upsertBudget } = useStore();
  const canWrite = session ? can(session.role, "emr.write") : false;
  const [open, setOpen] = useState<null | "rips" | "eps">(null);
  const completo = budget.rips?.completo ?? false;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-extrabold text-clinic-text">Actualizar los detalles RIPS</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setOpen(open === "rips" ? null : "rips")} className="inline-flex items-center gap-1.5 rounded-xl border border-clinic-border px-3 py-1.5 text-xs font-bold text-clinic-text transition-colors hover:border-azure-300 hover:text-azure-700">
            Detalles RIPS {!completo && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          </button>
          <button onClick={() => setOpen(open === "eps" ? null : "eps")} className="inline-flex items-center gap-1.5 rounded-xl border border-clinic-border px-3 py-1.5 text-xs font-bold text-clinic-text transition-colors hover:border-azure-300 hover:text-azure-700">
            Riesgos EPS
          </button>
        </div>
      </div>
      {!completo && open === null && (
        <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este plan de tratamiento no tiene configurados todos los datos pertinentes a la legislación actual, por favor complételos utilizando los botones superiores.
        </div>
      )}
      {open && (
        <RipsForm
          budget={budget}
          mode={open}
          canWrite={canWrite}
          onSave={(rips) => { upsertBudget({ ...budget, rips }); setOpen(null); }}
          onClose={() => setOpen(null)}
        />
      )}
    </Card>
  );
}

function RipsForm({ budget, mode, canWrite, onSave, onClose }: {
  budget: Budget; mode: "rips" | "eps"; canWrite: boolean;
  onSave: (r: NonNullable<Budget["rips"]>) => void; onClose: () => void;
}) {
  const r = budget.rips ?? {};
  const [tipoDoc, setTipoDoc] = useState(r.tipoDoc ?? "CC");
  const [nroDoc, setNroDoc] = useState(r.nroDoc ?? "");
  const [eps, setEps] = useState(r.eps ?? "");
  const [regimen, setRegimen] = useState<"contributivo" | "subsidiado" | "particular">(r.regimen ?? "contributivo");
  const [riesgos, setRiesgos] = useState(r.riesgos ?? "");
  const guardar = () => onSave({ tipoDoc, nroDoc, eps, regimen, riesgos, completo: Boolean(nroDoc && eps) });
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-clinic-border bg-clinic-bg/40 p-4">
      {mode === "rips" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-clinic-muted">Tipo de documento
            <select disabled={!canWrite} value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} className={`${inputCls} mt-1`}>
              <option value="CC">CC — Cédula de ciudadanía</option>
              <option value="TI">TI — Tarjeta de identidad</option>
              <option value="CE">CE — Cédula de extranjería</option>
              <option value="PA">PA — Pasaporte</option>
              <option value="RC">RC — Registro civil</option>
            </select>
          </label>
          <label className="text-xs font-bold text-clinic-muted">N.º de documento
            <input disabled={!canWrite} value={nroDoc} onChange={(e) => setNroDoc(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <label className="text-xs font-bold text-clinic-muted">EPS
            <input disabled={!canWrite} value={eps} onChange={(e) => setEps(e.target.value)} className={`${inputCls} mt-1`} placeholder="Entidad promotora de salud" />
          </label>
          <label className="text-xs font-bold text-clinic-muted">Régimen
            <select disabled={!canWrite} value={regimen} onChange={(e) => setRegimen(e.target.value as "contributivo" | "subsidiado" | "particular")} className={`${inputCls} mt-1`}>
              <option value="contributivo">Contributivo</option>
              <option value="subsidiado">Subsidiado</option>
              <option value="particular">Particular</option>
            </select>
          </label>
        </div>
      ) : (
        <label className="block text-xs font-bold text-clinic-muted">Riesgos / observaciones EPS
          <textarea disabled={!canWrite} rows={3} value={riesgos} onChange={(e) => setRiesgos(e.target.value)} className={`${inputCls} mt-1`} placeholder="Riesgos clínicos reportados a la EPS…" />
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl border border-clinic-border px-3 py-1.5 text-xs font-bold text-clinic-muted hover:text-clinic-text">Cerrar</button>
        {canWrite && <Btn onClick={guardar}><Save className="h-4 w-4" /> Guardar</Btn>}
      </div>
    </div>
  );
}

/* ---------- Estética facial ---------- */
function EsteticaFacial({ budget }: { budget: Budget; patient: Patient }) {
  const { session, upsertBudget } = useStore();
  const canWrite = session ? can(session.role, "emr.write") : false;
  const [note, setNote] = useState(budget.facialNote ?? "");
  const [m, setM] = useState<NonNullable<Budget["facialMeasures"]>>(budget.facialMeasures ?? {});
  const [busy, setBusy] = useState(false);
  const photos = budget.facialPhotos ?? [];
  const hasIA = useClinicPlan().features.includes("ia");
  const dirty = note.trim() !== (budget.facialNote ?? "").trim() || JSON.stringify(m) !== JSON.stringify(budget.facialMeasures ?? {});

  const addPhotos = async (files: FileList | null) => {
    if (!files || !canWrite) return;
    setBusy(true);
    const picked = Array.from(files).slice(0, Math.max(0, 8 - photos.length));
    const added: NonNullable<Budget["facialPhotos"]> = [];
    for (const file of picked) {
      try { const dataUrl = await resizeToDataUrl(file, { maxDim: 700 }); added.push({ id: `fp_${Date.now()}_${added.length}`, label: "", dataUrl, at: new Date().toISOString() }); } catch { /* omitir */ }
    }
    if (added.length) upsertBudget({ ...budget, facialPhotos: [...photos, ...added] });
    setBusy(false);
  };
  const setLabel = (id: string, label: string) => upsertBudget({ ...budget, facialPhotos: photos.map((p) => (p.id === id ? { ...p, label } : p)) });
  const delPhoto = (id: string) => upsertBudget({ ...budget, facialPhotos: photos.filter((p) => p.id !== id) });
  const guardar = () => upsertBudget({ ...budget, facialNote: note.trim() || undefined, facialMeasures: Object.values(m).some(Boolean) ? m : undefined });

  const MF = (label: string, k: keyof NonNullable<Budget["facialMeasures"]>, ph: string) => (
    <label className="text-[11px] font-bold text-clinic-muted">{label}
      <input disabled={!canWrite} value={m[k] ?? ""} onChange={(e) => setM({ ...m, [k]: e.target.value })} className={`${inputCls} mt-1`} placeholder={ph} />
    </label>
  );

  return (
    <div className="space-y-4 rounded-2xl border border-clinic-border bg-white p-5">
      <h3 className="font-extrabold text-clinic-text">Estética facial</h3>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Registro fotográfico (pre / post)</span>
          {canWrite && photos.length < 8 && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-clinic-border px-2.5 py-1 text-xs font-bold text-clinic-text hover:border-azure-300 hover:text-azure-700">
              <Upload className="h-3.5 w-3.5" /> {busy ? "Subiendo…" : "Agregar fotos"}
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.currentTarget.value = ""; }} />
            </label>
          )}
        </div>
        {photos.length === 0 ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-clinic-border py-8 text-center text-clinic-muted">
            <Camera className="h-8 w-8" /><p className="mt-1 text-xs">Sin fotos. Subí registros frontal/perfil pre y post.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map((p) => (
              <div key={p.id} className="group overflow-hidden rounded-xl border border-clinic-border">
                <div className="relative aspect-[3/4] bg-clinic-bg">
                  <img src={p.dataUrl} alt={p.label || "Foto facial"} className="h-full w-full object-cover" />
                  {canWrite && <button onClick={() => delPhoto(p.id)} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100" title="Eliminar"><Trash2 className="h-3 w-3" /></button>}
                </div>
                <input disabled={!canWrite} value={p.label} onChange={(e) => setLabel(p.id, e.target.value)} placeholder="Etiqueta (ej. Pre frontal)" className="w-full border-t border-clinic-border px-2 py-1 text-[11px] text-clinic-text" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Análisis facial</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {MF("Proporción de tercios", "tercios", "Sup/medio/inf equilibrados…")}
          {MF("Línea media", "lineaMedia", "Centrada / desviada …")}
          {MF("Perfil", "perfil", "Recto / convexo / cóncavo")}
          {MF("Sonrisa / exposición gingival", "sonrisa", "Línea de sonrisa, encía…")}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Observaciones</div>
        <textarea disabled={!canWrite} rows={4} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Objetivos estéticos, indicaciones…" />
      </div>

      {hasIA && canWrite && (
        <SmileSimulator onSave={(dataUrl, label) => upsertBudget({ ...budget, facialPhotos: [...(budget.facialPhotos ?? []), { id: `fp_${Date.now()}`, label, dataUrl, at: new Date().toISOString() }] })} />
      )}

      {canWrite && dirty && <div><Btn onClick={guardar}><Save className="h-4 w-4" /> Guardar análisis</Btn></div>}
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
