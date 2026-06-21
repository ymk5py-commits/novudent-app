"use client";
/** Presupuestos (planes de tratamiento): borrador → presentado → aceptado → completado.
 *  Convenios con descuento, cobro en cuotas, ejecución por ítem y impresión. */
import { useMemo, useState } from "react";
import {
  Plus, ShieldAlert, Printer, Check, X, Send, CircleCheck, Trash2, Pencil, FileText, Handshake,
} from "lucide-react";
import { useStore, fmtGs, fmtDate, fullName } from "@/lib/store";
import { botikaEnabled, makeOutboxTask, botikaMessage } from "@/lib/botika";
import { can } from "@/lib/rbac";
import { budgetTotal, budgetSubtotal, budgetPaid, budgetBalance, installmentValue, BUDGET_STATUS_INFO } from "@/lib/budgets";
import type { Budget, BudgetItem, BudgetStatus } from "@/lib/types";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

const FILTERS: ("todos" | BudgetStatus)[] = ["todos", "borrador", "presentado", "aceptado", "completado", "anulado"];

export default function BudgetsPage() {
  const store = useStore();
  const { db, session } = store;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("todos");
  const [editing, setEditing] = useState<Budget | "new" | null>(null);
  const [detail, setDetail] = useState<Budget | null>(null);

  if (!session) return null;
  const allowed = can(session.role, "budgets.manage");
  if (!allowed) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-lg font-extrabold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">Tu rol no tiene permiso para gestionar presupuestos.</p>
      </Card>
    );
  }

  const by = session.name;
  const list = db.budgets
    .filter((b) => filter === "todos" || b.status === filter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const liveDetail = detail ? db.budgets.find((b) => b.id === detail.id) ?? null : null;

  const act = (b: Budget, action: string, next: Partial<Budget>) =>
    store.upsertBudget({ ...b, ...next, history: [...b.history, { at: new Date().toISOString(), action, by }] });

  const NEGOCIACION_TONE: Record<string, "ok" | "info" | "muted" | "warn"> = {
    listo_para_cerrar: "ok",
    en_curso: "info",
    sin_respuesta: "muted",
    rechazado: "warn",
  };
  const NEGOCIACION_LABEL: Record<string, string> = {
    listo_para_cerrar: "Listo para cerrar",
    en_curso: "Negociando",
    sin_respuesta: "Sin respuesta",
    rechazado: "Rechazado",
  };

  return (
    <div className="space-y-5">
      <Reveal className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-clinic-text">Presupuestos</h1>
          <p className="text-sm text-clinic-muted">Planes de tratamiento, convenios y cobro en cuotas.</p>
        </div>
        <Btn onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Nuevo presupuesto</Btn>
      </Reveal>

      {/* filtros por estado */}
      <Reveal className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const n = f === "todos" ? db.budgets.length : db.budgets.filter((b) => b.status === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold capitalize transition-colors ${
                filter === f ? "bg-azure-600 text-white" : "bg-white text-clinic-muted border border-clinic-border hover:text-clinic-text"
              }`}
            >
              {f} <span className="opacity-70">({n})</span>
            </button>
          );
        })}
      </Reveal>

      {list.length === 0 ? (
        <Empty title="Sin presupuestos en este estado" desc="Creá un presupuesto desde el botón superior o desde la ficha del paciente." />
      ) : (
        <Stagger className="grid gap-4 lg:grid-cols-2">
          {list.map((b) => {
            const patient = db.patients.find((p) => p.id === b.patientId);
            const dentist = db.users.find((u) => u.id === b.dentistId);
            const info = BUDGET_STATUS_INFO[b.status];
            const total = budgetTotal(b);
            const paid = budgetPaid(b.id, db.payments);
            const done = b.items.filter((i) => i.status === "realizado").length;
            const cuota = installmentValue(b);
            return (
              <StaggerItem key={b.id} className="h-full">
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button onClick={() => setDetail(b)} className="block truncate text-left text-[15px] font-extrabold text-clinic-text hover:text-azure-700">
                      {patient ? fullName(patient) : "—"}
                    </button>
                    <div className="mt-0.5 text-xs text-clinic-muted">
                      {fmtDate(b.createdAt)} · {dentist?.name ?? "—"} · {b.items.length} ítem{b.items.length !== 1 && "s"}
                      {b.convenio && <> · convenio <b>{b.convenio}</b></>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={info.tone} tip={info.desc}>{info.label}</Badge>
                    {b.negociacion && (
                      <Badge tone={NEGOCIACION_TONE[b.negociacion.status] ?? "muted"}>
                        {NEGOCIACION_LABEL[b.negociacion.status] ?? b.negociacion.status}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <div className="font-mono text-lg font-extrabold text-clinic-text">{fmtGs(total)}</div>
                    <div className="text-[11px] text-clinic-muted">
                      {b.discountPct ? <>desc. {b.discountPct}% · </> : null}
                      {cuota ? <>{b.installments} cuotas de <b className="font-mono">{fmtGs(cuota)}</b> · </> : null}
                      {(b.status === "aceptado" || b.status === "completado") && (
                        <>pagado <b className="font-mono text-state-ok">{fmtGs(paid)}</b>{total - paid > 0 && <> · saldo <b className="font-mono text-state-err">{fmtGs(total - paid)}</b></>}</>
                      )}
                    </div>
                  </div>
                  {b.status === "aceptado" && (
                    <span className="font-mono text-[10.5px] font-bold uppercase tracking-wide text-clinic-muted">{done}/{b.items.length} realizados</span>
                  )}
                </div>

                <div className="mt-auto flex flex-wrap gap-2 border-t border-clinic-border pt-3">
                  {b.status === "borrador" && (
                    <>
                      <Btn onClick={() => act(b, "Presentado al paciente", { status: "presentado" })}><Send className="h-3.5 w-3.5" /> Presentar</Btn>
                      <Btn variant="outline" onClick={() => setEditing(b)}><Pencil className="h-3.5 w-3.5" /> Editar</Btn>
                    </>
                  )}
                  {b.status === "presentado" && (
                    <Btn onClick={() => act(b, "Aceptado por el paciente", { status: "aceptado" })}><Check className="h-3.5 w-3.5" /> Marcar aceptado</Btn>
                  )}
                  {b.status === "presentado" && b.negociacion?.status === "listo_para_cerrar" && allowed && (
                    <Btn onClick={() => store.confirmNegociacion(b.id, by)}>
                      <Handshake className="h-3.5 w-3.5" /> Confirmar y aceptar
                    </Btn>
                  )}
                  {b.status === "aceptado" && done === b.items.length && (
                    <Btn
                      onClick={() => {
                        act(b, "Todos los procedimientos realizados — completado", { status: "completado" });
                        /* Botika: tratamiento completado → encuesta NPS automática */
                        if (patient?.phone && botikaEnabled(db, "nps")) {
                          store.addOutboxTask(
                            makeOutboxTask({
                              db, type: "nps", patient, refId: b.id, by: session.name,
                              message: botikaMessage(db, "nps", { paciente: patient.firstName, clinica: db.clinics[0].name }),
                            })
                          );
                        }
                      }}
                    >
                      <CircleCheck className="h-3.5 w-3.5" /> Completar
                    </Btn>
                  )}
                  <Btn variant="outline" onClick={() => setDetail(b)}><FileText className="h-3.5 w-3.5" /> Detalle</Btn>
                  {(b.status === "borrador" || b.status === "presentado") && (
                    <Btn variant="danger" onClick={() => act(b, "Presupuesto anulado", { status: "anulado" })}><X className="h-3.5 w-3.5" /> Anular</Btn>
                  )}
                </div>
              </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}

      {editing && (
        <BudgetForm
          budget={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(b) => { store.upsertBudget(b); setEditing(null); }}
        />
      )}
      {liveDetail && <BudgetDetail budget={liveDetail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/* ===== Detalle + impresión ===== */
function BudgetDetail({ budget: b, onClose }: { budget: Budget; onClose: () => void }) {
  const store = useStore();
  const { db, session } = store;
  const patient = db.patients.find((p) => p.id === b.patientId);
  const dentist = db.users.find((u) => u.id === b.dentistId);
  const clinic = db.clinics[0];
  const info = BUDGET_STATUS_INFO[b.status];
  const total = budgetTotal(b);
  const paid = budgetPaid(b.id, db.payments);
  const cuota = installmentValue(b);
  const canExec = session && can(session.role, "emr.write"); // realizar ítems: admin + dentista
  const linkedPayments = db.payments.filter((p) => p.budgetId === b.id);

  const toggleItem = (it: BudgetItem) => {
    const items = b.items.map((x) =>
      x.id === it.id
        ? x.status === "realizado"
          ? { ...x, status: "pendiente" as const, doneAt: undefined, doneBy: undefined }
          : { ...x, status: "realizado" as const, doneAt: new Date().toISOString(), doneBy: session!.name }
        : x
    );
    store.upsertBudget({
      ...b, items,
      history: [...b.history, { at: new Date().toISOString(), action: `${it.description}${it.tooth ? ` (pieza ${it.tooth})` : ""}: ${it.status === "realizado" ? "desmarcado" : "realizado"}`, by: session!.name }],
    });
  };

  return (
    <Modal title="Presupuesto" onClose={onClose} wide>
      <div className="print-area space-y-5">
        {/* encabezado imprimible */}
        <div className="flex items-start justify-between gap-4">
          <div>
            {clinic.config.logo ? <img src={clinic.config.logo} alt="Logo" className="h-10 w-auto max-w-[160px] object-contain" /> : <div className="font-logo text-lg tracking-[0.16em] text-navy-800">NOVUdent</div>}
            <div className="text-xs text-clinic-muted">{clinic.name} · {clinic.config.address} · {clinic.config.phone}</div>
          </div>
          <Badge tone={info.tone}>{info.label}</Badge>
        </div>
        <div className="grid gap-3 rounded-xl bg-clinic-bg p-4 text-sm sm:grid-cols-2">
          <div><span className="text-clinic-muted">Paciente:</span> <b>{patient ? fullName(patient) : "—"}</b> {patient && <span className="text-clinic-muted">· CI {patient.document}</span>}</div>
          <div><span className="text-clinic-muted">Profesional:</span> <b>{dentist?.name ?? "—"}</b></div>
          <div><span className="text-clinic-muted">Fecha:</span> {fmtDate(b.createdAt)}</div>
          {b.convenio && <div><span className="text-clinic-muted">Convenio:</span> <b>{b.convenio}</b> ({b.discountPct}% desc.)</div>}
        </div>

        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
              <th className="py-2">Procedimiento</th>
              <th className="py-2">Pieza</th>
              <th className="py-2 text-right">Precio</th>
              <th className="py-2 text-right print:hidden">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-clinic-border">
            {b.items.map((it) => (
              <tr key={it.id}>
                <td className="py-2.5 font-semibold text-clinic-text">{it.description} <span className="font-mono text-[10px] text-clinic-muted">{it.cpt}</span></td>
                <td className="py-2.5 font-mono text-xs">{it.tooth ?? "—"}</td>
                <td className="py-2.5 text-right font-mono text-xs font-bold">{fmtGs(it.price)}</td>
                <td className="py-2.5 text-right print:hidden">
                  {b.status === "aceptado" || b.status === "completado" ? (
                    canExec ? (
                      <button
                        onClick={() => toggleItem(it)}
                        className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide transition-colors ${
                          it.status === "realizado" ? "bg-state-okbg text-state-ok" : "bg-clinic-bg text-clinic-muted hover:bg-state-infobg hover:text-state-info"
                        }`}
                        title={it.status === "realizado" ? `Realizado ${it.doneAt ? fmtDate(it.doneAt) : ""} por ${it.doneBy ?? ""} — click para desmarcar` : "Marcar como realizado"}
                      >
                        {it.status === "realizado" ? "✓ realizado" : "pendiente"}
                      </button>
                    ) : (
                      <Badge tone={it.status === "realizado" ? "ok" : "muted"}>{it.status}</Badge>
                    )
                  ) : (
                    <span className="text-xs text-clinic-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="space-y-1 rounded-xl border border-clinic-border p-4 text-sm">
          <div className="flex justify-between text-clinic-muted"><span>Subtotal</span><span className="font-mono">{fmtGs(budgetSubtotal(b))}</span></div>
          {b.discountPct ? (
            <div className="flex justify-between text-clinic-muted"><span>Descuento {b.discountPct}%{b.convenio ? ` (${b.convenio})` : ""}</span><span className="font-mono">− {fmtGs(budgetSubtotal(b) - total)}</span></div>
          ) : null}
          <div className="flex justify-between border-t border-clinic-border pt-2 text-base font-extrabold text-clinic-text"><span>Total</span><span className="font-mono">{fmtGs(total)}</span></div>
          {cuota && <div className="flex justify-between text-clinic-muted"><span>{b.installments} cuotas de</span><span className="font-mono font-bold">{fmtGs(cuota)}</span></div>}
          {(b.status === "aceptado" || b.status === "completado") && (
            <>
              <div className="flex justify-between text-state-ok"><span>Pagado</span><span className="font-mono font-bold">{fmtGs(paid)}</span></div>
              <div className={`flex justify-between font-bold ${total - paid > 0 ? "text-state-err" : "text-state-ok"}`}><span>Saldo</span><span className="font-mono">{fmtGs(Math.max(0, total - paid))}</span></div>
            </>
          )}
        </div>

        {b.notes && <p className="rounded-xl bg-clinic-bg p-3 text-xs text-clinic-muted">{b.notes}</p>}

        {linkedPayments.length > 0 && (
          <div className="print:hidden">
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-clinic-muted">Pagos asociados</h4>
            <ul className="mt-2 space-y-1 text-sm">
              {linkedPayments.map((p) => (
                <li key={p.id} className="flex justify-between rounded-lg bg-clinic-bg px-3 py-1.5">
                  <span>{fmtDate(p.date)} · {p.concept}</span>
                  <span className="font-mono font-bold text-state-ok">{fmtGs(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="print:hidden">
          <h4 className="text-xs font-extrabold uppercase tracking-wide text-clinic-muted">Historial</h4>
          <ul className="mt-2 space-y-1">
            {[...b.history].reverse().map((h, i) => (
              <li key={i} className="text-xs text-clinic-muted"><span className="font-mono">{fmtDate(h.at)}</span> — {h.action} · <i>{h.by}</i></li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-2 print:hidden">
          <Btn variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir / PDF</Btn>
          <Btn onClick={onClose}>Cerrar</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ===== Alta / edición ===== */
function BudgetForm({ budget, onClose, onSave }: { budget: Budget | null; onClose: () => void; onSave: (b: Budget) => void }) {
  const { db, session } = useStore();
  const dentists = db.users.filter((u) => u.role === "dentist" && u.active);
  const convenios = db.clinics[0].config.convenios ?? [];

  const [patientId, setPatientId] = useState(budget?.patientId ?? db.patients[0]?.id ?? "");
  const [dentistId, setDentistId] = useState(budget?.dentistId ?? dentists[0]?.id ?? "");
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
    <Modal title={budget ? "Editar presupuesto" : "Nuevo presupuesto"} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paciente">
            <select className={inputCls} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              {db.patients.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
            </select>
          </Field>
          <Field label="Profesional">
            <select className={inputCls} value={dentistId} onChange={(e) => setDentistId(e.target.value)}>
              {dentists.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
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
              <div key={it.id} className="grid grid-cols-[1fr_72px_120px_32px] items-center gap-2">
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
                <input type="number" className={inputCls} value={it.price} onChange={(e) => setItem(i, { price: Number(e.target.value) })} />
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

        <div className="flex items-center justify-between rounded-xl bg-clinic-bg px-4 py-3">
          <span className="text-sm font-bold text-clinic-text">Total {discountPct ? `(− ${discountPct}%)` : ""}</span>
          <span className="font-mono text-lg font-extrabold text-clinic-text">
            {fmtGs(total)}
            {installments > 1 && total > 0 && <span className="ml-2 text-xs font-bold text-clinic-muted">· {installments}× {fmtGs(Math.round(total / installments))}</span>}
          </span>
        </div>

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
                  ? [...budget.history, { at: new Date().toISOString(), action: "Presupuesto editado", by: session!.name }]
                  : [{ at: new Date().toISOString(), action: "Presupuesto creado", by: session!.name }],
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
