"use client";

import { useMemo } from "react";
import { useStore } from "./store";
import { can, type Permission } from "./rbac";
import { doctoresVisibles, pacientesVisibles, veDoctor, vePaciente } from "./alcance";

/** Permisos y alcance del usuario de la sesión, para las pantallas: qué puede hacer
 *  (matriz de lib/rbac.ts) y sobre qué doctores y pacientes (lib/alcance.ts). */
export function useAlcance() {
  const { db, session } = useStore();
  return useMemo(() => {
    const doctores = session ? doctoresVisibles({ role: session.role, userId: session.userId }, db.users) : [];
    const pacientes = pacientesVisibles(doctores, { appointments: db.appointments, budgets: db.budgets });
    return {
      /** Profesionales cuya agenda y planes ve: `null` = todos. */
      doctores,
      /** Pacientes que ve: `null` = todos. */
      pacientes,
      puede: (p: Permission) => !!session && can(session.role, p),
      veDoctor: (dentistId?: string) => veDoctor(doctores, dentistId),
      vePaciente: (patientId: string) => vePaciente(pacientes, patientId),
      /** Asistente de doctores sin doctores asignados: no ve agendas ni pacientes. */
      sinDoctores: session?.role === "assistant" && (doctores?.length ?? 0) === 0,
    };
  }, [db.users, db.appointments, db.budgets, session]);
}
