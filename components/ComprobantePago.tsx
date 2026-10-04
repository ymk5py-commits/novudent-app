"use client";
/** Comprobante de un pago (paridad Dentalink: paso 3 de «Ingresar un pago»). Se arma con
 *  los pagos que comparten `receiptNumber`. Se ve en pantalla, se imprime con el membrete
 *  de la clínica y se puede mandar por correo al paciente. */
import { Printer, CheckCircle2 } from "lucide-react";
import { fmtGs, fmtDate, fullName } from "@/lib/store";
import { PAYMENT_METHOD_LABEL } from "@/lib/budgets";
import { escapeHtml } from "@/lib/html";
import type { Comprobante } from "@/lib/pago";
import type { Budget, Clinic, Patient } from "@/lib/types";
import { Card } from "@/components/ui";
import { EmailButton } from "@/components/EmailButton";
import { PrintLetterhead, PrintPortal } from "@/components/PrintDocument";

const planLabel = (budgetId: string | undefined, budgets: Budget[]) => {
  if (!budgetId) return "Abono libre a favor del paciente";
  const b = budgets.find((x) => x.id === budgetId);
  const nombre = b?.name?.trim() || (b?.planType === "ortodoncia" ? "Ortodoncia" : "Plan general");
  return `Plan #${budgetId} · ${nombre}`;
};

const medioLabel = (m: Comprobante["medios"][number]) =>
  m.method === "cheque" && m.check ? `Cheque N° ${m.check.number} · ${m.check.bank} (cobro ${fmtDate(m.check.cashDate)})` : PAYMENT_METHOD_LABEL[m.method];

export function ComprobantePago({ comprobante, clinic, patient, budgets }: { comprobante: Comprobante; clinic: Clinic; patient: Patient; budgets: Budget[] }) {
  const c = comprobante;
  const html = comprobanteHtml(c, clinic, patient, budgets);

  const cuerpo = (
    <>
      <div className="grid gap-3 text-[13px] sm:grid-cols-3">
        <div><div className="font-bold text-clinic-text">Cliente</div><div className="text-clinic-muted">{fullName(patient)}</div></div>
        <div><div className="font-bold text-clinic-text">Documento</div><div className="tabular-nums text-clinic-muted">{patient.document || "—"}</div></div>
        <div><div className="font-bold text-clinic-text">Fecha</div><div className="text-clinic-muted">{fmtDate(c.date)}</div></div>
      </div>

      <div>
        <div className="mb-1 text-[13px] font-bold text-clinic-text">Cargos a abonar</div>
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-clinic-border text-left font-bold text-clinic-text"><th className="py-1.5">Descripción</th><th className="py-1.5 text-right">Abono</th></tr></thead>
          <tbody>
            {c.cargos.map((x, i) => (
              <tr key={i} className="border-b border-clinic-border/60"><td className="py-1.5 text-clinic-muted">{planLabel(x.budgetId, budgets)}</td><td className="py-1.5 text-right tabular-nums">{fmtGs(x.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="mb-1 text-[13px] font-bold text-clinic-text">Pagos</div>
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-clinic-border text-left font-bold text-clinic-text"><th className="py-1.5">Medio de pago</th><th className="py-1.5 text-right">Monto</th></tr></thead>
          <tbody>
            {c.medios.map((m, i) => (
              <tr key={i} className="border-b border-clinic-border/60"><td className="py-1.5 text-clinic-muted">{medioLabel(m)}</td><td className="py-1.5 text-right tabular-nums">{fmtGs(m.amount)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex justify-end gap-3 text-[14px] font-bold text-clinic-text"><span>Pagos totales:</span><span className="tabular-nums text-state-ok">{fmtGs(c.total)}</span></div>
      </div>
      <p className="text-xs text-clinic-muted">Recibido por {c.receivedBy}.</p>
    </>
  );

  return (
    <>
      <Card className="space-y-4 p-5 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-clinic-border pb-3">
          <h2 className="flex items-center gap-2 text-[16px] font-bold text-clinic-text"><CheckCircle2 className="h-5 w-5 text-state-ok" /> Comprobante N° {c.receiptNumber}</h2>
          <div className="flex flex-wrap items-start gap-2">
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded border border-clinic-border px-3 py-2 text-sm font-bold text-clinic-text transition-colors hover:border-azure-300 hover:text-azure-700"><Printer className="h-4 w-4" /> Imprimir</button>
            <EmailButton to={patient.email} subject={`Comprobante de pago N° ${c.receiptNumber} — ${clinic.name}`} html={html} label="Enviar comprobante por e-mail" />
          </div>
        </div>
        {cuerpo}
      </Card>

      <PrintPortal>
        <div className="plan-print-root">
          <PrintLetterhead clinic={clinic} label={`Comprobante de pago N° ${c.receiptNumber}`} />
          <div className="mt-6 space-y-5">{cuerpo}</div>
        </div>
      </PrintPortal>
    </>
  );
}

/** El mismo comprobante, como HTML simple para el correo. */
export function comprobanteHtml(c: Comprobante, clinic: Clinic, patient: Patient, budgets: Budget[]): string {
  const fila = (a: string, b: string) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e5e5e5;color:#555">${escapeHtml(a)}</td><td style="padding:6px 0;border-bottom:1px solid #e5e5e5;text-align:right">${escapeHtml(b)}</td></tr>`;
  return `<div style="font-family:'Open Sans',Arial,sans-serif;font-size:14px;color:#333;max-width:560px">
<h2 style="font-size:16px;margin:0 0 4px">Comprobante de pago N° ${escapeHtml(c.receiptNumber)}</h2>
<p style="margin:0 0 16px;color:#666">${escapeHtml(clinic.name)} · ${escapeHtml(fmtDate(c.date))}</p>
<p style="margin:0 0 12px">Hola ${escapeHtml(patient.firstName)}: registramos tu pago. Este es el detalle.</p>
<p style="margin:12px 0 4px;font-weight:700">Cargos a abonar</p>
<table style="width:100%;border-collapse:collapse">${c.cargos.map((x) => fila(planLabel(x.budgetId, budgets), fmtGs(x.amount))).join("")}</table>
<p style="margin:16px 0 4px;font-weight:700">Pagos</p>
<table style="width:100%;border-collapse:collapse">${c.medios.map((m) => fila(medioLabel(m), fmtGs(m.amount))).join("")}</table>
<p style="margin:12px 0 0;text-align:right;font-weight:700">Pagos totales: ${escapeHtml(fmtGs(c.total))}</p>
<p style="margin:16px 0 0;color:#666;font-size:12px">Recibido por ${escapeHtml(c.receivedBy)}.</p>
</div>`;
}
