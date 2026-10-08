import type { LabOrder } from "./types";
import { fechaLocal } from "./tareas";

/* Órdenes de laboratorio: la fecha de envío y la de entrega son días de calendario.
 *
 * Las órdenes nuevas guardan el día tal cual (AAAA-MM-DD, como los vencimientos y el cobro
 * de cheques). Las viejas guardaron `new Date("AAAA-MM-DD").toISOString()`, que es la
 * medianoche UTC de ese día: en Paraguay (UTC−3) se leía como la noche anterior, la fecha
 * salía un día antes y una entrega para hoy figuraba «Vencida» desde que se cargaba. */

const MEDIANOCHE_UTC = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/;

/** El día de calendario (AAAA-MM-DD) de una fecha de la orden, sea nueva o de las viejas. */
export function diaDeLaOrden(valor: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const vieja = MEDIANOCHE_UTC.exec(valor);
  if (vieja) return vieja[1];
  return fechaLocal(new Date(valor));
}

/** ¿Pasó el día de entrega y la orden todavía no llegó? La que vence hoy no está vencida. */
export function ordenVencida(o: Pick<LabOrder, "dueAt" | "status">, ahora: Date = new Date()): boolean {
  return !!o.dueAt && o.status !== "entregado" && diaDeLaOrden(o.dueAt) < fechaLocal(ahora);
}
