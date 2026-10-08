import type { Appointment } from "./types";

/* Consultas puras sobre una lista de citas, para las pantallas que las muestran (ficha del paciente, agenda).
 * Nada acá toca el store ni la fecha del sistema: «ahora» y «desde» se pasan, así se prueba con cualquier día. */

const inicio = (a: Pick<Appointment, "start">): number => Date.parse(a.start);

/** «Próximas citas» de la ficha (Resumen): las que todavía no empezaron, de la más cercana a la más lejana, y sin las anuladas.
 *  Una cita anulada no es una cita próxima: el paciente no viene. (Antes salían también, con la etiqueta «Anulado», y como la lista
 *  de la ficha viene de la más nueva a la más vieja, las cuatro que se mostraban eran las más lejanas y no las más cercanas.) */
export function proximasCitas<T extends Pick<Appointment, "start" | "status">>(citas: readonly T[], ahora: Date, max = 4): T[] {
  return citas
    .filter((a) => a.status !== "cancelada" && inicio(a) >= ahora.getTime())
    .sort((a, b) => inicio(a) - inicio(b))
    .slice(0, max);
}
