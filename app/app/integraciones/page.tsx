"use client";
/** Integraciones (solo Administrador). Botika: bot agéntico de WhatsApp (botika.lat)
 *  conectado por outbox/inbox sobre Firestore — contrato en docs/INTEGRACION-BOTIKA.md. */
import { useState } from "react";
import {
  ShieldAlert, Bot, MessageCircle, Star, Wallet, CalendarClock, RefreshCcw, Trash2, ExternalLink, Zap, CheckCircle2, PlayCircle,
} from "lucide-react";
import { useStore, fmtDate, fmtTime, fullName } from "@/lib/store";
import { can } from "@/lib/rbac";
import type { OutboxTask, OutboxTaskType, BotikaConfig } from "@/lib/types";
import { Card, Btn, Badge, Empty } from "@/components/ui";

const TYPE_INFO: Record<OutboxTaskType, { label: string; icon: any; tone: "info" | "ok" | "warn" | "hold" }> = {
  confirmar_cita: { label: "Confirmación de cita", icon: CalendarClock, tone: "info" },
  nps: { label: "Encuesta NPS", icon: Star, tone: "ok" },
  cobranza: { label: "Cobranza", icon: Wallet, tone: "warn" },
  reagendar: { label: "Reagendamiento", icon: RefreshCcw, tone: "hold" },
};

const AUTOMATIONS: { key: keyof BotikaConfig["automations"]; label: string; desc: string; icon: any }[] = [
  { key: "confirmCita", label: "Confirmación de citas", desc: "Al crear una cita, Botika escribe al paciente y la confirma sola cuando responde.", icon: CalendarClock },
  { key: "nps", label: "Encuestas NPS", desc: "Al completar un tratamiento, Botika pregunta del 0 al 10 y guarda el puntaje en la ficha.", icon: Star },
  { key: "cobranza", label: "Cobranza conversacional", desc: "Recordatorios de deuda con respuesta inteligente: cuotas, medios de pago, comprobantes.", icon: Wallet },
  { key: "reagendar", label: "Reagendar canceladas", desc: "Cuando se cancela una cita, Botika ofrece nuevos horarios automáticamente.", icon: RefreshCcw },
];

