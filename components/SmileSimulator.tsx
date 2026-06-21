"use client";
/** Simulador de sonrisas IA (spec 10.5): proyecta el resultado estético sobre una
 *  foto del paciente usando el modelo de generación de imagen de Gemini
 *  (/api/ia/simulador). Es una estimación, no un resultado garantizado. */
import { useState } from "react";
import { currentIdToken } from "@/lib/firebase";
import { resizeToDataUrl } from "@/lib/image";
import { Btn } from "@/components/ui";
import { Sparkles, Upload, Loader2, Download, Save } from "lucide-react";

const TREATMENTS = [
  { value: "blanqueamiento", label: "Blanqueamiento" },
  { value: "carillas", label: "Carillas / estética" },
  { value: "ortodoncia", label: "Ortodoncia" },
  { value: "cierre_espacios", label: "Cierre de espacios / implante" },
];

/** Reduce un dataURL a JPEG acotado (para no inflar el doc de Firestore al guardar). */
function shrinkDataUrl(dataUrl: string, maxDim = 640, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d"); if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function SmileSimulator({ onSave }: { onSave?: (dataUrl: string, label: string) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [treatment, setTreatment] = useState("carillas");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (files: FileList | null) => {
    if (!files?.[0]) return;
    setError(null); setResult(null);
    try { setSrc(await resizeToDataUrl(files[0], { maxDim: 768 })); } catch { setError("No se pudo cargar la imagen."); }
  };

  const generar = async () => {
    if (!src) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const token = await currentIdToken();
      const res = await fetch("/api/ia/simulador", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ image: src, mimeType: "image/jpeg", treatment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo generar la simulación.");
      setResult(data.image);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const tLabel = TREATMENTS.find((t) => t.value === treatment)?.label ?? treatment;

  return (
    <div className="rounded-2xl border border-clinic-border bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-azure-50 text-azure-600"><Sparkles className="h-4 w-4" /></span>
        <h3 className="font-extrabold text-clinic-text">Simulador de sonrisas IA</h3>
      </div>
      <p className="mb-3 text-[11px] text-clinic-muted">Proyectá el resultado estético sobre una foto del paciente. Es una estimación, no un resultado garantizado.</p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-clinic-border px-3 py-2 text-xs font-bold text-clinic-text hover:border-azure-300 hover:text-azure-700">
          <Upload className="h-3.5 w-3.5" /> {src ? "Cambiar foto" : "Subir foto"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files); e.currentTarget.value = ""; }} />
        </label>
        <select value={treatment} onChange={(e) => setTreatment(e.target.value)} className="rounded-lg border border-clinic-border px-2 py-2 text-sm text-clinic-text">
          {TREATMENTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <Btn onClick={generar} disabled={!src || busy}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando…</> : <><Sparkles className="h-4 w-4" /> Generar simulación</>}</Btn>
      </div>

      {error && <p className="mt-3 rounded-xl bg-state-errbg px-3 py-2 text-xs font-semibold text-state-err">{error}</p>}

      {(src || result) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Antes</div>
            {src
              ? <img src={src} alt="Antes" className="w-full rounded-xl border border-clinic-border" />
              : <div className="grid aspect-square place-items-center rounded-xl border border-dashed border-clinic-border text-xs text-clinic-muted">Subí una foto</div>}
          </div>
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-clinic-muted">Después (simulado)</div>
            {result ? (
              <div>
                <img src={result} alt="Después" className="w-full rounded-xl border border-azure-300" />
                <div className="mt-2 flex gap-2">
                  {onSave && <Btn variant="outline" onClick={async () => onSave(await shrinkDataUrl(result), `Simulación — ${tLabel}`)}><Save className="h-3.5 w-3.5" /> Guardar en ficha</Btn>}
                  <a href={result} download="simulacion-sonrisa.png" className="inline-flex items-center gap-1.5 rounded-xl border border-clinic-border px-3 py-1.5 text-xs font-bold text-clinic-text hover:border-azure-300"><Download className="h-3.5 w-3.5" /> Descargar</a>
                </div>
              </div>
            ) : (
              <div className="grid aspect-square place-items-center rounded-xl border border-dashed border-clinic-border px-4 text-center text-xs text-clinic-muted">{busy ? "Generando con IA…" : "La simulación aparecerá acá"}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
