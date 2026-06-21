"use client";
/** Clinical Copilot — Novudent IA (spec 10.1). Del RX propone diagnóstico,
 *  entradas de odontograma y un plan con precios del arancel. El profesional
 *  revisa/edita la selección y aplica al odontograma o crea el plan (borrador).
 *  Es APOYO, no diagnóstico definitivo. */
import { useState } from "react";
import { useStore, fmtGs } from "@/lib/store";
import { currentIdToken } from "@/lib/firebase";
import { resizeToDataUrl } from "@/lib/image";
import { Card, Btn, Badge, Empty } from "@/components/ui";
import { Sparkles, Upload, Loader2, Check, Smile, FileSpreadsheet, AlertTriangle } from "lucide-react";
import type { Patient, ToothCondition, Budget } from "@/lib/types";

type Finding = { tooth: string; condition: ToothCondition; severity: string; confidence: number; note: string };
type PlanItem = { tooth?: string; cpt: string; description: string; price: number; priority: number };

const COND_LABEL: Record<string, string> = { caries: "Caries", restaurado: "Restaurado", corona: "Corona", endodoncia: "Endodoncia", extraccion: "Extracción", ausente: "Ausente", implante: "Implante" };
const sevTone = (s: string): "err" | "warn" | "info" | "muted" => (s === "severo" ? "err" : s === "moderado" ? "warn" : s === "leve" ? "info" : "muted");

