"use client";
/** Control de caja: pagos del día por método, gastos, arqueo y cuentas por cobrar
 *  (tareas de morosidad con recordatorio por WhatsApp). */
import { useMemo, useState } from "react";
import {
  ShieldAlert, Plus, Wallet, TrendingDown, Scale, Trash2, MessageCircle, Banknote, CreditCard, Landmark, QrCode, Bot, Check,
} from "lucide-react";
import { useStore, fmtGs, fmtTime, fullName, waLink } from "@/lib/store";
import { botikaEnabled, makeOutboxTask, botikaMessage } from "@/lib/botika";
import { can } from "@/lib/rbac";
import { budgetTotal, budgetBalance, patientBalance, PAYMENT_METHOD_LABEL } from "@/lib/budgets";
import type { Payment, PaymentMethod, Expense } from "@/lib/types";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";
import { PlanLocked, useClinicPlan } from "@/components/PlanGate";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

const METHOD_ICON: Record<PaymentMethod, any> = { efectivo: Banknote, tarjeta: CreditCard, transferencia: Landmark, qr: QrCode };
const EXPENSE_CATS = ["Insumos", "Laboratorio", "Servicios", "Sueldos", "Alquiler", "Equipamiento", "Otros"];

const dayKey = (iso: string) => iso.slice(0, 10);
const todayKey = () => new Date().toISOString().slice(0, 10);

