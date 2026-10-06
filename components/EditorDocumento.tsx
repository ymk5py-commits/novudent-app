"use client";
/** Pantalla de edición de un documento clínico (como «Nuevo documento clínico» de Dentalink):
 *  las secciones con sus campos, o el texto, y abajo la barra Descartar y volver · Guardar
 *  borrador · Continuar. Esta pantalla no sabe de la base de datos: avisa lo que hay que
 *  guardar y quien la usa lo guarda (ver DocumentosClinicos). */
import { useEffect, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { limpiarValores, sexoDe, type Valores } from "@/lib/documentosClinicos";
import type { DocumentoClinico, Patient } from "@/lib/types";
import { Badge, Btn, inputCls } from "@/components/ui";
import { SeccionesEditor } from "@/components/CamposDocumento";

/** Los valores como texto estable (sin vacíos y con las claves en orden), para saber si cambiaron. */
const estable = (v: Valores): string =>
  JSON.stringify(Object.entries(limpiarValores(v)).sort(([a], [b]) => a.localeCompare(b)));

export type CambiosDocumento = { valores?: Valores; cuerpo?: string };

export function EditorDocumento({ doc, paciente, puedeEditar, onGuardar, onContinuar, onVolver }: {
  doc: DocumentoClinico;
  paciente: Patient;
  puedeEditar: boolean;
  onGuardar: (c: CambiosDocumento) => void;
  onContinuar: (c: CambiosDocumento) => void;
  onVolver: () => void;
}) {
  const [valores, setValores] = useState<Valores>(doc.valores ?? {});
  const [cuerpo, setCuerpo] = useState(doc.cuerpo ?? "");
  const [guardado, setGuardado] = useState(false);

  const sucio = estable(valores) !== estable(doc.valores ?? {}) || (doc.tipo === "texto" && cuerpo !== (doc.cuerpo ?? ""));
  const cambios = (): CambiosDocumento => (doc.tipo === "texto" ? { cuerpo } : { valores });

  // Mientras hay cambios sin guardar, el navegador avisa antes de cerrar la pestaña.
  useEffect(() => {
    if (!sucio) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sucio]);

  useEffect(() => {
    if (!guardado) return;
    const t = window.setTimeout(() => setGuardado(false), 2500);
    return () => window.clearTimeout(t);
  }, [guardado]);

  const volver = () => {
    if (sucio && !window.confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
    onVolver();
  };
  const guardar = () => { onGuardar(cambios()); setGuardado(true); };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[18px] font-normal text-clinic-text">{doc.estado === "completado" ? "Documento clínico" : "Nuevo documento clínico"}</h2>
        <span className="text-sm font-semibold text-clinic-muted">{doc.nombre}</span>
        {doc.porRevisar && <Badge tone="warn">Por revisar</Badge>}
        {doc.estado === "completado" && <Badge tone="ok">Completado</Badge>}
      </div>

      {doc.porRevisar && (
        <p role="note" className="rounded border border-state-warn/40 bg-state-warnbg px-3 py-2 text-[13px] text-state-warn">
          Este texto es un borrador de Novudent. Antes de entregárselo a un paciente tiene que revisarlo un odontólogo y un administrador
          marcarlo como revisado en Configuración › Documentos clínicos. Mientras tanto, la hoja impresa lleva la leyenda de borrador.
        </p>
      )}

      {doc.tipo === "formulario" ? (
        <SeccionesEditor secciones={doc.secciones ?? []} valores={valores} onChange={setValores} sexo={sexoDe(paciente)} disabled={!puedeEditar} />
      ) : (
        <textarea
          aria-label="Texto del documento"
          rows={22}
          className={`${inputCls} leading-relaxed`}
          value={cuerpo}
          disabled={!puedeEditar}
          onChange={(e) => setCuerpo(e.target.value)}
        />
      )}

      {/* La barra queda pegada al borde de abajo del contenido. `pr-20` deja lugar al botón flotante de ayuda. */}
      <div className="sticky bottom-0 z-20 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-clinic-border bg-white/95 py-3 pl-4 pr-20 backdrop-blur">
        {guardado && <span role="status" className="mr-auto text-[13px] font-semibold text-state-ok">Guardado</span>}
        <Btn variant="ghost" onClick={volver}><Trash2 aria-hidden className="h-4 w-4" /> Descartar y volver</Btn>
        {puedeEditar && (
          <>
            <Btn variant="outline" onClick={guardar} disabled={!sucio}>
              <Save aria-hidden className="h-4 w-4" /> {doc.estado === "completado" ? "Guardar cambios" : "Guardar borrador"}
            </Btn>
            <Btn onClick={() => onContinuar(cambios())}>Continuar</Btn>
          </>
        )}
      </div>
    </div>
  );
}
