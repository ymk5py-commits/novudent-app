"use client";
/** Sub-tab "Recibir pago" (paridad Dentalink «Ingresar un pago», en tres pasos):
 *  1) qué se paga — uno o varios planes, cada uno con su monto, más un abono libre;
 *  2) con qué — uno o varios medios en el mismo pago;
 *  3) comprobante — imprimible y enviable por correo.
 *  Abajo, las cuotas de financiamiento: «Pagar cuota» carga ese monto en el paso 1. */
import { useMemo, useState } from "react";
import { Wallet, MessageCircle, Plus, Trash2, AlertCircle } from "lucide-react";
import { useStore, fmtGs, fmtDate } from "@/lib/store";
import { can } from "@/lib/rbac";
import { budgetTotal, budgetRealizado, budgetPaid, budgetBalance, financialStatus } from "@/lib/budgets";
import { cuotasDe, type InstallmentStatus } from "@/lib/financiamiento";
import { comprobanteDe, repartirPago, siguienteNumero, type MedioPago } from "@/lib/pago";
import type { Patient, Budget, PaymentMethod } from "@/lib/types";
import { fechaLocal } from "@/lib/tareas";
import { Card, Btn, Field, inputCls } from "@/components/ui";
import { ComprobantePago } from "@/components/ComprobantePago";

type MedioForm = { id: number; method: PaymentMethod; amount: string; checkNumber: string; checkBank: string; checkCashDate: string };

/** Hoy en la hora de la clínica (no UTC: de 21 a 24 h en Paraguay ya sería mañana). */
const hoy = () => fechaLocal();
/** El pie del financiamiento es la «cuota 0». */
const nombreCuota = (n: number) => (n === 0 ? "Pie" : `Cuota #${n}`);
/** «150.000», «150000» o «150000,50» → número. Vacío o basura → 0. */
const num = (s: string) => { const n = Number(String(s).replace(/\./g, "").replace(",", ".").trim()); return Number.isFinite(n) && n > 0 ? n : 0; };
const medioNuevo = (id: number): MedioForm => ({ id, method: "efectivo", amount: "", checkNumber: "", checkBank: "", checkCashDate: hoy() });

