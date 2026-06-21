"use client";
/** Módulo de Gastos estilo Dentalink (Administración → Gastos): tabla Detalle
 *  (Categoría/Detalle/Fecha factura/Fecha pago/Total) + Resumen por categoría,
 *  con editar/eliminar y filtros mes/año. */
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Banknote, BarChart3, FileText } from "lucide-react";
import { useStore, fmtGs, fmtDate } from "@/lib/store";
import { can } from "@/lib/rbac";
import type { Expense } from "@/lib/types";
import { Card, Btn, Modal, Field, inputCls, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";

const EXPENSE_CATS = ["Insumos", "Laboratorio", "Sueldos", "Alquiler", "Servicios", "Equipamiento", "Marketing", "Impuestos", "Mantenimiento", "Otros"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export default function GastosPage() {
  const { db, session, deleteExpense } = useStore();
  const canManage = session ? can(session.role, "payments.manage") : false;
  const now = new Date();
  const [tab, setTab] = useState<"detalle" | "resumen">("detalle");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [editing, setEditing] = useState<Expense | null>(null);
  const [adding, setAdding] = useState(false);

  const years = useMemo(() => {
    const ys = new Set<number>([now.getFullYear()]);
    db.expenses.forEach((e) => ys.add(new Date(e.invoiceDate ?? e.date).getFullYear()));
    return [...ys].sort((a, b) => b - a);
  }, [db.expenses]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const filtered = useMemo(
    () => db.expenses.filter((e) => (e.invoiceDate ?? e.date.slice(0, 10)).slice(0, 7) === monthKey).sort((a, b) => (b.invoiceDate ?? b.date).localeCompare(a.invoiceDate ?? a.date)),
    [db.expenses, monthKey]
  );
  const total = filtered.reduce((s, e) => s + e.amount, 0);

  const porCategoria = useMemo(() => {
    const m = new Map<string, { total: number; n: number }>();
    for (const e of filtered) { const c = m.get(e.category) ?? { total: 0, n: 0 }; c.total += e.amount; c.n += 1; m.set(e.category, c); }
    return [...m.entries()].map(([cat, v]) => ({ cat, ...v })).sort((a, b) => b.total - a.total);
  }, [filtered]);

  if (!canManage) {
    return <Card className="p-6"><p className="text-sm text-clinic-muted">Tu rol no tiene acceso a Gastos (permiso financiero).</p></Card>;
  }

  return (
    <div className="space-y-4">
      <Reveal className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2"><Banknote className="h-6 w-6 text-azure-600" /><h1 className="text-xl font-extrabold text-clinic-text">Gastos</h1></div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={month} onChange={(e) => setMonth(+e.target.value)} className={`${inputCls} w-auto`}>
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m[0].toUpperCase() + m.slice(1)}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(+e.target.value)} className={`${inputCls} w-auto`}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <Btn onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Agregar gasto</Btn>
        </div>
      </Reveal>

      <Reveal className="grid gap-3 sm:grid-cols-3">
        <Stat label={`Total ${MESES[month - 1]}`} value={total} tone="text-state-err" />
        <Stat label="Cantidad de gastos" value={filtered.length} money={false} />
        <Stat label="Categorías" value={porCategoria.length} money={false} />
      </Reveal>

      <div className="flex w-fit gap-1 rounded-xl border border-clinic-border bg-white p-1">
        {([["detalle", "Detalle", FileText], ["resumen", "Resumen por categoría", BarChart3]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${tab === k ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}><Icon className="h-4 w-4" /> {label}</button>
        ))}
      </div>

      {tab === "detalle" ? (
        filtered.length === 0 ? (
          <Empty title="Sin gastos este mes" desc="Registrá uno con “Agregar gasto”, o cambiá de mes/año." />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                <th className="px-4 py-3">Categoría</th><th className="px-2 py-3">Detalle</th><th className="px-2 py-3">Fecha factura</th><th className="px-2 py-3">Fecha pago</th><th className="px-2 py-3 text-right">Total</th><th className="px-2 py-3"></th>
              </tr></thead>
              <tbody className="divide-y divide-clinic-border">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-clinic-bg/60">
                    <td className="px-4 py-2.5"><span className="rounded-lg bg-clinic-bg px-2 py-0.5 text-xs font-bold text-clinic-text">{e.category}</span></td>
                    <td className="px-2 py-2.5"><div className="font-semibold text-clinic-text">{e.description}</div>{e.supplier && <div className="text-xs text-clinic-muted">{e.supplier}</div>}</td>
                    <td className="px-2 py-2.5 text-clinic-muted">{e.invoiceDate ? fmtDate(e.invoiceDate) : "—"}</td>
                    <td className="px-2 py-2.5">{e.payDate ? <span className="text-clinic-muted">{fmtDate(e.payDate)}</span> : <span className="text-xs font-bold text-state-warn">No pagada</span>}</td>
                    <td className="px-2 py-2.5 text-right font-mono font-bold text-clinic-text">{fmtGs(e.amount)}</td>
                    <td className="px-2 py-2.5 text-right">
                      <span className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing(e)} title="Editar gasto" className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-azure-50 hover:text-azure-700"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => { if (confirm("¿Eliminar este gasto?")) deleteExpense(e.id); }} title="Eliminar gasto" className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err"><Trash2 className="h-3.5 w-3.5" /></button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 border-clinic-border"><td colSpan={4} className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-clinic-muted">Total del mes</td><td className="px-2 py-2.5 text-right font-mono text-base font-extrabold text-state-err">{fmtGs(total)}</td><td></td></tr></tfoot>
            </table>
          </Card>
        )
      ) : porCategoria.length === 0 ? (
        <Empty title="Sin datos para el resumen" />
      ) : (
        <Card className="space-y-3 p-5">
          {porCategoria.map((c) => {
            const pct = total > 0 ? Math.round((c.total / total) * 100) : 0;
            return (
              <div key={c.cat}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-bold text-clinic-text">{c.cat} <span className="font-normal text-clinic-muted">· {c.n} gasto{c.n > 1 ? "s" : ""}</span></span>
                  <span className="font-mono font-bold text-clinic-text">{fmtGs(c.total)} <span className="text-xs font-normal text-clinic-muted">({pct}%)</span></span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-clinic-bg"><div className="h-full rounded-full bg-azure-500" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </Card>
      )}

      {(adding || editing) && <GastoModal expense={editing} onClose={() => { setAdding(false); setEditing(null); }} />}
    </div>
  );
}

function Stat({ label, value, tone = "text-clinic-text", money = true }: { label: string; value: number; tone?: string; money?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-clinic-muted">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-extrabold ${tone}`}>{money ? fmtGs(value) : value}</div>
    </Card>
  );
}

function GastoModal({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const { db, session, addExpense, updateExpense } = useStore();
  const [category, setCategory] = useState(expense?.category ?? EXPENSE_CATS[0]);
  const [supplier, setSupplier] = useState(expense?.supplier ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense?.amount ?? 0);
  const [invoiceDate, setInvoiceDate] = useState(expense?.invoiceDate ?? new Date().toISOString().slice(0, 10));
  const [payDate, setPayDate] = useState(expense?.payDate ?? "");

  const save = () => {
    if (!session || amount <= 0 || !description.trim()) return;
    const exp: Expense = {
      id: expense?.id ?? `e_${Date.now()}`,
      clinicId: db.clinics[0].id,
      date: expense?.date ?? new Date().toISOString(),
      category, supplier: supplier.trim() || undefined, description: description.trim(),
      amount, registeredBy: expense?.registeredBy ?? session.name,
      invoiceDate: invoiceDate || undefined, payDate: payDate || undefined,
    };
    (expense ? updateExpense : addExpense)(exp);
    onClose();
  };

  return (
    <Modal title={expense ? "Editar gasto" : "Agregar gasto"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría"><select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>{EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Proveedor (opcional)"><input className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field>
        </div>
        <Field label="Detalle"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej.: Resinas y adhesivos" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Monto (Gs)"><input type="number" min={0} className={inputCls} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
          <Field label="Fecha factura"><input type="date" className={inputCls} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></Field>
          <Field label="Fecha pago"><input type="date" className={inputCls} value={payDate} onChange={(e) => setPayDate(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn disabled={amount <= 0 || !description.trim()} onClick={save}>{expense ? "Guardar" : "Registrar"}{amount > 0 ? ` · ${fmtGs(amount)}` : ""}</Btn>
        </div>
      </div>
    </Modal>
  );
}
