"use client";
/** Reporte "Pacientes de Ortodoncia" (paridad Dentalink): KPIs + tabla con
 *  progreso calendario. Reusa orthoProgress (lib/ortho.ts). */
import { useMemo } from "react";
import { Braces, AlertTriangle, CalendarX, Baby, Users, UserCheck, Download } from "lucide-react";
import { useStore, fmtDate } from "@/lib/store";
import { orthoProgress } from "@/lib/ortho";
import { downloadCsv } from "@/lib/csv";
import { Card, Empty, Btn } from "@/components/ui";

export function PacientesOrtodoncia() {
  const { db } = useStore();

  const data = useMemo(() => {
    const now = Date.now();
    const active = db.patients.filter((p) => p.ortho?.active);
    const ageOf = (bd?: string) => {
      if (!bd) return null;
      const t = Date.parse(bd);
      if (Number.isNaN(t)) return null;
      const a = Math.floor((now - t) / (365.25 * 86_400_000));
      return a >= 0 ? a : null;
    };
    const futureAppt = new Set(
      db.appointments.filter((a) => Date.parse(a.start) > now && a.status !== "cancelada").map((a) => a.patientId),
    );
    const rows = active
      .map((p) => {
        const o = p.ortho!;
        const prog = orthoProgress(o, now);
        const lastBy = [...o.controls].sort((a, b) => b.date.localeCompare(a.date))[0]?.by;
        const orthoBudget = db.budgets.find((b) => b.patientId === p.id && b.planType === "ortodoncia");
        const dentist = orthoBudget ? db.users.find((u) => u.id === orthoBudget.dentistId)?.name : undefined;
        return {
          p, o, prog, age: ageOf(p.birthDate),
          dr: dentist ?? lastBy ?? "—",
          overdue: !!o.nextControlDate && Date.parse(o.nextControlDate) < now,
          noFuture: !futureAppt.has(p.id),
        };
      })
      .sort((a, b) => b.prog.calendarPct - a.prog.calendarPct);

    const ages = rows.map((r) => r.age).filter((x): x is number => x != null);
    const kpis = {
      activos: rows.length,
      atrasados: rows.filter((r) => r.overdue).length,
      sinCita: rows.filter((r) => r.noFuture).length,
      e1_6: ages.filter((a) => a <= 6).length,
      e6_12: ages.filter((a) => a > 6 && a <= 12).length,
      e12: ages.filter((a) => a > 12).length,
    };
    return { rows, kpis };
  }, [db]);

  const descargar = () => {
    downloadCsv("pacientes-ortodoncia.csv", [
      ["Nombre", "Apellidos", "Sexo", "Edad", "Tel. móvil", "Inicio tratamiento", "Dr(a) tratante", "Progreso calendario %"],
      ...data.rows.map((r) => [r.p.firstName, r.p.lastName, r.p.sex ?? r.p.gender ?? "", r.age ?? "", r.p.phone, fmtDate(r.o.startDate), r.dr, r.prog.calendarPct]),
    ]);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-extrabold text-clinic-text">Pacientes en tratamiento de ortodoncia</h3>
        {data.rows.length > 0 && <Btn variant="outline" onClick={descargar}><Download className="h-3.5 w-3.5" /> Descargar reporte</Btn>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="En tratamiento activo" value={data.kpis.activos} icon={Braces} tone="azure" />
        <Kpi label="Atrasados" value={data.kpis.atrasados} icon={AlertTriangle} tone={data.kpis.atrasados ? "err" : "muted"} />
        <Kpi label="Sin cita futura" value={data.kpis.sinCita} icon={CalendarX} tone={data.kpis.sinCita ? "warn" : "muted"} />
        <Kpi label="De 1 a 6 años" value={data.kpis.e1_6} icon={Baby} tone="muted" />
        <Kpi label="De 6 a 12 años" value={data.kpis.e6_12} icon={Users} tone="muted" />
        <Kpi label="Mayores de 12" value={data.kpis.e12} icon={UserCheck} tone="muted" />
      </div>

      {data.rows.length === 0 ? (
        <Empty title="Sin pacientes en ortodoncia" desc="Los tratamientos de ortodoncia activos aparecerán acá." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                <th className="px-4 py-3">Paciente</th>
                <th className="px-2 py-3">Sexo</th>
                <th className="px-2 py-3">Edad</th>
                <th className="px-2 py-3">Tel. móvil</th>
                <th className="px-2 py-3">Inicio</th>
                <th className="px-2 py-3">Dr(a) tratante</th>
                <th className="w-48 px-4 py-3">Progreso calendario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-clinic-border">
              {data.rows.map((r) => (
                <tr key={r.p.id} className="hover:bg-clinic-bg/60">
                  <td className="px-4 py-2.5">
                    <a href={`/app/pacientes/${r.p.id}`} className="font-semibold text-clinic-text hover:text-azure-700">{r.p.firstName} {r.p.lastName}</a>
                    {r.overdue && <span className="ml-2 rounded-full bg-state-errbg px-1.5 text-[11px] font-bold text-state-err">ATRASADO</span>}
                  </td>
                  <td className="px-2 py-2.5 text-clinic-muted">{r.p.sex ?? r.p.gender ?? "—"}</td>
                  <td className="px-2 py-2.5 text-clinic-muted">{r.age ?? "—"}</td>
                  <td className="px-2 py-2.5 font-mono text-xs text-clinic-muted">{r.p.phone}</td>
                  <td className="px-2 py-2.5 text-clinic-muted">{fmtDate(r.o.startDate)}</td>
                  <td className="px-2 py-2.5 text-clinic-muted">{r.dr}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-clinic-bg">
                        <div className="h-full rounded-full bg-azure-500 transition-all" style={{ width: `${r.prog.calendarPct}%` }} />
                      </div>
                      <span className="w-9 text-right font-mono text-xs font-bold text-clinic-text">{r.prog.calendarPct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: "azure" | "err" | "warn" | "muted" }) {
  const c = { azure: "text-azure-600", err: "text-state-err", warn: "text-state-warn", muted: "text-clinic-muted" }[tone];
  return (
    <Card className="p-4 text-center">
      <Icon className={`mx-auto h-5 w-5 ${c}`} />
      <div className="mt-1 font-mono text-2xl font-extrabold text-clinic-text">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-clinic-muted">{label}</div>
    </Card>
  );
}
