"use client";
import Link from "next/link";
/** Configuración de la práctica (solo Administrador): datos de la clínica, usuarios (con % comisión),
 *  servicios, convenios, plantilla de recordatorio y carga masiva de pacientes. */
import { useEffect, useState } from "react";
import { ShieldAlert, Plus, UserCog, Users, Handshake, Trash2, Pencil, MessageSquareText, UploadCloud, Percent, HandCoins, ScanLine, Sparkles, FileSignature, FileText, Image as ImageIcon, MapPin, ListChecks, Ban, Power } from "lucide-react";
import { useStore, fullName } from "@/lib/store";
import { can, rolLabel, rolDescripcion, rolesParaElegir } from "@/lib/rbac";
import { planUserLimitError } from "@/lib/plan";
import { PlazosTareas } from "@/components/tareas/PlazosTareas";
import type { RolId, User, BotikaConfig, ConsentTemplate, Branch, PaymentMethod } from "@/lib/types";
import { PAYMENT_METHOD_LABEL, parsearDescuento } from "@/lib/budgets";
import { Card, Btn, Modal, Field, inputCls, Badge, Empty } from "@/components/ui";
import { useClinicPlan } from "@/components/PlanGate";
import DentalinkImport from "@/components/DentalinkImport";
import { EstadosCitaConfig } from "@/components/EstadosCitaConfig";
import { PlantillasDocumento } from "@/components/PlantillasDocumento";
import { resizeToDataUrl } from "@/lib/image";
import { Reveal } from "@/components/motion";
import { PagoOnline } from "@/components/PagoOnline";
import { AgendaOnline } from "@/components/AgendaOnline";
import { ArancelPrecios } from "@/components/ArancelPrecios";
import { BancosEntidades } from "@/components/BancosEntidades";
import { PermisosDelEquipo } from "@/components/PermisosDelEquipo";
import { Logotipo } from "@/components/Marca";
import { DatosClinica } from "@/components/DatosClinica";
import { ColorDeUsuario, SelectorDeColor } from "@/components/ColorDeAgenda";
import { colorDelRol, usuariosConColor } from "@/lib/coloresUsuario";

const NEGOCIACION_DEFAULTS: Required<NonNullable<BotikaConfig["negociacion"]>> = {
  diasGatillo: 5,
  maxIntentos: 2,
  financiacion: { maxCuotas: 3, sinInteres: true, anticipoMinPct: 0 },
};

