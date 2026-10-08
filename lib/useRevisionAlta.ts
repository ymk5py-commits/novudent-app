"use client";

import { useMemo, useState } from "react";
import { CAMPOS, claveDeCI, pacientesConCI, revisar, type CampoKey, type CampoResuelto, type ValoresCampos } from "./camposPaciente";
import type { Patient } from "./types";

/* La revisión de los formularios de alta de paciente («Nuevo paciente» y «Crear nuevo paciente» al dar una cita).
 *
 * Los dos forms llevan `noValidate`: el globito del navegador (`required`) avisa de a un campo, sin formato, y no ve lo que
 * `datosPaciente` descartaría en silencio (un correo sin dominio, una CI de solo espacios). Acá se revisa todo junto:
 *   - lo que falta («Completá: …») y lo mal cargado («Revisá: …»), en un solo mensaje;
 *   - una CI que ya tiene otro paciente, que se frena hasta que la persona confirme que es otra («Es otra persona»).
 * Hasta el primer intento de guardar no se marca nada: no se le grita a quien todavía está escribiendo. */

export const AVISO_CI_REPETIDA = "Ya hay un paciente con esa CI. Si es otra persona, marcá «Es otra persona» para crear la ficha igual.";

export function useRevisionAlta(campos: CampoResuelto[], valores: ValoresCampos, pacientes: readonly Patient[]) {
  const [intento, setIntento] = useState(false);
  // La CI (su clave) de la que se dijo «es otra persona». Si la CI cambia, la confirmación anterior deja de valer.
  const [confirmada, setConfirmada] = useState<string | null>(null);

  const clave = claveDeCI(valores.documento);
  const repetidos = useMemo(() => pacientesConCI(pacientes, valores.documento), [pacientes, valores.documento]);
  const otraPersona = clave !== null && confirmada === clave;
  const sinConfirmar = repetidos.length > 0 && !otraPersona;

  const revision = revisar(campos, valores);
  const conProblema = new Set<CampoKey>(revision.claves);
  if (sinConfirmar) conProblema.add("documento");
  // En el orden del formulario: el primero es adonde va el foco.
  const problemas = CAMPOS.map((c) => c.key).filter((k) => conProblema.has(k));

  return {
    /** Los pacientes que ya tienen la CI que se está escribiendo. */
    repetidos,
    otraPersona,
    setOtraPersona: (v: boolean) => setConfirmada(v ? clave : null),
    /** Los campos a marcar (después del primer intento de guardar). */
    problemas: intento ? problemas : [],
    /** El aviso a mostrar (después del primer intento): se actualiza solo a medida que se corrige. */
    mensaje: intento ? revision.mensaje ?? (sinConfirmar ? AVISO_CI_REPETIDA : null) : null,
    /** Llamar al guardar: `true` si se puede seguir; si no, marca los problemas y lleva el foco al primero. */
    validar: (): boolean => {
      if (problemas.length === 0) return true;
      setIntento(true);
      document.getElementById(`campo-${problemas[0]}`)?.focus();
      return false;
    },
  };
}
