"use client";
/** «Dar cita» (revisión de Novum, 27/9/2026): a la izquierda el formulario —paciente
 *  «CI | Nombre» con «Crear nuevo paciente», tipo de consulta que filtra a los
 *  profesionales por especialidad, procedimiento a realizar, duración en horas y minutos,
 *  sucursal y box solo si hay más de uno, comentario, sobreagendar, multiconsulta y lista
 *  de espera— y a la derecha la agenda disponible del profesional en los próximos 7 días
 *  (o desde la fecha que se elija en el calendario), con los horarios donde entra la
 *  consulta. Los espacios bloqueados no se ofrecen nunca; «Sobreagendar» ofrece también
 *  los que ya tienen una cita, marcados «Ya hay 1 cita», y la cita queda como sobrecupo
 *  (pedido de Camila, 8-oct-2026). La cita nueva nace «No confirmado»: estado e importe
 *  salen del formulario y se cambian desde la agenda. La lógica de horarios está en
 *  lib/disponibilidad.ts y la del procedimiento, en lib/prestacionesCita.ts. */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Video, Hourglass, X } from "lucide-react";
import { useStore, fullName } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import { TIPOS_CONSULTA, especialidadCoincide, huecosDelDia, citasEnElHueco, diasDesde, inicioDe, finDeCita, type TipoConsulta } from "@/lib/disponibilidad";
import { alternarItem, budgetIdDeCita, estaTildado, nombreDelPlan, planesParaCita, prestacionDeItem, textoPrestacion, tituloDeCita } from "@/lib/prestacionesCita";
import { fechaLocal, parseFecha, esFecha } from "@/lib/tareas";
import { camposDe, datosPaciente, nuevoPaciente, siguienteCodigo, type ValoresCampos } from "@/lib/camposPaciente";
import { useRevisionAlta } from "@/lib/useRevisionAlta";
import { AvisoCiRepetida } from "@/components/AvisoCiRepetida";
import { BuscadorPaciente } from "@/components/BuscadorPaciente";
import { BuscadorPrestacion } from "@/components/BuscadorPrestacion";
import { CamposPacienteForm } from "@/components/CamposPacienteForm";
import type { Appointment, Patient, PrestacionCita } from "@/lib/types";
import { Btn, Modal, Field, inputCls } from "@/components/ui";

