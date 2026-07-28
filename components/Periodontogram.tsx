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
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Activity, Droplets, AlertTriangle, ChevronDown, Save, X, Mic, Square, Loader2 } from "lucide-react";
import type { PerioSession, PerioToothRecord } from "@/lib/types";
import { Card, Btn, Badge, Empty, inputCls } from "@/components/ui";
import { currentIdToken } from "@/lib/firebase";
import { validatePerioVoice } from "@/lib/perio-voice";

/** POST a /api/ia/perio-voz con el Firebase ID token. */
async function perioDictFetch(payload: unknown): Promise<Response> {
  const token = await currentIdToken();
  return fetch("/api/ia/perio-voz", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}

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
  let sites = 0, bop = 0, p4 = 0, p6 = 0, plaque = 0, worstCal = 0;
  for (const t of Object.values(s.teeth)) {
    t.pd.forEach((v, i) => {
      if (v === null || v === undefined) return;
      sites++;
      if (t.bop[i]) bop++;
      if (v >= 6) p6++;
      else if (v >= 4) p4++;
      if (t.plaque?.[i]) plaque++;
      const rec = t.recession?.[i];
      const cal = v + (typeof rec === "number" ? rec : 0);
      if (cal > worstCal) worstCal = cal;
    });
  }
  return {
    sites,
    bopPct: sites ? Math.round((bop / sites) * 100) : 0,
    plaquePct: sites ? Math.round((plaque / sites) * 100) : 0,
    worstCal,
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
          canWrite={canWrite}
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
                  {st.plaquePct > 0 && <Badge tone={st.plaquePct >= 30 ? "warn" : "muted"} tip="Índice de placa">Placa {st.plaquePct}%</Badge>}
                  {st.worstCal > 0 && <Badge tone={st.worstCal >= 5 ? "err" : "muted"} tip="Peor nivel de inserción clínica (CAL = sondaje + recesión)">CAL {st.worstCal}mm</Badge>}
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
        <tr className="text-[11px] uppercase tracking-wide text-clinic-muted">
          <th className="p-1 text-left">Pieza</th>
          {SITES.map((s) => <th key={s} className="p-1">{s}</th>)}
          <th className="p-1">CAL</th>
          <th className="p-1">Mov.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => {
          const r = teeth[t];
          let worstCal = 0;
          r.pd.forEach((v, i) => {
            if (v === null || v === undefined) return;
            const rec = r.recession?.[i];
            worstCal = Math.max(worstCal, v + (typeof rec === "number" ? rec : 0));
          });
          return (
            <tr key={t} className="border-t border-clinic-border/60">
              <td className="p-1 text-left font-extrabold text-clinic-text">{t}</td>
              {r.pd.map((v, i) => {
                const rec = r.recession?.[i];
                return (
                  <td key={i} className={`p-1 ${pdColor(v)}`}>
                    <span>{v ?? "·"}{r.bop[i] && <span className="text-state-err">•</span>}{r.plaque?.[i] && <span className="text-amber-500">▪</span>}</span>
                    {typeof rec === "number" && rec > 0 && <span className="ml-0.5 text-[11px] font-normal text-clinic-muted">r{rec}</span>}
                  </td>
                );
              })}
              <td className="p-1 font-bold text-clinic-text">{worstCal || "—"}</td>
              <td className="p-1">{r.mobility ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ---------- editor de nueva sesión ---------- */

type Draft = Record<string, { pd: (number | null)[]; bop: boolean[]; recession?: (number | null)[]; plaque?: boolean[]; mobility?: 0 | 1 | 2 | 3 }>;

type VoiceState = "idle" | "recording" | "processing";

function PerioEditor({
  authorName,
  canWrite,
  onCancel,
  onSave,
}: {
  authorName: string;
  canWrite: boolean;
  onCancel: () => void;
  onSave: (s: PerioSession) => void;
}) {
  const [draft, setDraft] = useState<Draft>({});
  const [notes, setNotes] = useState("");
  const [arch, setArch] = useState<"upper" | "lower">("upper");
  const teethList = arch === "upper" ? UPPER : LOWER;

  // Voice dictation state — all hooks before any return
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceMsg, setVoiceMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [voiceHighlight, setVoiceHighlight] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
      recRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startVoice() {
    setVoiceMsg(null);
    setVoiceHighlight(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void processVoice(new Blob(chunksRef.current, { type: mime }), mime);
      };
      rec.start(1000);
      recRef.current = rec;
      setVoiceState("recording");
    } catch {
      setVoiceMsg({ kind: "err", text: "No se pudo acceder al micrófono. Revisá los permisos del navegador." });
    }
  }

  function stopVoice() {
    if (timerRef.current) clearInterval(timerRef.current);
    recRef.current?.stop();
    setVoiceState("processing");
  }

  async function processVoice(blob: Blob, mime: string) {
    try {
      const buf = await blob.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const b64 = btoa(bin);

      const res = await perioDictFetch({ audio: b64, mimeType: mime });
      const data = await res.json();

      if (!res.ok || !data.ok || !data.tooth) {
        setVoiceMsg({ kind: "err", text: "No te entendí bien — repetí la pieza (decí la pieza y sus 6 profundidades)." });
        setVoiceState("idle");
        return;
      }

      const v = validatePerioVoice(data);
      if (!v.ok) {
        setVoiceMsg({ kind: "err", text: "No te entendí bien — repetí la pieza (decí la pieza y sus 6 profundidades)." });
        setVoiceState("idle");
        return;
      }

      // Apply validated data to draft
      setDraft((d) => {
        const cur = d[v.tooth] ?? { pd: Array(6).fill(null) as (number | null)[], bop: Array(6).fill(false) as boolean[] };

        // pd: apply each of the 6 depths
        const pd = [...cur.pd] as (number | null)[];
        v.record.pd.forEach((val, i) => {
          if (val != null) pd[i] = val;
        });

        // bop: SET to target value (not blind toggle)
        // Only call toggle logic when the target differs from current
        // Here we compute the new bop array directly since setDraft is a pure update
        const bop = [...cur.bop] as boolean[];
        v.record.bop.forEach((target, i) => {
          bop[i] = target;
        });

        // mobility
        const mobility = v.record.mobility !== undefined ? v.record.mobility : cur.mobility;

        return { ...d, [v.tooth]: { ...cur, pd, bop, mobility } };
      });

      setVoiceMsg({ kind: "ok", text: `Pieza ${v.tooth} cargada ✓` });
      setVoiceHighlight(v.tooth);
      // Switch to the arch that contains the dictated tooth
      if (UPPER.includes(v.tooth)) setArch("upper");
      else if (LOWER.includes(v.tooth)) setArch("lower");
      setVoiceState("idle");
    } catch (e) {
      setVoiceMsg({ kind: "err", text: e instanceof Error ? e.message : "Error procesando el audio." });
      setVoiceState("idle");
    }
  }

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
  function setRecession(tooth: string, site: number, raw: string) {
    const v = raw === "" ? null : Math.max(0, Math.min(15, parseInt(raw, 10) || 0));
    setDraft((d) => {
      const cur = d[tooth] ?? { pd: Array(6).fill(null), bop: Array(6).fill(false) };
      const recession = [...(cur.recession ?? Array(6).fill(null))]; recession[site] = v;
      return { ...d, [tooth]: { ...cur, recession } };
    });
  }
  function togglePlaque(tooth: string, site: number) {
    setDraft((d) => {
      const cur = d[tooth] ?? { pd: Array(6).fill(null), bop: Array(6).fill(false) };
      const plaque = [...(cur.plaque ?? Array(6).fill(false))]; plaque[site] = !plaque[site];
      return { ...d, [tooth]: { ...cur, plaque } };
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
        <div className="flex flex-wrap items-center gap-1.5">
          {canWrite && (
            voiceState === "idle" ? (
              <button
                type="button"
                onClick={startVoice}
                title="Dictar pieza por voz"
                className="flex items-center gap-1.5 rounded-lg border border-azure-300 bg-azure-50 px-3 py-1.5 text-xs font-bold text-azure-700 transition hover:bg-azure-100 active:scale-95"
              >
                <Mic className="h-3.5 w-3.5" /> Dictar pieza
              </button>
            ) : voiceState === "recording" ? (
              <button
                type="button"
                onClick={stopVoice}
                className="flex items-center gap-1.5 rounded-lg bg-state-errbg px-3 py-1.5 text-xs font-bold text-state-err transition hover:opacity-80 active:scale-95"
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-state-err opacity-50" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-state-err" />
                </span>
                Grabando… Detener
              </button>
            ) : (
              <span className="flex items-center gap-1.5 rounded-lg bg-clinic-bg px-3 py-1.5 text-xs font-bold text-clinic-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Procesando…
              </span>
            )
          )}
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

      {voiceMsg && (
        <div
          className={`mb-2 flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold ${
            voiceMsg.kind === "ok"
              ? "bg-state-okbg text-state-ok"
              : "bg-state-errbg text-state-err"
          }`}
        >
          {voiceMsg.text}
          <button
            type="button"
            onClick={() => setVoiceMsg(null)}
            className="ml-auto opacity-50 hover:opacity-100"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <p className="mb-2 text-[11px] text-clinic-muted">
        Por sitio: <b>arriba</b> profundidad (mm) + 🩸 sangrado · <b>abajo</b> recesión (mm) + ▪ placa.
        El CAL (inserción clínica) se calcula como sondaje + recesión · Mov. 0-3.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-center text-[11px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-clinic-muted">
              <th className="p-1 text-left">Pieza</th>
              {SITES.map((s) => <th key={s} className="p-1">{s}</th>)}
              <th className="p-1">Mov.</th>
            </tr>
          </thead>
          <tbody>
            {teethList.map((t) => {
              const r = draft[t];
              const isHighlighted = voiceHighlight === t;
              return (
                <tr
                  key={t}
                  className={`border-t border-clinic-border/60 transition-colors ${isHighlighted ? "bg-azure-50" : ""}`}
                >
                  <td className={`p-1 text-left font-mono font-extrabold ${isHighlighted ? "text-azure-700" : "text-clinic-text"}`}>{t}</td>
                  {SITES.map((_, i) => (
                    <td key={i} className="p-0.5">
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="flex items-center justify-center gap-0.5">
                          <input
                            type="number"
                            min={0}
                            max={15}
                            value={r?.pd[i] ?? ""}
                            onChange={(e) => setPd(t, i, e.target.value)}
                            title="Profundidad de sondaje (mm)"
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
                        <div className="flex items-center justify-center gap-0.5">
                          <input
                            type="number"
                            min={0}
                            max={15}
                            value={r?.recession?.[i] ?? ""}
                            onChange={(e) => setRecession(t, i, e.target.value)}
                            title="Recesión gingival (mm)"
                            placeholder="rec"
                            className="h-6 w-10 rounded-md border border-clinic-border/70 text-center font-mono text-[11px] text-clinic-muted outline-none placeholder:text-clinic-muted/50 focus:border-azure-500"
                          />
                          <button
                            type="button"
                            onClick={() => togglePlaque(t, i)}
                            title="Placa bacteriana"
                            className={`h-4 w-4 rounded-sm border transition-colors ${r?.plaque?.[i] ? "border-amber-500 bg-amber-400" : "border-clinic-border bg-white"}`}
                          />
                        </div>
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