export default function ConfigPage() {
  const { db, session, mergePatients, setOnboarding, createTeamUser, backend, updateClinicConfig, upsertUser, saveConsentTemplates, addBranch, updateBranch, deleteBranch } = useStore();
  const plan = useClinicPlan();
  const [addingUser, setAddingUser] = useState(false);
  const [mergeKeep, setMergeKeep] = useState(db.patients[0]?.id ?? "");
  const [mergeRemove, setMergeRemove] = useState("");
  // Deep-link desde el menú Administración (/app/configuracion#arancel) → scroll a la sección.
  useEffect(() => {
    const go = () => { const id = window.location.hash.replace("#", ""); if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
    const t = setTimeout(go, 90);
    window.addEventListener("hashchange", go);
    return () => { clearTimeout(t); window.removeEventListener("hashchange", go); };
  }, []);
  const [importing, setImporting] = useState(false);
  const [convName, setConvName] = useState("");
  const [convPct, setConvPct] = useState("10");
  const [convRuc, setConvRuc] = useState("");
  const [convPhone, setConvPhone] = useState("");
  const convPctParsed = parsearDescuento(convPct);
  const convPctError = convPctParsed.ok ? null : convPctParsed.error;
  const [template, setTemplate] = useState<string | null>(null);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);

  if (!session) return null;
  if (!can(session.role, "practice.config")) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-[16px] font-bold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">La configuración de la práctica es exclusiva del rol <b>Administrador</b> (matriz RBAC, sec. 2.2).</p>
      </Card>
    );
  }

  const clinic = db.clinics[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[16px] font-bold text-clinic-text">Configuración</h1>
        <p className="text-sm text-clinic-muted">Usuarios, servicios y datos de la clínica.</p>
      </div>

      {/* Datos de la clínica: nombre, dirección y teléfono editables, y la moneda (id="moneda" vive adentro) */}
      <Reveal>
        <DatosClinica />
      </Reveal>

      <span id="sucursales" className="block scroll-mt-24" aria-hidden="true" />
      {/* Sucursales (multi-sede) */}
      <Reveal>
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-azure-600" /><h2 className="font-bold text-clinic-text">Sucursales</h2></div>
          <Btn onClick={() => setEditBranch({ id: "", clinicId: db.clinics[0]?.id ?? "", name: "", active: true })}><Plus className="h-4 w-4" /> Agregar sucursal</Btn>
        </div>
        <p className="mb-3 text-xs text-clinic-muted">Sedes de la clínica. Asigná usuarios, citas y cajas a una sucursal.</p>
        <div className="divide-y divide-clinic-border">
          {db.branches.length === 0 && <p className="py-2 text-sm text-clinic-muted">Sin sucursales — agregá tu primera sede.</p>}
          {db.branches.map((b) => (
            <div key={b.id} className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-azure-50 text-azure-600"><MapPin className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-clinic-text">{b.name}{b.isMain && <Badge tone="info">Principal</Badge>}{b.active === false && <Badge tone="muted">Inactiva</Badge>}</span>
                <span className="block truncate text-xs text-clinic-muted">{[b.address, b.phone].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              <button onClick={() => setEditBranch(b)} className="rounded-lg p-1.5 text-clinic-muted hover:bg-clinic-bg hover:text-azure-700" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
              {!b.isMain && <button onClick={() => { if (confirm("¿Eliminar esta sucursal?")) deleteBranch(b.id); }} className="rounded-lg p-1.5 text-clinic-muted hover:bg-clinic-bg hover:text-state-err" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
      </Card>
      </Reveal>
      {editBranch && <BranchForm branch={editBranch} onClose={() => setEditBranch(null)} onSave={(b) => { if (db.branches.some((x) => x.id === b.id)) updateBranch(b); else addBranch(b); setEditBranch(null); }} />}

      <span id="pagos" className="block scroll-mt-24" aria-hidden="true" />
      {/* Pago online (configurable, sin guardar credenciales secretas) */}
      <Reveal>
        <PagoOnline />
      </Reveal>

      <span id="agendamiento" className="block scroll-mt-24" aria-hidden="true" />
      {/* Agenda online: el link para compartir, su QR y la anticipación mínima, en un solo lugar */}
      <Reveal>
        <AgendaOnline />
      </Reveal>

      <span id="estados-cita" className="block scroll-mt-24" aria-hidden="true" />
      {/* Estados de cita (paridad Dentalink: Administración › Estados de agenda) */}
      <Reveal>
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><ListChecks className="h-4 w-4 text-azure-600" /><h2 className="font-bold text-clinic-text">Estados de cita</h2></div>
        <p className="mb-3 text-xs text-clinic-muted">Los estados que la recepción le pone a cada cita en la agenda. Podés renombrarlos, cambiarles el color, desactivar los internos y crear estados propios (ej. «Control 6 meses»).</p>
        <EstadosCitaConfig />
      </Card>
      </Reveal>

      <span id="documentos-clinicos" className="block scroll-mt-24" aria-hidden="true" />
      {/* Documentos clínicos (Historia Clínica y textos de indicaciones): las plantillas de la ficha del paciente */}
      <Reveal>
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-azure-600" /><h2 className="font-bold text-clinic-text">Documentos clínicos</h2></div>
        <p className="mb-3 text-xs text-clinic-muted">Las plantillas que aparecen en Ficha clínica › Documentos › Documentos clínicos: la Historia Clínica y los textos de indicaciones. Podés editarlas, duplicarlas, desactivarlas o crear las tuyas. Los textos que trae Novudent son borradores: marcalos como revisados cuando un odontólogo los haya revisado.</p>
        <PlantillasDocumento />
      </Card>
      </Reveal>

      <span id="usuarios" className="block scroll-mt-24" aria-hidden="true" />
      {/* Usuarios */}
      <Reveal>
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2"><UserCog className="h-4 w-4 text-azure-600" /><h2 className="font-bold text-clinic-text">Usuarios del equipo</h2><span data-tip={`Tu Plan ${plan.label} incluye hasta ${plan.maxUsers === Infinity ? "usuarios ilimitados" : `${plan.maxUsers} usuarios`} y ${plan.maxDentists === Infinity ? "profesionales ilimitados" : `${plan.maxDentists} profesional${plan.maxDentists > 1 ? "es" : ""}`}`} className="rounded-full bg-clinic-bg px-2 py-0.5 tabular-nums text-[11px] font-bold text-clinic-muted">{db.users.filter((u) => u.active).length}{plan.maxUsers === Infinity ? "" : ` / ${plan.maxUsers}`}</span></div>
          <Btn onClick={() => setAddingUser(true)}><Plus className="h-4 w-4" /> Agregar usuario</Btn>
        </div>
        <datalist id="especialidades-list">
          {["Odontología general", "Ortodoncia", "Endodoncia", "Periodoncia", "Cirugía oral y maxilofacial", "Odontopediatría", "Prótesis / Rehabilitación oral", "Implantología", "Estética dental", "Patología oral"].map((s) => <option key={s} value={s} />)}
        </datalist>
        <div className="divide-y divide-clinic-border">
          {db.users.map((u) => {
            const esYo = u.id === session.userId;
            const activo = u.active !== false;
            // No se puede dar de baja al último admin activo (la clínica quedaría
            // sin quién administre) ni a uno mismo (te cerrarías la puerta: la
            // regla de Firestore ya niega el acceso a un active:false).
            const ultimoAdmin = u.role === "admin" && db.users.filter((x) => x.role === "admin" && x.active !== false).length <= 1;
            const toggleBaja = () => {
              if (activo && (esYo || ultimoAdmin)) return;
              const msg = activo
                ? `Dar de baja a ${u.name}? Pierde el acceso al sistema de inmediato (sus datos y su historial quedan intactos). Podés reactivarlo cuando quieras.`
                : `Reactivar a ${u.name}? Vuelve a tener acceso con su cuenta de siempre.`;
              if (confirm(msg)) upsertUser({ ...u, active: !activo });
            };
            return (
            <div key={u.id} className={`flex min-w-0 flex-wrap items-center gap-3 py-3 ${activo ? "" : "opacity-55"}`}>
              <ColorDeUsuario usuario={u} onCambiar={(color) => upsertUser({ ...u, color })} />
              <span className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
                <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-clinic-text">{u.name}{!activo && <Badge tone="warn">Inactivo</Badge>}</span>
                <span className="block break-all text-xs text-clinic-muted">{u.email}{u.phone ? ` · ${u.phone}` : ""}{u.specialty ? ` · ${u.specialty}` : ""}</span>
              </span>
              {u.role === "dentist" && (
                <input
                  value={u.specialty ?? ""}
                  onChange={(e) => upsertUser({ ...u, specialty: e.target.value || undefined })}
                  placeholder="Especialidad"
                  list="especialidades-list"
                  className="w-32 rounded-lg border border-clinic-border px-2 py-1 text-xs text-clinic-text focus:border-azure-400"
                />
              )}
              {u.role === "dentist" && (
                <label className="flex items-center gap-1 rounded-lg border border-clinic-border px-2 py-1" title="% de comisión sobre producción cobrada">
                  <Percent className="h-3 w-3 text-clinic-muted" />
                  <input
                    type="number" min={0} max={100}
                    className="w-10 bg-transparent text-right tabular-nums text-xs font-bold text-clinic-text"
                    value={u.commissionPct ?? 0}
                    onChange={(e) => upsertUser({ ...u, commissionPct: Number(e.target.value) || 0 })}
                  />
                </label>
              )}
              {db.branches.length > 0 && (
                <select value={u.branchId ?? ""} onChange={(e) => upsertUser({ ...u, branchId: e.target.value || undefined })} className="rounded-lg border border-clinic-border px-2 py-1 text-xs text-clinic-text focus:border-azure-400" title="Sucursal asignada">
                  <option value="">Todas las sedes</option>
                  {db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              {u.role === "assistant" && (
                <AsisteA usuario={u} dentistas={db.users.filter((x) => x.role === "dentist" && x.active !== false)} onChange={(asiste) => upsertUser({ ...u, asiste })} />
              )}
              {esYo || (ultimoAdmin && activo) ? (
                <Badge tone={u.role === "admin" ? "info" : u.role === "dentist" ? "ok" : "warn"}>{rolLabel(u.role)}</Badge>
              ) : (
                <select
                  aria-label={`Rol de ${u.name}`}
                  title={rolDescripcion(u.role)}
                  value={u.role}
                  onChange={(e) => {
                    const role = e.target.value;
                    if (role === "dentist") {
                      // Pasar a dentista cuenta para el límite de profesionales del plan.
                      const err = planUserLimitError(db.clinics[0], db.users.filter((x) => x.id !== u.id), "dentist");
                      if (err) { alert(err); return; }
                    }
                    upsertUser({ ...u, role, asiste: role === "assistant" ? u.asiste ?? [] : undefined });
                  }}
                  className="rounded-lg border border-clinic-border px-2 py-1 text-xs font-semibold text-clinic-text focus:border-azure-400"
                >
                  {/* Un rol propio que ya no existe (se borró con la persona dada de baja) se sigue mostrando, para no cambiárselo sin querer. */}
                  {!rolesParaElegir().some((r) => r.id === u.role) && <option value={u.role}>{rolLabel(u.role)}</option>}
                  {rolesParaElegir().map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              )}
              {!esYo && (
                <button
                  onClick={toggleBaja}
                  disabled={activo && ultimoAdmin}
                  title={activo ? (ultimoAdmin ? "No podés dar de baja al último administrador" : "Dar de baja (revoca el acceso)") : "Reactivar acceso"}
                  className={`grid h-8 w-8 place-items-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${activo ? "border-clinic-border text-clinic-muted hover:border-state-err hover:text-state-err" : "border-state-ok/40 text-state-ok hover:bg-state-okbg"}`}
                >
                  {activo ? <Ban className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                </button>
              )}
            </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-clinic-muted">El % de comisión de cada dentista alimenta el cálculo de pago en <Link href="/app/reportes" className="font-bold text-azure-700">Reportes</Link>.</p>
        <p className="mt-1 text-[11px] text-clinic-muted">El círculo de color de cada persona es el color con el que se ve en la agenda: tocalo para cambiarlo.</p>
      </Card>
      </Reveal>

      <span id="permisos" className="block scroll-mt-24" aria-hidden="true" />
      {/* Permisos del equipo: qué puede ver y hacer cada rol en esta clínica */}
      <Reveal>
        <PermisosDelEquipo />
      </Reveal>

      <span id="convenios" className="block scroll-mt-24" aria-hidden="true" />
      {/* Convenios */}
      <Reveal>
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><Handshake className="h-4 w-4 text-azure-600" /><h2 className="font-bold text-clinic-text">Gestión de convenios</h2></div>
        <p className="mb-3 text-xs text-clinic-muted">Acuerdos con empresas/aseguradoras — el descuento se aplica automáticamente en los presupuestos.</p>
        <div className="flex flex-wrap gap-2">
          {(clinic.config.convenios ?? []).map((c) => (
            <span key={c.name} data-tip={[c.ruc && `RUC ${c.ruc}`, c.phone].filter(Boolean).join(" · ") || undefined} className="inline-flex items-center gap-2 rounded-full border border-clinic-border bg-clinic-bg px-3 py-1.5 text-xs font-bold text-clinic-text">
              {c.name} <span className="tabular-nums text-azure-700">{c.discountPct}%</span>
              <button
                onClick={() => updateClinicConfig({ convenios: (clinic.config.convenios ?? []).filter((x) => x.name !== c.name) })}
                className="text-clinic-muted hover:text-state-err" aria-label={`Quitar ${c.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
          {(clinic.config.convenios ?? []).length === 0 && <span className="text-sm text-clinic-muted">Sin convenios cargados.</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input className={inputCls + " !w-48"} placeholder="Nombre (ej: IPS)" value={convName} onChange={(e) => setConvName(e.target.value)} />
          <input type="number" min={0} max={100} step="any" className={inputCls + (convPctError ? " !border-state-err" : "") + " !w-24"} value={convPct} onChange={(e) => setConvPct(e.target.value)} title="% de cobertura/descuento" aria-label="Porcentaje del convenio" aria-invalid={!!convPctError} />
          <input className={inputCls + " !w-32"} placeholder="RUC (opcional)" value={convRuc} onChange={(e) => setConvRuc(e.target.value)} />
          <input className={inputCls + " !w-36"} placeholder="Teléfono (opcional)" value={convPhone} onChange={(e) => setConvPhone(e.target.value)} />
          <Btn
            variant="outline"
            disabled={!convName.trim() || !!convPctError}
            onClick={() => {
              if (!convPctParsed.ok) return;
              updateClinicConfig({ convenios: [...(clinic.config.convenios ?? []).filter((x) => x.name !== convName.trim()), { name: convName.trim(), discountPct: convPctParsed.valor, ruc: convRuc.trim() || undefined, phone: convPhone.trim() || undefined }] });
              setConvName(""); setConvPct("10"); setConvRuc(""); setConvPhone("");
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Agregar convenio
          </Btn>
        </div>
        {convPctError && <p role="alert" className="mt-2 text-xs font-semibold text-state-err">{convPctError}</p>}
      </Card>
      </Reveal>

      {/* Negociación de presupuestos (Botika) */}
      {(() => {
        const botika = clinic.config.botika;
        const neg = botika?.negociacion ?? NEGOCIACION_DEFAULTS;
        const fin = neg.financiacion ?? NEGOCIACION_DEFAULTS.financiacion;
        const isOn = botika?.automations?.negociacion ?? false;

        const saveBotika = (patch: Partial<BotikaConfig>) => {
          const existing = botika ?? { connected: false, automations: { confirmCita: false, nps: false, cobranza: false, reagendar: false, negociacion: false } };
          updateClinicConfig({
            botika: {
              ...existing,
              ...patch,
              automations: { ...existing.automations, ...(patch.automations ?? {}) },
              negociacion: { ...(existing.negociacion ?? NEGOCIACION_DEFAULTS), ...(patch.negociacion ?? {}) },
            },
          });
        };

        return (
          <Reveal>
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HandCoins className="h-4 w-4 text-azure-600" />
                <h2 className="font-bold text-clinic-text">Negociación de presupuestos</h2>
                <Badge tone={isOn ? "ok" : "muted"}>{isOn ? "Activo" : "Inactivo"}</Badge>
              </div>
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <span className="text-xs font-semibold text-clinic-muted">Botika</span>
                <button
                  role="switch"
                  aria-checked={isOn}
                  onClick={() => saveBotika({ automations: { ...(botika?.automations ?? { confirmCita: false, nps: false, cobranza: false, reagendar: false, negociacion: false }), negociacion: !isOn } })}
                  className={`relative h-5 w-9 rounded-full transition-colors ${isOn ? "bg-azure-600" : "bg-clinic-border"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isOn ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </label>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-clinic-muted">
              Cuando un presupuesto lleva N días en "presentado" sin respuesta, Botika re-engancha al paciente via WhatsApp
              y ofrece las condiciones de financiación definidas aquí.
            </p>
            <div className={`grid gap-4 sm:grid-cols-2 transition-opacity ${isOn ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
              <Field label="Días antes de re-enganchar" hint="Días en estado «presentado» que disparan el bot">
                <input
                  type="number" min={1} max={30} className={inputCls}
                  value={neg.diasGatillo}
                  onChange={(e) => saveBotika({ negociacion: { ...neg, diasGatillo: Number(e.target.value) || NEGOCIACION_DEFAULTS.diasGatillo } })}
                />
              </Field>
              <Field label="Máximo de intentos" hint="Tope de contactos antes de marcar «sin respuesta»">
                <input
                  type="number" min={1} max={5} className={inputCls}
                  value={neg.maxIntentos}
                  onChange={(e) => saveBotika({ negociacion: { ...neg, maxIntentos: Number(e.target.value) || NEGOCIACION_DEFAULTS.maxIntentos } })}
                />
              </Field>
              <Field label="Cuotas máximas" hint="Número máximo de cuotas que el bot puede ofrecer">
                <input
                  type="number" min={1} max={36} className={inputCls}
                  value={fin.maxCuotas}
                  onChange={(e) => saveBotika({ negociacion: { ...neg, financiacion: { ...fin, maxCuotas: Number(e.target.value) || NEGOCIACION_DEFAULTS.financiacion.maxCuotas } } })}
                />
              </Field>
              <Field label="Anticipo mínimo (%)" hint="0 = sin anticipo requerido">
                <input
                  type="number" min={0} max={100} className={inputCls}
                  value={fin.anticipoMinPct}
                  onChange={(e) => saveBotika({ negociacion: { ...neg, financiacion: { ...fin, anticipoMinPct: Number(e.target.value) } } })}
                />
              </Field>
              <div className="sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={fin.sinInteres}
                    onChange={(e) => saveBotika({ negociacion: { ...neg, financiacion: { ...fin, sinInteres: e.target.checked } } })}
                    className="h-4 w-4 rounded border-clinic-border text-azure-600 focus:ring-azure-500"
                  />
                  <span className="text-sm font-semibold text-clinic-text">Ofrecer cuotas sin interés</span>
                </label>
              </div>
            </div>
          </Card>
          </Reveal>
        );
      })()}

      {/* Plantilla de recordatorio */}
      <Reveal>
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-azure-600" /><h2 className="font-bold text-clinic-text">Confirmación de citas — plantilla WhatsApp</h2></div>
        <p className="mb-2 text-xs text-clinic-muted">Variables disponibles: <code className="tabular-nums">{"{paciente} {fecha} {hora} {clinica}"}</code>. Se usa desde la Agenda al enviar recordatorios.</p>
        <textarea
          rows={3}
          className={inputCls}
          value={template ?? clinic.config.reminderTemplate ?? ""}
          onChange={(e) => setTemplate(e.target.value)}
        />
        {template !== null && template !== (clinic.config.reminderTemplate ?? "") && (
          <div className="mt-2 flex justify-end">
            <Btn onClick={() => { updateClinicConfig({ reminderTemplate: template }); setTemplate(null); }}>Guardar plantilla</Btn>
          </div>
        )}
      </Card>
      </Reveal>

      {/* Migración desde el sistema anterior / carga masiva (sin nombrar a otro sistema en pantalla) */}
      <Reveal>
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><UploadCloud className="h-4 w-4 text-azure-600" /><h2 className="font-bold text-clinic-text">Migración desde otro sistema</h2></div>
          <Btn onClick={() => setImporting(true)}><UploadCloud className="h-4 w-4" /> Iniciar migración</Btn>
        </div>
        <p className="text-xs leading-relaxed text-clinic-muted">
          Traé toda tu base sin complicaciones: exportá la lista de <b>pacientes a Excel</b> desde tu sistema anterior, copiá y pegá (o subí el CSV) —
          Novudent detecta las columnas solo, omite duplicados por CI y si hay columna de <b>deuda</b> la carga directo en Cuentas por cobrar.
          Sirve también para cualquier otra planilla propia.
        </p>
      </Card>
      </Reveal>

      {/* Servicios / aranceles */}
      <Reveal>
      <Card className="p-5">
        <div id="logotipo" className="mb-3 flex scroll-mt-24 items-center gap-2"><ImageIcon className="h-4 w-4 text-azure-600" /><h2 className="font-bold text-clinic-text">Logotipo</h2></div>
        <p className="mb-3 text-xs text-clinic-muted">Se usa en la cabecera de la app y en los documentos impresos (presupuestos).</p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-16 w-40 place-items-center rounded-xl border border-clinic-border bg-clinic-bg">
            {clinic.config.logo ? <img src={clinic.config.logo} alt="Logo de la clínica" width={150} height={56} className="max-h-14 max-w-[150px] object-contain" /> : <Logotipo className="h-8 w-auto" />}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-clinic-border bg-white px-3 py-2 text-sm font-bold text-clinic-muted hover:text-clinic-text">
            <UploadCloud className="h-4 w-4" /> Subir logo
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) updateClinicConfig({ logo: await resizeToDataUrl(f, { maxDim: 400 }) }); }} />
          </label>
          {clinic.config.logo && <button onClick={() => updateClinicConfig({ logo: "" })} className="text-sm font-bold text-state-err hover:underline">Quitar</button>}
        </div>
      </Card>
      </Reveal>

      <Reveal>
      <Card className="p-5">
        <div id="fusion" className="mb-3 flex scroll-mt-24 items-center gap-2"><Users className="h-4 w-4 text-azure-600" /><h2 className="font-bold text-clinic-text">Fusión de fichas</h2></div>
        <p className="mb-3 text-xs text-clinic-muted">Unificá dos fichas duplicadas: citas, presupuestos, pagos e historial pasan a la ficha que se mantiene; la otra se elimina.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mantener esta ficha"><select className={inputCls} value={mergeKeep} onChange={(e) => { setMergeKeep(e.target.value); if (e.target.value === mergeRemove) setMergeRemove(""); }}>{db.patients.map((p) => <option key={p.id} value={p.id}>{fullName(p)} · {p.document}</option>)}</select></Field>
          <Field label="Fusionar y eliminar"><select className={inputCls} value={mergeRemove} onChange={(e) => setMergeRemove(e.target.value)}><option value="">— Elegí la ficha duplicada —</option>{db.patients.filter((p) => p.id !== mergeKeep).map((p) => <option key={p.id} value={p.id}>{fullName(p)} · {p.document}</option>)}</select></Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Btn disabled={!mergeRemove || mergeRemove === mergeKeep} onClick={() => {
            const a = db.patients.find((p) => p.id === mergeKeep); const b = db.patients.find((p) => p.id === mergeRemove);
            if (a && b && confirm(`¿Fusionar "${fullName(b)}" dentro de "${fullName(a)}"? Esta acción no se puede deshacer.`)) { mergePatients(mergeKeep, mergeRemove); setMergeRemove(""); }
          }}><Users className="h-4 w-4" /> Fusionar fichas</Btn>
        </div>
      </Card>
      </Reveal>

      <Reveal>
        <ArancelPrecios />
      </Reveal>

      <Reveal>
        <BancosEntidades />
      </Reveal>

      {/* Servicios adicionales */}
      <Reveal>
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-azure-600" /><h2 className="font-bold text-clinic-text">Servicios adicionales</h2></div>
        <p className="mb-4 text-xs text-clinic-muted">Capacidades extra de Novudent según tu plan. La activación real vive dentro de la ficha del paciente.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-2xl border border-clinic-border bg-clinic-bg p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-azure-100 text-azure-700"><ScanLine className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-clinic-text">Análisis IA de radiografías</span>
                <Badge tone={plan.features.includes("radiografia_ia") ? "ok" : "muted"}>{plan.features.includes("radiografia_ia") ? "Activo" : "No incluido en tu plan"}</Badge>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-clinic-muted">Lectura asistida por IA de panorámicas, bitewing y periapicales — editable por el profesional.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-clinic-border bg-clinic-bg p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-azure-100 text-azure-700"><FileSignature className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-clinic-text">Firma electrónica</span>
                <Badge tone={plan.features.includes("firma_electronica") ? "ok" : "muted"}>{plan.features.includes("firma_electronica") ? "Activo" : "No incluido en tu plan"}</Badge>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-clinic-muted">Consentimientos firmados en el consultorio o por QR desde el celular del paciente — guardados e imprimibles.</p>
            </div>
          </div>
        </div>
      </Card>
      </Reveal>

      <span id="consentimientos" className="block scroll-mt-24" aria-hidden="true" />
      {/* Plantillas de consentimiento */}
      <Reveal>
      <ConsentTemplatesCard
        templates={clinic.config.consentTemplates ?? []}
        onSave={saveConsentTemplates}
      />
      </Reveal>

      {/* Plazos de las tareas automáticas: cuánto pasa desde el evento (deuda,
          presupuesto presentado, tratamiento terminado, cita cancelada o ausente)
          hasta que la tarea aparece en "Tareas del día". Es el MISMO componente que
          el engranaje de /app/tareas (paridad Dentalink): una sola forma de guardar
          `config.taskDeadlines`. La página entera ya está gateada por `practice.config`. */}
      <Reveal>
        <div id="tareas" className="scroll-mt-24">
          <div className="mb-2 flex items-center gap-2"><ListChecks className="h-4 w-4 text-azure-600" /><h2 className="text-sm font-bold text-clinic-text">Plazos de tareas automáticas</h2></div>
          <PlazosTareas />
        </div>
      </Reveal>

      {/* Retención por medio de pago: el % que se queda la tarjeta/banco antes
          de que la plata entre a la clínica. Vive acá (no en Reportes) porque
          es una tasa pactada con el banco, no un filtro del reporte — mismo
          criterio que Plazos de tareas automáticas. */}
      <Reveal>
      <Card className="p-5">
        <div id="retencion" className="mb-1 flex scroll-mt-24 items-center gap-2"><Percent className="h-4 w-4 text-azure-600" /><h2 className="text-sm font-bold text-clinic-text">Retención por medio de pago</h2></div>
        <p className="mt-1 text-xs text-clinic-muted">El % que se queda el medio de pago (ej.: comisión de la tarjeta). Los reportes muestran el ingreso neto descontándolo. La caja y el arqueo siguen en bruto.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((method) => (
            <Field key={method} label={PAYMENT_METHOD_LABEL[method]}>
              <div className="flex items-center gap-1">
                <input
                  type="number" min={0} max={100} step={0.1}
                  className={inputCls}
                  value={clinic.config.paymentRetention?.[method] ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw === "" ? undefined : Number(raw);
                    updateClinicConfig({ paymentRetention: { ...clinic.config.paymentRetention, [method]: n } });
                  }}
                  placeholder="0"
                />
                <span className="text-sm font-bold text-clinic-muted">%</span>
              </div>
            </Field>
          ))}
        </div>
      </Card>
      </Reveal>

      {addingUser && (
        <NewUser
          firebase={backend === "firebase" && session?.clinicId !== "cl_demo"}
          onClose={() => setAddingUser(false)}
          onCreate={async (data) => {
            await createTeamUser(data);
            setOnboarding("usersCreated", true);
            setAddingUser(false);
          }}
        />
      )}
      {importing && <DentalinkImport onClose={() => setImporting(false)} />}
    </div>
  );
}

function BranchForm({ branch, onClose, onSave }: { branch: Branch; onClose: () => void; onSave: (b: Branch) => void }) {
  const [name, setName] = useState(branch.name);
  const [address, setAddress] = useState(branch.address ?? "");
  const [phone, setPhone] = useState(branch.phone ?? "");
  const [active, setActive] = useState(branch.active !== false);
  const guardar = () => {
    if (!name.trim()) return;
    onSave({ ...branch, id: branch.id || `b_${Date.now()}`, name: name.trim(), address: address.trim() || undefined, phone: phone.trim() || undefined, active });
  };
  return (
    <Modal title={branch.id ? "Editar sucursal" : "Nueva sucursal"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Ej. Sucursal Centro" /></Field>
        <Field label="Dirección"><input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} /></Field>
        <Field label="Teléfono"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></Field>
        <label className="flex items-center gap-2 text-sm text-clinic-text"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activa</label>
        <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancelar</Btn><Btn onClick={guardar}>Guardar</Btn></div>
      </div>
    </Modal>
  );
}

function NewUser({
  firebase,
  onClose,
  onCreate,
}: {
  firebase: boolean;
  onClose: () => void;
  onCreate: (d: { name: string; email: string; role: RolId; password: string; color: string; phone?: string }) => Promise<void>;
}) {
  const { db } = useStore();
  const [f, setF] = useState({ name: "", email: "", role: "receptionist" as RolId, password: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El color de agenda arranca con el del rol y se puede cambiar; lo que se eligió a mano no vuelve al del rol si se cambia el rol.
  const [colorElegido, setColorElegido] = useState<string | null>(null);
  const color = colorElegido ?? colorDelRol(f.role);
  const yaLoUsan = usuariosConColor(db.users, color);

  return (
    <Modal title="Agregar usuario" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onCreate({ name: f.name, email: f.email, role: f.role, password: f.password, color, phone: f.phone || undefined });
          } catch (err: any) {
            const code = err?.code ?? "";
            setError(
              code.includes("email-already-in-use") ? "Ese email ya tiene una cuenta."
              : code.includes("weak-password") ? "La contraseña debe tener al menos 6 caracteres."
              : code.includes("operation-not-allowed") ? "Habilitá «Email/Contraseña» en Firebase Console → Authentication → Sign-in method."
              : err?.message ?? "No se pudo crear el usuario."
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="rounded-xl bg-azure-50 p-3 text-xs leading-relaxed text-azure-700">
          {firebase
            ? "Se crea una cuenta real en Firebase Auth. Compartile el email y la contraseña provisional a tu colaborador — ingresa desde la pantalla de inicio de sesión."
            : "El alta de cuentas está disponible al ingresar como administrador de una clínica con conexión."}
        </p>
        <Field label="Nombre completo"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email"><input type="email" required autoComplete="off" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Contraseña provisional" hint="Mínimo 6 caracteres.">
            <input type="text" required minLength={6} autoComplete="new-password" className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Ej.: Clinica2026" />
          </Field>
        </div>
        <Field label="Teléfono (WhatsApp)" hint="Opcional — el dentista recibe alertas del monitor de recuperación post-op en este número.">
          <input type="tel" className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Ej.: +595981234567" />
        </Field>
        <Field label="Rol" hint={rolDescripcion(f.role)}>
          <select className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {rolesParaElegir().map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </Field>
        <div>
          <span className="mb-1 block text-[13px] font-semibold text-clinic-text">Color en la agenda</span>
          <SelectorDeColor valor={color} aria="Color en la agenda" onChange={setColorElegido} />
          <span className="mt-1 block text-[12px] text-clinic-muted">Es el color con el que se ve a esta persona en la agenda. Podés cambiarlo después, desde su fila.</span>
          {yaLoUsan.length > 0 && (
            <span role="status" className="mt-1 block text-[12px] font-semibold text-state-warn">
              Ojo: ya lo {yaLoUsan.length > 1 ? "usan" : "usa"} {yaLoUsan.map((u) => u.name).join(", ")}. Elegí otro si querés distinguirlos en la agenda.
            </span>
          )}
        </div>
        {f.role === "assistant" && (
          <p className="rounded-xl bg-clinic-bg p-3 text-xs leading-relaxed text-clinic-muted">
            Después de crearlo, elegí en la lista a qué doctores asiste: sin doctores asignados no ve agendas ni pacientes.
          </p>
        )}
        {error && <p role="alert" className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-state-err">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn type="submit" disabled={busy || !firebase}>{busy ? "Creando…" : "Crear usuario"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function ConsentTemplatesCard({ templates, onSave }: { templates: ConsentTemplate[]; onSave: (list: ConsentTemplate[]) => void }) {
  // Copia editable local; se persiste con "Guardar plantillas" (mismo patrón que
  // la plantilla de recordatorio). Agregar/borrar mutan la copia local también,
  // así un solo guardado consolida todos los cambios.
  const [list, setList] = useState<ConsentTemplate[]>(templates);
  const dirty = JSON.stringify(list) !== JSON.stringify(templates);

  const update = (id: string, patch: Partial<ConsentTemplate>) =>
    setList((xs) => xs.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const remove = (id: string) => setList((xs) => xs.filter((t) => t.id !== id));
  const add = () =>
    setList((xs) => [...xs, { id: crypto.randomUUID(), title: "Nuevo consentimiento", body: "" }]);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><FileSignature className="h-4 w-4 text-azure-600" /><h2 className="font-bold text-clinic-text">Plantillas de consentimiento</h2></div>
        <Btn variant="outline" onClick={add}><Plus className="h-3.5 w-3.5" /> Nueva plantilla</Btn>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-clinic-muted">
        Textos base que la clínica hace firmar al paciente (en el consultorio o por QR). Al crear un consentimiento
        desde la ficha se guarda una copia del texto, así editar una plantilla no altera los documentos ya firmados.
      </p>
      {list.length === 0 ? (
        <Empty title="Sin plantillas" desc="Agregá una plantilla para empezar a hacer firmar consentimientos." />
      ) : (
        <div className="space-y-3">
          {list.map((t) => (
            <div key={t.id} className="rounded-2xl border border-clinic-border bg-clinic-bg p-4">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label="Título">
                    <input className={inputCls} value={t.title} onChange={(e) => update(t.id, { title: e.target.value })} placeholder="Ej.: Consentimiento informado general" />
                  </Field>
                </div>
                <button
                  onClick={() => remove(t.id)}
                  className="mb-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-clinic-border text-clinic-muted hover:border-state-err hover:text-state-err"
                  aria-label={`Eliminar ${t.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2">
                <Field label="Cuerpo del consentimiento">
                  <textarea rows={4} className={inputCls} value={t.body} onChange={(e) => update(t.id, { body: e.target.value })} placeholder="Texto que el paciente lee y firma…" />
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}
      {dirty && (
        <div className="mt-3 flex justify-end gap-2">
          <Btn variant="outline" onClick={() => setList(templates)}>Descartar</Btn>
          <Btn onClick={() => onSave(list)}>Guardar plantillas</Btn>
        </div>
      )}
    </Card>
  );
}

/** Asistente de doctores: a qué dentistas asiste. Sin ninguno no ve agendas ni pacientes. */
function AsisteA({ usuario, dentistas, onChange }: { usuario: User; dentistas: User[]; onChange: (asiste: string[]) => void }) {
  const asiste = usuario.asiste ?? [];
  return (
    <div role="group" aria-label={`Doctores a los que asiste ${usuario.name}`} className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] font-semibold text-clinic-muted">Asiste a:</span>
      {dentistas.length === 0 && <span className="text-[11px] text-clinic-muted">no hay dentistas activos</span>}
      {dentistas.map((d) => {
        const on = asiste.includes(d.id);
        return (
          <button
            key={d.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? asiste.filter((x) => x !== d.id) : [...asiste, d.id])}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${on ? "border-azure-500 bg-azure-50 text-azure-700" : "border-clinic-border text-clinic-muted hover:border-azure-300"}`}
          >
            {d.name}
          </button>
        );
      })}
      {dentistas.length > 0 && asiste.length === 0 && <Badge tone="warn">Sin doctores</Badge>}
    </div>
  );
}
