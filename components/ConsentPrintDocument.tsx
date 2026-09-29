"use client";

import { PrintLetterhead, PrintPortal } from "@/components/PrintDocument";
import type { Clinic, SignatureDoc } from "@/lib/types";

type Props = { clinic: Clinic; doc: SignatureDoc; patientName: string };

const signedDate = (iso?: string) => iso
  ? new Date(iso).toLocaleString("es-PY", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
  : "—";

export function ConsentPrintDocument({ clinic, doc, patientName }: Props) {
  return (
    <PrintPortal>
      <div className="plan-print-root" aria-hidden="true" data-testid="consent-print-document">
        <article className="plan-print-sheet">
          <PrintLetterhead clinic={clinic} label="CONSENTIMIENTO INFORMADO" />

          <header className="consent-print-intro">
            <span className="plan-print-eyebrow">DOCUMENTO CLÍNICO FIRMADO</span>
            <h1>{doc.title}</h1>
            <div className="consent-print-meta">
              <div><span>Paciente</span><strong>{patientName}</strong></div>
              <div><span>Fecha de firma</span><strong>{signedDate(doc.signedAt)}</strong></div>
            </div>
          </header>

          <section className="consent-print-body" aria-label="Texto del consentimiento">{doc.body}</section>

          <div className="consent-print-ending">
            <section className="consent-print-signature" aria-label="Firma del consentimiento">
              <div>
                <span className="plan-print-eyebrow">FIRMA DEL PACIENTE</span>
                {doc.signatureImage
                  ? <img src={doc.signatureImage} alt="Firma del paciente" />
                  : <p>Sin imagen de firma.</p>}
                <strong>{doc.signedByName || patientName}</strong>
                <span>{doc.channel === "remoto" ? "Firmado desde el celular" : "Firmado en consultorio"} · {signedDate(doc.signedAt)}</span>
              </div>
            </section>

            <footer className="plan-print-footer">
              <span>Firma electrónica simple — válida para consentimiento clínico.</span>
              <span>Documento N.º {doc.id}</span>
            </footer>
          </div>
        </article>
      </div>
    </PrintPortal>
  );
}
