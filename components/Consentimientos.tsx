"use client";
/**
 * Consentimientos / firma electrónica — ConsentimientosTab.
 *
 * La clínica crea un consentimiento desde una plantilla (snapshot inmutable del
 * texto) y lo hace firmar:
 *   - "Firmar acá": pad en pantalla (consultorio) → queda firmado al instante.
 *   - "Firmar desde el celular": QR + enlace a la página pública /firmar/{cid}/{token}
 *     (el paciente firma con su propio teléfono; lo escribe la ruta /api/firmar).
 * Los documentos firmados se ven e imprimen; se pueden anular.
 *
 * - Gate de plan: feature `firma_electronica` (Clínica + Cadena).
 * - RBAC: crear/firmar/anular = gestión administrativa de documentos, mismo
 *   criterio que Formularios (`engagement.forms`: admin + asistente). El dentista
 *   y otros roles ven los documentos en solo lectura.
 * - El QR se genera en el cliente con `qrcode` (sin red); la URL apunta a la
 *   página pública por `cid` + `token` (el token ES la credencial de firma).
 */
import { useEffect, useRef, useState } from "react";
import {
  FileSignature, Plus, PenLine, Smartphone, Printer, Ban, Eye, X, Lock, ShieldCheck,
  Copy, Check, Loader2, QrCode,
} from "lucide-react";
import QRCode from "qrcode";
import type { Patient, SignatureDoc, SignatureStatus } from "@/lib/types";
import { Card, Btn, Badge, Field, inputCls, Empty, useDialogA11y } from "@/components/ui";
import { useStore, fullName } from "@/lib/store";
import { can } from "@/lib/rbac";
import { useClinicPlan, PlanLocked } from "@/components/PlanGate";
import { newSignToken } from "@/lib/firma";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";

/* ===== Constantes de presentación ===== */

const LEGAL_NOTE = "Firma electrónica simple — válida para consentimiento clínico.";

