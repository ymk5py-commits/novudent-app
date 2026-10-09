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
 * - RBAC: ver la pestaña, crear, firmar y anular = `engagement.forms`. De fábrica lo tienen
 *   el administrador, la caja, la recepción y el comercial (cada clínica puede repartirlo
 *   distinto en «Permisos del equipo»). El dentista y la asistente NO ven la pestaña
 *   «Consentimientos» (la ficha la esconde con ese mismo permiso): lo suyo son los
 *   «Documentos clínicos». La vista de solo lectura de más abajo (`canManage` en falso)
 *   queda como red de seguridad: hoy nadie llega a ella.
 * - El QR se genera en el cliente con `qrcode` (sin red); la URL apunta a la
 *   página pública por `cid` + `token` (el token ES la credencial de firma).
 */
import { useEffect, useRef, useState } from "react";
import {
  FileSignature, PenLine, Smartphone, Printer, Ban, Eye, X, Lock, ShieldCheck,
  Copy, Check, Loader2, QrCode,
} from "lucide-react";
import QRCode from "qrcode";
import type { Budget, Clinic, Patient, SignatureDoc, SignatureStatus, User } from "@/lib/types";
import { Card, Btn, Badge, Field, inputCls, Empty, Modal, useDialogA11y, useAvisoDeCierre, BotonCerrar } from "@/components/ui";
import { useStore, fullName } from "@/lib/store";
import { can } from "@/lib/rbac";
import { useClinicPlan, PlanLocked } from "@/components/PlanGate";
import { newSignToken } from "@/lib/firma";
import { etiquetaPlan } from "@/lib/documentosClinicos";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";
import { PrintLetterhead } from "@/components/PrintDocument";
import { ConsentPrintDocument } from "@/components/ConsentPrintDocument";

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

  const [crearOpen, setCrearOpen] = useState(false);
  const [mostrarAnulados, setMostrarAnulados] = useState(false);
  // Doc que se está firmando en consultorio (pad abierto).
  const [signing, setSigning] = useState<SignatureDoc | null>(null);
  // Doc cuyo QR/enlace remoto está abierto.
  const [sharing, setSharing] = useState<SignatureDoc | null>(null);
  // Doc firmado que se está viendo / imprimiendo.
  const [viewing, setViewing] = useState<SignatureDoc | null>(null);

  const docs = db.signatures
    .filter((s) => s.patientId === patient.id && (mostrarAnulados || s.status !== "anulado"))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Para «Crear nuevo consentimiento» (plan de tratamiento y profesional a cargo, como en Dentalink).
  const planes = db.budgets.filter((b) => b.patientId === patient.id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const dentistas = db.users.filter((u) => u.role === "dentist" && u.active !== false);
  const nombreDe = (id?: string) => db.users.find((u) => u.id === id)?.name;
  const planDe = (id?: string) => { const b = id ? db.budgets.find((x) => x.id === id) : undefined; return b ? etiquetaPlan(b) : undefined; };

  /* ---- Crear consentimiento desde una plantilla ---- */
  function crearConsentimiento(o: { templateId: string; budgetId?: string; dentistId: string }) {
    if (!session) return;
    const tpl = templates.find((t) => t.id === o.templateId);
    if (!tpl) return;
    const doc: SignatureDoc = {
      id: crypto.randomUUID(),
      patientId: patient.id,
      templateId: tpl.id,
      title: tpl.title, // snapshot
      body: tpl.body, // snapshot inmutable
      status: "pendiente",
      token: newSignToken(),
      ...(o.budgetId ? { budgetId: o.budgetId } : {}),
      dentistId: o.dentistId,
      createdBy: session.userId,
      createdAt: new Date().toISOString(),
    };
    addSignature(doc);
    setCrearOpen(false);
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

      {/* ---- Encabezado: Mostrar anulados + Nuevo consentimiento informado ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[18px] font-normal text-clinic-text">Consentimiento informado</h2>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[13px] text-clinic-text">
          <input type="checkbox" className="accent-azure-600" checked={mostrarAnulados} onChange={(e) => setMostrarAnulados(e.target.checked)} />
          Mostrar anulados
        </label>
        {canManage && (
          <Btn onClick={() => setCrearOpen(true)} disabled={templates.length === 0}>
            <FileSignature aria-hidden className="h-4 w-4" /> Nuevo consentimiento informado
          </Btn>
        )}
      </div>
      {canManage && templates.length === 0 && (
        <p className="rounded bg-state-warnbg px-3.5 py-2.5 text-xs font-semibold text-state-warn">
          No hay plantillas cargadas. Creá plantillas de consentimiento en Configuración.
        </p>
      )}

      {/* ---- Lista de documentos ---- */}
      <div>
        {docs.length === 0 ? (
          <Empty title="Este paciente no cuenta con ningún consentimiento informado." desc="Los consentimientos que se creen van a aparecer acá." />
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
                        {nombreDe(doc.dentistId) ? ` · ${nombreDe(doc.dentistId)}` : ""}
                        {planDe(doc.budgetId) ? ` · ${planDe(doc.budgetId)}` : ""}
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

      {crearOpen && (
        <NuevoConsentimientoModal
          templates={templates}
          planes={planes}
          dentistas={dentistas}
          dentistaInicial={session?.role === "dentist" ? session.userId : ""}
          onClose={() => setCrearOpen(false)}
          onCrear={crearConsentimiento}
        />
      )}

      {/* Visor del documento firmado (imprimible) */}
      {viewing && (
        <PrintViewer
          doc={viewing}
          clinic={db.clinics[0]}
          patientName={patientName}
          profesional={nombreDe(viewing.dentistId)}
          plan={planDe(viewing.budgetId)}
          onClose={() => setViewing(null)}
        />
      )}
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
        <span className="mb-1 block text-[13px] font-semibold text-clinic-muted">Firma</span>
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
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-clinic-muted">
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
            <input readOnly value={url} className={`${inputCls} tabular-nums text-[11px]`} onFocus={(e) => e.currentTarget.select()} />
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

function PrintViewer({ doc, clinic, patientName, profesional, plan, onClose }: { doc: SignatureDoc; clinic: Clinic; patientName: string; profesional?: string; plan?: string; onClose: () => void }) {
  // Mismo comportamiento accesible que <Modal>, conservando los estilos print:
  const { titleId, dialogProps } = useDialogA11y();
  const { aviso, alTocarElFondo } = useAvisoDeCierre();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/40 p-4 print:static print:bg-transparent print:p-0" onClick={alTocarElFondo} role="presentation">
      <div
        {...dialogProps}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-2xl bg-white p-6 shadow-pop outline-none print:max-h-none print:w-full print:max-w-none print:rounded-none print:shadow-none"
      >
        <div className="mb-4 flex items-center justify-between print:hidden">
          <h3 id={titleId} className="text-lg font-bold text-clinic-text">Consentimiento firmado</h3>
          <div className="flex items-center gap-2">
            <Btn variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir
            </Btn>
            <BotonCerrar onClose={onClose} aviso={aviso} />
          </div>
        </div>

        {/* Vista previa del documento con el mismo membrete del PDF. */}
        <div>
          <PrintLetterhead clinic={clinic} label="CONSENTIMIENTO INFORMADO" />
          <h1 className="text-[16px] font-bold text-clinic-text">{doc.title}</h1>
          <p className="mt-1 text-xs text-clinic-muted">
            Paciente: {patientName}{profesional ? ` · Profesional: ${profesional}` : ""}{plan ? ` · ${plan}` : ""}
          </p>

          <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-clinic-text">{doc.body}</div>

          <div className="mt-6 border-t border-clinic-border pt-4">
            <p className="text-[13px] font-bold text-clinic-muted">Firma</p>
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
      <ConsentPrintDocument clinic={clinic} doc={doc} patientName={patientName} profesional={profesional} plan={plan} />
    </div>
  );
}

/* ============================================================== */
/*  Crear nuevo consentimiento (como Dentalink)                   */
/* ============================================================== */

function NuevoConsentimientoModal({ templates, planes, dentistas, dentistaInicial, onClose, onCrear }: {
  templates: { id: string; title: string }[];
  planes: Budget[];
  dentistas: User[];
  dentistaInicial: string;
  onClose: () => void;
  onCrear: (o: { templateId: string; budgetId?: string; dentistId: string }) => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [budgetId, setBudgetId] = useState("");
  const [dentistId, setDentistId] = useState(dentistaInicial);

  return (
    <Modal title="Crear nuevo consentimiento" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); onCrear({ templateId, budgetId: budgetId || undefined, dentistId }); }}
      >
        <Field label="Tipo de consentimiento *" hint="Si querés agregar una plantilla nueva, hacelo desde Configuración.">
          <select required className={inputCls} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Seleccionar</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </Field>
        <Field label="Plan de tratamiento">
          <select
            className={inputCls}
            value={budgetId}
            onChange={(e) => {
              setBudgetId(e.target.value);
              // Si todavía no eligió profesional, se sugiere el del plan.
              const plan = planes.find((b) => b.id === e.target.value);
              if (plan && !dentistId && dentistas.some((d) => d.id === plan.dentistId)) setDentistId(plan.dentistId);
            }}
          >
            <option value="">Seleccionar</option>
            {planes.map((b) => <option key={b.id} value={b.id}>{etiquetaPlan(b)}</option>)}
          </select>
        </Field>
        <Field label="Profesional a cargo *">
          <select required className={inputCls} value={dentistId} onChange={(e) => setDentistId(e.target.value)}>
            <option value="">Seleccionar</option>
            {dentistas.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cerrar</Btn>
          <Btn type="submit" disabled={!templateId || !dentistId}>Crear consentimiento</Btn>
        </div>
      </form>
    </Modal>
  );
}
