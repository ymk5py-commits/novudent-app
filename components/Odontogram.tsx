"use client";
/**
 * Odontograma interactivo — notación FDI, dentición permanente (32 piezas)
 * con morfología dental: incisivos, caninos, premolares y molares (con raíces).
 * Notación clínica: caries = punto ámbar · restaurado = punto azul ·
 * corona = corona coloreada · endodoncia = conducto relleno · extracción = ✕ rojo ·
 * ausente = contorno punteado · implante = tornillo.
 */
import { useMemo, useState } from "react";
import { Eraser } from "lucide-react";
import type { ToothCondition, ToothRecord } from "@/lib/types";
import { Btn, Field, inputCls, Modal } from "./ui";

const UPPER = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];

export const CONDITIONS: Record<ToothCondition, { label: string; chip: string; dot: string }> = {
  caries:     { label: "Caries",              chip: "bg-amber-100 text-amber-800",  dot: "bg-amber-500" },
  restaurado: { label: "Restaurado",          chip: "bg-azure-100 text-azure-700",  dot: "bg-azure-500" },
  corona:     { label: "Corona",              chip: "bg-teal-100 text-teal-800",    dot: "bg-teal-500" },
  endodoncia: { label: "Endodoncia",          chip: "bg-cyan-100 text-cyan-800",    dot: "bg-cyan-600" },
  extraccion: { label: "Extracción indicada", chip: "bg-red-100 text-red-700",      dot: "bg-red-500" },
  ausente:    { label: "Ausente",             chip: "bg-slate-200 text-slate-600",  dot: "bg-slate-400" },
  implante:   { label: "Implante",            chip: "bg-navy-800 text-white",       dot: "bg-navy-800" },
};

type ToothType = "incisor" | "canine" | "premolar" | "molar";
function toothType(n: string): ToothType {
  const d = parseInt(n[1], 10);
  if (d <= 2) return "incisor";
  if (d === 3) return "canine";
  if (d <= 5) return "premolar";
  return "molar";
}

/* Trazados (viewBox 0 0 36 60, raíz hacia arriba) */
const CROWN: Record<ToothType, string> = {
  molar:    "M6.5 30 Q6.5 22 18 22 Q29.5 22 29.5 30 L29.5 45 Q29.5 54 18 54 Q6.5 54 6.5 45 Z",
  premolar: "M8.5 30 Q8.5 23 18 23 Q27.5 23 27.5 30 L27.5 44 Q27.5 53 18 53 Q8.5 53 8.5 44 Z",
  incisor:  "M10 29 Q10 22.5 18 22.5 Q26 22.5 26 29 L26 46 Q26 52.5 18 52.5 Q10 52.5 10 46 Z",
  canine:   "M10 29 Q10 22.5 18 22.5 Q26 22.5 26 29 L26 41 Q26 47 22 49.5 L18 56 L14 49.5 Q10 47 10 41 Z",
};
const ROOTS: Record<ToothType, string[]> = {
  molar:    ["M9.5 28 Q8.5 8 13 7 Q16.5 7.5 16.5 26 Z", "M26.5 28 Q27.5 8 23 7 Q19.5 7.5 19.5 26 Z"],
  premolar: ["M14 27 Q13.5 8 18 7 Q22.5 8 22 27 Z"],
  incisor:  ["M14.5 26 Q14.5 6 18 5.5 Q21.5 6 21.5 26 Z"],
  canine:   ["M14.5 26 Q14 4.5 18 4 Q22 4.5 21.5 26 Z"],
};

