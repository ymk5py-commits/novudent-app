"use client";
/** Las tareas de gestión que ve el usuario de la sesión, y las acciones sobre
 *  ellas. Lo comparten la bandeja (/app/tareas) y la ficha del paciente.
 *
 *  Toda la lógica vive en lib/tareas.ts (puro, con tests); acá solo se cablea
 *  con el store y con el alcance del rol (roles v3). */
import { useMemo } from "react";
import { useStore } from "./store";
import { useAlcance } from "./useAlcance";
import { tiposDeTareaVisibles, veTarea } from "./alcance";
import {
  derivarTareas, filasDeTareas, gestionarTarea, asignarTarea, nuevaPersonalizada, fechaLocal, mapaDeSaldos,
  type FilaTarea,
} from "./tareas";
import type { MgmtTask, TaskAccion } from "./types";

export function useTareas() {
  const { db, session, addMgmtTask, updateMgmtTask, deleteMgmtTask } = useStore();
  const alcance = useAlcance();
  // Hora LOCAL: a las 22 h en Paraguay `toISOString()` ya es mañana.
  const hoy = fechaLocal();
  const cid = db.clinics[0]?.id ?? "";
  const tipos = useMemo(() => (session ? tiposDeTareaVisibles(session.role) : []), [session]);

  const derivadas = useMemo(() => derivarTareas({
    patients: db.patients,
    budgets: db.budgets,
    payments: db.payments,
    appointments: db.appointments,
    deadlines: db.clinics[0]?.config?.taskDeadlines,
  }, hoy), [db.patients, db.budgets, db.payments, db.appointments, db.clinics, hoy]);

  // Roles v3: sin plata no hay cobranza ni cheques; la captura es de quien
  // gestiona presupuestos; con alcance (dentista, asistente), solo sus tareas y
  // las de sus pacientes. Se filtra acá, una vez, para todas las pantallas.
  const filas = useMemo(
    () => filasDeTareas(derivadas, db.mgmtTasks, hoy)
      .filter((f) => tipos.includes(f.type) && veTarea(f, session?.userId ?? "", alcance.pacientes)),
    [derivadas, db.mgmtTasks, hoy, tipos, session?.userId, alcance.pacientes],
  );

  const saldos = useMemo(() => mapaDeSaldos(db.budgets, db.payments), [db.budgets, db.payments]);

  /** El doc guardado de una fila: el override de la derivada o la manual. */
  const docDe = (f: FilaTarea): MgmtTask | undefined =>
    f.derivedKey ? (f.overrideId ? db.mgmtTasks.find((x) => x.id === f.overrideId) : undefined) : db.mgmtTasks.find((x) => x.id === f.id);

  const guardar = (r: { doc: MgmtTask; nuevo: boolean }) => (r.nuevo ? addMgmtTask(r.doc) : updateMgmtTask(r.doc));

  return {
    hoy,
    tipos,
    derivadas,
    filas,
    /** Saldo del paciente (solo para quien ve montos: el panel lo gatea). */
    saldoDe: (patientId?: string) => (patientId ? saldos.get(patientId) ?? 0 : 0),
    /** "Finalizar ▾". Devuelve el id de la fila ✓ que queda en la bandeja de hoy. */
    gestionar: (f: FilaTarea, accion: TaskAccion, hasta?: string): string | null => {
      if (!session) return null;
      const r = gestionarTarea(f, {
        accion, hasta, quien: { id: session.userId, name: session.name },
        ahora: new Date().toISOString(), hoy, clinicId: cid, doc: docDe(f),
      });
      guardar(r);
      return r.filaId;
    },
    asignar: (f: FilaTarea, assigneeId: string | undefined) => {
      guardar(asignarTarea(f, assigneeId, { ahora: new Date().toISOString(), clinicId: cid, doc: docDe(f) }));
    },
    crearPersonalizada: (o: { detalle: string; fecha: string; patientId?: string; patientName?: string; budgetId?: string }): MgmtTask | null => {
      if (!session) return null;
      const t = nuevaPersonalizada({ ...o, id: `mt_${Date.now()}`, clinicId: cid, createdBy: session.userId, ahora: new Date().toISOString() });
      addMgmtTask(t);
      return t;
    },
    eliminar: (id: string) => deleteMgmtTask(id),
  };
}
