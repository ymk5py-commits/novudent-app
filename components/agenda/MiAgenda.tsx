"use client";
/** «Mi agenda» (Inicio): lo que le toca a la persona que entró, hoy o esta semana — sus tareas, las
 *  automáticas de la bandeja que le asignaron y la rutina del día, que se tacha sola cuando se resuelve.
 *  Toda la lógica vive en lib/miAgenda.ts (puro, con tests); esto la dibuja y la cablea con el store. */
import { useMemo, useState } from "react";
import { CalendarCheck, Mic, Plus, Sparkles } from "lucide-react";
import { useStore, fullName } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import { useTareas } from "@/lib/useTareas";
import { useClinicPlan } from "@/components/PlanGate";
import { pendientesPorPaciente } from "@/lib/documentosClinicos";
import { armarAgenda, itemsDeTareas, rangoDe, rutinaDeHoy, type Ambito, type ItemAgenda } from "@/lib/miAgenda";
import { resumenSemanaDatos } from "@/lib/agendaIA";
import { diaDe, esFecha, fechaCorta, tituloFecha } from "@/lib/tareas";
import { Btn, Card, inputCls } from "@/components/ui";
import { NuevaTareaModal } from "@/components/tareas/NuevaTareaModal";
import { FilaAgenda } from "./FilaAgenda";
import { AgendaDictado } from "./AgendaDictado";
import { ResumenSemana } from "./ResumenSemana";

