import type { Installment } from "./types";

export interface InstallmentStatus {
  numero: number;
  dueDate: string;
  amount: number;
  pagado: number;
  saldo: number;
}

/** Estado de cada cuota: aloca el total pagado del plan en cascada (cuota 1, 2, …).
 *  Puro; el excedente no genera saldo negativo. */
export function installmentStatus(schedule: Installment[], totalPaid: number): InstallmentStatus[] {
  let rem = Math.max(0, totalPaid);
  return schedule.map((c) => {
    const pagado = Math.min(rem, c.amount);
    rem -= pagado;
    return { numero: c.numero, dueDate: c.dueDate, amount: c.amount, pagado, saldo: c.amount - pagado };
  });
}
