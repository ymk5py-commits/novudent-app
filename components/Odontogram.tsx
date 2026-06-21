"use client";
/**
 * Odontograma profesional — notación FDI, 32 piezas.
 * Dos vistas por pieza (como el software dental clásico):
 *  · Elevación anatómica line-art (corona + raíces según el tipo de diente)
 *  · Vista oclusal: círculo de 5 superficies (M · D · V · L · O), clickeable
 * Convención clínica: ROJO = patología/pendiente · AZUL = tratamiento realizado.
 */
import { useMemo, useState } from "react";
import { Eraser } from "lucide-react";
import type { ToothCondition, ToothRecord, ToothSurface } from "@/lib/types";
import { Btn, Field, inputCls, Modal } from "./ui";

const UPPER = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
/* Dentición temporal (FDI 51-85) — pacientes pediátricos */
const UPPER_TEMP = ["55", "54", "53", "52", "51", "61", "62", "63", "64", "65"];
const LOWER_TEMP = ["85", "84", "83", "82", "81", "71", "72", "73", "74", "75"];

/* rojo = pendiente/patología · azul = realizado */
const RED = "#DC2626";
const BLUE = "#1769E0";

export const CONDITIONS: Record<ToothCondition, { label: string; group: "rojo" | "azul" | "neutro"; chip: string; dot: string }> = {
  caries:     { label: "Caries",              group: "rojo",   chip: "bg-red-100 text-red-700",     dot: "bg-red-500" },
  extraccion: { label: "Extracción indicada", group: "rojo",   chip: "bg-red-100 text-red-700",     dot: "bg-red-600" },
  restaurado: { label: "Restaurado",          group: "azul",   chip: "bg-azure-100 text-azure-700", dot: "bg-azure-500" },
  corona:     { label: "Corona",              group: "azul",   chip: "bg-azure-100 text-azure-700", dot: "bg-azure-600" },
  endodoncia: { label: "Endodoncia",          group: "azul",   chip: "bg-azure-100 text-azure-700", dot: "bg-azure-700" },
  implante:   { label: "Implante",            group: "azul",   chip: "bg-navy-800 text-white",      dot: "bg-navy-800" },
  ausente:    { label: "Ausente",             group: "neutro", chip: "bg-slate-200 text-slate-600", dot: "bg-slate-400" },
};

type ToothType = "incisor" | "canine" | "premolar" | "molar";
function toothType(n: string): ToothType {
  const d = parseInt(n[1], 10);
  if (d <= 2) return "incisor";
  if (d === 3) return "canine";
  if (d <= 5) return "premolar";
  return "molar";
}

/* ===== Elevación anatómica (viewBox 0 0 40 72, raíz hacia arriba) ===== */
const ANAT: Record<ToothType, { roots: string[]; crown: string; detail?: string }> = {
  molar: {
    roots: [
      "M10.5 32 C8.5 23 8.8 12 12.2 8 C14.6 5.5 16.4 7.8 16.2 14 L16 31 Z",
      "M29.5 32 C31.5 23 31.2 12 27.8 8 C25.4 5.5 23.6 7.8 23.8 14 L24 31 Z",
    ],
    crown: "M8 34.5 C8 29 11.5 27 20 27 C28.5 27 32 29 32 34.5 L32 53 C32 62 27.5 66 20 66 C12.5 66 8 62 8 53 Z",
    detail: "M13 59 Q16.5 54.5 20 59 Q23.5 63 27 58.5",
  },
  premolar: {
    roots: ["M15.5 30 C14.5 19 15.2 9.5 20 7.5 C24.8 9.5 25.5 19 24.5 30 Z"],
    crown: "M10.5 33 C10.5 28 14 26 20 26 C26 26 29.5 28 29.5 33 L29.5 51 C29.5 60 25.5 64 20 64 C14.5 64 10.5 60 10.5 51 Z",
    detail: "M14.5 56.5 Q20 51.5 25.5 56.5",
  },
  canine: {
    roots: ["M16.5 29 C15.5 16 16.5 6 20 4.5 C23.5 6 24.5 16 23.5 29 Z"],
    crown: "M11.5 32 C11.5 27 15 25.5 20 25.5 C25 25.5 28.5 27 28.5 32 L28.5 46 C28.5 53 25.8 57.5 23 60.5 L20 65.5 L17 60.5 C14.2 57.5 11.5 53 11.5 46 Z",
  },
  incisor: {
    roots: ["M16.5 28 C16 15 17 6.8 20 5.8 C23 6.8 24 15 23.5 28 Z"],
    crown: "M12.5 31 C12.5 26.5 15.5 25 20 25 C24.5 25 27.5 26.5 27.5 31 L27.5 52 C27.5 59.5 24.5 62.5 20 62.5 C15.5 62.5 12.5 59.5 12.5 52 Z",
  },
};

