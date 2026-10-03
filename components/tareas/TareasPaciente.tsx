"use client";
import Link from "next/link";
/** Ficha del paciente → Datos personales → "Tareas de gestión" (paridad
 *  Dentalink): las tareas de ESE paciente —automáticas y personalizadas—, con
 *  "Ver tareas completadas" y "+ Nueva tarea personalizada", que es donde más
 *  se crean ("llamalo a fin de mes para la evaluación de la prótesis").
 *
 *  Las notas viejas de tipo "tarea" (antes esta pestaña eran notas sueltas)
 *  siguen abajo, de solo lectura para cargar: no se pierde nada. */
import { useState } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import { useTareas } from "@/lib/useTareas";
import { fechaCorta, type FilaTarea } from "@/lib/tareas";
import type { Patient } from "@/lib/types";
import { Btn, Card } from "@/components/ui";
import { PatientNotas } from "@/components/PatientNotas";
import { EstadoCheck, TipoBadge, useNombres } from "./comun";
import { NuevaTareaModal } from "./NuevaTareaModal";

export function TareasPaciente({ patient }: { patient: Patient }) {
  const { db } = useStore();
  const alcance = useAlcance();
  const { hoy, filas } = useTareas();
  const nombres = useNombres();
  const [verCompletadas, setVerCompletadas] = useState(false);
  const [nueva, setNueva] = useState(false);

  const delPaciente = filas.filter((f) => f.patientId === patient.id);
  const pendientes = delPaciente.filter((f) => f.estado === "pendiente").sort((a, b) => a.fecha.localeCompare(b.fecha));
  const completadas = delPaciente.filter((f) => f.estado !== "pendiente").sort((a, b) => b.fecha.localeCompare(a.fecha));
  const lista = verCompletadas ? [...pendientes, ...completadas] : pendientes;
  // Las notas viejas son de la pestaña de datos personales: las ve quien ve esos datos.
  const notasViejas = alcance.puede("patients.personal") && db.patientNotes.some((n) => n.patientId === patient.id && n.kind === "tarea");

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-[16px] font-bold text-clinic-text">Tareas de gestión</h2>
          <Btn variant="outline" onClick={() => setVerCompletadas((v) => !v)}>
            {verCompletadas ? "Ocultar tareas completadas" : "Ver tareas completadas"}
          </Btn>
          <Btn onClick={() => setNueva(true)}><Plus className="h-4 w-4" /> Nueva tarea personalizada</Btn>
        </div>

        {lista.length === 0 ? (
          <p className="py-10 text-center text-sm text-clinic-muted">
            {completadas.length > 0 && !verCompletadas
              ? "El paciente no tiene tareas pendientes. Las completadas se ven con «Ver tareas completadas»."
              : "El paciente no cuenta con tareas de gestión para mostrar"}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-clinic-border rounded-xl border border-clinic-border" aria-label="Tareas del paciente">
            {lista.map((f) => <Fila key={f.id} f={f} hoy={hoy} responsable={nombres.usuario(f.assigneeId)} />)}
          </ul>
        )}
      </Card>

      {notasViejas && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-clinic-text">Tareas anotadas antes</h3>
          <p className="text-xs text-clinic-muted">Notas de tarea cargadas antes de las tareas de gestión. Se pueden marcar hechas o borrar; las nuevas se crean arriba.</p>
          <PatientNotas patient={patient} kind="tarea" sinAlta />
        </section>
      )}

      {nueva && <NuevaTareaModal paciente={patient} fechaInicial={hoy} onClose={() => setNueva(false)} />}
    </div>
  );
}

function Fila({ f, hoy, responsable }: { f: FilaTarea; hoy: string; responsable: string }) {
  const atrasada = f.estado === "pendiente" && f.fecha < hoy;
  const estado = f.estado === "sistema" ? "Completada por el sistema" : f.estado === "completada" ? "Completada" : atrasada ? "Atrasada" : f.fecha === hoy ? "Hoy" : "Pendiente";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-3 sm:px-4">
      <EstadoCheck estado={f.estado} />
      <TipoBadge type={f.type} apagada={f.estado !== "pendiente"} />
      <span className="min-w-0 flex-1 basis-40">
        <span className="block break-words text-sm font-semibold text-clinic-text sm:truncate">{f.title}</span>
        <span className="block truncate text-xs text-clinic-muted">
          {responsable ? `Responsable: ${responsable}` : "No asignado"}
          {f.gestion?.byName ? ` · trabajada por ${f.gestion.byName}` : ""}
        </span>
      </span>
      <span className={`tabular-nums text-xs ${atrasada ? "font-bold text-state-err" : "text-clinic-muted"}`}>{fechaCorta(f.fecha, hoy)}</span>
      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${atrasada ? "bg-state-errbg text-state-err" : f.estado === "pendiente" ? "bg-azure-50 text-azure-700" : "bg-clinic-bg text-clinic-muted"}`}>{estado}</span>
      <Link
        href={`/app/tareas?fecha=${f.fecha}&tarea=${encodeURIComponent(f.id)}`}
        className="inline-flex items-center gap-0.5 text-xs font-bold text-azure-700 hover:underline"
      >
        Ver en la bandeja <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
      </Link>
    </li>
  );
}
