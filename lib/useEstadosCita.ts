"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { estadosDeClinica } from "@/lib/estadosCita";

/** Estados de cita vigentes de la clínica de la sesión (lib/estadosCita). */
export function useEstadosCita() {
  const { db } = useStore();
  const config = db.clinics[0]?.config;
  return useMemo(() => estadosDeClinica(config), [config]);
}
