"use client";
/** Configuración de la práctica (solo Administrador): usuarios (con % comisión),
 *  servicios, convenios, plantilla de recordatorio y carga masiva de pacientes. */
import { useEffect, useState } from "react";
import { ShieldAlert, Plus, UserCog, Users, Stethoscope, Building2, Handshake, Trash2, Pencil, MessageSquareText, UploadCloud, Percent, HandCoins, ScanLine, Sparkles, FileSignature, Image as ImageIcon } from "lucide-react";
import { useStore, fmtGs, fullName } from "@/lib/store";
import { CURRENCY_LIST, type CurrencyCode } from "@/lib/currency";
import { can, ROLE_LABEL } from "@/lib/rbac";
import type { Role, User, Procedure, BotikaConfig, ConsentTemplate } from "@/lib/types";
import { Card, Btn, Modal, Field, inputCls, Badge, Empty } from "@/components/ui";
import { useClinicPlan } from "@/components/PlanGate";
import DentalinkImport from "@/components/DentalinkImport";
import { resizeToDataUrl } from "@/lib/image";
import { Reveal } from "@/components/motion";

const NEGOCIACION_DEFAULTS: Required<NonNullable<BotikaConfig["negociacion"]>> = {
  diasGatillo: 5,
  maxIntentos: 2,
  financiacion: { maxCuotas: 3, sinInteres: true, anticipoMinPct: 0 },
};

