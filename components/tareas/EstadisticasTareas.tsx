"use client";
/** Estadísticas de las tareas de gestión (el ícono de indicador de Dentalink):
 *  cuatro contadores —Deudas cobradas, Presupuestos capturados, Controles
 *  agendados, Citas re-agendadas, cada uno "de N casos"— y "Usuarios y los
 *  casos en los que han participado", por tipo, histórico o por mes.
 *
 *  Solo para quien ve los números del negocio (`billing.reports`): es el
 *  rendimiento de cada persona del equipo.
 *
 *  Un "caso" es una tarea que alguien trabajó desde "Finalizar ▾" (ver
 *  lib/tareas-reportes.ts): lo que se resolvió solo sin que nadie lo tocara no
 *  deja registro. */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { useStore } from "@/lib/store";
import { estadisticasTareas, CONTADORES, type PeriodoTareas, type TipoContador } from "@/lib/tareas-reportes";
import { etiquetaMes, fechaLocal, TIPO_TAREA_LABEL } from "@/lib/tareas";
import { Card } from "@/components/ui";
import { CHART_COLOR } from "./comun";

const EN_GRAFICO: TipoContador[] = ["captura", "cobranza", "control", "cita"];

function moverMes(mes: string, n: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function EstadisticasTareas() {
  const { db } = useStore();
  const mesActual = fechaLocal().slice(0, 7);
  const [periodo, setPeriodo] = useState<PeriodoTareas>({ tipo: "mes", mes: mesActual });
  const [mes, setMes] = useState(mesActual);
  const e = useMemo(
    () => estadisticasTareas({ mgmtTasks: db.mgmtTasks, budgets: db.budgets, payments: db.payments, appointments: db.appointments }, periodo),
    [db.mgmtTasks, db.budgets, db.payments, db.appointments, periodo],
  );
  const elegirMes = (m: string) => { setMes(m); setPeriodo({ tipo: "mes", mes: m }); };

  return (
    <div className="space-y-4">
      {/* Un solo filtro, arriba de todo lo que acota: contadores y gráfico leen el mismo período. */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        <button
          type="button"
          aria-pressed={periodo.tipo === "historico"}
          onClick={() => setPeriodo({ tipo: "historico" })}
          className={`rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${periodo.tipo === "historico" ? "border-navy-800 bg-navy-800 text-white" : "border-clinic-border bg-white text-clinic-muted hover:text-clinic-text"}`}
        >
          Resultados históricos
        </button>
        <div className={`inline-flex items-center rounded-xl border ${periodo.tipo === "mes" ? "border-navy-800 bg-navy-800 text-white" : "border-clinic-border bg-white text-clinic-muted"}`}>
          <button type="button" aria-label="Mes anterior" onClick={() => elegirMes(moverMes(mes, -1))} className="grid h-9 w-8 place-items-center rounded-l-xl hover:bg-black/10"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" aria-pressed={periodo.tipo === "mes"} onClick={() => elegirMes(mes)} className="px-1 text-sm font-bold">
            Por mes: {etiquetaMes(mes)}
          </button>
          <button type="button" aria-label="Mes siguiente" disabled={mes >= mesActual} onClick={() => elegirMes(moverMes(mes, 1))} className="grid h-9 w-8 place-items-center rounded-r-xl hover:bg-black/10 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="grid grid-cols-2 gap-px overflow-hidden bg-clinic-border lg:grid-cols-1">
          {CONTADORES.map(({ tipo, label }) => (
            <div key={tipo} className="bg-white p-4">
              <p className="flex items-center gap-2 text-xs font-bold text-clinic-muted">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLOR[tipo] }} />
                {label}
              </p>
              <p className="mt-1 text-3xl font-extrabold text-clinic-text">{e.contadores[tipo].exitos}</p>
              <p className="text-xs text-clinic-muted">de {e.contadores[tipo].casos} {e.contadores[tipo].casos === 1 ? "caso" : "casos"}</p>
            </div>
          ))}
        </Card>

        <Card className="min-w-0 p-4 sm:p-5">
          <div className="flex items-start gap-2">
            <h2 className="text-base font-extrabold text-clinic-text">Usuarios y los casos en los que han participado</h2>
            <span
              tabIndex={0}
              className="mt-0.5 text-clinic-muted"
              data-tip="Cada caso es una tarea que la persona trabajó desde «Finalizar»: un caso trabajado varias veces cuenta una sola vez."
              aria-label="Cada caso es una tarea que la persona trabajó desde Finalizar; un caso trabajado varias veces cuenta una sola vez."
            >
              <Info className="h-4 w-4" />
            </span>
          </div>
          <Grafico usuarios={e.usuarios} />
          <Tabla usuarios={e.usuarios} />
        </Card>
      </div>
    </div>
  );
}

