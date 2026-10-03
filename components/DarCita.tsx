"use client";
/** «Dar cita» (revisión de Novum, 27/9/2026): a la izquierda el formulario —paciente
 *  «CI | Nombre» con «Crear nuevo paciente», tipo de consulta que filtra a los
 *  profesionales por especialidad, duración en horas y minutos, sucursal y box solo si
 *  hay más de uno, comentario, multiconsulta y lista de espera— y a la derecha la agenda
 *  disponible del profesional en los próximos 7 días, con los horarios donde entra la
 *  consulta. La cita nueva nace «No confirmado»: estado e importe salen del formulario y
 *  se cambian desde la agenda. La lógica de horarios está en lib/disponibilidad.ts. */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search, Video, Hourglass, X } from "lucide-react";
import { useStore, fullName } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import { TIPOS_CONSULTA, especialidadCoincide, huecosDelDia, diasDesde, inicioDe, finDeCita, type TipoConsulta } from "@/lib/disponibilidad";
import { camposDe, faltantes, datosPaciente, nuevoPaciente, siguienteCodigo, type ValoresCampos } from "@/lib/camposPaciente";
import { CamposPacienteForm } from "@/components/CamposPacienteForm";
import type { Appointment, Patient } from "@/lib/types";
import { Btn, Modal, Field, inputCls } from "@/components/ui";