const STATUS_META: Record<SignatureStatus, { label: string; tone: "warn" | "ok" | "err" }> = {
  pendiente: { label: "Pendiente", tone: "warn" },
  firmado: { label: "Firmado", tone: "ok" },
  anulado: { label: "Anulado", tone: "err" },
};

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("es-PY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

/* ============================================================== */
/*  Componente principal                                          */
/* ============================================================== */

export function ConsentimientosTab({ patient }: { patient: Patient }) {
  const plan = useClinicPlan();
  const { session } = useStore();

  // Gate de plan — antes que nada.
  if (!plan.features.includes("firma_electronica")) {
    return <PlanLocked feature="firma_electronica" />;
  }
  if (!session) return null;

  // Consentimientos = documento administrativo → mismo permiso que Formularios.
  const canManage = can(session.role, "engagement.forms");
  return <ConsentimientosInner patient={patient} canManage={canManage} />;
}

function ConsentimientosInner({ patient, canManage }: { patient: Patient; canManage: boolean }) {
  const { db, session, addSignature, updateSignature } = useStore();

  const templates = db.clinics[0].config.consentTemplates ?? [];
  const clinicId = db.clinics[0].id;
  const patientName = fullName(patient);

  const [tplId, setTplId] = useState<string>("");
  // Doc que se está firmando en consultorio (pad abierto).
  const [signing, setSigning] = useState<SignatureDoc | null>(null);
  // Doc cuyo QR/enlace remoto está abierto.
  const [sharing, setSharing] = useState<SignatureDoc | null>(null);
  // Doc firmado que se está viendo / imprimiendo.
  const [viewing, setViewing] = useState<SignatureDoc | null>(null);

  const docs = db.signatures
    .filter((s) => s.patientId === patient.id)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  /* ---- Crear consentimiento desde una plantilla ---- */
  function createFromTemplate() {
    if (!session) return;
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    const doc: SignatureDoc = {
      id: crypto.randomUUID(),
      patientId: patient.id,
      templateId: tpl.id,
      title: tpl.title, // snapshot
      body: tpl.body, // snapshot inmutable
      status: "pendiente",
      token: newSignToken(),
      createdBy: session.userId,
      createdAt: new Date().toISOString(),
    };
    addSignature(doc);
    setTplId("");
  }

  /* ---- Confirmar firma en consultorio ---- */
  function confirmSign(doc: SignatureDoc, signatureImage: string, signedByName: string) {
    updateSignature({
      ...doc,
      status: "firmado",
      signatureImage,
      signedAt: new Date().toISOString(),
      signedByName,
      channel: "consultorio",
    });
    setSigning(null);
  }

  /* ---- Anular ---- */
  function annul(doc: SignatureDoc) {
    updateSignature({ ...doc, status: "anulado" });
  }

  return (
    <div className="space-y-5">
      {/* Nota legal SIEMPRE visible */}
      <div className="flex items-start gap-2 rounded-2xl bg-state-infobg px-4 py-3 text-xs font-semibold leading-relaxed text-state-info">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        {LEGAL_NOTE}
      </div>

      {!canManage && (
        <p className="flex items-center gap-1.5 rounded-xl bg-clinic-bg p-3 text-sm text-clinic-muted">
          <Lock className="h-3.5 w-3.5" /> Tu rol tiene acceso de <b>solo lectura</b>. Podés ver los consentimientos; crearlos, firmarlos o anularlos lo hace un administrador o asistente.
        </p>
      )}

      {/* ---- Nuevo consentimiento ---- */}
      {canManage && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-azure-100 text-azure-700">
              <FileSignature className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-extrabold text-clinic-text">Nuevo consentimiento</h2>
              <p className="text-xs text-clinic-muted">
                Elegí una plantilla; se crea como pendiente para firmar en consultorio o desde el celular del paciente.
              </p>
            </div>
          </div>

          {templates.length === 0 ? (
            <p className="rounded-xl bg-state-warnbg px-3.5 py-2.5 text-xs font-semibold text-state-warn">
              No hay plantillas cargadas. Creá plantillas de consentimiento en Configuración.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Plantilla">
                <select className={inputCls} value={tplId} onChange={(e) => setTplId(e.target.value)}>
                  <option value="">Elegir plantilla…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </Field>
              <Btn onClick={createFromTemplate} disabled={!tplId}>
                <Plus className="h-4 w-4" /> Crear consentimiento
              </Btn>
            </div>
          )}
        </Card>
      )}

      {/* ---- Lista de documentos ---- */}
      <div>
        <h3 className="mb-2 text-sm font-extrabold text-clinic-text">Consentimientos del paciente</h3>
        {docs.length === 0 ? (
          <Empty title="Sin consentimientos" desc="Los consentimientos creados aparecerán acá." />
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => {
              const meta = STATUS_META[doc.status];
              return (
                <Card key={doc.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-clinic-text">{doc.title}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-clinic-muted">
                        Creado {fmtDate(doc.createdAt)}
                        {doc.status === "firmado" && doc.signedByName ? ` · Firmado por ${doc.signedByName}` : ""}
                        {doc.status === "firmado" && doc.signedAt ? ` el ${fmtDate(doc.signedAt)}` : ""}
                        {doc.status === "firmado" && doc.channel ? ` · ${doc.channel === "consultorio" ? "En consultorio" : "Desde el celular"}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {doc.status === "pendiente" && canManage && (
                        <>
                          <Btn variant="outline" onClick={() => { setSharing(null); setSigning(doc); }}>
                            <PenLine className="h-4 w-4" /> Firmar acá
                          </Btn>
                          <Btn variant="outline" onClick={() => { setSigning(null); setSharing(doc); }}>
                            <Smartphone className="h-4 w-4" /> Firmar desde el celular
                          </Btn>
                        </>
                      )}
                      {doc.status === "firmado" && (
                        <Btn variant="outline" onClick={() => setViewing(doc)}>
                          <Eye className="h-4 w-4" /> Ver / imprimir
                        </Btn>
                      )}
                      {doc.status !== "anulado" && canManage && (
                        <Btn variant="danger" onClick={() => annul(doc)}>
                          <Ban className="h-4 w-4" /> Anular
                        </Btn>
                      )}
                    </div>
                  </div>

                  {/* Pad de firma en consultorio */}
                  {signing?.id === doc.id && (
                    <SignInline
                      defaultName={patientName}
                      onCancel={() => setSigning(null)}
                      onConfirm={(img, name) => confirmSign(doc, img, name)}
                    />
                  )}

                  {/* QR / enlace para firmar desde el celular */}
                  {sharing?.id === doc.id && (
                    <ShareInline
                      url={`${typeof window !== "undefined" ? window.location.origin : ""}/firmar/${clinicId}/${doc.token}`}
                      onClose={() => setSharing(null)}
                    />
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Visor del documento firmado (imprimible) */}
      {viewing && <PrintViewer doc={viewing} patientName={patientName} onClose={() => setViewing(null)} />}
    </div>
  );
}

/* ============================================================== */
/*  Firma en consultorio (pad + nombre)                           */
/* ============================================================== */

function SignInline({
  defaultName,
  onConfirm,
  onCancel,
}: {
  defaultName: string;
  onConfirm: (signatureImage: string, signedByName: string) => void;
  onCancel: () => void;
}) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState(defaultName);
  const [hasInk, setHasInk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Ingresá el nombre de quien firma.");
      return;
    }
    const img = padRef.current?.toDataURL() ?? "";
    if (!img || padRef.current?.isEmpty()) {
      setError("Falta la firma. Dibujá la firma en el recuadro.");
      return;
    }
    onConfirm(img, trimmed);
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-clinic-border bg-clinic-bg p-4">
      <Field label="Nombre de quien firma">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
      </Field>
      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-clinic-muted">Firma</span>
        <SignaturePad ref={padRef} onChange={(d) => setHasInk(!!d)} />
      </div>
      {error && (
        <p className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold text-state-err">{error}</p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Btn variant="outline" onClick={onCancel}>Cancelar</Btn>
        <Btn onClick={confirm} disabled={!hasInk || !name.trim()}>
          <Check className="h-4 w-4" /> Confirmar firma
        </Btn>
      </div>
    </div>
  );
}

/* ============================================================== */
/*  Firma remota: QR + enlace copiable                            */
/* ============================================================== */

function ShareInline({ url, onClose }: { url: string; onClose: () => void }) {
  const [qr, setQr] = useState<string>("");
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    QRCode.toDataURL(url, { margin: 1, width: 220 })
      .then((d) => { if (alive) setQr(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-clinic-border bg-clinic-bg p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-clinic-muted">
          <QrCode className="h-4 w-4" /> Firmar desde el celular
        </p>
        <button onClick={onClose} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white">
          <X className="h-4 w-4 text-clinic-muted" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-[180px] w-[180px] shrink-0 place-items-center rounded-2xl border border-clinic-border bg-white p-2">
          {failed ? (
            <span className="px-2 text-center text-[11px] font-semibold text-state-err">No se pudo generar el QR. Usá el enlace.</span>
          ) : qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Código QR para firmar" className="h-full w-full object-contain" />
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-clinic-muted" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs leading-relaxed text-clinic-muted">
            El paciente escanea el código con la cámara de su celular y firma en su pantalla. También podés enviarle el enlace.
          </p>
          <div className="flex items-center gap-2">
            <input readOnly value={url} className={`${inputCls} font-mono text-[11px]`} onFocus={(e) => e.currentTarget.select()} />
            <Btn variant="outline" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado" : "Copiar"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================== */
/*  Visor imprimible del documento firmado                        */
/* ============================================================== */

function PrintViewer({ doc, patientName, onClose }: { doc: SignatureDoc; patientName: string; onClose: () => void }) {
  // Mismo comportamiento accesible que <Modal>, conservando los estilos print:
  const { titleId, dialogProps } = useDialogA11y(onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/40 p-4 print:static print:bg-transparent print:p-0" onClick={onClose} role="presentation">
      <div
        {...dialogProps}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-pop outline-none print:max-h-none print:w-full print:max-w-none print:rounded-none print:shadow-none"
      >
        <div className="mb-4 flex items-center justify-between print:hidden">
          <h3 id={titleId} className="text-lg font-extrabold text-clinic-text">Consentimiento firmado</h3>
          <div className="flex items-center gap-2">
            <Btn variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir
            </Btn>
            <button onClick={onClose} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-full hover:bg-clinic-bg">
              <X className="h-4 w-4 text-clinic-muted" />
            </button>
          </div>
        </div>

        {/* Área imprimible */}
        <div className="print-area">
          <h1 className="text-xl font-extrabold text-clinic-text">{doc.title}</h1>
          <p className="mt-1 text-xs text-clinic-muted">Paciente: {patientName}</p>

          <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-clinic-text">{doc.body}</div>

          <div className="mt-6 border-t border-clinic-border pt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-clinic-muted">Firma</p>
            {doc.signatureImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.signatureImage} alt="Firma" className="mt-2 h-28 w-auto max-w-full object-contain" />
            ) : (
              <p className="mt-2 text-sm text-clinic-muted">Sin imagen de firma.</p>
            )}
            <p className="mt-2 text-sm font-semibold text-clinic-text">{doc.signedByName}</p>
            <p className="text-xs text-clinic-muted">
              {fmtDate(doc.signedAt)}
              {doc.channel ? ` · ${doc.channel === "consultorio" ? "Firmado en consultorio" : "Firmado desde el celular"}` : ""}
            </p>
          </div>

          <p className="mt-6 text-[11px] text-clinic-muted">{LEGAL_NOTE}</p>
        </div>
      </div>
    </div>
  );
}
