"use client";
/**
 * Odontograma interactivo — notación FDI, dentición permanente (32 piezas).
 * Clic en una pieza → editar estado clínico. Sin entrada = pieza sana.
 */
import { useMemo, useState } from "react";
import { X, Eraser } from "lucide-react";
import type { ToothCondition, ToothRecord } from "@/lib/types";
import { Btn, Field, inputCls, Modal } from "./ui";

const UPPER = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];

export const CONDITIONS: Record<ToothCondition, { label: string; bg: string; ring: string; text: string; dot: string }> = {
  caries:      { label: "Caries",               bg: "bg-amber-100",   ring: "ring-amber-400",   text: "text-amber-800",   dot: "bg-amber-500" },
  restaurado:  { label: "Restaurado",           bg: "bg-azure-100",   ring: "ring-azure-300",   text: "text-azure-700",   dot: "bg-azure-500" },
  corona:      { label: "Corona",               bg: "bg-teal-100",    ring: "ring-teal-400",    text: "text-teal-800",    dot: "bg-teal-500" },
  endodoncia:  { label: "Endodoncia",           bg: "bg-cyan-100",    ring: "ring-cyan-400",    text: "text-cyan-800",    dot: "bg-cyan-600" },
  extraccion:  { label: "Extracción indicada",  bg: "bg-red-100",     ring: "ring-red-400",     text: "text-red-700",     dot: "bg-red-500" },
  ausente:     { label: "Ausente",              bg: "bg-slate-200",   ring: "ring-slate-300",   text: "text-slate-500",   dot: "bg-slate-400" },
  implante:    { label: "Implante",             bg: "bg-navy-800",    ring: "ring-navy-700",    text: "text-white",       dot: "bg-navy-800" },
};

function Tooth({
  n, rec, upper, onClick,
}: { n: string; rec?: ToothRecord; upper: boolean; onClick: () => void }) {
  const c = rec ? CONDITIONS[rec.condition] : null;
  return (
    <button
      onClick={onClick}
      data-tip={rec ? `${n} · ${CONDITIONS[rec.condition].label}${rec.note ? `\n${rec.note}` : ""}` : `${n} · Sana`}
      className={`group flex flex-col items-center gap-1 ${upper ? "" : "flex-col-reverse"}`}
      aria-label={`Pieza ${n}`}
    >
      <span
        className={`grid h-9 w-7 place-items-center border text-[10px] font-bold transition-all sm:h-10 sm:w-8
          ${upper ? "rounded-t-[10px] rounded-b-[4px]" : "rounded-b-[10px] rounded-t-[4px]"}
          ${c ? `${c.bg} ${c.text} ring-1 ${c.ring} border-transparent` : "border-clinic-border bg-white text-clinic-muted group-hover:border-azure-300 group-hover:bg-azure-50"}`}
      >
        {rec?.condition === "ausente" ? <X className="h-3.5 w-3.5" /> : rec?.condition === "implante" ? "⌀" : ""}
      </span>
      <span className="font-mono text-[9.5px] text-clinic-muted">{n}</span>
    </button>
  );
}

