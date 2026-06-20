"use client";
/** Tabs adicionales de la ficha del paciente:
 *  Presupuestos · Recetas (plantillas + impresión) · Archivos (imágenes/documentos) · Ortodoncia */
import { useRef, useState } from "react";
import {
  Plus, Printer, FileSpreadsheet, Pill, Upload, Trash2, ImageIcon, FileText, Braces, CircleCheck, Calendar,
} from "lucide-react";
import { useStore, fmtGs, fmtDate, fullName } from "@/lib/store";
import { can } from "@/lib/rbac";
import { budgetTotal, budgetPaid, patientBalance, BUDGET_STATUS_INFO } from "@/lib/budgets";
import type { Patient, Prescription, PrescriptionItem, PatientFileRec, OrthoRecord } from "@/lib/types";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";

/* ===================== PRESUPUESTOS ===================== */
export function BudgetsTab({ patient }: { patient: Patient }) {
  const { db } = useStore();
  const budgets = db.budgets.filter((b) => b.patientId === patient.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const balance = patientBalance(patient.id, db.budgets, db.payments);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-clinic-border bg-white p-4">
        <div>
          <span className="text-xs font-extrabold uppercase tracking-wide text-clinic-muted">Saldo del paciente</span>
          <div className={`font-mono text-xl font-extrabold ${balance > 0 ? "text-state-err" : "text-state-ok"}`}>{fmtGs(Math.max(0, balance))}</div>
        </div>
        <a href="/app/presupuestos"><Btn variant="outline"><FileSpreadsheet className="h-4 w-4" /> Gestionar presupuestos</Btn></a>
      </div>
      {budgets.length === 0 ? (
        <Empty title="Sin presupuestos" desc="Creá uno desde la sección Presupuestos." />
      ) : (
        budgets.map((b) => {
          const info = BUDGET_STATUS_INFO[b.status];
          const total = budgetTotal(b);
          const paid = budgetPaid(b.id, db.payments);
          return (
            <Card key={b.id} className="flex flex-wrap items-center gap-3 p-4">
              <span className="font-mono text-xs font-bold text-clinic-muted">{fmtDate(b.createdAt)}</span>
              <span className="flex-1 text-sm font-semibold text-clinic-text">
                {b.items.length} procedimiento{b.items.length !== 1 && "s"}
                {b.convenio && <span className="text-clinic-muted"> · {b.convenio}</span>}
                {b.installments && b.installments > 1 && <span className="text-clinic-muted"> · {b.installments} cuotas</span>}
              </span>
              <span className="font-mono text-sm font-extrabold">{fmtGs(total)}</span>
              {(b.status === "aceptado" || b.status === "completado") && total - paid > 0 && (
                <span className="font-mono text-xs font-bold text-state-err">saldo {fmtGs(total - paid)}</span>
              )}
              <Badge tone={info.tone} tip={info.desc}>{info.label}</Badge>
            </Card>
          );
        })
      )}
    </div>
  );
}

/* ===================== RECETAS ===================== */
const RX_TEMPLATES: { name: string; items: PrescriptionItem[]; notes?: string }[] = [
  {
    name: "Antibiótico estándar",
    items: [{ drug: "Amoxicilina 500 mg", dose: "1 cápsula", freq: "cada 8 horas", days: "7 días" }],
    notes: "Completar el tratamiento aunque desaparezcan los síntomas.",
  },
  {
    name: "Post-exodoncia",
    items: [
      { drug: "Ibuprofeno 400 mg", dose: "1 comprimido", freq: "cada 8 horas", days: "3 días" },
      { drug: "Amoxicilina 500 mg", dose: "1 cápsula", freq: "cada 8 horas", days: "7 días" },
    ],
    notes: "No enjuagar las primeras 24 h. Dieta blanda y fría. No fumar.",
  },
  {
    name: "Analgesia simple",
    items: [{ drug: "Paracetamol 500 mg", dose: "1 comprimido", freq: "cada 6-8 horas", days: "según dolor (máx. 3 días)" }],
  },
  { name: "Receta en blanco", items: [{ drug: "", dose: "", freq: "", days: "" }] },
];