export function MiAgenda() {
  const { db, session } = useStore();
  const alcance = useAlcance();
  const plan = useClinicPlan();
  const tareas = useTareas();
  const { hoy } = tareas;

  const [ambito, setAmbito] = useState<Ambito>("hoy");
  const [texto, setTexto] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [conPaciente, setConPaciente] = useState(false);
  const [dictar, setDictar] = useState(false);
  const [resumen, setResumen] = useState(false);

  const yo = session?.userId ?? "";
  const tieneIA = plan.features.includes("ia");
  const nombres = useMemo(() => new Map(db.patients.map((p) => [p.id, fullName(p)])), [db.patients]);
  const documentosPendientes = useMemo(() => pendientesPorPaciente(db.patients, db.clinicalDocs).size, [db.patients, db.clinicalDocs]);

  const rutina = useMemo(
    () => rutinaDeHoy({
      hoy,
      puede: alcance.puede,
      veDoctor: alcance.veDoctor,
      tieneCaja: plan.features.includes("caja"),
      tieneInventario: plan.features.includes("inventario"),
      appointments: db.appointments,
      documentosPendientes,
      stock: db.stock,
      cashSessions: db.cashSessions,
    }),
    [hoy, alcance, plan.features, db.appointments, documentosPendientes, db.stock, db.cashSessions],
  );

  const delPeriodo = (a: Ambito) =>
    itemsDeTareas(tareas.filas, { yo, hoy, rango: rangoDe(a, hoy), nombrePaciente: (f) => (f.patientId ? nombres.get(f.patientId) : undefined) });

  const agenda = useMemo(
    () => armarAgenda([...delPeriodo(ambito), ...rutina], ambito, hoy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tareas.filas, yo, hoy, ambito, nombres, rutina],
  );

  // Lo que viaja al resumen semanal: solo conteos. Se arma solo mientras el panel está abierto.
  const datosResumen = useMemo(() => {
    if (!resumen) return null;
    const semana = rangoDe("semana", hoy);
    const verMontos = alcance.puede("billing.reports");
    const produccion = db.appointments
      .filter((a) => alcance.veDoctor(a.dentistId) && a.status !== "cancelada" && diaDe(a.start) >= semana.desde && diaDe(a.start) <= semana.hasta)
      .reduce((s, a) => s + a.amount - a.discount, 0);
    return resumenSemanaDatos({
      hoy,
      agenda: armarAgenda([...delPeriodo("semana"), ...rutina], "semana", hoy),
      filasBandeja: tareas.filas,
      appointments: db.appointments,
      veDoctor: alcance.veDoctor,
      verMontos,
      produccionSemanaGs: verMontos ? produccion : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumen, tareas.filas, yo, hoy, nombres, rutina, db.appointments, alcance]);

  if (!session || !alcance.puede("tasks.use")) return null;

  const cambiar = (i: ItemAgenda) => {
    if (!i.fila) return;
    setAviso("");
    if (i.accion === "tildar") tareas.gestionar(i.fila, "cerrar");
    else if (i.accion === "destildar") tareas.reabrir(i.fila);
  };

  const agregar = () => {
    const detalle = texto.trim();
    if (!detalle) return;
    if (!esFecha(fecha) || fecha < hoy) { setError("Elegí una fecha de hoy en adelante."); return; }
    tareas.crearPersonalizada({ detalle, fecha });
    setTexto("");
    setError(null);
    setAviso(fecha > agenda.rango.hasta ? `Tarea agregada para el ${fechaCorta(fecha, hoy)}: la vas a ver ese día.` : "Tarea agregada.");
  };

  const pct = Math.round(agenda.avance * 100);
  const atrasadas = agenda.atrasadas.length;
  const fila = (i: ItemAgenda) => <FilaAgenda key={i.id} item={i} hoy={hoy} onCambiar={cambiar} />;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarCheck aria-hidden className="h-4 w-4 text-azure-600" />
          <h2 className="font-bold text-clinic-text">Mi agenda</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tieneIA && (
            <>
              <Btn variant="outline" onClick={() => setDictar(true)}><Mic aria-hidden className="h-3.5 w-3.5" /> Dictar la semana</Btn>
              <Btn variant="outline" onClick={() => setResumen((r) => !r)}><Sparkles aria-hidden className="h-3.5 w-3.5" /> Resumen semanal</Btn>
            </>
          )}
          <div role="tablist" aria-label="Período de la agenda" className="inline-flex rounded border border-clinic-border p-0.5">
            {(["hoy", "semana"] as const).map((a) => (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={ambito === a}
                onClick={() => setAmbito(a)}
                className={`min-h-[28px] rounded-[3px] px-3 text-[13px] font-semibold transition-colors ${ambito === a ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}
              >
                {a === "hoy" ? "Hoy" : "Semana"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-semibold text-clinic-text">
            {agenda.total === 0 ? "Sin tareas" : `${agenda.hechasN} de ${agenda.total} hechas`}
            {atrasadas > 0 && <span className="ml-1.5 font-bold text-state-err">· {atrasadas} {atrasadas === 1 ? "atrasada" : "atrasadas"}</span>}
          </span>
          <span className="tabular-nums text-clinic-muted">{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Avance de la agenda"
          aria-valuemin={0}
          aria-valuemax={Math.max(agenda.total, 1)}
          aria-valuenow={agenda.hechasN}
          aria-valuetext={`${agenda.hechasN} de ${agenda.total} hechas`}
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-clinic-bg"
        >
          <div className="h-full rounded-full bg-state-ok transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <form className="mt-4 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); agregar(); }}>
        <input
          className={`${inputCls} min-w-0 flex-[1_1_12rem]`}
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setError(null); }}
          aria-label="Nueva tarea"
          placeholder="Agregar una tarea…"
        />
        <input type="date" className={`${inputCls} !w-auto`} min={hoy} value={fecha} onChange={(e) => { setFecha(e.target.value); setError(null); }} aria-label="Día de la tarea" />
        <Btn type="submit" disabled={!texto.trim()}><Plus aria-hidden className="h-3.5 w-3.5" /> Agregar</Btn>
        <Btn variant="outline" onClick={() => setConPaciente(true)}>Con paciente…</Btn>
      </form>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-state-err">{error}</p>}
      {aviso && <p role="status" className="mt-2 text-xs font-semibold text-state-ok">{aviso}</p>}

      <div role="tabpanel" aria-label={ambito === "hoy" ? "Agenda de hoy" : "Agenda de la semana"} className="mt-3">
        {agenda.total === 0 ? (
          <p className="py-6 text-center text-sm text-clinic-muted">
            {ambito === "hoy" ? "No tenés nada para hoy." : "No tenés nada para esta semana."} Agregá una tarea{tieneIA ? " o dictá tu semana" : ""}.
          </p>
        ) : ambito === "hoy" ? (
          <>
            {agenda.pendientes.length > 0 && (
              <section aria-label="Pendientes">
                <h3 className="px-1.5 pb-1 text-[12px] font-bold uppercase tracking-wide text-clinic-muted">Pendientes <span className="tabular-nums">({agenda.pendientes.length})</span></h3>
                <ul>{agenda.pendientes.map(fila)}</ul>
              </section>
            )}
            {agenda.hechas.length > 0 && (
              <section aria-label="Hechas" className={agenda.pendientes.length > 0 ? "mt-3" : ""}>
                <h3 className="px-1.5 pb-1 text-[12px] font-bold uppercase tracking-wide text-clinic-muted">Hechas <span className="tabular-nums">({agenda.hechas.length})</span></h3>
                <ul>{agenda.hechas.map(fila)}</ul>
              </section>
            )}
          </>
        ) : (
          <>
            {agenda.atrasadas.length > 0 && (
              <section aria-label="Atrasadas">
                <h3 className="px-1.5 pb-1 text-[12px] font-bold uppercase tracking-wide text-state-err">Atrasadas <span className="tabular-nums">({agenda.atrasadas.length})</span></h3>
                <ul>{agenda.atrasadas.map(fila)}</ul>
              </section>
            )}
            {agenda.dias.map((d, n) => (
              <section key={d.fecha} aria-label={tituloFecha(d.fecha, hoy)} className={n > 0 || agenda.atrasadas.length > 0 ? "mt-3" : ""}>
                <h3 className="px-1.5 pb-1 text-[12px] font-bold uppercase tracking-wide text-clinic-muted">
                  {tituloFecha(d.fecha, hoy)}{d.fecha === hoy && <span className="ml-1.5 rounded bg-azure-50 px-1.5 py-0.5 normal-case text-azure-700">hoy</span>}
                </h3>
                <ul>{d.items.map(fila)}</ul>
              </section>
            ))}
          </>
        )}
      </div>

      {resumen && datosResumen && <ResumenSemana datos={datosResumen} />}
      {conPaciente && <NuevaTareaModal fechaInicial={fecha} onClose={() => setConPaciente(false)} onCreada={() => setAviso("Tarea creada.")} />}
      {dictar && (
        <AgendaDictado
          onClose={() => setDictar(false)}
          onGuardadas={(n) => setAviso(n === 1 ? "Guardé 1 tarea." : `Guardé ${n} tareas.`)}
        />
      )}
    </Card>
  );
}
