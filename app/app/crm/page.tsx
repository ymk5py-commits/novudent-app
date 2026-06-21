"use client";
/** CRM / embudo de pacientes (paridad Dentalink).
 *  Pipeline kanban por etapa + oportunidades derivadas de presupuestos
 *  presentados + pacientes a reactivar (sin cita futura) + log de campañas.
 *  El envío real se hace por WhatsApp/Botika; acá solo se registra. */
import { useMemo, useState } from "react";
import {
  ShieldAlert, Plus, Trash2, ChevronLeft, ChevronRight, UserPlus, Pencil, Target,
  ArrowRight, RefreshCcw, Megaphone, MessageCircle, Mail, Bot, Check, Cake, Filter,
} from "lucide-react";
import { useStore, fmtDate, fmtGs, fullName, waLink } from "@/lib/store";
import { can } from "@/lib/rbac";
import { budgetTotal, patientBalance } from "@/lib/budgets";
import type { CrmCard, CrmStage, Campaign, Patient } from "@/lib/types";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";
import { PlanLocked, useClinicPlan } from "@/components/PlanGate";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

/* Etapas del embudo en orden + presentación (color/etiqueta) */
const STAGES: { id: CrmStage; label: string; tone: "muted" | "info" | "warn" | "ok" | "err" }[] = [
  { id: "nuevo", label: "Nuevo", tone: "info" },
  { id: "contactado", label: "Contactado", tone: "info" },
  { id: "presupuesto", label: "Presupuesto", tone: "warn" },
  { id: "seguimiento", label: "Seguimiento", tone: "warn" },
  { id: "ganado", label: "Ganado", tone: "ok" },
  { id: "perdido", label: "Perdido", tone: "err" },
];
const STAGE_INDEX: Record<CrmStage, number> = {
  nuevo: 0, contactado: 1, presupuesto: 2, seguimiento: 3, ganado: 4, perdido: 5,
};