export function RecibirPagoTab({ patient, preseleccion }: { patient: Patient; preseleccion?: string | null }) {
  const { db, session, addPayment } = useStore();
  /* El permiso correcto es `payments.manage` (admin | asistente), el mismo que
   * usan las reglas de Firestore (`isStaff`) para dejar escribir en `payments`.
   *
   * Antes acá decía `billing.reports || emr.write`, que da admin | DENTISTA —
   * justo al revés de quien cobra. Mientras las reglas desplegadas eran las
   * abiertas nadie lo notó; desde que rigen las de verdad, el dentista ve el
   * formulario, cobra, y le salta el aviso de que no se pudo guardar, mientras
   * la recepción —que es quien cobra en el mostrador— lee "tu rol no registra
   * pagos". Con esto la UI y el servidor vuelven a decir lo mismo. */
  const canPay = session ? can(session.role, "payments.manage") : false;
  const pagables = db.budgets.filter((b) => b.patientId === patient.id && budgetBalance(b, db.payments) > 0);
  const conCuotas = db.budgets.filter((b) => b.patientId === patient.id && (b.schedule?.length ?? 0) > 0);

  /** Monto a abonar por plan. Que el plan esté en el mapa = está seleccionado. Si se llegó
   *  desde «Recaudar este tratamiento», ese plan entra seleccionado por su saldo. */
  const [montos, setMontos] = useState<Record<string, string>>(() => {
    const b = preseleccion ? pagables.find((x) => x.id === preseleccion) : undefined;
    return b ? { [b.id]: String(Math.round(budgetBalance(b, db.payments))) } : {};
  });
  /** Concepto propio de un plan (lo usa «Pagar cuota»). */
  const [conceptos, setConceptos] = useState<Record<string, string>>({});
  const [libreOn, setLibreOn] = useState(false);
  const [libre, setLibre] = useState("");
  const [medios, setMedios] = useState<MedioForm[]>([medioNuevo(1)]);
  const [date, setDate] = useState(hoy);
  const [concept, setConcept] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recibo, setRecibo] = useState<string | null>(null);

  const comprobante = useMemo(() => (recibo ? comprobanteDe(recibo, db.payments) : null), [recibo, db.payments]);

  if (!canPay) {
    return <Card className="p-5"><p className="text-sm text-clinic-muted">Tu rol no registra pagos (permiso financiero).</p></Card>;
  }

  /* Paso 3: comprobante del pago recién ingresado. */
  if (recibo && comprobante && db.clinics[0]) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-bold text-clinic-text">Ingresar un pago</h2>
          <Btn onClick={() => setRecibo(null)}><Plus className="h-4 w-4" /> Ingresar otro pago</Btn>
        </div>
        <ComprobantePago comprobante={comprobante} clinic={db.clinics[0]} patient={patient} budgets={db.budgets} />
      </div>
    );
  }

  const seleccionados = pagables.filter((b) => b.id in montos);
  const cargos = seleccionados.map((b) => ({ budgetId: b.id, amount: num(montos[b.id]) }));
  const abonoLibre = libreOn ? num(libre) : 0;
  const totalCargos = cargos.reduce((s, c) => s + c.amount, 0) + abonoLibre;
  /* Con un solo medio y su monto vacío, ese medio paga todo: el caso de todos los días
   * (un pago, un medio) no obliga a tipear el total dos veces. */
  const mediosPago: MedioPago[] = medios.map((m) => ({
    method: m.method,
    amount: medios.length === 1 && m.amount.trim() === "" ? totalCargos : num(m.amount),
    ...(m.method === "cheque" ? { check: { number: m.checkNumber, bank: m.checkBank, cashDate: m.checkCashDate } } : {}),
  }));
  const reparto = repartirPago(cargos, mediosPago, abonoLibre);
  const excedido = seleccionados.find((b) => num(montos[b.id]) > budgetBalance(b, db.payments));

  const toggle = (b: Budget) => setMontos((m) => {
    const n = { ...m };
    if (b.id in n) delete n[b.id]; else n[b.id] = String(Math.round(budgetBalance(b, db.payments)));
    return n;
  });
  const setMedio = (id: number, patch: Partial<MedioForm>) => setMedios((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const pagar = () => {
    if (!session) return;
    if (excedido) { setError(`El monto del plan #${excedido.id} supera su saldo.`); return; }
    if (reparto.error) { setError(reparto.error); return; }
    const receiptNumber = siguienteNumero(db.payments.map((p) => p.receiptNumber));
    let nPago = Number(siguienteNumero(db.payments.map((p) => p.paymentNumber)));
    const fecha = new Date(date + "T12:00:00").toISOString();
    const sello = Date.now();
    reparto.lineas.forEach((l, i) => {
      addPayment({
        id: `pay_${sello}_${i}`,
        clinicId: patient.clinicId, patientId: patient.id,
        ...(l.budgetId ? { budgetId: l.budgetId } : {}),
        date: fecha, amount: l.amount, method: l.method,
        concept: (l.budgetId ? conceptos[l.budgetId] : undefined) || concept.trim() || (l.budgetId ? `Abono plan #${l.budgetId}` : "Abono libre"),
        receivedBy: session.name,
        paymentNumber: String(nPago++), receiptNumber,
        ...(l.check ? { check: l.check } : {}),
      });
    });
    setRecibo(receiptNumber);
    setMontos({}); setConceptos({}); setLibreOn(false); setLibre(""); setMedios([medioNuevo(1)]); setConcept(""); setError(null);
  };

  const linkPago = () => {
    const tel = patient.phone.replace(/\D/g, "");
    const saldo = pagables.reduce((s, b) => s + budgetBalance(b, db.payments), 0);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/pagar/${patient.clinicId}?amount=${Math.round(saldo)}&concept=${encodeURIComponent("Saldo pendiente")}&patient=${encodeURIComponent(patient.firstName)}`;
    const msg = encodeURIComponent(`Hola ${patient.firstName}, te compartimos tu saldo pendiente: ${fmtGs(saldo)}. Podés pagar online o coordinar el pago acá: ${link} ¡Gracias!`);
    window.open(`https://wa.me/${tel}?text=${msg}`, "_blank");
  };

  /** «Pagar cuota» carga la cuota en el paso 1; el pago se confirma arriba, con comprobante. */
  const cargarCuota = (b: Budget, c: InstallmentStatus) => {
    setMontos((m) => ({ ...m, [b.id]: String(Math.round(Math.min(c.saldo, budgetBalance(b, db.payments)))) }));
    setConceptos((x) => ({ ...x, [b.id]: `${nombreCuota(c.numero)} — plan #${b.id}` }));
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-bold text-clinic-text">Ingresar un pago</h2>
        {pagables.length > 0 && (
          <button onClick={linkPago} className="inline-flex items-center gap-1.5 rounded-xl border border-clinic-border px-3 py-1.5 text-xs font-bold text-clinic-text hover:border-azure-300 hover:text-azure-700"><MessageCircle className="h-3.5 w-3.5" /> Link de pago (WhatsApp)</button>
        )}
      </div>

      {/* Paso 1 — qué se paga */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-clinic-border px-4 py-2.5 text-[14px] font-bold text-clinic-text"><Paso n={1} /> Selección de lo que se paga</div>
        {pagables.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-clinic-muted">Este paciente no tiene planes con saldo por abonar. Podés ingresar un abono libre a su favor.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-clinic-border text-left text-[13px] font-bold text-clinic-text">
                  <th className="w-10 px-4 py-2"></th>
                  <th className="px-2 py-2">Presupuesto</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2 text-right">Realizado</th>
                  <th className="px-2 py-2 text-right">Pagado</th>
                  <th className="px-2 py-2 text-right">Saldo</th>
                  <th className="px-2 py-2 text-right">A abonar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-clinic-border">
                {pagables.map((b) => {
                  const fin = financialStatus(b, db.payments);
                  const dr = db.users.find((u) => u.id === b.dentistId)?.name ?? "—";
                  const on = b.id in montos;
                  const saldo = budgetBalance(b, db.payments);
                  return (
                    <tr key={b.id} className={on ? "bg-azure-50/60" : "hover:bg-clinic-bg/60"}>
                      <td className="px-4 py-2">
                        <input type="checkbox" aria-label={`Pagar plan #${b.id}`} checked={on} onChange={() => toggle(b)} className="accent-azure-600" />
                      </td>
                      <td className="cursor-pointer px-2 py-2" onClick={() => toggle(b)}>
                        <div className="font-semibold text-clinic-text">Plan #{b.id} · {b.name?.trim() || (b.planType === "ortodoncia" ? "Ortodoncia" : "General")}</div>
                        <div className="text-[11px] text-clinic-muted">
                          {dr} · {fmtDate(b.createdAt)}
                          {fin.tone === "err" && <span className="ml-1 rounded bg-state-errbg px-1 font-bold text-state-err">DEUDA</span>}
                          {conceptos[b.id] && on && <span className="ml-1 rounded bg-state-infobg px-1 font-bold text-state-info">{conceptos[b.id].split(" — ")[0]}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtGs(budgetTotal(b))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtGs(budgetRealizado(b))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtGs(budgetPaid(b.id, db.payments))}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-bold text-state-err">{fmtGs(saldo)}</td>
                      <td className="px-2 py-2 text-right">
                        {on ? (
                          <input
                            inputMode="decimal" aria-label={`Monto a abonar al plan #${b.id}`}
                            className={`${inputCls} ml-auto w-32 text-right tabular-nums ${num(montos[b.id]) > saldo ? "border-state-err" : ""}`}
                            value={montos[b.id]} onChange={(e) => { setMontos((m) => ({ ...m, [b.id]: e.target.value })); setConceptos((x) => { const n = { ...x }; delete n[b.id]; return n; }); }}
                          />
                        ) : <span className="text-clinic-muted">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-clinic-border px-4 py-2.5">
          <label className="flex items-center gap-2 text-[13px] text-clinic-text">
            <input type="checkbox" checked={libreOn} onChange={(e) => setLibreOn(e.target.checked)} className="accent-azure-600" />
            Ingresar abono libre
            {libreOn && <input inputMode="decimal" aria-label="Monto del abono libre" placeholder="Monto" className={`${inputCls} w-32 text-right tabular-nums`} value={libre} onChange={(e) => setLibre(e.target.value)} />}
          </label>
          <div className="text-[14px] text-clinic-text">Total a pagar: <b className="tabular-nums">{fmtGs(totalCargos)}</b></div>
        </div>
      </Card>

      {/* Paso 2 — con qué se paga */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-[14px] font-bold text-clinic-text"><Paso n={2} /> Medio de pago</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Concepto (opcional)"><input className={inputCls} value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Abono…" /></Field>
        </div>
        <div className="space-y-2">
          {medios.map((m, i) => (
            <div key={m.id} className="rounded border border-clinic-border bg-clinic-bg/40 p-3">
              <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Field label={medios.length > 1 ? `Medio de pago ${i + 1}` : "Medio de pago"}>
                  <select className={inputCls} value={m.method} onChange={(e) => setMedio(m.id, { method: e.target.value as PaymentMethod })}>
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="cheque">Cheque</option>
                    <option value="qr">QR / billetera</option>
                  </select>
                </Field>
                <Field label="Monto">
                  <input inputMode="decimal" className={`${inputCls} text-right tabular-nums`} value={m.amount} onChange={(e) => setMedio(m.id, { amount: e.target.value })} placeholder={medios.length === 1 ? String(Math.round(totalCargos) || "") : "0"} />
                </Field>
                {medios.length > 1 && (
                  <button type="button" onClick={() => setMedios((ms) => ms.filter((x) => x.id !== m.id))} aria-label={`Quitar medio de pago ${i + 1}`} className="mb-0.5 grid h-8 w-8 place-items-center rounded text-state-err hover:bg-state-errbg"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
              {m.method === "cheque" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label="N° de cheque"><input className={inputCls} value={m.checkNumber} onChange={(e) => setMedio(m.id, { checkNumber: e.target.value })} placeholder="00012345" /></Field>
                  <Field label="Banco"><input className={inputCls} value={m.checkBank} onChange={(e) => setMedio(m.id, { checkBank: e.target.value })} placeholder="Banco Continental" /></Field>
                  <Field label="Fecha de cobro"><input type="date" className={inputCls} value={m.checkCashDate} onChange={(e) => setMedio(m.id, { checkCashDate: e.target.value })} /></Field>
                </div>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setMedios((ms) => [...ms, medioNuevo(Math.max(...ms.map((x) => x.id)) + 1)])} className="inline-flex items-center gap-1.5 rounded border border-dashed border-azure-300 px-3 py-2 text-[13px] font-semibold text-azure-700 hover:bg-azure-50">
            <Plus className="h-4 w-4" /> Agregar nuevo medio de pago
          </button>
        </div>

        {medios.length > 1 && totalCargos > 0 && (
          <div className={`text-[13px] ${reparto.diferencia === 0 ? "text-state-ok" : "text-state-err"}`}>
            Medios: <b className="tabular-nums">{fmtGs(reparto.totalMedios)}</b> de <b className="tabular-nums">{fmtGs(reparto.totalCargos)}</b>
            {reparto.diferencia !== 0 && <> · {reparto.diferencia > 0 ? "sobran" : "faltan"} <b className="tabular-nums">{fmtGs(Math.abs(reparto.diferencia))}</b></>}
          </div>
        )}
        {error && <div role="alert" className="flex items-center gap-2 rounded bg-state-errbg px-3 py-2 text-[13px] font-semibold text-state-err"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</div>}
        <div className="flex justify-end">
          <Btn disabled={totalCargos <= 0} onClick={pagar}><Wallet className="h-4 w-4" /> Ingresar pago{totalCargos > 0 ? ` · ${fmtGs(totalCargos)}` : ""}</Btn>
        </div>
      </Card>

      {conCuotas.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-clinic-text">Por cuotas de financiamiento</h3>
          {conCuotas.map((b) => {
            const cuotas = cuotasDe(b, db.payments);
            const next = cuotas.find((c) => c.saldo > 0);
            return (
              <Card key={b.id} className="overflow-hidden p-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-clinic-border px-4 py-2.5">
                  <span className="text-xs font-bold text-clinic-text">Plan #{b.id} · {b.planType === "ortodoncia" ? "Ortodoncia" : "General"} · {cuotas.filter((c) => c.numero >= 1).length} cuotas{cuotas.some((c) => c.numero === 0) ? " + pie" : ""}</span>
                  {next && <Btn variant="outline" onClick={() => cargarCuota(b, next)}><Wallet className="h-4 w-4" /> Pagar {next.numero === 0 ? "pie" : `cuota #${next.numero}`} · {fmtGs(next.saldo)}</Btn>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[460px] text-sm">
                    <thead>
                      <tr className="border-b border-clinic-border text-left text-[13px] font-bold text-clinic-text">
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
                          <td className="px-4 py-2 tabular-nums text-clinic-muted">{nombreCuota(c.numero)}</td>
                          <td className="px-2 py-2 text-clinic-muted">{fmtDate(c.dueDate)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmtGs(c.amount)}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-state-ok">{fmtGs(c.pagado)}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-bold">
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

function Paso({ n }: { n: number }) {
  return <span className="grid h-5 w-5 place-items-center rounded bg-azure-600 text-[12px] font-bold text-white">{n}</span>;
}
