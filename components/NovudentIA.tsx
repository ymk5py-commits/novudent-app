"use client";
/**
 * Novudent IA — componentes de la suite de inteligencia en la ficha:
 *
 *   <VoiceNoteButton />   Dictado por voz → nota clínica estructurada.
 *                         MediaRecorder → /api/ia/nota-voz (Gemini) →
 *                         review editable → addEmrNote.
 *
 *   <PatientBriefButton /> "Preparar consulta": brief pre-consulta de
 *                         la ficha completa vía /api/ia/resumen-paciente.
 *
 * La key de Gemini vive en el servidor (route handlers) — acá solo
 * viajan audio/datos y vuelve el resultado.
 */
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Sparkles, Loader2, X, Copy, Check, Send, ShieldCheck, RefreshCw } from "lucide-react";
import type { EmrNote, Patient } from "@/lib/types";
import { Btn, Modal, Field, inputCls, Card } from "@/components/ui";

/* ============================================================== */
/*  Dictado por voz                                                */
/* ============================================================== */

type VoiceState = "idle" | "recording" | "processing" | "review";

export function VoiceNoteButton({
  patientName,
  author,
  onSave,
}: {
  patientName: string;
  author: { id: string; name: string };
  onSave: (n: EmrNote) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn variant="outline" onClick={() => setOpen(true)}>
        <Mic className="h-4 w-4" /> Dictar nota
      </Btn>
      {open && (
        <VoiceNoteModal
          patientName={patientName}
          author={author}
          onClose={() => setOpen(false)}
          onSave={(n) => {
            onSave(n);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function VoiceNoteModal({
  patientName,
  author,
  onClose,
  onSave,
}: {
  patientName: string;
  author: { id: string; name: string };
  onClose: () => void;
  onSave: (n: EmrNote) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [kind, setKind] = useState<EmrNote["kind"]>("nota");
  const [text, setText] = useState("");
  const [transcript, setTranscript] = useState("");
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

  async function start() {
    setError(null);
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
        void process(new Blob(chunksRef.current, { type: mime }), mime);
      };
      rec.start(1000);
      recRef.current = rec;
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      setState("recording");
    } catch {
      setError("No se pudo acceder al micrófono. Revisá los permisos del navegador.");
    }
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    recRef.current?.stop();
    setState("processing");
  }

  async function process(blob: Blob, mime: string) {
    try {
      const buf = await blob.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const b64 = btoa(bin);

      const res = await fetch("/api/ia/nota-voz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: b64, mimeType: mime, patientName }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setKind(data.kind);
      setText(data.text);
      setTranscript(data.transcript || "");
      setState("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("idle");
    }
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <Modal title="Dictar nota clínica" onClose={onClose}>
      {state === "idle" && (
        <div className="space-y-4 text-center">
          <p className="text-sm text-clinic-muted">
            Dictá la evolución como se la contarías a un colega — la IA la
            transcribe y la redacta como nota clínica estructurada.
          </p>
          <button
            onClick={start}
            className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-azure-600 text-white shadow-lg transition hover:bg-azure-700 active:scale-95"
            aria-label="Comenzar a grabar"
          >
            <Mic className="h-8 w-8" />
          </button>
          {error && (
            <p className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold text-state-err">
              {error}
            </p>
          )}
          <p className="text-xs text-clinic-muted">
            Ej.: «Paciente refiere dolor en pieza 26, se observa caries oclusal
            profunda, se realiza apertura y medicación, próxima sesión
            endodoncia».
          </p>
        </div>
      )}

      {state === "recording" && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-state-errbg">
            <span className="absolute h-20 w-20 animate-ping rounded-full bg-red-400/30" />
            <Mic className="h-8 w-8 text-state-err" />
          </div>
          <p className="font-mono text-2xl font-bold tabular-nums text-clinic-text">
            {mm}:{ss}
          </p>
          <p className="text-xs text-clinic-muted">Grabando… hablá con naturalidad.</p>
          <Btn onClick={stop}>
            <Square className="h-4 w-4" /> Detener y procesar
          </Btn>
        </div>
      )}

      {state === "processing" && (
        <div className="space-y-3 py-6 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-azure-600" />
          <p className="text-sm text-clinic-muted">
            Transcribiendo y redactando la nota clínica…
          </p>
        </div>
      )}

      {state === "review" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({
              id: `n_${Date.now()}`,
              authorId: author.id,
              authorName: author.name,
              createdAt: new Date().toISOString(),
              kind,
              text,
            });
          }}
        >
          <p className="rounded-xl bg-azure-50 px-3.5 py-2.5 text-xs font-semibold text-azure-700">
            <Sparkles className="mr-1 inline h-3.5 w-3.5" />
            Nota generada por IA — revisala y ajustá lo que haga falta antes de guardar.
          </p>
          <Field label="Tipo">
            <select
              className={inputCls}
              value={kind}
              onChange={(e) => setKind(e.target.value as EmrNote["kind"])}
            >
              <option value="diagnostico">Diagnóstico</option>
              <option value="tratamiento">Tratamiento</option>
              <option value="plan">Plan</option>
              <option value="nota">Nota</option>
            </select>
          </Field>
          <Field label="Nota clínica">
            <textarea
              required
              rows={5}
              className={inputCls}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          {transcript && (
            <details className="text-xs text-clinic-muted">
              <summary className="cursor-pointer font-semibold">
                Ver transcripción literal
              </summary>
              <p className="mt-1.5 whitespace-pre-wrap rounded-xl bg-clinic-bg p-3">{transcript}</p>
            </details>
          )}
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setState("idle")}>
              <Mic className="h-4 w-4" /> Regrabar
            </Btn>
            <Btn type="submit">
              <Check className="h-4 w-4" /> Guardar en historial
            </Btn>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ============================================================== */
/*  Preparar consulta (Resumen Clínico)                            */
/* ============================================================== */

export function PatientBriefButton({
  patient,
  context,
}: {
  patient: Patient;
  context: { appointments?: unknown[]; budgets?: unknown[]; billing?: unknown[] };
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setOpen(true);
    if (summary || loading) return;
    setLoading(true);
    setError(null);
    try {
      // Subset compacto — solo lo que el brief necesita.
      const slim = {
        nombre: `${patient.firstName} ${patient.lastName}`,
        nacimiento: patient.birthDate || null,
        aseguradora: patient.insurer || null,
        nps: patient.nps || null,
        historialDesactualizado: patient.historyUpdatePending || false,
        formulariosPendientes: patient.forms.filter((f) => f.status === "pendiente").length,
        evoluciones: (patient.emr || []).slice(0, 8).map((n) => ({
          fecha: n.createdAt.slice(0, 10),
          tipo: n.kind,
          texto: n.text.slice(0, 300),
        })),
        ortodonciaActiva: !!patient.ortho,
      };
      const res = await fetch("/api/ia/resumen-paciente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient: slim, context }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!summary) return;
    await navigator.clipboard.writeText(summary).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      <Btn variant="outline" onClick={load}>
        <Sparkles className="h-4 w-4" /> Preparar consulta
      </Btn>
      {open && (
        <Modal title="Resumen del paciente" onClose={() => setOpen(false)}>
          {loading && (
            <div className="space-y-3 py-6 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-azure-600" />
              <p className="text-sm text-clinic-muted">Preparando el brief pre-consulta…</p>
            </div>
          )}
          {error && (
            <div className="space-y-3">
              <p className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold text-state-err">
                {error}
              </p>
              <div className="flex justify-end">
                <Btn variant="outline" onClick={() => { setError(null); setSummary(null); void load(); }}>
                  Reintentar
                </Btn>
              </div>
            </div>
          )}
          {summary && (
            <div className="space-y-4">
              <p className="rounded-xl bg-azure-50 px-3.5 py-2 text-[11px] font-semibold text-azure-700">
                <Sparkles className="mr-1 inline h-3.5 w-3.5" />
                Generado por IA a partir de la ficha — verificá antes de decidir clínicamente.
              </p>
              <div className="whitespace-pre-wrap rounded-2xl bg-clinic-bg p-4 text-sm leading-relaxed text-clinic-text">
                {summary}
              </div>
              <div className="flex justify-end gap-2">
                <Btn variant="outline" onClick={copy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copiado" : "Copiar"}
                </Btn>
                <Btn onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" /> Cerrar
                </Btn>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

/* ============================================================== */
/*  Reportes IA — "Pregúntale a tus datos"                         */
/* ============================================================== */

const SUGGESTED_QUESTIONS = [
  "¿Cómo vienen los ingresos vs gastos?",
  "¿Qué profesional produjo más?",
  "¿Cómo está la aceptación de presupuestos?",
  "¿Quiénes son los mayores deudores?",
];

export function ReportsIAPanel({ datos }: { datos: unknown }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q?: string) {
    const finalQ = (q ?? question).trim();
    if (!finalQ || loading) return;
    if (q) setQuestion(q);
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/ia/reportes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: finalQ, datos }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAnswer(data.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-azure-100 text-azure-700">
          <Sparkles className="h-4.5 w-4.5 h-5 w-5" />
        </span>
        <div>
          <h2 className="font-extrabold text-clinic-text">Pregúntale a tus datos</h2>
          <p className="text-xs text-clinic-muted">
            Consultá los números de los últimos 30 días en lenguaje natural.
          </p>
        </div>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <input
          className={inputCls + " flex-1"}
          placeholder="Ej: ¿cuánto cobramos este mes y cuánto gastamos?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={400}
          disabled={loading}
        />
        <Btn type="submit" disabled={loading || !question.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Preguntar
        </Btn>
      </form>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => void ask(q)}
            disabled={loading}
            className="rounded-full bg-clinic-bg px-3 py-1.5 text-[11px] font-semibold text-clinic-muted transition hover:bg-azure-50 hover:text-azure-700 disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold text-state-err">
          {error}
        </p>
      )}
      {answer && (
        <div className="mt-3 whitespace-pre-wrap rounded-2xl bg-clinic-bg p-4 text-sm leading-relaxed text-clinic-text">
          {answer}
        </div>
      )}
    </Card>
  );
}

/* ============================================================== */
/*  Contralor IA — parte diario de pendientes                      */
/* ============================================================== */

export function ContralorCard({ pendientes }: { pendientes: unknown }) {
  const [digest, setDigest] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ia/contralor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendientes }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setDigest(data.digest);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-azure-100 text-azure-700">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-extrabold text-clinic-text">Contralor IA</h2>
            <p className="text-xs text-clinic-muted">
              El parte del día: qué atacar primero para que nada quede colgado.
            </p>
          </div>
        </div>
        <Btn variant={digest ? "outline" : "primary"} onClick={run} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : digest ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {digest ? "Actualizar" : "Generar parte del día"}
        </Btn>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold text-state-err">
          {error}
        </p>
      )}
      {digest && (
        <div className="mt-4 whitespace-pre-wrap rounded-2xl bg-clinic-bg p-4 text-sm leading-relaxed text-clinic-text">
          {digest}
        </div>
      )}
    </Card>
  );
}
