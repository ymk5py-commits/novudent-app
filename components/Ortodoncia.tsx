"use client";
/** Panel de seguimiento de Ortodoncia dentro del Plan de tratamiento (estilo Dentalink):
 *  Resumen (progreso + evoluciones) · Plantilla Fotográfica · Diagnóstico · Plan · Rx y CF.
 *  Lee/escribe `patient.ortho` (OrthoRecord) vía setOrtho/addOrthoControl. */
import { useRef, useState } from "react";
import {
  Braces, Plus, Pencil, Calendar, Upload, Trash2, ImageIcon, Stethoscope, ScanLine,
  FileSpreadsheet, ClipboardList, CircleCheck,
} from "lucide-react";
import { useStore, fmtGs, fmtDate } from "@/lib/store";
import { can } from "@/lib/rbac";
import { orthoProgress } from "@/lib/ortho";
import { PrestacionesList } from "@/components/Prestaciones";
import { resizeToDataUrl } from "@/lib/image";
import type { Patient, Budget, OrthoRecord } from "@/lib/types";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";
import { RadiografiasTab } from "@/components/Radiografias";
import { MAX_FILES } from "@/components/PatientExtras";

type OrthoSub = "resumen" | "fotografica" | "diagnostico" | "plan" | "rx";

export function OrtodonciaPanel({ patient, budget }: { patient: Patient; budget: Budget }) {
  const { session, setOrtho } = useStore();
  const canWrite = session ? can(session.role, "emr.write") : false;
  const [sub, setSub] = useState<OrthoSub>("resumen");
  const [activating, setActivating] = useState(false);
  const o = patient.ortho;

  if (!o?.active) {
    return (
      <div className="rounded-2xl border border-dashed border-clinic-border bg-white p-10 text-center">
        <Braces className="mx-auto h-10 w-10 text-azure-300" />
        <h3 className="mt-3 text-sm font-extrabold text-clinic-text">Ortodoncia no iniciada</h3>
        <p className="mt-1 text-sm text-clinic-muted">Activá el seguimiento para registrar aparatología, progreso y evoluciones.</p>
        {o && !o.active && <p className="mt-2 text-xs text-clinic-muted">Tratamiento anterior finalizado ({o.controls.length} controles).</p>}
        {canWrite && <div className="mt-4"><Btn onClick={() => setActivating(true)}><Plus className="h-4 w-4" /> Activar ortodoncia</Btn></div>}
        {activating && <ActivateModal prev={o} onClose={() => setActivating(false)} onSave={(rec) => { setOrtho(patient.id, rec); setActivating(false); }} />}
      </div>
    );
  }

  const SUBS = [
    { key: "resumen", label: "Resumen", icon: Stethoscope },
    { key: "fotografica", label: "Plantilla Fotográfica", icon: ImageIcon },
    { key: "diagnostico", label: "Diagnóstico", icon: ClipboardList },
    { key: "plan", label: "Plan de tratamiento", icon: FileSpreadsheet },
    { key: "rx", label: "Rx y CF", icon: ScanLine },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-xl border border-clinic-border bg-white p-1">
        {SUBS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSub(s.key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              sub === s.key ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"
            }`}
          >
            <s.icon className="h-3.5 w-3.5" /> {s.label}
          </button>
        ))}
      </div>
      {sub === "resumen" && <OrthoResumen patient={patient} canWrite={canWrite} />}
      {sub === "fotografica" && <OrthoFotos patient={patient} canWrite={canWrite} />}
      {sub === "diagnostico" && <OrthoDiagnostico patient={patient} canWrite={canWrite} />}
      {sub === "plan" && <OrthoPlan budget={budget} />}
      {sub === "rx" && <RadiografiasTab patient={patient} />}
    </div>
  );
}

/* ---------- Donut de progreso (SVG) ---------- */
function Donut({ pct, label, hint }: { pct: number; label: string; hint: string }) {
  const r = 32;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-[88px] w-[88px]">
        <svg viewBox="0 0 80 80" className="h-[88px] w-[88px] -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" stroke="currentColor" className="text-clinic-border" />
          <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" strokeLinecap="round" stroke="currentColor" strokeDasharray={circ} strokeDashoffset={off} className="text-azure-500 transition-all duration-700" />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-base font-extrabold text-clinic-text">{pct}%</span>
      </div>
      <span className="text-xs font-bold text-clinic-text">{label}</span>
      <span className="text-[10px] text-clinic-muted">{hint}</span>
    </div>
  );
}

function Info({ k, v }: { k: string; v?: string | null }) {
  return (
    <div>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-clinic-muted">{k}</span>
      <span className={`block text-sm ${v ? "font-semibold text-clinic-text" : "text-clinic-muted/60"}`}>{v || "—"}</span>
    </div>
  );
}

/* ---------- Resumen: progreso + seguimiento + última evolución ---------- */
function OrthoResumen({ patient, canWrite }: { patient: Patient; canWrite: boolean }) {
  const { session, setOrtho, addOrthoControl } = useStore();
  const [editing, setEditing] = useState(false);
  const [evoOpen, setEvoOpen] = useState(false);
  const o = patient.ortho!;
  const prog = orthoProgress(o);
  const last = [...o.controls].sort((a, b) => b.date.localeCompare(a.date))[0];
  const fields: [string, string | null | undefined][] = [
    ["Aparatología", o.applianceType],
    ["Último arco superior", o.upperArch],
    ["Último arco inferior", o.lowerArch],
    ["Tipo de elásticos", o.elasticType],
    ["Configuración elásticos", o.elasticConfig],
    ["Próximo control", o.nextControlDate ? fmtDate(o.nextControlDate) : null],
    ["Curva de higiene", o.hygieneCurve != null ? `${o.hygieneCurve.toFixed(1)} promedio` : null],
    ["Cuota mensual", o.monthlyFee ? fmtGs(o.monthlyFee) : null],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[250px_1fr]">
      <Card className="flex flex-col items-center gap-4 p-5">
        <div className="flex gap-4">
          <Donut pct={prog.calendarPct} label="Calendario" hint="tiempo" />
          <Donut pct={prog.realPct} label="Real" hint="avance clínico" />
        </div>
        <div className="text-center">
          <span className="text-2xl font-extrabold text-clinic-text">{prog.monthsElapsed}</span>
          <span className="text-sm font-bold text-clinic-muted"> de {prog.totalMonths} meses</span>
        </div>
        <Badge tone="ok">En tratamiento</Badge>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-extrabold text-clinic-text">Seguimiento del tratamiento</h3>
            {canWrite && (
              <div className="flex gap-2">
                <Btn variant="outline" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Editar</Btn>
                <Btn onClick={() => setEvoOpen(true)}><Plus className="h-4 w-4" /> Nueva evolución</Btn>
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map(([k, v]) => <Info key={k} k={k} v={v} />)}
          </div>
          {o.nextSessionNotes && (
            <p className="mt-3 rounded-xl bg-state-infobg p-3 text-sm text-state-info">
              <b>Indicaciones próxima sesión:</b> {o.nextSessionNotes}
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-clinic-muted">Última evolución</h4>
          {last ? (
            <div className="rounded-xl bg-clinic-bg p-3">
              <div className="flex items-center gap-2 text-[11px] text-clinic-muted">
                <Calendar className="h-3.5 w-3.5" /><span className="font-mono font-bold">{fmtDate(last.date)}</span> · {last.by}
              </div>
              <p className="mt-1 text-sm text-clinic-text"><b>Acción realizada:</b> {last.note}</p>
            </div>
          ) : (
            <p className="text-sm text-clinic-muted">Sin evoluciones registradas.</p>
          )}
        </Card>
      </div>

      {editing && <EditTrackingModal o={o} onClose={() => setEditing(false)} onSave={(patch) => { setOrtho(patient.id, { ...o, ...patch }); setEditing(false); }} />}
      {evoOpen && <EvolutionModal onClose={() => setEvoOpen(false)} onSave={(note) => { addOrthoControl(patient.id, { date: new Date().toISOString(), note, by: session!.name }); setEvoOpen(false); }} />}
    </div>
  );
}

function EditTrackingModal({ o, onClose, onSave }: { o: OrthoRecord; onClose: () => void; onSave: (patch: Partial<OrthoRecord>) => void }) {
  const [f, setF] = useState({
    totalMonths: o.totalMonths ?? 24,
    progressReal: o.progressReal ?? 0,
    upperArch: o.upperArch ?? "",
    lowerArch: o.lowerArch ?? "",
    elasticType: o.elasticType ?? "",
    elasticConfig: o.elasticConfig ?? "",
    nextControlDate: o.nextControlDate ? o.nextControlDate.slice(0, 10) : "",
    hygieneCurve: o.hygieneCurve ?? 0,
    nextSessionNotes: o.nextSessionNotes ?? "",
  });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  return (
    <Modal title="Editar seguimiento de ortodoncia" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duración total (meses)"><input type="number" min={1} className={inputCls} value={f.totalMonths} onChange={(e) => set({ totalMonths: Number(e.target.value) })} /></Field>
          <Field label="Avance real (%)"><input type="number" min={0} max={100} className={inputCls} value={f.progressReal} onChange={(e) => set({ progressReal: Number(e.target.value) })} /></Field>
          <Field label="Último arco superior"><input className={inputCls} value={f.upperArch} onChange={(e) => set({ upperArch: e.target.value })} /></Field>
          <Field label="Último arco inferior"><input className={inputCls} value={f.lowerArch} onChange={(e) => set({ lowerArch: e.target.value })} /></Field>
          <Field label="Tipo de elásticos"><input className={inputCls} value={f.elasticType} onChange={(e) => set({ elasticType: e.target.value })} /></Field>
          <Field label="Configuración elásticos"><input className={inputCls} value={f.elasticConfig} onChange={(e) => set({ elasticConfig: e.target.value })} /></Field>
          <Field label="Próximo control"><input type="date" className={inputCls} value={f.nextControlDate} onChange={(e) => set({ nextControlDate: e.target.value })} /></Field>
          <Field label="Curva de higiene"><input type="number" step="0.1" min={0} className={inputCls} value={f.hygieneCurve} onChange={(e) => set({ hygieneCurve: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Indicaciones próxima sesión"><textarea rows={2} className={inputCls} value={f.nextSessionNotes} onChange={(e) => set({ nextSessionNotes: e.target.value })} /></Field>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={() => onSave({
            totalMonths: f.totalMonths || undefined,
            progressReal: Math.min(100, Math.max(0, f.progressReal)),
            upperArch: f.upperArch.trim() || undefined,
            lowerArch: f.lowerArch.trim() || undefined,
            elasticType: f.elasticType.trim() || undefined,
            elasticConfig: f.elasticConfig.trim() || undefined,
            nextControlDate: f.nextControlDate ? new Date(f.nextControlDate + "T09:00:00").toISOString() : undefined,
            hygieneCurve: f.hygieneCurve || undefined,
            nextSessionNotes: f.nextSessionNotes.trim() || undefined,
          })}>Guardar</Btn>
        </div>
      </div>
    </Modal>
  );
}

function EvolutionModal({ onClose, onSave }: { onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Modal title="Nueva evolución" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Acción realizada / observaciones">
          <textarea autoFocus rows={3} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Activación, cambio de arco, colocación de elásticos, higiene…" />
        </Field>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn disabled={!note.trim()} onClick={() => onSave(note.trim())}>Guardar evolución</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Plantilla fotográfica ---------- */
function OrthoFotos({ patient, canWrite }: { patient: Patient; canWrite: boolean }) {
  const { session, addPatientFile, removePatientFile } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const photos = (patient.files ?? []).filter((f) => f.kind === "imagen");

  const onPick = async (file: File) => {
    setError("");
    if ((patient.files ?? []).length >= MAX_FILES) {
      setError(`Máximo ${MAX_FILES} archivos por paciente en el plan actual (incluye Archivos).`);
      return;
    }
    try {
      const dataUrl = await resizeToDataUrl(file, { maxDim: 1000, quality: 0.72 });
      addPatientFile(patient.id, { id: `file_${Date.now()}`, name: file.name, kind: "imagen", dataUrl, uploadedAt: new Date().toISOString(), by: session!.name });
    } catch (e: any) {
      setError(e?.message ?? "No se pudo procesar la imagen.");
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-extrabold text-clinic-text">Plantilla fotográfica</h3>
        {canWrite && (
          <>
            <Btn onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4" /> Subir foto</Btn>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
          </>
        )}
      </div>
      {error && <p className="mb-3 rounded-xl bg-state-errbg p-3 text-sm font-semibold text-state-err">{error}</p>}
      {photos.length === 0 ? (
        <Empty title="Sin fotos clínicas" desc="Subí fotos intraorales/extraorales del seguimiento." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((f) => (
            <div key={f.id} className="overflow-hidden rounded-xl border border-clinic-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.dataUrl} alt={f.name} className="h-32 w-full object-cover" />
              <div className="flex items-center gap-1 p-2">
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-clinic-text">{f.name}</span>
                {canWrite && <button onClick={() => removePatientFile(patient.id, f.id)} className="grid h-6 w-6 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err" aria-label="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------- Diagnóstico ---------- */
function OrthoDiagnostico({ patient, canWrite }: { patient: Patient; canWrite: boolean }) {
  const { setOrtho } = useStore();
  const o = patient.ortho!;
  const [text, setText] = useState(o.diagnosis ?? "");
  const dirty = text.trim() !== (o.diagnosis ?? "").trim();
  const dxNotes = patient.emr.filter((n) => n.kind === "diagnostico");
  return (
    <Card className="space-y-4 p-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-extrabold text-clinic-text">Diagnóstico ortodóncico</h3>
          {canWrite && dirty && <Btn onClick={() => setOrtho(patient.id, { ...o, diagnosis: text.trim() })}><CircleCheck className="h-4 w-4" /> Guardar</Btn>}
        </div>
        <textarea rows={3} className={inputCls} value={text} disabled={!canWrite} onChange={(e) => setText(e.target.value)} placeholder="Clase, apiñamiento, mordida, plan…" />
      </div>
      {dxNotes.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-clinic-muted">Diagnósticos en el historial</h4>
          <div className="space-y-2">
            {dxNotes.map((n) => (
              <div key={n.id} className="rounded-xl bg-clinic-bg p-3 text-sm">
                <div className="text-[11px] text-clinic-muted">{n.authorName} · {fmtDate(n.createdAt)}</div>
                <p className="text-clinic-text">{n.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- Plan de tratamiento (ítems del presupuesto) ---------- */
function OrthoPlan({ budget }: { budget: Budget }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-clinic-text">Plan de tratamiento</h3>
        <a href="/app/presupuestos" className="text-xs font-bold text-azure-600 hover:underline">Gestionar →</a>
      </div>
      <PrestacionesList budget={budget} />
    </div>
  );
}

/* ---------- Activación del módulo ---------- */
function ActivateModal({ prev, onClose, onSave }: { prev?: OrthoRecord; onClose: () => void; onSave: (rec: OrthoRecord) => void }) {
  const [applianceType, setApplianceType] = useState(prev?.applianceType ?? "Brackets metálicos");
  const [diagnosis, setDiagnosis] = useState(prev?.diagnosis ?? "");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [monthlyFee, setMonthlyFee] = useState(prev?.monthlyFee ?? 350000);
  const [totalMonths, setTotalMonths] = useState(prev?.totalMonths ?? 24);
  return (
    <Modal title="Activar ortodoncia" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Aparatología">
          <select className={inputCls} value={applianceType} onChange={(e) => setApplianceType(e.target.value)}>
            <option>Brackets metálicos</option>
            <option>Brackets metálicos autoligado</option>
            <option>Brackets estéticos (cerámicos)</option>
            <option>Alineadores transparentes</option>
            <option>Ortopedia funcional</option>
          </select>
        </Field>
        <Field label="Diagnóstico ortodóncico"><textarea rows={2} className={inputCls} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Clase, apiñamiento, mordida…" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Inicio"><input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="Duración (meses)"><input type="number" min={1} className={inputCls} value={totalMonths} onChange={(e) => setTotalMonths(Number(e.target.value))} /></Field>
          <Field label="Cuota (Gs)"><input type="number" min={0} className={inputCls} value={monthlyFee} onChange={(e) => setMonthlyFee(Number(e.target.value))} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn
            disabled={!diagnosis.trim()}
            onClick={() => onSave({
              active: true, applianceType, diagnosis: diagnosis.trim(),
              startDate: new Date(startDate + "T09:00:00").toISOString(),
              monthlyFee, totalMonths, progressReal: prev?.progressReal ?? 0,
              controls: prev?.controls ?? [],
            })}
          >
            Activar
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
