"use client";
/** Tareas de gestión (paridad Dentalink, "Configura las Tareas Automáticas").
 *
 *  Tres secciones con íconos, como Dentalink: la bandeja (✓), las estadísticas
 *  (indicador) y la configuración de plazos (engranaje).
 *
 *  La bandeja es POR DÍA: "Tareas - Martes 19 Octubre" con ‹ Anterior · Fecha ·
 *  Siguiente ›. Las automáticas —cobranza, captura, control, cita, cheque— NO se
 *  guardan: las deriva `lib/tareas.ts` del estado de la clínica en cada render,
 *  y por eso se cierran solas. Lo guardado en `mgmtTasks` son las personalizadas
 *  y los OVERRIDES: la decisión humana sobre una derivada (asignarla, trabajarla
 *  desde "Finalizar ▾", reprogramarla). */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Gauge, ListChecks, ListFilter, Plus, Settings, ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/rbac";
import { useAlcance } from "@/lib/useAlcance";
import { useTareas } from "@/lib/useTareas";
import { tiposDeTareaVisibles } from "@/lib/alcance";
import { bandejaDelDia, esFecha, fechaCorta, ordenarFilas, sumarDias, tituloFecha, TIPO_TAREA_LABEL, type FilaTarea } from "@/lib/tareas";
import type { MgmtTaskType } from "@/lib/types";
import { Btn, Card } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { Desplegable, ESTADO_LABEL, EstadoCheck, Opcion, TipoBadge, useNombres } from "@/components/tareas/comun";
import { PanelTarea } from "@/components/tareas/PanelTarea";
import { NuevaTareaModal } from "@/components/tareas/NuevaTareaModal";
import { PlazosTareas } from "@/components/tareas/PlazosTareas";
import { EstadisticasTareas } from "@/components/tareas/EstadisticasTareas";

type Vista = "bandeja" | "estadisticas" | "configuracion";
type Lista = "dia" | "atrasadas";
type FiltroResp = "todos" | "mias" | "sin";

