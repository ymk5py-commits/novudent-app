"use client";
/** "Facturación y pagos" del paciente (paridad Dentalink): sub-tabs
 *  Pagos / Documentos emitidos / Devoluciones / Pagos eliminados / Balance. */
import { useState } from "react";
import { Trash2, RotateCcw, Receipt } from "lucide-react";
import { useStore, fmtGs, fmtDate } from "@/lib/store";
import { can } from "@/lib/rbac";
import { budgetTotal, patientBalance, PAYMENT_METHOD_LABEL } from "@/lib/budgets";
import type { Patient, Payment } from "@/lib/types";
import { Card, Empty } from "@/components/ui";

type FactTab = "pagos" | "documentos" | "devoluciones" | "eliminados" | "balance";

export function FacturacionPaciente({ patient }: { patient: Patient }) {
  const { db, session, voidPayment, addFiscalDoc } = useStore();
  const canManage = session ? can(session.role, "billing.reports") || can(session.role, "payments.manage") : false;
  const [tab, setTab] = useState<FactTab>("pagos");

  const allPagos = db.payments.filter((p) => p.patientId === patient.id).sort((a, b) => b.date.localeCompare(a.date));
  const pagos = allPagos.filter((p) => !p.voidedAt);
  const eliminados = allPagos.filter((p) => p.voidedAt);
  const docs = db.fiscalDocs.filter((d) => d.patientId === patient.id).sort((a, b) => b.date.localeCompare(a.date));
  const boletas = docs.filter((d) => d.kind === "boleta");
  const devoluciones = docs.filter((d) => d.kind === "devolucion");

  const SUBS = [
    { k: "pagos", label: "Pagos" },
    { k: "documentos", label: "Documentos emitidos" },
    { k: "devoluciones", label: "Devoluciones" },
    { k: "eliminados", label: "Pagos eliminados" },
    { k: "balance", label: "Balance" },
  ] as const;

  const anular = (id: string) => {
    if (session && confirm("¿Anular este pago? Pasa a 'Pagos eliminados' y deja de contar en el saldo.")) voidPayment(id, session.name);
  };
  const devolver = (p: Payment) => {
    if (!session) return;
    addFiscalDoc({ id: `fd_${Date.now()}_${p.id}`, clinicId: patient.clinicId, patientId: patient.id, kind: "devolucion", amount: p.amount, date: new Date().toISOString(), paymentId: p.id, reason: "Devolución de pago", by: session.name });
  };
  const emitirBoleta = (p: Payment) => {
    if (!session) return;
    const num = `0001-${String(boletas.length + 1).padStart(4, "0")}`;
    addFiscalDoc({ id: `bol_${Date.now()}_${p.id}`, clinicId: patient.clinicId, patientId: patient.id, kind: "boleta", number: num, amount: p.amount, date: new Date().toISOString(), paymentId: p.id, by: session.name });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-xl border border-clinic-border bg-white p-1">
        {SUBS.map((s) => (
          <button key={s.k} onClick={() => setTab(s.k)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${tab === s.k ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}>{s.label}</button>
        ))}
      </div>

      {tab === "pagos" && (pagos.length === 0 ? (
        <Empty title="Sin pagos recibidos" desc="Los abonos del paciente aparecerán acá." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
              <th className="px-4 py-3">N° Pago</th><th className="px-2 py-3">Plan</th><th className="px-2 py-3">Medio de pago</th><th className="px-2 py-3">N° Boleta</th><th className="px-2 py-3">Recepción</th><th className="px-2 py-3 text-right">Monto</th><th className="px-2 py-3"></th>
            </tr></thead>
            <tbody className="divide-y divide-clinic-border">
              {pagos.map((p) => (
                <tr key={p.id} className="hover:bg-clinic-bg/60">
                  <td className="px-4 py-2.5 font-mono text-xs text-clinic-muted">{p.paymentNumber ?? "—"}</td>
                  <td className="px-2 py-2.5">{p.budgetId ? <span className="font-semibold text-azure-700">#{p.budgetId}</span> : <span className="text-clinic-muted">Libre</span>}</td>
                  <td className="px-2 py-2.5"><div className="text-clinic-text">{PAYMENT_METHOD_LABEL[p.method] ?? p.method}</div><div className="text-[11px] text-clinic-muted">Recibido por {p.receivedBy}</div></td>
                  <td className="px-2 py-2.5 font-mono text-xs text-clinic-muted">{p.receiptNumber ?? "—"}</td>
                  <td className="px-2 py-2.5 text-clinic-muted">{fmtDate(p.date)}</td>
                  <td className="px-2 py-2.5 text-right font-mono font-bold text-clinic-text">{fmtGs(p.amount)}</td>
                  <td className="px-2 py-2.5 text-right">
                    {canManage && (
                      <span className="flex items-center justify-end gap-1">
                        {!boletas.some((d) => d.paymentId === p.id) && <button onClick={() => emitirBoleta(p)} title="Emitir boleta" className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-azure-50 hover:text-azure-700"><Receipt className="h-3.5 w-3.5" /></button>}
                        <button onClick={() => devolver(p)} title="Registrar devolución" className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-state-warnbg hover:text-state-warn"><RotateCcw className="h-3.5 w-3.5" /></button>
                        <button onClick={() => anular(p.id)} title="Anular pago" className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err"><Trash2 className="h-3.5 w-3.5" /></button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}

      {tab === "documentos" && (boletas.length === 0 ? (
        <Empty title="Sin documentos emitidos" desc="Las boletas/facturas emitidas aparecerán acá." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
              <th className="px-4 py-3">N° Boleta</th><th className="px-2 py-3">Fecha</th><th className="px-2 py-3">Pago</th><th className="px-2 py-3 text-right">Monto</th>
            </tr></thead>
            <tbody className="divide-y divide-clinic-border">
              {boletas.map((d) => (
                <tr key={d.id} className="hover:bg-clinic-bg/60">
                  <td className="px-4 py-2.5 font-mono text-clinic-text">{d.number ?? "—"}</td>
                  <td className="px-2 py-2.5 text-clinic-muted">{fmtDate(d.date)}</td>
                  <td className="px-2 py-2.5 text-clinic-muted">{d.paymentId ?? "—"}</td>
                  <td className="px-2 py-2.5 text-right font-mono font-bold">{fmtGs(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}

      {tab === "devoluciones" && (devoluciones.length === 0 ? (
        <Empty title="Sin devoluciones" desc="Registrá una devolución desde la pestaña Pagos (ícono ↺)." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
              <th className="px-4 py-3">Fecha</th><th className="px-2 py-3">Motivo</th><th className="px-2 py-3">Registrado por</th><th className="px-2 py-3 text-right">Monto</th>
            </tr></thead>
            <tbody className="divide-y divide-clinic-border">
              {devoluciones.map((d) => (
                <tr key={d.id} className="hover:bg-clinic-bg/60">
                  <td className="px-4 py-2.5 text-clinic-muted">{fmtDate(d.date)}</td>
                  <td className="px-2 py-2.5 text-clinic-text">{d.reason ?? "—"}</td>
                  <td className="px-2 py-2.5 text-clinic-muted">{d.by}</td>
                  <td className="px-2 py-2.5 text-right font-mono font-bold text-state-warn">{fmtGs(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}

      {tab === "eliminados" && (eliminados.length === 0 ? (
        <Empty title="Sin pagos eliminados" desc="Los pagos anulados aparecerán acá." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
              <th className="px-4 py-3">Recepción</th><th className="px-2 py-3">Medio</th><th className="px-2 py-3">Anulado</th><th className="px-2 py-3 text-right">Monto</th>
            </tr></thead>
            <tbody className="divide-y divide-clinic-border">
              {eliminados.map((p) => (
                <tr key={p.id} className="text-clinic-muted">
                  <td className="px-4 py-2.5">{fmtDate(p.date)}</td>
                  <td className="px-2 py-2.5">{PAYMENT_METHOD_LABEL[p.method] ?? p.method}</td>
                  <td className="px-2 py-2.5">{p.voidedAt ? `${fmtDate(p.voidedAt)} · ${p.voidedBy ?? ""}` : "—"}</td>
                  <td className="px-2 py-2.5 text-right font-mono line-through">{fmtGs(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}

      {tab === "balance" && <BalancePaciente patient={patient} />}
    </div>
  );
}

function BalancePaciente({ patient }: { patient: Patient }) {
  const { db } = useStore();
  const budgets = db.budgets.filter((b) => b.patientId === patient.id);
  const aceptados = budgets.filter((b) => b.status === "aceptado" || b.status === "completado");
  const totalAceptado = aceptados.reduce((s, b) => s + budgetTotal(b), 0);
  const pagado = db.payments.filter((p) => p.patientId === patient.id && !p.voidedAt).reduce((s, p) => s + p.amount, 0);
  const saldo = patientBalance(patient.id, db.budgets, db.payments);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat label="Presupuestado (aceptado)" value={totalAceptado} tone="text-clinic-text" />
      <Stat label="Total abonado" value={pagado} tone="text-state-ok" />
      <Stat label="Saldo del paciente" value={Math.max(0, saldo)} tone={saldo > 0 ? "text-state-err" : "text-state-ok"} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className="p-5">
      <div className="text-xs font-bold uppercase tracking-wide text-clinic-muted">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-extrabold ${tone}`}>{fmtGs(value)}</div>
    </Card>
  );
}
