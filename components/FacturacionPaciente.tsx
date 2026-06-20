"use client";
/** "Facturación y pagos" del paciente (paridad Dentalink): sub-tabs
 *  Pagos / Documentos emitidos / Devoluciones / Pagos eliminados / Balance.
 *  Pagos y Balance funcionales; los otros 3 se habilitan en Fase B (colecciones nuevas). */
import { useState } from "react";
import { useStore, fmtGs, fmtDate } from "@/lib/store";
import { budgetTotal, patientBalance, PAYMENT_METHOD_LABEL } from "@/lib/budgets";
import type { Patient } from "@/lib/types";
import { Card, Empty } from "@/components/ui";

type FactTab = "pagos" | "documentos" | "devoluciones" | "eliminados" | "balance";

export function FacturacionPaciente({ patient }: { patient: Patient }) {
  const { db } = useStore();
  const [tab, setTab] = useState<FactTab>("pagos");
  const pagos = db.payments.filter((p) => p.patientId === patient.id).sort((a, b) => b.date.localeCompare(a.date));

  const SUBS = [
    { k: "pagos", label: "Pagos" },
    { k: "documentos", label: "Documentos emitidos" },
    { k: "devoluciones", label: "Devoluciones" },
    { k: "eliminados", label: "Pagos eliminados" },
    { k: "balance", label: "Balance" },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-xl border border-clinic-border bg-white p-1">
        {SUBS.map((s) => (
          <button key={s.k} onClick={() => setTab(s.k)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${tab === s.k ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}>{s.label}</button>
        ))}
      </div>

      {tab === "pagos" && (
        pagos.length === 0 ? (
          <Empty title="Sin pagos recibidos" desc="Los abonos del paciente aparecerán acá." />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[740px] text-sm">
              <thead>
                <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                  <th className="px-4 py-3">N° Pago</th>
                  <th className="px-2 py-3">Plan</th>
                  <th className="px-2 py-3">Medio de pago</th>
                  <th className="px-2 py-3">N° Boleta</th>
                  <th className="px-2 py-3">Recepción</th>
                  <th className="px-2 py-3">Vencimiento</th>
                  <th className="px-2 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-clinic-border">
                {pagos.map((p) => (
                  <tr key={p.id} className="hover:bg-clinic-bg/60">
                    <td className="px-4 py-2.5 font-mono text-xs text-clinic-muted">{p.paymentNumber ?? p.id.replace(/^pay_/, "#")}</td>
                    <td className="px-2 py-2.5">{p.budgetId ? <span className="font-semibold text-azure-700">#{p.budgetId}</span> : <span className="text-clinic-muted">Libre</span>}</td>
                    <td className="px-2 py-2.5">
                      <div className="text-clinic-text">{PAYMENT_METHOD_LABEL[p.method] ?? p.method}</div>
                      <div className="text-[11px] text-clinic-muted">Recibido por {p.receivedBy}</div>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-xs text-clinic-muted">{p.receiptNumber ?? "—"}</td>
                    <td className="px-2 py-2.5 text-clinic-muted">{fmtDate(p.date)}</td>
                    <td className="px-2 py-2.5 text-clinic-muted">{p.dueDate ? fmtDate(p.dueDate) : "—"}</td>
                    <td className="px-2 py-2.5 text-right font-mono font-bold text-clinic-text">{fmtGs(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === "balance" && <BalancePaciente patient={patient} />}

      {(tab === "documentos" || tab === "devoluciones" || tab === "eliminados") && (
        <Empty title="Próximamente" desc="Boletas, devoluciones y pagos anulados se habilitan en la próxima etapa (con su colección)." />
      )}
    </div>
  );
}

function BalancePaciente({ patient }: { patient: Patient }) {
  const { db } = useStore();
  const budgets = db.budgets.filter((b) => b.patientId === patient.id);
  const aceptados = budgets.filter((b) => b.status === "aceptado" || b.status === "completado");
  const totalAceptado = aceptados.reduce((s, b) => s + budgetTotal(b), 0);
  const pagado = db.payments.filter((p) => p.patientId === patient.id).reduce((s, p) => s + p.amount, 0);
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
