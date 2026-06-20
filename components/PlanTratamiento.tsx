"use client";
/** Vista "Plan de tratamiento" estilo Dentalink: panel financiero (izq) + seguimiento
 *  clínico de la especialidad (der). El plan ES el presupuesto (Budget). */
import { useState } from "react";
import { Copy, UserRound, Braces, Smile } from "lucide-react";
import { useStore, fmtGs, fmtDate } from "@/lib/store";
import { can } from "@/lib/rbac";
import { budgetTotal, budgetRealizado, budgetPaid, budgetBalance, PAYMENT_METHOD_LABEL } from "@/lib/budgets";
import type { Patient, Budget, Payment } from "@/lib/types";
import { Card, Empty } from "@/components/ui";
import { useClinicPlan } from "@/components/PlanGate";
import { PatientBriefButton } from "@/components/NovudentIA";
import Odontogram from "@/components/Odontogram";
import { OrtodonciaPanel } from "@/components/Ortodoncia";

export function PlanTratamiento({ patient }: { patient: Patient }) {
  const { db } = useStore();
  const hasIA = useClinicPlan().features.includes("ia");
  const budgets = db.budgets.filter((b) => b.patientId === patient.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [selId, setSelId] = useState(budgets[0]?.id ?? "");
  const budget = budgets.find((b) => b.id === selId) ?? budgets[0];

  if (!budget) {
    return <Empty title="Sin planes de tratamiento" desc="Creá un presupuesto en la sección Presupuestos para iniciar un plan." />;
  }

  const isOrtho = budget.planType === "ortodoncia";
  const professional = db.users.find((u) => u.id === budget.dentistId);

  return (
    <div className="space-y-4">
      {budgets.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {budgets.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelId(b.id)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                b.id === budget.id ? "border-azure-500 bg-azure-50 text-azure-700" : "border-clinic-border bg-white text-clinic-muted hover:border-azure-300"
              }`}
            >
              Plan #{b.id} · {b.planType === "ortodoncia" ? "Ortodoncia" : "General"}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[330px_1fr]">
        <PlanFinanciero budget={budget} payments={db.payments} professional={professional?.name} hasIA={hasIA} patient={patient} />
        <PlanClinico key={budget.id} budget={budget} patient={patient} isOrtho={isOrtho} />
      </div>
    </div>
  );
}

/* ---------- Columna financiera (izquierda, panel navy) ---------- */
function PlanFinanciero({
  budget, payments, professional, hasIA, patient,
}: { budget: Budget; payments: Payment[]; professional?: string; hasIA: boolean; patient: Patient }) {
  const [copied, setCopied] = useState(false);
  const total = budgetTotal(budget);
  const realizado = budgetRealizado(budget);
  const abonado = budgetPaid(budget.id, payments);
  const saldo = budgetBalance(budget, payments);
  const pagos = payments.filter((p) => p.budgetId === budget.id).sort((a, b) => b.date.localeCompare(a.date));
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

/* ---------- Columna clínica (derecha) ---------- */
function PlanClinico({ budget, patient, isOrtho }: { budget: Budget; patient: Patient; isOrtho: boolean }) {
  const { session, setTooth } = useStore();
  const canWriteEmr = session ? can(session.role, "emr.write") : false;
  const [tab, setTab] = useState<"esp" | "odo">(isOrtho ? "esp" : "odo");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl border border-clinic-border bg-white p-1">
        {isOrtho && <TabBtn active={tab === "esp"} onClick={() => setTab("esp")} icon={Braces} label="Ortodoncia" />}
        <TabBtn active={tab === "odo"} onClick={() => setTab("odo")} icon={Smile} label="Odontograma" />
      </div>
      {tab === "esp" && isOrtho && <OrtodonciaPanel patient={patient} budget={budget} />}
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