function ToothGlyph({ n, rec, upper }: { n: string; rec?: ToothRecord; upper: boolean }) {
  const type = toothType(n);
  const c = rec?.condition;
  const ghost = c === "ausente";
  const stroke = ghost ? "stroke-slate-300" : "stroke-slate-400";
  const crownFill =
    c === "corona" ? "fill-teal-300"
    : c === "endodoncia" ? "fill-cyan-50"
    : c === "implante" ? "fill-slate-100"
    : "fill-white";
  const rootFill = c === "endodoncia" ? "fill-cyan-500" : "fill-white";

  return (
    <svg
      viewBox="0 0 36 60"
      className={`h-12 w-8 sm:h-14 sm:w-9 ${upper ? "" : "-scale-y-100"} ${ghost ? "opacity-50" : ""}`}
      aria-hidden
    >
      <g strokeWidth="1.4" className={stroke} strokeDasharray={ghost ? "3 2.5" : undefined}>
        {/* raíces (o implante) */}
        {c === "implante" ? (
          <g>
            <rect x="14.5" y="6" width="7" height="21" rx="2.5" className="fill-navy-800 stroke-navy-800" />
            <line x1="15" y1="12" x2="21.5" y2="10" className="stroke-white" strokeWidth="1.1" />
            <line x1="15" y1="17" x2="21.5" y2="15" className="stroke-white" strokeWidth="1.1" />
            <line x1="15" y1="22" x2="21.5" y2="20" className="stroke-white" strokeWidth="1.1" />
          </g>
        ) : (
          ROOTS[type].map((d, i) => <path key={i} d={d} className={ghost ? "fill-transparent" : rootFill} />)
        )}
        {/* corona */}
        <path d={CROWN[type]} className={ghost ? "fill-transparent" : crownFill} />
        {/* hallazgos puntuales sobre la corona */}
        {c === "caries" && <circle cx="18" cy="38" r="4.5" className="fill-amber-500 stroke-amber-600" />}
        {c === "restaurado" && <rect x="13.5" y="33.5" width="9" height="9" rx="2" className="fill-azure-500 stroke-azure-600" />}
        {c === "endodoncia" && <line x1="18" y1="8" x2="18" y2="34" className="stroke-cyan-600" strokeWidth="2.2" />}
      </g>
      {/* extracción indicada: ✕ rojo sobre la pieza */}
      {c === "extraccion" && (
        <g className="stroke-red-500" strokeWidth="2.6" strokeLinecap="round">
          <line x1="8" y1="14" x2="28" y2="52" />
          <line x1="28" y1="14" x2="8" y2="52" />
        </g>
      )}
      {ghost && (
        <g className="stroke-slate-400" strokeWidth="1.6" strokeLinecap="round">
          <line x1="12" y1="32" x2="24" y2="44" />
          <line x1="24" y1="32" x2="12" y2="44" />
        </g>
      )}
    </svg>
  );
}

function Tooth({ n, rec, upper, onClick }: { n: string; rec?: ToothRecord; upper: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={rec ? `${n} · ${CONDITIONS[rec.condition].label}${rec.note ? ` — ${rec.note}` : ""}` : `${n} · Sana`}
      className={`group flex flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 transition-all duration-150 hover:bg-azure-50 ${upper ? "" : "flex-col-reverse"}`}
      aria-label={`Pieza ${n}${rec ? ` — ${CONDITIONS[rec.condition].label}` : " — sana"}`}
    >
      <span className="transition-transform duration-150 group-hover:scale-110">
        <ToothGlyph n={n} rec={rec} upper={upper} />
      </span>
      <span className={`font-mono text-[9.5px] ${rec ? "font-bold text-clinic-text" : "text-clinic-muted"}`}>{n}</span>
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
            <span key={k} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${c.chip}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} /> {n} {c.label.toLowerCase()}
            </span>
          );
        })}
        {Object.keys(value).length === 0 && <span className="text-sm text-clinic-muted">Sin hallazgos registrados — dentición sana.</span>}
      </div>

      {/* Arcadas */}
      <div className="overflow-x-auto rounded-2xl border border-clinic-border bg-white p-4 sm:p-6">
        <div className="min-w-[660px] space-y-1">
          <div className="flex justify-center">
            <div className="flex">{UPPER.slice(0, 8).map((n) => <Tooth key={n} n={n} rec={value[n]} upper onClick={() => setSelected(n)} />)}</div>
            <div className="mx-2 w-px self-stretch bg-clinic-border" />
            <div className="flex">{UPPER.slice(8).map((n) => <Tooth key={n} n={n} rec={value[n]} upper onClick={() => setSelected(n)} />)}</div>
          </div>
          <div className="relative py-2">
            <div className="h-px bg-clinic-border" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 font-mono text-[9px] uppercase tracking-widest text-clinic-muted">
              derecha · línea media · izquierda
            </span>
          </div>
          <div className="flex justify-center">
            <div className="flex">{LOWER.slice(0, 8).map((n) => <Tooth key={n} n={n} rec={value[n]} upper={false} onClick={() => setSelected(n)} />)}</div>
            <div className="mx-2 w-px self-stretch bg-clinic-border" />
            <div className="flex">{LOWER.slice(8).map((n) => <Tooth key={n} n={n} rec={value[n]} upper={false} onClick={() => setSelected(n)} />)}</div>
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
  const upper = parseInt(tooth[0], 10) <= 2;

  return (
    <Modal title={`Pieza ${tooth}`} onClose={onClose}>
      <div className="mb-4 flex justify-center rounded-2xl bg-clinic-bg py-3">
        <ToothGlyph n={tooth} rec={condition ? { condition, updatedAt: "", updatedBy: "" } : undefined} upper={upper} />
      </div>
      {!editable ? (
        <div className="space-y-3 text-sm">
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
                    active ? `${c.chip} border-transparent ring-2 ring-azure-300` : "border-clinic-border hover:border-azure-300"
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
                onClick={() => condition && onSave({ condition, note: note || undefined, updatedAt: new Date().toISOString(), updatedBy: authorName })}
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

export { ToothGlyph };
