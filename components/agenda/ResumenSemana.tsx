"use client";
/** El resumen semanal de la IA. Se pide al abrirlo y al tocar «Actualizar»: no se vuelve a pedir solo
 *  cada vez que cambia la agenda (cada pedido es una llamada al modelo). */
import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { mensajeErrorIA, type DatosResumenSemana } from "@/lib/agendaIA";
import { useStore, CLINICA_DEMO_ID } from "@/lib/store";
import { iaFetch } from "@/components/NovudentIA";

export function ResumenSemana({ datos }: { datos: DatosResumenSemana }) {
  const { session } = useStore();
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const ultimos = useRef(datos);
  useEffect(() => { ultimos.current = datos; });

  async function pedir() {
    setEstado("cargando");
    try {
      const res = await iaFetch("/api/ia/agenda-resumen", { datos: ultimos.current });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(mensajeErrorIA(res.status, data.error, session?.clinicId === CLINICA_DEMO_ID));
      setTexto(String(data.resumen));
      setEstado("listo");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEstado("error");
    }
  }
  // Una vez al abrir.
  useEffect(() => { void pedir(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-label="Resumen de la semana" className="mt-4 rounded-xl border border-azure-200 bg-azure-50/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-azure-700"><Sparkles aria-hidden className="h-4 w-4" /> Resumen de la semana</h3>
        <button type="button" onClick={() => void pedir()} disabled={estado === "cargando"} className="inline-flex items-center gap-1 text-xs font-bold text-azure-700 hover:underline disabled:opacity-50">
          <RefreshCw aria-hidden className={`h-3 w-3 ${estado === "cargando" ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>
      {estado === "cargando" && (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-clinic-muted"><Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Armando tu resumen…</p>
      )}
      {estado === "listo" && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-clinic-text">{texto}</p>}
      {estado === "error" && <p role="alert" className="mt-3 text-sm font-semibold text-state-err">{error}</p>}
    </section>
  );
}
