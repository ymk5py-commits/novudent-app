"use client";
/**
 * Firma de consentimiento — página PÚBLICA (sin login, sin Shell).
 *
 * El paciente abre el enlace/QR (`/firmar/{cid}/{token}`), lee el documento,
 * pone su nombre, firma en el pad y envía. Todo pasa por /api/firmar — el
 * navegador nunca toca Firestore y el `token` ES la credencial.
 *
 * Mobile-first: pensada para el celular del paciente.
 *
 * Registro visual: el sistema editorial de la landing (components/Landing.tsx).
 * Acá encaja como anillo al dedo — esto ES un documento legal, así que se lee
 * como documento impreso (masthead, filetes, cuerpo con medida) y no como app.
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";

type DocData = {
  title: string;
  body: string;
  status: "pendiente" | "firmado" | "anulado" | string;
  patientName: string;
};

/** Caja de texto editorial: esquinas rectas, filete de 1 px, 44 px de alto. */
const inputCls =
  "w-full min-h-[44px] border border-clinic-border bg-white px-3.5 py-2.5 text-[15px] text-clinic-text placeholder:text-clinic-muted/70 transition-colors focus:border-azure-600 focus:outline-none focus:ring-1 focus:ring-azure-600";

/** Rótulo de sección: la banda mono que corona cada marco. */
const capCls =
  "border-b border-clinic-border px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-clinic-text";

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
    <main className="min-h-dvh bg-paper font-body text-clinic-text">
      {/* ===== Masthead — cabecera de documento, no de app ===== */}
      <header className="ed-rule-double bg-paper">
        <div className="mx-auto max-w-xl px-5">
          <div className="flex items-center justify-between gap-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-clinic-muted">
            <span className="truncate">Novudent · Firma electrónica</span>
            <span className="shrink-0">Consentimiento</span>
          </div>
          <div className="border-t border-clinic-border/70 py-5">
            <h1 className="font-display text-[1.9rem] font-extrabold leading-[1.03] tracking-[-0.03em] text-navy-800 sm:text-4xl">
              {doc?.title || "Consentimiento informado"}
            </h1>
            <p className="mt-2 max-w-[44ch] leading-relaxed text-clinic-muted">
              Leé el documento y firmá desde tu celular.
            </p>
          </div>
        </div>
      </header>

      {/* Sin <Reveal> a propósito — ver la nota en /reservar. Acá pesa más todavía:
          esto es un CONSENTIMIENTO legal que el paciente tiene que leer y firmar.
          Una animación de entrada que puede no dispararse no puede ser lo que se
          interpone entre el paciente y el documento. */}
      <div className="mx-auto max-w-xl space-y-4 px-5 py-6">
        {/* Cargando */}
        {loading && (
          <section className="ed-figure">
            <div className={capCls}>Documento</div>
            <p className="flex items-center justify-center gap-2 px-5 py-14 font-mono text-[11px] uppercase tracking-[0.16em] text-clinic-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando documento…
            </p>
          </section>
        )}

        {/* Error de carga real (no 404) */}
        {!loading && loadError && (
          <section className="ed-figure">
            <div className={capCls}>No se pudo cargar</div>
            <div className="px-5 py-7 sm:px-7">
              <ShieldAlert className="h-8 w-8 text-state-warn" />
              <h2 className="mt-4 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-navy-800">
                El documento no se pudo abrir
              </h2>
              <p className="mt-2 max-w-[46ch] leading-relaxed text-clinic-muted">{loadError}</p>
            </div>
          </section>
        )}

        {/* No disponible: 404 / firmado / anulado */}
        {!loading && !loadError && !pendiente && (
          <section className="ed-figure">
            <div className={capCls}>Estado del documento</div>
            <div className="px-5 py-7 sm:px-7">
              <ShieldAlert className="h-8 w-8 text-clinic-muted" />
              <h2 className="mt-4 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-navy-800">
                Documento no disponible
              </h2>
              <p className="mt-2 max-w-[46ch] leading-relaxed text-clinic-muted">
                {doc?.status === "firmado"
                  ? "Este documento ya fue firmado."
                  : "Este enlace ya no está disponible o el documento fue anulado."}
              </p>
              <p className="mt-5 border-t border-clinic-border pt-4 font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-clinic-muted">
                Si creés que es un error, pedile a la clínica un enlace nuevo.
              </p>
            </div>
          </section>
        )}

        {/* Firmado con éxito */}
        {!loading && done && (
          <section className="ed-figure">
            <div className={capCls}>Firma registrada</div>
            <div className="px-5 py-7 sm:px-7">
              <CheckCircle2 className="h-9 w-9 text-state-ok" />
              <h2 className="mt-4 font-display text-2xl font-extrabold leading-tight tracking-[-0.025em] text-navy-800">
                ¡Gracias! Documento firmado
              </h2>
              <p className="mt-2 max-w-[46ch] leading-relaxed text-clinic-muted">
                Tu firma quedó registrada. Ya podés cerrar esta página.
              </p>
            </div>
          </section>
        )}

        {/* Documento pendiente: leer + firmar */}
        {!loading && !loadError && pendiente && !done && doc && (
          <>
            {/* Texto del consentimiento — cuerpo con medida de lectura */}
            <article className="ed-figure">
              <div className={capCls}>Documento · pendiente de firma</div>
              <div className="px-5 py-6 sm:px-7">
                <h2 className="font-display text-xl font-bold leading-tight tracking-[-0.02em] text-navy-800">
                  {doc.title}
                </h2>
                <div className="mt-4 max-w-[62ch] space-y-4 text-[15px] leading-[1.7] text-clinic-text">
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
              </div>
            </article>

            {/* Firma */}
            <section className="ed-figure">
              <div className={capCls}>Firma del paciente</div>
              <div className="px-5 py-6 sm:px-7">
                <label className="block">
                  <span className="mb-1.5 block font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-clinic-muted">
                    Tu nombre
                  </span>
                  <input
                    className={inputCls}
                    placeholder="Nombre y apellido"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={120}
                    autoComplete="name"
                  />
                </label>

                <p className="mt-5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-clinic-muted">
                  Tu firma
                </p>
                {/* SignaturePad es compartido con el panel (ficha → Consentimientos), así
                    que no se toca: acá le cuadramos las esquinas y le damos 44 px al
                    botón «Borrar» desde afuera, con variantes de Tailwind. */}
                <SignaturePad
                  className="mt-1.5 [&>div]:rounded-none [&_button]:min-h-[44px] [&_button]:rounded-none"
                  placeholder="Firmá acá con el dedo"
                  onChange={(dataUrl) => setHasStroke(!!dataUrl)}
                  ref={padRef}
                />

                {submitError && (
                  <p className="mt-4 border-l-2 border-state-err bg-state-errbg px-3.5 py-2.5 text-[13px] font-semibold leading-relaxed text-state-err">
                    {submitError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!canSubmit}
                  className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 border border-navy-800 bg-navy-800 px-6 py-3 text-sm font-bold text-white transition-colors duration-200 hover:bg-navy-700 disabled:cursor-not-allowed disabled:border-clinic-border disabled:bg-clinic-border disabled:text-clinic-muted"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Firmar
                </button>

                <p className="mt-4 border-t border-clinic-border pt-4 font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-clinic-muted">
                  Firma electrónica simple — válida para consentimiento clínico.
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
