"use client";
import Link from "next/link";
/** «Análisis de estudios específicos» (antes «Pacientes de Ortodoncia», revisión de Novum
 *  del 27/9/2026): pacientes por tipo de tratamiento — vista general, ortodoncia,
 *  rehabilitación oral u odontología estética. Ortodoncia conserva su reporte propio
 *  (progreso, controles); los demás salen del tipo de consulta de las citas. */
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useStore, fmtDate, fullName } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import { downloadCsv } from "@/lib/csv";
import { PacientesOrtodoncia } from "@/components/PacientesOrtodoncia";
import { Card, Empty, Btn } from "@/components/ui";

type Vista = "general" | "ortodoncia" | "rehabilitacion" | "estetica";
const VISTAS: { k: Vista; label: string }[] = [
  { k: "general", label: "Vista general" },
  { k: "ortodoncia", label: "Ortodoncia" },
  { k: "rehabilitacion", label: "Rehabilitación oral" },
  { k: "estetica", label: "Odontología estética" },
];

export function AnalisisEstudios() {
  const [vista, setVista] = useState<Vista>("general");
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Tipo de estudio" className="flex flex-wrap gap-1.5">
        {VISTAS.map((v) => (
          <button key={v.k} type="button" aria-pressed={vista === v.k} onClick={() => setVista(v.k)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${vista === v.k ? "bg-azure-600 text-white" : "border border-clinic-border bg-white text-clinic-muted hover:text-clinic-text"}`}>
            {v.label}
          </button>
        ))}
      </div>
      {vista === "ortodoncia" ? <PacientesOrtodoncia /> : <TablaEstudio vista={vista} />}
    </div>
  );
}

function TablaEstudio({ vista }: { vista: Exclude<Vista, "ortodoncia"> }) {
  const { db } = useStore();
  const alcance = useAlcance();
  const verPersonales = alcance.puede("patients.personal");
  const titulo = VISTAS.find((v) => v.k === vista)!.label;

  const filas = useMemo(() => {
    const ahora = Date.now();
    return db.patients
      .filter((p) => alcance.vePaciente(p.id) && !p.disabled)
      .map((p) => {
        const citas = db.appointments.filter((a) => a.patientId === p.id && a.status !== "cancelada" && (vista === "general" || a.tipoConsulta === vista));
        const planes = db.budgets.filter((b) => b.patientId === p.id).length;
        const pasadas = citas.filter((a) => Date.parse(a.start) <= ahora).sort((a, b) => b.start.localeCompare(a.start));
        const futuras = citas.filter((a) => Date.parse(a.start) > ahora).sort((a, b) => a.start.localeCompare(b.start));
        const ultima = pasadas[0] ?? futuras[0];
        const profesional = ultima ? db.users.find((u) => u.id === ultima.dentistId)?.name : undefined;
        return { p, citas: citas.length, planes, ultima: pasadas[0], proxima: futuras[0], profesional };
      })
      // Vista general: todo paciente con cita o plan; las demás, los que tienen citas de ese tipo.
      .filter((f) => (vista === "general" ? f.citas > 0 || f.planes > 0 : f.citas > 0))
      .sort((a, b) => fullName(a.p).localeCompare(fullName(b.p)));
  }, [db.patients, db.appointments, db.budgets, db.users, alcance, vista]);

  const sinProxima = filas.filter((f) => !f.proxima).length;

  const exportar = () => downloadCsv(`estudios-${vista}`, [
    ["Paciente", ...(verPersonales ? ["CI"] : []), "Profesional", "Última cita", "Próxima cita", "Citas", "Planes"],
    ...filas.map((f) => [fullName(f.p), ...(verPersonales ? [f.p.document] : []), f.profesional ?? "—", f.ultima ? fmtDate(f.ultima.start) : "—", f.proxima ? fmtDate(f.proxima.start) : "—", f.citas, f.planes]),
  ]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-2xl font-extrabold text-clinic-text">{filas.length}</div><div className="text-xs text-clinic-muted">Pacientes en {titulo.toLowerCase()}</div></Card>
        <Card className="p-4"><div className="text-2xl font-extrabold text-clinic-text">{filas.length - sinProxima}</div><div className="text-xs text-clinic-muted">Con próxima cita</div></Card>
        <Card className="p-4"><div className="text-2xl font-extrabold text-state-warn">{sinProxima}</div><div className="text-xs text-clinic-muted">Sin próxima cita (a recontactar)</div></Card>
      </div>
      {filas.length === 0 ? (
        <Empty title={`Sin pacientes en ${titulo.toLowerCase()}`} desc={vista === "general" ? "Cuando un paciente tenga una cita o un plan, aparece acá." : "Aparecen los pacientes con citas de este tipo de consulta (se elige al dar la cita)."} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <div className="flex items-center justify-between border-b border-clinic-border px-4 py-2.5">
            <h3 className="text-sm font-extrabold text-clinic-text">{titulo}</h3>
            <Btn variant="outline" onClick={exportar}><Download className="h-3.5 w-3.5" /> Exportar CSV</Btn>
          </div>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                <th className="px-4 py-3">Paciente</th>
                {verPersonales && <th className="px-2 py-3">CI</th>}
                <th className="px-2 py-3">Profesional</th>
                <th className="px-2 py-3">Última cita</th>
                <th className="px-2 py-3">Próxima cita</th>
                <th className="px-2 py-3 text-right">Citas</th>
                <th className="px-2 py-3 text-right">Planes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-clinic-border">
              {filas.map((f) => (
                <tr key={f.p.id} className="hover:bg-clinic-bg/60">
                  <td className="px-4 py-2.5"><Link href={`/app/pacientes/${f.p.id}`} className="font-semibold text-clinic-text hover:text-azure-700">{fullName(f.p)}</Link></td>
                  {verPersonales && <td className="px-2 py-2.5 font-mono text-xs">{f.p.document || "—"}</td>}
                  <td className="px-2 py-2.5 text-clinic-muted">{f.profesional ?? "—"}</td>
                  <td className="px-2 py-2.5 text-clinic-muted">{f.ultima ? fmtDate(f.ultima.start) : "—"}</td>
                  <td className="px-2 py-2.5">{f.proxima ? fmtDate(f.proxima.start) : <span className="font-semibold text-state-warn">Sin cita</span>}</td>
                  <td className="px-2 py-2.5 text-right font-mono">{f.citas}</td>
                  <td className="px-2 py-2.5 text-right font-mono">{f.planes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
