"use client";
/**
 * Análisis IA de radiografías — RadiografiasTab.
 *
 * El profesional sube una radiografía (panorámica/bitewing/periapical), la IA
 * (Gemini Vision, vía /api/ia/radiografia) propone hallazgos como cajas sobre la
 * imagen + una explicación para el paciente; el profesional arrastra/redimensiona/
 * agrega/borra las cajas, edita los campos y guarda un RadiographRec revisado.
 *
 * - La key de Gemini vive SOLO en el server; acá viaja la imagen base64 y vuelve
 *   el JSON saneado (validador en lib/radiografia.ts).
 * - Gate de plan: feature `radiografia_ia` (Clínica + Cadena).
 * - RBAC: editar/analizar/guardar = escritura EMR (dentista/admin, igual que el
 *   odontograma). Otros roles: solo ver estudios guardados.
 * - Coordenadas normalizadas 0..1 → las cajas escalan con cualquier tamaño de
 *   render (mismo contrato si después se enchufa un modelo CV dedicado).
 */
import { useEffect, useRef, useState } from "react";
import {
  ScanLine, Upload, Sparkles, Loader2, Save, Trash2, Plus, Eye, EyeOff, X, Lock, ShieldAlert,
} from "lucide-react";
import type { Patient, RadiographRec, RadiographFinding, RxKind, RxSeverity } from "@/lib/types";
import { Card, Btn, Badge, Field, inputCls, Empty } from "@/components/ui";
import { useStore } from "@/lib/store";
import { can } from "@/lib/rbac";
import { useClinicPlan, PlanLocked } from "@/components/PlanGate";
import { resizeToDataUrl, dataUrlBytes } from "@/lib/image";
import { currentIdToken } from "@/lib/firebase";

/* ===== Constantes de presentación ===== */

const MAX_DATAURL_BYTES = 900_000; // tope por debajo del límite de 1 MB de Firestore

const KIND_LABEL: Record<RxKind, string> = {
  panoramica: "Panorámica",
  bitewing: "Bitewing",
  periapical: "Periapical",
  otra: "Otra",
};

const SEVERITY_LABEL: Record<RxSeverity, string> = {
  observacion: "Observación",
  leve: "Leve",
  moderado: "Moderado",
  severo: "Severo",
};

/** Color de borde/etiqueta por severidad (observacion→azure, leve→info, moderado→warn, severo→err). */
const SEVERITY_STYLE: Record<RxSeverity, { border: string; bg: string; text: string; badge: "info" | "warn" | "err" | "muted" }> = {
  observacion: { border: "border-azure-500", bg: "bg-azure-500", text: "text-white", badge: "info" },
  leve: { border: "border-state-info", bg: "bg-state-info", text: "text-white", badge: "info" },
  moderado: { border: "border-state-warn", bg: "bg-state-warn", text: "text-white", badge: "warn" },
  severo: { border: "border-state-err", bg: "bg-state-err", text: "text-white", badge: "err" },
};

const DISCLAIMER = "Herramienta de apoyo al diagnóstico — no reemplaza el criterio del profesional tratante.";

/* ===== Helpers puros de geometría ===== */

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/** Mueve una caja por un delta en fracción, manteniéndola dentro de 0..1. */
function moveBox(box: RadiographFinding["box"], dxFrac: number, dyFrac: number): RadiographFinding["box"] {
  const x = clamp01(box.x + dxFrac);
  const y = clamp01(box.y + dyFrac);
  // recortar al borde para que no se salga
  return {
    x: Math.min(x, 1 - box.w),
    y: Math.min(y, 1 - box.h),
    w: box.w,
    h: box.h,
  };
}

/** Redimensiona desde la esquina inferior-derecha por un delta en fracción. */
function resizeBox(box: RadiographFinding["box"], dwFrac: number, dhFrac: number): RadiographFinding["box"] {
  const w = clamp01(Math.max(box.w + dwFrac, 0.02));
  const h = clamp01(Math.max(box.h + dhFrac, 0.02));
  return {
    x: box.x,
    y: box.y,
    w: Math.min(w, 1 - box.x),
    h: Math.min(h, 1 - box.y),
  };
}

/* ============================================================== */
/*  Componente principal                                          */
/* ============================================================== */

type Draft = {
  /** id existente si se está editando un estudio guardado; null si es nuevo */
  recId: string | null;
  image: string;
  kind: RxKind;
  findings: RadiographFinding[];
  aiSummary: string;
  patientExplanation: string;
  aiModel?: string;
  createdAt?: string;
  createdBy?: string;
};

