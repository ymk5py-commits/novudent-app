"use client";
/**
 * Periodontograma — registro periodontal por sesiones.
 *
 * Cada sesión mide por pieza (FDI): profundidad de sondaje en 6 sitios
 * (MV·V·DV vestibular / ML·L·DL linguopalatino), sangrado al sondaje
 * (BOP) por sitio y movilidad (Miller 0-3).
 *
 * Resumen clínico automático por sesión: % BOP, sitios ≥4mm y ≥6mm.
 * Código de color: 1-3mm normal · 4-5mm ámbar · ≥6mm rojo.
 */
import { useMemo, useState } from "react";
import { Plus, Activity, Droplets, AlertTriangle, ChevronDown, Save, X } from "lucide-react";
import type { PerioSession, PerioToothRecord } from "@/lib/types";
import { Card, Btn, Badge, Empty, inputCls } from "@/components/ui";

const UPPER = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const SITES = ["MV", "V", "DV", "ML", "L", "DL"];

function pdColor(v: number | null): string {
  if (v === null || v === 0) return "text-clinic-muted";
  if (v >= 6) return "bg-state-errbg text-state-err font-extrabold";
  if (v >= 4) return "bg-state-warnbg text-state-warn font-bold";
  return "text-clinic-text";
}

function sessionStats(s: PerioSession) {
  let sites = 0, bop = 0, p4 = 0, p6 = 0;
  for (const t of Object.values(s.teeth)) {
    t.pd.forEach((v, i) => {
      if (v === null || v === undefined) return;
      sites++;
      if (t.bop[i]) bop++;
      if (v >= 6) p6++;
      else if (v >= 4) p4++;
    });
  }
  return {
    sites,
    bopPct: sites ? Math.round((bop / sites) * 100) : 0,
    p4,
    p6,
  };
}