function Elevation({ n, rec, upper }: { n: string; rec?: ToothRecord; upper: boolean }) {
  const t = ANAT[toothType(n)];
  const c = rec?.condition;
  const ghost = c === "ausente";
  const tone = c ? CONDITIONS[c].group : null;
  const strokeCls = ghost
    ? "stroke-slate-300"
    : tone === "rojo" ? "stroke-red-400"
    : tone === "azul" ? "stroke-azure-400"
    : "stroke-slate-400";

  return (
    <svg viewBox="0 0 40 72" className={`h-14 w-8 sm:h-16 sm:w-9 ${upper ? "" : "-scale-y-100"} ${ghost ? "opacity-45" : ""}`} aria-hidden>
      <g strokeWidth="1.4" fill="white" className={strokeCls} strokeLinejoin="round" strokeDasharray={ghost ? "3 2.5" : undefined}>
        {/* raíces o implante */}
        {c === "implante" ? (
          <g>
            <path d="M16 30 L24 30 L22.5 8 Q20 5 17.5 8 Z" className="fill-navy-800 stroke-navy-800" />
            <line x1="16.6" y1="13" x2="23" y2="11" className="stroke-white" strokeWidth="1.2" />
            <line x1="16.9" y1="18" x2="23.2" y2="16" className="stroke-white" strokeWidth="1.2" />
            <line x1="16.6" y1="23" x2="23.4" y2="21" className="stroke-white" strokeWidth="1.2" />
          </g>
        ) : (
          t.roots.map((d, i) => <path key={i} d={d} fill={ghost ? "transparent" : "white"} />)
        )}
        {/* corona */}
        <path d={t.crown} fill={ghost ? "transparent" : c === "corona" ? "#CBE0FF" : "white"} className={c === "corona" ? "stroke-azure-600" : undefined} strokeWidth={c === "corona" ? 2 : 1.4} />
        {/* surco oclusal */}
        {t.detail && !ghost && <path d={t.detail} fill="none" className="stroke-slate-300" strokeWidth="1.1" />}
        {/* endodoncia: conducto relleno */}
        {c === "endodoncia" && (
          <g>
            <line x1="20" y1="9" x2="20" y2="38" stroke={BLUE} strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="20" cy="9" r="1.8" fill={BLUE} />
          </g>
        )}
        {/* hallazgo en corona */}
        {c === "caries" && <circle cx="20" cy="46" r="4.5" fill={RED} className="stroke-red-600" />}
        {c === "restaurado" && <rect x="15.5" y="41.5" width="9" height="9" rx="2" fill={BLUE} className="stroke-azure-700" />}
      </g>
      {c === "extraccion" && (
        <g stroke={RED} strokeWidth="2.8" strokeLinecap="round">
          <line x1="9" y1="20" x2="31" y2="60" />
          <line x1="31" y1="20" x2="9" y2="60" />
        </g>
      )}
      {ghost && (
        <g className="stroke-slate-400" strokeWidth="1.6" strokeLinecap="round">
          <line x1="13" y1="38" x2="27" y2="52" />
          <line x1="27" y1="38" x2="13" y2="52" />
        </g>
      )}
    </svg>
  );
}

/* ===== Vista oclusal: círculo de superficies (M·D·V·L·O) ===== */
const SEG: Record<Exclude<ToothSurface, "O">, string> = {
  V: "M8.1 8.1 A14 14 0 0 1 27.9 8.1 L21.54 14.46 A5 5 0 0 0 14.46 14.46 Z",
  D: "M27.9 8.1 A14 14 0 0 1 27.9 27.9 L21.54 21.54 A5 5 0 0 0 21.54 14.46 Z",
  L: "M27.9 27.9 A14 14 0 0 1 8.1 27.9 L14.46 21.54 A5 5 0 0 0 21.54 21.54 Z",
  M: "M8.1 27.9 A14 14 0 0 1 8.1 8.1 L14.46 14.46 A5 5 0 0 0 14.46 21.54 Z",
};
const ALL_SURFACES: ToothSurface[] = ["V", "D", "L", "M", "O"];

