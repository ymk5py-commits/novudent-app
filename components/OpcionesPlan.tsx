"use client";
/** «Opciones ▾» del plan de tratamiento (paridad Dentalink): financiamiento por crédito,
 *  recaudar el plan, enviar el presupuesto por e-mail (con historial de envíos), cambiar el
 *  profesional a cargo, duplicar y finalizar o reabrir. La lógica vive en lib/planOpciones y
 *  lib/financiamiento; acá solo se arman los formularios y se guarda. */
import { useMemo, useRef, useState } from "react";
import { ChevronDown, Landmark, Wallet, Mail, UserRound, Copy, CheckCircle2, RotateCcw, AlertCircle, Trash2 } from "lucide-react";
import { useStore, fmtGs, fmtDate, fullName } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import { budgetBalance, budgetPaid } from "@/lib/budgets";
import { PERIODICIDAD_LABEL, aplicarFinanciamiento, quitarFinanciamiento, saldoAFinanciar, simularFinanciamiento, vencimientoCuota, type Periodicidad } from "@/lib/financiamiento";
import { MODO_ENVIO_LABEL, cambiarProfesional, duplicarPlan, enviosDe, finalizarPlan, pendientesDe, presupuestoHtml, reabrirPlan, registrarEnvio, type ModoEnvio } from "@/lib/planOpciones";
import type { Budget, Patient } from "@/lib/types";
import { fechaLocal } from "@/lib/tareas";
import { Btn, Field, Modal, inputCls } from "@/components/ui";
import { Desplegable, ItemMenu } from "@/components/Desplegable";
import { EmailButton } from "@/components/EmailButton";

type Ventana = null | "financiamiento" | "envio" | "profesional";

/** Hoy en la hora de la clínica (no UTC: de 21 a 24 h en Paraguay ya sería mañana). */
const hoyISO = () => fechaLocal();
/** Montos: «150.000» o «150000» → 150000. */
const monto = (s: string) => { const n = Number(String(s).replace(/\./g, "").replace(",", ".").trim()); return Number.isFinite(n) && n > 0 ? n : 0; };
/** Porcentajes: «1,5» o «1.5» → 1.5. */
const pct = (s: string) => { const n = Number(String(s).replace(",", ".").trim()); return Number.isFinite(n) && n > 0 ? n : 0; };

