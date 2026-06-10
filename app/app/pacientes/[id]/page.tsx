"use client";
/** Perfil del paciente: Resumen · Odontograma · Historial (EMR) · Presupuestos · Recetas ·
 *  Archivos · Ortodoncia · Formularios (pencil-flow) · Facturación. */
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  FileText, ClipboardList, Pencil, CalendarDays, Receipt, Stethoscope, Lock, Plus, CheckCircle2, Smile,
  FileSpreadsheet, Pill, FolderOpen, Braces, Activity,
} from "lucide-react";
import { useStore, fmtGs, fmtTime, fullName } from "@/lib/store";
import { recordTotal } from "@/lib/billing";
import { can } from "@/lib/rbac";
import type { EmrNote, PatientForm } from "@/lib/types";
import { Card, Btn, Modal, Field, inputCls, Badge, StatusBadge, FlagBadge, Empty } from "@/components/ui";
import Odontogram from "@/components/Odontogram";
import { BudgetsTab, RxTab, FilesTab, OrthoTab } from "@/components/PatientExtras";
import { VoiceNoteButton, PatientBriefButton } from "@/components/NovudentIA";
import Periodontogram from "@/components/Periodontogram";

type Tab = "resumen" | "odontograma" | "periodoncia" | "historial" | "presupuestos" | "recetas" | "archivos" | "ortodoncia" | "formularios" | "facturacion";

