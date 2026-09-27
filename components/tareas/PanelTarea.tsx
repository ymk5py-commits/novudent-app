"use client";
/** Panel derecho de la bandeja (paridad Dentalink): datos del paciente, el
 *  botón "Finalizar ▾" y las pestañas Comentarios · Presupuestos · Citas.
 *
 *  Roles v3: los teléfonos, el email y WhatsApp son datos personales
 *  (`patients.personal`); la deuda y los montos, plata (`money.view`); los
 *  presupuestos son planes (`plans.view` o quien los gestiona). */
import { useState } from "react";
import {
  AlertTriangle, CalendarDays, ChevronDown, CheckCircle2, ExternalLink, Mail, MessageCircle, MessageSquare,
  Phone, RotateCcw, Tag, Trash2, User, CalendarClock, ClipboardList,
} from "lucide-react";
import { useStore, fmtGs, fmtTime, waLink } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import { budgetBalance, BUDGET_STATUS_INFO } from "@/lib/budgets";
import {
  RECONTACTO_OPCIONES, RESOLUCION_LABEL, baseRecontacto, detalleTarea, fechaCorta, fechaLarga, resumenGestion, sumarDias,
  type FilaTarea,
} from "@/lib/tareas";
import type { Appointment, Budget, Patient, TaskAccion } from "@/lib/types";
import { Btn, Card, StatusBadge, inputCls } from "@/components/ui";
import { Desplegable, MOTIVO_SISTEMA, Opcion, TipoBadge, useNombres } from "./comun";

type Pestana = "comentarios" | "presupuestos" | "citas";

const edadDe = (p: Patient) => (p.birthDate ? Math.max(0, Math.floor((Date.now() - new Date(p.birthDate).getTime()) / 31557600000)) : null);