export default function CashPage() {
  const store = useStore();
  const { db, session } = store;
  const [day, setDay] = useState(todayKey());
  const [newPay, setNewPay] = useState(false);
  const [newExp, setNewExp] = useState(false);
  const [queued, setQueued] = useState<string[]>([]);

  const plan = useClinicPlan();
  if (!session) return null;
  if (!plan.features.includes("caja")) return <PlanLocked feature="caja" />;
  const allowed = can(session.role, "payments.manage");
  if (!allowed) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-lg font-extrabold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">La caja la gestionan el <b>Administrador</b> y la <b>Asistente</b>.</p>
      </Card>
    );
  }
  const canExpenses = can(session.role, "expenses.manage");
  const isAdmin = session.role === "admin";

  const dayPayments = db.payments.filter((p) => dayKey(p.date) === day).sort((a, b) => b.date.localeCompare(a.date));
  const dayExpenses = db.expenses.filter((e) => dayKey(e.date) === day).sort((a, b) => b.date.localeCompare(a.date));
  const income = dayPayments.reduce((s, p) => s + p.amount, 0);
  const spent = dayExpenses.reduce((s, e) => s + e.amount, 0);
  const byMethod = (m: PaymentMethod) => dayPayments.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0);

  /* cuentas por cobrar (morosidad) */
  const debtors = db.patients
    .map((p) => ({ p, balance: patientBalance(p.id, db.budgets, db.payments) }))
    .filter((x) => x.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  return (
    <div className="space-y-5">
      <Reveal y={0}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-clinic-text">Caja</h1>
          <p className="text-sm text-clinic-muted">Flujo diario de ingresos, gastos y cuentas por cobrar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className={inputCls + " !w-auto"} value={day} onChange={(e) => setDay(e.target.value)} />
          <Btn onClick={() => setNewPay(true)}><Plus className="h-4 w-4" /> Registrar pago</Btn>
          {canExpenses && <Btn variant="outline" onClick={() => setNewExp(true)}><TrendingDown className="h-4 w-4" /> Gasto</Btn>}
        </div>
      </div>
      </Reveal>

      {/* arqueo del día */}
      <Stagger className="grid gap-4 sm:grid-cols-3">
        <StaggerItem><Card className="h-full p-5">
          <div className="flex items-center gap-2 text-state-ok"><Wallet className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Ingresos del día</span></div>
          <div className="mt-1 font-mono text-2xl font-extrabold text-clinic-text">{fmtGs(income)}</div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-clinic-muted">
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
              <span key={m} className="flex justify-between"><span>{PAYMENT_METHOD_LABEL[m]}</span><span className="font-mono font-bold">{fmtGs(byMethod(m))}</span></span>
            ))}
          </div>
        </Card></StaggerItem>
        <StaggerItem><Card className="h-full p-5">
          <div className="flex items-center gap-2 text-state-err"><TrendingDown className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Gastos del día</span></div>
          <div className="mt-1 font-mono text-2xl font-extrabold text-clinic-text">{fmtGs(spent)}</div>
          <div className="mt-2 text-[11px] text-clinic-muted">{dayExpenses.length} registro{dayExpenses.length !== 1 && "s"}</div>
        </Card></StaggerItem>
        <StaggerItem><Card className="h-full p-5">
          <div className="flex items-center gap-2 text-azure-600"><Scale className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Balance del día</span></div>
          <div className={`mt-1 font-mono text-2xl font-extrabold ${income - spent >= 0 ? "text-state-ok" : "text-state-err"}`}>{fmtGs(income - spent)}</div>
          <div className="mt-2 text-[11px] text-clinic-muted">ingresos − gastos</div>
        </Card></StaggerItem>
      </Stagger>

      <Reveal className="grid gap-5 lg:grid-cols-5">
        {/* movimientos */}
        <Card className="p-5 lg:col-span-3">
          <h2 className="font-extrabold text-clinic-text">Movimientos del día</h2>
          {dayPayments.length === 0 && dayExpenses.length === 0 ? (
            <p className="py-8 text-center text-sm text-clinic-muted">Sin movimientos en esta fecha.</p>
          ) : (
            <ul className="mt-3 divide-y divide-clinic-border">
              {dayPayments.map((p) => {
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
                    {isAdmin && (
                      <button onClick={() => store.deletePayment(p.id)} className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err" title="Eliminar pago">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
              {dayExpenses.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-state-errbg text-state-err"><TrendingDown className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-clinic-text">{e.description}</span>
                    <span className="text-[11px] text-clinic-muted">{e.category}{e.supplier ? ` · ${e.supplier}` : ""} · {e.registeredBy}</span>
                  </span>
                  <span className="font-mono text-sm font-extrabold text-state-err">− {fmtGs(e.amount)}</span>
                  {isAdmin && (
                    <button onClick={() => store.deleteExpense(e.id)} className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err" title="Eliminar gasto">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* cuentas por cobrar */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-clinic-text">Cuentas por cobrar</h2>
            <Badge tone={debtors.length > 0 ? "warn" : "ok"} tip="Tareas de morosidad: pacientes con saldo pendiente">{debtors.length} paciente{debtors.length !== 1 && "s"}</Badge>
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
                    <button
                      disabled={queued.includes(p.id)}
                      onClick={() => {
                        store.addOutboxTask(makeOutboxTask({ db, type: "cobranza", patient: p, by: session.name, message: botikaMessage(db, "cobranza", { paciente: p.firstName, clinica: db.clinics[0].name, saldo: fmtGs(balance) }) }));
                        setQueued((q) => [...q, p.id]);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-3 py-2 text-xs font-bold text-azure-200 transition-colors hover:bg-navy-700 disabled:opacity-60"
                      title="Botika conversa con el paciente y gestiona el pago (cola de mensajería)"
                    >
                      {queued.includes(p.id) ? <><Check className="h-3.5 w-3.5" /> Encolado</> : <><Bot className="h-3.5 w-3.5" /> Botika</>}
                    </button>
                  )}
                  <a
                    href={waLink(p.phone, `Hola ${p.firstName} 👋 Te escribimos de ${db.clinics[0].name}. Tenés un saldo pendiente de ${fmtGs(balance)}. ¿Coordinamos el pago? ¡Gracias!`)}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366]/10 px-3 py-2 text-xs font-bold text-[#128C7E] transition-colors hover:bg-[#25D366]/20"
                    title="Enviar recordatorio manual por WhatsApp"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Manual
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Reveal>

      {newPay && <PaymentForm onClose={() => setNewPay(false)} />}
      {newExp && <ExpenseForm onClose={() => setNewExp(false)} />}
    </div>
  );
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
          <Field label="Monto (Gs)">
            <input type="number" min={0} className={inputCls} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
          <Field label="Método">
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Concepto">
          <input className={inputCls} value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej: Cuota ortodoncia, profilaxis…" />
        </Field>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn
            disabled={!patientId || amount <= 0 || !concept.trim()}
            onClick={() => {
              const pay: Payment = {
                id: `pay_${Date.now()}`, clinicId: db.clinics[0].id, patientId,
                budgetId: budgetId || undefined, date: new Date().toISOString(),
                amount, method, concept: concept.trim(), receivedBy: session!.name,
              };
              store.addPayment(pay);
              onClose();
            }}
          >
            Registrar {amount > 0 && fmtGs(amount)}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ===== Registrar gasto ===== */
function ExpenseForm({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const { db, session } = store;
  const [category, setCategory] = useState(EXPENSE_CATS[0]);
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);

  return (
    <Modal title="Registrar gasto" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría">
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Proveedor (opcional)">
            <input className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </Field>
        </div>
        <Field label="Descripción">
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: Resinas y adhesivos" />
        </Field>
        <Field label="Monto (Gs)">
          <input type="number" min={0} className={inputCls} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn
            disabled={amount <= 0 || !description.trim()}
            onClick={() => {
              const exp: Expense = {
                id: `e_${Date.now()}`, clinicId: db.clinics[0].id, date: new Date().toISOString(),
                category, supplier: supplier.trim() || undefined, description: description.trim(),
                amount, registeredBy: session!.name,
              };
              store.addExpense(exp);
              onClose();
            }}
          >
            Registrar gasto
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
