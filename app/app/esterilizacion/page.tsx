"use client";
/** Esterilización — registro y control de ciclos de esterilización de instrumental
 *  (cumplimiento regulatorio, spec Dentalink 8.7). Bitácora con indicadores
 *  químico/biológico, método, lote y responsable. */
import { useMemo, useState } from "react";
import { useStore, fmtDate } from "@/lib/store";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { ShieldCheck, Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import type { SterilizationCycle } from "@/lib/types";

const METHOD_LABEL: Record<SterilizationCycle["method"], string> = {
  autoclave: "Autoclave (vapor)",
  calor_seco: "Calor seco",
  quimico: "Químico",
};
const IND_LABEL: Record<string, string> = { ok: "Conforme", fail: "No conforme", pendiente: "Pendiente" };

function indTone(v?: string): "ok" | "err" | "warn" | "muted" {
  return v === "ok" ? "ok" : v === "fail" ? "err" : v === "pendiente" ? "warn" : "muted";
}

export default function EsterilizacionPage() {
  const { db, addSterilizationCycle, updateSterilizationCycle, deleteSterilizationCycle } = useStore();
  const ym = new Date().toISOString().slice(0, 7);
  const [mes, setMes] = useState(ym);
  const [editing, setEditing] = useState<SterilizationCycle | null>(null);
  const [showForm, setShowForm] = useState(false);

  const userName = (id?: string) => db.users.find((u) => u.id === id)?.name ?? "—";

  const list = useMemo(
    () => db.sterilizationCycles
      .filter((c) => c.date.slice(0, 7) === mes)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [db.sterilizationCycles, mes],
  );
  const pendientesBio = db.sterilizationCycles.filter((c) => c.biologicalIndicator === "pendiente").length;
  const fallas = db.sterilizationCycles.filter((c) => c.chemicalIndicator === "fail" || c.biologicalIndicator === "fail").length;
  const ultimo = [...db.sterilizationCycles].sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <Reveal className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-azure-50 text-azure-600"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <h1 className="text-lg font-extrabold text-clinic-text">Esterilización</h1>
            <p className="text-[11px] text-clinic-muted">Bitácora de ciclos e indicadores de control (cumplimiento).</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={`${inputCls} w-auto`} />
          <Btn onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Nuevo ciclo</Btn>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Último ciclo</div>
          <div className="mt-1 text-sm font-bold text-clinic-text">{ultimo ? `${fmtDate(ultimo.date)} · ${METHOD_LABEL[ultimo.method]}` : "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Indicadores biológicos pendientes</div>
          <div className={`mt-1 text-2xl font-extrabold ${pendientesBio > 0 ? "text-state-warn" : "text-state-ok"}`}>{pendientesBio}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Ciclos no conformes</div>
          <div className={`mt-1 text-2xl font-extrabold ${fallas > 0 ? "text-state-err" : "text-state-ok"}`}>{fallas}</div>
        </Card>
      </div>

      {fallas > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-state-errbg px-4 py-3 text-sm text-state-err">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Hay ciclos con indicador no conforme: revisá el instrumental antes de usarlo.
        </div>
      )}

      {/* Tabla */}
      {list.length === 0 ? (
        <Empty title="Sin ciclos este mes" desc="Registrá el primer ciclo de esterilización con “Nuevo ciclo”." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-clinic-border bg-clinic-bg/50 text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5">Método</th>
                  <th className="px-4 py-2.5">Carga</th>
                  <th className="px-4 py-2.5">Ciclo / Lote</th>
                  <th className="px-4 py-2.5">Resp.</th>
                  <th className="px-4 py-2.5">Ind. químico</th>
                  <th className="px-4 py-2.5">Ind. biológico</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-clinic-border">
                {list.map((c) => (
                  <tr key={c.id} className="hover:bg-clinic-bg/40">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{fmtDate(c.date)}</td>
                    <td className="px-4 py-2.5">{METHOD_LABEL[c.method]}{c.temperature ? ` · ${c.temperature}°C` : ""}</td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 text-clinic-muted" title={c.load}>{c.load}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-clinic-muted">{c.cycleNumber ?? "—"}{c.lot ? ` · ${c.lot}` : ""}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs">{userName(c.responsibleId)}</td>
                    <td className="px-4 py-2.5"><Badge tone={indTone(c.chemicalIndicator)}>{c.chemicalIndicator ? IND_LABEL[c.chemicalIndicator] : "—"}</Badge></td>
                    <td className="px-4 py-2.5"><Badge tone={indTone(c.biologicalIndicator)}>{c.biologicalIndicator ? IND_LABEL[c.biologicalIndicator] : "—"}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <button onClick={() => { setEditing(c); setShowForm(true); }} className="mr-1 rounded-lg p-1.5 text-clinic-muted hover:bg-clinic-bg hover:text-azure-700" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { if (confirm("¿Eliminar este ciclo?")) deleteSterilizationCycle(c.id); }} className="rounded-lg p-1.5 text-clinic-muted hover:bg-clinic-bg hover:text-state-err" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showForm && (
        <CicloForm
          cycle={editing}
          users={db.users.filter((u) => u.active)}
          onClose={() => setShowForm(false)}
          onSave={(c) => { if (editing) updateSterilizationCycle(c); else addSterilizationCycle(c); setShowForm(false); }}
        />
      )}
    </Reveal>
  );
}

function CicloForm({ cycle, users, onClose, onSave }: {
  cycle: SterilizationCycle | null;
  users: { id: string; name: string }[];
  onClose: () => void;
  onSave: (c: SterilizationCycle) => void;
}) {
  const { db } = useStore();
  const cid = db.clinics[0]?.id ?? "";
  const [date, setDate] = useState((cycle?.date ?? new Date().toISOString()).slice(0, 16));
  const [responsibleId, setResponsibleId] = useState(cycle?.responsibleId ?? users[0]?.id ?? "");
  const [method, setMethod] = useState<SterilizationCycle["method"]>(cycle?.method ?? "autoclave");
  const [load, setLoad] = useState(cycle?.load ?? "");
  const [cycleNumber, setCycleNumber] = useState(cycle?.cycleNumber ?? "");
  const [lot, setLot] = useState(cycle?.lot ?? "");
  const [temperature, setTemperature] = useState(cycle?.temperature ? String(cycle.temperature) : "134");
  const [chem, setChem] = useState<string>(cycle?.chemicalIndicator ?? "ok");
  const [bio, setBio] = useState<string>(cycle?.biologicalIndicator ?? "pendiente");
  const [notes, setNotes] = useState(cycle?.notes ?? "");

  const guardar = () => {
    if (!load.trim()) return;
    onSave({
      id: cycle?.id ?? `st_${Date.now()}`,
      clinicId: cycle?.clinicId ?? cid,
      date: new Date(date).toISOString(),
      responsibleId: responsibleId || undefined,
      method,
      load: load.trim(),
      cycleNumber: cycleNumber.trim() || undefined,
      lot: lot.trim() || undefined,
      temperature: temperature ? Number(temperature) : undefined,
      chemicalIndicator: chem === "ok" || chem === "fail" ? (chem as "ok" | "fail") : undefined,
      biologicalIndicator: bio === "ok" || bio === "fail" || bio === "pendiente" ? (bio as "ok" | "fail" | "pendiente") : undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Modal title={cycle ? "Editar ciclo de esterilización" : "Nuevo ciclo de esterilización"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha y hora"><input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        <Field label="Responsable">
          <select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Método">
          <select value={method} onChange={(e) => setMethod(e.target.value as SterilizationCycle["method"])} className={inputCls}>
            <option value="autoclave">Autoclave (vapor)</option>
            <option value="calor_seco">Calor seco</option>
            <option value="quimico">Químico</option>
          </select>
        </Field>
        <Field label="Temperatura (°C)"><input type="number" value={temperature} onChange={(e) => setTemperature(e.target.value)} className={inputCls} /></Field>
        <div className="sm:col-span-2"><Field label="Carga / instrumental"><input value={load} onChange={(e) => setLoad(e.target.value)} className={inputCls} placeholder="Ej. instrumental de examen ×4 sets, kit de cirugía…" /></Field></div>
        <Field label="N.º de ciclo"><input value={cycleNumber} onChange={(e) => setCycleNumber(e.target.value)} className={inputCls} placeholder="A-1042" /></Field>
        <Field label="Lote"><input value={lot} onChange={(e) => setLot(e.target.value)} className={inputCls} placeholder="L-2026-118" /></Field>
        <Field label="Indicador químico">
          <select value={chem} onChange={(e) => setChem(e.target.value)} className={inputCls}>
            <option value="ok">Conforme</option>
            <option value="fail">No conforme</option>
          </select>
        </Field>
        <Field label="Indicador biológico (espora)">
          <select value={bio} onChange={(e) => setBio(e.target.value)} className={inputCls}>
            <option value="pendiente">Pendiente</option>
            <option value="ok">Conforme</option>
            <option value="fail">No conforme</option>
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="Observaciones"><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></Field></div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl border border-clinic-border px-4 py-2 text-sm font-bold text-clinic-muted hover:text-clinic-text">Cancelar</button>
        <Btn onClick={guardar}>Guardar ciclo</Btn>
      </div>
    </Modal>
  );
}
