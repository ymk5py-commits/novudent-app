"use client";
/** Cajas estilo Dentalink: libro de caja con apertura/cierre por usuario.
 *  Mi caja (sesión abierta + movimientos + arqueo) · Cajas abiertas · Cajas cerradas.
 *  Cuentas por cobrar (morosidad) con recordatorio WhatsApp/Botika. */
import { useState } from "react";
import {
  ShieldAlert, Plus, Wallet, TrendingDown, Trash2, MessageCircle, Banknote, CreditCard, Landmark, QrCode, Bot, Check, Lock, Unlock, Scale,
} from "lucide-react";
import { useStore, fmtGs, fmtTime, fmtDate, fullName, waLink } from "@/lib/store";
import { botikaEnabled, makeOutboxTask, botikaMessage } from "@/lib/botika";
import { can } from "@/lib/rbac";
import { budgetTotal, budgetBalance, patientBalance, PAYMENT_METHOD_LABEL } from "@/lib/budgets";
import type { Payment, PaymentMethod, CashSession, Expense } from "@/lib/types";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";
import { PlanLocked, useClinicPlan } from "@/components/PlanGate";
import { Reveal } from "@/components/motion";

const METHOD_ICON: Record<PaymentMethod, any> = { efectivo: Banknote, tarjeta: CreditCard, transferencia: Landmark, cheque: Landmark, qr: QrCode };

/** Totales de una sesión: movimientos (pagos no anulados + gastos) en [apertura, cierre/ahora]. */
function sessionTotals(s: CashSession, payments: Payment[], expenses: Expense[]) {
  const from = s.openedAt;
  const to = s.closedAt ?? new Date().toISOString();
  const pays = payments.filter((p) => !p.voidedAt && p.date >= from && p.date <= to);
  const exps = expenses.filter((e) => e.cashSessionId === s.id || (!e.cashSessionId && e.date >= from && e.date <= to));
  const ingresos = pays.reduce((a, p) => a + p.amount, 0);
  const egresos = exps.reduce((a, e) => a + e.amount, 0);
  const efectivo = pays.filter((p) => p.method === "efectivo").reduce((a, p) => a + p.amount, 0);
  return { pays, exps, ingresos, egresos, efectivo, acumulado: s.openingBalance + ingresos - egresos, expectedCash: s.openingBalance + efectivo - egresos };
}

type Tab = "mi" | "abiertas" | "cerradas";

export default function CashPage() {
  const { db, session } = useStore();
  const [tab, setTab] = useState<Tab>("mi");
  const [newPay, setNewPay] = useState(false);
  const [abrir, setAbrir] = useState(false);
  const [cerrar, setCerrar] = useState<CashSession | null>(null);

  const plan = useClinicPlan();
  if (!session) return null;
  if (!plan.features.includes("caja")) return <PlanLocked feature="caja" />;
  if (!can(session.role, "payments.manage")) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-lg font-extrabold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">La caja la gestionan el <b>Administrador</b> y la <b>Asistente</b>.</p>
      </Card>
    );
  }

  const sessions = [...db.cashSessions].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  const abiertas = sessions.filter((s) => s.status === "abierta");
  const cerradas = sessions.filter((s) => s.status === "cerrada");
  const miCaja = abiertas.find((s) => s.userId === session.userId) ?? null;

  const TABS: [Tab, string][] = [["mi", "Mi caja"], ["abiertas", "Cajas abiertas"], ["cerradas", "Cajas cerradas"]];

  return (
    <div className="space-y-4">
      <Reveal className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2"><Wallet className="h-6 w-6 text-azure-600" /><h1 className="text-xl font-extrabold text-clinic-text">Cajas</h1></div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-clinic-border bg-white p-1">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${tab === k ? "bg-navy-800 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}>
              {label}{k === "abiertas" && abiertas.length > 0 ? ` (${abiertas.length})` : ""}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {miCaja
            ? <Btn onClick={() => setNewPay(true)}><Plus className="h-4 w-4" /> Registrar pago</Btn>
            : <Btn onClick={() => setAbrir(true)}><Lock className="h-4 w-4" /> Abrir caja</Btn>}
        </div>
      </Reveal>

      {tab === "mi" && (miCaja ? <MiCajaPanel s={miCaja} onCerrar={() => setCerrar(miCaja)} onPay={() => setNewPay(true)} /> : (
        <Card className="p-10 text-center">
          <Lock className="mx-auto h-10 w-10 text-clinic-muted" />
          <h2 className="mt-3 font-extrabold text-clinic-text">No tenés una caja abierta</h2>
          <p className="mt-1 text-sm text-clinic-muted">Abrí tu caja con el saldo inicial para registrar los movimientos del turno.</p>
          <Btn className="mx-auto mt-4" onClick={() => setAbrir(true)}><Lock className="h-4 w-4" /> Abrir caja</Btn>
        </Card>
      ))}
      {tab === "abiertas" && <SesionesTable sessions={abiertas} kind="open" onCerrar={setCerrar} />}
      {tab === "cerradas" && <SesionesTable sessions={cerradas} kind="closed" />}

      {newPay && <PaymentForm onClose={() => setNewPay(false)} />}
      {abrir && <AbrirCajaModal onClose={() => setAbrir(false)} />}
      {cerrar && <CerrarCajaModal s={cerrar} onClose={() => setCerrar(null)} />}
    </div>
  );
}

