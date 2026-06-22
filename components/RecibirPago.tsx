"use client";
/** Sub-tab "Recibir pago" (paridad Dentalink): tabla multi-plan con checkbox + "Pagar
 *  tratamiento(s)", y sección "Por cuotas de financiamiento" (cuotas con pagado/saldo). */
import { useState } from "react";
import { Wallet, CheckCircle2, MessageCircle } from "lucide-react";
import { useStore, fmtGs, fmtDate } from "@/lib/store";
import { can } from "@/lib/rbac";
import { budgetTotal, budgetRealizado, budgetPaid, budgetBalance, financialStatus } from "@/lib/budgets";
import { installmentStatus, type InstallmentStatus } from "@/lib/financiamiento";
import type { Patient, Budget, PaymentMethod } from "@/lib/types";
import { Card, Btn, Field, inputCls, Empty } from "@/components/ui";

export function RecibirPagoTab({ patient }: { patient: Patient }) {
  const { db, session, addPayment } = useStore();
  const canPay = session ? can(session.role, "billing.reports") || can(session.role, "emr.write") : false;
  const pagables = db.budgets.filter((b) => b.patientId === patient.id && budgetBalance(b, db.payments) > 0);
  const conCuotas = db.budgets.filter((b) => b.patientId === patient.id && (b.schedule?.length ?? 0) > 0);

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [concept, setConcept] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  if (!canPay) {
    return <Card className="p-5"><p className="text-sm text-clinic-muted">Tu rol no registra pagos (permiso financiero).</p></Card>;
  }
  if (pagables.length === 0 && conCuotas.length === 0) {
    return (
      <div className="space-y-4">
        {flash && <Flash text={flash} />}
        <Empty title="Sin saldos pendientes" desc="Este paciente no tiene presupuestos con saldo por abonar." />
      </div>
    );
  }

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selBudgets = pagables.filter((b) => sel.has(b.id));
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

  const linkPago = () => {
    const tel = patient.phone.replace(/\D/g, "");
    const saldo = pagables.reduce((s, b) => s + budgetBalance(b, db.payments), 0);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/pagar/${patient.clinicId}?amount=${Math.round(saldo)}&concept=${encodeURIComponent("Saldo pendiente")}&patient=${encodeURIComponent(patient.firstName)}`;
    const msg = encodeURIComponent(`Hola ${patient.firstName}, te compartimos tu saldo pendiente: ${fmtGs(saldo)}. Podés pagar online o coordinar el pago acá: ${link} ¡Gracias!`);
    window.open(`https://wa.me/${tel}?text=${msg}`, "_blank");
  };

  const pagarCuota = (b: Budget, c: InstallmentStatus) => {
    if (!session || c.saldo <= 0) return;
    addPayment({
      id: `pay_${Date.now()}_${b.id}_c${c.numero}`,
      clinicId: patient.clinicId, patientId: patient.id, budgetId: b.id,
      date: new Date().toISOString(), amount: c.saldo, method,
      concept: `Cuota #${c.numero} — plan #${b.id}`, receivedBy: session.name,
    });
    setFlash(`Cuota #${c.numero} registrada por ${fmtGs(c.saldo)}.`);
  };

  return (
    <div className="space-y-5">
      {flash && <Flash text={flash} />}

      {pagables.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-clinic-muted">Seleccioná uno o varios planes de tratamiento a pagar.</p>
            <button onClick={linkPago} className="inline-flex items-center gap-1.5 rounded-xl border border-clinic-border px-3 py-1.5 text-xs font-bold text-clinic-text hover:border-azure-300 hover:text-azure-700"><MessageCircle className="h-3.5 w-3.5" /> Link de pago (WhatsApp)</button>
          </div>
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
                {pagables.map((b) => {
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
      )}

      {conCuotas.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-extrabold text-clinic-text">Por cuotas de financiamiento</h3>
          {conCuotas.map((b) => {
            const cuotas = installmentStatus(b.schedule!, budgetPaid(b.id, db.payments));
            const next = cuotas.find((c) => c.saldo > 0);
            return (
              <Card key={b.id} className="overflow-hidden p-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-clinic-border px-4 py-2.5">
                  <span className="text-xs font-bold text-clinic-text">Plan #{b.id} · {b.planType === "ortodoncia" ? "Ortodoncia" : "General"} · {cuotas.length} cuotas</span>
                  {next && <Btn onClick={() => pagarCuota(b, next)}><Wallet className="h-4 w-4" /> Pagar cuota #{next.numero} · {fmtGs(next.saldo)}</Btn>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[460px] text-sm">
                    <thead>
                      <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                        <th className="px-4 py-2.5">Cuota</th>
                        <th className="px-2 py-2.5">Vencimiento</th>
                        <th className="px-2 py-2.5 text-right">Monto</th>
                        <th className="px-2 py-2.5 text-right">Pagado</th>
                        <th className="px-2 py-2.5 text-right">Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-clinic-border">
                      {cuotas.map((c) => (
                        <tr key={c.numero}>
                          <td className="px-4 py-2 font-mono text-clinic-muted">#{c.numero}</td>
                          <td className="px-2 py-2 text-clinic-muted">{fmtDate(c.dueDate)}</td>
                          <td className="px-2 py-2 text-right font-mono">{fmtGs(c.amount)}</td>
                          <td className="px-2 py-2 text-right font-mono text-state-ok">{fmtGs(c.pagado)}</td>
                          <td className="px-2 py-2 text-right font-mono font-bold">
                            {c.saldo > 0 ? <span className="text-state-err">{fmtGs(c.saldo)}</span> : <span className="text-state-ok">✓</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}
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
