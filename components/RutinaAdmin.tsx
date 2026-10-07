"use client";
/** «Rutina del administrador» (Inicio, solo el administrador): lo que le toca revisar cada día, cada semana y a fin de
 *  mes, con el dato de la clínica a la vista y un casillero que tilda a mano («controlé la caja»). Se reinicia sola.
 *  Toda la lógica vive en lib/rutinaAdmin.ts (puro, con tests); esto la dibuja y la cablea con el store. */
import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckSquare, ChevronDown, ClipboardCheck, Rocket, Square } from "lucide-react";
import { useStore, fmtGs, fmtTime } from "@/lib/store";
import { can } from "@/lib/rbac";
import { diaDe, fechaCorta, fechaLocal, tituloFecha } from "@/lib/tareas";
import { conMarcas, detallesDeHoy, pasosPuestaEnMarcha, semanaDeRutina, type DatosVivos, type PasoRutina } from "@/lib/rutinaAdmin";
import { useClinicPlan } from "@/components/PlanGate";
import { Badge, Card } from "@/components/ui";

export function RutinaAdmin() {
  const { db, session, setRutinaCheck } = useStore();
  const plan = useClinicPlan();
  const [semanaAbierta, setSemanaAbierta] = useState(false);
  const idBase = useId();
  const hoy = fechaLocal();
  const tieneCaja = plan.features.includes("caja");
  const tieneLiquidaciones = plan.features.includes("liquidaciones");

  // Lo caro (recorrer a los pacientes) depende de los datos de la clínica; tildar un casillero solo cambia las marcas.
  const vivos: DatosVivos = useMemo(() => ({
    hoy, tieneCaja, tieneLiquidaciones, dinero: fmtGs,
    patients: db.patients, budgets: db.budgets, payments: db.payments, expenses: db.expenses, cashSessions: db.cashSessions,
    billing: db.billing, appointments: db.appointments, settlements: db.settlements, profesionales: db.users,
  }), [hoy, tieneCaja, tieneLiquidaciones, db.patients, db.budgets, db.payments, db.expenses, db.cashSessions, db.billing, db.appointments, db.settlements, db.users]);
  const detalles = useMemo(() => detallesDeHoy(vivos), [vivos]);
  const pasos = useMemo(() => conMarcas(detalles, db.routineChecks), [detalles, db.routineChecks]);
  const semana = useMemo(() => semanaDeRutina({ ...vivos, checks: db.routineChecks }, detalles), [vivos, detalles, db.routineChecks]);
  const marcha = useMemo(
    () => pasosPuestaEnMarcha({ onboarding: db.onboarding, usuarios: db.users.length, prestaciones: db.procedures.length }),
    [db.onboarding, db.users.length, db.procedures.length],
  );

  if (!session || !can(session.role, "practice.config")) return null;

  const hechosHoy = pasos.filter((p) => p.hecho).length;
  const pct = pasos.length === 0 ? 0 : Math.round((hechosHoy / pasos.length) * 100);
  const marchaPendiente = marcha.filter((m) => !m.hecho).length;

  const diarios = pasos.filter((p) => p.frecuencia === "diaria");
  const deLaSemana = pasos.filter((p) => p.frecuencia === "semanal");
  const delMes = pasos.filter((p) => p.frecuencia === "mensual");

  const cuando = (iso: string) => (diaDe(iso) === hoy ? `a las ${fmtTime(iso)}` : `el ${fechaCorta(diaDe(iso), hoy)}`);

  const fila = (p: PasoRutina) => (
    <li key={p.id} className="group flex items-start gap-2.5 rounded-lg px-1.5 py-2 hover:bg-clinic-bg">
      <button
        type="button"
        onClick={() => setRutinaCheck(p.id, p.periodo, !p.hecho)}
        aria-pressed={p.hecho}
        aria-label={`${p.hecho ? "Desmarcar" : "Marcar como hecho"}: ${p.titulo}`}
        className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-azure-600"
      >
        {p.hecho
          ? <CheckSquare aria-hidden className="h-[18px] w-[18px] text-state-ok" strokeWidth={2.2} />
          : <Square aria-hidden className="h-[18px] w-[18px] text-clinic-border" strokeWidth={2.2} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`break-words text-sm font-semibold ${p.hecho ? "text-clinic-muted line-through" : "text-clinic-text"}`}>
          <Link href={p.href} className="hover:text-azure-700 hover:underline">{p.titulo}</Link>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-clinic-muted">
          <span data-rutina-dato={p.id} className={p.atencion && !p.hecho ? "font-semibold text-state-warn" : ""}>
            {p.atencion && !p.hecho && <AlertTriangle aria-hidden className="mr-1 inline h-3 w-3 align-[-1px]" />}
            {p.detalle}
          </span>
          {p.hecho && p.hechoPor && p.hechoEn && <span>· Lo controló {p.hechoPor} {cuando(p.hechoEn)}</span>}
        </p>
      </div>
      {p.etiqueta && <Badge tone="info">{p.etiqueta}</Badge>}
      {!p.hecho && (
        // Decorativa: el título ya es el link a lo mismo.
        <Link href={p.href} aria-hidden tabIndex={-1} className="mt-0.5 shrink-0 text-clinic-muted hover:text-azure-700"><ArrowRight className="h-4 w-4" /></Link>
      )}
    </li>
  );

  const seccion = (titulo: string, items: PasoRutina[], primera = false) =>
    items.length === 0 ? null : (
      <section aria-label={titulo} className={primera ? "" : "mt-3"}>
        <h3 className="px-1.5 pb-1 text-[12px] font-bold uppercase tracking-wide text-clinic-muted">{titulo}</h3>
        <ul>{items.map(fila)}</ul>
      </section>
    );

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck aria-hidden className="h-4 w-4 text-azure-600" />
            <h2 className="font-bold text-clinic-text">Rutina del administrador</h2>
          </div>
          <p className="mt-0.5 text-xs text-clinic-muted">Tildá lo que ya revisaste. Cada día empieza de cero.</p>
        </div>
        <p role="status" aria-live="polite" className="rounded-full bg-azure-50 px-3 py-1 text-xs font-bold text-azure-700">
          Esta semana: {semana.hechas} {semana.hechas === 1 ? "hecha" : "hechas"} · {semana.faltan} {semana.faltan === 1 ? "falta" : "faltan"}
        </p>
      </div>

      {marchaPendiente > 0 && (
        <a href="#puesta-en-marcha" className="mt-3 flex items-center gap-2.5 rounded-xl border border-azure-200 bg-azure-50 px-3 py-2.5 text-sm text-azure-700 transition-colors hover:bg-azure-100">
          <Rocket aria-hidden className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1"><b>Puesta en marcha:</b> {marchaPendiente === 1 ? "falta 1 paso" : `faltan ${marchaPendiente} pasos`} para dejar la clínica lista</span>
          <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
        </a>
      )}

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-semibold text-clinic-text">{pasos.length === 0 ? "Nada para hoy" : `Hoy: ${hechosHoy} de ${pasos.length}`}</span>
          <span className="tabular-nums text-clinic-muted">{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Avance de la rutina de hoy"
          aria-valuemin={0}
          aria-valuemax={Math.max(pasos.length, 1)}
          aria-valuenow={hechosHoy}
          aria-valuetext={`${hechosHoy} de ${pasos.length} hechos`}
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-clinic-bg"
        >
          <div className="h-full rounded-full bg-state-ok transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-3">
        {seccion("Todos los días", diarios, true)}
        {seccion("De la semana", deLaSemana)}
        {delMes.length > 0 && seccion(delMes[0].etiqueta ?? "Del mes", delMes)}
      </div>

      <button
        type="button"
        onClick={() => setSemanaAbierta((a) => !a)}
        aria-expanded={semanaAbierta}
        aria-controls={`${idBase}-semana`}
        className="mt-3 inline-flex items-center gap-1 rounded text-xs font-bold text-azure-600 hover:text-azure-700"
      >
        <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${semanaAbierta ? "rotate-180" : ""}`} />
        {semanaAbierta ? "Ocultar la semana" : "Ver la semana"}
      </button>

      {semanaAbierta && (
        <div id={`${idBase}-semana`} className="scroll-hint-shown mt-2 overflow-x-auto" aria-label="La semana de la rutina" role="region" tabIndex={0}>
          <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
            <colgroup>
              <col className="w-[36%] sm:w-[30%]" />
              {semana.dias.map((d) => <col key={d.fecha} />)}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="py-1.5 pr-2 text-left font-bold uppercase tracking-wide text-clinic-muted"><span className="sr-only">Paso</span></th>
                {semana.dias.map((d) => (
                  <th key={d.fecha} scope="col" className={`px-0 py-1.5 text-center font-bold ${d.esHoy ? "text-azure-700" : "text-clinic-muted"}`}>
                    {d.etiqueta}<span className="block font-normal tabular-nums">{d.fecha.slice(8)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semana.diarias.map((f) => (
                <tr key={f.id}>
                  <th scope="row" className="border-t border-clinic-border py-1.5 pr-2 text-left font-semibold leading-tight text-clinic-text">{f.titulo}</th>
                  {f.celdas.map((c, i) => {
                    const d = semana.dias[i];
                    return (
                      <td key={d.fecha} className={`border-t border-clinic-border px-0 py-1.5 text-center ${d.esHoy ? "bg-azure-50/60" : ""}`}>
                        {c === "futuro" ? (
                          <span aria-hidden className="text-clinic-border">·</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRutinaCheck(f.id, d.fecha, c !== "hecho")}
                            aria-pressed={c === "hecho"}
                            aria-label={`${c === "hecho" ? "Desmarcar" : "Marcar como hecho"}: ${f.titulo}, ${tituloFecha(d.fecha, hoy)}`}
                            className="mx-auto grid h-6 w-6 place-items-center rounded transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-azure-600"
                          >
                            {c === "hecho"
                              ? <CheckSquare aria-hidden className="h-4 w-4 text-state-ok" strokeWidth={2.2} />
                              : <Square aria-hidden className={`h-4 w-4 ${c === "antes" ? "text-clinic-border" : "text-state-err/60"}`} strokeWidth={2.2} />}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {semana.periodicas.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-clinic-border pt-2">
              {semana.periodicas.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-xs text-clinic-text">
                  {p.hecho ? <CheckSquare aria-hidden className="h-4 w-4 text-state-ok" /> : <Square aria-hidden className="h-4 w-4 text-state-err/60" />}
                  <span className="font-semibold">{p.titulo}</span>
                  <span className="text-clinic-muted">{p.etiqueta ? `· ${p.etiqueta}` : "· de la semana"}</span>
                  <span className="sr-only">{p.hecho ? "Hecho" : "Falta"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
