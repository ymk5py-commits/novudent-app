"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useStore, fmtGs, fullName } from "@/lib/store";
import { budgetTotal } from "@/lib/budgets";
import type { Budget, BudgetItem } from "@/lib/types";
import { Btn, Modal, Field, inputCls } from "@/components/ui";

/** Alta / edición de un presupuesto, que es también el plan de tratamiento.
 *  `sinMontos` (roles v3): el dentista arma el plan sin ver convenio, descuento, cuotas,
 *  precios ni total — los precios salen igual del arancel, así caja cobra lo correcto.
 *  `paciente` / `profesional` dejan fijos esos campos (se abre desde la ficha). */
export function BudgetForm({ budget, onClose, onSave, sinMontos = false, paciente, profesional }: {
  budget: Budget | null;
  onClose: () => void;
  onSave: (b: Budget) => void;
  sinMontos?: boolean;
  paciente?: string;
  profesional?: string;
}) {
  const { db, session } = useStore();
  const dentists = db.users.filter((u) => u.role === "dentist" && u.active);
  const convenios = db.clinics[0].config.convenios ?? [];

  const [patientId, setPatientId] = useState(budget?.patientId ?? paciente ?? db.patients[0]?.id ?? "");
  const [dentistId, setDentistId] = useState(budget?.dentistId ?? profesional ?? dentists[0]?.id ?? "");
  const pacienteFijo = paciente ? db.patients.find((p) => p.id === paciente) : undefined;
  const profesionalFijo = profesional ? db.users.find((u) => u.id === profesional) : undefined;
  const [convenio, setConvenio] = useState(budget?.convenio ?? "");
  const [discountPct, setDiscountPct] = useState(budget?.discountPct ?? 0);
  const [installments, setInstallments] = useState(budget?.installments ?? 1);
  const [notes, setNotes] = useState(budget?.notes ?? "");
  const [items, setItems] = useState<BudgetItem[]>(budget?.items ?? []);

  const addItem = () => {
    const pr = db.procedures[0];
    setItems((xs) => [...xs, { id: `gi_${Date.now()}_${xs.length}`, cpt: pr.cpt, description: pr.description, price: pr.price, status: "pendiente" }]);
  };
  const setItem = (i: number, patch: Partial<BudgetItem>) => setItems((xs) => xs.map((x, ix) => (ix === i ? { ...x, ...patch } : x)));

  const draft = { items, discountPct: discountPct || undefined };
  const total = budgetTotal(draft);

  return (
    <Modal title={sinMontos ? (budget ? "Editar plan de tratamiento" : "Nuevo plan de tratamiento") : budget ? "Editar presupuesto" : "Nuevo presupuesto"} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paciente">
            {pacienteFijo ? (
              <p className="py-2 text-sm font-semibold text-clinic-text">{fullName(pacienteFijo)}</p>
            ) : (
              <select className={inputCls} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                {db.patients.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
              </select>
            )}
          </Field>
          <Field label="Profesional">
            {profesionalFijo ? (
              <p className="py-2 text-sm font-semibold text-clinic-text">{profesionalFijo.name}</p>
            ) : (
              <select className={inputCls} value={dentistId} onChange={(e) => setDentistId(e.target.value)}>
                {dentists.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
          </Field>
          {!sinMontos && <>
          <Field label="Convenio" hint="Aplica el descuento pactado automáticamente">
            <select
              className={inputCls}
              value={convenio}
              onChange={(e) => {
                const c = convenios.find((x) => x.name === e.target.value);
                setConvenio(e.target.value);
                setDiscountPct(c?.discountPct ?? 0);
              }}
            >
              <option value="">Sin convenio</option>
              {convenios.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.discountPct}%)</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Descuento %">
              <input type="number" min={0} max={100} className={inputCls} value={discountPct} onChange={(e) => setDiscountPct(Number(e.target.value))} />
            </Field>
            <Field label="Cuotas" hint="1 = contado">
              <input type="number" min={1} max={36} className={inputCls} value={installments} onChange={(e) => setInstallments(Number(e.target.value))} />
            </Field>
          </div>
          </>}
        </div>

        {/* ítems */}
        <div className="rounded-xl border border-clinic-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide text-clinic-muted">Procedimientos</span>
            <Btn variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5" /> Agregar</Btn>
          </div>
          {items.length === 0 && <p className="py-3 text-center text-sm text-clinic-muted">Agregá al menos un procedimiento.</p>}
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={it.id} className={`grid ${sinMontos ? "grid-cols-[1fr_72px_32px]" : "grid-cols-[1fr_72px_120px_32px]"} items-center gap-2`}>
                <select
                  className={inputCls}
                  value={it.cpt}
                  onChange={(e) => {
                    const pr = db.procedures.find((p) => p.cpt === e.target.value)!;
                    setItem(i, { cpt: pr.cpt, description: pr.description, price: pr.price });
                  }}
                >
                  {db.procedures.map((p) => <option key={p.cpt} value={p.cpt}>{p.cpt} — {p.description}</option>)}
                </select>
                <input className={inputCls} placeholder="Pieza" value={it.tooth ?? ""} onChange={(e) => setItem(i, { tooth: e.target.value || undefined })} title="Pieza FDI (opcional)" />
                {!sinMontos && <input type="number" aria-label="Precio" className={inputCls} value={it.price} onChange={(e) => setItem(i, { price: Number(e.target.value) })} />}
                <button onClick={() => setItems((xs) => xs.filter((_, ix) => ix !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err" aria-label="Quitar">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <Field label="Notas">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {!sinMontos && <div className="flex items-center justify-between rounded-xl bg-clinic-bg px-4 py-3">
          <span className="text-sm font-bold text-clinic-text">Total {discountPct ? `(− ${discountPct}%)` : ""}</span>
          <span className="font-mono text-lg font-extrabold text-clinic-text">
            {fmtGs(total)}
            {installments > 1 && total > 0 && <span className="ml-2 text-xs font-bold text-clinic-muted">· {installments}× {fmtGs(Math.round(total / installments))}</span>}
          </span>
        </div>}

        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn
            disabled={items.length === 0 || !patientId || !dentistId}
            onClick={() =>
              onSave({
                id: budget?.id ?? `g_${Date.now()}`,
                clinicId: db.clinics[0].id,
                patientId, dentistId,
                createdAt: budget?.createdAt ?? new Date().toISOString(),
                status: budget?.status ?? "borrador",
                items,
                discountPct: discountPct || undefined,
                convenio: convenio || undefined,
                installments: installments > 1 ? installments : undefined,
                notes: notes || undefined,
                history: budget
                  ? [...budget.history, { at: new Date().toISOString(), action: sinMontos ? "Plan de tratamiento editado" : "Presupuesto editado", by: session!.name }]
                  : [{ at: new Date().toISOString(), action: sinMontos ? "Plan de tratamiento creado por el profesional" : "Presupuesto creado", by: session!.name }],
              })
            }
          >
            Guardar
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
