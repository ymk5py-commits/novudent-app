"use client";
/** Encuestas de satisfacción y NPS (spec 7.4): constructor + link público para
 *  responder (estilo firma electrónica) + resultados gráficos. */
import { useState } from "react";
import { useStore, fmtDate } from "@/lib/store";
import { can } from "@/lib/rbac";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { Star, Plus, Pencil, Trash2, Link2, Check, X } from "lucide-react";
import { npsStats, satisfactionAverages } from "@/lib/encuestas";
import type { Survey, SurveyQuestion, SurveyKind } from "@/lib/types";

export default function EncuestasPage() {
  const { db, session, addSurvey, updateSurvey, deleteSurvey } = useStore();
  const canManage = session ? can(session.role, "practice.config") : false;
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Survey | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const surveys = [...db.surveys].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sel = surveys.find((s) => s.id === selId) ?? surveys[0] ?? null;
  const responsesOf = (id: string) => db.surveyResponses.filter((r) => r.surveyId === id);

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/encuestas/${db.clinics[0]?.id}/${id}`;
    try { navigator.clipboard?.writeText(url); } catch { /* sin portapapeles */ }
    setCopied(id); setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Reveal className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-azure-50 text-azure-600"><Star className="h-5 w-5" /></span>
          <div>
            <h1 className="text-lg font-extrabold text-clinic-text">Encuestas y NPS</h1>
            <p className="text-[11px] text-clinic-muted">Satisfacción del paciente y recomendación (NPS), con link para responder.</p>
          </div>
        </div>
        {canManage && <Btn className="ml-auto" onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Nueva encuesta</Btn>}
      </div>

      {surveys.length === 0 ? (
        <Empty title="Sin encuestas" desc="Creá tu primera encuesta de satisfacción o NPS." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <div className="space-y-3">
            {surveys.map((s) => {
              const count = responsesOf(s.id).length;
              return (
                <div key={s.id} role="button" tabIndex={0} onClick={() => setSelId(s.id)} className={`cursor-pointer rounded-2xl border bg-white p-4 shadow-card transition-colors ${sel?.id === s.id ? "border-azure-400 ring-1 ring-azure-300" : "border-clinic-border hover:border-azure-200"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-clinic-text">{s.title}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge tone={s.kind === "nps" ? "info" : "ok"}>{s.kind === "nps" ? "NPS" : "Satisfacción"}</Badge>
                        {!s.active && <Badge tone="muted">Inactiva</Badge>}
                        <span className="text-[11px] text-clinic-muted">{count} resp.</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <button onClick={(e) => { e.stopPropagation(); copyLink(s.id); }} className="inline-flex items-center gap-1 rounded-lg border border-clinic-border px-2 py-1 text-[11px] font-bold text-clinic-muted hover:border-azure-300 hover:text-azure-700">
                      {copied === s.id ? <><Check className="h-3 w-3 text-state-ok" /> Copiado</> : <><Link2 className="h-3 w-3" /> Copiar link</>}
                    </button>
                    {canManage && <button onClick={(e) => { e.stopPropagation(); setEditing(s); setShowForm(true); }} className="rounded-lg p-1.5 text-clinic-muted hover:bg-clinic-bg hover:text-azure-700" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>}
                    {canManage && <button onClick={(e) => { e.stopPropagation(); if (confirm("¿Eliminar esta encuesta?")) deleteSurvey(s.id); }} className="rounded-lg p-1.5 text-clinic-muted hover:bg-clinic-bg hover:text-state-err" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                </div>
              );
            })}
          </div>

          <div>{sel && <Resultados survey={sel} responses={responsesOf(sel.id)} />}</div>
        </div>
      )}

      {showForm && (
        <SurveyForm
          survey={editing}
          clinicId={db.clinics[0]?.id ?? ""}
          onClose={() => setShowForm(false)}
          onSave={(s) => { if (editing) updateSurvey(s); else addSurvey(s); setShowForm(false); setSelId(s.id); }}
        />
      )}
    </Reveal>
  );
}

