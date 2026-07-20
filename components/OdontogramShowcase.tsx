"use client";
/** Vitrina visual del odontograma para la landing pública y el dashboard — SVG artesanal
 *  desconectado de datos reales de pacientes. No usar para el flujo clínico real: ver
 *  components/Odontogram.tsx (motor React-Odontogram-Modul vendorizado). */

const UPPER = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];

/* rojo = pendiente/patología · azul = realizado */
const RED = "#DC2626";
const BLUE = "#0E8AA3";

export const CONDITIONS: Record<ShowcaseToothCondition, { label: string; group: "rojo" | "azul" | "neutro"; chip: string; dot: string }> = {
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

function Elevation({ n, rec, upper }: { n: string; rec?: ShowcaseToothRecord; upper: boolean }) {
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
const SEG: Record<Exclude<ShowcaseToothSurface, "O">, string> = {
  V: "M8.1 8.1 A14 14 0 0 1 27.9 8.1 L21.54 14.46 A5 5 0 0 0 14.46 14.46 Z",
  D: "M27.9 8.1 A14 14 0 0 1 27.9 27.9 L21.54 21.54 A5 5 0 0 0 21.54 14.46 Z",
  L: "M27.9 27.9 A14 14 0 0 1 8.1 27.9 L14.46 21.54 A5 5 0 0 0 21.54 21.54 Z",
  M: "M8.1 27.9 A14 14 0 0 1 8.1 8.1 L14.46 14.46 A5 5 0 0 0 14.46 21.54 Z",
};
const ALL_SURFACES: ShowcaseToothSurface[] = ["V", "D", "L", "M", "O"];

function Occlusal({
  rec, size = "sm", onToggle, interactive = false, value,
}: {
  rec?: ShowcaseToothRecord;
  size?: "sm" | "lg";
  interactive?: boolean;
  value?: ShowcaseToothSurface[];
  onToggle?: (s: ShowcaseToothSurface) => void;
}) {
  const c = rec?.condition;
  const ghost = c === "ausente";
  const surfaces = value ?? rec?.surfaces ?? [];
  const fillColor = c && CONDITIONS[c].group === "rojo" ? RED : BLUE;
  const fullCircle = c === "corona" || c === "implante";
  const dim = size === "lg" ? "h-28 w-28" : "h-7 w-7 sm:h-8 sm:w-8";
  // Dentalink: diente presente = círculo oscuro con cruz blanca; superficies marcadas en color.
  const base = ghost ? "transparent" : c === "implante" ? "#0F1F3D" : fullCircle ? BLUE : "#15233B";
  const divider = ghost ? "#cbd5e1" : "#ffffff";
  const hover = interactive ? "cursor-pointer hover:fill-azure-500" : "";

  return (
    <svg viewBox="0 0 36 36" className={`${dim} ${ghost ? "opacity-40" : ""}`} aria-hidden={!interactive}>
      <circle cx="18" cy="18" r="14" fill={base} strokeDasharray={ghost ? "3 2.5" : undefined} stroke={ghost ? "#94a3b8" : c === "corona" ? "#0E8AA3" : "#15233B"} strokeWidth="1.2" />
      {(Object.keys(SEG) as Exclude<ShowcaseToothSurface, "O">[]).map((s) => (
        <path
          key={s}
          d={SEG[s]}
          fill={surfaces.includes(s) ? fillColor : "transparent"}
          stroke={divider}
          className={hover}
          strokeWidth="1.1"
          onClick={interactive && onToggle ? () => onToggle(s) : undefined}
        />
      ))}
      <circle
        cx="18" cy="18" r="4.2"
        fill={surfaces.includes("O") ? fillColor : fullCircle ? "#ffffff" : "transparent"}
        stroke={divider}
        className={hover}
        strokeWidth="1.1"
        onClick={interactive && onToggle ? () => onToggle("O") : undefined}
      />
      {c === "extraccion" && (
        <g stroke={RED} strokeWidth="2.2" strokeLinecap="round">
          <line x1="8" y1="8" x2="28" y2="28" /><line x1="28" y1="8" x2="8" y2="28" />
        </g>
      )}
      {interactive && (
        <g fill="#ffffff" fontSize="4.6" fontFamily="monospace" textAnchor="middle">
          <text x="18" y="6">V</text><text x="32" y="19.5">D</text><text x="18" y="33.5">L</text><text x="4" y="19.5">M</text>
        </g>
      )}
    </svg>
  );
}

/* ===== Pieza completa en el tablero ===== */
function ToothCol({ n, rec, upper, onClick }: { n: string; rec?: ShowcaseToothRecord; upper: boolean; onClick: () => void }) {
  const parts = [
    <span key="e" className="transition-transform duration-150 group-hover:scale-110"><Elevation n={n} rec={rec} upper={upper} /></span>,
    <span key="s" className="text-[8px] leading-none text-azure-500">{rec && rec.condition !== "ausente" ? "★" : " "}</span>,
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

export type ShowcaseToothCondition =
  | "caries" | "extraccion" | "restaurado" | "corona" | "endodoncia" | "ausente" | "implante";
export type ShowcaseToothSurface = "M" | "D" | "V" | "L" | "O";
export interface ShowcaseToothRecord {
  condition: ShowcaseToothCondition;
  surfaces?: ShowcaseToothSurface[];
  /** Nota libre opcional — usada solo por el tooltip de ToothCol (vitrina, sin auditoría real). */
  note?: string;
}

export { Elevation as ToothGlyph };
