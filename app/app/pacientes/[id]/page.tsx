"use client";
/** Perfil del paciente: Resumen · Odontograma · Historial (EMR) · Presupuestos · Recetas ·
 *  Archivos · Ortodoncia · Formularios (pencil-flow) · Facturación. */
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useParams } from "next/navigation";
import {
  FileText, ClipboardList, Pencil, CalendarDays, Receipt, Stethoscope, Lock, Plus, CheckCircle2, Smile,
  Pill, FolderOpen, Activity, ScanLine, FileSignature, Camera, AlertTriangle, HeartPulse, User, Wallet, Layers, MessageSquare, CheckSquare, Mail, Sparkles,
} from "lucide-react";
import { useStore, fmtGs, fmtTime, fmtDate, fullName } from "@/lib/store";
import { recordTotal } from "@/lib/billing";
import { resizeToDataUrl } from "@/lib/image";
import { can } from "@/lib/rbac";
import type { EmrNote, PatientForm, Patient } from "@/lib/types";
import { DEFAULT_ODONTOGRAM_STATUS } from "@/lib/types";
import { Card, Btn, Modal, Field, inputCls, Badge, StatusBadge, Empty } from "@/components/ui";
import Odontogram from "@/components/Odontogram";
import { RxTab, FilesTab } from "@/components/PatientExtras";
import { RadiografiasTab } from "@/components/Radiografias";
import { ClinicalCopilot } from "@/components/ClinicalCopilot";
import { ConsentimientosTab } from "@/components/Consentimientos";
import { PlanTratamiento } from "@/components/PlanTratamiento";
import { DatosTab } from "@/components/PatientDatos";
import { RecibirPagoTab } from "@/components/RecibirPago";
import { HistorialTimeline } from "@/components/Historial";
import { FacturacionPaciente } from "@/components/FacturacionPaciente";
import { PatientNotas } from "@/components/PatientNotas";
import { VoiceNoteButton, PatientBriefButton } from "@/components/NovudentIA";
import { useClinicPlan } from "@/components/PlanGate";
import Periodontogram from "@/components/Periodontogram";
import RecoveryCard from "@/components/RecoveryCard";
import { Reveal } from "@/components/motion";

type SubTab =
  | "datos" | "citas" | "comentarios" | "tareas" | "emails" | "formularios" | "archivos" | "consentimientos"
  | "resumen" | "evoluciones" | "antecedentes" | "odontograma" | "periodoncia" | "historial" | "radiografias" | "copilot" | "recetas"
  | "planes" | "facturacion" | "recibir-pago";

type GroupDef = { key: string; label: string; tabs: { key: SubTab; label: string; icon: any }[] };

const GROUPS: GroupDef[] = [
  { key: "datos-personales", label: "Datos personales", tabs: [
    { key: "datos", label: "Datos", icon: User },
    { key: "citas", label: "Citas", icon: CalendarDays },
    { key: "comentarios", label: "Comentarios", icon: MessageSquare },
    { key: "tareas", label: "Tareas", icon: CheckSquare },
    { key: "emails", label: "Emails", icon: Mail },
    { key: "formularios", label: "Formularios", icon: FileText },
    { key: "archivos", label: "Archivos", icon: FolderOpen },
    { key: "consentimientos", label: "Consentimientos", icon: FileSignature },
  ] },
  { key: "ficha-clinica", label: "Ficha clínica", tabs: [
    { key: "resumen", label: "Resumen", icon: Stethoscope },
    { key: "evoluciones", label: "Evoluciones", icon: ClipboardList },
    { key: "antecedentes", label: "Antecedentes médicos", icon: HeartPulse },
    { key: "odontograma", label: "Odontograma", icon: Smile },
    { key: "periodoncia", label: "Periodoncia", icon: Activity },
    { key: "historial", label: "Historial", icon: ClipboardList },
    { key: "radiografias", label: "Radiografías", icon: ScanLine },
    { key: "copilot", label: "Copilot IA", icon: Sparkles },
    { key: "recetas", label: "Recetas", icon: Pill },
  ] },
  { key: "planes", label: "Planes de tratamiento", tabs: [
    { key: "planes", label: "Plan de tratamiento", icon: Layers },
  ] },
  { key: "facturacion", label: "Facturación y pagos", tabs: [
    { key: "facturacion", label: "Facturación", icon: Receipt },
  ] },
  { key: "recibir-pago", label: "Recibir pago", tabs: [
    { key: "recibir-pago", label: "Recibir pago", icon: Wallet },
  ] },
];

