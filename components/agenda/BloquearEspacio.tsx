"use client";
/** «Bloquear espacio» (pedido de Camila, 8-oct-2026, como Dentalink): se abre desde el menú de un espacio de la semanal, con ese día y esa
 *  hora. Profesional (o «Todos los profesionales»), box (si hay dos o más), fecha, desde y hasta (de a 15 minutos), motivo con sugerencias
 *  y repetición (días hábiles o todas las semanas, hasta un año). Las citas que ya hay en ese horario no se tocan: se avisa. Lógica pura en
 *  lib/bloqueos.ts; lo guarda la agenda con `addAgendaBlocks`. */
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import {
  armarBloqueos, citasQuePisan, errorDeBloqueo, FIN_DEL_DIA, MOTIVOS_SUGERIDOS, OPCIONES_REPETIR, PASO_BLOQUEO_MIN,
  TODOS_LOS_PROFESIONALES, unAnioDespues, type FormBloqueo, type Repetir,
} from "@/lib/bloqueos";
import { celdasDelDia } from "@/lib/agendaSemana";
import { fechaLocal, sumarDias } from "@/lib/tareas";
import type { AgendaBlock } from "@/lib/types";
import { Btn, Field, Modal, inputCls } from "@/components/ui";

const HORAS_DESDE = celdasDelDia(PASO_BLOQUEO_MIN);
const HORAS_HASTA = [...HORAS_DESDE.slice(1), FIN_DEL_DIA];

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
/** «jue 15/10». */
const diaCorto = (iso: string) => { const d = new Date(iso); return `${DIAS_CORTOS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`; };