type Usuarios = ReturnType<typeof estadisticasTareas>["usuarios"];

/** Barras horizontales apiladas (los nombres son largos y en el celular no
 *  entran como columnas). 2 px de separación entre segmentos, extremo redondeado
 *  de 4 px y el total escrito en la punta: la identidad nunca depende solo del color. */
function Grafico({ usuarios }: { usuarios: Usuarios }) {
  const [hover, setHover] = useState<{ user: string; tipo: TipoContador } | null>(null);
  const filas = usuarios
    .map((u) => ({ ...u, graficado: EN_GRAFICO.reduce((s, t) => s + (u.porTipo[t] ?? 0), 0) }))
    .filter((u) => u.graficado > 0);
  const max = Math.max(1, ...filas.map((u) => u.graficado));

  if (filas.length === 0) {
    return <p className="py-10 text-center text-sm text-clinic-muted">Todavía no hay casos trabajados en este período.</p>;
  }
  return (
    <figure className="mt-4">
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-clinic-muted" aria-label="Referencias">
        {EN_GRAFICO.map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLOR[t] }} />
            {TIPO_TAREA_LABEL[t]}
          </li>
        ))}
      </ul>
      <ul className="space-y-3">
        {filas.map((u) => {
          let acumulado = 0;
          const segmentos = EN_GRAFICO.filter((t) => (u.porTipo[t] ?? 0) > 0).map((t) => {
            const n = u.porTipo[t] ?? 0;
            const s = { t, n, desde: acumulado, ancho: (n / max) * 100 };
            acumulado += s.ancho;
            return s;
          });
          const tip = hover?.user === u.userId ? segmentos.find((s) => s.t === hover.tipo) : undefined;
          return (
            <li key={u.userId} className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center sm:gap-3">
              <span className="truncate text-sm font-semibold text-clinic-text">{u.nombre}</span>
              <div className="flex min-w-0 items-center gap-2">
                {/* El ancho es proporcional al máximo sobre lo que queda después de
                    reservar 40 px para el total: así la barra más larga y su número entran. */}
                <div className="relative flex h-5 shrink-0 items-stretch gap-[2px]" style={{ width: `calc((100% - 40px) * ${acumulado / 100})` }}>
                  {segmentos.map((s, i) => (
                    <span
                      key={s.t}
                      role="img"
                      tabIndex={0}
                      aria-label={`${u.nombre}: ${s.n} ${s.n === 1 ? "caso" : "casos"} de ${TIPO_TAREA_LABEL[s.t].toLowerCase()}`}
                      onMouseEnter={() => setHover({ user: u.userId, tipo: s.t })}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover({ user: u.userId, tipo: s.t })}
                      onBlur={() => setHover(null)}
                      className={`block min-w-[3px] outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-navy-800 ${i === segmentos.length - 1 ? "rounded-r-[4px]" : ""}`}
                      style={{ flexGrow: s.n, flexBasis: 0, background: CHART_COLOR[s.t] }}
                    />
                  ))}
                  {tip && (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-clinic-border bg-white px-2.5 py-1.5 text-xs shadow-pop"
                      style={{ left: `${((tip.desde + tip.ancho / 2) / (acumulado || 1)) * 100}%` }}
                    >
                      <b className="font-extrabold text-clinic-text">{tip.n}</b>{" "}
                      <span className="text-clinic-muted">{TIPO_TAREA_LABEL[tip.t]}</span>
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs font-bold tabular-nums text-clinic-text">{u.graficado}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <figcaption className="mt-3 text-[11px] text-clinic-muted">Casos de tareas automáticas por usuario. Las personalizadas y los cheques están en la tabla.</figcaption>
    </figure>
  );
}

/** La tabla es el gemelo accesible del gráfico, y además suma personalizadas y cheques. */
function Tabla({ usuarios }: { usuarios: Usuarios }) {
  if (usuarios.length === 0) return null;
  const cols = [...EN_GRAFICO, "personalizada", "cheque"] as const;
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-clinic-border">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="sr-only">Casos por usuario y tipo de tarea</caption>
        <thead>
          <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
            <th scope="col" className="px-3 py-2">Usuario</th>
            {cols.map((c) => <th key={c} scope="col" className="px-2 py-2 text-right">{TIPO_TAREA_LABEL[c]}</th>)}
            <th scope="col" className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-clinic-border tabular-nums">
          {usuarios.map((u) => (
            <tr key={u.userId}>
              <th scope="row" className="px-3 py-2 text-left font-semibold text-clinic-text">{u.nombre}</th>
              {cols.map((c) => <td key={c} className="px-2 py-2 text-right text-clinic-text">{u.porTipo[c] ?? 0}</td>)}
              <td className="px-3 py-2 text-right font-extrabold text-clinic-text">{u.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
