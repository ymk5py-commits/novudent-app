"use client";
/** Tareas de gestión (paridad Dentalink, "Configura las Tareas Automáticas").
 *
 *  Tres secciones con íconos, como Dentalink: la bandeja (✓), las estadísticas
 *  (indicador) y los plazos de las tareas (engranaje). Cada una lleva su nombre escrito
 *  al lado del ícono (en pantalla ancha) y como nombre accesible y tooltip siempre.
 *
 *  La bandeja tiene tres listas. "Todas las pendientes" (la que abre, pedido de
 *  Camila del 8-oct-2026: "debe salir todas las tareas, no solo las del día") junta
 *  lo que falta de CUALQUIER fecha, de la más vieja a la más nueva. "Tareas del día"
 *  es POR DÍA, como Dentalink: "Tareas - Martes 19 Octubre" con ‹ Anterior · Fecha ·
 *  Siguiente ›; es la que abren los enlaces con ?fecha= (Mi agenda, la ficha). "Tareas
 *  atrasadas" es lo vencido. Las automáticas —cobranza, captura, control, cita,
 *  cheque— NO se guardan: las deriva `lib/tareas.ts` del estado de la clínica en cada
 *  render, y por eso se cierran solas. Lo guardado en `mgmtTasks` son las
 *  personalizadas y los OVERRIDES: la decisión humana sobre una derivada (asignarla,
 *  trabajarla desde "Finalizar ▾", reprogramarla). */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Gauge, ListChecks, ListFilter, Plus, Settings, ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/rbac";
import { useAlcance } from "@/lib/useAlcance";
import { useTareas } from "@/lib/useTareas";
import { tiposDeTareaVisibles } from "@/lib/alcance";
import {
  bandejaDelDia, esFecha, estaPostergada, fechaCorta, ordenarFilas, sumarDias, tituloFecha, todasLasPendientes, TIPO_TAREA_LABEL, type FilaTarea,
} from "@/lib/tareas";
import type { MgmtTaskType } from "@/lib/types";
import { rutaDeSeccion, seccionDeRuta } from "@/lib/rutasPanel";
import { Badge, Btn, Card } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { Desplegable, ESTADO_LABEL, EstadoCheck, Opcion, TipoBadge, useNombres } from "@/components/tareas/comun";
import { PanelTarea } from "@/components/tareas/PanelTarea";
import { NuevaTareaModal } from "@/components/tareas/NuevaTareaModal";
import { PlazosTareas } from "@/components/tareas/PlazosTareas";
import { EstadisticasTareas } from "@/components/tareas/EstadisticasTareas";

type Vista = "bandeja" | "estadisticas" | "configuracion";
type Lista = "todas" | "dia" | "atrasadas";
type FiltroResp = "todos" | "mias" | "sin";