export function OpcionesPlan({ budget, patient, onSelect, onRecaudar }: {
  budget: Budget;
  patient: Patient;
  /** Abre otro plan (el duplicado). */
  onSelect: (id: string) => void;
  /** Lleva a «Recibir pago» con este plan cargado. */
  onRecaudar?: (budgetId: string) => void;
}) {
  const { db, session, upsertBudget } = useStore();
  const alcance = useAlcance();
  const ref = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [ventana, setVentana] = useState<Ventana>(null);

  if (!session) return null;
  const ctx = () => ({ now: new Date().toISOString(), by: session.name });
  const saldo = budgetBalance(budget, db.payments);

  const puedeFinanciar = alcance.puede("budgets.manage") && budget.status !== "anulado";
  const puedeRecaudar = !!onRecaudar && alcance.puede("payments.manage") && saldo > 0;
  const puedeEnviar = alcance.puede("money.view") && alcance.puede("patients.personal");
  const puedeProfesional = alcance.puede("budgets.manage");
  const puedeDuplicar = alcance.puede("plans.create") || alcance.puede("budgets.manage");
  const puedeEstado = alcance.puede("budgets.manage") || alcance.puede("emr.write");
  const puedeFinalizar = puedeEstado && budget.status === "aceptado";
  const puedeReabrir = puedeEstado && budget.status === "completado";
  if (!(puedeFinanciar || puedeRecaudar || puedeEnviar || puedeProfesional || puedeDuplicar || puedeFinalizar || puedeReabrir)) return null;

  const abrir = (v: Ventana) => { setAbierto(false); setVentana(v); };
  const duplicar = () => {
    setAbierto(false);
    const copia = duplicarPlan(budget, { id: `g_${Date.now()}`, ...ctx() });
    upsertBudget(copia);
    onSelect(copia.id);
  };
  const finalizar = () => {
    setAbierto(false);
    const p = pendientesDe(budget);
    if (p > 0 && !window.confirm(`Quedan ${p} prestación${p === 1 ? "" : "es"} sin realizar. ¿Finalizar el plan igual?`)) return;
    upsertBudget(finalizarPlan(budget, ctx()));
  };
  const reabrir = () => { setAbierto(false); upsertBudget(reabrirPlan(budget, ctx())); };

  return (
    <>
      <button
        ref={ref} type="button" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}
        className="inline-flex items-center gap-1.5 rounded border border-clinic-border bg-white px-3 py-1.5 text-[13px] font-semibold text-clinic-text transition-colors hover:border-azure-300 hover:text-azure-700"
      >
        Opciones <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      <Desplegable ancla={ref} abierto={abierto} onCerrar={() => setAbierto(false)} ancho={260} alinear="derecha" etiqueta="Opciones del plan">
        {puedeFinanciar && <ItemMenu onClick={() => abrir("financiamiento")}><Landmark className="h-4 w-4 text-azure-600" /> Financiamiento{budget.financiamiento ? " (ver o cambiar)" : ""}</ItemMenu>}
        {puedeRecaudar && <ItemMenu onClick={() => { setAbierto(false); onRecaudar!(budget.id); }}><Wallet className="h-4 w-4 text-azure-600" /> Recaudar este tratamiento</ItemMenu>}
        {puedeEnviar && <ItemMenu onClick={() => abrir("envio")}><Mail className="h-4 w-4 text-azure-600" /> Enviar presupuesto por e-mail</ItemMenu>}
        {puedeProfesional && <ItemMenu onClick={() => abrir("profesional")}><UserRound className="h-4 w-4 text-azure-600" /> Cambiar profesional a cargo</ItemMenu>}
        {(puedeDuplicar || puedeFinalizar || puedeReabrir) && <div className="my-1 border-t border-clinic-border" />}
        {puedeDuplicar && <ItemMenu onClick={duplicar}><Copy className="h-4 w-4 text-azure-600" /> Duplicar plan de tratamiento</ItemMenu>}
        {puedeFinalizar && <ItemMenu onClick={finalizar}><CheckCircle2 className="h-4 w-4 text-state-ok" /> Finalizar plan</ItemMenu>}
        {puedeReabrir && <ItemMenu onClick={reabrir}><RotateCcw className="h-4 w-4 text-azure-600" /> Reabrir plan</ItemMenu>}
      </Desplegable>

      {ventana === "financiamiento" && <FinanciamientoModal budget={budget} onClose={() => setVentana(null)} />}
      {ventana === "envio" && <EnvioModal budget={budget} patient={patient} onClose={() => setVentana(null)} />}
      {ventana === "profesional" && <ProfesionalModal budget={budget} onClose={() => setVentana(null)} />}
    </>
  );
}

