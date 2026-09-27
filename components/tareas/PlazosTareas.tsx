"use client";
/** "Configuración de plazos" de las tareas automáticas (paridad Dentalink):
 *  cuatro tarjetas con los botones Inmediato · 1 día · 1 semana · 1 mes · 1 año
 *  · otro, y "Guardar". Es UN componente usado en dos lugares —el engranaje de
 *  Tareas y Configuración— para que la regla de cómo se guarda viva una sola vez.
 *  Escribe `config.taskDeadlines`, que lee `plazoDe` en lib/tareas.ts. */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { PLAZOS_RAPIDOS, PLAZO_MAX_DIAS, diasDePlazo, opcionDePlazo, plazoDe, plazoDeDias, type PlazoTaskType } from "@/lib/tareas";
import type { TaskDeadline } from "@/lib/types";
import { Btn, Card } from "@/components/ui";
import { TipoBadge } from "./comun";

/** El orden de las tarjetas es el de Dentalink: cita y captura arriba, control y cobranza abajo. */
const TARJETAS: { tipo: PlazoTaskType; titulo: string; texto: React.ReactNode }[] = [
  {
    tipo: "cita", titulo: "Tarea de cita",
    texto: <>Este tipo de tarea se generará a un paciente cuando una de sus citas pase a estado <b>«Cancelada» o «Ausente» (no asiste)</b>, y no tenga citas futuras.</>,
  },
  {
    tipo: "captura", titulo: "Tarea de captura",
    texto: <>Este tipo de tarea se generará cuando <b>se presente un presupuesto al paciente</b> y no se empiece ni se pague (presupuesto sin prestaciones realizadas ni abonos).</>,
  },
  {
    tipo: "control", titulo: "Tarea de control",
    texto: <>Este tipo de tarea se generará a un paciente cuando <b>se finalice un presupuesto</b> del cual es parte y no tenga citas futuras.</>,
  },
  {
    tipo: "cobranza", titulo: "Tarea de cobranza",
    texto: <>Este tipo de tarea se generará a un paciente cuando <b>quede con saldo pendiente</b> en sus presupuestos aceptados o finalizados.</>,
  },
];

const TIPOS = TARJETAS.map((t) => t.tipo);

export function PlazosTareas() {
  const { db, updateClinicConfig } = useStore();
  const guardado = db.clinics[0]?.config?.taskDeadlines;
  const deGuardado = () => Object.fromEntries(TIPOS.map((t) => [t, plazoDe(t, guardado)])) as Record<PlazoTaskType, TaskDeadline>;
  const [borrador, setBorrador] = useState<Record<PlazoTaskType, TaskDeadline>>(deGuardado);
  const [guardadoRecien, setGuardadoRecien] = useState(false);
  const cambios = TIPOS.some((t) => diasDePlazo(borrador[t]) !== diasDePlazo(plazoDe(t, guardado)));

  // Si el config cambia desde otro lado (la otra pantalla, otra pestaña) y acá
  // no hay nada sin guardar, se muestra lo nuevo.
  useEffect(() => {
    if (!cambios) setBorrador(deGuardado());
  }, [guardado]); // solo cuando cambia lo guardado: `cambios` depende del borrador que se está editando

  const guardar = () => {
    updateClinicConfig({ taskDeadlines: { ...guardado, ...borrador } });
    setGuardadoRecien(true);
    setTimeout(() => setGuardadoRecien(false), 2500);
  };

  return (
    <Card className="p-4 sm:p-5">
      {cambios && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-state-warn/30 bg-state-warnbg px-3.5 py-2.5 text-sm text-state-warn">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>Atención:</b> hay cambios no guardados. Para confirmarlos, presioná el botón «Guardar» en la parte inferior derecha de esta sección.</span>
        </p>
      )}
      <h2 className="text-lg font-extrabold text-clinic-text">Configuración de plazos</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {TARJETAS.map((c) => (
          <Tarjeta key={c.tipo} {...c} valor={borrador[c.tipo]} onChange={(p) => setBorrador((b) => ({ ...b, [c.tipo]: p }))} />
        ))}
      </div>
      <p className="mt-4 rounded-xl bg-clinic-bg px-3.5 py-2.5 text-xs leading-relaxed text-clinic-muted">
        Además, Novudent genera sola la tarea de <b className="text-clinic-text">cita sin confirmar</b> (el mismo día, para las citas pendientes de los próximos 2 días)
        y la de <b className="text-clinic-text">cheque</b> (en la fecha de cobro de cada cheque recibido). Esas dos no tienen plazo configurable.
        Las tareas automáticas se recalculan solas: un cambio de plazo se ve en la bandeja al instante.
      </p>
      <div className="mt-4 flex items-center justify-end gap-3">
        {guardadoRecien && !cambios && (
          <span role="status" className="inline-flex items-center gap-1.5 text-sm font-bold text-state-ok"><CheckCircle2 aria-hidden className="h-4 w-4" /> Guardado</span>
        )}
        <Btn onClick={guardar} disabled={!cambios}>Guardar</Btn>
      </div>
    </Card>
  );
}

function Tarjeta({ tipo, titulo, texto, valor, onChange }: {
  tipo: PlazoTaskType; titulo: string; texto: React.ReactNode; valor: TaskDeadline; onChange: (p: TaskDeadline) => void;
}) {
  const [modoOtro, setModoOtro] = useState(() => opcionDePlazo(valor) === "otro");
  const marcada = modoOtro ? "otro" : opcionDePlazo(valor);
  const dias = diasDePlazo(valor);
  return (
    <section aria-labelledby={`plazo-${tipo}`} className="rounded-2xl border border-clinic-border p-4">
      <h3 id={`plazo-${tipo}`}><TipoBadge type={tipo}>{titulo}</TipoBadge></h3>
      <p className="mt-2 text-sm leading-relaxed text-clinic-text">{texto}</p>
      <p className="mt-1 text-xs text-clinic-muted">Seleccioná para cuánto tiempo después de este hecho se agendará la tarea:</p>
      <div role="radiogroup" aria-label={`Plazo de la ${titulo.toLowerCase()}`} className="mt-3 flex flex-wrap items-center gap-1.5">
        {PLAZOS_RAPIDOS.map((o) => (
          <button
            key={o.dias}
            type="button"
            role="radio"
            aria-checked={marcada === o.dias}
            onClick={() => { setModoOtro(false); onChange(plazoDeDias(o.dias)); }}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${marcada === o.dias ? "border-navy-800 bg-navy-800 text-white" : "border-clinic-border bg-white text-clinic-muted hover:text-clinic-text"}`}
          >
            {o.label}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={marcada === "otro"}
          onClick={() => { setModoOtro(true); if (dias === 0) onChange(plazoDeDias(3)); }}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${marcada === "otro" ? "border-navy-800 bg-navy-800 text-white" : "border-clinic-border bg-white text-clinic-muted hover:text-clinic-text"}`}
        >
          otro
        </button>
        {marcada === "otro" && (
          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-clinic-muted">
            <input
              type="number" min={1} max={PLAZO_MAX_DIAS} inputMode="numeric"
              aria-label={`Días de la ${titulo.toLowerCase()}`}
              value={dias || ""}
              onChange={(e) => onChange(plazoDeDias(Number(e.target.value)))}
              className="w-20 rounded-lg border border-clinic-border px-2 py-1.5 text-right font-mono text-sm text-clinic-text focus:border-azure-600"
            />
            días
          </label>
        )}
      </div>
    </section>
  );
}
