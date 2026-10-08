import type { Patient } from "./types";
import { claveDeCI } from "./camposPaciente";

/* Importación de pacientes (Configuración › Migración): qué filas del archivo se cargan y cuáles se saltean.
 * Se compara por CI sin importar cómo esté escrita («3.456.789» = «3456789»), y solo si la CI sirve para reconocer a
 * alguien (`claveDeCI`): las filas sin CI, con «s/d» o con ceros se cargan todas, porque no se pueden confundir entre sí. */

export interface PlanDeImportacion<T> {
  /** Se cargan. */
  nuevos: T[];
  /** Su CI ya la tiene un paciente de la clínica: se saltean. */
  yaExisten: T[];
  /** Su CI ya apareció más arriba en el mismo archivo: se saltean (la primera se queda). */
  repetidos: T[];
}

export function planificarImportacion<T extends { patient: Pick<Patient, "document"> }>(
  filas: readonly T[],
  existentes: readonly Pick<Patient, "document">[],
): PlanDeImportacion<T> {
  const enLaClinica = new Set(existentes.map((p) => claveDeCI(p.document)).filter((k): k is string => k !== null));
  const vistas = new Set<string>();
  const plan: PlanDeImportacion<T> = { nuevos: [], yaExisten: [], repetidos: [] };
  for (const fila of filas) {
    const clave = claveDeCI(fila.patient.document);
    if (clave !== null && enLaClinica.has(clave)) plan.yaExisten.push(fila);
    else if (clave !== null && vistas.has(clave)) plan.repetidos.push(fila);
    else {
      if (clave !== null) vistas.add(clave);
      plan.nuevos.push(fila);
    }
  }
  return plan;
}