function Occlusal({
  rec, size = "sm", onToggle, interactive = false, value,
}: {
  rec?: ToothRecord;
  size?: "sm" | "lg";
  interactive?: boolean;
  value?: ToothSurface[];
  onToggle?: (s: ToothSurface) => void;
}) {
  const c = rec?.condition;
  const ghost = c === "ausente";
  const surfaces = value ?? rec?.surfaces ?? [];
  const fillColor = c && CONDITIONS[c].group === "rojo" ? RED : BLUE;
  const fullCircle = c === "corona" || c === "implante";
  const dim = size === "lg" ? "h-28 w-28" : "h-7 w-7 sm:h-8 sm:w-8";

  return (
    <svg viewBox="0 0 36 36" className={`${dim} ${ghost ? "opacity-40" : ""}`} aria-hidden={!interactive}>
      {/* base */}
      <circle cx="18" cy="18" r="14" fill={fullCircle ? (c === "implante" ? "#0F1F3D" : "#CBE0FF") : "white"} strokeDasharray={ghost ? "3 2.5" : undefined} className={`${fullCircle ? "stroke-azure-600" : "stroke-slate-300"}`} strokeWidth="1.3" />
      {(Object.keys(SEG) as Exclude<ToothSurface, "O">[]).map((s) => (
        <path
          key={s}
          d={SEG[s]}
          fill={surfaces.includes(s) ? fillColor : "transparent"}
          className={`stroke-slate-300 ${interactive ? "cursor-pointer hover:fill-azure-100" : ""}`}
          strokeWidth="1"
          onClick={interactive && onToggle ? () => onToggle(s) : undefined}
        />
      ))}
      <circle
        cx="18" cy="18" r="4.2"
        fill={surfaces.includes("O") ? fillColor : fullCircle ? "white" : "transparent"}
        className={`stroke-slate-300 ${interactive ? "cursor-pointer hover:fill-azure-100" : ""}`}
        strokeWidth="1"
        onClick={interactive && onToggle ? () => onToggle("O") : undefined}
      />
      {c === "extraccion" && (
        <g stroke={RED} strokeWidth="2.2" strokeLinecap="round">
          <line x1="8" y1="8" x2="28" y2="28" /><line x1="28" y1="8" x2="8" y2="28" />
        </g>
      )}
      {interactive && (
        <g className="fill-slate-400" fontSize="4.6" fontFamily="monospace" textAnchor="middle">
          <text x="18" y="6">V</text><text x="32" y="19.5">D</text><text x="18" y="33.5">L</text><text x="4" y="19.5">M</text>
        </g>
      )}
    </svg>
  );
}

/* ===== Pieza completa en el tablero ===== */
function ToothCol({ n, rec, upper, onClick }: { n: string; rec?: ToothRecord; upper: boolean; onClick: () => void }) {
  const parts = [
    <span key="e" className="transition-transform duration-150 group-hover:scale-110"><Elevation n={n} rec={rec} upper={upper} /></span>,
    <Occlusal key="o" rec={rec} />,
    <span key="n" className={`font-mono text-[9.5px] leading-none ${rec ? "font-bold text-clinic-text" : "text-clinic-muted"}`}>{n}</span>,
  ];
  return (
    <button
      onClick={onClick}
      title={rec ? `${n} · ${CONDITIONS[rec.condition].label}${rec.surfaces?.length ? ` (${rec.surfaces.join("·")})` : ""}${rec.note ? ` — ${rec.note}` : ""}` : `${n} · Sana`}
      aria-label={`Pieza ${n}${rec ? ` — ${CONDITIONS[rec.condition].label}` : " — sana"}`}
      className="group flex w-9 flex-col items-center gap-1 rounded-lg px-0.5 py-1.5 transition-colors hover:bg-azure-50 sm:w-10"
    >
      {upper ? parts : [...parts].reverse()}
    </button>
  );
}