export default function IntegrationsPage() {
  const store = useStore();
  const { db, session } = store;
  const [busy, setBusy] = useState<string | null>(null);

  if (!session) return null;
  if (!can(session.role, "practice.config")) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-lg font-extrabold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">Las integraciones las gestiona el rol <b>Administrador</b>.</p>
      </Card>
    );
  }

  const clinic = db.clinics[0];
  const botika: BotikaConfig = clinic.config.botika ?? { connected: false, automations: { confirmCita: true, nps: true, cobranza: true, reagendar: true } };
  const tasks = [...db.outbox].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = tasks.filter((t) => t.status === "pendiente");
  const responded = tasks.filter((t) => t.status === "respondido");

  const setBotika = (patch: Partial<BotikaConfig>) =>
    store.updateClinicConfig({ botika: { ...botika, ...patch, automations: { ...botika.automations, ...(patch.automations ?? {}) } } });

  /** Demo: simula la respuesta que escribiría el worker real de Botika */
  const simulate = (t: OutboxTask) => {
    setBusy(t.id);
    setTimeout(() => {
      const now = new Date().toISOString();
      if (t.type === "confirmar_cita" || t.type === "reagendar") {
        store.applyOutboxResult(t.id, { at: now, confirmed: true, reply: "Sí, confirmo. ¡Gracias por avisar! 👍" });
      } else if (t.type === "nps") {
        store.applyOutboxResult(t.id, { at: now, nps: 9, comment: "Muy conforme con la atención." });
      } else {
        store.applyOutboxResult(t.id, { at: now, reply: "Perfecto, mañana paso a pagar la cuota por la clínica." });
      }
      setBusy(null);
    }, 900);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-clinic-text">Integraciones</h1>
        <p className="text-sm text-clinic-muted">Conectá Novudent con el ecosistema NOVUM.</p>
      </div>

      {/* ===== Botika ===== */}
      <Card className="relative overflow-hidden p-6">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-azure-50 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-navy-800"><Bot className="h-7 w-7 text-azure-300" /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-clinic-text">Botika</h2>
                <Badge tone="info">by NOVUM</Badge>
                {botika.connected ? <Badge tone="ok" tip="Outbox activo — esperando credenciales del worker para mensajería real">Conectado · modo demo</Badge> : <Badge tone="muted">Desconectado</Badge>}
              </div>
              <p className="mt-1 max-w-xl text-sm text-clinic-muted">
                Bot agéntico de WhatsApp con IA. Confirma citas, hace encuestas NPS y cobra — conversando como un humano, 24/7.
                Corre como servicio independiente y se comunica con Novudent por el <b>outbox</b> de Firestore.
              </p>
              <a href="https://botika.lat" target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-azure-700 hover:underline">
                botika.lat <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <Btn variant={botika.connected ? "outline" : "primary"} onClick={() => setBotika({ connected: !botika.connected })}>
            <Zap className="h-4 w-4" /> {botika.connected ? "Desconectar" : "Conectar Botika"}
          </Btn>
        </div>

        {/* automatizaciones */}
        <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
          {AUTOMATIONS.map((a) => {
            const on = botika.connected && botika.automations[a.key];
            return (
              <button
                key={a.key}
                disabled={!botika.connected}
                onClick={() => setBotika({ automations: { ...botika.automations, [a.key]: !botika.automations[a.key] } })}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-all ${
                  on ? "border-azure-300 bg-azure-50/60" : "border-clinic-border bg-white opacity-80"
                } ${botika.connected ? "hover:-translate-y-0.5 hover:shadow-card" : "cursor-not-allowed"}`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${on ? "bg-azure-600 text-white" : "bg-clinic-bg text-clinic-muted"}`}>
                  <a.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <b className="text-sm text-clinic-text">{a.label}</b>
                    <span className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors ${on ? "bg-azure-600" : "bg-clinic-border"}`}>
                      <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-clinic-muted">{a.desc}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="relative mt-4 rounded-xl bg-clinic-bg p-3 text-[11px] leading-relaxed text-clinic-muted">
          <b>Cómo funciona:</b> Novudent encola tareas en <code className="font-mono">clinics/{clinic.id}/outbox</code>;
          el worker de Botika las escucha con una service account, conversa por WhatsApp y escribe el resultado en el mismo documento.
          La cita se confirma o el NPS aparece en la ficha sin intervención manual. Contrato técnico completo en{" "}
          <code className="font-mono">docs/INTEGRACION-BOTIKA.md</code>.
        </p>
      </Card>

      {/* ===== Cola de mensajería (outbox) ===== */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-azure-600" />
            <h2 className="font-extrabold text-clinic-text">Cola de mensajería</h2>
          </div>
          <div className="flex gap-2">
            <Badge tone={pending.length ? "warn" : "ok"}>{pending.length} pendiente{pending.length !== 1 && "s"}</Badge>
            <Badge tone="ok">{responded.length} respondida{responded.length !== 1 && "s"}</Badge>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="py-6"><Empty title="Sin tareas en la cola" desc="Las automatizaciones encolan tareas al crear citas, completar tratamientos o gestionar cobranzas." /></div>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {tasks.map((t) => {
              const info = TYPE_INFO[t.type];
              const patient = db.patients.find((p) => p.id === t.patientId);
              return (
                <li key={t.id} className="rounded-2xl border border-clinic-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-clinic-bg"><info.icon className="h-4 w-4 text-azure-600" /></span>
                    <Badge tone={info.tone}>{info.label}</Badge>
                    <span className="text-sm font-bold text-clinic-text">{patient ? fullName(patient) : t.phone}</span>
                    <span className="font-mono text-[11px] text-clinic-muted">{fmtDate(t.createdAt)} {fmtTime(t.createdAt)}</span>
                    <span className="ml-auto flex items-center gap-2">
                      {t.status === "pendiente" && <Badge tone="warn" tip="Esperando que el worker de Botika la procese">Pendiente</Badge>}
                      {t.status === "enviado" && <Badge tone="info">Enviado</Badge>}
                      {t.status === "respondido" && <Badge tone="ok">Respondido</Badge>}
                      {t.status === "error" && <Badge tone="err" tip={t.result?.error}>Error</Badge>}
                      {t.status === "pendiente" && (
                        <>
                          <button
                            onClick={() => simulate(t)}
                            disabled={busy === t.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-azure-50 px-2.5 py-1.5 text-[11px] font-bold text-azure-700 transition-colors hover:bg-azure-100 disabled:opacity-50"
                            title="Demo: simula la respuesta que escribirá el worker real de Botika"
                          >
                            <PlayCircle className="h-3.5 w-3.5" /> {busy === t.id ? "Conversando…" : "Simular respuesta"}
                          </button>
                          <button onClick={() => store.deleteOutboxTask(t.id)} className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err" title="Cancelar tarea">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                  <p className="mt-2 rounded-xl bg-clinic-bg px-3 py-2 text-xs text-clinic-muted">{t.message}</p>
                  {t.result && (
                    <div className="mt-2 flex items-start gap-2 rounded-xl bg-state-okbg px-3 py-2 text-xs text-state-ok">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {typeof t.result.nps === "number" && <><b>NPS {t.result.nps}/10</b>{t.result.comment && <> — “{t.result.comment}”</>}</>}
                        {t.result.confirmed && <><b>Cita confirmada</b>{t.result.reply && <> — “{t.result.reply}”</>}</>}
                        {!t.result.confirmed && typeof t.result.nps !== "number" && t.result.reply && <>“{t.result.reply}”</>}
                        <span className="ml-1 opacity-70">· {fmtTime(t.result.at)}</span>
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