export default function PatientProfile() {
  const { id } = useParams<{ id: string }>();
  const { db, session, completeForm, addEmrNote, addPerioSession, setTooth, markHistoryUpdate } = useStore();
  const [tab, setTab] = useState<Tab>("resumen");
  const [fillingForm, setFillingForm] = useState<PatientForm | null>(null);
  const [writingNote, setWritingNote] = useState(false);
  const [clipOpen, setClipOpen] = useState(false);
  const [clipDate, setClipDate] = useState(() => new Date().toISOString().slice(0, 10));

  const p = db.patients.find((x) => x.id === id);
  const appts = useMemo(() => db.appointments.filter((a) => a.patientId === id).sort((a, b) => b.start.localeCompare(a.start)), [db.appointments, id]);
  const bills = useMemo(() => db.billing.filter((b) => b.patientId === id), [db.billing, id]);

  if (!session) return null;
  if (!p) return <Empty title="Paciente no encontrado" />;

  const pendingForms = p.forms.filter((f) => f.status === "pendiente");
  const canForms = can(session.role, "engagement.forms");
  const canWriteEmr = can(session.role, "emr.write");

  const TABS: { key: Tab; label: string; icon: any; badge?: number }[] = [
    { key: "resumen", label: "Resumen", icon: Stethoscope },
    { key: "odontograma", label: "Odontograma", icon: Smile },
    { key: "periodoncia", label: "Periodoncia", icon: Activity, badge: p.perio?.length || undefined },
    { key: "historial", label: "Historial", icon: ClipboardList },
    { key: "presupuestos", label: "Presupuestos", icon: FileSpreadsheet },
    { key: "recetas", label: "Recetas", icon: Pill },
    { key: "archivos", label: "Archivos", icon: FolderOpen, badge: p.files?.length || undefined },
    { key: "ortodoncia", label: "Ortodoncia", icon: Braces },
    { key: "formularios", label: "Formularios", icon: FileText, badge: pendingForms.length || undefined },
    { key: "facturacion", label: "Facturación", icon: Receipt },
  ];

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-azure-100 text-lg font-extrabold text-azure-700">
            {p.firstName[0]}{p.lastName[0]}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold text-clinic-text">{fullName(p)}</h1>
            <p className="text-sm text-clinic-muted">
              CI {p.document} · {p.phone}{p.email ? ` · ${p.email}` : ""}{p.insurer ? ` · ${p.insurer}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PatientBriefButton
              patient={p}
              context={{
                appointments: appts.slice(0, 6).map((a) => ({
                  fecha: a.start, estado: a.status, titulo: a.title,
                })),
                budgets: db.budgets
                  .filter((b) => b.patientId === p.id)
                  .slice(0, 6)
                  .map((b) => ({
                    estado: b.status,
                    items: b.items.length,
                    cuotas: b.installments || null,
                    fecha: b.createdAt?.slice(0, 10),
                  })),
                billing: bills.slice(0, 6).map((b) => ({ flags: b.flags, total: recordTotal(b) })),
              }}
            />
            {pendingForms.length > 0 && (
              <button onClick={() => setTab("formularios")} data-tip="Formularios pendientes — clic para gestionar" className="grid h-9 w-9 place-items-center rounded-xl bg-state-warnbg">
                <FileText className="h-4.5 w-4.5 h-5 w-5 text-state-warn" />
              </button>
            )}
            {p.historyUpdatePending &&
              (canForms ? (
                <button
                  onClick={() => setClipOpen(true)}
                  data-tip="Actualización de historial pendiente — clic para marcarla como recibida"
                  className="grid h-9 w-9 place-items-center rounded-xl bg-state-infobg transition-transform hover:scale-105"
                >
                  <ClipboardList className="h-5 w-5 text-state-info" />
                </button>
              ) : (
                <span data-tip="Actualización de historial médico pendiente" className="grid h-9 w-9 place-items-center rounded-xl bg-state-infobg">
                  <ClipboardList className="h-5 w-5 text-state-info" />
                </span>
              ))}
            <a href="/app/agenda"><Btn variant="outline"><CalendarDays className="h-4 w-4" /> Ver agenda</Btn></a>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-clinic-border bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${
              tab === t.key ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
            {t.badge && <span className="ml-0.5 rounded-full bg-state-warn px-1.5 text-[10px] font-bold text-white">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ===== RESUMEN ===== */}
      {tab === "resumen" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-3 font-extrabold text-clinic-text">Próximas citas</h2>
            {appts.filter((a) => new Date(a.start) >= new Date()).length === 0 ? (
              <p className="text-sm text-clinic-muted">Sin citas futuras.</p>
            ) : (
              <div className="divide-y divide-clinic-border">
                {appts.filter((a) => new Date(a.start) >= new Date()).slice(0, 4).map((a) => (
                  <div key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="font-mono text-xs font-bold">{new Date(a.start).toLocaleDateString("es-PY", { day: "2-digit", month: "short" })} {fmtTime(a.start)}</span>
                    <span className="flex-1 truncate font-semibold text-clinic-text">{a.title}</span>
                    <StatusBadge status={a.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-extrabold text-clinic-text">Última actividad clínica</h2>
            {p.emr.length === 0 ? (
              <p className="text-sm text-clinic-muted">Sin registros aún.</p>
            ) : (
              <div className="space-y-2.5">
                {p.emr.slice(0, 3).map((n) => (
                  <div key={n.id} className="rounded-xl bg-clinic-bg p-3 text-sm">
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-clinic-muted">
                      <Badge tone="info">{n.kind}</Badge> {n.authorName} · {new Date(n.createdAt).toLocaleDateString("es-PY")}
                    </div>
                    <p className="text-clinic-text">{n.text}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ===== ODONTOGRAMA ===== */}
      {tab === "odontograma" && (
        <div className="space-y-3">
          {!canWriteEmr && (
            <p className="rounded-xl bg-clinic-bg p-3 text-sm text-clinic-muted">
              <Lock className="mr-1 inline h-3.5 w-3.5" /> Solo el dentista o administrador puede editar el odontograma. Hacé clic en una pieza para ver su detalle.
            </p>
          )}
          <Odontogram
            value={p.odontogram ?? {}}
            editable={canWriteEmr}
            authorName={session.name}
            onChange={(tooth, rec) => setTooth(p.id, tooth, rec)}
          />
        </div>
      )}

      {/* ===== PERIODONCIA ===== */}
      {tab === "periodoncia" && (
        <Periodontogram
          sessions={p.perio ?? []}
          canWrite={canWriteEmr}
          authorName={session.name}
          onSave={(s) => addPerioSession(p.id, s)}
        />
      )}

      {/* ===== HISTORIAL CLÍNICO (EMR) ===== */}
      {tab === "historial" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-clinic-muted">
              {canWriteEmr ? "Diagnósticos, notas de tratamiento y planificación clínica." : (
                <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Tu rol tiene acceso de <b>solo lectura</b> al historial clínico.</span>
              )}
            </p>
            {canWriteEmr && (
              <div className="flex items-center gap-2">
                <VoiceNoteButton
                  patientName={fullName(p)}
                  author={{ id: session.userId, name: session.name }}
                  onSave={(note) => addEmrNote(p.id, note)}
                />
                <Btn onClick={() => setWritingNote(true)}><Plus className="h-4 w-4" /> Nueva nota</Btn>
              </div>
            )}
          </div>
          {p.emr.length === 0 ? (
            <Empty title="Historial vacío" desc="Las notas del dentista aparecerán aquí." />
          ) : (
            <div className="space-y-3">
              {p.emr.map((n) => (
                <Card key={n.id} className="p-4">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-clinic-muted">
                    <Badge tone="info">{n.kind}</Badge>
                    <span className="font-semibold text-clinic-text">{n.authorName}</span>
                    · {new Date(n.createdAt).toLocaleString("es-PY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <p className="text-sm leading-relaxed text-clinic-text">{n.text}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== PRESUPUESTOS / RECETAS / ARCHIVOS / ORTODONCIA ===== */}
      {tab === "presupuestos" && <BudgetsTab patient={p} />}
      {tab === "recetas" && <RxTab patient={p} />}
      {tab === "archivos" && <FilesTab patient={p} />}
      {tab === "ortodoncia" && <OrthoTab patient={p} />}

      {/* ===== FORMULARIOS (Engagement) ===== */}
      {tab === "formularios" && (
        <div className="space-y-4">
          {!canForms && (
            <p className="rounded-xl bg-clinic-bg p-3 text-sm text-clinic-muted">
              <Lock className="mr-1 inline h-3.5 w-3.5" /> Tu rol no gestiona formularios (permiso de Administrador/Asistente). Vista de solo lectura.
            </p>
          )}
          {p.forms.length === 0 ? (
            <Empty title="Sin formularios asignados" />
          ) : (
            <Card className="divide-y divide-clinic-border">
              {p.forms.map((f) => (
                <div key={f.id} className="flex items-center gap-4 px-5 py-3.5">
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${f.status === "pendiente" ? "bg-state-warnbg" : "bg-state-okbg"}`}>
                    {f.status === "pendiente" ? <FileText className="h-4 w-4 text-state-warn" /> : <CheckCircle2 className="h-4 w-4 text-state-ok" />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-bold text-clinic-text">{f.templateName}</span>
                    <span className="block text-xs text-clinic-muted">
                      {f.status === "pendiente" ? "Pendiente de completar" : `Completado el ${f.completedAt}`}
                    </span>
                  </span>
                  {f.status === "pendiente" ? (
                    canForms && (
                      <button onClick={() => setFillingForm(f)} data-tip="Completar formulario" className="grid h-9 w-9 place-items-center rounded-xl border border-clinic-border hover:border-azure-300 hover:bg-azure-50">
                        <Pencil className="h-4 w-4 text-azure-600" />
                      </button>
                    )
                  ) : (
                    <Badge tone="ok">Completado</Badge>
                  )}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* ===== FACTURACIÓN del paciente ===== */}
      {tab === "facturacion" && (
        <div className="space-y-3">
          {bills.length === 0 ? (
            <Empty title="Sin registros de facturación" />
          ) : (
            bills.map((b) => (
              <Card key={b.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="font-mono text-sm font-bold text-clinic-text">{b.cpt}</span>
                <span className="flex-1 text-sm text-clinic-muted">DX {b.dx} · POS {b.pos}</span>
                <span className="font-mono text-sm font-bold">{fmtGs(recordTotal(b))}</span>
                <span className="flex flex-wrap gap-1.5">{b.flags.length === 0 ? <Badge tone="muted">SIN ENVIAR</Badge> : b.flags.map((fl) => <FlagBadge key={fl} flag={fl} />)}</span>
                <a href="/app/facturacion" className="text-xs font-bold text-azure-600 hover:underline">Gestionar →</a>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Modal: completar formulario (pencil flow) */}
      {fillingForm && (
        <FormFill
          form={fillingForm}
          onClose={() => setFillingForm(null)}
          onSave={(fields, date) => { completeForm(p.id, fillingForm.id, fields, date); setFillingForm(null); }}
        />
      )}

      {/* Modal: flujo clipboard — actualización de historial recibida */}
      {clipOpen && (
        <Modal title="Actualización de historial médico" onClose={() => setClipOpen(false)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              markHistoryUpdate(p.id, clipDate);
              setClipOpen(false);
            }}
          >
            <p className="rounded-xl bg-state-infobg p-3 text-sm leading-relaxed text-state-info">
              Registrá la <b>fecha de envío</b> de la actualización del historial médico del paciente.
              Al guardar, el ícono de pendiente desaparece del Buscador de Pacientes.
            </p>
            <Field label="Fecha de envío">
              <input type="date" required className={inputCls} value={clipDate} onChange={(e) => setClipDate(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Btn variant="outline" onClick={() => setClipOpen(false)}>Cancelar</Btn>
              <Btn type="submit">Marcar como recibida</Btn>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: nueva nota EMR */}
      {writingNote && (
        <NoteForm
          onClose={() => setWritingNote(false)}
          onSave={(note) => { addEmrNote(p.id, note); setWritingNote(false); }}
          author={{ id: session.userId, name: session.name }}
        />
      )}
    </div>
  );
}

function FormFill({ form, onClose, onSave }: { form: PatientForm; onClose: () => void; onSave: (fields: { label: string; value: string }[], date: string) => void }) {
  const [fields, setFields] = useState(form.fields);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  return (
    <Modal title={`Completar: ${form.templateName}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSave(fields, date); }}>
        {fields.map((f, i) => (
          <Field key={f.label} label={f.label}>
            <input className={inputCls} value={f.value} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
          </Field>
        ))}
        <Field label="Fecha de finalización" hint="Al guardar, los íconos de pendiente desaparecen automáticamente.">
          <input type="date" required className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancelar</Btn><Btn type="submit">Guardar formulario</Btn></div>
      </form>
    </Modal>
  );
}

function NoteForm({ onClose, onSave, author }: { onClose: () => void; onSave: (n: EmrNote) => void; author: { id: string; name: string } }) {
  const [kind, setKind] = useState<EmrNote["kind"]>("nota");
  const [text, setText] = useState("");
  return (
    <Modal title="Nueva nota clínica" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ id: `n_${Date.now()}`, authorId: author.id, authorName: author.name, createdAt: new Date().toISOString(), kind, text });
        }}
      >
        <Field label="Tipo">
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as EmrNote["kind"])}>
            <option value="diagnostico">Diagnóstico</option>
            <option value="tratamiento">Tratamiento</option>
            <option value="plan">Plan</option>
            <option value="nota">Nota</option>
          </select>
        </Field>
        <Field label="Detalle"><textarea required rows={4} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Hallazgos, piezas, indicaciones…" /></Field>
        <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancelar</Btn><Btn type="submit">Guardar nota</Btn></div>
      </form>
    </Modal>
  );
}
