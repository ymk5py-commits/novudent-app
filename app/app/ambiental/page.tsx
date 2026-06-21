"use client";
/** Registro ambiental de residuos (cumplimiento — spec 8.7). Bitácora de
 *  entregas de residuos al gestor externo, por tipo y peso, con manifiesto. */
import { useMemo, useState } from "react";
import { useStore, fmtDate } from "@/lib/store";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { Leaf, Plus, Pencil, Trash2 } from "lucide-react";
import type { EnvironmentalLog } from "@/lib/types";

const WASTE_LABEL: Record<EnvironmentalLog["wasteType"], string> = {
  biologico: "Biológico / infeccioso", cortopunzante: "Cortopunzante", quimico: "Químico",
  anatomopatologico: "Anatomopatológico", comun: "Común / no peligroso", reciclable: "Reciclable",
};
const WASTE_TONE: Record<EnvironmentalLog["wasteType"], "err" | "warn" | "info" | "ok" | "muted"> = {
  biologico: "err", cortopunzante: "err", quimico: "warn", anatomopatologico: "err", comun: "muted", reciclable: "ok",
};

export default function AmbientalPage() {
  const { db, addEnvironmentalLog, updateEnvironmentalLog, deleteEnvironmentalLog } = useStore();
  const ym = new Date().toISOString().slice(0, 7);
  const [mes, setMes] = useState(ym);
  const [editing, setEditing] = useState<EnvironmentalLog | null>(null);
  const [showForm, setShowForm] = useState(false);
  const userName = (id?: string) => db.users.find((u) => u.id === id)?.name ?? "—";

  const list = useMemo(
    () => db.environmentalLogs.filter((e) => e.date.slice(0, 7) === mes).sort((a, b) => b.date.localeCompare(a.date)),
    [db.environmentalLogs, mes],
  );
  const totalKg = list.reduce((s, e) => s + (e.quantityKg || 0), 0);
  const peligrosoKg = list.filter((e) => e.wasteType !== "comun" && e.wasteType !== "reciclable").reduce((s, e) => s + (e.quantityKg || 0), 0);

  return (
    <Reveal className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-state-okbg text-state-ok"><Leaf className="h-5 w-5" /></span>
          <div>
            <h1 className="text-lg font-extrabold text-clinic-text">Registro ambiental</h1>
            <p className="text-[11px] text-clinic-muted">Gestión y entrega de residuos al gestor externo (cumplimiento).</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={`${inputCls} w-auto`} />
          <Btn onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Nuevo registro</Btn>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Total del mes</div><div className="mt-1 text-2xl font-extrabold text-clinic-text">{totalKg.toFixed(1)} kg</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Residuos peligrosos</div><div className="mt-1 text-2xl font-extrabold text-state-err">{peligrosoKg.toFixed(1)} kg</div></Card>
      </div>

      {list.length === 0 ? (
        <Empty title="Sin registros este mes" desc="Registrá la primera entrega de residuos con “Nuevo registro”." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-clinic-border bg-clinic-bg/50 text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                  <th className="px-4 py-2.5">Fecha</th><th className="px-4 py-2.5">Tipo</th><th className="px-4 py-2.5">Cantidad</th><th className="px-4 py-2.5">Gestor</th><th className="px-4 py-2.5">Manifiesto</th><th className="px-4 py-2.5">Resp.</th><th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-clinic-border">
                {list.map((e) => (
                  <tr key={e.id} className="hover:bg-clinic-bg/40">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{fmtDate(e.date)}</td>
                    <td className="px-4 py-2.5"><Badge tone={WASTE_TONE[e.wasteType]}>{WASTE_LABEL[e.wasteType]}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono">{e.quantityKg.toFixed(1)} kg</td>
                    <td className="max-w-[200px] truncate px-4 py-2.5 text-clinic-muted" title={e.collector}>{e.collector ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-clinic-muted">{e.manifest ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs">{userName(e.responsibleId)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <button onClick={() => { setEditing(e); setShowForm(true); }} className="mr-1 rounded-lg p-1.5 text-clinic-muted hover:bg-clinic-bg hover:text-azure-700" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { if (confirm("¿Eliminar este registro?")) deleteEnvironmentalLog(e.id); }} className="rounded-lg p-1.5 text-clinic-muted hover:bg-clinic-bg hover:text-state-err" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showForm && (
        <RegistroForm
          log={editing}
          users={db.users.filter((u) => u.active)}
          clinicId={db.clinics[0]?.id ?? ""}
          onClose={() => setShowForm(false)}
          onSave={(e) => { if (editing) updateEnvironmentalLog(e); else addEnvironmentalLog(e); setShowForm(false); }}
        />
      )}
    </Reveal>
  );
}

function RegistroForm({ log, users, clinicId, onClose, onSave }: {
  log: EnvironmentalLog | null; users: { id: string; name: string }[]; clinicId: string;
  onClose: () => void; onSave: (e: EnvironmentalLog) => void;
}) {
  const [date, setDate] = useState((log?.date ?? new Date().toISOString()).slice(0, 16));
  const [wasteType, setWasteType] = useState<EnvironmentalLog["wasteType"]>(log?.wasteType ?? "biologico");
  const [quantityKg, setQuantityKg] = useState(log?.quantityKg ? String(log.quantityKg) : "");
  const [responsibleId, setResponsibleId] = useState(log?.responsibleId ?? users[0]?.id ?? "");
  const [collector, setCollector] = useState(log?.collector ?? "");
  const [manifest, setManifest] = useState(log?.manifest ?? "");
  const [notes, setNotes] = useState(log?.notes ?? "");

  const guardar = () => {
    const kg = Number(quantityKg);
    if (!Number.isFinite(kg) || kg <= 0) return;
    onSave({
      id: log?.id ?? `en_${Date.now()}`, clinicId: log?.clinicId ?? clinicId,
      date: new Date(date).toISOString(), wasteType, quantityKg: kg,
      responsibleId: responsibleId || undefined, collector: collector.trim() || undefined,
      manifest: manifest.trim() || undefined, notes: notes.trim() || undefined,
    });
  };

  return (
    <Modal title={log ? "Editar registro ambiental" : "Nuevo registro ambiental"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha y hora"><input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        <Field label="Tipo de residuo">
          <select value={wasteType} onChange={(e) => setWasteType(e.target.value as EnvironmentalLog["wasteType"])} className={inputCls}>
            {(Object.keys(WASTE_LABEL) as EnvironmentalLog["wasteType"][]).map((w) => <option key={w} value={w}>{WASTE_LABEL[w]}</option>)}
          </select>
        </Field>
        <Field label="Cantidad (kg)"><input type="number" step="0.1" value={quantityKg} onChange={(e) => setQuantityKg(e.target.value)} className={inputCls} /></Field>
        <Field label="Responsable">
          <select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Gestor / empresa recolectora"><input value={collector} onChange={(e) => setCollector(e.target.value)} className={inputCls} placeholder="Ej. EcoGestión Residuos S.A." /></Field>
        <Field label="N.º de manifiesto / acta"><input value={manifest} onChange={(e) => setManifest(e.target.value)} className={inputCls} placeholder="ACT-2026-0457" /></Field>
        <div className="sm:col-span-2"><Field label="Observaciones"><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></Field></div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl border border-clinic-border px-4 py-2 text-sm font-bold text-clinic-muted hover:text-clinic-text">Cancelar</button>
        <Btn onClick={guardar}>Guardar registro</Btn>
      </div>
    </Modal>
  );
}
