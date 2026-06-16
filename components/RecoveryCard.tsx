"use client";
/**
 * RecoveryCard — bloque post-operatorio en la ficha del paciente.
 *
 * Estados:
 *   - Monitor activo/escalado → timeline de los 3 touchpoints (24h/48h/72h)
 *     con semáforo, dolor y resumen. Botón "Marcar resuelto" solo si emr.write.
 *   - Sin monitor → prompt compacto con "Activar monitor" solo si emr.write.
 */
import { HeartPulse, CheckCircle2, Clock } from "lucide-react";
import { useStore } from "@/lib/store";
import { buildMonitor } from "@/lib/recovery";
import { can } from "@/lib/rbac";
import type { Patient, RecoveryTouchpoint } from "@/lib/types";
import { Card, Badge, Btn } from "@/components/ui";

/* Semáforo: mapea severity → clases de color */
function SeverityDot({ severity }: { severity?: RecoveryTouchpoint["severity"] }) {
  const cls =
    severity === "rojo"
      ? "bg-state-err"
      : severity === "amarillo"
      ? "bg-state-warn"
      : severity === "verde"
      ? "bg-state-ok"
      : "bg-clinic-border"; // pendiente / enviado
  return <span className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${cls}`} />;
}

const LABEL: Record<24 | 48 | 72, string> = {
  24: "Control 24 h",
  48: "Control 48 h",
  72: "Control 72 h",
};

const STATUS_LABEL: Record<RecoveryTouchpoint["status"], string> = {
  pendiente: "Pendiente",
  enviado: "Enviado",
  respondido: "Respondido",
  vencido: "Vencido",
};

export default function RecoveryCard({ patient }: { patient: Patient }) {
  // --- ALL hooks before any conditional return ---
  const { db, session, addRecoveryMonitor, resolveRecoveryMonitor } = useStore();

  const monitor = db.recoveryMonitors.find(
    (m) => m.patientId === patient.id && (m.status === "activo" || m.status === "escalado")
  );

  const canWrite = session ? can(session.role, "emr.write") : false;

  if (!session) return null;

  /* ---- Active/escalated monitor ---- */
  if (monitor) {
    const isEscalated = monitor.status === "escalado";
    return (
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <HeartPulse className="h-4 w-4 text-azure-600" />
          <h2 className="font-extrabold text-clinic-text">Recuperación post-operatoria</h2>
          <Badge tone={isEscalated ? "err" : "info"}>
            {isEscalated ? "Escalado" : "Activo"}
          </Badge>
          <span className="text-xs text-clinic-muted ml-auto">{monitor.procedure}</span>
        </div>

        {/* Timeline */}
        <div className="space-y-3">
          {monitor.touchpoints.map((tp) => (
            <div
              key={tp.offsetHours}
              className="flex items-start gap-3 rounded-xl bg-clinic-bg p-3"
            >
              <SeverityDot severity={tp.severity} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-clinic-text">{LABEL[tp.offsetHours]}</span>
                  <span className="text-clinic-muted">{STATUS_LABEL[tp.status]}</span>
                  {tp.pain != null && (
                    <span className="rounded-full bg-state-warnbg px-2 py-0.5 font-mono text-[10.5px] font-semibold text-state-warn">
                      Dolor {tp.pain}/10
                    </span>
                  )}
                </div>
                {tp.summary && (
                  <p className="mt-1 text-xs leading-relaxed text-clinic-muted">{tp.summary}</p>
                )}
                {tp.reply && !tp.summary && (
                  <p className="mt-1 text-xs leading-relaxed text-clinic-muted">{tp.reply}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Resolve button */}
        {canWrite && (
          <div className="mt-4 flex justify-end">
            <Btn
              variant="outline"
              onClick={() => resolveRecoveryMonitor(monitor.id, session.name)}
            >
              <CheckCircle2 className="h-4 w-4" /> Marcar resuelto
            </Btn>
          </div>
        )}
      </Card>
    );
  }

  /* ---- No active monitor ---- */
  if (!canWrite) return null; // nothing to show for read-only roles without a monitor

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Clock className="h-4 w-4 text-clinic-muted" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-clinic-text">Monitor de recuperación post-op</p>
          <p className="text-xs text-clinic-muted">Sin monitor activo para este paciente.</p>
        </div>
        <Btn
          variant="outline"
          onClick={() => {
            // Try to infer procedure from most recent surgical procedure in the catalog,
            // or fall back to a generic label.
            const surgicalProc = db.procedures.find((pr) => pr.surgical);
            const procedureLabel = surgicalProc?.description ?? "Procedimiento quirúrgico";
            addRecoveryMonitor(
              buildMonitor({
                id: "rm_" + Date.now(),
                clinicId: session.clinicId,
                patientId: patient.id,
                dentistId: session.userId,
                procedure: procedureLabel,
                now: new Date(),
              })
            );
          }}
        >
          <HeartPulse className="h-4 w-4" /> Activar monitor de recuperación
        </Btn>
      </div>
    </Card>
  );
}
