"use client";
/** Sección Pacientes (paridad Dentalink): sub-tabs Pacientes / Análisis / Pacientes de
 *  Ortodoncia. La lista es una tabla con Tratamientos y Deudas. */
import { useMemo, useState } from "react";
import { Search, FileText, ClipboardList, Plus, ChevronRight } from "lucide-react";
import { useStore, fullName } from "@/lib/store";
import { patientBalance } from "@/lib/budgets";
import type { Patient } from "@/lib/types";
import { Card, Btn, Modal, Badge, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { AnalisisConversion } from "@/components/AnalisisConversion";
import { PacientesOrtodoncia } from "@/components/PacientesOrtodoncia";
import { ConfiguracionCampos } from "@/components/ConfiguracionCampos";
import { useAlcance } from "@/lib/useAlcance";
import { visibles, faltantes, datosPaciente, nuevoPaciente, type ValoresCampos } from "@/lib/camposPaciente";
import { CamposPacienteForm } from "@/components/CamposPacienteForm";

export default function PatientsPage() {
  const { db, session, upsertPatient } = useStore();
  const alcance = useAlcance();
  const verMontos = alcance.puede("money.view");
  const verPersonales = alcance.puede("patients.personal");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"lista" | "analisis" | "ortodoncia" | "configuracion">("lista");

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const propios = db.patients.filter((p) => alcance.vePaciente(p.id));
    const xs = !t
      ? propios
      : propios.filter((p) => fullName(p).toLowerCase().includes(t) || (verPersonales && (p.document.includes(t) || p.phone.includes(t))));
    return [...xs].sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }, [db.patients, q, alcance, verPersonales]);

  const orthoCount = db.patients.filter((p) => p.ortho?.active && alcance.vePaciente(p.id)).length;
  // Análisis muestra cobros y presupuestos (números del negocio, igual que en Reportes).
  const TABS = ([
    { k: "lista", label: "Pacientes" },
    ...(alcance.puede("billing.reports") ? [{ k: "analisis", label: "Análisis" }] : []),
    { k: "ortodoncia", label: `Pacientes de Ortodoncia (${orthoCount})` },
    { k: "configuracion", label: "Configuración" },
  ] as const) as readonly { k: "lista" | "analisis" | "ortodoncia" | "configuracion"; label: string }[];

  return (
    <div className="space-y-5">
      <Reveal y={0} className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-clinic-text">Pacientes</h1>
        {verPersonales && <Btn onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo paciente</Btn>}
      </Reveal>

      <Reveal delay={0.05} className="flex flex-wrap gap-1 rounded-2xl border border-clinic-border bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${tab === t.k ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}
          >
            {t.label}
          </button>
        ))}
      </Reveal>

      {tab === "analisis" && alcance.puede("billing.reports") && <Reveal><AnalisisConversion /></Reveal>}
      {tab === "ortodoncia" && <Reveal><PacientesOrtodoncia /></Reveal>}
      {tab === "configuracion" && <Reveal><ConfiguracionCampos /></Reveal>}

      {tab === "lista" && (
        <Reveal className="space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={verPersonales ? "Buscar por nombre, CI o teléfono…" : "Buscar por nombre…"}
              className="w-full rounded-xl border border-clinic-border bg-white py-2.5 pl-9 pr-3 text-sm focus:border-azure-600"
            />
          </div>

          {list.length === 0 ? (
            <Empty
              title={alcance.sinDoctores ? "Todavía no tenés doctores asignados" : "Sin resultados"}
              desc={alcance.sinDoctores ? "Pedile al administrador que te asigne en Configuración → Usuarios." : verPersonales ? "Probá con otro nombre o número de documento." : "Probá con otro nombre."}
            />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-2 py-3">Apellidos</th>
                    <th className="px-2 py-3">Tratamientos</th>
                    {verMontos && <th className="px-2 py-3">Deudas</th>}
                    <th className="px-2 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-clinic-border">
                  {list.map((p) => {
                    const trats = db.budgets.filter((b) => b.patientId === p.id).length;
                    const debt = verMontos && patientBalance(p.id, db.budgets, db.payments) > 0;
                    const pendingForms = p.forms.filter((f) => f.status === "pendiente").length;
                    return (
                      <tr key={p.id} className="hover:bg-clinic-bg/60">
                        <td className="px-4 py-2.5">
                          {/* aria-label con el nombre completo: el apellido vive en otra
                              celda, así que un lector de pantalla que navega por links
                              solo oiría el nombre de pila. Las iniciales del avatar van
                              ocultas — son decorativas y se leían pegadas ("AMAndrés"). */}
                          <a href={`/app/pacientes/${p.id}`} aria-label={`Abrir la ficha de ${fullName(p)}`} className="flex items-center gap-2 font-semibold text-clinic-text hover:text-azure-700">
                            <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-azure-100 to-azure-200 text-xs font-bold text-azure-700">{p.firstName[0]}{p.lastName[0]}</span>
                            {p.firstName}
                          </a>
                        </td>
                        <td className="px-2 py-2.5 text-clinic-text">{p.lastName}</td>
                        <td className="px-2 py-2.5 text-clinic-muted">{trats}</td>
                        {verMontos && <td className="px-2 py-2.5">{debt ? <Badge tone="err">Con deuda</Badge> : <span className="text-clinic-muted">No tiene</span>}</td>}
                        <td className="px-2 py-2.5">
                          <span className="flex items-center justify-end gap-1.5">
                            {pendingForms > 0 && (
                              <span data-tip={`${pendingForms} formulario(s) pendiente(s)`} className="grid h-7 w-7 place-items-center rounded-lg bg-state-warnbg">
                                <FileText className="h-3.5 w-3.5 text-state-warn" />
                              </span>
                            )}
                            {p.historyUpdatePending && (
                              <span data-tip="Actualización de historial médico pendiente" className="grid h-7 w-7 place-items-center rounded-lg bg-state-infobg">
                                <ClipboardList className="h-3.5 w-3.5 text-state-info" />
                              </span>
                            )}
                            {/* Mismo destino que el link del nombre: se oculta al lector de
                                pantalla para no anunciar dos links iguales por fila. Sigue
                                siendo clickeable con el mouse (afordancia visual de "entrar"). */}
                            <a href={`/app/pacientes/${p.id}`} aria-hidden="true" tabIndex={-1}><ChevronRight className="h-4 w-4 text-clinic-muted" /></a>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </Reveal>
      )}

      {creating && (
        <NewPatient
          onClose={() => setCreating(false)}
          onSave={(p) => { upsertPatient(p); setCreating(false); }}
          clinicId={session!.clinicId}
        />
      )}
    </div>
  );
}

function NewPatient({ onClose, onSave, clinicId }: { onClose: () => void; onSave: (p: Patient) => void; clinicId: string }) {
  const { db } = useStore();
  // Qué se pide y qué es obligatorio lo decide la clínica en Pacientes → Configuración.
  const campos = visibles(db.clinics[0]?.config.patientFields, "nuevo");
  const [valores, setValores] = useState<ValoresCampos>({});
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Nuevo paciente" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const falta = faltantes(campos, valores);
          if (falta.length > 0) { setError(`Completá: ${falta.join(", ")}.`); return; }
          onSave(nuevoPaciente(datosPaciente(campos, valores), clinicId));
        }}
      >
        <CamposPacienteForm campos={campos} valores={valores} onChange={setValores} convenios={(db.clinics[0]?.config.convenios ?? []).map((c) => c.name)} />
        {error && <p role="alert" className="rounded-xl bg-state-errbg px-3 py-2 text-xs font-semibold text-state-err">{error}</p>}
        <p className="rounded-xl bg-azure-50 p-3 text-xs text-azure-700">Se asigna automáticamente el formulario de <b>Anamnesis inicial</b> como pendiente.</p>
        <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancelar</Btn><Btn type="submit">Crear paciente</Btn></div>
      </form>
    </Modal>
  );
}
