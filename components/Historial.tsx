"use client";
/** Historial clínico = timeline unificado (paridad Dentalink): citas + evoluciones +
 *  prestaciones realizadas + pagos + notas, agrupados por día, con filtros e impresión. */
import { useMemo, useState } from "react";
import { Printer, Calendar, Activity, Receipt, ClipboardList, Stethoscope } from "lucide-react";
import { useStore, fmtGs } from "@/lib/store";
import { buildHistorial, type HistorialKind, type HistorialEntry } from "@/lib/historial";
import type { Patient } from "@/lib/types";
import { Card, Badge, Empty } from "@/components/ui";

const KIND_META: Record<HistorialKind, { color: string; icon: any }> = {
  cita: { color: "bg-azure-500", icon: Calendar },
  evolucion: { color: "bg-navy-800", icon: Activity },
  prestacion: { color: "bg-state-ok", icon: Stethoscope },
  pago: { color: "bg-state-warn", icon: Receipt },
  nota: { color: "bg-azure-300", icon: ClipboardList },
};

export function HistorialTimeline({ patient }: { patient: Patient }) {
  const { db } = useStore();
  const [tipo, setTipo] = useState<"todos" | HistorialKind>("todos");
  const [mes, setMes] = useState("todos");

  const all = useMemo(
    () =>
      buildHistorial({
        appointments: db.appointments.filter((a) => a.patientId === patient.id),
        ortho: patient.ortho,
        budgets: db.budgets.filter((b) => b.patientId === patient.id),
        payments: db.payments.filter((p) => p.patientId === patient.id),
        emr: patient.emr,
      }),
    [db, patient],
  );

  const meses = useMemo(() => [...new Set(all.map((e) => e.at.slice(0, 7)))].sort().reverse(), [all]);
  const filtered = all.filter((e) => (tipo === "todos" || e.kind === tipo) && (mes === "todos" || e.at.slice(0, 7) === mes));

  const groups: { day: string; items: HistorialEntry[] }[] = [];
  for (const e of filtered) {
    const day = new Date(e.at).toLocaleDateString("en-CA"); // YYYY-MM-DD local (evita corrimiento TZ)
    const g = groups.find((x) => x.day === day);
    if (g) g.items.push(e);
    else groups.push({ day, items: [e] });
  }

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("es-PY", { month: "long", year: "numeric" });
  };
  const dayLabel = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-PY", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select className="rounded-xl border border-clinic-border bg-white px-3 py-1.5 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
          <option value="todos">Todos los tipos</option>
          <option value="cita">Citas</option>
          <option value="evolucion">Evoluciones</option>
          <option value="prestacion">Prestaciones</option>
          <option value="pago">Pagos</option>
          <option value="nota">Notas</option>
        </select>
        <select className="rounded-xl border border-clinic-border bg-white px-3 py-1.5 text-sm" value={mes} onChange={(e) => setMes(e.target.value)}>
          <option value="todos">Todos los meses</option>
          {meses.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <button onClick={() => window.print()} className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-clinic-border px-3 py-1.5 text-sm font-bold text-clinic-text hover:border-azure-300">
          <Printer className="h-4 w-4" /> Imprimir
        </button>
      </div>

      {filtered.length === 0 ? (
        <Empty title="Sin movimientos" desc="Citas, evoluciones, prestaciones y pagos del paciente aparecerán acá." />
      ) : (
        <div className="print-area space-y-5">
          {groups.map((g) => (
            <div key={g.day}>
              <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-clinic-muted">{dayLabel(g.day)}</h4>
              <div className="relative space-y-2.5 pl-5 before:absolute before:bottom-2 before:left-1.5 before:top-2 before:w-px before:bg-clinic-border">
                {g.items.map((e) => {
                  const m = KIND_META[e.kind];
                  return (
                    <Card key={e.id} className="relative p-3.5">
                      <span className={`absolute -left-[14px] top-4 h-3 w-3 rounded-full border-2 border-white ${m.color}`} />
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-clinic-muted">
                        <m.icon className="h-3.5 w-3.5" />
                        <span className="font-bold uppercase tracking-wide">{e.title}</span>
                        {e.badge && <Badge tone="muted">{e.badge}</Badge>}
                        {e.by && <span>· {e.by}</span>}
                        <span className="ml-auto font-mono">{new Date(e.at).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <p className="mt-1 text-sm text-clinic-text">
                        {e.detail}
                        {e.amount != null && <span className="ml-1 font-mono font-bold text-state-ok">· {fmtGs(e.amount)}</span>}
                      </p>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
