"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useStore, fmtGs, fullName } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import { budgetTotal, descuentoSaneado } from "@/lib/budgets";
import type { Budget, BudgetItem, Procedure } from "@/lib/types";
import { Btn, Modal, Field, inputCls } from "@/components/ui";
import { BuscadorPaciente } from "@/components/BuscadorPaciente";
import { BuscadorPrestacion } from "@/components/BuscadorPrestacion";

let itemsCreados = 0;
const idDeItem = () => `gi_${Date.now()}_${itemsCreados++}`;

/** Alta / edición de un presupuesto, que es también el plan de tratamiento.
 *  `sinMontos` (roles v3): el dentista arma el plan sin ver convenio, descuento, cuotas,
 *  precios ni total — los precios salen igual del arancel, así caja cobra lo correcto.
 *  `paciente` / `profesional` dejan fijos esos campos (se abre desde la ficha: «Nuevo plan de tratamiento»).
 *  Las prestaciones se buscan en el arancel por código o nombre (`BuscadorPrestacion`) y el paciente, por CI o nombre
 *  (`BuscadorPaciente`): con cientos o miles de opciones un `<select>` no se puede usar. */
export function BudgetForm({ budget, onClose, onSave, sinMontos = false, paciente, profesional }: {
  budget: Budget | null;
  onClose: () => void;
  onSave: (b: Budget) => void;
  sinMontos?: boolean;
  paciente?: string;
  profesional?: string;
}) {
  const { db, session } = useStore();
  const alcance = useAlcance();
  // Los profesionales que la persona ve (alcance por doctor); al editar, también el del plan aunque ya no esté activo.
  const dentists = db.users.filter((u) => u.role === "dentist" && ((u.active && alcance.veDoctor(u.id)) || u.id === budget?.dentistId));
  const convenios = db.clinics[0].config.convenios ?? [];
  const esPlan = sinMontos || !!paciente;

  const [patientId, setPatientId] = useState(budget?.patientId ?? paciente ?? "");
  const [dentistId, setDentistId] = useState(budget?.dentistId ?? profesional ?? dentists[0]?.id ?? "");
  const pacienteFijo = paciente ? db.patients.find((p) => p.id === paciente) : undefined;
  const profesionalFijo = profesional ? db.users.find((u) => u.id === profesional) : undefined;
  const [convenio, setConvenio] = useState(budget?.convenio ?? "");
  const [discountPct, setDiscountPct] = useState(budget?.discountPct ?? 0);
  const [installments, setInstallments] = useState(budget?.installments ?? 1);
  const [notes, setNotes] = useState(budget?.notes ?? "");
  const [name, setName] = useState(budget?.name ?? "");
  const [items, setItems] = useState<BudgetItem[]>(budget?.items ?? []);
  // Las secciones que ya tiene el plan, para ofrecerlas al escribir (el plan se muestra agrupado por sección).
  const secciones = [...new Set(items.map((x) => x.section?.trim()).filter((x): x is string => !!x))];

  const agregar = (p: Procedure) => setItems((xs) => [...xs, { id: idDeItem(), cpt: p.cpt, description: p.description, price: p.price, status: "pendiente" }]);
  const setItem = (i: number, patch: Partial<BudgetItem>) => setItems((xs) => xs.map((x, ix) => (ix === i ? { ...x, ...patch } : x)));

  const draft = { items, discountPct: discountPct || undefined };
  const total = budgetTotal(draft);

  return (
    <Modal title={esPlan ? (budget ? "Editar plan de tratamiento" : "Nuevo plan de tratamiento") : budget ? "Editar presupuesto" : "Nuevo presupuesto"} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {pacienteFijo ? (
            <Field label="Paciente">
              <p className="py-2 text-sm font-semibold text-clinic-text">{fullName(pacienteFijo)}</p>
            </Field>
          ) : (
            <BuscadorPaciente valor={patientId} onElegir={setPatientId} />
          )}
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
                setDiscountPct(descuentoSaneado(c?.discountPct));
              }}
            >
              <option value="">Sin convenio</option>
              {convenios.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.discountPct}%)</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Descuento %">
              <input type="number" min={0} max={100} step="any" className={inputCls} value={discountPct} onChange={(e) => setDiscountPct(descuentoSaneado(Number(e.target.value)))} />
            </Field>
            <Field label="Cuotas" hint="1 = contado">
              <input type="number" min={1} max={36} className={inputCls} value={installments} onChange={(e) => setInstallments(Number(e.target.value))} />
            </Field>
          </div>
          </>}
        </div>

        {/* prestaciones */}
        <div className="rounded-xl border border-clinic-border p-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-bold text-clinic-muted">Prestaciones</span>
            {items.length > 0 && <span className="text-xs text-clinic-muted">{items.length} en el plan</span>}
          </div>
          {db.procedures.length === 0 ? (
            <p role="status" className="rounded-xl bg-clinic-bg px-3 py-2.5 text-xs text-clinic-muted">
              Todavía no hay prestaciones cargadas en el arancel.{" "}
              {alcance.puede("practice.config")
                ? <Link href="/app/configuracion#arancel" className="font-bold text-azure-700 hover:underline">Cargalas en Configuración › Arancel de precios</Link>
                : "Pedile a la administración que las cargue en Configuración › Arancel de precios."}
            </p>
          ) : (
            <BuscadorPrestacion procs={db.procedures} onElegir={agregar} placeholder="Escribí el código o el nombre y elegila…" mostrarPrecio={!sinMontos} />
          )}
          {items.length === 0 && db.procedures.length > 0 && <p className="pt-3 text-center text-sm text-clinic-muted">Buscá y agregá al menos una prestación.</p>}
          <datalist id="secciones-del-plan">{secciones.map((x) => <option key={x} value={x} />)}</datalist>
          {items.length > 0 && (
            <ul className="mt-2 space-y-2">
              {items.map((it, i) => (
                <li key={it.id} className="rounded-lg border border-clinic-border bg-clinic-bg/40 p-2">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 break-words py-1 text-sm text-clinic-text">
                      <b className="tabular-nums text-xs text-clinic-muted">{it.cpt}</b> {it.description}
                    </p>
                    <button type="button" onClick={() => setItems((xs) => xs.filter((_, ix) => ix !== i))} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err" aria-label={`Quitar ${it.description}`} title="Quitar">
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </button>
                  </div>
                  <div className={`mt-1.5 grid gap-2 ${sinMontos ? "grid-cols-[72px_minmax(0,1fr)]" : "grid-cols-[72px_minmax(0,1fr)] sm:grid-cols-[72px_120px_minmax(0,1fr)]"}`}>
                    <input className={inputCls} placeholder="Pieza" aria-label={`Pieza de la prestación ${i + 1}`} value={it.tooth ?? ""} onChange={(e) => setItem(i, { tooth: e.target.value || undefined })} title="Pieza FDI (opcional)" />
                    {!sinMontos && <input type="number" min={0} aria-label={`Precio de la prestación ${i + 1}`} className={inputCls} value={it.price} onChange={(e) => setItem(i, { price: Number(e.target.value) })} />}
                    <input
                      className={`${inputCls} ${sinMontos ? "" : "col-span-2 sm:col-span-1"}`}
                      placeholder="Sección (opcional): Fase 1, Arcada superior…"
                      aria-label={`Sección de la prestación ${i + 1}`}
                      list="secciones-del-plan"
                      maxLength={60}
                      value={it.section ?? ""}
                      onChange={(e) => setItem(i, { section: e.target.value || undefined })}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Field label="Nombre del plan (opcional)" hint="Se ve en la lista de planes. Ej.: Ortodoncia fija, Rehabilitación superior.">
          <input className={inputCls} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="Notas">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {!sinMontos && <div className="flex items-center justify-between rounded-xl bg-clinic-bg px-4 py-3">
          <span className="text-sm font-bold text-clinic-text">Total {discountPct ? `(− ${discountPct}%)` : ""}</span>
          <span className="tabular-nums text-lg font-bold text-clinic-text">
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
                // Se parte del presupuesto original: el formulario no muestra todos sus datos (nombre del plan, vencimiento, cuotas, financiamiento,
                // seguimiento, estética facial…) y armarlo de cero los borraba al guardar.
                ...(budget ?? {}),
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
                name: name.trim() || undefined,
                history: budget
                  ? [...budget.history, { at: new Date().toISOString(), action: esPlan ? "Plan de tratamiento editado" : "Presupuesto editado", by: session!.name }]
                  : [{ at: new Date().toISOString(), action: sinMontos ? "Plan de tratamiento creado por el profesional" : esPlan ? "Plan de tratamiento creado" : "Presupuesto creado", by: session!.name }],
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