type Turno = { fecha: Date; hora: string };
const clave = (t: Turno) => `${t.fecha.toDateString()} ${t.hora}`;
const medianoche = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const horaDe = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export function DarCita({ cita, esNueva, preseleccion, desdeFecha, onClose, onGuardar }: {
  cita: Appointment;
  esNueva: boolean;
  /** Día y hora que se tocaron en la grilla semanal (se preselecciona si está libre). */
  preseleccion?: Turno;
  /** Día desde el que arranca la agenda disponible (el que se estaba mirando). */
  desdeFecha?: Date;
  onClose: () => void;
  /** `espera`: además (o en vez) de las citas, dejar al paciente en la lista de espera. */
  onGuardar: (citas: Appointment[], espera?: { patientId: string; motivo: string; preferencia: string }) => void;
}) {
  const { db, upsertPatient } = useStore();
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
  const [multi, setMulti] = useState(false);
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
  const huecos = useMemo(() => {
    if (!dentistId || duracion <= 0) return dias.map(() => [] as string[]);
    const ahora = Date.now();
    return dias.map((d) => huecosDelDia(d, duracion, {
      dentistId, boxId: boxes.length > 0 ? boxId : undefined, citas: db.appointments, ahora,
      horario: dentista?.horario, ignorarId: esNueva ? undefined : cita.id,
    }));
  }, [dias.map((d) => d.getTime()).join(","), dentistId, duracion, boxId, db.appointments, dentista?.horario, esNueva, cita.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const titulo = tipo === "todas" ? (cita.title || "Consulta") : def.label;
    const citas: Appointment[] = seleccion.map((t, i) => {
      const start = inicioDe(t.fecha, t.hora);
      return {
        ...cita,
        id: i === 0 ? cita.id : `${cita.id}_${i}`,
        patientId: pacienteId,
        dentistId,
        title: titulo,
        tipoConsulta: tipo === "todas" ? undefined : tipo,
        start,
        end: finDeCita(start, horas, minutos),
        status: esNueva ? "pendiente" : cita.status,
        branchId: sucursales.length > 0 ? branchId : undefined,
        boxId: boxes.length > 0 ? boxId : undefined,
        telemed,
        notes: notas.trim() || undefined,
        amount: cita.amount ?? 0,
        discount: cita.discount ?? 0,
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
            onElegir={(id) => { setPacienteId(id); setError(null); }}
            onCrear={alcance.puede("patients.personal") ? () => setCreandoPaciente(true) : undefined}
          />
          <Field label="Tipo de consulta">
            <select id="dc-tipo" className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value as TipoConsulta)}>
              {TIPOS_CONSULTA.map((t) => <option key={t.clave} value={t.clave}>{t.label}</option>)}
            </select>
          </Field>
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
          {esNueva && (
            <label className="flex items-start gap-2 text-sm text-clinic-text">
              <input type="checkbox" className="mt-0.5" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
              <span><b>Multiconsulta</b><span className="block text-xs text-clinic-muted">Elegí varios horarios en la agenda y se crea una cita en cada uno, con estos mismos datos.</span></span>
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
            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => { const d = new Date(desde); d.setDate(d.getDate() - 7); setDesde(d < hoy ? hoy : d); }} disabled={desde <= hoy} className="grid h-8 w-8 place-items-center rounded-lg border border-clinic-border hover:bg-clinic-bg disabled:opacity-40" aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => setDesde(hoy)} className="rounded-lg border border-clinic-border px-2.5 py-1.5 text-xs font-bold text-azure-700 hover:bg-clinic-bg">Hoy</button>
              <button type="button" onClick={() => { const d = new Date(desde); d.setDate(d.getDate() + 7); setDesde(d); }} className="grid h-8 w-8 place-items-center rounded-lg border border-clinic-border hover:bg-clinic-bg" aria-label="Semana siguiente"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
          <p className="text-xs text-clinic-muted">Del {rango}. Aparecen solo los horarios donde entra una consulta de {[horas > 0 && `${horas} h`, (minutos > 0 || horas === 0) && `${minutos} min`].filter(Boolean).join(" ")}.</p>
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
                        return (
                          <button
                            key={h}
                            type="button"
                            disabled={bloqueado}
                            aria-pressed={elegido}
                            aria-label={`${d.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" })}, ${h}`}
                            onClick={() => elegir(t)}
                            className={`block w-full rounded-lg border px-1 py-1.5 text-center tabular-nums text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${elegido ? "border-azure-600 bg-azure-600 text-white" : "border-clinic-border bg-white text-clinic-text hover:border-azure-400 hover:bg-azure-50"}`}
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
          onCreado={(p) => { upsertPatient(p); setPacienteId(p.id); setCreandoPaciente(false); }}
          clinicId={cita.clinicId}
        />
      )}
    </Modal>
  );
}

/** Buscador de paciente: se escribe la CI o el nombre y se elige de la lista
 *  «CI | NOMBRE COMPLETO». Al final de la lista, «Crear nuevo paciente». */
function BuscadorPaciente({ valor, onElegir, onCrear }: { valor: string; onElegir: (id: string) => void; onCrear?: () => void }) {
  const { db } = useStore();
  const alcance = useAlcance();
  const id = useId();
  // Los deshabilitados no se ofrecen para citas nuevas (salvo el que ya tiene la cita).
  const pacientes = db.patients.filter((p) => (alcance.vePaciente(p.id) && !p.disabled) || p.id === valor);
  const etiqueta = (p: Patient) => `${p.document || "Sin CI"} | ${fullName(p).toLocaleUpperCase("es-PY")}`;
  const elegido = pacientes.find((p) => p.id === valor);
  const [texto, setTexto] = useState(elegido ? etiqueta(elegido) : "");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => { if (elegido) setTexto(etiqueta(elegido)); }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(texto.trim());
  const filtrados = (elegido && texto === etiqueta(elegido)) || !q
    ? pacientes.slice(0, 8)
    : pacientes.filter((p) => norm(`${p.document} ${p.document.replace(/\D/g, "")} ${fullName(p)}`).includes(q)).slice(0, 8);
  const total = filtrados.length + (onCrear ? 1 : 0);
  const elegir = (i: number) => {
    if (i < filtrados.length) { onElegir(filtrados[i].id); setTexto(etiqueta(filtrados[i])); setAbierto(false); }
    else if (onCrear) { setAbierto(false); onCrear(); }
  };

  return (
    <div ref={caja} className="relative">
      <label htmlFor={`${id}-input`} className="mb-1 block text-[13px] font-semibold text-clinic-muted">Paciente</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
        <input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={abierto && total > 0 ? `${id}-op-${activo}` : undefined}
          autoComplete="off"
          className={`${inputCls} pl-9 pr-8`}
          placeholder="Escribí la CI o el nombre"
          value={texto}
          onFocus={() => setAbierto(true)}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true); setActivo(0); if (valor) onElegir(""); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setActivo((a) => Math.min(total - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter" && abierto && total > 0) { e.preventDefault(); elegir(activo); }
            else if (e.key === "Escape" && abierto) { e.stopPropagation(); setAbierto(false); }
          }}
        />
        {texto && (
          <button type="button" aria-label="Borrar paciente" onClick={() => { setTexto(""); onElegir(""); setAbierto(true); }} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-clinic-muted hover:bg-clinic-bg">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {abierto && (
        <ul id={`${id}-lista`} role="listbox" aria-label="Pacientes" className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-clinic-border bg-white py-1 shadow-pop">
          {filtrados.length === 0 && <li className="px-3 py-2 text-xs text-clinic-muted">No hay pacientes con esa CI o ese nombre.</li>}
          {filtrados.map((p, i) => (
            <li
              key={p.id}
              id={`${id}-op-${i}`}
              role="option"
              aria-selected={p.id === valor}
              onMouseDown={(e) => { e.preventDefault(); elegir(i); }}
              onMouseEnter={() => setActivo(i)}
              className={`cursor-pointer px-3 py-2 tabular-nums text-xs ${i === activo ? "bg-azure-50 text-azure-800" : "text-clinic-text"}`}
            >
              {etiqueta(p)}
            </li>
          ))}
          {onCrear && (
            <li
              id={`${id}-op-${filtrados.length}`}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => { e.preventDefault(); elegir(filtrados.length); }}
              onMouseEnter={() => setActivo(filtrados.length)}
              className={`mt-1 flex cursor-pointer items-center gap-1.5 border-t border-clinic-border px-3 py-2.5 text-sm font-bold text-azure-700 ${activo === filtrados.length ? "bg-azure-50" : ""}`}
            >
              <Plus className="h-4 w-4" /> Crear nuevo paciente
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Popup con la ficha del paciente nuevo (campos de «Al agendar» en Pacientes → Configuración). */
function CrearPaciente({ onClose, onCreado, clinicId }: { onClose: () => void; onCreado: (p: Patient) => void; clinicId: string }) {
  const { db } = useStore();
  const campos = camposDe(db.clinics[0]?.config.patientFields, "agenda");
  const [valores, setValores] = useState<ValoresCampos>({});
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Nuevo paciente" onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const falta = faltantes(campos, valores);
          if (falta.length > 0) { setError(`Completá: ${falta.join(", ")}.`); return; }
          onCreado(nuevoPaciente(datosPaciente(campos, valores), clinicId, Date.now(), siguienteCodigo(db.patients)));
        }}
      >
        <CamposPacienteForm campos={campos} valores={valores} onChange={setValores} convenios={(db.clinics[0]?.config.convenios ?? []).map((c) => c.name)} />
        {error && <p role="alert" className="rounded-xl bg-state-errbg px-3 py-2 text-xs font-semibold text-state-err">{error}</p>}
        <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancelar</Btn><Btn type="submit">Crear paciente</Btn></div>
      </form>
    </Modal>
  );
}