/** La hora una celda (30 min) más tarde, para el «Hasta» de arranque. */
function mediaHoraDespues(hora: string): string {
  const [h, m] = hora.split(":").map(Number);
  const min = Math.min(1440, h * 60 + m + 30);
  return min >= 1440 ? FIN_DEL_DIA : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

// Cada campo lleva `aria-label`: dentro de un <label>, el nombre de un <select> suma la opción elegida («Hasta12:30»).
export function BloquearEspacio({ fecha, hora, dentistId, boxId, onClose, onGuardar }: {
  fecha: Date;
  hora: string;
  /** El profesional del filtro de la agenda, si hay uno elegido. */
  dentistId?: string;
  /** El box del filtro de la agenda, si hay uno elegido. */
  boxId?: string;
  onClose: () => void;
  onGuardar: (bloqueos: AgendaBlock[]) => void;
}) {
  const { db, session } = useStore();
  const alcance = useAlcance();
  const dentistas = db.users.filter((u) => u.role === "dentist" && u.active !== false && alcance.veDoctor(u.id));
  const [f, setF] = useState<FormBloqueo>(() => ({
    dentistId: dentistId ?? "", boxId: boxId || undefined, fecha: fechaLocal(fecha),
    desde: HORAS_DESDE.includes(hora) ? hora : "08:00", hasta: mediaHoraDespues(HORAS_DESDE.includes(hora) ? hora : "08:00"),
    motivo: "", repetir: "no",
  }));
  const [error, setError] = useState<string | null>(null);
  const cambiar = (p: Partial<FormBloqueo>) => { setError(null); setF((x) => ({ ...x, ...p })); };

  // Vista previa: cuántos bloqueos se crean y cuántas citas que ya existen quedan debajo (siguen en la agenda).
  const previa = useMemo(
    () => (errorDeBloqueo(f) ? [] : armarBloqueos(f, { clinicId: "", createdAt: "", createdBy: "", idBase: "previa" })),
    [f],
  );
  const pisadas = useMemo(() => citasQuePisan(previa, db.appointments).length, [previa, db.appointments]);

  const guardar = () => {
    const e = errorDeBloqueo(f);
    if (e) return setError(e);
    if (!session) return;
    const idBase = `bl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    onGuardar(armarBloqueos(f, { clinicId: session.clinicId, createdAt: new Date().toISOString(), createdBy: session.name, idBase }));
  };

  return (
    <Modal title="Bloquear espacio" onClose={onClose}>
      <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); guardar(); }}>
        <Field label="Profesional">
          <select id="bl-profesional" aria-label="Profesional" className={inputCls} value={f.dentistId} onChange={(e) => cambiar({ dentistId: e.target.value })}>
            <option value="">Elegí…</option>
            <option value={TODOS_LOS_PROFESIONALES}>Todos los profesionales</option>
            {dentistas.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        {db.boxes.length > 1 && (
          <Field label="Box">
            <select id="bl-box" aria-label="Box" className={inputCls} value={f.boxId ?? ""} onChange={(e) => cambiar({ boxId: e.target.value || undefined })}>
              <option value="">Todos los boxes</option>
              {db.boxes.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Fecha">
            <input id="bl-fecha" type="date" aria-label="Fecha" className={inputCls} value={f.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} />
          </Field>
          <Field label="Desde">
            <select id="bl-desde" aria-label="Desde" className={inputCls} value={f.desde} onChange={(e) => cambiar({ desde: e.target.value })}>
              {HORAS_DESDE.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </Field>
          <Field label="Hasta">
            <select id="bl-hasta" aria-label="Hasta" className={inputCls} value={f.hasta} onChange={(e) => cambiar({ hasta: e.target.value })}>
              {HORAS_HASTA.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </Field>
        </div>
        <div>
          <Field label="Motivo (opcional)">
            <input id="bl-motivo" aria-label="Motivo (opcional)" className={inputCls} value={f.motivo ?? ""} maxLength={80} placeholder="Ej.: Almuerzo" onChange={(e) => cambiar({ motivo: e.target.value })} />
          </Field>
          <div role="group" className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Motivos sugeridos">
            {MOTIVOS_SUGERIDOS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={f.motivo === m}
                onClick={() => cambiar({ motivo: m })}
                className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold transition-colors ${f.motivo === m ? "border-azure-600 bg-azure-50 text-azure-700" : "border-clinic-border text-clinic-muted hover:border-azure-300 hover:text-clinic-text"}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Repetir">
            <select
              id="bl-repetir"
              aria-label="Repetir"
              className={inputCls}
              value={f.repetir}
              onChange={(e) => {
                const repetir = e.target.value as Repetir;
                cambiar({ repetir, repetirHasta: repetir === "no" ? undefined : f.repetirHasta ?? sumarDias(f.fecha, 28) });
              }}
            >
              {OPCIONES_REPETIR.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
            </select>
          </Field>
          {f.repetir !== "no" && (
            <Field label="Repetir hasta">
              <input
                id="bl-repetir-hasta" type="date" aria-label="Repetir hasta" className={inputCls} value={f.repetirHasta ?? ""}
                min={f.fecha} max={/^\d{4}-\d{2}-\d{2}$/.test(f.fecha) ? unAnioDespues(f.fecha) : undefined}
                onChange={(e) => cambiar({ repetirHasta: e.target.value })}
              />
            </Field>
          )}
        </div>

        {previa.length > 1 && (
          <p role="status" className="rounded-xl bg-clinic-bg px-3 py-2 text-xs text-clinic-text">
            Se van a crear {previa.length} bloqueos, del {diaCorto(previa[0].start)} al {diaCorto(previa[previa.length - 1].start)}.
          </p>
        )}
        {pisadas > 0 && (
          <p role="status" className="rounded-xl bg-state-warnbg px-3 py-2 text-xs font-semibold text-state-warn">
            Ya hay {pisadas} {pisadas === 1 ? "cita" : "citas"} en ese horario; siguen en la agenda.
          </p>
        )}
        {error && <p role="alert" className="rounded-xl bg-state-errbg px-3 py-2 text-xs font-semibold text-state-err">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn type="submit">Bloquear</Btn>
        </div>
      </form>
    </Modal>
  );
}