/* ===== Mi caja (sesión abierta) ===== */
function MiCajaPanel({ s, onCerrar, onPay }: { s: CashSession; onCerrar: () => void; onPay: () => void }) {
  const store = useStore();
  const { db, session } = store;
  const [queued, setQueued] = useState<string[]>([]);
  const t = sessionTotals(s, db.payments, db.expenses);
  const isAdmin = session?.role === "admin";

  const debtors = db.patients.map((p) => ({ p, balance: patientBalance(p.id, db.budgets, db.payments) })).filter((x) => x.balance > 0).sort((a, b) => b.balance - a.balance);

  return (
    <div className="space-y-4">
      <Reveal className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-clinic-border bg-white px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-state-okbg px-2.5 py-1 text-xs font-bold text-state-ok"><span className="h-1.5 w-1.5 rounded-full bg-state-ok" /> Caja abierta</span>
          <span className="text-clinic-muted">{s.userName} · desde {fmtDate(s.openedAt)} {fmtTime(s.openedAt)}</span>
        </div>
        <Btn variant="outline" onClick={onCerrar}><Unlock className="h-4 w-4" /> Cerrar caja</Btn>
      </Reveal>

      <Reveal className="grid gap-3 sm:grid-cols-4">
        <Stat label="Saldo inicial" value={s.openingBalance} icon={Lock} tone="text-clinic-text" />
        <Stat label="Ingresos" value={t.ingresos} icon={Wallet} tone="text-state-ok" />
        <Stat label="Egresos" value={t.egresos} icon={TrendingDown} tone="text-state-err" />
        <Stat label="Acumulado" value={t.acumulado} icon={Scale} tone="text-azure-700" />
      </Reveal>

      <Reveal className="grid gap-4 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <div className="flex items-center justify-between"><h2 className="font-extrabold text-clinic-text">Movimientos de la caja</h2><Btn variant="outline" onClick={onPay}><Plus className="h-3.5 w-3.5" /> Pago</Btn></div>
          {t.pays.length === 0 && t.exps.length === 0 ? (
            <p className="py-8 text-center text-sm text-clinic-muted">Sin movimientos en esta caja todavía.</p>
          ) : (
            <ul className="mt-3 divide-y divide-clinic-border">
              {[...t.pays].sort((a, b) => b.date.localeCompare(a.date)).map((p) => {
                const patient = db.patients.find((x) => x.id === p.patientId);
                const Icon = METHOD_ICON[p.method];
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-state-okbg text-state-ok"><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-clinic-text">{patient ? fullName(patient) : "—"} · {p.concept}</span>
                      <span className="text-[11px] text-clinic-muted">{fmtTime(p.date)} · {PAYMENT_METHOD_LABEL[p.method]} · {p.receivedBy}</span>
                    </span>
                    <span className="font-mono text-sm font-extrabold text-state-ok">+ {fmtGs(p.amount)}</span>
                    {isAdmin && <button onClick={() => store.deletePayment(p.id)} className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err" title="Eliminar pago"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </li>
                );
              })}
              {[...t.exps].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-state-errbg text-state-err"><TrendingDown className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-clinic-text">{e.description}</span>
                    <span className="text-[11px] text-clinic-muted">{e.category}{e.supplier ? ` · ${e.supplier}` : ""} · {e.registeredBy}</span>
                  </span>
                  <span className="font-mono text-sm font-extrabold text-state-err">− {fmtGs(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-clinic-text">Cuentas por cobrar</h2>
            <Badge tone={debtors.length > 0 ? "warn" : "ok"} tip="Pacientes con saldo pendiente">{debtors.length} paciente{debtors.length !== 1 && "s"}</Badge>
          </div>
          {debtors.length === 0 ? (
            <p className="py-8 text-center text-sm text-clinic-muted">🎉 Sin saldos pendientes.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {debtors.map(({ p, balance }) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl bg-clinic-bg p-3">
                  <a href={`/app/pacientes/${p.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-clinic-text hover:text-azure-700">{fullName(p)}</span>
                    <span className="font-mono text-xs font-extrabold text-state-err">{fmtGs(balance)}</span>
                  </a>
                  {botikaEnabled(db, "cobranza") && (
                    <button disabled={queued.includes(p.id)} onClick={() => { store.addOutboxTask(makeOutboxTask({ db, type: "cobranza", patient: p, by: session!.name, message: botikaMessage(db, "cobranza", { paciente: p.firstName, clinica: db.clinics[0].name, saldo: fmtGs(balance) }) })); setQueued((q) => [...q, p.id]); }} className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-3 py-2 text-xs font-bold text-azure-200 transition-colors hover:bg-navy-700 disabled:opacity-60" title="Botika gestiona el cobro">
                      {queued.includes(p.id) ? <><Check className="h-3.5 w-3.5" /> Encolado</> : <><Bot className="h-3.5 w-3.5" /> Botika</>}
                    </button>
                  )}
                  <a href={waLink(p.phone, `Hola ${p.firstName} 👋 Te escribimos de ${db.clinics[0].name}. Tenés un saldo pendiente de ${fmtGs(balance)}. ¿Coordinamos el pago? ¡Gracias!`)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366]/10 px-3 py-2 text-xs font-bold text-[#128C7E] transition-colors hover:bg-[#25D366]/20" title="Recordatorio por WhatsApp">
                    <MessageCircle className="h-3.5 w-3.5" /> Manual
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Reveal>
    </div>
  );
}

/* ===== Tabla de sesiones (abiertas / cerradas) ===== */
function SesionesTable({ sessions, kind, onCerrar }: { sessions: CashSession[]; kind: "open" | "closed"; onCerrar?: (s: CashSession) => void }) {
  const { db } = useStore();
  if (sessions.length === 0) return <Empty title={kind === "open" ? "No hay cajas abiertas" : "No hay cajas cerradas"} desc={kind === "open" ? "Abrí una caja para empezar el turno." : "Las cajas cerradas con su arqueo aparecen acá."} />;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[820px] text-sm">
        <thead><tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
          <th className="px-4 py-3">Usuario</th><th className="px-2 py-3">Apertura</th>{kind === "closed" && <th className="px-2 py-3">Cierre</th>}<th className="px-2 py-3 text-right">Saldo inicial</th><th className="px-2 py-3 text-right">Ingresos</th><th className="px-2 py-3 text-right">Egresos</th><th className="px-2 py-3 text-right">Acumulado</th>{kind === "closed" && <th className="px-2 py-3 text-right">Diferencia</th>}{kind === "open" && <th className="px-2 py-3"></th>}
        </tr></thead>
        <tbody className="divide-y divide-clinic-border">
          {sessions.map((s) => {
            const t = sessionTotals(s, db.payments, db.expenses);
            const diff = (s.countedCash ?? t.expectedCash) - t.expectedCash;
            return (
              <tr key={s.id} className="hover:bg-clinic-bg/60">
                <td className="px-4 py-2.5 font-semibold text-clinic-text">{s.userName}</td>
                <td className="px-2 py-2.5 text-clinic-muted">{fmtDate(s.openedAt)} · {fmtTime(s.openedAt)}</td>
                {kind === "closed" && <td className="px-2 py-2.5 text-clinic-muted">{s.closedAt ? `${fmtDate(s.closedAt)} · ${fmtTime(s.closedAt)}` : "—"}</td>}
                <td className="px-2 py-2.5 text-right font-mono">{fmtGs(s.openingBalance)}</td>
                <td className="px-2 py-2.5 text-right font-mono text-state-ok">{fmtGs(t.ingresos)}</td>
                <td className="px-2 py-2.5 text-right font-mono text-state-err">{fmtGs(t.egresos)}</td>
                <td className="px-2 py-2.5 text-right font-mono font-bold text-clinic-text">{fmtGs(t.acumulado)}</td>
                {kind === "closed" && <td className={`px-2 py-2.5 text-right font-mono font-bold ${diff === 0 ? "text-state-ok" : "text-state-err"}`}>{diff > 0 ? "+" : ""}{fmtGs(diff)}</td>}
                {kind === "open" && <td className="px-2 py-2.5 text-right">{onCerrar && <Btn variant="outline" onClick={() => onCerrar(s)}><Unlock className="h-3.5 w-3.5" /> Cerrar</Btn>}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-clinic-muted"><Icon className="h-4 w-4" /><span className="text-[11px] font-extrabold uppercase tracking-wide">{label}</span></div>
      <div className={`mt-1 font-mono text-xl font-extrabold ${tone}`}>{fmtGs(value)}</div>
    </Card>
  );
}

/* ===== Abrir caja ===== */
function AbrirCajaModal({ onClose }: { onClose: () => void }) {
  const { db, session, openCashSession } = useStore();
  const [openingBalance, setOpeningBalance] = useState(0);
  const [branchId, setBranchId] = useState(db.branches.find((b) => b.isMain)?.id ?? "");
  return (
    <Modal title="Abrir caja" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-clinic-muted">Declará el efectivo con el que arranca el turno.</p>
        <Field label="Saldo inicial (Gs)"><input type="number" min={0} className={inputCls} value={openingBalance} onChange={(e) => setOpeningBalance(Number(e.target.value))} autoFocus /></Field>
        {db.branches.length > 1 && (
          <Field label="Sucursal">
            <select className={inputCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={() => { openCashSession({ id: `cs_${Date.now()}`, clinicId: db.clinics[0].id, userId: session!.userId, userName: session!.name, openedAt: new Date().toISOString(), openingBalance, branchId: branchId || undefined, status: "abierta" }); onClose(); }}><Lock className="h-4 w-4" /> Abrir caja</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ===== Cerrar caja (arqueo) ===== */
function CerrarCajaModal({ s, onClose }: { s: CashSession; onClose: () => void }) {
  const { db, closeCashSession } = useStore();
  const t = sessionTotals(s, db.payments, db.expenses);
  const [countedCash, setCountedCash] = useState(t.expectedCash);
  const [note, setNote] = useState("");
  const diff = countedCash - t.expectedCash;
  return (
    <Modal title="Cerrar caja — arqueo" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="space-y-1.5 rounded-xl bg-clinic-bg p-3">
          <Row label="Saldo inicial" value={fmtGs(s.openingBalance)} />
          <Row label="Ingresos en efectivo" value={`+ ${fmtGs(t.efectivo)}`} />
          <Row label="Egresos" value={`− ${fmtGs(t.egresos)}`} />
          <div className="border-t border-clinic-border pt-1.5"><Row label="Efectivo esperado" value={fmtGs(t.expectedCash)} bold /></div>
        </div>
        <Field label="Efectivo contado (Gs)"><input type="number" className={inputCls} value={countedCash} onChange={(e) => setCountedCash(Number(e.target.value))} autoFocus /></Field>
        <div className={`flex items-center justify-between rounded-xl px-3 py-2 font-bold ${diff === 0 ? "bg-state-okbg text-state-ok" : "bg-state-errbg text-state-err"}`}>
          <span>{diff === 0 ? "Caja cuadrada" : diff > 0 ? "Sobrante" : "Faltante"}</span>
          <span className="font-mono">{diff > 0 ? "+" : ""}{fmtGs(diff)}</span>
        </div>
        <Field label="Observación (opcional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: diferencia por vuelto…" /></Field>
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={() => { closeCashSession(s.id, countedCash, note); onClose(); }}><Unlock className="h-4 w-4" /> Cerrar caja</Btn>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className="flex items-center justify-between"><span className="text-clinic-muted">{label}</span><span className={`font-mono ${bold ? "font-extrabold text-clinic-text" : "text-clinic-text"}`}>{value}</span></div>;
}

/* ===== Registrar pago ===== */
function PaymentForm({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const { db, session } = store;
  const [patientId, setPatientId] = useState(db.patients[0]?.id ?? "");
  const [budgetId, setBudgetId] = useState("");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [concept, setConcept] = useState("");

  const openBudgets = db.budgets.filter((b) => b.patientId === patientId && (b.status === "aceptado" || b.status === "completado") && budgetBalance(b, db.payments) > 0);
  const selected = db.budgets.find((b) => b.id === budgetId);
  const balance = selected ? budgetBalance(selected, db.payments) : null;

  return (
    <Modal title="Registrar pago" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Paciente">
          <select className={inputCls} value={patientId} onChange={(e) => { setPatientId(e.target.value); setBudgetId(""); }}>
            {db.patients.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
          </select>
        </Field>
        <Field label="Presupuesto (opcional)" hint={balance !== null ? `Saldo del presupuesto: ${fmtGs(balance)}` : "Pago libre si no se asocia"}>
          <select className={inputCls} value={budgetId} onChange={(e) => {
            setBudgetId(e.target.value);
            const b = db.budgets.find((x) => x.id === e.target.value);
            if (b) {
              const bal = budgetBalance(b, db.payments);
              const cuota = b.installments && b.installments > 1 ? Math.round(budgetTotal(b) / b.installments) : bal;
              setAmount(Math.min(cuota, bal));
              if (!concept) setConcept(b.installments && b.installments > 1 ? "Cuota de tratamiento" : "Pago de tratamiento");
            }
          }}>
            <option value="">Sin presupuesto</option>
            {openBudgets.map((b) => <option key={b.id} value={b.id}>{fmtGs(budgetTotal(b))} — saldo {fmtGs(budgetBalance(b, db.payments))}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto (Gs)"><input type="number" min={0} className={inputCls} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
          <Field label="Método">
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Concepto"><input className={inputCls} value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej: Cuota ortodoncia, profilaxis…" /></Field>
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn disabled={!patientId || amount <= 0 || !concept.trim()} onClick={() => {
            const pay: Payment = { id: `pay_${Date.now()}`, clinicId: db.clinics[0].id, patientId, budgetId: budgetId || undefined, date: new Date().toISOString(), amount, method, concept: concept.trim(), receivedBy: session!.name };
            store.addPayment(pay);
            onClose();
          }}>Registrar {amount > 0 && fmtGs(amount)}</Btn>
        </div>
      </div>
    </Modal>
  );
}