export default function TareasPage() {
  const { session } = useStore();
  const alcance = useAlcance();
  const nombres = useNombres();
  const tareas = useTareas();
  const { hoy } = tareas;

  const [vista, setVista] = useState<Vista>("bandeja");
  const [fecha, setFecha] = useState(hoy);
  const [lista, setLista] = useState<Lista>("dia");
  const [filtroTipo, setFiltroTipo] = useState<"todas" | MgmtTaskType>("todas");
  const [filtroResp, setFiltroResp] = useState<FiltroResp>("todos");
  const [esconderSistema, setEsconderSistema] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Enlaces directos: ?fecha=AAAA-MM-DD&tarea=<id> (desde la ficha del
  // paciente) y #estadisticas / #configuracion. Se lee en un efecto y no con
  // useSearchParams para no obligar a la página entera a renderizar en el servidor.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const f = q.get("fecha");
    if (esFecha(f)) setFecha(f);
    const id = q.get("tarea");
    if (id) setSelId(id);
    const h = window.location.hash.slice(1);
    if (h === "estadisticas" || h === "configuracion") setVista(h);
  }, []);

  const verStats = alcance.puede("billing.reports");
  const verConfig = alcance.puede("practice.config");
  const vistaEfectiva: Vista = (vista === "estadisticas" && !verStats) || (vista === "configuracion" && !verConfig) ? "bandeja" : vista;

  const { delDia, atrasadas } = useMemo(() => {
    const pasaFiltros = (f: FilaTarea) =>
      (filtroTipo === "todas" || f.type === filtroTipo)
      && (filtroResp === "todos" || (filtroResp === "mias" ? f.assigneeId === session?.userId : !f.assigneeId));
    const b = bandejaDelDia(tareas.filas.filter(pasaFiltros), fecha, hoy, esconderSistema);
    const nombre = (f: FilaTarea) => nombres.paciente(f) || f.title;
    return { delDia: ordenarFilas(b.delDia, nombre), atrasadas: ordenarFilas(b.atrasadas, nombre) };
  }, [tareas.filas, filtroTipo, filtroResp, session?.userId, fecha, hoy, esconderSistema, nombres]);

  // Guard de RUTA, no solo del menú: la bandeja muestra pacientes con deuda y
  // sus montos. (Va después de los hooks: no se puede return antes de llamarlos todos.)
  if (!session) return null;
  if (!can(session.role, "tasks.use")) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-[16px] font-bold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">Tu rol no tiene acceso a la bandeja de tareas.</p>
      </Card>
    );
  }

  const filasLista = lista === "dia" ? delDia : atrasadas;
  // La seleccionada se busca en TODAS las filas: después de "Volver a contactar"
  // la selección pasa a la fila ✓ de hoy, que puede no estar en la lista abierta.
  const sel = tareas.filas.find((f) => f.id === selId) ?? null;
  const tipos = tiposDeTareaVisibles(session.role);
  const filtrosActivos = (filtroTipo !== "todas" ? 1 : 0) + (filtroResp !== "todos" ? 1 : 0);

  const irA = (f: string) => { setFecha(f); setLista("dia"); setSelId(null); };
  const seleccionar = (id: string) => {
    setSelId(id);
    // En el celular el panel queda debajo de la lista: se lo trae a la vista.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" }));
    }
  };

  const titulo = vistaEfectiva === "bandeja" ? `Tareas - ${tituloFecha(fecha, hoy)}` : vistaEfectiva === "estadisticas" ? "Estadísticas" : "Configuración";

  return (
    <Reveal className="space-y-4">
      {/* Encabezado: secciones (íconos, como Dentalink) + título + navegación por día */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {(verStats || verConfig) && (
          <div role="tablist" aria-label="Secciones de tareas" className="flex rounded-xl border border-clinic-border bg-white p-1">
            {([
              ["bandeja", "Bandeja de tareas", ListChecks, true],
              ["estadisticas", "Estadísticas", Gauge, verStats],
              ["configuracion", "Configuración de plazos", Settings, verConfig],
            ] as const).filter(([, , , ok]) => ok).map(([k, label, Icono]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={vistaEfectiva === k}
                aria-label={label}
                title={label}
                onClick={() => { setVista(k); history.replaceState(null, "", k === "bandeja" ? window.location.pathname + window.location.search : `#${k}`); }}
                className={`grid h-8 w-9 place-items-center rounded-lg transition-colors ${vistaEfectiva === k ? "bg-navy-800 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}
              >
                <Icono className="h-4 w-4" />
              </button>
            ))}
          </div>
        )}
        <h1 className="min-w-0 text-lg font-bold text-clinic-text sm:text-xl">{titulo}</h1>

        {vistaEfectiva === "bandeja" && (
          <div className="flex w-full flex-wrap items-center gap-1.5 sm:ml-auto sm:w-auto">
            <Btn variant="outline" onClick={() => irA(sumarDias(fecha, -1))} tip="Día anterior">
              <ChevronLeft aria-hidden className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Anterior</span>
            </Btn>
            <label className="flex h-[38px] items-center gap-1.5 rounded-xl border border-clinic-border bg-white px-2.5 text-sm font-semibold text-clinic-text focus-within:border-azure-600">
              <CalendarDays aria-hidden className="h-4 w-4 text-clinic-muted" />
              <span className="sr-only">Fecha</span>
              <input
                type="date"
                aria-label="Fecha"
                value={fecha}
                onChange={(e) => { if (esFecha(e.target.value)) irA(e.target.value); }}
                className="w-[8.5rem] bg-transparent tabular-nums text-[13px] outline-none"
              />
            </label>
            <Btn variant="outline" onClick={() => irA(sumarDias(fecha, 1))} tip="Día siguiente">
              <span className="sr-only sm:not-sr-only">Siguiente</span><ChevronRight aria-hidden className="h-4 w-4" />
            </Btn>
            {fecha !== hoy && <Btn variant="ghost" onClick={() => irA(hoy)}>Hoy</Btn>}
          </div>
        )}
      </div>

      {vistaEfectiva === "estadisticas" && <EstadisticasTareas />}
      {vistaEfectiva === "configuracion" && <PlazosTareas />}

      {vistaEfectiva === "bandeja" && (
        <>
          {/* Barra de la bandeja: pestañas + nueva personalizada + filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Listas de tareas" className="flex rounded-xl border border-clinic-border bg-white p-1">
              {([["dia", "Tareas del día", null], ["atrasadas", "Tareas atrasadas", atrasadas.length]] as const).map(([k, label, n]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={lista === k}
                  onClick={() => { setLista(k); setSelId(null); }}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-normal transition-colors ${lista === k ? "bg-navy-800 text-white" : "text-clinic-muted hover:text-clinic-text"}`}
                >
                  {label}
                  {n != null && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${lista === k ? "bg-white/20" : n > 0 ? "bg-state-errbg text-state-err" : "bg-clinic-bg"}`}>{n}</span>
                  )}
                </button>
              ))}
            </div>
            <Btn onClick={() => setNueva(true)}><Plus aria-hidden className="h-4 w-4" /> Nueva tarea personalizada</Btn>
            <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 sm:ml-auto sm:w-auto">
              <Desplegable
                alinear="auto"
                ancho="w-64"
                boton={<><ListFilter aria-hidden className="h-3.5 w-3.5" /> Filtrar por{filtrosActivos > 0 ? ` (${filtrosActivos})` : ""} <ChevronDown aria-hidden className="h-3.5 w-3.5" /></>}
              >
                {(cerrar) => (
                  <>
                    <p className="px-3 pb-1 pt-2 text-[13px] font-semibold text-clinic-muted">Tipo de tarea</p>
                    {(["todas", ...tipos] as const).map((t) => (
                      <Opcion key={t} marcada={filtroTipo === t} onClick={() => { setFiltroTipo(t); cerrar(); }}>
                        {t === "todas" ? "Todas" : TIPO_TAREA_LABEL[t]}
                      </Opcion>
                    ))}
                    <p className="mt-1 border-t border-clinic-border px-3 pb-1 pt-2 text-[13px] font-semibold text-clinic-muted">Responsable</p>
                    {([["todos", "Todas"], ["mias", "Asignadas a mí"], ["sin", "Sin asignar"]] as const).map(([k, label]) => (
                      <Opcion key={k} marcada={filtroResp === k} onClick={() => { setFiltroResp(k); cerrar(); }}>{label}</Opcion>
                    ))}
                  </>
                )}
              </Desplegable>
              <label
                className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-clinic-muted"
                title="Las que se resolvieron solas (el paciente pagó, agendó o aceptó) cuando alguien ya las tenía asignadas o trabajadas."
              >
                <input type="checkbox" checked={esconderSistema} onChange={(e) => setEsconderSistema(e.target.checked)} className="accent-azure-600" />
                Esconder tareas completadas por sistema
              </label>
            </div>
          </div>

          {/* grid-cols-1 = minmax(0, 1fr): sin eso, en el celular la columna implícita
              crece hasta el texto sin cortes de las filas y la página se recorta. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div ref={listaRef} className="min-w-0 scroll-mt-28">
              <Card className="overflow-visible">
                {filasLista.length === 0 ? (
                  <p className="px-6 py-14 text-center text-sm text-clinic-muted">
                    {lista === "atrasadas"
                      ? "No hay tareas atrasadas."
                      : fecha === hoy ? "No hay tareas para hoy." : `No hay tareas para el ${tituloFecha(fecha, hoy).toLowerCase()}.`}
                  </p>
                ) : (
                  <ul aria-label={lista === "dia" ? "Tareas del día" : "Tareas atrasadas"} className="divide-y divide-clinic-border">
                    {filasLista.map((f) => (
                      <FilaBandeja
                        key={f.id}
                        f={f}
                        hoy={hoy}
                        seleccionada={f.id === selId}
                        onSeleccionar={() => seleccionar(f.id)}
                        onAsignar={(u) => tareas.asignar(f, u)}
                      />
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div ref={panelRef} className="min-w-0 scroll-mt-28 space-y-2 lg:sticky lg:top-28 lg:self-start">
              {sel && (
                <button
                  type="button"
                  onClick={() => listaRef.current?.scrollIntoView({ block: "start" })}
                  className="inline-flex items-center gap-1 text-xs font-bold text-azure-700 lg:hidden"
                >
                  <ArrowUp aria-hidden className="h-3.5 w-3.5" /> Volver a la lista
                </button>
              )}
              <PanelTarea
                fila={sel}
                hoy={hoy}
                saldo={tareas.saldoDe(sel?.patientId)}
                onGestionar={(accion, hasta) => { if (!sel) return; const id = tareas.gestionar(sel, accion, hasta); if (id) setSelId(id); }}
                onEliminar={sel && !sel.derivedKey ? () => { tareas.eliminar(sel.id.split("@")[0]); setSelId(null); } : undefined}
              />
            </div>
          </div>
        </>
      )}

      {nueva && (
        <NuevaTareaModal
          fechaInicial={fecha}
          onClose={() => setNueva(false)}
          onCreada={(t) => { if (t.dueDate) { setFecha(t.dueDate); setLista("dia"); } setSelId(t.id); }}
        />
      )}
    </Reveal>
  );
}

/* ─── Fila de la bandeja ─── */
function FilaBandeja({ f, hoy: hoyFila, seleccionada, onSeleccionar, onAsignar }: {
  f: FilaTarea; hoy: string; seleccionada: boolean; onSeleccionar: () => void; onAsignar: (userId: string | undefined) => void;
}) {
  const { db, session } = useStore();
  const nombres = useNombres();
  const nombre = nombres.paciente(f) || "Tarea interna";
  const profesional = nombres.usuario(f.professionalId) || (f.type === "personalizada" ? nombres.usuario(f.createdBy) : "");
  const sub = [profesional, f.title].filter(Boolean).join(" · ");
  const atrasada = f.estado === "pendiente" && f.fecha < hoyFila;
  const asignado = nombres.usuario(f.assigneeId);
  // A quién se le puede asignar: a quien puede ver ese tipo de tarea (una
  // cobranza no se le asigna a un dentista, que no ve plata).
  const asignables = db.users.filter((u) => u.active && u.id !== session?.userId && tiposDeTareaVisibles(u.role).includes(f.type));
  return (
    // En el celular: casillero · [tipo + fecha / paciente / detalle] y debajo el
    // responsable. Desde sm, todo en una línea como Dentalink.
    <li className={`flex items-start gap-2.5 px-3 py-2.5 sm:items-center sm:gap-3 sm:px-4 ${seleccionada ? "bg-azure-50" : "hover:bg-clinic-bg/60"}`}>
      <span className="mt-1 sm:mt-0"><EstadoCheck estado={f.estado} /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <button
          type="button"
          onClick={onSeleccionar}
          aria-current={seleccionada || undefined}
          aria-label={`${TIPO_TAREA_LABEL[f.type]} — ${nombre} — ${ESTADO_LABEL[f.estado]}${atrasada ? ` (atrasada, ${fechaCorta(f.fecha, hoyFila)})` : ""}`}
          className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left sm:flex-row sm:items-center sm:gap-3"
        >
          <span className="flex items-center gap-2 sm:w-[112px] sm:shrink-0">
            <TipoBadge type={f.type} apagada={f.estado !== "pendiente"} />
            <span className={`whitespace-nowrap tabular-nums text-[11px] sm:hidden ${atrasada ? "font-bold text-state-err" : "text-clinic-muted"}`}>{fechaCorta(f.fecha, hoyFila)}</span>
          </span>
          <span className="block w-full min-w-0">
            <span className={`block truncate text-sm font-bold ${f.estado === "pendiente" ? "text-clinic-text" : "text-clinic-muted"}`}>{nombre}</span>
            {sub && <span className="block truncate text-xs text-clinic-muted">{sub}</span>}
          </span>
        </button>
        {f.estado === "pendiente" ? (
          <Desplegable
            alinear="auto"
            ancho="w-60"
            className="self-start sm:self-auto"
            etiqueta={asignado ? `Responsable: ${asignado}` : "Responsable"}
            boton={<><span className="max-w-[6.5rem] truncate">{asignado ? asignado.split(" ").slice(0, 2).join(" ") : "Responsable"}</span><ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0" /></>}
          >
            {(cerrar) => (
              <>
                <Opcion marcada={f.assigneeId === session?.userId} onClick={() => { if (session) onAsignar(session.userId); cerrar(); }}>Asignar a mí</Opcion>
                {asignables.length > 0 && (
                  <>
                    <p className="border-t border-clinic-border px-3 pb-1 pt-2 text-[13px] font-semibold text-clinic-muted">Asignar a otro usuario</p>
                    <div className="max-h-56 overflow-y-auto">
                      {asignables.map((u) => (
                        <Opcion key={u.id} marcada={f.assigneeId === u.id} onClick={() => { onAsignar(u.id); cerrar(); }}>{u.name}</Opcion>
                      ))}
                    </div>
                  </>
                )}
                {f.assigneeId && (
                  <div className="border-t border-clinic-border">
                    <Opcion onClick={() => { onAsignar(undefined); cerrar(); }}>Quitar responsable</Opcion>
                  </div>
                )}
              </>
            )}
          </Desplegable>
        ) : (
          <span className="max-w-[7rem] truncate text-xs text-clinic-muted">{asignado || "No asignado"}</span>
        )}
      </div>
      <span className={`hidden w-14 shrink-0 text-right tabular-nums text-xs sm:block ${atrasada ? "font-bold text-state-err" : "text-clinic-muted"}`}>{fechaCorta(f.fecha, hoyFila)}</span>
      <button type="button" tabIndex={-1} aria-hidden onClick={onSeleccionar} className="hidden text-clinic-muted hover:text-clinic-text sm:block">
        <ChevronRight className="h-4 w-4" />
      </button>
    </li>
  );
}