type Turno = { fecha: Date; hora: string };
const clave = (t: Turno) => `${t.fecha.toDateString()} ${t.hora}`;
const medianoche = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const horaDe = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export function DarCita({ cita, esNueva, preseleccion, desdeFecha, sobreagendar: sobreagendarAlAbrir, multiconsulta, onClose, onGuardar }: {
  cita: Appointment;
  esNueva: boolean;
  /** Día y hora que se tocaron en la grilla semanal (se preselecciona si está libre). */
  preseleccion?: Turno;
  /** Día desde el que arranca la agenda disponible (el que se estaba mirando). */
  desdeFecha?: Date;
  /** Abre con «Sobreagendar» prendido (menú de un espacio, el «+» de una cita, el ⋮ de la Diaria, «Ver»). */
  sobreagendar?: boolean;
  /** Abre con «Multiconsulta (varias citas)» tildada (menú de un espacio › «Dar múltiples citas»). */
  multiconsulta?: boolean;
  onClose: () => void;
  /** `espera`: además (o en vez) de las citas, dejar al paciente en la lista de espera. */
  onGuardar: (citas: Appointment[], espera?: { patientId: string; motivo: string; preferencia: string }) => void;
}) {
  const { db, session, crearPaciente } = useStore();
  const alcance = useAlcance();
  const hoy = medianoche(new Date());

  const [pacienteId, setPacienteId] = useState(cita.patientId);
  const [tipo, setTipo] = useState<TipoConsulta>(cita.tipoConsulta ?? "todas");
  const [dentistId, setDentistId] = useState(cita.dentistId);
  const duracionActual = esNueva ? 30 : Math.max(0, Math.round((Date.parse(cita.end) - Date.parse(cita.start)) / 60_000));
  const [horas, setHoras] = useState(Math.min(8, Math.floor(duracionActual / 60)));
  const [minutos, setMinutos] = useState(duracionActual % 60);
  const sucursales = db.branches.filter((b) => b.active !== false);
  const [branchId, setBranchId] = useState(cita.branchId ?? sucursales.find((b) => b.isMain)?.id ?? sucursales[0]?.id);
  const boxes = db.boxes;
  const [boxId, setBoxId] = useState(cita.boxId ?? (boxes.length === 1 ? boxes[0].id : boxes[0]?.id));
  const [telemed, setTelemed] = useState(!!cita.telemed);
  const [notas, setNotas] = useState(cita.notes ?? "");
  const [multi, setMulti] = useState(esNueva && !!multiconsulta);
  // Sobrecupo: una cita que ya es sobrecupo se edita con «Sobreagendar» prendido (si no, su propio horario no se ofrecería).
  const [sobreagendar, setSobreagendar] = useState(!!sobreagendarAlAbrir || !!cita.sobrecupo);
  // Lo que se le va a hacer en la cita: prestaciones de sus planes, del arancel o un motivo libre (lib/prestacionesCita.ts).
  const [prestaciones, setPrestaciones] = useState<PrestacionCita[]>(cita.prestaciones ?? []);
  const [otroMotivo, setOtroMotivo] = useState("");
  const [espera, setEspera] = useState(false);
  const [preferencia, setPreferencia] = useState("");
  const [seleccion, setSeleccion] = useState<Turno[]>(() => {
    if (!esNueva) return [{ fecha: medianoche(new Date(cita.start)), hora: horaDe(cita.start) }];
    return preseleccion ? [preseleccion] : [];
  });
  const [desde, setDesde] = useState<Date>(() => {
    const base = !esNueva ? new Date(cita.start) : preseleccion?.fecha ?? desdeFecha ?? hoy;
    return medianoche(base < hoy ? hoy : base);
  });
  const [creandoPaciente, setCreandoPaciente] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profesionales que ve este usuario, filtrados por la especialidad del tipo de consulta.
  const dentistas = db.users.filter((u) => u.role === "dentist" && u.active !== false && alcance.veDoctor(u.id));
  const porEspecialidad = dentistas.filter((d) => especialidadCoincide(tipo, d.specialty));
  const sinEspecialistas = tipo !== "todas" && porEspecialidad.length === 0;
  const opciones = sinEspecialistas ? dentistas : porEspecialidad;
  useEffect(() => {
    if (!opciones.some((d) => d.id === dentistId)) setDentistId(opciones[0]?.id ?? "");
  }, [opciones, dentistId]);
  const dentista = db.users.find((u) => u.id === dentistId);

  const duracion = horas * 60 + minutos;
  const dias = diasDesde(desde, 7);
  const boxElegido = boxes.length > 0 ? boxId : undefined;
  // El horario con el que se abrió (el de la cita que se edita o el tocado en la agenda) se ofrece aunque no caiga en los pasos de 30
  // minutos: sobreagendar una cita de las 09:20 ofrece las 09:20.
  const turnoInicial = !esNueva ? { fecha: medianoche(new Date(cita.start)), hora: horaDe(cita.start) } : preseleccion;
  const huecos = useMemo(() => {
    if (!dentistId || duracion <= 0) return dias.map(() => [] as string[]);
    const ahora = Date.now();
    return dias.map((d) => huecosDelDia(d, duracion, {
      dentistId, boxId: boxElegido, citas: db.appointments, ahora,
      horario: dentista?.horario, ignorarId: esNueva ? undefined : cita.id,
      bloqueos: db.agendaBlocks, permitirSuperponer: sobreagendar,
      incluir: turnoInicial && d.toDateString() === turnoInicial.fecha.toDateString() ? [turnoInicial.hora] : undefined,
    }));
  }, [dias.map((d) => d.getTime()).join(","), dentistId, duracion, boxElegido, db.appointments, db.agendaBlocks, sobreagendar, dentista?.horario, esNueva, cita.id, turnoInicial?.hora, turnoInicial?.fecha.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Cuántas citas del profesional (o del box) ya hay en ese horario: al sobreagendar se marca, y al guardar queda como sobrecupo. */
  const citasEn = (t: Turno) => citasEnElHueco(t.fecha, t.hora, duracion, { dentistId, boxId: boxElegido, citas: db.appointments, ignorarId: esNueva ? undefined : cita.id });

  /* — Procedimiento a realizar — */
  const verMontos = alcance.puede("money.view");
  const planes = useMemo(() => planesParaCita(db.budgets, pacienteId, alcance.veDoctor), [db.budgets, pacienteId, alcance]);
  const enLosPlanes = new Set(planes.flatMap((x) => x.items.map((i) => `${x.budget.id}:${i.id}`)));
  // Las que no se tildan en la lista de planes: las del arancel, los motivos libres y las de un plan que ya no está abierto.
  const sueltas = prestaciones.filter((x) => !(x.budgetId && x.itemId && enLosPlanes.has(`${x.budgetId}:${x.itemId}`)));
  const codigosElegidos = useMemo(() => new Set(prestaciones.filter((x) => !x.budgetId && x.cpt).map((x) => x.cpt!)), [prestaciones]);
  const agregarOtroMotivo = () => {
    const texto = otroMotivo.replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!texto) return;
    setPrestaciones((ps) => [...ps, { description: texto }]);
    setOtroMotivo("");
  };

  // Con multiconsulta, un turno que pisa a otro ya elegido no se puede tomar.
  const pisaElegido = (t: Turno) => {
    const ini = Date.parse(inicioDe(t.fecha, t.hora)); const fin = ini + duracion * 60_000;
    return seleccion.some((s) => clave(s) !== clave(t) && (() => { const i2 = Date.parse(inicioDe(s.fecha, s.hora)); return ini < i2 + duracion * 60_000 && fin > i2; })());
  };
  const elegir = (t: Turno) => {
    setError(null);
    setSeleccion((prev) => {
      const ya = prev.some((s) => clave(s) === clave(t));
      if (!multi) return ya ? [] : [t];
      return ya ? prev.filter((s) => clave(s) !== clave(t)) : [...prev, t].sort((a, b) => inicioDe(a.fecha, a.hora).localeCompare(inicioDe(b.fecha, b.hora)));
    });
  };
  useEffect(() => { if (!multi) setSeleccion((s) => s.slice(0, 1)); }, [multi]);
  // Si cambian el profesional, la duración o el box, se descartan los horarios elegidos
  // que ya no están libres (los de otras semanas se conservan hasta volver a verlos).
  useEffect(() => {
    setSeleccion((sel) => {
      const quedan = sel.filter((t) => {
        const i = dias.findIndex((d) => d.toDateString() === t.fecha.toDateString());
        return i < 0 || (huecos[i] ?? []).includes(t.hora);
      });
      return quedan.length === sel.length ? sel : quedan;
    });
  }, [huecos]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = () => {
    if (!pacienteId) return setError("Elegí un paciente.");
    if (!dentistId) return setError("Elegí un profesional.");
    if (duracion <= 0) return setError("La consulta tiene que durar más de 0 minutos.");
    if (seleccion.length === 0 && !espera) return setError("Elegí un horario en la agenda disponible, o marcá «Agregar a la lista de espera».");
    const def = TIPOS_CONSULTA.find((t) => t.clave === tipo)!;
    // Sin prestaciones el título es el de siempre (el tipo de consulta); si el que traía salía de sus prestaciones, ya no vale.
    const tituloBase = tipo === "todas" ? ((cita.prestaciones?.length ? "" : cita.title) || "Consulta") : def.label;
    const titulo = tituloDeCita(prestaciones, tituloBase);
    const budgetId = budgetIdDeCita(prestaciones, cita);
    // `fsSave` reemplaza el documento entero: se parte de la cita completa y se sacan los campos que se vuelven a calcular.
    const { sobrecupo: _sobrecupo, prestaciones: _prestaciones, budgetId: _budgetId, ...base } = cita;
    const citas: Appointment[] = seleccion.map((t, i) => {
      const start = inicioDe(t.fecha, t.hora);
      return {
        ...base,
        id: i === 0 ? cita.id : `${cita.id}_${i}`,
        patientId: pacienteId,
        dentistId,
        title: titulo,
        tipoConsulta: tipo === "todas" ? undefined : tipo,
        start,
        end: finDeCita(start, horas, minutos),
        status: esNueva ? "pendiente" : cita.status,
        branchId: sucursales.length > 0 ? branchId : undefined,
        boxId: boxElegido,
        telemed,
        notes: notas.trim() || undefined,
        amount: cita.amount ?? 0,
        discount: cita.discount ?? 0,
        ...(budgetId ? { budgetId } : {}),
        ...(prestaciones.length > 0 ? { prestaciones } : {}),
        // Sobrecupo: se dio sobreagendando y de verdad comparte el horario con otra cita del profesional o del box.
        ...(sobreagendar && citasEn(t) > 0 ? { sobrecupo: true as const } : {}),
      };
    });
    onGuardar(citas, espera ? { patientId: pacienteId, motivo: titulo, preferencia: preferencia.trim() } : undefined);
  };

  const n = seleccion.length;
  const textoBoton = !esNueva ? "Guardar cambios" : n === 0 && espera ? "Agregar a la lista de espera" : n > 1 ? `Crear ${n} citas` : "Crear cita";
  const rango = `${dias[0].toLocaleDateString("es-PY", { weekday: "short", day: "numeric", month: "short" })} al ${dias[6].toLocaleDateString("es-PY", { weekday: "short", day: "numeric", month: "short" })}`;

  return (
    <Modal title={esNueva ? "Dar cita" : "Editar cita"} onClose={onClose} xl>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* ===== Formulario ===== */}
        <div className="space-y-3">
          <BuscadorPaciente
            valor={pacienteId}
            onElegir={(id) => {
              if (id !== pacienteId) setPrestaciones((ps) => ps.filter((x) => !x.budgetId));
              setPacienteId(id);
              setError(null);
            }}
            onCrear={alcance.puede("patients.personal") ? () => setCreandoPaciente(true) : undefined}
          />
          <Field label="Tipo de consulta">
            <select id="dc-tipo" className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value as TipoConsulta)}>
              {TIPOS_CONSULTA.map((t) => <option key={t.clave} value={t.clave}>{t.label}</option>)}
            </select>
          </Field>
          <fieldset className="space-y-2 rounded-xl border border-clinic-border p-3">
            <legend className="px-1 text-[13px] font-semibold text-clinic-text">Procedimiento a realizar</legend>
            {!pacienteId ? (
              <p className="text-xs text-clinic-muted">Elegí un paciente para ver las prestaciones pendientes de sus planes de tratamiento.</p>
            ) : planes.length === 0 ? (
              <p className="text-xs text-clinic-muted">No tiene planes de tratamiento con prestaciones pendientes.</p>
            ) : planes.map(({ budget, items }) => (
              <fieldset key={budget.id} className="space-y-1">
                <legend className="text-[12px] font-bold text-clinic-muted">{nombreDelPlan(budget)}</legend>
                {items.map((it) => (
                  <label key={it.id} className="flex items-start gap-2 text-[13px] text-clinic-text">
                    <input type="checkbox" className="mt-0.5" checked={estaTildado(prestaciones, budget.id, it.id)} onChange={() => setPrestaciones((ps) => alternarItem(ps, budget, it))} />
                    <span>{textoPrestacion(prestacionDeItem(budget, it))}</span>
                  </label>
                ))}
              </fieldset>
            ))}
            <BuscadorPrestacion
              procs={db.procedures}
              etiqueta="Agregar otra prestación"
              placeholder="Agregar otra prestación del arancel…"
              mostrarPrecio={verMontos}
              excluir={codigosElegidos}
              onElegir={(p) => setPrestaciones((ps) => [...ps, { cpt: p.cpt, description: p.description }])}
            />
            <div className="flex gap-2">
              <input
                aria-label="Otro motivo"
                className={inputCls}
                value={otroMotivo}
                maxLength={120}
                placeholder="Otro motivo…" title="Si no está en el arancel, escribilo"
                onChange={(e) => setOtroMotivo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarOtroMotivo(); } }}
              />
              <Btn variant="outline" onClick={agregarOtroMotivo} disabled={!otroMotivo.trim()}>Agregar</Btn>
            </div>
            {sueltas.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {sueltas.map((x) => (
                  <li key={`${x.budgetId ?? ""}${x.itemId ?? ""}${x.cpt ?? ""}${x.description}`} className="inline-flex items-center gap-1 rounded-full bg-azure-50 py-0.5 pl-2.5 pr-1 text-[12px] font-semibold text-azure-800">
                    {textoPrestacion(x)}
                    <button type="button" aria-label={`Quitar ${textoPrestacion(x)}`} onClick={() => setPrestaciones((ps) => ps.filter((y) => y !== x))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-azure-100">
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          <Field label="Profesional" hint={sinEspecialistas ? "Ningún profesional tiene cargada esa especialidad: se muestran todos." : undefined}>
            <select id="dc-profesional" className={inputCls} value={dentistId} onChange={(e) => setDentistId(e.target.value)}>
              {opciones.length === 0 && <option value="">No hay profesionales</option>}
              {opciones.map((d) => <option key={d.id} value={d.id}>{d.name}{d.specialty ? ` · ${d.specialty}` : ""}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duración: horas">
              <select id="dc-horas" className={inputCls} value={horas} onChange={(e) => setHoras(Number(e.target.value))}>
                {Array.from({ length: 9 }, (_, h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </Field>
            <Field label="Minutos">
              <input
                id="dc-minutos" type="number" inputMode="numeric" min={0} max={60} step={1} className={inputCls} value={minutos}
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value.replace(/[^\d]/g, "")) || 0);
                  setMinutos(Math.max(0, Math.min(60, v)));
                }}
              />
            </Field>
          </div>
          {sucursales.length > 1 && (
            <Field label="Sucursal">
              <select id="dc-sucursal" className={inputCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {sucursales.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          )}
          {boxes.length > 1 && (
            <Field label="Box">
              <select id="dc-box" className={inputCls} value={boxId} onChange={(e) => setBoxId(e.target.value)}>
                {boxes.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Comentario (opcional)">
            <textarea id="dc-notas" rows={2} className={inputCls} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Se ve en la agenda al pasar por la cita" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-clinic-text">
            <input type="checkbox" checked={telemed} onChange={(e) => setTelemed(e.target.checked)} /> <Video className="h-4 w-4 text-azure-600" /> Videoconsulta
          </label>
          {/* La explicación va fuera del <label>: dentro, «profesional» y «box» entraban en el nombre de la casilla. */}
          <div className="text-sm text-clinic-text">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sobreagendar} aria-describedby="dc-sobreagendar-ayuda" onChange={(e) => setSobreagendar(e.target.checked)} />
              <b>Sobreagendar</b>
            </label>
            <p id="dc-sobreagendar-ayuda" className="ml-6 text-xs text-clinic-muted">Deja elegir un horario que ya tiene otra cita del mismo profesional o del mismo box (queda como sobrecupo). Los espacios bloqueados no se pueden usar.</p>
          </div>
          {esNueva && (
            <label className="flex items-start gap-2 text-sm text-clinic-text">
              <input type="checkbox" className="mt-0.5" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
              <span><b>Multiconsulta (varias citas)</b><span className="block text-xs text-clinic-muted">Elegí varios horarios en la agenda y se crea una cita en cada uno, con estos mismos datos.</span></span>
            </label>
          )}
          {esNueva && (
            <label className="flex items-start gap-2 text-sm text-clinic-text">
              <input type="checkbox" className="mt-0.5" checked={espera} onChange={(e) => setEspera(e.target.checked)} />
              <span><b className="inline-flex items-center gap-1"><Hourglass className="h-3.5 w-3.5" /> Agregar a la lista de espera</b><span className="block text-xs text-clinic-muted">Si el paciente quiere un turno antes, la recepción lo llama cuando se libere uno.</span></span>
            </label>
          )}
          {espera && (
            <Field label="Preferencia horaria">
              <input id="dc-preferencia" className={inputCls} value={preferencia} onChange={(e) => setPreferencia(e.target.value)} placeholder="Ej.: martes o jueves a la tarde" />
            </Field>
          )}
        </div>

        {/* ===== Agenda disponible ===== */}
        <section aria-labelledby="dc-grilla" className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="dc-grilla" className="text-sm font-bold text-clinic-text">Agenda disponible{dentista ? ` · ${dentista.name}` : ""}</h3>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              <input
                type="date"
                aria-label="Ir a la fecha"
                title="Ir a la fecha"
                min={fechaLocal(hoy)}
                value={fechaLocal(desde)}
                onChange={(e) => { const v = e.target.value; if (esFecha(v) && v >= fechaLocal(hoy)) setDesde(parseFecha(v)); }}
                className="h-8 rounded-lg border border-clinic-border bg-white px-2 text-xs font-semibold text-clinic-text focus:border-azure-600"
              />
              <button type="button" onClick={() => { const d = new Date(desde); d.setDate(d.getDate() - 7); setDesde(d < hoy ? hoy : d); }} disabled={desde <= hoy} className="grid h-8 w-8 place-items-center rounded-lg border border-clinic-border hover:bg-clinic-bg disabled:opacity-40" aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => setDesde(hoy)} className="rounded-lg border border-clinic-border px-2.5 py-1.5 text-xs font-bold text-azure-700 hover:bg-clinic-bg">Hoy</button>
              <button type="button" onClick={() => { const d = new Date(desde); d.setDate(d.getDate() + 7); setDesde(d); }} className="grid h-8 w-8 place-items-center rounded-lg border border-clinic-border hover:bg-clinic-bg" aria-label="Semana siguiente"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
          <p className="text-xs text-clinic-muted">
            Del {rango.replace(/\.$/, "")}. Aparecen solo los horarios donde entra una consulta de {[horas > 0 && `${horas} h`, (minutos > 0 || horas === 0) && `${minutos} min`].filter(Boolean).join(" ")}
            {sobreagendar ? ", también los que ya tienen una cita (con el borde ámbar). Los espacios bloqueados no aparecen." : "."}
          </p>
          <div className="overflow-x-auto rounded-xl border border-clinic-border">
            <div className="grid min-w-[700px] grid-cols-7 divide-x divide-clinic-border">
              {dias.map((d, i) => {
                const libres = huecos[i] ?? [];
                return (
                  <div key={d.toDateString()} className="min-w-0">
                    <div className={`border-b border-clinic-border px-1.5 py-2 text-center ${d.getTime() === hoy.getTime() ? "bg-azure-50" : "bg-clinic-bg/60"}`}>
                      <div className="text-[13px] font-semibold text-clinic-muted">{d.toLocaleDateString("es-PY", { weekday: "short" })}</div>
                      <div className="text-sm font-bold text-clinic-text">{d.getDate()}/{d.getMonth() + 1}</div>
                    </div>
                    <div className="max-h-[360px] space-y-1 overflow-y-auto p-1.5">
                      {libres.length === 0 ? (
                        <p className="py-3 text-center text-[11px] text-clinic-muted">{dentistId && duracion > 0 ? "Sin lugar" : "—"}</p>
                      ) : libres.map((h) => {
                        const t = { fecha: d, hora: h };
                        const elegido = seleccion.some((s) => clave(s) === clave(t));
                        const bloqueado = !elegido && multi && pisaElegido(t);
                        const yaHay = sobreagendar ? citasEn(t) : 0;
                        const borde = yaHay > 0
                          ? elegido ? "border-amber-500 bg-azure-600 text-white ring-2 ring-amber-400" : "border-amber-500 bg-amber-50 text-amber-900 hover:bg-amber-100"
                          : elegido ? "border-azure-600 bg-azure-600 text-white" : "border-clinic-border bg-white text-clinic-text hover:border-azure-400 hover:bg-azure-50";
                        return (
                          <button
                            key={h}
                            type="button"
                            disabled={bloqueado}
                            aria-pressed={elegido}
                            aria-label={`${d.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" })}, ${h}`}
                            title={yaHay > 0 ? `Ya hay ${yaHay} ${yaHay === 1 ? "cita" : "citas"}` : undefined}
                            onClick={() => elegir(t)}
                            className={`block w-full rounded-lg border px-1 py-1.5 text-center tabular-nums text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${borde}`}
                          >
                            {h}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {n > 0 && (
            <p className="text-xs text-clinic-text" role="status">
              {n === 1 ? "Horario elegido: " : `${n} horarios elegidos: `}
              <b>{seleccion.map((s) => `${s.fecha.toLocaleDateString("es-PY", { weekday: "short", day: "numeric", month: "short" })} ${s.hora}`).join(" · ")}</b>
            </p>
          )}
        </section>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold text-state-err">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={guardar}>{textoBoton}</Btn>
      </div>

      {creandoPaciente && (
        <CrearPaciente
          onClose={() => setCreandoPaciente(false)}
          onCreado={(p) => { if (session) crearPaciente(p, { id: session.userId, name: session.name }); setPacienteId(p.id); setCreandoPaciente(false); }}
          onUsar={(p) => { setPacienteId(p.id); setError(null); setCreandoPaciente(false); }}
          clinicId={cita.clinicId}
        />
      )}
    </Modal>
  );
}

/** Popup con la ficha del paciente nuevo (campos de «Al agendar» en Pacientes → Configuración). `noValidate`: lo que
 *  falta, lo mal cargado y una CI repetida se avisan con `useRevisionAlta`, no con el globito del navegador. Si la CI ya
 *  la tiene un paciente se ofrece usar ese (`onUsar`) en vez de crear otra ficha. */
function CrearPaciente({ onClose, onCreado, onUsar, clinicId }: { onClose: () => void; onCreado: (p: Patient) => void; onUsar: (p: Patient) => void; clinicId: string }) {
  const { db } = useStore();
  const campos = camposDe(db.clinics[0]?.config.patientFields, "agenda");
  const [valores, setValores] = useState<ValoresCampos>({});
  const alta = useRevisionAlta(campos, valores, db.patients);
  return (
    <Modal title="Nuevo paciente" onClose={onClose} wide>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!alta.validar()) return;
          onCreado(nuevoPaciente(datosPaciente(campos, valores), clinicId, Date.now(), siguienteCodigo(db.patients)));
        }}
      >
        <CamposPacienteForm
          campos={campos} valores={valores} onChange={setValores} convenios={(db.clinics[0]?.config.convenios ?? []).map((c) => c.name)}
          problemas={alta.problemas}
          avisos={{ documento: <AvisoCiRepetida repetidos={alta.repetidos} otraPersona={alta.otraPersona} onOtraPersona={alta.setOtraPersona} onUsar={onUsar} /> }}
        />
        {alta.mensaje && <p role="alert" className="rounded-xl bg-state-errbg px-3 py-2 text-xs font-semibold text-state-err">{alta.mensaje}</p>}
        <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancelar</Btn><Btn type="submit">Crear paciente</Btn></div>
      </form>
    </Modal>
  );
}
