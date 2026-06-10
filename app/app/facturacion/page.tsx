"use client";
/** Módulo de Facturación (sec. 3.3): flags de estado, transiciones y validación de códigos. */
import { useMemo, useState } from "react";
import { Send, Unlock, Plus, AlertTriangle, History, Banknote, Lock, Flag } from "lucide-react";
import { useStore, fmtGs, fullName } from "@/lib/store";
import { can } from "@/lib/rbac";
import { validatePairings, canSubmit, canRelease, CPT_DX, CPT_POS, CPT_MOD } from "@/lib/billing";
import type { BillingRecord, ClaimType } from "@/lib/types";
import { Card, Btn, Modal, Field, inputCls, Badge, FlagBadge, Empty } from "@/components/ui";

type Filter = "todos" | "sin-enviar" | "en-retencion" | "facturado";

export default function BillingPage() {
  const { db, session, submitBilling, releaseBilling, toggleAch, toggleFollowUp, upsertBilling } = useStore();
  const [filter, setFilter] = useState<Filter>("todos");
  const [creating, setCreating] = useState(false);
  const [historyFor, setHistoryFor] = useState<BillingRecord | null>(null);

  if (!session) return null;
  /* Matriz v2: Enviar a Cobro / pagos = admin+asistente · Finalizar (Release) = admin+dentista */
  const allowed = can(session.role, "billing.submit");
  const canFinalize = can(session.role, "billing.finalize");

  const list = useMemo(() => {
    return db.billing.filter((b) => {
      if (filter === "sin-enviar") return !b.flags.includes("MBILLED");
      if (filter === "en-retencion") return b.flags.includes("HOLD") || b.flags.includes("MGRHOLD");
      if (filter === "facturado") return b.flags.includes("FACTURADO");
      return true;
    });
  }, [db.billing, filter]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "sin-enviar", label: "Sin enviar" },
    { key: "en-retencion", label: "En retención" },
    { key: "facturado", label: "Facturados" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-clinic-text">Facturación</h1>
          <p className="text-sm text-clinic-muted">
            Flujo: <b>Enviar a cobro</b> → MBILLED + retención (HOLD/MGRHOLD) → <b>Release from Hold</b> → FACTURADO.
          </p>
        </div>
        {allowed ? (
          <Btn onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo registro</Btn>
        ) : canFinalize ? (
          <Badge tone="info" tip="Como dentista podés finalizar facturas (Release from Hold), pero no enviar a cobro">
            <Unlock className="mr-1 inline h-3 w-3" /> Rol: finalización de facturas
          </Badge>
        ) : (
          <Badge tone="muted" tip="Permiso de Administrador/Asistente"><Lock className="mr-1 inline h-3 w-3" /> Solo lectura para tu rol</Badge>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-clinic-border bg-white p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${filter === f.key ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty title="Sin registros en este filtro" />
      ) : (
        <div className="space-y-3">
          {list.map((b) => {
            const p = db.patients.find((x) => x.id === b.patientId);
            const proc = db.procedures.find((x) => x.cpt === b.cpt);
            const issues = validatePairings(b);
            return (
              <Card key={b.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-extrabold text-clinic-text">{b.cpt}</span>
                      <span className="text-sm text-clinic-muted">{proc?.description ?? "Procedimiento"}</span>
                      {p && <a href={`/app/pacientes/${p.id}`} className="text-sm font-bold text-azure-600 hover:underline">{fullName(p)}</a>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-clinic-muted">
                      <span data-tip="Diagnóstico (DX)">DX {b.dx}</span>
                      <span data-tip="Place of Service">POS {b.pos}</span>
                      <span data-tip="Modificador">MOD {b.modifier || "—"}</span>
                      <span>{b.claimType === "electronic" ? "E-claim" : "Manual claim"}</span>
                      <span className="font-bold text-clinic-text">{fmtGs(b.amount - b.discount)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {b.flags.length === 0 ? <Badge tone="muted">SIN ENVIAR</Badge> : b.flags.map((fl) => <FlagBadge key={fl} flag={fl} />)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setHistoryFor(b)} data-tip="Ver historial de estados" className="grid h-9 w-9 place-items-center rounded-xl border border-clinic-border hover:bg-clinic-bg">
                      <History className="h-4 w-4 text-clinic-muted" />
                    </button>
                    {allowed && canSubmit(b) && (
                      <Btn
                        onClick={() => issues.length === 0 && submitBilling(b.id)}
                        disabled={issues.length > 0}
                        tip={issues.length > 0 ? "Corregí los emparejamientos antes de enviar" : "MBILLED + retención automática según tipo de reclamo"}
                      >
                        <Send className="h-3.5 w-3.5" /> Enviar a cobro
                      </Btn>
                    )}
                    {canFinalize && canRelease(b) && (
                      <Btn variant="outline" onClick={() => releaseBilling(b.id)} tip="Finalizar factura: libera la retención y completa el proceso (FACTURADO)">
                        <Unlock className="h-3.5 w-3.5" /> Release from Hold
                      </Btn>
                    )}
                    {allowed && b.flags.includes("FACTURADO") && (
                      <>
                        <Btn variant="outline" onClick={() => toggleFollowUp(b.id)} tip={b.flags.includes("SEGUIMIENTO") ? "Marcar seguimiento como completado" : "Marcar para seguimiento de pago (SEGUIMIENTO)"}>
                          <Flag className="h-3.5 w-3.5" /> {b.flags.includes("SEGUIMIENTO") ? "Seguimiento listo" : "Seguimiento"}
                        </Btn>
                        <Btn variant="outline" onClick={() => toggleAch(b.id)} tip={b.flags.includes("ACH") ? "Desactivar pago automático" : "Activar pago automático (ACH)"}>
                          <Banknote className="h-3.5 w-3.5" /> {b.flags.includes("ACH") ? "ACH activo" : "Activar ACH"}
                        </Btn>
                      </>
                    )}
                  </div>
                </div>
                {b.holdReason && (
                  <p className="mt-2.5 rounded-xl bg-state-holdbg px-3 py-2 text-xs font-semibold text-state-hold">⏸ {b.holdReason}</p>
                )}
                {issues.length > 0 && (
                  <div className="mt-2.5 space-y-1 rounded-xl bg-state-errbg px-3 py-2">
                    {issues.map((i) => (
                      <p key={i.field} className="flex items-start gap-1.5 text-xs font-semibold text-state-err">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {i.message}
                      </p>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Historial */}
      {historyFor && (
        <Modal title="Historial del reclamo" onClose={() => setHistoryFor(null)}>
          <div className="space-y-2">
            {historyFor.history.map((h, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl bg-clinic-bg p-3 text-sm">
                <span className="font-mono text-[11px] text-clinic-muted">{new Date(h.at).toLocaleString("es-PY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="flex-1 font-semibold text-clinic-text">{h.action}</span>
                <span className="text-[11px] text-clinic-muted">{h.by}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Nuevo registro */}
      {creating && (
        <NewBilling
          onClose={() => setCreating(false)}
          onSave={(b) => { upsertBilling(b); setCreating(false); }}
        />
      )}
    </div>
  );
}

function NewBilling({ onClose, onSave }: { onClose: () => void; onSave: (b: BillingRecord) => void }) {
  const { db, session } = useStore();
  const [cpt, setCpt] = useState(db.procedures[0]?.cpt ?? "D0120");
  const [patientId, setPatientId] = useState(db.patients[0]?.id ?? "");
  const [dx, setDx] = useState(CPT_DX[cpt]?.[0] ?? "");
  const [pos, setPos] = useState("11");
  const [modifier, setModifier] = useState("");
  const [claimType, setClaimType] = useState<ClaimType>("electronic");
  const [athena, setAthena] = useState(true);
  const proc = db.procedures.find((x) => x.cpt === cpt);
  const [amount, setAmount] = useState(proc?.price ?? 0);
  const [discount, setDiscount] = useState(0);

  const issues = validatePairings({ cpt, dx, pos, modifier });

  function onCptChange(next: string) {
    setCpt(next);
    const np = db.procedures.find((x) => x.cpt === next);
    if (np) setAmount(np.price);
    setDx(CPT_DX[next]?.[0] ?? "");
    setPos(CPT_POS[next]?.[0] ?? "11");
    setModifier("");
  }

  return (
    <Modal title="Nuevo registro de facturación" onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (issues.length > 0) return;
          onSave({
            id: `b_${Date.now()}`,
            clinicId: session!.clinicId,
            patientId,
            cpt, dx, pos, modifier,
            amount, discount,
            claimType,
            flags: athena ? ["ATHENA"] : [],
            history: [{ at: new Date().toISOString(), action: "Registro creado", by: session!.name }],
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paciente">
            <select className={inputCls} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              {db.patients.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
            </select>
          </Field>
          <Field label="Procedimiento (CPT/CDT)">
            <select className={inputCls} value={cpt} onChange={(e) => onCptChange(e.target.value)}>
              {db.procedures.map((p) => <option key={p.cpt} value={p.cpt}>{p.cpt} — {p.description}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="DX (diagnóstico)" hint={`Permitidos: ${(CPT_DX[cpt] ?? []).join(", ") || "libre"}`}>
            <input className={inputCls} value={dx} onChange={(e) => setDx(e.target.value.toUpperCase())} />
          </Field>
          <Field label="POS" hint={`Permitidos: ${(CPT_POS[cpt] ?? []).join(", ") || "libre"}`}>
            <input className={inputCls} value={pos} onChange={(e) => setPos(e.target.value)} />
          </Field>
          <Field label="Modificador" hint={`Permitidos: ${(CPT_MOD[cpt] ?? []).map((m) => m || "—").join(", ")}`}>
            <input className={inputCls} value={modifier} onChange={(e) => setModifier(e.target.value)} placeholder="—" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Importe (Gs)"><input type="number" min={0} className={inputCls} value={amount} onChange={(e) => setAmount(+e.target.value)} /></Field>
          <Field label="Descuento (Gs)"><input type="number" min={0} className={inputCls} value={discount} onChange={(e) => setDiscount(+e.target.value)} /></Field>
          <Field label="Tipo de reclamo" hint="E-claim → HOLD automático · Manual → MGRHOLD">
            <select className={inputCls} value={claimType} onChange={(e) => setClaimType(e.target.value as ClaimType)}>
              <option value="electronic">Electrónico (e-claim)</option>
              <option value="manual">Manual</option>
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-clinic-text">
          <input type="checkbox" checked={athena} onChange={(e) => setAthena(e.target.checked)} className="h-4 w-4 accent-azure-600" />
          Cuenta ATHENA asociada
        </label>
        {issues.length > 0 && (
          <div className="space-y-1 rounded-xl bg-state-errbg px-3 py-2">
            {issues.map((i) => (
              <p key={i.field} className="flex items-start gap-1.5 text-xs font-semibold text-state-err">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {i.message}
              </p>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn type="submit" disabled={issues.length > 0} tip={issues.length > 0 ? "El sistema valida CPT-DX, POS-CPT y Modificador-CPT antes del envío" : undefined}>
            Crear registro
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