export function RxTab({ patient }: { patient: Patient }) {
  const { session, addPrescription } = useStore();
  const [creating, setCreating] = useState(false);
  const [printing, setPrinting] = useState<Prescription | null>(null);
  const canWrite = session ? can(session.role, "emr.write") : false;
  const list = patient.prescriptions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-clinic-muted">Prescripciones con plantillas predefinidas e impresión.</p>
        {canWrite && <Btn onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nueva receta</Btn>}
      </div>
      {list.length === 0 ? (
        <Empty title="Sin recetas emitidas" desc={canWrite ? "Creá la primera con una plantilla." : "El dentista emite las recetas."} />
      ) : (
        list.map((rx) => (
          <Card key={rx.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-clinic-muted">
              <Pill className="h-3.5 w-3.5 text-azure-600" />
              <span className="font-mono font-bold">{fmtDate(rx.date)}</span> · {rx.dentistName}
              <button onClick={() => setPrinting(rx)} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-clinic-border px-2.5 py-1 text-[11px] font-bold text-clinic-text hover:border-azure-300 hover:text-azure-700">
                <Printer className="h-3 w-3" /> Imprimir
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {rx.items.map((it, i) => (
                <li key={i} className="text-sm text-clinic-text">
                  <b>{it.drug}</b> — {it.dose}, {it.freq}, {it.days}
                </li>
              ))}
            </ul>
            {rx.notes && <p className="mt-2 text-xs text-clinic-muted">{rx.notes}</p>}
          </Card>
        ))
      )}

      {creating && (
        <RxForm
          onClose={() => setCreating(false)}
          onSave={(rx) => { addPrescription(patient.id, rx); setCreating(false); setPrinting(rx); }}
        />
      )}
      {printing && <RxPrint rx={printing} patient={patient} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function RxForm({ onClose, onSave }: { onClose: () => void; onSave: (rx: Prescription) => void }) {
  const { session, db } = useStore();
  const [items, setItems] = useState<PrescriptionItem[]>(RX_TEMPLATES[0].items.map((x) => ({ ...x })));
  const [notes, setNotes] = useState(RX_TEMPLATES[0].notes ?? "");
  const setItem = (i: number, patch: Partial<PrescriptionItem>) => setItems((xs) => xs.map((x, ix) => (ix === i ? { ...x, ...patch } : x)));

  return (
    <Modal title="Nueva receta" onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="Plantilla">
          <select
            className={inputCls}
            onChange={(e) => {
              const t = RX_TEMPLATES.find((x) => x.name === e.target.value)!;
              setItems(t.items.map((x) => ({ ...x })));
              setNotes(t.notes ?? "");
            }}
          >
            {RX_TEMPLATES.map((t) => <option key={t.name}>{t.name}</option>)}
          </select>
        </Field>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_32px] gap-2">
              <input className={inputCls} placeholder="Medicamento" value={it.drug} onChange={(e) => setItem(i, { drug: e.target.value })} />
              <input className={inputCls} placeholder="Dosis" value={it.dose} onChange={(e) => setItem(i, { dose: e.target.value })} />
              <input className={inputCls} placeholder="Frecuencia" value={it.freq} onChange={(e) => setItem(i, { freq: e.target.value })} />
              <input className={inputCls} placeholder="Duración" value={it.days} onChange={(e) => setItem(i, { days: e.target.value })} />
              <button onClick={() => setItems((xs) => xs.filter((_, ix) => ix !== i))} className="grid h-9 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err" aria-label="Quitar">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Btn variant="outline" onClick={() => setItems((xs) => [...xs, { drug: "", dose: "", freq: "", days: "" }])}><Plus className="h-3.5 w-3.5" /> Agregar medicamento</Btn>
        </div>
        <Field label="Indicaciones">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn
            disabled={items.length === 0 || items.some((x) => !x.drug.trim())}
            onClick={() =>
              onSave({
                id: `rx_${Date.now()}`, date: new Date().toISOString(),
                dentistId: session!.userId, dentistName: session!.name,
                items: items.map((x) => ({ drug: x.drug.trim(), dose: x.dose.trim(), freq: x.freq.trim(), days: x.days.trim() })),
                notes: notes.trim() || undefined,
              })
            }
          >
            Emitir receta
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function RxPrint({ rx, patient, onClose }: { rx: Prescription; patient: Patient; onClose: () => void }) {
  const { db } = useStore();
  const clinic = db.clinics[0];
  return (
    <Modal title="Receta" onClose={onClose}>
      <div className="print-area space-y-5">
        <div className="border-b border-clinic-border pb-3">
          <div className="font-logo text-lg tracking-[0.16em] text-navy-800">NOVUdent</div>
          <div className="text-xs text-clinic-muted">{clinic.name} · {clinic.config.address} · {clinic.config.phone}</div>
        </div>
        <div className="text-sm">
          <div><span className="text-clinic-muted">Paciente:</span> <b>{fullName(patient)}</b> · CI {patient.document}</div>
          <div><span className="text-clinic-muted">Fecha:</span> {new Date(rx.date).toLocaleDateString("es-PY")}</div>
        </div>
        <div className="rounded-xl border border-clinic-border p-4">
          <div className="mb-2 text-2xl font-extrabold text-clinic-text">℞</div>
          <ul className="space-y-2">
            {rx.items.map((it, i) => (
              <li key={i} className="text-sm text-clinic-text">
                <b>{it.drug}</b><br />
                <span className="text-clinic-muted">{it.dose} — {it.freq} — {it.days}</span>
              </li>
            ))}
          </ul>
          {rx.notes && <p className="mt-3 border-t border-clinic-border pt-2 text-xs text-clinic-muted">{rx.notes}</p>}
        </div>
        <div className="pt-8 text-center text-sm">
          <div className="mx-auto w-56 border-t border-clinic-text pt-1 font-bold">{rx.dentistName}</div>
          <div className="text-xs text-clinic-muted">Odontólogo/a</div>
        </div>
        <div className="flex justify-end gap-2 print:hidden">
          <Btn variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir / PDF</Btn>
          <Btn onClick={onClose}>Cerrar</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ===================== ARCHIVOS ===================== */
export const MAX_FILES = 6;
const MAX_DATAURL = 250_000; // ~250 KB por archivo (límite doc Firestore 1 MB)

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      let q = 0.72;
      let out = canvas.toDataURL("image/jpeg", q);
      while (out.length > MAX_DATAURL && q > 0.3) {
        q -= 0.12;
        out = canvas.toDataURL("image/jpeg", q);
      }
      out.length > MAX_DATAURL ? reject(new Error("La imagen sigue siendo muy pesada tras comprimir.")) : resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen.")); };
    img.src = url;
  });
}

export function FilesTab({ patient }: { patient: Patient }) {
  const { session, addPatientFile, removePatientFile } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<PatientFileRec | null>(null);
  const canDelete = session ? can(session.role, "emr.write") : false;
  const files = patient.files ?? [];

  const onPick = async (f: File) => {
    setError("");
    if (files.length >= MAX_FILES) { setError(`Máximo ${MAX_FILES} archivos por paciente en el plan actual.`); return; }
    try {
      if (f.type.startsWith("image/")) {
        const dataUrl = await compressImage(f);
        addPatientFile(patient.id, { id: `file_${Date.now()}`, name: f.name, kind: "imagen", dataUrl, uploadedAt: new Date().toISOString(), by: session!.name });
      } else {
        if (f.size > 180_000) { setError("Documentos: máximo 180 KB (PDF liviano). Las imágenes se comprimen automáticamente."); return; }
        const dataUrl = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = () => rej(new Error("No se pudo leer el archivo."));
          r.readAsDataURL(f);
        });
        addPatientFile(patient.id, { id: `file_${Date.now()}`, name: f.name, kind: "documento", dataUrl, uploadedAt: new Date().toISOString(), by: session!.name });
      }
    } catch (e: any) {
      setError(e.message ?? "Error al procesar el archivo.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-clinic-muted">Radiografías, fotos clínicas y documentos ({files.length}/{MAX_FILES}). Las imágenes se comprimen automáticamente.</p>
        <Btn onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4" /> Subir archivo</Btn>
        <input
          ref={inputRef} type="file" accept="image/*,.pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }}
        />
      </div>
      {error && <p className="rounded-xl bg-state-errbg p-3 text-sm font-semibold text-state-err">{error}</p>}
      {files.length === 0 ? (
        <Empty title="Sin archivos" desc="Subí radiografías o fotos clínicas del paciente." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((f) => (
            <Card key={f.id} className="group overflow-hidden">
              <button onClick={() => setViewing(f)} className="block w-full">
                {f.kind === "imagen" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.dataUrl} alt={f.name} className="h-32 w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <div className="grid h-32 w-full place-items-center bg-clinic-bg"><FileText className="h-10 w-10 text-clinic-muted" /></div>
                )}
              </button>
              <div className="flex items-center gap-2 p-2.5">
                {f.kind === "imagen" ? <ImageIcon className="h-3.5 w-3.5 shrink-0 text-azure-600" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-azure-600" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-bold text-clinic-text">{f.name}</span>
                  <span className="block text-[10px] text-clinic-muted">{fmtDate(f.uploadedAt)} · {f.by}</span>
                </span>
                {canDelete && (
                  <button onClick={() => removePatientFile(patient.id, f.id)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err" title="Eliminar archivo">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)} wide>
          {viewing.kind === "imagen" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewing.dataUrl} alt={viewing.name} className="max-h-[70vh] w-full rounded-xl object-contain" />
          ) : (
            <div className="space-y-3 py-6 text-center">
              <FileText className="mx-auto h-12 w-12 text-clinic-muted" />
              <a href={viewing.dataUrl} download={viewing.name}><Btn>Descargar documento</Btn></a>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ===================== ORTODONCIA ===================== */
export function OrthoTab({ patient }: { patient: Patient }) {
  const { session, setOrtho, addOrthoControl } = useStore();
  const [activating, setActivating] = useState(false);
  const [adding, setAdding] = useState(false);
  const canWrite = session ? can(session.role, "emr.write") : false;
  const o = patient.ortho;

  if (!o?.active) {
    return (
      <div className="rounded-2xl border border-dashed border-clinic-border bg-white p-10 text-center">
        <Braces className="mx-auto h-10 w-10 text-azure-300" />
        <h3 className="mt-3 text-sm font-extrabold text-clinic-text">Módulo de ortodoncia inactivo</h3>
        <p className="mt-1 text-sm text-clinic-muted">Activá el módulo para registrar aparatología, cuota mensual y controles.</p>
        {o && !o.active && <p className="mt-2 text-xs text-clinic-muted">Tratamiento anterior finalizado ({o.controls.length} controles registrados).</p>}
        {canWrite && <div className="mt-4"><Btn onClick={() => setActivating(true)}><Plus className="h-4 w-4" /> Activar ortodoncia</Btn></div>}
        {activating && <OrthoForm prev={o} onClose={() => setActivating(false)} onSave={(rec) => { setOrtho(patient.id, rec); setActivating(false); }} />}
      </div>
    );
  }

  const sorted = [...o.controls].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-azure-100"><Braces className="h-5 w-5 text-azure-700" /></span>
            <div>
              <h3 className="font-extrabold text-clinic-text">{o.applianceType}</h3>
              <p className="text-xs text-clinic-muted">{o.diagnosis}</p>
            </div>
          </div>
          <Badge tone="ok">En tratamiento</Badge>
        </div>
        <div className="mt-4 grid gap-3 rounded-xl bg-clinic-bg p-4 text-sm sm:grid-cols-3">
          <div><span className="block text-[11px] text-clinic-muted">Inicio</span><b>{fmtDate(o.startDate)}</b></div>
          <div><span className="block text-[11px] text-clinic-muted">Cuota mensual</span><b className="font-mono">{fmtGs(o.monthlyFee)}</b></div>
          <div><span className="block text-[11px] text-clinic-muted">Controles</span><b>{o.controls.length}</b></div>
        </div>
        {canWrite && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Agregar control</Btn>
            <Btn variant="outline" onClick={() => setOrtho(patient.id, { ...o, active: false })}><CircleCheck className="h-4 w-4" /> Finalizar tratamiento</Btn>
          </div>
        )}
      </Card>

      <div className="space-y-0">
        <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-clinic-muted">Controles mensuales</h4>
        {sorted.length === 0 ? (
          <Empty title="Sin controles registrados" />
        ) : (
          <div className="relative space-y-3 pl-5 before:absolute before:bottom-2 before:left-1.5 before:top-2 before:w-px before:bg-clinic-border">
            {sorted.map((c, i) => (
              <Card key={i} className="relative p-4">
                <span className="absolute -left-5 top-5 h-3 w-3 rounded-full border-2 border-white bg-azure-500" />
                <div className="flex items-center gap-2 text-[11px] text-clinic-muted">
                  <Calendar className="h-3.5 w-3.5" /><span className="font-mono font-bold">{fmtDate(c.date)}</span> · {c.by}
                </div>
                <p className="mt-1 text-sm text-clinic-text">{c.note}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      {adding && (
        <Modal title="Nuevo control de ortodoncia" onClose={() => setAdding(false)}>
          <ControlForm onSave={(note) => { addOrthoControl(patient.id, { date: new Date().toISOString(), note, by: session!.name }); setAdding(false); }} onClose={() => setAdding(false)} />
        </Modal>
      )}
    </div>
  );
}

function ControlForm({ onSave, onClose }: { onSave: (note: string) => void; onClose: () => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3">
      <Field label="Observaciones del control">
        <textarea autoFocus rows={3} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Activación, cambio de arco, higiene, próximos pasos…" />
      </Field>
      <div className="flex justify-end gap-2">
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn disabled={!note.trim()} onClick={() => onSave(note.trim())}>Guardar control</Btn>
      </div>
    </div>
  );
}

function OrthoForm({ prev, onClose, onSave }: { prev?: OrthoRecord; onClose: () => void; onSave: (rec: OrthoRecord) => void }) {
  const [applianceType, setApplianceType] = useState(prev?.applianceType ?? "Brackets metálicos");
  const [diagnosis, setDiagnosis] = useState(prev?.diagnosis ?? "");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [monthlyFee, setMonthlyFee] = useState(prev?.monthlyFee ?? 350000);
  return (
    <Modal title="Activar módulo de ortodoncia" onClose={onClose}>
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
        <Field label="Diagnóstico ortodóncico">
          <textarea rows={2} className={inputCls} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Clase, apiñamiento, mordida…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio"><input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="Cuota mensual (Gs)"><input type="number" min={0} className={inputCls} value={monthlyFee} onChange={(e) => setMonthlyFee(Number(e.target.value))} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn
            disabled={!diagnosis.trim()}
            onClick={() => onSave({ active: true, applianceType, diagnosis: diagnosis.trim(), startDate: new Date(startDate + "T09:00:00").toISOString(), monthlyFee, controls: prev?.controls ?? [] })}
          >
            Activar módulo
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