function Resultados({ survey, responses }: { survey: Survey; responses: import("@/lib/types").SurveyResponse[] }) {
  const comments = responses.map((r) => ({ name: r.patientName, text: r.comment, date: r.createdAt })).filter((c) => c.text);
  return (
    <Card className="p-5">
      <h3 className="mb-1 font-extrabold text-clinic-text">{survey.title}</h3>
      <p className="mb-4 text-[11px] text-clinic-muted">{responses.length} respuesta(s).</p>

      {survey.kind === "nps" ? <NpsResultados responses={responses} /> : <SatResultados survey={survey} responses={responses} />}

      {comments.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Comentarios</div>
          <ul className="space-y-2">
            {comments.slice(0, 12).map((c, i) => (
              <li key={i} className="rounded-xl border border-clinic-border bg-clinic-bg/40 p-3 text-sm">
                <span className="text-clinic-text">“{c.text}”</span>
                <span className="ml-1 text-[11px] text-clinic-muted">— {c.name ?? "Anónimo"} · {fmtDate(c.date)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function NpsResultados({ responses }: { responses: import("@/lib/types").SurveyResponse[] }) {
  const s = npsStats(responses);
  const tone = s.nps >= 50 ? "text-state-ok" : s.nps >= 0 ? "text-state-warn" : "text-state-err";
  const Bar = ({ label, pct, n, color }: { label: string; pct: number; n: number; color: string }) => (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs"><span className="font-bold text-clinic-text">{label}</span><span className="text-clinic-muted">{n} · {pct}%</span></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-clinic-bg"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
  return (
    <div>
      <div className="mb-4 flex items-baseline gap-3">
        <span className={`font-mono text-5xl font-extrabold ${tone}`}>{s.nps}</span>
        <span className="text-sm font-bold text-clinic-muted">NPS · {s.n} respuestas</span>
      </div>
      <div className="space-y-3">
        <Bar label="Promotores (9-10)" pct={s.promPct} n={s.prom} color="#0E9F6E" />
        <Bar label="Pasivos (7-8)" pct={s.pasPct} n={s.pas} color="#F59E0B" />
        <Bar label="Detractores (0-6)" pct={s.detPct} n={s.det} color="#E24B4A" />
      </div>
    </div>
  );
}

function SatResultados({ survey, responses }: { survey: Survey; responses: import("@/lib/types").SurveyResponse[] }) {
  const avgs = satisfactionAverages(survey, responses);
  if (avgs.length === 0) return <p className="text-sm text-clinic-muted">Esta encuesta no tiene preguntas con puntaje.</p>;
  return (
    <div className="space-y-3">
      {avgs.map((a) => (
        <div key={a.question}>
          <div className="mb-1 flex items-center justify-between text-sm"><span className="font-bold text-clinic-text">{a.question}</span><span className="font-mono font-bold text-azure-700">{a.avg.toFixed(1)} / 5</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-clinic-bg"><div className="h-full rounded-full bg-azure-500" style={{ width: `${(a.avg / 5) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function SurveyForm({ survey, clinicId, onClose, onSave }: {
  survey: Survey | null; clinicId: string; onClose: () => void; onSave: (s: Survey) => void;
}) {
  const [title, setTitle] = useState(survey?.title ?? "");
  const [kind, setKind] = useState<SurveyKind>(survey?.kind ?? "satisfaccion");
  const [active, setActive] = useState(survey?.active ?? true);
  const [questions, setQuestions] = useState<SurveyQuestion[]>(
    survey?.questions ?? [
      { id: "q1", text: "Atención del personal", type: "rating" },
      { id: "q2", text: "Comentarios", type: "text" },
    ],
  );

  const setQ = (i: number, patch: Partial<SurveyQuestion>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const addQ = (type: SurveyQuestion["type"]) => setQuestions((qs) => [...qs, { id: `q_${Date.now()}`, text: type === "nps" ? "¿Qué tan probable es que nos recomiendes?" : type === "text" ? "Comentarios" : "Pregunta", type }]);
  const delQ = (i: number) => setQuestions((qs) => qs.filter((_, j) => j !== i));

  const guardar = () => {
    if (!title.trim()) return;
    // En NPS aseguramos que exista al menos una pregunta nps
    let qs = questions;
    if (kind === "nps" && !qs.some((q) => q.type === "nps")) qs = [{ id: "nps", text: "¿Qué tan probable es que nos recomiendes?", type: "nps" }, ...qs];
    onSave({
      id: survey?.id ?? `sv_${Date.now()}`,
      clinicId: survey?.clinicId ?? clinicId,
      title: title.trim(),
      kind,
      active,
      questions: qs,
      createdAt: survey?.createdAt ?? new Date().toISOString(),
    });
  };

  const TYPE_LABEL: Record<SurveyQuestion["type"], string> = { rating: "Puntaje 1-5", nps: "NPS 0-10", text: "Texto abierto" };

  return (
    <Modal title={survey ? "Editar encuesta" : "Nueva encuesta"} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Ej. Encuesta de satisfacción" /></Field>
          <Field label="Tipo">
            <select value={kind} onChange={(e) => setKind(e.target.value as SurveyKind)} className={inputCls}>
              <option value="satisfaccion">Satisfacción</option>
              <option value="nps">NPS</option>
            </select>
          </Field>
          <Field label="Estado">
            <button onClick={() => setActive((a) => !a)} className={`mt-1 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold ${active ? "border-state-ok/40 bg-state-okbg text-state-ok" : "border-clinic-border text-clinic-muted"}`}>
              {active ? <><Check className="h-4 w-4" /> Activa</> : <><X className="h-4 w-4" /> Inactiva</>}
            </button>
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-clinic-text">Preguntas</span>
            <div className="flex gap-1.5">
              <button onClick={() => addQ("rating")} className="rounded-lg border border-clinic-border px-2 py-1 text-[11px] font-bold text-clinic-muted hover:text-azure-700">+ Puntaje</button>
              <button onClick={() => addQ("nps")} className="rounded-lg border border-clinic-border px-2 py-1 text-[11px] font-bold text-clinic-muted hover:text-azure-700">+ NPS</button>
              <button onClick={() => addQ("text")} className="rounded-lg border border-clinic-border px-2 py-1 text-[11px] font-bold text-clinic-muted hover:text-azure-700">+ Texto</button>
            </div>
          </div>
          <div className="space-y-2">
            {questions.map((q, i) => (
              <div key={q.id} className="flex items-center gap-2">
                <input value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} className={`${inputCls} flex-1`} />
                <select value={q.type} onChange={(e) => setQ(i, { type: e.target.value as SurveyQuestion["type"] })} className={`${inputCls} w-36`}>
                  {(["rating", "nps", "text"] as const).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
                <button onClick={() => delQ(i)} className="rounded-lg p-2 text-clinic-muted hover:bg-clinic-bg hover:text-state-err" title="Quitar"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-clinic-border px-4 py-2 text-sm font-bold text-clinic-muted hover:text-clinic-text">Cancelar</button>
          <Btn onClick={guardar}>Guardar encuesta</Btn>
        </div>
      </div>
    </Modal>
  );
}