export function PanelTarea({
  fila,
  hoy,
  saldo,
  onGestionar,
  onEliminar,
}: {
  fila: FilaTarea | null;
  hoy: string;
  /** Saldo del paciente (se muestra solo con `money.view`). */
  saldo: number;
  onGestionar: (accion: TaskAccion, hasta?: string) => void;
  onEliminar?: () => void;
}) {
  const { db } = useStore();
  const alcance = useAlcance();
  const nombres = useNombres();

  if (!fila) {
    return (
      <Card className="p-6">
        <p className="py-10 text-center text-sm text-clinic-muted">Seleccioná una tarea para ver su detalle</p>
      </Card>
    );
  }

  const verPersonales = alcance.puede("patients.personal");
  const verMontos = alcance.puede("money.view");
  const p = nombres.pacienteDe(fila.patientId);
  const nombre = nombres.paciente(fila) || "Tarea interna";
  const personalizada = !fila.derivedKey;
  const edad = p ? edadDe(p) : null;
  // En la cobranza el monto ya va en "Paciente tiene deuda": no se repite en el detalle.
  const detalle = personalizada ? fila.title : detalleTarea(fila.type === "cobranza" ? { detail: fila.detail } : fila, verMontos ? fmtGs : undefined);
  const verPlanes = alcance.puede("plans.view") || alcance.puede("budgets.manage");
  const referencia = personalizada && fila.budgetId && verPlanes ? db.budgets.find((b) => b.id === fila.budgetId) : undefined;

  return (
    <Card className="overflow-visible">
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <User aria-hidden className="mt-1 h-4 w-4 shrink-0 text-clinic-muted" />
          <h2 className="min-w-0 flex-1 text-lg font-extrabold leading-tight text-clinic-text">
            {p && alcance.vePaciente(p.id) ? (
              <a href={`/app/pacientes/${p.id}`} className="hover:text-azure-700 hover:underline">{nombre}</a>
            ) : nombre}
          </h2>
        </div>

        <dl className="space-y-2 text-sm">
          <Linea icono={Tag} etiqueta="Tipo">
            <span className="flex flex-wrap items-center gap-2">
              <TipoBadge type={fila.type} />
              {!personalizada && <span className="text-clinic-text">{fila.title}</span>}
            </span>
          </Linea>
          {p && verPersonales && (p.phone || p.landline) && (
            <Linea icono={Phone} etiqueta="Teléfonos">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {p.phone && <span className="font-mono text-[13px]">{p.phone}</span>}
                {p.landline && <span className="font-mono text-[13px]">{p.landline}</span>}
                {p.phone && (
                  <a
                    href={waLink(p.phone, `Hola ${p.firstName}, te contactamos de ${db.clinics[0]?.name ?? "la clínica"}.`)}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-state-ok hover:underline"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                )}
              </span>
            </Linea>
          )}
          {p && edad != null && <Linea icono={CalendarDays} etiqueta="Edad">{edad} años</Linea>}
          {p && verPersonales && p.email && <Linea icono={Mail} etiqueta="Email"><span className="break-all">{p.email}</span></Linea>}
          {p && verMontos && saldo > 0 && (
            <Linea icono={AlertTriangle} etiqueta="Deuda" tono="err">
              <span className="inline-flex items-center rounded-md bg-state-err px-2 py-0.5 text-xs font-bold text-white">Paciente tiene deuda</span>
              <span className="ml-2 font-mono text-xs font-bold text-state-err">{fmtGs(saldo)}</span>
            </Linea>
          )}
          {detalle && <Linea icono={MessageSquare} etiqueta="Detalle"><span className="font-semibold text-clinic-text">{detalle}</span></Linea>}
          {referencia && (
            <Linea icono={ClipboardList} etiqueta="Presupuesto de referencia">
              <a href={`/app/pacientes/${referencia.patientId}#planes`} className="text-azure-700 hover:underline">Plan #{referencia.id}{referencia.name ? ` · ${referencia.name}` : ""}</a>
            </Linea>
          )}
          {fila.estado === "pendiente" && fila.fecha > hoy && (
            <Linea icono={CalendarClock} etiqueta="Fecha">Programada para el {fechaLarga(fila.fecha, hoy)}</Linea>
          )}
        </dl>

        {fila.estado === "pendiente" && <Finalizar key={fila.id} fila={fila} hoy={hoy} onGestionar={onGestionar} />}
        {fila.estado === "completada" && fila.gestion && (
          <div role="status" className="rounded-xl border border-state-ok/30 bg-state-okbg px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-sm font-extrabold text-state-ok">
              <CheckCircle2 aria-hidden className="h-4 w-4" /> Tarea completada{fila.gestion.byName ? ` · ${fila.gestion.byName}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-clinic-text">
              {fila.gestion.by
                ? resumenGestion(fila.gestion, personalizada, hoy)
                : `Cerrada como «${RESOLUCION_LABEL[fila.resolution ?? "acepto"]}»`}
            </p>
          </div>
        )}
        {fila.estado === "sistema" && (
          <div role="status" className="rounded-xl border border-clinic-border bg-clinic-bg px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-sm font-extrabold text-clinic-muted"><CheckCircle2 aria-hidden className="h-4 w-4" /> Completada por el sistema</p>
            <p className="mt-0.5 text-xs text-clinic-text">{MOTIVO_SISTEMA[fila.type]}</p>
          </div>
        )}
      </div>

      {p && <Pestanas key={p.id} paciente={p} />}

      {personalizada && onEliminar && (
        <div className="border-t border-clinic-border px-4 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={() => { if (confirm("¿Eliminar esta tarea personalizada?")) onEliminar(); }}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-clinic-muted hover:text-state-err"
          >
            <Trash2 className="h-3 w-3" /> Eliminar tarea
          </button>
        </div>
      )}
    </Card>
  );
}

function Linea({ icono: Icono, etiqueta, children, tono }: { icono: typeof User; etiqueta: string; children: React.ReactNode; tono?: "err" }) {
  return (
    <div className="flex items-start gap-2.5">
      <dt className="shrink-0"><Icono aria-hidden className={`mt-0.5 h-4 w-4 ${tono === "err" ? "text-state-err" : "text-clinic-muted"}`} /><span className="sr-only">{etiqueta}</span></dt>
      <dd className="min-w-0 flex-1 text-clinic-text">{children}</dd>
    </div>
  );
}

/* ─── Finalizar ▾ ─────────────────────────────────────────────────────────── */

function Finalizar({ fila, hoy, onGestionar }: { fila: FilaTarea; hoy: string; onGestionar: (accion: TaskAccion, hasta?: string) => void }) {
  const personalizada = !fila.derivedKey;
  const base = baseRecontacto(fila, hoy);
  const [recontacto, setRecontacto] = useState(false);
  const [opcion, setOpcion] = useState<number | "fecha">(7);
  const [fecha, setFecha] = useState(sumarDias(base, 7));
  const hasta = opcion === "fecha" ? fecha : sumarDias(base, opcion);
  const valida = !!hasta && hasta > base;

  return (
    <div className="space-y-3">
      <Desplegable primario ancho="w-72" boton={<>Finalizar <ChevronDown aria-hidden className="h-4 w-4" /></>}>
        {(cerrar) => (
          <>
            <Opcion
              onClick={() => { cerrar(); onGestionar("ok"); }}
              ayuda={personalizada ? "Completa la de hoy y la vuelve a activar en una semana." : "Respuesta positiva del paciente: completa la tarea."}
            >
              El paciente dice OK
            </Opcion>
            <Opcion onClick={() => { cerrar(); setRecontacto(true); }}>Volver a contactar en…</Opcion>
            <div className="my-1 border-t border-clinic-border" />
            <Opcion
              onClick={() => { cerrar(); onGestionar("cerrar"); }}
              ayuda={personalizada
                ? "Recomendada cuando la tarea ya se ejecutó (o el paciente dijo que no)."
                : "Esta opción es recomendada para aquellos casos en que el paciente nos da una respuesta negativa."}
            >
              Cerrar el caso
            </Opcion>
          </>
        )}
      </Desplegable>

      {recontacto && (
        <fieldset className="rounded-xl border border-clinic-border bg-clinic-bg/60 p-3">
          <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-clinic-muted">Volver a contactar en…</legend>
          <div className="space-y-1">
            {RECONTACTO_OPCIONES.map((o) => (
              <label key={o.dias} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-white">
                <input type="radio" name="recontacto" checked={opcion === o.dias} onChange={() => setOpcion(o.dias)} className="accent-azure-600" />
                <RotateCcw aria-hidden className="h-3.5 w-3.5 text-clinic-muted" />
                <span className="flex-1 font-semibold text-clinic-text">{o.label}</span>
                <span className="font-mono text-[11px] text-clinic-muted">{fechaCorta(sumarDias(base, o.dias), hoy)}</span>
              </label>
            ))}
            <label className="flex cursor-pointer flex-wrap items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-white">
              <input type="radio" name="recontacto" checked={opcion === "fecha"} onChange={() => setOpcion("fecha")} className="accent-azure-600" />
              <CalendarDays aria-hidden className="h-3.5 w-3.5 text-clinic-muted" />
              <span className="font-semibold text-clinic-text">Elegí una fecha</span>
            </label>
            {opcion === "fecha" && (
              <input
                type="date"
                aria-label="Nueva fecha"
                className={`${inputCls} ml-0 sm:ml-8 sm:w-auto`}
                min={sumarDias(base, 1)}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            )}
          </div>
          {!valida && <p className="mt-2 text-xs font-semibold text-state-err">La fecha nueva tiene que ser posterior al {fechaLarga(base, hoy)}.</p>}
          {/* Apilados: en el panel de 380 px los dos botones juntos no entran en una línea. */}
          <div className="mt-3 grid gap-1.5">
            <Btn className="w-full justify-center" disabled={!valida} onClick={() => { if (valida) onGestionar("recontactar", hasta); }}>Finalizar y generar nueva tarea</Btn>
            <Btn variant="ghost" className="w-full justify-center" onClick={() => setRecontacto(false)}>Cancelar</Btn>
          </div>
        </fieldset>
      )}
    </div>
  );
}

/* ─── Comentarios · Presupuestos · Citas ──────────────────────────────────── */

function Pestanas({ paciente }: { paciente: Patient }) {
  const alcance = useAlcance();
  const verComentarios = alcance.puede("patients.personal"); // roles v3: son de datos personales, como en la ficha
  const verPresupuestos = alcance.puede("plans.view") || alcance.puede("budgets.manage");
  const pestanas: [Pestana, string][] = [
    ...(verComentarios ? [["comentarios", "Comentarios"] as [Pestana, string]] : []),
    ...(verPresupuestos ? [["presupuestos", "Presupuestos"] as [Pestana, string]] : []),
    ["citas", "Citas"],
  ];
  const [elegida, setElegida] = useState<Pestana>(pestanas[0][0]);
  const tab = pestanas.some(([k]) => k === elegida) ? elegida : pestanas[0][0];

  return (
    <div className="border-t border-clinic-border">
      <div role="tablist" aria-label="Información del paciente" className="flex gap-1 overflow-x-auto px-3 pt-2 sm:px-4">
        {pestanas.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setElegida(k)}
            className={`whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-xs font-bold transition-colors ${tab === k ? "border-azure-600 text-azure-700" : "border-transparent text-clinic-muted hover:text-clinic-text"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="p-3 sm:p-4">
        {tab === "comentarios" && <Comentarios paciente={paciente} />}
        {tab === "presupuestos" && <Presupuestos paciente={paciente} />}
        {tab === "citas" && <Citas paciente={paciente} />}
      </div>
    </div>
  );
}

/** Los comentarios del panel SON los de la ficha (Datos personales → Comentarios):
 *  mismas notas `patientNotes` de tipo comentario, no otra colección. */
function Comentarios({ paciente }: { paciente: Patient }) {
  const { db, session, addPatientNote } = useStore();
  const [texto, setTexto] = useState("");
  const notas = db.patientNotes
    .filter((n) => n.patientId === paciente.id && n.kind === "comentario")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ingresar = () => {
    if (!session || !texto.trim()) return;
    addPatientNote({
      id: `pn_${Date.now()}`, clinicId: paciente.clinicId, patientId: paciente.id, kind: "comentario",
      text: texto.trim(), createdAt: new Date().toISOString(), createdBy: session.name,
    });
    setTexto("");
  };
  return (
    <div className="space-y-3">
      {notas.length === 0 ? (
        <p className="py-3 text-center text-xs text-clinic-muted">Todavía no hay comentarios para este paciente.</p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {notas.map((n) => (
            <li key={n.id} className="rounded-xl bg-clinic-bg px-3 py-2">
              <p className="whitespace-pre-wrap text-sm text-clinic-text">{n.text}</p>
              <p className="mt-0.5 text-[11px] text-clinic-muted">{n.createdBy} · {new Date(n.createdAt).toLocaleString("es-PY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            </li>
          ))}
        </ul>
      )}
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); ingresar(); }}>
        <textarea
          rows={2}
          className={inputCls}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribí un comentario para este paciente…"
          aria-label="Comentario para el paciente"
        />
        <div className="flex justify-end">
          <Btn type="submit" disabled={!texto.trim()}>Ingresar</Btn>
        </div>
      </form>
    </div>
  );
}

const ESTADO_PLAN: Partial<Record<Budget["status"], string>> = { aceptado: "Activo", completado: "Finalizado" };

function Presupuestos({ paciente }: { paciente: Patient }) {
  const { db } = useStore();
  const alcance = useAlcance();
  const nombres = useNombres();
  const verMontos = alcance.puede("money.view");
  const planes = db.budgets
    .filter((b) => b.patientId === paciente.id && b.status !== "anulado" && alcance.veDoctor(b.dentistId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (planes.length === 0) return <p className="py-3 text-center text-xs text-clinic-muted">El paciente no tiene presupuestos.</p>;
  const ahora = new Date().toISOString();
  return (
    <ul className="space-y-2">
      {planes.map((b) => {
        const deuda = b.status === "aceptado" || b.status === "completado" ? Math.max(0, budgetBalance(b, db.payments)) : 0;
        // "Faltó a su última cita en este tratamiento": la última cita ya pasada del plan quedó ausente.
        const ultima = db.appointments
          .filter((a) => a.budgetId === b.id && a.start <= ahora)
          .sort((x, y) => y.start.localeCompare(x.start))[0];
        return (
          <li key={b.id} className="rounded-xl border border-clinic-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-clinic-muted">Dr(a).</p>
                <p className="truncate text-sm font-bold text-clinic-text">{nombres.usuario(b.dentistId) || "—"}</p>
                <p className="truncate text-xs text-clinic-muted">Plan #{b.id}{b.name ? ` · ${b.name}` : ""}</p>
              </div>
              {verMontos && (
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-clinic-muted">Deuda</p>
                  <p className={`font-mono text-sm font-extrabold ${deuda > 0 ? "text-state-err" : "text-clinic-text"}`}>{fmtGs(deuda)}</p>
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className={`rounded-md px-1.5 py-0.5 font-bold ${b.status === "aceptado" ? "bg-state-okbg text-state-ok" : "bg-clinic-bg text-clinic-muted"}`}>
                {ESTADO_PLAN[b.status] ?? BUDGET_STATUS_INFO[b.status].label}
              </span>
              <span className="text-clinic-muted">Presupuesto generado el {new Date(b.createdAt).toLocaleDateString("es-PY", { day: "numeric", month: "long", year: "numeric" })}</span>
              <a href={`/app/pacientes/${paciente.id}#planes`} className="ml-auto inline-flex items-center gap-1 font-bold text-azure-700 hover:underline">
                Ir al tratamiento <ExternalLink aria-hidden className="h-3 w-3" />
              </a>
            </div>
            {ultima?.status === "ausente" && (
              <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-state-err px-2 py-1 text-[11px] font-bold text-white">
                <AlertTriangle aria-hidden className="h-3.5 w-3.5" /> Faltó a su última cita en este tratamiento
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Citas({ paciente }: { paciente: Patient }) {
  const { db } = useStore();
  const alcance = useAlcance();
  const nombres = useNombres();
  const citas: Appointment[] = db.appointments
    .filter((a) => a.patientId === paciente.id && alcance.veDoctor(a.dentistId))
    .sort((a, b) => b.start.localeCompare(a.start));
  if (citas.length === 0) return <p className="py-3 text-center text-xs text-clinic-muted">El paciente no tiene citas.</p>;
  return (
    <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
      {citas.map((a) => (
        <li key={a.id} className="rounded-xl border border-clinic-border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-clinic-muted">Dr(a).</p>
              <p className="truncate text-sm font-bold text-clinic-text">{nombres.usuario(a.dentistId) || "—"}</p>
              <p className="truncate text-xs text-clinic-muted">{a.title}{a.budgetId ? ` · Plan #${a.budgetId}` : ""}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-clinic-muted">Fecha</p>
              <p className="text-sm font-extrabold text-clinic-text">{new Date(a.start).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "2-digit" })}</p>
              <p className="font-mono text-[11px] text-clinic-muted">{fmtTime(a.start)}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={a.status} />
            {a.budgetId && (
              <a href={`/app/pacientes/${paciente.id}#planes`} className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-azure-700 hover:underline">
                Ir al tratamiento <ExternalLink aria-hidden className="h-3 w-3" />
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

