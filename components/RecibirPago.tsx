"use client";
/** Sub-tab "Recibir pago" de la ficha: registra un abono contra un presupuesto con saldo. */
import { useState } from "react";
import { Wallet, CheckCircle2 } from "lucide-react";
import { useStore, fmtGs } from "@/lib/store";
import { can } from "@/lib/rbac";
import { budgetTotal, budgetBalance } from "@/lib/budgets";
import type { Patient, Budget, PaymentMethod } from "@/lib/types";
import { Card, Btn, Field, inputCls, Empty } from "@/components/ui";

export function RecibirPagoTab({ patient }: { patient: Patient }) {
  const { db, session } = useStore();
  const canPay = session ? can(session.role, "billing.reports") || can(session.role, "emr.write") : false;
  const budgets = db.budgets.filter((b) => b.patientId === patient.id && budgetBalance(b, db.payments) > 0);

  if (!canPay) {
    return <Card className="p-5"><p className="text-sm text-clinic-muted">Tu rol no registra pagos (permiso financiero).</p></Card>;
  }
  if (budgets.length === 0) {
    return <Empty title="Sin saldos pendientes" desc="Este paciente no tiene presupuestos con saldo por abonar." />;
  }
  return (
    <div className="space-y-4">
      {budgets.map((b) => <PagoCard key={b.id} budget={b} patient={patient} />)}
    </div>
  );
}

function PagoCard({ budget, patient }: { budget: Budget; patient: Patient }) {
  const { db, session, addPayment } = useStore();
  const saldo = budgetBalance(budget, db.payments);
  const [amount, setAmount] = useState(saldo);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [concept, setConcept] = useState("");
  const [done, setDone] = useState(false);

  const register = () => {
    if (amount <= 0 || !session) return;
    addPayment({
      id: `pay_${Date.now()}`,
      clinicId: patient.clinicId,
      patientId: patient.id,
      budgetId: budget.id,
      date: new Date(date + "T12:00:00").toISOString(),
      amount: Math.min(amount, saldo),
      method,
      concept: concept.trim() || `Abono plan #${budget.id}`,
      receivedBy: session.name,
    });
    setDone(true);
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-xs font-bold uppercase tracking-wide text-clinic-muted">
            Plan #{budget.id} · {budget.planType === "ortodoncia" ? "Ortodoncia" : "General"}
          </span>
          <div className="font-mono text-lg font-extrabold text-state-err">Saldo {fmtGs(saldo)}</div>
        </div>
        <span className="text-xs text-clinic-muted">Total {fmtGs(budgetTotal(budget))}</span>
      </div>
      {done ? (
        <div className="flex items-center gap-2 rounded-xl bg-state-okbg p-3 text-sm font-semibold text-state-ok">
          <CheckCircle2 className="h-4 w-4" /> Abono registrado. El saldo se actualizó.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Monto"><input type="number" min={0} max={saldo} className={inputCls} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
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
          <div className="flex justify-end sm:col-span-4">
            <Btn disabled={amount <= 0} onClick={register}><Wallet className="h-4 w-4" /> Registrar abono</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}