export default function Odontogram({
  value,
  editable,
  onChange,
  authorName,
}: {
  value: Record<string, ToothRecord>;
  editable: boolean;
  onChange: (tooth: string, rec: ToothRecord | null) => void;
  authorName: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const counts = useMemo(() => {
    const acc: Partial<Record<ToothCondition, number>> = {};
    Object.values(value).forEach((r) => { acc[r.condition] = (acc[r.condition] ?? 0) + 1; });
    return acc;
  }, [value]);

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(CONDITIONS) as ToothCondition[]).map((k) => {
          const n = counts[k] ?? 0;
          if (n === 0) return null;
          const c = CONDITIONS[k];
          return (
            <span key={k} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${c.bg} ${c.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} /> {n} {c.label.toLowerCase()}
            </span>
          );
        })}
        {Object.keys(value).length === 0 && <span className="text-sm text-clinic-muted">Sin hallazgos registrados — dentición sana.</span>}
      </div>

      {/* Arcadas */}
      <div className="overflow-x-auto rounded-2xl border border-clinic-border bg-white p-4 sm:p-6">
        <div className="min-w-[640px] space-y-1">
          {/* superior */}
          <div className="flex justify-center gap-1">
            <div className="flex gap-1">{UPPER.slice(0, 8).map((n) => <Tooth key={n} n={n} rec={value[n]} upper onClick={() => setSelected(n)} />)}</div>
            <div className="mx-2 w-px self-stretch bg-clinic-border" />
            <div className="flex gap-1">{UPPER.slice(8).map((n) => <Tooth key={n} n={n} rec={value[n]} upper onClick={() => setSelected(n)} />)}</div>
          </div>
          <div className="relative py-2">
            <div className="h-px bg-clinic-border" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 font-mono text-[9px] uppercase tracking-widest text-clinic-muted">
              der · maxilar / mandíbula · izq
            </span>
          </div>
          {/* inferior */}
          <div className="flex justify-center gap-1">
            <div className="flex gap-1">{LOWER.slice(0, 8).map((n) => <Tooth key={n} n={n} rec={value[n]} upper={false} onClick={() => setSelected(n)} />)}</div>
            <div className="mx-2 w-px self-stretch bg-clinic-border" />
            <div className="flex gap-1">{LOWER.slice(8).map((n) => <Tooth key={n} n={n} rec={value[n]} upper={false} onClick={() => setSelected(n)} />)}</div>
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {(Object.keys(CONDITIONS) as ToothCondition[]).map((k) => {
          const c = CONDITIONS[k];
          return (
            <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-clinic-muted">
              <span className={`h-2.5 w-2.5 rounded-sm ${c.dot}`} /> {c.label}
            </span>
          );
        })}
      </div>

      {/* Editor de pieza */}
      {selected && (
        <ToothEditor
          tooth={selected}
          rec={value[selected]}
          editable={editable}
          authorName={authorName}
          onClose={() => setSelected(null)}
          onSave={(rec) => { onChange(selected, rec); setSelected(null); }}
        />
      )}
    </div>
  );
}

function ToothEditor({
  tooth, rec, editable, authorName, onClose, onSave,
}: {
  tooth: string;
  rec?: ToothRecord;
  editable: boolean;
  authorName: string;
  onClose: () => void;
  onSave: (rec: ToothRecord | null) => void;
}) {
  const [condition, setCondition] = useState<ToothCondition | null>(rec?.condition ?? null);
  const [note, setNote] = useState(rec?.note ?? "");

  return (
    <Modal title={`Pieza ${tooth}`} onClose={onClose}>
      {!editable ? (
        <div className="space-y-3 text-sm">
          <p className="text-clinic-muted">Estado actual:</p>
          <p className="font-bold text-clinic-text">{rec ? CONDITIONS[rec.condition].label : "Sana"}</p>
          {rec?.note && <p className="rounded-xl bg-clinic-bg p-3 text-clinic-text">{rec.note}</p>}
          {rec && <p className="text-[11px] text-clinic-muted">Actualizado por {rec.updatedBy} · {new Date(rec.updatedAt).toLocaleDateString("es-PY")}</p>}
          <p className="rounded-xl bg-clinic-bg p-3 text-xs text-clinic-muted">Tu rol tiene acceso de solo lectura al odontograma.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(CONDITIONS) as ToothCondition[]).map((k) => {
              const c = CONDITIONS[k];
              const active = condition === k;
              return (
                <button
                  key={k}
                  onClick={() => setCondition(k)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                    active ? `${c.bg} ${c.text} ring-2 ${c.ring} border-transparent` : "border-clinic-border hover:border-azure-300"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} /> {c.label}
                </button>
              );
            })}
          </div>
          <Field label="Nota (opcional)">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: oclusal, sensibilidad al frío" />
          </Field>
          <div className="flex items-center justify-between gap-2 pt-1">
            <Btn variant="ghost" onClick={() => onSave(null)} tip="Quitar marca — vuelve a estado sano">
              <Eraser className="h-4 w-4" /> Marcar sana
            </Btn>
            <div className="flex gap-2">
              <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
              <Btn
                disabled={!condition}
                onClick={() =>
                  condition &&
                  onSave({ condition, note: note || undefined, updatedAt: new Date().toISOString(), updatedBy: authorName })
                }
              >
                Guardar pieza
              </Btn>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