export function ClinicalCopilot({ patient }: { patient: Patient }) {
  const { db, session, setTooth, upsertBudget } = useStore();
  const [img, setImg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<{ summary: string; findings: Finding[]; plan: PlanItem[] } | null>(null);
  const [fSel, setFSel] = useState<Set<number>>(new Set());
  const [pSel, setPSel] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<string | null>(null);

  const pick = async (files: FileList | null) => {
    if (!files?.[0]) return;
    setError(null); setRes(null); setDone(null);
    try { setImg(await resizeToDataUrl(files[0], { maxDim: 1400 })); } catch { setError("No se pudo cargar la imagen."); }
  };

  const generar = async () => {
    if (!img) return;
    setBusy(true); setError(null); setRes(null); setDone(null);
    try {
      const token = await currentIdToken();
      const procedures = db.procedures.map((p) => ({ cpt: p.cpt, description: p.description, price: p.price }));
      const r = await fetch("/api/ia/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ image: img, mimeType: "image/jpeg", procedures }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.error || "No se pudo generar el análisis.");
      setRes({ summary: data.summary, findings: data.findings ?? [], plan: data.plan ?? [] });
      setFSel(new Set((data.findings ?? []).map((_: unknown, i: number) => i)));
      setPSel(new Set((data.plan ?? []).map((_: unknown, i: number) => i)));
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const toggle = (set: Set<number>, setset: (s: Set<number>) => void, i: number) => {
    const n = new Set(set); if (n.has(i)) n.delete(i); else n.add(i); setset(n);
  };

  const aplicarOdontograma = () => {
    if (!res || !session) return;
    const now = new Date().toISOString();
    res.findings.forEach((f, i) => {
      if (!fSel.has(i)) return;
      setTooth(patient.id, f.tooth, { condition: f.condition, surfaces: [], note: f.note || `Copilot IA (${Math.round(f.confidence * 100)}%)`, updatedAt: now, updatedBy: session.name });
    });
    setDone("odontograma");
  };

  const crearPlan = () => {
    if (!res || !session) return;
    const items = res.plan.filter((_, i) => pSel.has(i)).map((p, idx) => ({ id: `bi_${Date.now()}_${idx}`, cpt: p.cpt, description: p.description, tooth: p.tooth, price: p.price, status: "pendiente" as const }));
    if (items.length === 0) return;
    const dentistId = session.role === "dentist" ? session.userId : (db.users.find((u) => u.role === "dentist")?.id ?? session.userId);
    const now = new Date().toISOString();
    const budget: Budget = { id: `g_${Date.now()}`, clinicId: db.clinics[0]?.id ?? "", patientId: patient.id, dentistId, createdAt: now, status: "borrador", name: "Plan sugerido por Copilot IA", items, history: [{ at: now, action: "Plan sugerido por Clinical Copilot IA", by: session.name }] };
    upsertBudget(budget);
    setDone("plan");
  };

  const planTotal = res ? res.plan.filter((_, i) => pSel.has(i)).reduce((s, p) => s + p.price, 0) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-clinic-border bg-white p-5">
        <div className="mb-1 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-azure-50 text-azure-600"><Sparkles className="h-4 w-4" /></span>
          <h3 className="font-extrabold text-clinic-text">Clinical Copilot</h3>
          <Badge tone="info">IA</Badge>
        </div>
        <p className="mb-3 flex items-start gap-1.5 text-[11px] text-clinic-muted"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> Subí una radiografía: la IA propone diagnóstico, odontograma y plan con precios del arancel. Es <b className="mx-0.5">apoyo</b> — revisá y aprobá antes de aplicar.</p>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-clinic-border px-3 py-2 text-xs font-bold text-clinic-text hover:border-azure-300 hover:text-azure-700">
            <Upload className="h-3.5 w-3.5" /> {img ? "Cambiar radiografía" : "Subir radiografía"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files); e.currentTarget.value = ""; }} />
          </label>
          <Btn onClick={generar} disabled={!img || busy}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Analizando…</> : <><Sparkles className="h-4 w-4" /> Generar diagnóstico</>}</Btn>
        </div>
        {img && <img src={img} alt="Radiografía" className="mt-3 max-h-56 rounded-xl border border-clinic-border" />}
        {error && <p className="mt-3 rounded-xl bg-state-errbg px-3 py-2 text-xs font-semibold text-state-err">{error}</p>}
        {done && <p className="mt-3 rounded-xl bg-state-okbg px-3 py-2 text-xs font-semibold text-state-ok">✓ {done === "odontograma" ? "Hallazgos aplicados al odontograma." : "Plan de tratamiento creado como borrador."}</p>}
      </div>

      {res && (
        <>
          {res.summary && <Card className="p-4"><div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Resumen</div><p className="text-sm text-clinic-text">{res.summary}</p></Card>}

          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-extrabold text-clinic-text">Hallazgos / odontograma</h4>
              <Btn variant="outline" onClick={aplicarOdontograma} disabled={fSel.size === 0}><Smile className="h-3.5 w-3.5" /> Aplicar al odontograma</Btn>
            </div>
            {res.findings.length === 0 ? <Empty title="Sin hallazgos" desc="La IA no detectó hallazgos en la imagen." /> : (
              <ul className="divide-y divide-clinic-border">
                {res.findings.map((f, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <input type="checkbox" checked={fSel.has(i)} onChange={() => toggle(fSel, setFSel, i)} />
                    <span className="font-mono font-extrabold text-clinic-text">{f.tooth}</span>
                    <Badge tone="info">{COND_LABEL[f.condition] ?? f.condition}</Badge>
                    <Badge tone={sevTone(f.severity)}>{f.severity}</Badge>
                    <span className="text-[11px] text-clinic-muted">{Math.round(f.confidence * 100)}% conf.</span>
                    {f.note && <span className="text-xs text-clinic-muted">· {f.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-extrabold text-clinic-text">Plan de tratamiento sugerido</h4>
              <Btn variant="outline" onClick={crearPlan} disabled={pSel.size === 0}><FileSpreadsheet className="h-3.5 w-3.5" /> Crear plan (borrador)</Btn>
            </div>
            {res.plan.length === 0 ? <Empty title="Sin plan" desc="La IA no sugirió procedimientos." /> : (
              <>
                <ul className="divide-y divide-clinic-border">
                  {res.plan.map((p, i) => (
                    <li key={i} className="flex items-center gap-2 py-2 text-sm">
                      <input type="checkbox" checked={pSel.has(i)} onChange={() => toggle(pSel, setPSel, i)} />
                      {p.tooth && <span className="font-mono font-bold text-clinic-text">{p.tooth}</span>}
                      <span className="min-w-0 flex-1 truncate text-clinic-text">{p.description}</span>
                      {p.priority === 1 && <Badge tone="err">Urgente</Badge>}
                      <span className="font-mono font-bold text-clinic-text">{fmtGs(p.price)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center justify-between border-t border-clinic-border pt-2 text-sm">
                  <span className="font-bold text-clinic-muted">Total seleccionado</span>
                  <span className="font-mono text-base font-extrabold text-azure-700">{fmtGs(planTotal)}</span>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
