"use client";
/** Aviso de que algo NO se guardó en el servidor.
 *
 *  Contrapeso del write-through: el estado local se actualiza primero, así que
 *  la pantalla siempre muestra el cambio como si hubiera salido bien. Cuando
 *  Firestore rechaza la escritura, esto es lo único que se interpone entre el
 *  usuario y perder su trabajo sin enterarse.
 *
 *  Decisiones deliberadas:
 *  · Va fijo abajo y NO se cierra solo. Un toast de tres segundos sobre una
 *    ficha clínica perdida es peor que nada: da la sensación de que se avisó.
 *  · Ante falta de permiso no se ofrece reintentar — no lo va a resolver, y el
 *    botón sería una mentira. Se ofrece copiar el detalle para el administrador.
 *  · Se puede descartar, pero el texto deja claro que descartar no guarda nada.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, X, Copy, Check } from "lucide-react";
import {
  suscribirFallos, reintentarTodo, limpiarFallos, mensajeDe,
  type EscrituraFallida,
} from "@/lib/write-errors";

export default function AvisoNoGuardado() {
  const [fallos, setFallos] = useState<EscrituraFallida[]>([]);
  const [reintentando, setReintentando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => suscribirFallos(setFallos), []);

  if (fallos.length === 0) return null;

  /* La causa más grave manda el mensaje: si hay aunque sea un problema de
     permisos, no se puede prometer que reintentar alcanza. */
  const hayPermiso = fallos.some((f) => f.causa === "permiso");
  const causa = hayPermiso ? "permiso" : fallos.some((f) => f.causa === "conexion") ? "conexion" : "desconocido";
  const { titulo, ayuda } = mensajeDe(causa);
  const puedeReintentar = !hayPermiso && fallos.some((f) => f.reintentar);

  const detalleTecnico = fallos
    .map((f) => `${f.clave} · ${f.causa} · ${f.detalle} · ${f.intentos} intento(s)`)
    .join("\n");

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-x-0 bottom-0 z-[70] border-t-2 border-state-err bg-state-errbg px-4 py-3.5 shadow-[0_-8px_24px_-12px_rgba(16,24,40,0.3)]"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-start gap-x-4 gap-y-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-state-err" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-state-err">
            {titulo}
            {fallos.length > 1 && ` (${fallos.length} cambios)`}
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-clinic-text">{ayuda}</p>
          <p className="mt-1 font-mono text-[11px] text-clinic-muted">
            {fallos.slice(0, 3).map((f) => f.clave).join(" · ")}
            {fallos.length > 3 && ` · y ${fallos.length - 3} más`}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {puedeReintentar && (
            <button
              onClick={async () => { setReintentando(true); try { await reintentarTodo(); } finally { setReintentando(false); } }}
              disabled={reintentando}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-state-err px-3.5 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reintentando ? "animate-spin" : ""}`} />
              {reintentando ? "Reintentando…" : "Reintentar"}
            </button>
          )}
          <button
            onClick={() => {
              try { navigator.clipboard?.writeText(detalleTecnico); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin portapapeles */ }
            }}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-state-err/40 px-3 py-2 text-[13px] font-bold text-state-err transition-colors hover:bg-white/60"
          >
            {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copiado ? "Copiado" : "Copiar detalle"}
          </button>
          <button
            onClick={limpiarFallos}
            aria-label="Descartar el aviso (no guarda los cambios)"
            title="Descartar el aviso — esto NO guarda los cambios"
            className="grid h-[38px] w-[38px] place-items-center rounded-xl text-state-err transition-colors hover:bg-white/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