/* ---------- Financiamiento por crédito ---------- */
function FinanciamientoModal({ budget, onClose }: { budget: Budget; onClose: () => void }) {
  const { db, session, upsertBudget } = useStore();
  const hoy = hoyISO();
  const f = budget.financiamiento;
  const [pie, setPie] = useState(f ? String(f.pie || "") : "");
  const [cuotas, setCuotas] = useState(String(f?.cuotas ?? 6));
  const [interes, setInteres] = useState(f ? String(f.interesMensualPct || "") : "");
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>(f?.periodicidad ?? "mensual");
  const [primera, setPrimera] = useState(() => vencimientoCuota(hoy, 1, "mensual"));

  const porFinanciar = saldoAFinanciar(budget, db.payments);
  const pagado = budgetPaid(budget.id, db.payments);
  const sim = useMemo(
    () => simularFinanciamiento({ porFinanciar, pie: monto(pie), cuotas: Number(cuotas), interesMensualPct: pct(interes), primeraCuota: primera, periodicidad, hoy }),
    [porFinanciar, pie, cuotas, interes, primera, periodicidad, hoy],
  );
  const cuotasActuales = budget.schedule?.length ?? 0;

  const generar = () => {
    if (!session || sim.error) return;
    upsertBudget(aplicarFinanciamiento(budget, sim, { cuotas: Number(cuotas), interesMensualPct: pct(interes), periodicidad }, { payments: db.payments, now: new Date().toISOString(), by: session.name, fmt: fmtGs }));
    onClose();
  };
  const quitar = () => {
    if (!session || !window.confirm("¿Quitar el financiamiento? Se borran las cuotas y el interés. Los pagos hechos quedan.")) return;
    upsertBudget(quitarFinanciamiento(budget, { now: new Date().toISOString(), by: session.name }));
    onClose();
  };

  return (
    <Modal title="Financiamiento por crédito" onClose={onClose} wide>
      <div className="space-y-4 text-[13px]">
        <div className="grid gap-2 rounded border border-clinic-border bg-clinic-bg/50 p-3 sm:grid-cols-2">
          <div className="flex justify-between gap-2"><span className="text-clinic-muted">Por financiar</span><b className="tabular-nums">{fmtGs(porFinanciar)}</b></div>
          {pagado > 0 && <div className="flex justify-between gap-2"><span className="text-clinic-muted">Ya pagado (no entra en las cuotas)</span><b className="tabular-nums">{fmtGs(pagado)}</b></div>}
        </div>
        {cuotasActuales > 0 && (
          <div className="flex items-start gap-2 rounded bg-state-warnbg px-3 py-2 text-state-warn">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Este plan ya tiene {cuotasActuales} cuota{cuotasActuales === 1 ? "" : "s"}{f ? ` (generadas el ${fmtDate(f.generadoAt)} por ${f.generadoBy})` : ""}. Generar de nuevo reemplaza el plan de cuotas y recalcula el interés sobre el saldo actual.</span>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Pie (pago inicial)"><input inputMode="decimal" className={`${inputCls} text-right tabular-nums`} value={pie} onChange={(e) => setPie(e.target.value)} placeholder="0" /></Field>
          <Field label="Cuotas"><input type="number" min={1} max={60} className={`${inputCls} text-right tabular-nums`} value={cuotas} onChange={(e) => setCuotas(e.target.value)} /></Field>
          <Field label="Interés mensual (%)"><input inputMode="decimal" className={`${inputCls} text-right tabular-nums`} value={interes} onChange={(e) => setInteres(e.target.value)} placeholder="0" /></Field>
          <Field label="Fecha de la primera cuota"><input type="date" className={inputCls} value={primera} onChange={(e) => setPrimera(e.target.value)} /></Field>
          <Field label="Periodicidad">
            <select className={inputCls} value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value as Periodicidad)}>
              {(Object.keys(PERIODICIDAD_LABEL) as Periodicidad[]).map((p) => <option key={p} value={p}>{PERIODICIDAD_LABEL[p]}</option>)}
            </select>
          </Field>
        </div>

        {sim.error ? (
          <div role="alert" className="flex items-center gap-2 rounded bg-state-errbg px-3 py-2 font-semibold text-state-err"><AlertCircle className="h-4 w-4 shrink-0" /> {sim.error}</div>
        ) : (
          <div className="space-y-2">
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <Linea label="Monto financiado" valor={fmtGs(sim.montoFinanciado)} />
              <Linea label="Interés" valor={fmtGs(sim.interes)} />
              <Linea label={`${Number(cuotas)} cuota${Number(cuotas) === 1 ? "" : "s"} de`} valor={fmtGs(sim.valorCuota)} fuerte />
              <Linea label="Total en cuotas" valor={fmtGs(sim.totalCuotas)} />
            </div>
            <div className="max-h-56 overflow-y-auto rounded border border-clinic-border">
              <table className="w-full">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-clinic-border text-left text-[13px] font-bold text-clinic-text">
                    <th className="px-3 py-1.5">Cuota</th><th className="px-3 py-1.5">Vencimiento</th><th className="px-3 py-1.5 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-clinic-border">
                  {sim.schedule.map((c) => (
                    <tr key={c.numero}>
                      <td className="px-3 py-1.5 text-clinic-muted">{c.numero === 0 ? "Pie" : `#${c.numero}`}</td>
                      <td className="px-3 py-1.5 text-clinic-muted">{fmtDate(c.dueDate)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtGs(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sim.interes > 0 && <p className="text-xs text-clinic-muted">El interés se suma al total del plan, sin descuento. Las cuotas se cobran desde «Recibir pago».</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-clinic-border pt-3">
          {cuotasActuales > 0 ? <Btn variant="danger" onClick={quitar}><Trash2 className="h-4 w-4" /> Quitar financiamiento</Btn> : <span />}
          <div className="flex gap-2">
            <Btn variant="outline" onClick={onClose}>Cerrar</Btn>
            <Btn disabled={!!sim.error} onClick={generar}><Landmark className="h-4 w-4" /> Generar plan de cuotas</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Linea({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="text-clinic-muted">{label}</span>
      <span className="mb-1 flex-1 self-end border-b border-dotted border-clinic-border" />
      <span className={`tabular-nums ${fuerte ? "font-bold text-azure-700" : "font-semibold text-clinic-text"}`}>{valor}</span>
    </div>
  );
}

/* ---------- Enviar el presupuesto por e-mail ---------- */
function EnvioModal({ budget, patient, onClose }: { budget: Budget; patient: Patient; onClose: () => void }) {
  const { db, session, upsertBudget } = useStore();
  const [modo, setModo] = useState<ModoEnvio>("completo");
  const clinica = db.clinics[0]?.name ?? "";
  const profesional = db.users.find((u) => u.id === budget.dentistId)?.name ?? "";
  const html = presupuestoHtml(budget, modo, { clinica, paciente: patient.firstName, profesional, fmt: fmtGs });
  const asunto = `${budget.name?.trim() || "Presupuesto"} — ${clinica}`;
  const envios = enviosDe(budget);

  const registrar = () => {
    if (!session || !patient.email) return;
    upsertBudget(registrarEnvio(budget, modo, patient.email, { now: new Date().toISOString(), by: session.name }));
  };

  return (
    <Modal title="Enviar presupuesto por e-mail" onClose={onClose} wide>
      <div className="space-y-4 text-[13px]">
        <div className="flex flex-wrap gap-x-5 gap-y-2" role="radiogroup" aria-label="Qué se envía">
          {(Object.keys(MODO_ENVIO_LABEL) as ModoEnvio[]).map((m) => (
            <label key={m} className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="modo-envio" checked={modo === m} onChange={() => setModo(m)} className="accent-azure-600" /> {MODO_ENVIO_LABEL[m]}
            </label>
          ))}
        </div>
        <div className="text-clinic-muted">Para: {patient.email ? <b className="text-clinic-text">{fullName(patient)} &lt;{patient.email}&gt;</b> : <span className="font-semibold text-state-err">el paciente no tiene e-mail cargado (Datos personales).</span>}</div>
        <div className="max-h-72 overflow-y-auto rounded border border-clinic-border bg-white p-4" aria-label="Vista previa del correo">
          {/* El HTML se arma con escapeHtml en lib/planOpciones: no entra texto sin escapar. */}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        <div className="flex justify-end">
          <EmailButton key={modo} to={patient.email} subject={asunto} html={html} label="Enviar" onSent={registrar} />
        </div>

        <div className="border-t border-clinic-border pt-3">
          <div className="mb-1 font-bold text-clinic-text">Historial de envíos</div>
          {envios.length === 0 ? <p className="text-clinic-muted">Todavía no se envió este presupuesto.</p> : (
            <ul className="space-y-1">
              {envios.map((e, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 text-clinic-muted">
                  <span>{e.detalle}</span>
                  <span>{fmtDate(e.at)} · {e.by}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Cambiar el profesional a cargo ---------- */
function ProfesionalModal({ budget, onClose }: { budget: Budget; onClose: () => void }) {
  const { db, session, upsertBudget } = useStore();
  const dentistas = db.users.filter((u) => u.role === "dentist" && u.active !== false);
  const [elegido, setElegido] = useState(budget.dentistId);
  const nombre = (id: string) => db.users.find((u) => u.id === id)?.name ?? "—";

  const guardar = () => {
    if (!session) return;
    upsertBudget(cambiarProfesional(budget, elegido, { antes: nombre(budget.dentistId), despues: nombre(elegido) }, { now: new Date().toISOString(), by: session.name }));
    onClose();
  };

  return (
    <Modal title="Cambiar profesional a cargo" onClose={onClose}>
      <div className="space-y-4 text-[13px]">
        <p className="text-clinic-muted">El plan queda a cargo del profesional nuevo y pasa a verse en su ficha. Las citas ya dadas y las liquidaciones (que salen de las citas) no cambian.</p>
        <Field label="Profesional">
          <select className={inputCls} value={elegido} onChange={(e) => setElegido(e.target.value)}>
            {dentistas.map((d) => <option key={d.id} value={d.id}>{d.name}{d.specialty ? ` · ${d.specialty}` : ""}</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn disabled={elegido === budget.dentistId} onClick={guardar}>Guardar</Btn>
        </div>
      </div>
    </Modal>
  );
}
