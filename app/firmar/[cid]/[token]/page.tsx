"use client";
/**
 * Firma de consentimiento — página PÚBLICA (sin login, sin Shell).
 *
 * El paciente abre el enlace/QR (`/firmar/{cid}/{token}`), lee el documento,
 * pone su nombre, firma en el pad y envía. Todo pasa por /api/firmar — el
 * navegador nunca toca Firestore y el `token` ES la credencial.
 *
 * Mobile-first: pensada para el celular del paciente. Marca Novudent (navy),
 * reusa los tokens de la app (clinic-bg / navy / azure / shadow-card).
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2, Loader2, PenLine, ShieldAlert, FileSignature,
} from "lucide-react";
import { Reveal } from "@/components/motion";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";

type DocData = {
  title: string;
  body: string;
  status: "pendiente" | "firmado" | "anulado" | string;
  patientName: string;
};

const inputCls =
  "w-full rounded-xl border border-clinic-border bg-white px-3.5 py-2.5 text-sm text-clinic-text outline-none transition focus:border-azure-500 focus:ring-2 focus:ring-azure-100";

export default function FirmarConsentimiento() {
  const { cid, token } = useParams<{ cid: string; token: string }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocData | null>(null);

  const [name, setName] = useState("");
  const [hasStroke, setHasStroke] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const padRef = useRef<SignaturePadHandle>(null);

  // Cargar el documento por cid+token.
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/firmar?cid=${encodeURIComponent(cid)}&token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok || !data.ok) {
          // 404 / token inválido → tratamos como "no disponible" sin filtrar nada.
          setDoc(null);
          if (res.status !== 404) setLoadError(data.error || `HTTP ${res.status}`);
        } else {
          setDoc(data as DocData);
          setName(String(data.patientName || ""));
        }
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [cid, token]);

  async function submit() {
    const signatureImage = padRef.current?.toDataURL() || "";
    const signedByName = name.trim();
    if (!signatureImage || !signedByName || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/firmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cid, token, signatureImage, signedByName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (res.status === 409) {
          throw new Error(data.error || "El documento ya fue firmado o no está disponible");
        }
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = hasStroke && name.trim().length > 0 && !submitting;
  const pendiente = doc?.status === "pendiente";

  return (
    <main className="min-h-dvh bg-clinic-bg">
      {/* Header público con marca Novudent */}
      <header className="bg-navy-800 px-5 py-6 text-white">
        <div className="mx-auto max-w-xl">
          <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-azure-200">
            <FileSignature className="h-3.5 w-3.5" /> Novudent · Firma electrónica
          </p>
          <h1 className="mt-1 text-2xl font-extrabold">
            {doc?.title || "Consentimiento informado"}
          </h1>
          <p className="mt-1 text-sm text-white/65">
            Leé el documento y firmá desde tu celular.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-4 px-5 py-6">
        {/* Cargando */}
        {loading && (
          <section className="rounded-3xl bg-white p-8 text-center shadow-card">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-azure-500" />
            <p className="mt-3 text-sm text-clinic-muted">Cargando documento…</p>
          </section>
        )}

        {/* Error de carga real (no 404) */}
        {!loading && loadError && (
          <section className="rounded-3xl bg-white p-8 text-center shadow-card">
            <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
            <h2 className="mt-3 text-lg font-extrabold text-clinic-text">No se pudo cargar</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-clinic-muted">{loadError}</p>
          </section>
        )}

        {/* No disponible: 404 / firmado / anulado */}
        {!loading && !loadError && !pendiente && (
          <Reveal>
            <section className="rounded-3xl bg-white p-8 text-center shadow-card">
              <ShieldAlert className="mx-auto h-10 w-10 text-clinic-muted" />
              <h2 className="mt-3 text-lg font-extrabold text-clinic-text">
                Documento no disponible
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-clinic-muted">
                {doc?.status === "firmado"
                  ? "Este documento ya fue firmado."
                  : "Este enlace ya no está disponible o el documento fue anulado."}
              </p>
            </section>
          </Reveal>
        )}

        {/* Firmado con éxito */}
        {!loading && done && (
          <Reveal>
            <section className="rounded-3xl bg-white p-8 text-center shadow-card">
              <CheckCircle2 className="mx-auto h-12 w-12 text-state-ok" />
              <h2 className="mt-3 text-xl font-extrabold text-clinic-text">
                ¡Gracias! Documento firmado ✓
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-clinic-muted">
                Tu firma quedó registrada. Ya podés cerrar esta página.
              </p>
            </section>
          </Reveal>
        )}

        {/* Documento pendiente: leer + firmar */}
        {!loading && !loadError && pendiente && !done && doc && (
          <Reveal>
            <section className="space-y-4">
              {/* Texto del consentimiento */}
              <article className="rounded-3xl bg-white p-5 shadow-card">
                <h2 className="text-base font-extrabold text-clinic-text">{doc.title}</h2>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-clinic-text/90">
                  {doc.body
                    .split(/\n{2,}/)
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .map((para, i) => (
                      <p key={i} className="whitespace-pre-line">
                        {para}
                      </p>
                    ))}
                </div>
              </article>

              {/* Firma */}
              <section className="rounded-3xl bg-white p-5 shadow-card">
                <label className="block text-xs font-bold uppercase tracking-wide text-clinic-muted">
                  Tu nombre
                </label>
                <input
                  className={`mt-1.5 ${inputCls}`}
                  placeholder="Nombre y apellido"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  autoComplete="name"
                />

                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-clinic-muted">
                  Tu firma
                </p>
                <SignaturePad
                  className="mt-1.5"
                  placeholder="Firmá acá con el dedo"
                  onChange={(dataUrl) => setHasStroke(!!dataUrl)}
                  ref={padRef}
                />

                {submitError && (
                  <p className="mt-3 rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold text-state-err">
                    {submitError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!canSubmit}
                  className="btn-shine mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-azure-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-azure-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                  Firmar
                </button>

                <p className="mt-3 text-center text-[11px] leading-relaxed text-clinic-muted">
                  Firma electrónica simple — válida para consentimiento clínico.
                </p>
              </section>
            </section>
          </Reveal>
        )}
      </div>
    </main>
  );
}