export default function TareasPage() {
  const { session } = useStore();
  const alcance = useAlcance();
  const nombres = useNombres();
  const tareas = useTareas();
  const { hoy } = tareas;

  const [vista, setVista] = useState<Vista>("bandeja");
  // La sección sale de la URL limpia (/app/tareas/estadisticas, /app/tareas/plazos: lib/rutasPanel) y la sigue también con «atrás».
  const pathname = usePathname();
  useLayoutEffect(() => {
    const s = seccionDeRuta(pathname);
    if (s?.area === "tareas") setVista(s.id as Vista);
  }, [pathname]);
  const [fecha, setFecha] = useState(hoy);
  // «Todas las pendientes» es la que abre; con ?fecha=… (ver el efecto de abajo) se abre «Tareas del día» de ese día.
  const [lista, setLista] = useState<Lista>("todas");
  const [filtroTipo, setFiltroTipo] = useState<"todas" | MgmtTaskType>("todas");
  const [filtroResp, setFiltroResp] = useState<FiltroResp>("todos");
  const [esconderSistema, setEsconderSistema] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Enlaces directos: ?fecha=AAAA-MM-DD&tarea=<id> (desde la ficha del
  // paciente y desde Mi agenda) y #estadisticas / #configuracion. Se lee en un efecto
  // y no con useSearchParams para no obligar a la página entera a renderizar en el
  // servidor. Con una fecha se abre «Tareas del día» de ese día, como siempre: así los
  // enlaces que ya existen no cambian aunque la bandeja ahora abra en «Todas las pendientes».
  // Es un efecto de layout para que la lista que no es no llegue a pintarse (se veía un
  // instante «Todas las pendientes» antes de pasar al día del enlace).
  useLayoutEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const f = q.get("fecha");
    if (esFecha(f)) { setFecha(f); setLista("dia"); }
    const id = q.get("tarea");
    if (id) setSelId(id);
    // Enlaces viejos con #estadisticas / #configuracion (el Shell además los pasa a la URL limpia).
    const h = window.location.hash.slice(1);
    if (h === "estadisticas" || h === "configuracion") setVista(h);
  }, []);

  const verStats = alcance.puede("billing.reports");
  const verConfig = alcance.puede("practice.config");
  const vistaEfectiva: Vista = (vista === "estadisticas" && !verStats) || (vista === "configuracion" && !verConfig) ? "bandeja" : vista;

  // Los filtros valen para las tres listas, y los contadores de las pestañas cuentan lo que se ve con ellos.
  const filtradas = useMemo(
    () => tareas.filas.filter((f) =>
      (filtroTipo === "todas" || f.type === filtroTipo)
      && (filtroResp === "todos" || (filtroResp === "mias" ? f.assigneeId === session?.userId : !f.assigneeId))),
    [tareas.filas, filtroTipo, filtroResp, session?.userId],
  );
  const todas = useMemo(() => todasLasPendientes(filtradas, (f) => nombres.paciente(f) || f.title), [filtradas, nombres]);
  const { delDia, atrasadas } = useMemo(() => {
    const b = bandejaDelDia(filtradas, fecha, hoy, esconderSistema);
    const nombre = (f: FilaTarea) => nombres.paciente(f) || f.title;
    return { delDia: ordenarFilas(b.delDia, nombre), atrasadas: ordenarFilas(b.atrasadas, nombre) };
  }, [filtradas, fecha, hoy, esconderSistema, nombres]);

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

  const filasLista = lista === "todas" ? todas : lista === "dia" ? delDia : atrasadas;
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

  const titulo = vistaEfectiva === "bandeja" ? (lista === "todas" ? "Tareas pendientes" : `Tareas - ${tituloFecha(fecha, hoy)}`) : vistaEfectiva === "estadisticas" ? "Estadísticas" : "Plazos de las tareas";

  return (
    <Reveal className="space-y-4">
      {/* Encabezado: secciones (íconos, como Dentalink) + título + navegación por día (no en «Todas las pendientes»: no hay día que elegir) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {(verStats || verConfig) && (
          <div role="tablist" aria-label="Secciones de tareas" className="flex rounded-xl border border-clinic-border bg-white p-1">
            {([
              ["bandeja", "Bandeja de tareas", ListChecks, true],
              ["estadisticas", "Estadísticas", Gauge, verStats],
              ["configuracion", "Plazos de las tareas", Settings, verConfig],
            ] as const).filter(([, , , ok]) => ok).map(([k, label, Icono]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={vistaEfectiva === k}
                aria-label={label}
                title={label}
                onClick={() => {
                  setVista(k);
                  const destino = rutaDeSeccion("tareas", k);
                  if (window.location.pathname !== destino) window.history.pushState(null, "", destino + (k === "bandeja" ? window.location.search : ""));
                }}
                className={`flex h-8 w-9 items-center justify-center gap-1.5 rounded-lg text-[13px] transition-colors sm:w-auto sm:px-3 ${vistaEfectiva === k ? "border-azure-600 text-azure-700" : "border-transparent text-clinic-text hover:text-azure-600"}`}
              >
                <Icono aria-hidden className="h-4 w-4 shrink-0" />
                {/* Con lugar (pantalla ancha) cada sección dice su nombre; en el celular queda el ícono, con su nombre accesible y el tooltip. */}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        )}
        <h1 className="min-w-0 text-lg font-bold text-clinic-text sm:text-xl">{titulo}</h1>

        {vistaEfectiva === "bandeja" && lista !== "todas" && (
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
            {/* Con tres listas no entran los nombres enteros en el celular (la última se salía de la pantalla y quedaba recortada): ahí se ve el corto
                y el lector de pantalla oye siempre el completo. `overflow-x-auto` por si, con muchos dígitos, aun así no entrara: que scrollee sola. */}
            <div role="tablist" aria-label="Listas de tareas" className="flex max-w-full overflow-x-auto rounded-xl border border-clinic-border bg-white p-1">
              {([["todas", "Todas las pendientes", "Todas", todas.length], ["dia", "Tareas del día", "Del día", null], ["atrasadas", "Tareas atrasadas", "Atrasadas", atrasadas.length]] as const).map(([k, label, corto, n]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={lista === k}
                  onClick={() => { setLista(k); setSelId(null); }}
                  className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-normal transition-colors sm:px-3 ${lista === k ? "bg-navy-800 text-white" : "text-clinic-muted hover:text-clinic-text"}`}
                >
                  <span aria-hidden className="sm:hidden">{corto}</span>
                  <span className="sr-only sm:not-sr-only">{label}</span>
                  {n != null && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${lista === k ? "bg-white/20" : k === "atrasadas" && n > 0 ? "bg-state-errbg text-state-err" : "bg-clinic-bg"}`}>{n}</span>
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
              {/* «Todas las pendientes» no trae completadas (ni del sistema): no hay nada que esconder. */}
              {lista !== "todas" && (
                <label
                  className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-clinic-muted"
                  title="Las que se resolvieron solas (el paciente pagó, agendó o aceptó) cuando alguien ya las tenía asignadas o trabajadas."
                >
                  <input type="checkbox" checked={esconderSistema} onChange={(e) => setEsconderSistema(e.target.checked)} className="accent-azure-600" />
                  Esconder tareas completadas por sistema
                </label>
              )}
            </div>
          </div>

          {/* grid-cols-1 = minmax(0, 1fr): sin eso, en el celular la columna implícita
              crece hasta el texto sin cortes de las filas y la página se recorta. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div ref={listaRef} className="min-w-0 scroll-mt-28">
              <Card className="overflow-visible">
                {filasLista.length === 0 ? (
                  <p className="px-6 py-14 text-center text-sm text-clinic-muted">
                    {lista === "todas"
                      ? "No hay tareas pendientes."
                      : lista === "atrasadas"
                        ? "No hay tareas atrasadas."
                        : fecha === hoy ? "No hay tareas para hoy." : `No hay tareas para el ${tituloFecha(fecha, hoy).toLowerCase()}.`}
                  </p>
                ) : (
                  <ul aria-label={lista === "todas" ? "Todas las pendientes" : lista === "dia" ? "Tareas del día" : "Tareas atrasadas"} className="divide-y divide-clinic-border">
                    {filasLista.map((f) => (
                      <FilaBandeja
                        key={f.id}
                        f={f}
                        hoy={hoy}
                        nombres={nombres}
                        conFecha={lista === "todas"}
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
          fechaInicial={lista === "todas" ? hoy : fecha}
          onClose={() => setNueva(false)}
          // En «Todas las pendientes» la nueva ya está en la lista (en su lugar): no hace falta ir a su día.
          onCreada={(t) => { if (t.dueDate && lista !== "todas") { setFecha(t.dueDate); setLista("dia"); } setSelId(t.id); }}
        />
      )}
    </Reveal>
  );
}

/* ─── Fila de la bandeja ─── */
function FilaBandeja({ f, hoy: hoyFila, nombres, conFecha, seleccionada, onSeleccionar, onAsignar }: {
  f: FilaTarea;
  hoy: string;
  /** Los de la página: armarlos en cada fila recorrería a todos los pacientes una vez por fila. */
  nombres: ReturnType<typeof useNombres>;
  /** «Todas las pendientes»: las filas son de fechas distintas, así que la fecha va bien a la vista y se avisa si la tarea está postergada. */
  conFecha?: boolean;
  seleccionada: boolean;
  onSeleccionar: () => void;
  onAsignar: (userId: string | undefined) => void;
}) {
  const { db, session } = useStore();
  const nombre = nombres.paciente(f) || "Tarea interna";
  const profesional = nombres.usuario(f.professionalId) || (f.type === "personalizada" ? nombres.usuario(f.createdBy) : "");
  const sub = [profesional, f.title].filter(Boolean).join(" · ");
  const atrasada = f.estado === "pendiente" && f.fecha < hoyFila;
  const postergada = !!conFecha && estaPostergada(f, hoyFila);
  const fecha = fechaCorta(f.fecha, hoyFila);
  // Con lector de pantalla: en «Todas» cada fila dice su fecha, no solo las atrasadas.
  const cuando = atrasada ? ` (atrasada, ${fecha})` : conFecha ? ` (${postergada ? "postergada, " : ""}${fecha})` : "";
  const colorFecha = atrasada
    ? "font-bold text-state-err"
    : !conFecha ? "text-clinic-muted" : f.fecha === hoyFila ? "font-semibold text-azure-700" : "text-clinic-text";
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
          aria-label={`${TIPO_TAREA_LABEL[f.type]} — ${nombre} — ${ESTADO_LABEL[f.estado]}${cuando}`}
          className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left sm:flex-row sm:items-center sm:gap-3"
        >
          <span className="flex items-center gap-2 sm:w-[112px] sm:shrink-0">
            <TipoBadge type={f.type} apagada={f.estado !== "pendiente"} />
            <span className={`whitespace-nowrap tabular-nums text-[11px] sm:hidden ${colorFecha}`}>{fecha}</span>
            {postergada && <span className="sm:hidden"><Badge tone="hold">Postergada</Badge></span>}
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
      <span className={`hidden shrink-0 text-right tabular-nums text-xs sm:block ${conFecha ? "w-[5.5rem]" : "w-14"}`}>
        <span className={`block ${colorFecha}`}>{fecha}</span>
        {postergada && <span className="mt-0.5 block"><Badge tone="hold">Postergada</Badge></span>}
      </span>
      <button type="button" tabIndex={-1} aria-hidden onClick={onSeleccionar} className="hidden text-clinic-muted hover:text-clinic-text sm:block">
        <ChevronRight className="h-4 w-4" />
      </button>
    </li>
  );
}