export default function CrmPage() {
  const store = useStore();
  const { db, session } = store;
  const [newCard, setNewCard] = useState(false);
  const [editing, setEditing] = useState<CrmCard | null>(null);
  const [newCampaign, setNewCampaign] = useState(false);
  const [seg, setSeg] = useState({ gender: "", city: "", ageMin: "", ageMax: "", deuda: false, sinCita: false });

  const plan = useClinicPlan();
  if (!session) return null;
  if (!plan.features.includes("crm")) return <PlanLocked feature="crm" />;

  const allowed = can(session.role, "engagement.forms"); // admin + asistente gestionan
  if (!allowed) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-lg font-extrabold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">El CRM lo gestionan el <b>Administrador</b> y la <b>Asistente</b>.</p>
      </Card>
    );
  }

  const patientName = (id: string) => {
    const p = db.patients.find((x) => x.id === id);
    return p ? fullName(p) : "—";
  };

  /* Pipeline agrupado por etapa */
  const byStage = useMemo(() => {
    const map: Record<CrmStage, CrmCard[]> = { nuevo: [], contactado: [], presupuesto: [], seguimiento: [], ganado: [], perdido: [] };
    for (const c of db.crmCards) map[c.stage]?.push(c);
    for (const k of Object.keys(map) as CrmStage[]) map[k].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return map;
  }, [db.crmCards]);

  const moveCard = (c: CrmCard, dir: -1 | 1) => {
    const next = STAGE_INDEX[c.stage] + dir;
    if (next < 0 || next >= STAGES.length) return;
    store.updateCrmCard({ ...c, stage: STAGES[next].id, updatedAt: new Date().toISOString() });
  };

  /* Oportunidades: presupuestos presentados (abiertos) sin tarjeta ganada/perdida */
  const opportunities = db.budgets
    .filter((b) => b.status === "presentado")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  /* Reactivación: pacientes sin ninguna cita futura */
  const reactivation = useMemo(() => {
    const now = new Date().toISOString();
    const hasFuture = new Set(
      db.appointments.filter((a) => a.start > now && a.status !== "cancelada").map((a) => a.patientId)
    );
    return db.patients.filter((p) => !hasFuture.has(p.id));
  }, [db.patients, db.appointments]);

  /* Cumpleaños: pacientes que cumplen en los próximos 7 días */
  const birthdays = useMemo(() => {
    const now = new Date();
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const list: { p: Patient; inDays: number; turns: number }[] = [];
    for (const p of db.patients) {
      if (!p.birthDate) continue;
      const d = new Date(p.birthDate);
      if (Number.isNaN(d.getTime())) continue;
      let next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
      if (next < today0) next = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
      const inDays = Math.round((next.getTime() - today0.getTime()) / 86400000);
      if (inDays <= 7) list.push({ p, inDays, turns: next.getFullYear() - d.getFullYear() });
    }
    return list.sort((a, b) => a.inDays - b.inDays);
  }, [db.patients]);

  /* Segmentador de pacientes (filtros combinables → lista de destinatarios) */
  const cities = useMemo(() => [...new Set(db.patients.map((p) => p.city).filter(Boolean) as string[])].sort(), [db.patients]);
  const segMatches = useMemo(() => {
    const now = new Date();
    const nowIso = now.toISOString();
    const hasFuture = new Set(db.appointments.filter((a) => a.start > nowIso && a.status !== "cancelada").map((a) => a.patientId));
    const ageOf = (bd?: string) => { if (!bd) return null; const t = Date.parse(bd); if (Number.isNaN(t)) return null; return Math.floor((now.getTime() - t) / (365.25 * 86_400_000)); };
    return db.patients.filter((p) => {
      if (seg.gender && p.gender !== seg.gender) return false;
      if (seg.city && p.city !== seg.city) return false;
      const a = ageOf(p.birthDate);
      if (seg.ageMin && (a == null || a < +seg.ageMin)) return false;
      if (seg.ageMax && (a == null || a > +seg.ageMax)) return false;
      if (seg.deuda && patientBalance(p.id, db.budgets, db.payments) <= 0) return false;
      if (seg.sinCita && hasFuture.has(p.id)) return false;
      return true;
    });
  }, [db, seg]);

  const addToPipeline = (patientId: string, stage: CrmStage, note?: string) => {
    const now = new Date().toISOString();
    store.addCrmCard({ id: crypto.randomUUID(), patientId, stage, note, createdAt: now, updatedAt: now });
  };

  return (
    <div className="space-y-5">
      <Reveal className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-clinic-text">CRM</h1>
          <p className="text-sm text-clinic-muted">Embudo de pacientes, oportunidades y campañas de captación.</p>
        </div>
        <Btn onClick={() => setNewCard(true)}><UserPlus className="h-4 w-4" /> Nuevo en pipeline</Btn>
      </Reveal>

      {/* ===== Pipeline (Kanban) ===== */}
      <Reveal>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((st) => {
            const cards = byStage[st.id];
            return (
              <div key={st.id} className="flex min-w-0 flex-col rounded-2xl border border-clinic-border bg-clinic-bg/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-1">
                  <span className="truncate text-xs font-extrabold uppercase tracking-wide text-clinic-text">{st.label}</span>
                  <Badge tone={st.tone}>{cards.length}</Badge>
                </div>
                <div className="space-y-2">
                  {cards.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-clinic-border py-4 text-center text-[11px] text-clinic-muted">Vacío</p>
                  ) : (
                    cards.map((c) => (
                      <Card key={c.id} className="p-3">
                        <div className="flex items-start justify-between gap-1.5">
                          <a href={`/app/pacientes/${c.patientId}`} className="min-w-0 flex-1 truncate text-sm font-bold text-clinic-text hover:text-azure-700">
                            {patientName(c.patientId)}
                          </a>
                          <button
                            onClick={() => store.deleteCrmCard(c.id)}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err"
                            title="Quitar del pipeline"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {c.note && <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-clinic-muted">{c.note}</p>}
                        <div className="mt-2 flex items-center justify-between gap-1 border-t border-clinic-border pt-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => moveCard(c, -1)}
                              disabled={STAGE_INDEX[c.stage] === 0}
                              className="grid h-6 w-6 place-items-center rounded-lg text-clinic-muted transition-colors hover:bg-clinic-bg hover:text-clinic-text disabled:opacity-30"
                              title="Etapa anterior"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => moveCard(c, 1)}
                              disabled={STAGE_INDEX[c.stage] === STAGES.length - 1}
                              className="grid h-6 w-6 place-items-center rounded-lg text-clinic-muted transition-colors hover:bg-clinic-bg hover:text-clinic-text disabled:opacity-30"
                              title="Etapa siguiente"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <button
                            onClick={() => setEditing(c)}
                            className="grid h-6 w-6 place-items-center rounded-lg text-clinic-muted transition-colors hover:bg-clinic-bg hover:text-azure-700"
                            title="Editar nota"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ===== Oportunidades (derivado) ===== */}
        <Reveal>
          <Card className="flex h-full flex-col p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-state-warnbg text-state-warn"><Target className="h-4 w-4" /></span>
                <h2 className="font-extrabold text-clinic-text">Oportunidades</h2>
              </div>
              <Badge tone={opportunities.length > 0 ? "warn" : "muted"}>{opportunities.length} abierta{opportunities.length !== 1 && "s"}</Badge>
            </div>
            <p className="mt-1 text-xs text-clinic-muted">Presupuestos presentados a la espera de respuesta.</p>
            {opportunities.length === 0 ? (
              <p className="py-8 text-center text-sm text-clinic-muted">Sin presupuestos presentados.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {opportunities.map((b) => {
                  const inPipeline = db.crmCards.some((c) => c.patientId === b.patientId && c.stage === "presupuesto");
                  return (
                    <li key={b.id} className="flex items-center gap-3 rounded-xl bg-clinic-bg p-3">
                      <a href={`/app/pacientes/${b.patientId}`} className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-clinic-text hover:text-azure-700">{patientName(b.patientId)}</span>
                        <span className="font-mono text-xs font-extrabold text-state-warn">{fmtGs(budgetTotal(b))}</span>
                        <span className="ml-1.5 text-[11px] text-clinic-muted">· {fmtDate(b.createdAt)}</span>
                      </a>
                      <Btn
                        variant="outline"
                        disabled={inPipeline}
                        onClick={() => addToPipeline(b.patientId, "presupuesto", `Presupuesto ${fmtGs(budgetTotal(b))} presentado el ${fmtDate(b.createdAt)}`)}
                        tip={inPipeline ? "Ya está en el pipeline" : "Crear tarjeta en etapa Presupuesto"}
                      >
                        {inPipeline ? <><Check className="h-3.5 w-3.5" /> En pipeline</> : <><ArrowRight className="h-3.5 w-3.5" /> Pipeline</>}
                      </Btn>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </Reveal>

        {/* ===== Reactivación (derivado) ===== */}
        <Reveal>
          <Card className="flex h-full flex-col p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-state-infobg text-state-info"><RefreshCcw className="h-4 w-4" /></span>
                <h2 className="font-extrabold text-clinic-text">Reactivación</h2>
              </div>
              <Badge tone={reactivation.length > 0 ? "info" : "muted"}>{reactivation.length} paciente{reactivation.length !== 1 && "s"}</Badge>
            </div>
            <p className="mt-1 text-xs text-clinic-muted">Sin próxima cita agendada — candidatos a re-contactar.</p>
            {reactivation.length === 0 ? (
              <p className="py-8 text-center text-sm text-clinic-muted">🎉 Todos tienen su próxima cita.</p>
            ) : (
              <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                {reactivation.map((p) => {
                  const inPipeline = db.crmCards.some((c) => c.patientId === p.id);
                  return (
                    <li key={p.id} className="flex items-center gap-3 rounded-xl bg-clinic-bg p-3">
                      <a href={`/app/pacientes/${p.id}`} className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-clinic-text hover:text-azure-700">{fullName(p)}</span>
                        {p.phone && <span className="font-mono text-[11px] text-clinic-muted">{p.phone}</span>}
                      </a>
                      <Btn
                        variant="outline"
                        disabled={inPipeline}
                        onClick={() => addToPipeline(p.id, "seguimiento", "Reactivación: sin próxima cita")}
                        tip={inPipeline ? "Ya está en el pipeline" : "Crear tarjeta en etapa Seguimiento"}
                      >
                        {inPipeline ? <><Check className="h-3.5 w-3.5" /> En pipeline</> : <><ArrowRight className="h-3.5 w-3.5" /> Pipeline</>}
                      </Btn>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </Reveal>
      </div>

      {/* ===== Cumpleaños (derivado) ===== */}
      <Reveal>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-state-warnbg text-state-warn"><Cake className="h-4 w-4" /></span>
              <h2 className="font-extrabold text-clinic-text">Cumpleaños</h2>
            </div>
            <Badge tone={birthdays.length > 0 ? "warn" : "muted"}>{birthdays.length} en 7 días</Badge>
          </div>
          <p className="mt-1 text-xs text-clinic-muted">Saludá a tus pacientes — fideliza y reactiva.</p>
          {birthdays.length === 0 ? (
            <p className="py-8 text-center text-sm text-clinic-muted">Sin cumpleaños en los próximos 7 días.</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {birthdays.map(({ p, inDays, turns }) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl bg-clinic-bg p-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${inDays === 0 ? "bg-state-warn text-white" : "bg-white text-state-warn"}`}><Cake className="h-4 w-4" /></span>
                  <a href={`/app/pacientes/${p.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-clinic-text hover:text-azure-700">{fullName(p)}</span>
                    <span className="text-[11px] text-clinic-muted">{inDays === 0 ? "¡Hoy!" : inDays === 1 ? "Mañana" : `En ${inDays} días`} · cumple {turns}</span>
                  </a>
                  {p.phone && (
                    <a href={waLink(p.phone, `¡Feliz cumpleaños ${p.firstName}! 🎉 Te saludamos desde ${db.clinics[0].name}. ¡Que tengas un gran día!`)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366]/10 px-3 py-2 text-xs font-bold text-[#128C7E] transition-colors hover:bg-[#25D366]/20" title="Saludar por WhatsApp">
                      <MessageCircle className="h-3.5 w-3.5" /> Saludar
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Reveal>

      {/* ===== Segmentar pacientes ===== */}
      <Reveal>
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-azure-100 text-azure-700"><Filter className="h-4 w-4" /></span><h2 className="font-extrabold text-clinic-text">Segmentar pacientes</h2></div>
            <Badge tone="info">{segMatches.length} paciente{segMatches.length !== 1 && "s"}</Badge>
          </div>
          <p className="mb-3 text-xs text-clinic-muted">Combiná filtros para armar una lista de destinatarios (deudores, por ciudad, edad, sin cita…).</p>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <select value={seg.gender} onChange={(e) => setSeg({ ...seg, gender: e.target.value })} className={inputCls}><option value="">Todos los géneros</option><option value="M">Masculino</option><option value="F">Femenino</option></select>
            <select value={seg.city} onChange={(e) => setSeg({ ...seg, city: e.target.value })} className={inputCls}><option value="">Todas las ciudades</option>{cities.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <input type="number" min={0} placeholder="Edad mín." value={seg.ageMin} onChange={(e) => setSeg({ ...seg, ageMin: e.target.value })} className={inputCls} />
            <input type="number" min={0} placeholder="Edad máx." value={seg.ageMax} onChange={(e) => setSeg({ ...seg, ageMax: e.target.value })} className={inputCls} />
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-clinic-border px-3 text-sm text-clinic-text"><input type="checkbox" checked={seg.deuda} onChange={(e) => setSeg({ ...seg, deuda: e.target.checked })} className="accent-azure-600" /> Con deuda</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-clinic-border px-3 text-sm text-clinic-text"><input type="checkbox" checked={seg.sinCita} onChange={(e) => setSeg({ ...seg, sinCita: e.target.checked })} className="accent-azure-600" /> Sin cita futura</label>
          </div>
          {segMatches.length === 0 ? (
            <p className="py-6 text-center text-sm text-clinic-muted">Ningún paciente coincide con esos filtros.</p>
          ) : (
            <ul className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {segMatches.slice(0, 30).map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl bg-clinic-bg p-2.5">
                  <a href={`/app/pacientes/${p.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-clinic-text hover:text-azure-700">{fullName(p)}</span>
                    <span className="text-[11px] text-clinic-muted">{[p.city, p.gender].filter(Boolean).join(" · ") || "—"}</span>
                  </a>
                  {p.phone && <a href={waLink(p.phone, `Hola ${p.firstName} 👋 Te escribimos de ${db.clinics[0].name}.`)} target="_blank" rel="noopener noreferrer" className="grid h-8 w-8 place-items-center rounded-lg bg-[#25D366]/10 text-[#128C7E] hover:bg-[#25D366]/20" title="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}
                </li>
              ))}
              {segMatches.length > 30 && <li className="col-span-full text-center text-xs text-clinic-muted">+{segMatches.length - 30} más…</li>}
            </ul>
          )}
        </Card>
      </Reveal>

      {/* ===== Campañas ===== */}
      <Reveal>
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-state-okbg text-state-ok"><Megaphone className="h-4 w-4" /></span>
              <h2 className="font-extrabold text-clinic-text">Campañas</h2>
            </div>
            <Btn variant="outline" onClick={() => setNewCampaign(true)}><Plus className="h-4 w-4" /> Nueva campaña</Btn>
          </div>
          <p className="mt-1 text-xs text-clinic-muted">
            <Bot className="mb-0.5 mr-1 inline h-3.5 w-3.5" /> El envío se hace por WhatsApp/Botika. Acá registrás el mensaje y la audiencia.
          </p>
          {db.campaigns.length === 0 ? (
            <div className="mt-3"><Empty title="Sin campañas registradas" desc="Creá una campaña para dejar registro del mensaje y la audiencia objetivo." /></div>
          ) : (
            <Stagger className="mt-3 grid gap-3 sm:grid-cols-2">
              {[...db.campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((c) => (
                <StaggerItem key={c.id} className="h-full">
                  <div className="flex h-full flex-col rounded-xl border border-clinic-border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-clinic-text">{c.name}</div>
                        <div className="mt-0.5 text-[11px] text-clinic-muted">{fmtDate(c.createdAt)}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge tone={c.channel === "whatsapp" ? "ok" : "info"}>
                          {c.channel === "whatsapp" ? <><MessageCircle className="mr-1 h-3 w-3" /> WhatsApp</> : <><Mail className="mr-1 h-3 w-3" /> Email</>}
                        </Badge>
                        <button
                          onClick={() => store.deleteCampaign(c.id)}
                          className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err"
                          title="Eliminar campaña"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-snug text-clinic-text">{c.message}</p>
                    <div className="mt-auto pt-2 text-[11px] text-clinic-muted">
                      <span className="font-semibold uppercase tracking-wide">Audiencia:</span> {c.audience || "—"}
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </Card>
      </Reveal>

      {newCard && <CardForm onClose={() => setNewCard(false)} />}
      {editing && <CardForm card={editing} onClose={() => setEditing(null)} />}
      {newCampaign && <CampaignForm onClose={() => setNewCampaign(false)} />}
    </div>
  );
}

/* ===== Alta / edición de tarjeta del pipeline ===== */
function CardForm({ card, onClose }: { card?: CrmCard; onClose: () => void }) {
  const store = useStore();
  const { db } = store;
  const editing = !!card;
  const [patientId, setPatientId] = useState(card?.patientId ?? db.patients[0]?.id ?? "");
  const [stage, setStage] = useState<CrmStage>(card?.stage ?? "nuevo");
  const [note, setNote] = useState(card?.note ?? "");

  return (
    <Modal title={editing ? "Editar tarjeta" : "Nuevo en pipeline"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Paciente">
          <select className={inputCls} value={patientId} onChange={(e) => setPatientId(e.target.value)} disabled={editing}>
            {db.patients.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
          </select>
        </Field>
        <Field label="Etapa">
          <select className={inputCls} value={stage} onChange={(e) => setStage(e.target.value as CrmStage)}>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Nota" hint="Contexto del contacto, próximo paso, etc.">
          <textarea className={inputCls} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: Interesado en ortodoncia, llamar el martes…" />
        </Field>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn
            disabled={!patientId}
            onClick={() => {
              const now = new Date().toISOString();
              if (editing && card) {
                store.updateCrmCard({ ...card, stage, note: note.trim() || undefined, updatedAt: now });
              } else {
                store.addCrmCard({ id: crypto.randomUUID(), patientId, stage, note: note.trim() || undefined, createdAt: now, updatedAt: now });
              }
              onClose();
            }}
          >
            {editing ? "Guardar" : "Agregar"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ===== Alta de campaña ===== */
function CampaignForm({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const { db } = store;
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<Campaign["channel"]>("whatsapp");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("");

  return (
    <Modal title="Nueva campaña" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Limpieza de invierno" />
          </Field>
          <Field label="Canal">
            <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as Campaign["channel"])}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
          </Field>
        </div>
        <Field label="Audiencia" hint="A quién apunta — texto libre (ej: pacientes sin cita en 6 meses)">
          <input className={inputCls} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Ej: Pacientes inactivos, convenio Asismed…" />
        </Field>
        <Field label="Mensaje" hint="El envío real se hace por WhatsApp/Botika — esto es solo el registro.">
          <textarea className={inputCls} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hola {paciente} 👋 Te invitamos a tu control semestral…" />
        </Field>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn
            disabled={!name.trim() || !message.trim()}
            onClick={() => {
              const c: Campaign = {
                id: crypto.randomUUID(),
                name: name.trim(),
                channel,
                message: message.trim(),
                audience: audience.trim(),
                createdAt: new Date().toISOString(),
              };
              store.addCampaign(c);
              onClose();
            }}
          >
            Guardar campaña
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