export default function Periodontogram({
  sessions,
  canWrite,
  authorName,
  onSave,
}: {
  sessions: PerioSession[];
  canWrite: boolean;
  authorName: string;
  onSave: (s: PerioSession) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(sessions[0]?.id ?? null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-clinic-muted">
          Profundidad de sondaje (6 sitios), sangrado y movilidad por pieza.
        </p>
        {canWrite && !editing && (
          <Btn onClick={() => setEditing(true)}>
            <Plus className="h-4 w-4" /> Nueva medición
          </Btn>
        )}
      </div>

      {editing && (
        <PerioEditor
          authorName={authorName}
          onCancel={() => setEditing(false)}
          onSave={(s) => {
            onSave(s);
            setEditing(false);
            setOpenId(s.id);
          }}
        />
      )}

      {sessions.length === 0 && !editing ? (
        <Empty title="Sin mediciones" desc="Registrá la primera sesión periodontal del paciente." />
      ) : (
        sessions.map((s) => {
          const st = sessionStats(s);
          const open = openId === s.id;
          return (
            <Card key={s.id} className="overflow-hidden">
              <button
                className="flex w-full flex-wrap items-center gap-3 p-4 text-left"
                onClick={() => setOpenId(open ? null : s.id)}
              >
                <Activity className="h-4 w-4 text-azure-600" />
                <span className="font-bold text-clinic-text">
                  {new Date(s.date).toLocaleDateString("es-PY", { day: "2-digit", month: "long", year: "numeric" })}
                </span>
                <span className="text-xs text-clinic-muted">por {s.by}</span>
                <span className="ml-auto flex items-center gap-2">
                  <Badge tone={st.bopPct >= 30 ? "err" : st.bopPct >= 10 ? "warn" : "ok"} tip="Sangrado al sondaje">
                    <Droplets className="mr-0.5 inline h-3 w-3" /> BOP {st.bopPct}%
                  </Badge>
                  {st.p6 > 0 && <Badge tone="err" tip="Sitios ≥6mm">{st.p6} ≥6mm</Badge>}
                  {st.p4 > 0 && <Badge tone="warn" tip="Sitios 4-5mm">{st.p4} 4-5mm</Badge>}
                  <ChevronDown className={`h-4 w-4 text-clinic-muted transition-transform ${open ? "rotate-180" : ""}`} />
                </span>
              </button>
              {open && (
                <div className="overflow-x-auto border-t border-clinic-border p-4">
                  <PerioTable teeth={s.teeth} />
                  {s.notes && <p className="mt-3 text-xs text-clinic-muted">📝 {s.notes}</p>}
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

/* ---------- vista de tabla (solo lectura) ---------- */

function PerioTable({ teeth }: { teeth: Record<string, PerioToothRecord> }) {
  const rows = [...UPPER, ...LOWER].filter((t) => teeth[t]);
  if (rows.length === 0) return <p className="text-xs text-clinic-muted">Sin piezas medidas.</p>;
  return (
    <table className="w-full min-w-[560px] border-collapse text-center font-mono text-[11px]">
      <thead>
        <tr className="text-[10px] uppercase tracking-wide text-clinic-muted">
          <th className="p-1 text-left">Pieza</th>
          {SITES.map((s) => <th key={s} className="p-1">{s}</th>)}
          <th className="p-1">Mov.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => {
          const r = teeth[t];
          return (
            <tr key={t} className="border-t border-clinic-border/60">
              <td className="p-1 text-left font-extrabold text-clinic-text">{t}</td>
              {r.pd.map((v, i) => (
                <td key={i} className={`p-1 ${pdColor(v)}`}>
                  {v ?? "·"}
                  {r.bop[i] && <span className="text-state-err">•</span>}
                </td>
              ))}
              <td className="p-1">{r.mobility ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ---------- editor de nueva sesión ---------- */

type Draft = Record<string, { pd: (number | null)[]; bop: boolean[]; mobility?: 0 | 1 | 2 | 3 }>;

function PerioEditor({
  authorName,
  onCancel,
  onSave,
}: {
  authorName: string;
  onCancel: () => void;
  onSave: (s: PerioSession) => void;
}) {
  const [draft, setDraft] = useState<Draft>({});
  const [notes, setNotes] = useState("");
  const [arch, setArch] = useState<"upper" | "lower">("upper");
  const teethList = arch === "upper" ? UPPER : LOWER;

  function setPd(tooth: string, site: number, raw: string) {
    const v = raw === "" ? null : Math.max(0, Math.min(15, parseInt(raw, 10) || 0));
    setDraft((d) => {
      const cur = d[tooth] ?? { pd: Array(6).fill(null), bop: Array(6).fill(false) };
      const pd = [...cur.pd]; pd[site] = v;
      return { ...d, [tooth]: { ...cur, pd } };
    });
  }
  function toggleBop(tooth: string, site: number) {
    setDraft((d) => {
      const cur = d[tooth] ?? { pd: Array(6).fill(null), bop: Array(6).fill(false) };
      const bop = [...cur.bop]; bop[site] = !bop[site];
      return { ...d, [tooth]: { ...cur, bop } };
    });
  }
  function setMobility(tooth: string, raw: string) {
    setDraft((d) => {
      const cur = d[tooth] ?? { pd: Array(6).fill(null), bop: Array(6).fill(false) };
      const mobility = raw === "" ? undefined : (Math.max(0, Math.min(3, parseInt(raw, 10) || 0)) as 0 | 1 | 2 | 3);
      return { ...d, [tooth]: { ...cur, mobility } };
    });
  }

  const measured = useMemo(
    () => Object.entries(draft).filter(([, r]) => r.pd.some((v) => v !== null)).length,
    [draft]
  );

  function save() {
    const teeth: Record<string, PerioToothRecord> = {};
    for (const [t, r] of Object.entries(draft)) {
      if (r.pd.some((v) => v !== null)) teeth[t] = r;
    }
    if (Object.keys(teeth).length === 0) return;
    onSave({
      id: `perio_${Date.now()}`,
      date: new Date().toISOString(),
      by: authorName,
      teeth,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-extrabold text-clinic-text">Nueva medición</h3>
          <Badge tone="info">{measured} pieza{measured === 1 ? "" : "s"}</Badge>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setArch("upper")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${arch === "upper" ? "bg-azure-600 text-white" : "bg-clinic-bg text-clinic-muted"}`}
          >
            Superior
          </button>
          <button
            onClick={() => setArch("lower")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${arch === "lower" ? "bg-azure-600 text-white" : "bg-clinic-bg text-clinic-muted"}`}
          >
            Inferior
          </button>
        </div>
      </div>

      <p className="mb-2 text-[11px] text-clinic-muted">
        Profundidad en mm por sitio (vacío = no medido) · click en la gotita = sangrado · Mov. 0-3.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-center text-[11px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-clinic-muted">
              <th className="p-1 text-left">Pieza</th>
              {SITES.map((s) => <th key={s} className="p-1">{s}</th>)}
              <th className="p-1">Mov.</th>
            </tr>
          </thead>
          <tbody>
            {teethList.map((t) => {
              const r = draft[t];
              return (
                <tr key={t} className="border-t border-clinic-border/60">
                  <td className="p-1 text-left font-mono font-extrabold text-clinic-text">{t}</td>
                  {SITES.map((_, i) => (
                    <td key={i} className="p-0.5">
                      <div className="flex items-center justify-center gap-0.5">
                        <input
                          type="number"
                          min={0}
                          max={15}
                          value={r?.pd[i] ?? ""}
                          onChange={(e) => setPd(t, i, e.target.value)}
                          className={`h-8 w-10 rounded-md border border-clinic-border text-center font-mono text-xs outline-none focus:border-azure-500 ${pdColor(r?.pd[i] ?? null)}`}
                        />
                        <button
                          type="button"
                          onClick={() => toggleBop(t, i)}
                          title="Sangrado al sondaje"
                          className={`text-sm leading-none ${r?.bop[i] ? "opacity-100" : "opacity-20"}`}
                        >
                          🩸
                        </button>
                      </div>
                    </td>
                  ))}
                  <td className="p-0.5">
                    <input
                      type="number"
                      min={0}
                      max={3}
                      value={r?.mobility ?? ""}
                      onChange={(e) => setMobility(t, e.target.value)}
                      className="h-8 w-10 rounded-md border border-clinic-border text-center font-mono text-xs outline-none focus:border-azure-500"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-3">
        <input
          className={inputCls}
          placeholder="Notas de la sesión (opcional): índice de placa, plan periodontal…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={300}
        />
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onCancel}>
            <X className="h-4 w-4" /> Cancelar
          </Btn>
          <Btn onClick={save} disabled={measured === 0}>
            <Save className="h-4 w-4" /> Guardar medición
          </Btn>
        </div>
        {measured === 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-clinic-muted">
            <AlertTriangle className="h-3.5 w-3.5" /> Cargá al menos una pieza para guardar.
          </p>
        )}
      </div>
    </Card>
  );
}
