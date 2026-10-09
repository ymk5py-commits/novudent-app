"use client";
/** Vista previa, impresión y envío por correo de un documento clínico. Mismo patrón que el
 *  visor de consentimientos: un diálogo para mirarlo y, aparte, la hoja que sale por la
 *  impresora (en un portal directo en <body>, con el membrete de la clínica). */
import { Printer } from "lucide-react";
import { PrintLetterhead, PrintPortal } from "@/components/PrintDocument";
import { EmailButton } from "@/components/EmailButton";
import { Badge, Btn, useDialogA11y, useAvisoDeCierre, BotonCerrar } from "@/components/ui";
import { fullName } from "@/lib/store";
import { documentoHtml, respuestasParaImprimir, sexoDe } from "@/lib/documentosClinicos";
import type { Clinic, DocumentoClinico, Patient } from "@/lib/types";

const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString("es-PY", { day: "numeric", month: "long", year: "numeric" });

const AVISO_BORRADOR = "BORRADOR — pendiente de revisión por un odontólogo";

type Props = { doc: DocumentoClinico; clinic: Clinic; paciente: Patient; profesional?: string };

/** La hoja que sale por la impresora. Oculta en pantalla (`.plan-print-root`). */
function HojaImpresa({ doc, clinic, paciente, profesional }: Props) {
  const secciones = respuestasParaImprimir(doc, sexoDe(paciente));
  return (
    <PrintPortal>
      <div className="plan-print-root" aria-hidden="true" data-testid="docclin-print-document">
        <article className="plan-print-sheet">
          <PrintLetterhead clinic={clinic} label="DOCUMENTO CLÍNICO" />

          <header className="docclin-print-intro">
            <h1>{doc.nombre}</h1>
            {doc.porRevisar && <p className="docclin-print-borrador">{AVISO_BORRADOR}</p>}
            <div className="docclin-print-meta">
              <div><span>Paciente</span><strong>{fullName(paciente)}</strong></div>
              <div><span>Fecha</span><strong>{fechaLarga(doc.completedAt ?? doc.createdAt)}</strong></div>
              {profesional && <div><span>Profesional</span><strong>{profesional}</strong></div>}
            </div>
          </header>

          {doc.tipo === "texto" ? (
            <section className="docclin-print-cuerpo" aria-label="Texto del documento">{doc.cuerpo}</section>
          ) : secciones.length === 0 ? (
            <p className="docclin-print-cuerpo">Sin respuestas registradas.</p>
          ) : (
            secciones.map((s) => (
              <section key={s.titulo} className="docclin-print-seccion">
                <h2>{s.titulo}</h2>
                <table className="docclin-print-filas">
                  <tbody>
                    {s.filas.map((f) => <tr key={f.etiqueta}><th scope="row">{f.etiqueta}</th><td>{f.valor}</td></tr>)}
                  </tbody>
                </table>
              </section>
            ))
          )}

          <footer className="plan-print-footer">
            <span>Documento clínico — {clinic.name}</span>
            <span>Documento N.º {doc.id}</span>
          </footer>
        </article>
      </div>
    </PrintPortal>
  );
}

export function VisorDocumentoClinico({ doc, clinic, paciente, profesional, onClose }: Props & { onClose: () => void }) {
  const { titleId, dialogProps } = useDialogA11y();
  const { aviso, alTocarElFondo } = useAvisoDeCierre();
  const secciones = respuestasParaImprimir(doc, sexoDe(paciente));
  const fecha = fechaLarga(doc.completedAt ?? doc.createdAt);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/40 p-4 print:static print:bg-transparent print:p-0" onClick={alTocarElFondo} role="presentation">
      <div
        {...dialogProps}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto overscroll-contain rounded bg-white p-6 shadow-pop outline-none print:max-h-none print:w-full print:max-w-none print:rounded-none print:shadow-none"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <h3 id={titleId} className="text-lg font-bold text-clinic-text">Documento clínico</h3>
          <div className="flex flex-wrap items-center gap-2">
            <EmailButton
              to={paciente.email}
              subject={`${doc.nombre} — ${clinic.name}`}
              html={documentoHtml(doc, { clinica: clinic.name, paciente: fullName(paciente), fecha, profesional, sexo: sexoDe(paciente) })}
              label="Enviar por correo"
            />
            <Btn variant="outline" onClick={() => window.print()}><Printer aria-hidden className="h-4 w-4" /> Imprimir</Btn>
            <BotonCerrar onClose={onClose} aviso={aviso} />
          </div>
        </div>

        {/* Vista previa con el mismo membrete que la hoja impresa. */}
        <div>
          <PrintLetterhead clinic={clinic} label="DOCUMENTO CLÍNICO" />
          <h1 className="text-[16px] font-bold text-clinic-text">{doc.nombre}</h1>
          {doc.porRevisar && <p className="mt-2"><Badge tone="warn">{AVISO_BORRADOR}</Badge></p>}
          <p className="mt-1 text-xs text-clinic-muted">
            Paciente: {fullName(paciente)} · {fecha}{profesional ? ` · ${profesional}` : ""}
          </p>

          {doc.tipo === "texto" ? (
            <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-clinic-text">{doc.cuerpo}</div>
          ) : secciones.length === 0 ? (
            <p className="mt-4 text-sm text-clinic-muted">Sin respuestas registradas.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {secciones.map((s) => (
                <section key={s.titulo}>
                  <h4 className="mb-1 border-l-4 border-azure-600 pl-2 text-[12px] font-bold uppercase tracking-wide text-azure-700">{s.titulo}</h4>
                  <dl className="divide-y divide-clinic-border text-sm">
                    {s.filas.map((f) => (
                      <div key={f.etiqueta} className="grid gap-x-4 py-1.5 sm:grid-cols-[42%_1fr]">
                        <dt className="text-clinic-muted">{f.etiqueta}</dt>
                        <dd className="text-clinic-text">{f.valor}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
      <HojaImpresa doc={doc} clinic={clinic} paciente={paciente} profesional={profesional} />
    </div>
  );
}
