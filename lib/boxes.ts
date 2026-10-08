import type { Appointment } from "./types";
import { fechaLocal } from "./tareas";

/* Boxes (sillones): qué pasa con las citas cuando se borra uno, y en qué día cae cada cita. */

/** Las citas que tienen este box, de cualquier día. */
export function citasDelBox(citas: Appointment[], boxId: string): number {
  return citas.filter((c) => c.boxId === boxId).length;
}

/** Las citas de este box ya sin box. Se guarda `""` y no se saca el campo: Firestore (setDoc con
 *  merge) no borra lo que falta, y un `boxId` que apunta a un box que ya no existe dejaba la cita
 *  contando en el día pero sin columna donde verla. */
export function citasSinBox(citas: Appointment[], boxId: string): Appointment[] {
  return citas.filter((c) => c.boxId === boxId).map((c) => ({ ...c, boxId: "" }));
}

/** El día (AAAA-MM-DD) en que cae una cita, en hora local. Las citas del panel guardan un
 *  instante UTC y las de la reserva online la hora local sin zona; cortar el texto en 10
 *  caracteres daba el día equivocado a la noche (a las 22:30 ya es «mañana» en UTC). */
export function diaDeLaCita(start: string): string {
  return fechaLocal(new Date(start));
}