export default function PatientProfile() {
  const { id } = useParams<{ id: string }>();
  const { db, session, completeForm, addEmrNote, addPerioSession, setOdontogram, markHistoryUpdate, upsertPatient } = useStore();
  const hasIA = useClinicPlan().features.includes("ia"); // Novudent IA: Plan Clínica+
  const [tab, setTab] = useState<SubTab>("resumen");
  const [fillingForm, setFillingForm] = useState<PatientForm | null>(null);
  const [writingNote, setWritingNote] = useState(false);
  const [clipOpen, setClipOpen] = useState(false);
  const [clipDate, setClipDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [medOpen, setMedOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const p = db.patients.find((x) => x.id === id);
  const appts = useMemo(() => db.appointments.filter((a) => a.patientId === id).sort((a, b) => b.start.localeCompare(a.start)), [db.appointments, id]);
  const bills = useMemo(() => db.billing.filter((b) => b.patientId === id), [db.billing, id]);

  if (!session) return null;
  if (!p) return <Empty title="Paciente no encontrado" />;

  const pendingForms = p.forms.filter((f) => f.status === "pendiente");
  const canForms = can(session.role, "engagement.forms");
  const canEditPatient = canForms || can(session.role, "emr.write");
  const age = p.birthDate ? Math.max(0, Math.floor((Date.now() - new Date(p.birthDate).getTime()) / 31557600000)) : null;
  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const url = await resizeToDataUrl(f, { maxDim: 512, quality: 0.85 });
      upsertPatient({ ...p, photo: url });
    } catch {
      /* imagen inválida — ignorar */
    }
  };
  const canWriteEmr = can(session.role, "emr.write");

  const activeGroup = GROUPS.find((g) => g.tabs.some((t) => t.key === tab)) ?? GROUPS[0];

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <Reveal y={0}>
      <Card className="overflow-hidden p-0">
        {/* Banda superior estilo Dentalink: foto + datos + alertas médicas */}
        <div className="mesh-hero relative px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* Foto del paciente (clic para cambiar) */}
            <button
              type="button"
              onClick={() => canEditPatient && fileRef.current?.click()}
              title={canEditPatient ? "Cambiar foto del paciente" : undefined}
              className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-white/40"
            >
              {p.photo ? (
                <img src={p.photo} alt="" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <span className="grid h-16 w-16 place-items-center bg-white/15 text-xl font-extrabold text-white">
                  {p.firstName[0]}{p.lastName[0]}
                </span>
              )}
              {canEditPatient && (
                <span className="absolute inset-0 grid place-items-center bg-navy-950/55 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera className="h-5 w-5 text-white" />
                </span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />

            {/* Identificación */}
            <div className="min-w-0 flex-1 text-white">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-azure-200">ID {p.document}</div>
              <h1 className="font-logo text-2xl leading-tight sm:text-3xl">{fullName(p)}</h1>
              <p className="mt-0.5 truncate text-sm text-white/70">
                CI {p.document}{age != null ? ` · ${age} años` : ""}{p.phone ? ` · ${p.phone}` : ""}{p.insurer ? ` · ${p.insurer}` : ""}
              </p>
            </div>

            {/* Alertas médicas · Enfermedades · Medicamentos */}
            <div className="flex flex-wrap gap-2">
              <MedBadge icon={AlertTriangle} label="Alertas médicas" value={p.medicalAlerts} editable={canEditPatient} onClick={() => setMedOpen(true)} />
              <MedBadge icon={HeartPulse} label="Enfermedades" value={p.conditions} editable={canEditPatient} onClick={() => setMedOpen(true)} />
              <MedBadge icon={Pill} label="Medicamentos" value={p.medications} editable={canEditPatient} onClick={() => setMedOpen(true)} />
            </div>
          </div>
        </div>

        {/* Barra de acciones */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 sm:px-6">
          {hasIA && <PatientBriefButton
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
          />}
          {pendingForms.length > 0 && (
            <button onClick={() => setTab("formularios")} data-tip="Formularios pendientes — clic para gestionar" className="grid h-9 w-9 place-items-center rounded-xl bg-state-warnbg">
              <FileText className="h-5 w-5 text-state-warn" />
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
      </Card>
      </Reveal>

      {medOpen && (
        <MedicalModal
          patient={p}
          onClose={() => setMedOpen(false)}
          onSave={(fields) => { upsertPatient({ ...p, ...fields }); setMedOpen(false); }}
        />
      )}

      {/* Navegación 2 niveles estilo Dentalink: grupos (N1) + sub-tabs (N2) */}
      <Reveal delay={0.05} className="space-y-2">
        <div className="flex flex-wrap gap-1 rounded-2xl border border-clinic-border bg-white p-1">
          {GROUPS.map((g) => {
            const active = g.key === activeGroup.key;
            return (
              <button
                key={g.key}
                onClick={() => setTab(g.tabs[0].key)}
                className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${
                  active ? "bg-navy-800 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
        {activeGroup.tabs.length > 1 && (
          <div className="flex flex-wrap gap-1 px-1">
            {activeGroup.tabs.map((t) => {
              const active = t.key === tab;
              const badge = t.key === "formularios" ? pendingForms.length : 0;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
                    active ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"
                  }`}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                  {badge > 0 && <span className="ml-0.5 rounded-full bg-state-warn px-1.5 text-[11px] font-bold text-white">{badge}</span>}
                </button>
              );
            })}
          </div>
        )}
      </Reveal>

      {/* ===== RESUMEN ===== */}
      {tab === "resumen" && (
        <Reveal className="grid gap-5 lg:grid-cols-2">
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
        </Reveal>
      )}

      {/* ===== MONITOR DE RECUPERACIÓN (visible en resumen) ===== */}
      {tab === "resumen" && <Reveal><RecoveryCard patient={p} /></Reveal>}

      {/* ===== ODONTOGRAMA ===== */}
      {tab === "odontograma" && (
        <Reveal className="space-y-3">
          {!canWriteEmr && (
            <p className="rounded-xl bg-clinic-bg p-3 text-sm text-clinic-muted">
              <Lock className="mr-1 inline h-3.5 w-3.5" /> Solo el dentista o administrador puede editar el odontograma. Hacé clic en una pieza para ver su detalle.
            </p>
          )}
          <Odontogram
            value={p.odontogram ?? DEFAULT_ODONTOGRAM_STATUS}
            editable={canWriteEmr}
            authorName={session.name}
            onChange={(status) => setOdontogram(p.id, status, session.name)}
          />
        </Reveal>
      )}

      {/* ===== PERIODONCIA ===== */}
      {tab === "periodoncia" && (
        <Reveal>
        <Periodontogram
          sessions={p.perio ?? []}
          canWrite={canWriteEmr}
          authorName={session.name}
          onSave={(s) => addPerioSession(p.id, s)}
        />
        </Reveal>
      )}

      {/* ===== HISTORIAL CLÍNICO (EMR) ===== */}
      {tab === "historial" && (
        <Reveal className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-clinic-muted">
              {canWriteEmr ? "Diagnósticos, notas de tratamiento y planificación clínica." : (
                <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Tu rol tiene acceso de <b>solo lectura</b> al historial clínico.</span>
              )}
            </p>
            {canWriteEmr && (
              <div className="flex items-center gap-2">
                {hasIA && <VoiceNoteButton
                  patientName={fullName(p)}
                  author={{ id: session.userId, name: session.name }}
                  onSave={(note) => addEmrNote(p.id, note)}
                />}
                <Btn onClick={() => setWritingNote(true)}><Plus className="h-4 w-4" /> Nueva nota</Btn>
              </div>
            )}
          </div>
          <HistorialTimeline patient={p} />
        </Reveal>
      )}

      {/* ===== DATOS / PLANES / RECIBIR PAGO / RECETAS / ARCHIVOS / RADIOGRAFÍAS / CONSENTIMIENTOS ===== */}
      {tab === "datos" && <Reveal><DatosTab patient={p} /></Reveal>}
      {tab === "citas" && (
        <Reveal>
          {appts.length === 0 ? (
            <Empty title="Sin citas" desc="Las citas del paciente aparecerán acá." />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-2 py-3">Motivo</th>
                    <th className="px-2 py-3">Profesional</th>
                    <th className="px-2 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-clinic-border">
                  {appts.map((a) => (
                    <tr key={a.id} className="hover:bg-clinic-bg/50">
                      <td className="px-4 py-2.5 font-mono text-xs text-clinic-muted">{new Date(a.start).toLocaleString("es-PY", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-2 py-2.5 text-clinic-text">{a.title}</td>
                      <td className="px-2 py-2.5 text-clinic-muted">{db.users.find((u) => u.id === a.dentistId)?.name ?? "—"}</td>
                      <td className="px-2 py-2.5"><StatusBadge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </Reveal>
      )}
      {tab === "comentarios" && <Reveal><PatientNotas patient={p} kind="comentario" /></Reveal>}
      {tab === "tareas" && <Reveal><PatientNotas patient={p} kind="tarea" /></Reveal>}
      {tab === "emails" && <Reveal><PatientNotas patient={p} kind="email" /></Reveal>}
      {tab === "planes" && <Reveal><PlanTratamiento patient={p} /></Reveal>}
      {tab === "recibir-pago" && <Reveal><RecibirPagoTab patient={p} /></Reveal>}
      {tab === "recetas" && <Reveal><RxTab patient={p} /></Reveal>}

      {/* ===== EVOLUCIONES ===== */}
      {tab === "evoluciones" && (
        <Reveal>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-extrabold text-clinic-text">Evoluciones clínicas</h2>
            {canWriteEmr && <Btn onClick={() => setWritingNote(true)}><Plus className="h-4 w-4" /> Nueva evolución</Btn>}
          </div>
          {p.emr.length === 0 ? (
            <Empty title="Sin evoluciones" desc="Registrá la evolución clínica de cada sesión del paciente." />
          ) : (
            <div className="space-y-3">
              {[...p.emr].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((n) => (
                <Card key={n.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="info">{({ diagnostico: "Diagnóstico", tratamiento: "Tratamiento", plan: "Plan", nota: "Nota" } as Record<string, string>)[n.kind] ?? n.kind}</Badge>
                    <span className="text-[11px] text-clinic-muted">{n.authorName} · {fmtDate(n.createdAt)}</span>
                  </div>
                  {n.soap ? (
                    <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-clinic-text">
                      {n.soap.s && <p><span className="mr-1 font-bold text-azure-700">S</span>{n.soap.s}</p>}
                      {n.soap.o && <p><span className="mr-1 font-bold text-azure-700">O</span>{n.soap.o}</p>}
                      {n.soap.a && <p><span className="mr-1 font-bold text-azure-700">A</span>{n.soap.a}</p>}
                      {n.soap.p && <p><span className="mr-1 font-bold text-azure-700">P</span>{n.soap.p}</p>}
                    </div>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-clinic-text">{n.text}</p>
                  )}
                  {n.signedBy && <div className="mt-2 border-t border-clinic-border pt-2 text-[11px] font-bold text-state-ok">✓ Firmado electrónicamente por {n.signedBy}</div>}
                </Card>
              ))}
            </div>
          )}
        </Reveal>
      )}

      {/* ===== ANTECEDENTES MÉDICOS ===== */}
      {tab === "antecedentes" && (
        <Reveal>
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-extrabold text-clinic-text">Antecedentes médicos</h2>
              {canEditPatient && <Btn variant="outline" onClick={() => setMedOpen(true)}><Pencil className="h-3.5 w-3.5" /> Editar</Btn>}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-clinic-border p-4">
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-state-warn"><AlertTriangle className="h-3.5 w-3.5" /> Alertas médicas</div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-clinic-text">{p.medicalAlerts || <span className="text-clinic-muted">Sin información</span>}</p>
              </div>
              <div className="rounded-xl border border-clinic-border p-4">
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-state-err"><HeartPulse className="h-3.5 w-3.5" /> Enfermedades</div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-clinic-text">{p.conditions || <span className="text-clinic-muted">Sin información</span>}</p>
              </div>
              <div className="rounded-xl border border-clinic-border p-4">
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-azure-700"><Pill className="h-3.5 w-3.5" /> Medicamentos</div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-clinic-text">{p.medications || <span className="text-clinic-muted">Sin información</span>}</p>
              </div>
            </div>
          </Card>
        </Reveal>
      )}
      {tab === "archivos" && <Reveal><FilesTab patient={p} /></Reveal>}
      {tab === "radiografias" && <Reveal><RadiografiasTab patient={p} /></Reveal>}
      {tab === "copilot" && <Reveal>{hasIA ? <ClinicalCopilot patient={p} /> : <Empty title="Clinical Copilot" desc="Disponible en el plan Clínica o superior." />}</Reveal>}
      {tab === "consentimientos" && <Reveal><ConsentimientosTab patient={p} /></Reveal>}

      {/* ===== FORMULARIOS (Engagement) ===== */}
      {tab === "formularios" && (
        <Reveal className="space-y-4">
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
        </Reveal>
      )}

      {/* ===== FACTURACIÓN del paciente ===== */}
      {tab === "facturacion" && <Reveal><FacturacionPaciente patient={p} /></Reveal>}

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

/* Pastilla de dato médico sobre la banda navy (estilo Dentalink). */
function MedBadge({ icon: Icon, label, value, editable, onClick }: { icon: any; label: string; value?: string; editable: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={editable ? onClick : undefined}
      className={`glass-dark min-w-[116px] max-w-[190px] rounded-xl px-3 py-2 text-left ${editable ? "transition-colors hover:bg-white/15" : "cursor-default"}`}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/80">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className={`mt-0.5 block truncate text-xs ${value ? "text-white" : "text-white/45"}`}>
        {value || "Sin información"}
      </span>
    </button>
  );
}

/* Modal para editar los datos médicos destacados de la cabecera. */
function MedicalModal({ patient, onClose, onSave }: { patient: Patient; onClose: () => void; onSave: (fields: Pick<Patient, "medicalAlerts" | "conditions" | "medications">) => void }) {
  const [a, setA] = useState(patient.medicalAlerts ?? "");
  const [c, setC] = useState(patient.conditions ?? "");
  const [m, setM] = useState(patient.medications ?? "");
  return (
    <Modal title="Datos médicos del paciente" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Alertas médicas"><textarea rows={2} className={inputCls} value={a} onChange={(e) => setA(e.target.value)} placeholder="Alergias, condiciones críticas…" /></Field>
        <Field label="Enfermedades"><textarea rows={2} className={inputCls} value={c} onChange={(e) => setC(e.target.value)} placeholder="Diabetes, hipertensión…" /></Field>
        <Field label="Medicamentos"><textarea rows={2} className={inputCls} value={m} onChange={(e) => setM(e.target.value)} placeholder="Anticoagulantes, etc." /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={() => onSave({ medicalAlerts: a.trim() || undefined, conditions: c.trim() || undefined, medications: m.trim() || undefined })}>Guardar</Btn>
        </div>
      </div>
    </Modal>
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

const SOAP_TEMPLATES: { name: string; soap: { s: string; o: string; a: string; p: string } }[] = [
  { name: "Control de ortodoncia", soap: { s: "Refiere buena tolerancia, sin molestias.", o: "Higiene aceptable. Aparatología sin daños, arcos en posición.", a: "Evolución favorable del tratamiento de ortodoncia.", p: "Activación / cambio de ligas. Próximo control en 4 semanas." } },
  { name: "Urgencia por dolor", soap: { s: "Dolor espontáneo, intensidad …, evolución …", o: "Pieza … con … . Pruebas de vitalidad/percusión …", a: "Pulpitis / … en pieza …", p: "Apertura cameral / medicación / derivación a endodoncia." } },
  { name: "Profilaxis", soap: { s: "Asintomático, consulta de control.", o: "Placa y cálculo supragingival leve, encías levemente inflamadas.", a: "Gingivitis asociada a placa.", p: "Profilaxis + tartrectomía. Refuerzo de técnica de cepillado." } },
  { name: "Post-quirúrgico", soap: { s: "Dolor leve controlado con analgésicos.", o: "Herida en buen proceso de cicatrización, sin signos de infección.", a: "Evolución post-operatoria normal.", p: "Continuar indicaciones. Retiro de puntos en 7 días." } },
];

function NoteForm({ onClose, onSave, author }: { onClose: () => void; onSave: (n: EmrNote) => void; author: { id: string; name: string } }) {
  const [mode, setMode] = useState<"soap" | "libre">("soap");
  const [kind, setKind] = useState<EmrNote["kind"]>("tratamiento");
  const [text, setText] = useState("");
  const [soap, setSoap] = useState({ s: "", o: "", a: "", p: "" });
  const pill = (on: boolean) => `rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${on ? "bg-azure-600 text-white" : "text-clinic-muted hover:text-clinic-text"}`;

  const submit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    const now = new Date().toISOString();
    const base = { id: `n_${Date.now()}`, authorId: author.id, authorName: author.name, createdAt: now, kind, signedBy: author.name, signedAt: now };
    if (mode === "soap") {
      if (!soap.s && !soap.o && !soap.a && !soap.p) return;
      const composed = [soap.s && `S: ${soap.s}`, soap.o && `O: ${soap.o}`, soap.a && `A: ${soap.a}`, soap.p && `P: ${soap.p}`].filter(Boolean).join("\n");
      onSave({ ...base, text: composed, soap: { s: soap.s || undefined, o: soap.o || undefined, a: soap.a || undefined, p: soap.p || undefined } });
    } else {
      if (!text.trim()) return;
      onSave({ ...base, text: text.trim() });
    }
  };

  return (
    <Modal title="Nueva evolución clínica" onClose={onClose} wide>
      <form className="space-y-4" onSubmit={submit}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-clinic-border bg-white p-1">
            <button type="button" onClick={() => setMode("soap")} className={pill(mode === "soap")}>SOAP</button>
            <button type="button" onClick={() => setMode("libre")} className={pill(mode === "libre")}>Nota libre</button>
          </div>
          {mode === "soap" && (
            <select onChange={(e) => { const t = SOAP_TEMPLATES.find((x) => x.name === e.target.value); if (t) setSoap({ ...t.soap }); e.currentTarget.selectedIndex = 0; }} className={`${inputCls} w-auto`} defaultValue="">
              <option value="" disabled>Plantilla…</option>
              {SOAP_TEMPLATES.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          )}
          <select className={`${inputCls} ml-auto w-auto`} value={kind} onChange={(e) => setKind(e.target.value as EmrNote["kind"])}>
            <option value="diagnostico">Diagnóstico</option>
            <option value="tratamiento">Tratamiento</option>
            <option value="plan">Plan</option>
            <option value="nota">Nota</option>
          </select>
        </div>

        {mode === "soap" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="S — Subjetivo"><textarea rows={3} className={inputCls} value={soap.s} onChange={(e) => setSoap({ ...soap, s: e.target.value })} placeholder="Lo que refiere el paciente" /></Field>
            <Field label="O — Objetivo"><textarea rows={3} className={inputCls} value={soap.o} onChange={(e) => setSoap({ ...soap, o: e.target.value })} placeholder="Hallazgos clínicos, exámenes" /></Field>
            <Field label="A — Análisis"><textarea rows={3} className={inputCls} value={soap.a} onChange={(e) => setSoap({ ...soap, a: e.target.value })} placeholder="Diagnóstico / impresión" /></Field>
            <Field label="P — Plan"><textarea rows={3} className={inputCls} value={soap.p} onChange={(e) => setSoap({ ...soap, p: e.target.value })} placeholder="Tratamiento, indicaciones, próximos pasos" /></Field>
          </div>
        ) : (
          <Field label="Detalle"><textarea rows={5} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Hallazgos, piezas, indicaciones…" /></Field>
        )}

        <p className="text-[11px] text-clinic-muted">Se firma electrónicamente como <b className="text-clinic-text">{author.name}</b> al guardar.</p>
        <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancelar</Btn><Btn type="submit">Firmar y guardar</Btn></div>
      </form>
    </Modal>
  );
}
