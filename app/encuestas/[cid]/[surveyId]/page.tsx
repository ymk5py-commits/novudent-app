"use client";
/** Página pública para responder una encuesta (sin sesión). Carga la definición
 *  vía /api/encuestas y envía la respuesta por el mismo route (usuario de servicio). */
import { useEffect, useState } from "react";
import type { Survey } from "@/lib/types";

export default function PublicSurveyPage({ params }: { params: { cid: string; surveyId: string } }) {
  const { cid, surveyId } = params;
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [clinicName, setClinicName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("");
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/encuestas?cid=${encodeURIComponent(cid)}&surveyId=${encodeURIComponent(surveyId)}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "No se pudo cargar la encuesta."); return d; })
      .then((d) => { setSurvey(d.survey as Survey); setClinicName(d.clinicName || ""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [cid, surveyId]);

  const set = (qid: string, v: number | string) => setAnswers((a) => ({ ...a, [qid]: v }));

  const ratingQ = survey?.questions.filter((q) => q.type === "rating") ?? [];
  const npsQ = survey?.questions.find((q) => q.type === "nps");
  const ready = survey ? (npsQ ? answers[npsQ.id] !== undefined : ratingQ.every((q) => answers[q.id] !== undefined)) : false;

  const submit = async () => {
    if (!survey) return;
    setBusy(true); setError(null);
    const npsScore = npsQ && answers[npsQ.id] !== undefined ? Number(answers[npsQ.id]) : undefined;
    const commentQ = survey.questions.find((q) => q.type === "text");
    const comment = commentQ ? String(answers[commentQ.id] ?? "") : undefined;
    const ans = ratingQ.map((q) => ({ questionId: q.id, value: Number(answers[q.id]) })).filter((a) => Number.isFinite(a.value));
    try {
      const r = await fetch("/api/encuestas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cid, surveyId, patientName, answers: ans, npsScore, comment }),
      });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "No se pudo enviar.");
      setDone(true);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-clinic-bg to-white px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="rounded-3xl border border-clinic-border bg-white p-6 shadow-card sm:p-8">
          {loading ? (
            <p className="py-12 text-center text-sm text-clinic-muted">Cargando…</p>
          ) : error && !survey ? (
            <p className="py-12 text-center text-sm text-state-err">{error}</p>
          ) : done ? (
            <div className="py-10 text-center">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-state-okbg text-3xl">🙌</div>
              <h1 className="text-lg font-extrabold text-clinic-text">¡Gracias por tu respuesta!</h1>
              <p className="mt-1 text-sm text-clinic-muted">Tu opinión nos ayuda a mejorar la atención.</p>
            </div>
          ) : survey ? (
            <>
              {clinicName && <div className="mb-1 text-center text-xs font-bold uppercase tracking-wide text-azure-600">{clinicName}</div>}
              <h1 className="mb-6 text-center text-xl font-extrabold text-clinic-text">{survey.title}</h1>

              <div className="space-y-6">
                {survey.questions.map((q) => (
                  <div key={q.id}>
                    <label className="mb-2 block text-sm font-bold text-clinic-text">{q.text}</label>
                    {q.type === "nps" ? (
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from({ length: 11 }, (_, n) => (
                          <button key={n} onClick={() => set(q.id, n)} className={`h-9 w-9 rounded-lg border text-sm font-bold transition-colors ${answers[q.id] === n ? "border-azure-600 bg-azure-600 text-white" : "border-clinic-border text-clinic-text hover:border-azure-300"}`}>{n}</button>
                        ))}
                        <div className="mt-1 flex w-full justify-between text-[10px] text-clinic-muted"><span>Nada probable</span><span>Muy probable</span></div>
                      </div>
                    ) : q.type === "rating" ? (
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} onClick={() => set(q.id, n)} className={`h-11 flex-1 rounded-xl border text-base font-bold transition-colors ${answers[q.id] === n ? "border-azure-600 bg-azure-50 text-azure-700" : "border-clinic-border text-clinic-muted hover:border-azure-300"}`}>{n}★</button>
                        ))}
                      </div>
                    ) : (
                      <textarea rows={3} value={String(answers[q.id] ?? "")} onChange={(e) => set(q.id, e.target.value)} className="w-full rounded-xl border border-clinic-border px-3 py-2 text-sm focus:border-azure-400 focus:outline-none" placeholder="Escribí tu comentario…" />
                    )}
                  </div>
                ))}

                <div>
                  <label className="mb-2 block text-sm font-bold text-clinic-text">Tu nombre <span className="font-normal text-clinic-muted">(opcional)</span></label>
                  <input value={patientName} onChange={(e) => setPatientName(e.target.value)} className="w-full rounded-xl border border-clinic-border px-3 py-2 text-sm focus:border-azure-400 focus:outline-none" />
                </div>

                {error && <p className="rounded-xl bg-state-errbg px-3 py-2 text-xs font-semibold text-state-err">{error}</p>}
                <button onClick={submit} disabled={!ready || busy} className="w-full rounded-xl bg-azure-600 py-3 text-sm font-bold text-white transition-colors hover:bg-azure-700 disabled:opacity-40">{busy ? "Enviando…" : "Enviar respuesta"}</button>
              </div>
            </>
          ) : null}
        </div>
        <p className="mt-4 text-center text-[11px] text-clinic-muted">Encuesta segura · Novudent</p>
      </div>
    </div>
  );
}