export function RadiografiasTab({ patient }: { patient: Patient }) {
  const plan = useClinicPlan();
  const { session } = useStore();

  // Gate de plan — antes que nada.
  if (!plan.features.includes("radiografia_ia")) {
    return <PlanLocked feature="radiografia_ia" />;
  }
  if (!session) return null;

  const canEdit = can(session.role, "emr.write");
  return <RadiografiasInner patient={patient} canEdit={canEdit} />;
}

function RadiografiasInner({ patient, canEdit }: { patient: Patient; canEdit: boolean }) {
  const { db, session, addRadiograph, updateRadiograph, deleteRadiograph } = useStore();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [kind, setKind] = useState<RxKind>("panoramica");
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patientView, setPatientView] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const studies = db.radiographs
    .filter((r) => r.patientId === patient.id)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  /* ---- Subida ---- */
  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await resizeToDataUrl(file, { maxDim: 1400, quality: 0.8 });
      if (dataUrlBytes(url) > MAX_DATAURL_BYTES) {
        setError("La imagen sigue siendo muy pesada tras comprimir. Probá con una versión más liviana o de menor resolución.");
        return;
      }
      setDraft((prev) =>
        prev
          ? // Cambiar imagen sobre un estudio abierto: preservar su identidad
            // (recId/createdAt/createdBy) para que el guardado actualice el mismo
            // registro; las cajas viejas no calzan con la nueva imagen → se limpian.
            {
              ...prev,
              image: url,
              findings: [],
              aiSummary: "",
              patientExplanation: "",
            }
          : // Subida nueva: registro nuevo, tipo tomado del selector.
            {
              recId: null,
              image: url,
              kind,
              findings: [],
              aiSummary: "",
              patientExplanation: "",
            },
      );
      setPatientView(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar la imagen.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /* ---- Análisis IA ---- */
  async function analyze() {
    if (!draft || analyzing) return;
    setError(null);
    setAnalyzing(true);
    try {
      const token = await currentIdToken();
      const res = await fetch("/api/ia/radiografia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ image: draft.image, mimeType: "image/jpeg", kind: draft.kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `No se pudo analizar (HTTP ${res.status}).`);
      }
      const findings: RadiographFinding[] = Array.isArray(data.findings)
        ? data.findings.map((f: RadiographFinding) => ({ ...f, id: crypto.randomUUID() }))
        : [];
      setDraft({
        ...draft,
        findings,
        aiSummary: typeof data.summary === "string" ? data.summary : "",
        patientExplanation: typeof data.patientExplanation === "string" ? data.patientExplanation : "",
        aiModel: typeof data.aiModel === "string" ? data.aiModel : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "El asistente de IA no está disponible.");
    } finally {
      setAnalyzing(false);
    }
  }

  /* ---- Edición de findings ---- */
  function patchFinding(id: string, patch: Partial<RadiographFinding>) {
    if (!draft) return;
    setDraft({ ...draft, findings: draft.findings.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  }
  function removeFinding(id: string) {
    if (!draft) return;
    setDraft({ ...draft, findings: draft.findings.filter((f) => f.id !== id) });
  }
  function addFinding() {
    if (!draft) return;
    const nf: RadiographFinding = {
      id: crypto.randomUUID(),
      box: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
      label: "Hallazgo",
      severity: "observacion",
      source: "profesional",
    };
    setDraft({ ...draft, findings: [...draft.findings, nf] });
  }

  /* ---- Guardar ---- */
  function save() {
    if (!draft || !session) return;
    const now = new Date().toISOString();
    const rec: RadiographRec = {
      id: draft.recId ?? crypto.randomUUID(),
      patientId: patient.id,
      kind: draft.kind,
      image: draft.image,
      findings: draft.findings,
      aiSummary: draft.aiSummary || undefined,
      patientExplanation: draft.patientExplanation || undefined,
      aiModel: draft.aiModel,
      status: "revisado",
      createdAt: draft.recId ? draft.createdAt ?? now : now,
      createdBy: draft.recId ? draft.createdBy ?? session.userId : session.userId,
      reviewedBy: session.userId,
      reviewedAt: now,
    };
    if (draft.recId) updateRadiograph(rec);
    else addRadiograph(rec);
    setDraft({ ...draft, recId: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy });
    setSavedToast(true);
  }

  // Auto-oculta el toast de guardado y limpia el timer al desmontar.
  useEffect(() => {
    if (!savedToast) return;
    const t = setTimeout(() => setSavedToast(false), 2200);
    return () => clearTimeout(t);
  }, [savedToast]);

  /* ---- Abrir un estudio guardado ---- */
  function openStudy(r: RadiographRec) {
    setError(null);
    setPatientView(false);
    setDraft({
      recId: r.id,
      image: r.image,
      kind: r.kind,
      findings: r.findings.map((f) => ({ ...f })),
      aiSummary: r.aiSummary ?? "",
      patientExplanation: r.patientExplanation ?? "",
      aiModel: r.aiModel,
      createdAt: r.createdAt,
      createdBy: r.createdBy,
    });
  }

  function closeDraft() {
    setDraft(null);
    setPatientView(false);
    setError(null);
  }

  /* ---- Modo "Mostrar al paciente": vista limpia a pantalla ---- */
  if (draft && patientView) {
    return (
      <PatientView
        image={draft.image}
        findings={draft.findings}
        patientExplanation={draft.patientExplanation}
        onExit={() => setPatientView(false)}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Disclaimer SIEMPRE visible */}
      <div className="flex items-start gap-2 rounded-2xl bg-state-warnbg px-4 py-3 text-xs font-semibold leading-relaxed text-state-warn">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        {DISCLAIMER}
      </div>

      {!canEdit && (
        <p className="flex items-center gap-1.5 rounded-xl bg-clinic-bg p-3 text-sm text-clinic-muted">
          <Lock className="h-3.5 w-3.5" /> Tu rol tiene acceso de <b>solo lectura</b>. Podés ver los estudios guardados; el análisis y la edición son del dentista o administrador.
        </p>
      )}

      {/* ---- Cargar / Analizar ---- */}
      {canEdit && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-azure-100 text-azure-700">
              <ScanLine className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-extrabold text-clinic-text">Análisis IA de radiografías</h2>
              <p className="text-xs text-clinic-muted">
                Subí una radiografía, la IA marca hallazgos sobre la imagen y vos los ajustás.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Field label="Tipo de estudio">
              <select
                className={inputCls}
                value={kind}
                onChange={(e) => {
                  const k = e.target.value as RxKind;
                  setKind(k);
                  if (draft && !draft.recId) setDraft({ ...draft, kind: k });
                }}
              >
                {(Object.keys(KIND_LABEL) as RxKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
            </Field>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <Btn variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {draft ? "Cambiar imagen" : "Subir radiografía"}
            </Btn>
          </div>

          {error && (
            <p className="mt-3 rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold text-state-err">
              {error}
            </p>
          )}
        </Card>
      )}

      {/* ---- Editor del estudio en curso ---- */}
      {draft && (
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge tone="muted">{KIND_LABEL[draft.kind]}</Badge>
              {draft.recId && <Badge tone="ok">Guardado</Badge>}
              {draft.aiModel && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-azure-700">
                  <Sparkles className="h-3.5 w-3.5" /> {draft.aiModel}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <Btn variant="outline" onClick={analyze} disabled={analyzing}>
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {analyzing ? "Analizando…" : draft.findings.length ? "Re-analizar" : "Analizar con IA"}
                </Btn>
              )}
              <Btn variant="outline" onClick={() => setPatientView(true)}>
                <Eye className="h-4 w-4" /> Mostrar al paciente
              </Btn>
              <button onClick={closeDraft} aria-label="Cerrar estudio" className="grid h-9 w-9 place-items-center rounded-xl hover:bg-clinic-bg">
                <X className="h-4 w-4 text-clinic-muted" />
              </button>
            </div>
          </div>

          {analyzing && (
            <p className="mb-3 flex items-center gap-2 rounded-xl bg-azure-50 px-3.5 py-2.5 text-xs font-semibold text-azure-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Leyendo la radiografía y marcando hallazgos…
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {/* Lienzo de anotación */}
            <div>
              <AnnotationCanvas
                image={draft.image}
                findings={draft.findings}
                editable={canEdit}
                onChange={(id, box) => patchFinding(id, { box })}
              />
              {canEdit && (
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[11px] text-clinic-muted">
                    Arrastrá una caja para moverla; la esquina para redimensionarla.
                  </p>
                  <Btn variant="outline" onClick={addFinding}>
                    <Plus className="h-4 w-4" /> Agregar marca
                  </Btn>
                </div>
              )}
            </div>

            {/* Panel de hallazgos + explicación */}
            <div className="space-y-3">
              {draft.aiSummary && (
                <div className="rounded-2xl bg-clinic-bg p-3 text-xs leading-relaxed text-clinic-text">
                  <p className="mb-1 font-bold uppercase tracking-wide text-clinic-muted">Resumen técnico</p>
                  {draft.aiSummary}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-clinic-muted">
                  Hallazgos ({draft.findings.length})
                </p>
                {draft.findings.length === 0 ? (
                  <p className="rounded-xl bg-clinic-bg p-3 text-xs text-clinic-muted">
                    {canEdit ? "Analizá con IA o agregá marcas a mano." : "Sin hallazgos marcados."}
                  </p>
                ) : (
                  draft.findings.map((f, i) => (
                    <FindingRow
                      key={f.id}
                      index={i + 1}
                      finding={f}
                      editable={canEdit}
                      onPatch={(patch) => patchFinding(f.id, patch)}
                      onRemove={() => removeFinding(f.id)}
                    />
                  ))
                )}
              </div>

              <Field label="Explicación para el paciente" hint="Lenguaje simple, sin alarmar. Es lo que se ve en «Mostrar al paciente».">
                <textarea
                  rows={5}
                  className={inputCls}
                  value={draft.patientExplanation}
                  readOnly={!canEdit}
                  onChange={(e) => canEdit && setDraft({ ...draft, patientExplanation: e.target.value })}
                  placeholder="Ej.: En esta radiografía vemos…"
                />
              </Field>

              {canEdit && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {draft.recId && (
                    <Btn
                      variant="danger"
                      onClick={() => {
                        deleteRadiograph(draft.recId!);
                        closeDraft();
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> Eliminar estudio
                    </Btn>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {savedToast && <span className="text-xs font-semibold text-state-ok">Guardado ✓</span>}
                    <Btn onClick={save}>
                      <Save className="h-4 w-4" /> {draft.recId ? "Guardar cambios" : "Guardar estudio"}
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ---- Estudios previos ---- */}
      <div>
        <h3 className="mb-2 text-sm font-extrabold text-clinic-text">Estudios previos</h3>
        {studies.length === 0 ? (
          <Empty title="Sin estudios" desc="Las radiografías analizadas aparecerán acá." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {studies.map((r) => (
              <button
                key={r.id}
                onClick={() => openStudy(r)}
                className="group overflow-hidden rounded-2xl border border-clinic-border bg-white text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-azure-300"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-navy-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.image} alt={`Radiografía ${KIND_LABEL[r.kind]}`} className="h-full w-full object-contain" />
                  {r.findings.map((f) => {
                    const st = SEVERITY_STYLE[f.severity];
                    return (
                      <span
                        key={f.id}
                        className={`absolute border-2 ${st.border}`}
                        style={{
                          left: `${f.box.x * 100}%`,
                          top: `${f.box.y * 100}%`,
                          width: `${f.box.w * 100}%`,
                          height: `${f.box.h * 100}%`,
                        }}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-bold text-clinic-text">{KIND_LABEL[r.kind]}</p>
                    <p className="text-[11px] text-clinic-muted">
                      {new Date(r.createdAt).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric" })} · {r.findings.length} hallazgo{r.findings.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge tone={r.status === "revisado" ? "ok" : "warn"}>{r.status}</Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================== */
/*  Lienzo de anotación (cajas normalizadas + drag/resize)        */
/* ============================================================== */

type DragMode = { id: string; mode: "move" | "resize"; startX: number; startY: number; box: RadiographFinding["box"] };

function AnnotationCanvas({
  image,
  findings,
  editable,
  onChange,
}: {
  image: string;
  findings: RadiographFinding[];
  editable: boolean;
  onChange: (id: string, box: RadiographFinding["box"]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragMode | null>(null);

  function beginDrag(e: React.PointerEvent, f: RadiographFinding, mode: "move" | "resize") {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { id: f.id, mode, startX: e.clientX, startY: e.clientY, box: { ...f.box } };
  }

  function onMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    const el = containerRef.current;
    if (!drag || !el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // delta en píxeles → fracción del contenedor
    const dxFrac = (e.clientX - drag.startX) / rect.width;
    const dyFrac = (e.clientY - drag.startY) / rect.height;
    const nextBox = drag.mode === "move" ? moveBox(drag.box, dxFrac, dyFrac) : resizeBox(drag.box, dxFrac, dyFrac);
    onChange(drag.id, nextBox);
  }

  function endDrag(e: React.PointerEvent) {
    if (dragRef.current) {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      dragRef.current = null;
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden rounded-2xl border border-clinic-border bg-navy-950"
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      {/* La imagen en flujo normal define el alto del contenedor (sin
          object-contain ni alto fijo): así no hay letterbox y las cajas
          en % calzan exactamente sobre la imagen renderizada. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="Radiografía" className="block h-auto w-full" draggable={false} />
      {findings.map((f) => {
        const st = SEVERITY_STYLE[f.severity];
        return (
          <div
            key={f.id}
            onPointerDown={(e) => beginDrag(e, f, "move")}
            className={`absolute border-2 ${st.border} ${editable ? "cursor-move" : ""}`}
            style={{
              left: `${f.box.x * 100}%`,
              top: `${f.box.y * 100}%`,
              width: `${f.box.w * 100}%`,
              height: `${f.box.h * 100}%`,
            }}
          >
            <span className={`absolute -top-0.5 left-0 -translate-y-full whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold ${st.bg} ${st.text}`}>
              {f.label}{f.tooth ? ` · ${f.tooth}` : ""}
              {f.source === "ia" ? "" : " ✎"}
            </span>
            {editable && (
              <span
                onPointerDown={(e) => beginDrag(e, f, "resize")}
                className={`absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-sm border-2 ${st.border} bg-white`}
                aria-label="Redimensionar"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================== */
/*  Fila editable de un hallazgo                                   */
/* ============================================================== */

function FindingRow({
  index,
  finding,
  editable,
  onPatch,
  onRemove,
}: {
  index: number;
  finding: RadiographFinding;
  editable: boolean;
  onPatch: (patch: Partial<RadiographFinding>) => void;
  onRemove: () => void;
}) {
  const st = SEVERITY_STYLE[finding.severity];

  if (!editable) {
    return (
      <div className="rounded-xl border border-clinic-border p-3">
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 shrink-0 rounded-sm ${st.bg}`} />
          <span className="flex-1 text-sm font-bold text-clinic-text">{finding.label}</span>
          <Badge tone={st.badge}>{SEVERITY_LABEL[finding.severity]}</Badge>
        </div>
        {(finding.tooth || finding.note) && (
          <p className="mt-1 text-xs text-clinic-muted">
            {finding.tooth ? `Pieza ${finding.tooth}` : ""}{finding.tooth && finding.note ? " · " : ""}{finding.note}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-clinic-border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-sm text-[10px] font-bold ${st.bg} ${st.text}`}>{index}</span>
        <Badge tone={finding.source === "ia" ? "info" : "muted"}>{finding.source === "ia" ? "IA" : "Profesional"}</Badge>
        <button onClick={onRemove} aria-label="Borrar marca" className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-state-err hover:bg-state-errbg">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          className={inputCls}
          value={finding.label}
          placeholder="Hallazgo"
          onChange={(e) => onPatch({ label: e.target.value })}
        />
        <input
          className={`${inputCls} w-16 text-center`}
          value={finding.tooth ?? ""}
          placeholder="FDI"
          maxLength={4}
          onChange={(e) => onPatch({ tooth: e.target.value.trim() || undefined })}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          className={inputCls}
          value={finding.severity}
          onChange={(e) => onPatch({ severity: e.target.value as RxSeverity })}
        >
          {(Object.keys(SEVERITY_LABEL) as RxSeverity[]).map((s) => (
            <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
          ))}
        </select>
        <input
          className={inputCls}
          value={finding.note ?? ""}
          placeholder="Nota (opcional)"
          onChange={(e) => onPatch({ note: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}

/* ============================================================== */
/*  Modo "Mostrar al paciente" — vista limpia, sin controles      */
/* ============================================================== */

function PatientView({
  image,
  findings,
  patientExplanation,
  onExit,
}: {
  image: string;
  findings: RadiographFinding[];
  patientExplanation: string;
  onExit: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-clinic-text">Tu radiografía</h2>
        <Btn variant="outline" onClick={onExit}>
          <EyeOff className="h-4 w-4" /> Salir de la vista
        </Btn>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="relative w-full bg-navy-950">
          {/* Igual que el lienzo editable: la imagen en flujo normal define el
              alto (sin object-contain ni alto fijo) para que las cajas en %
              calcen sobre la imagen, sin letterbox. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Radiografía" className="block h-auto w-full" draggable={false} />
          {findings.map((f) => {
            const st = SEVERITY_STYLE[f.severity];
            return (
              <div
                key={f.id}
                className={`absolute border-2 ${st.border}`}
                style={{
                  left: `${f.box.x * 100}%`,
                  top: `${f.box.y * 100}%`,
                  width: `${f.box.w * 100}%`,
                  height: `${f.box.h * 100}%`,
                }}
              >
                <span className={`absolute -top-0.5 left-0 -translate-y-full whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold ${st.bg} ${st.text}`}>
                  {f.label}{f.tooth ? ` · ${f.tooth}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {patientExplanation && (
        <Card className="p-5">
          <p className="whitespace-pre-wrap text-base leading-relaxed text-clinic-text">{patientExplanation}</p>
        </Card>
      )}

      <p className="rounded-2xl bg-clinic-bg px-4 py-3 text-center text-xs text-clinic-muted">{DISCLAIMER}</p>
    </div>
  );
}