export default function ConfigPage() {
  const { db, session, upsertProcedure, deleteProcedure, mergePatients, setOnboarding, createTeamUser, backend, updateClinicConfig, upsertUser, saveConsentTemplates } = useStore();
  const plan = useClinicPlan();
  const [addingUser, setAddingUser] = useState(false);
  const [addingProc, setAddingProc] = useState(false);
  const [editingProc, setEditingProc] = useState<Procedure | null>(null);
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
  const [convPct, setConvPct] = useState(10);
  const [convRuc, setConvRuc] = useState("");
  const [convPhone, setConvPhone] = useState("");
  const [template, setTemplate] = useState<string | null>(null);

  if (!session) return null;
  if (!can(session.role, "practice.config")) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-lg font-extrabold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">La configuración de la práctica es exclusiva del rol <b>Administrador</b> (matriz RBAC, sec. 2.2).</p>
      </Card>
    );
  }

  const clinic = db.clinics[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-clinic-text">Configuración</h1>
        <p className="text-sm text-clinic-muted">Usuarios, servicios y datos de la clínica.</p>
      </div>

      {/* Clínica */}
      <Reveal>
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Clínica</h2></div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div><span className="text-clinic-muted">Nombre:</span> <b>{clinic?.name}</b></div>
          <div id="moneda" className="scroll-mt-24"><span className="text-clinic-muted">Moneda:</span>{" "}
            <select
              value={clinic?.config.currency ?? "PYG"}
              onChange={(e) => updateClinicConfig({ currency: e.target.value as CurrencyCode })}
              className="ml-1 rounded-lg border border-clinic-border bg-white px-2 py-1 text-sm font-bold text-clinic-text outline-none focus:border-azure-400"
            >
              {CURRENCY_LIST.map((c) => <option key={c.code} value={c.code}>{c.symbol} · {c.name} ({c.code})</option>)}
            </select>
          </div>
          <div><span className="text-clinic-muted">Dirección:</span> <b>{clinic?.config.address}</b></div>
          <div><span className="text-clinic-muted">Teléfono:</span> <b>{clinic?.config.phone}</b></div>
        </div>
        <p className="mt-3 text-[11px] text-clinic-muted">Cambiar la moneda afecta el formato en toda la app (presupuestos, pagos, caja, reportes). No convierte montos por tipo de cambio.</p>
      </Card>
      </Reveal>

      <span id="usuarios" className="block scroll-mt-24" aria-hidden="true" />
      {/* Usuarios */}
      <Reveal>
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><UserCog className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Usuarios del equipo</h2><span data-tip={`Tu Plan ${plan.label} incluye hasta ${plan.maxUsers === Infinity ? "usuarios ilimitados" : `${plan.maxUsers} usuarios`} y ${plan.maxDentists === Infinity ? "profesionales ilimitados" : `${plan.maxDentists} profesional${plan.maxDentists > 1 ? "es" : ""}`}`} className="rounded-full bg-clinic-bg px-2 py-0.5 font-mono text-[10px] font-bold text-clinic-muted">{db.users.filter((u) => u.active).length}{plan.maxUsers === Infinity ? "" : ` / ${plan.maxUsers}`}</span></div>
          <Btn onClick={() => setAddingUser(true)}><Plus className="h-4 w-4" /> Agregar usuario</Btn>
        </div>
        <div className="divide-y divide-clinic-border">
          {db.users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: u.color }}>
                {u.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-clinic-text">{u.name}</span>
                <span className="block text-xs text-clinic-muted">{u.email}{u.phone ? ` · ${u.phone}` : ""}</span>
              </span>
              {u.role === "dentist" && (
                <label className="flex items-center gap-1 rounded-lg border border-clinic-border px-2 py-1" title="% de comisión sobre producción cobrada">
                  <Percent className="h-3 w-3 text-clinic-muted" />
                  <input
                    type="number" min={0} max={100}
                    className="w-10 bg-transparent text-right font-mono text-xs font-bold text-clinic-text focus:outline-none"
                    value={u.commissionPct ?? 0}
                    onChange={(e) => upsertUser({ ...u, commissionPct: Number(e.target.value) || 0 })}
                  />
                </label>
              )}
              <Badge tone={u.role === "admin" ? "info" : u.role === "dentist" ? "ok" : "warn"}>{ROLE_LABEL[u.role]}</Badge>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-clinic-muted">El % de comisión de cada dentista alimenta el cálculo de pago en <a href="/app/reportes" className="font-bold text-azure-700">Reportes</a>.</p>
      </Card>
      </Reveal>

      <span id="convenios" className="block scroll-mt-24" aria-hidden="true" />
      {/* Convenios */}
      <Reveal>
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><Handshake className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Gestión de convenios</h2></div>
        <p className="mb-3 text-xs text-clinic-muted">Acuerdos con empresas/aseguradoras — el descuento se aplica automáticamente en los presupuestos.</p>
        <div className="flex flex-wrap gap-2">
          {(clinic.config.convenios ?? []).map((c) => (
            <span key={c.name} data-tip={[c.ruc && `RUC ${c.ruc}`, c.phone].filter(Boolean).join(" · ") || undefined} className="inline-flex items-center gap-2 rounded-full border border-clinic-border bg-clinic-bg px-3 py-1.5 text-xs font-bold text-clinic-text">
              {c.name} <span className="font-mono text-azure-700">{c.discountPct}%</span>
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
          <input type="number" min={0} max={100} className={inputCls + " !w-24"} value={convPct} onChange={(e) => setConvPct(Number(e.target.value))} title="% de cobertura/descuento" />
          <input className={inputCls + " !w-32"} placeholder="RUC (opcional)" value={convRuc} onChange={(e) => setConvRuc(e.target.value)} />
          <input className={inputCls + " !w-36"} placeholder="Teléfono (opcional)" value={convPhone} onChange={(e) => setConvPhone(e.target.value)} />
          <Btn
            variant="outline"
            disabled={!convName.trim()}
            onClick={() => {
              updateClinicConfig({ convenios: [...(clinic.config.convenios ?? []).filter((x) => x.name !== convName.trim()), { name: convName.trim(), discountPct: convPct, ruc: convRuc.trim() || undefined, phone: convPhone.trim() || undefined }] });
              setConvName(""); setConvRuc(""); setConvPhone("");
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Agregar convenio
          </Btn>
        </div>
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
                <h2 className="font-extrabold text-clinic-text">Negociación de presupuestos</h2>
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
        <div className="mb-3 flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Confirmación de citas — plantilla WhatsApp</h2></div>
        <p className="mb-2 text-xs text-clinic-muted">Variables disponibles: <code className="font-mono">{"{paciente} {fecha} {hora} {clinica}"}</code>. Se usa desde la Agenda al enviar recordatorios.</p>
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

      {/* Migración desde Dentalink / carga masiva */}
      <Reveal>
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><UploadCloud className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Migración desde Dentalink</h2></div>
          <Btn onClick={() => setImporting(true)}><UploadCloud className="h-4 w-4" /> Iniciar migración</Btn>
        </div>
        <p className="text-xs leading-relaxed text-clinic-muted">
          Traé toda tu base sin complicaciones: exportá <b>Reportes → Pacientes → Excel</b> en Dentalink, copiá y pegá (o subí el CSV) —
          Novudent detecta las columnas solo, omite duplicados por CI y si hay columna de <b>deuda</b> la carga directo en Cuentas por cobrar.
          Sirve también para cualquier otro software o planilla propia.
        </p>
      </Card>
      </Reveal>

      {/* Servicios / aranceles */}
      <Reveal>
      <Card className="p-5">
        <div id="logotipo" className="mb-3 flex scroll-mt-24 items-center gap-2"><ImageIcon className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Logotipo</h2></div>
        <p className="mb-3 text-xs text-clinic-muted">Se usa en la cabecera de la app y en los documentos impresos (presupuestos).</p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-16 w-40 place-items-center rounded-xl border border-clinic-border bg-clinic-bg">
            {clinic.config.logo ? <img src={clinic.config.logo} alt="Logo" className="max-h-14 max-w-[150px] object-contain" /> : <span className="font-logo text-lg text-navy-800">NOVUdent</span>}
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
        <div id="fusion" className="mb-3 flex scroll-mt-24 items-center gap-2"><Users className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Fusión de fichas</h2></div>
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
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div id="arancel" className="flex scroll-mt-24 items-center gap-2"><Stethoscope className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Servicios y aranceles</h2></div>
          <Btn onClick={() => setAddingProc(true)}><Plus className="h-4 w-4" /> Agregar servicio</Btn>
        </div>
        {db.procedures.length === 0 ? (
          <Empty title="Sin servicios" />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                <th className="py-2 pr-3">Código</th><th className="py-2 pr-3">Descripción</th><th className="py-2 text-right">Arancel</th><th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-clinic-border">
              {db.procedures.map((p) => (
                <tr key={p.cpt} className="hover:bg-clinic-bg/50">
                  <td className="py-2.5 pr-3 font-mono font-bold text-clinic-text">{p.cpt}</td>
                  <td className="py-2.5 pr-3">{p.description}</td>
                  <td className="py-2.5 text-right font-mono">{fmtGs(p.price)}</td>
                  <td className="py-2.5 pl-2 text-right">
                    <span className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditingProc(p)} title="Editar servicio" className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-azure-50 hover:text-azure-700"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { if (confirm(`¿Eliminar el servicio ${p.cpt} — ${p.description}?`)) deleteProcedure(p.cpt); }} title="Eliminar servicio" className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err"><Trash2 className="h-3.5 w-3.5" /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
      </Reveal>

      {/* Servicios adicionales */}
      <Reveal>
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Servicios adicionales</h2></div>
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

      {/* Plantillas de consentimiento */}
      <Reveal>
      <ConsentTemplatesCard
        templates={clinic.config.consentTemplates ?? []}
        onSave={saveConsentTemplates}
      />
      </Reveal>

      {addingUser && (
        <NewUser
          firebase={backend === "firebase"}
          onClose={() => setAddingUser(false)}
          onCreate={async (data) => {
            await createTeamUser(data);
            setOnboarding("usersCreated", true);
            setAddingUser(false);
          }}
        />
      )}
      {addingProc && (
        <NewProc
          onClose={() => setAddingProc(false)}
          onSave={(p) => { upsertProcedure(p); setOnboarding("servicesDefined", true); setAddingProc(false); }}
        />
      )}
      {editingProc && (
        <NewProc
          proc={editingProc}
          onClose={() => setEditingProc(null)}
          onSave={(p) => { upsertProcedure(p); setEditingProc(null); }}
        />
      )}
      {importing && <DentalinkImport onClose={() => setImporting(false)} />}
    </div>
  );
}

function NewUser({
  firebase,
  onClose,
  onCreate,
}: {
  firebase: boolean;
  onClose: () => void;
  onCreate: (d: { name: string; email: string; role: Role; password: string; color: string; phone?: string }) => Promise<void>;
}) {
  const [f, setF] = useState({ name: "", email: "", role: "assistant" as Role, password: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const COLORS: Record<Role, string> = { admin: "#1769E0", dentist: "#0E9F6E", assistant: "#B45309" };

  return (
    <Modal title="Agregar usuario" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onCreate({ name: f.name, email: f.email, role: f.role, password: f.password, color: COLORS[f.role], phone: f.phone || undefined });
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
            : "⚠ Estás en modo local: el usuario se guarda solo en este navegador. Conectá Firebase para crear cuentas reales."}
        </p>
        <Field label="Nombre completo"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email"><input type="email" required autoComplete="off" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Contraseña provisional" hint="Mínimo 6 caracteres.">
            <input type="text" required minLength={6} autoComplete="new-password" className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Ej.: Clinica2026" />
          </Field>
        </div>
        <Field label="Teléfono (WhatsApp)" hint="Opcional — el dentista recibe alertas del monitor de recuperación post-op en este número.">
          <input type="tel" className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Ej.: +595981234567" />
        </Field>
        <Field label="Rol" hint="Define permisos según la matriz RBAC.">
          <select className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            <option value="admin">Administrador</option>
            <option value="dentist">Dentista</option>
            <option value="assistant">Asistente</option>
          </select>
        </Field>
        {error && <p role="alert" className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-state-err">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn type="submit" disabled={busy}>{busy ? "Creando…" : "Crear usuario"}</Btn>
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
        <div className="flex items-center gap-2"><FileSignature className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Plantillas de consentimiento</h2></div>
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

function NewProc({ proc, onClose, onSave }: { proc?: Procedure; onClose: () => void; onSave: (p: Procedure) => void }) {
  const isEdit = !!proc;
  const [f, setF] = useState<Procedure>(proc ?? { cpt: "", description: "", price: 0, defaultDx: [] });
  return (
    <Modal title={isEdit ? "Editar servicio" : "Agregar servicio"} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); onSave({ ...f, cpt: f.cpt.toUpperCase() }); }}
      >
        <Field label="Código (CPT/CDT)"><input required disabled={isEdit} className={inputCls} value={f.cpt} onChange={(e) => setF({ ...f, cpt: e.target.value })} placeholder="D2330" /></Field>
        <Field label="Descripción"><input required className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Arancel (Gs)"><input type="number" min={0} required className={inputCls} value={f.price} onChange={(e) => setF({ ...f, price: +e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancelar</Btn><Btn type="submit">{isEdit ? "Guardar" : "Crear servicio"}</Btn></div>
      </form>
    </Modal>
  );
}