export default function Odontogram({
  value, editable, onChange, authorName,
}: {
  value: Record<string, ToothRecord>;
  editable: boolean;
  onChange: (tooth: string, rec: ToothRecord | null) => void;
  authorName: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dentition, setDentition] = useState<"permanente" | "temporal">("permanente");
  const upperTeeth = dentition === "temporal" ? UPPER_TEMP : UPPER;
  const lowerTeeth = dentition === "temporal" ? LOWER_TEMP : LOWER;

  const counts = useMemo(() => {
    const acc: Partial<Record<ToothCondition, number>> = {};
    Object.values(value).forEach((r) => { acc[r.condition] = (acc[r.condition] ?? 0) + 1; });
    return acc;
  }, [value]);

  const Row = ({ teeth, upper }: { teeth: string[]; upper: boolean }) => {
    const h = Math.ceil(teeth.length / 2);
    return (
      <div className="flex justify-center">
        <div className="flex">{teeth.slice(0, h).map((n) => <ToothCol key={n} n={n} rec={value[n]} upper={upper} onClick={() => setSelected(n)} />)}</div>
        <div className="mx-1.5 w-px self-stretch bg-clinic-border sm:mx-2.5" />
        <div className="flex">{teeth.slice(h).map((n) => <ToothCol key={n} n={n} rec={value[n]} upper={upper} onClick={() => setSelected(n)} />)}</div>
      </div>
    );
  };

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

      {/* Toggle Permanente / Temporal (FDI) */}
      <div className="flex w-fit gap-1 rounded-xl border border-clinic-border bg-white p-1">
        {(["permanente", "temporal"] as const).map((d) => (
          <button key={d} onClick={() => { setDentition(d); setSelected(null); }} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${dentition === d ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}>
            {d === "permanente" ? "Permanente" : "Temporal (niños)"}
          </button>
        ))}
      </div>

      {/* Tablero */}
      <div className="overflow-x-auto rounded-2xl border border-clinic-border bg-white p-4 sm:p-6">
        <div className="min-w-[700px] space-y-1.5">
          <Row teeth={upperTeeth} upper />
          <div className="relative py-2.5">
            <div className="h-px bg-clinic-border" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 font-mono text-[9px] uppercase tracking-widest text-clinic-muted">
              derecha · línea media · izquierda
            </span>
          </div>
          <Row teeth={lowerTeeth} upper={false} />
        </div>
      </div>

      {/* Leyenda (rojo = pendiente, azul = realizado) */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-clinic-border bg-white px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-600"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Rojo = patología / pendiente</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-azure-700"><span className="h-2.5 w-2.5 rounded-full bg-azure-600" /> Azul = tratamiento realizado</span>
        <span className="hidden h-4 w-px bg-clinic-border sm:block" />
        {(Object.keys(CONDITIONS) as ToothCondition[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-clinic-muted">
            <span className={`h-2 w-2 rounded-sm ${CONDITIONS[k].dot}`} /> {CONDITIONS[k].label}
          </span>
        ))}
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

/* ===== Editor de pieza (estado + superficies + nota) ===== */
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
  const [surfaces, setSurfaces] = useState<ToothSurface[]>(rec?.surfaces ?? []);
  const [note, setNote] = useState(rec?.note ?? "");
  const upper = [1, 2, 5, 6].includes(parseInt(tooth[0], 10));
  const usesSurfaces = condition === "caries" || condition === "restaurado";
  const preview: ToothRecord | undefined = condition
    ? { condition, surfaces: usesSurfaces ? surfaces : undefined, updatedAt: "", updatedBy: "" }
    : undefined;

  return (
    <Modal title={`Pieza ${tooth}`} onClose={onClose}>
      <div className="mb-4 flex items-center justify-center gap-6 rounded-2xl bg-clinic-bg py-4">
        <Elevation n={tooth} rec={preview} upper={upper} />
        <Occlusal
          rec={preview}
          size="lg"
          interactive={editable && usesSurfaces}
          value={usesSurfaces ? surfaces : undefined}
          onToggle={(s) => setSurfaces((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))}
        />
      </div>
      {!editable ? (
        <div className="space-y-3 text-sm">
          <p className="font-bold text-clinic-text">
            {rec ? CONDITIONS[rec.condition].label : "Sana"}
            {rec?.surfaces?.length ? <span className="ml-2 font-mono text-xs text-clinic-muted">Superficies: {rec.surfaces.join(" · ")}</span> : null}
          </p>
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
          {usesSurfaces && (
            <p className="rounded-xl bg-azure-50 px-3 py-2 text-xs font-semibold text-azure-700">
              Tocá las superficies afectadas en el círculo (M · D · V · L · centro = O).{" "}
              {surfaces.length > 0 ? <span className="font-mono">Seleccionadas: {surfaces.join(" · ")}</span> : "Ninguna seleccionada."}
            </p>
          )}
          <Field label="Nota (opcional)">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: sensibilidad al frío" />
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
                  onSave({
                    condition,
                    surfaces: usesSurfaces && surfaces.length > 0 ? surfaces : undefined,
                    note: note || undefined,
                    updatedAt: new Date().toISOString(),
                    updatedBy: authorName,
                  })
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

export { Elevation as ToothGlyph };
