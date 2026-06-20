"use client";
/** Sub-tab "Recibir pago" (paridad Dentalink): tabla multi-plan con checkbox, columnas
 *  Total/Realizado/Pagado/Saldo, y un solo "Pagar tratamiento(s)" que salda los seleccionados. */
import { useState } from "react";
import { Wallet, CheckCircle2 } from "lucide-react";
import { useStore, fmtGs, fmtDate } from "@/lib/store";
import { can } from "@/lib/rbac";
import { budgetTotal, budgetRealizado, budgetPaid, budgetBalance, financialStatus } from "@/lib/budgets";
import type { Patient, PaymentMethod } from "@/lib/types";
import { Card, Btn, Field, inputCls, Empty } from "@/components/ui";

export function RecibirPagoTab({ patient }: { patient: Patient }) {
  const { db, session, addPayment } = useStore();
  const canPay = session ? can(session.role, "billing.reports") || can(session.role, "emr.write") : false;
  const budgets = db.budgets.filter((b) => b.patientId === patient.id && budgetBalance(b, db.payments) > 0);

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [concept, setConcept] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  if (!canPay) {
    return <Card className="p-5"><p className="text-sm text-clinic-muted">Tu rol no registra pagos (permiso financiero).</p></Card>;
  }
  if (budgets.length === 0) {
    return (
      <div className="space-y-4">
        {flash && <Flash text={flash} />}
        <Empty title="Sin saldos pendientes" desc="Este paciente no tiene presupuestos con saldo por abonar." />
      </div>
    );
  }

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selBudgets = budgets.filter((b) => sel.has(b.id));
  const totalSel = selBudgets.reduce((s, b) => s + budgetBalance(b, db.payments), 0);

  const pagar = () => {
    if (!session || selBudgets.length === 0) return;
    let count = 0;
    for (const b of selBudgets) {
      const saldo = budgetBalance(b, db.payments);
      if (saldo <= 0) continue;
      addPayment({
        id: `pay_${Date.now()}_${b.id}`,
        clinicId: patient.clinicId, patientId: patient.id, budgetId: b.id,
        date: new Date(date + "T12:00:00").toISOString(), amount: saldo, method,
        concept: concept.trim() || `Abono plan #${b.id}`, receivedBy: session.name,
      });
      count++;
    }
    setFlash(`${count} pago(s) registrado(s) por ${fmtGs(totalSel)}. El saldo se actualizó.`);
    setSel(new Set());
    setConcept("");
  };

  return (
    <div className="space-y-4">
      {flash && <Flash text={flash} />}
      <p className="text-sm text-clinic-muted">Seleccioná uno o varios planes de tratamiento a pagar.</p>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
              <th className="w-10 px-4 py-3"></th>
              <th className="px-2 py-3">Presupuesto</th>
              <th className="px-2 py-3 text-right">Total</th>
              <th className="px-2 py-3 text-right">Realizado</th>
              <th className="px-2 py-3 text-right">Pagado</th>
              <th className="px-2 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-clinic-border">
            {budgets.map((b) => {
              const fin = financialStatus(b, db.payments);
              const dr = db.users.find((u) => u.id === b.dentistId)?.name ?? "—";
              return (
                <tr key={b.id} className={`cursor-pointer hover:bg-clinic-bg/60 ${sel.has(b.id) ? "bg-azure-50/60" : ""}`} onClick={() => toggle(b.id)}>
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={sel.has(b.id)} onChange={() => toggle(b.id)} onClick={(e) => e.stopPropagation()} />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="font-semibold text-clinic-text">Plan #{b.id} · {b.planType === "ortodoncia" ? "Ortodoncia" : "General"}</div>
                    <div className="text-[11px] text-clinic-muted">
                      {dr} · {fmtDate(b.createdAt)}
                      {fin.tone === "err" && <span className="ml-1 rounded bg-state-errbg px-1 font-bold text-state-err">DEUDA</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono">{fmtGs(budgetTotal(b))}</td>
                  <td className="px-2 py-2.5 text-right font-mono">{fmtGs(budgetRealizado(b))}</td>
                  <td className="px-2 py-2.5 text-right font-mono">{fmtGs(budgetPaid(b.id, db.payments))}</td>
                  <td className="px-2 py-2.5 text-right font-mono font-extrabold text-state-err">{fmtGs(budgetBalance(b, db.payments))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <div className="grid items-end gap-3 sm:grid-cols-4">
          <Field label="Fecha"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Medio">
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="qr">QR / billetera</option>
            </select>
          </Field>
          <Field label="Concepto"><input className={inputCls} value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Abono…" /></Field>
          <Btn disabled={selBudgets.length === 0} onClick={pagar} className="w-full justify-center">
            <Wallet className="h-4 w-4" /> Pagar tratamiento(s){totalSel > 0 ? ` · ${fmtGs(totalSel)}` : ""}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

function Flash({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-state-okbg p-3 text-sm font-semibold text-state-ok">
      <CheckCircle2 className="h-4 w-4" /> {text}
    </div>
  );
}
