/* «Procedimiento a realizar» de «Dar cita» (pedido de Camila, 8-oct-2026): qué se le va a hacer al paciente en la cita, para que se vea en
 * la agenda. Se eligen prestaciones pendientes de sus planes de tratamiento, del arancel (`BuscadorPrestacion`) o un motivo escrito a mano.
 * Se guardan en `Appointment.prestaciones`; el título de la cita pasa a ser la primera (+ « +N»). Marcar esas prestaciones como realizadas
 * al atender la cita queda fuera de este pedido. Módulo puro: tests en lib/prestacionesCita.test.ts. */
import type { Budget, BudgetItem, PrestacionCita } from "./types";

/** Título de la cita: la primera prestación y « +N» si hay más; sin ninguna, el de siempre (`porDefecto`). */
export function tituloDeCita(prestaciones: readonly PrestacionCita[] | undefined, porDefecto: string): string {
  if (!prestaciones || prestaciones.length === 0) return porDefecto;
  const resto = prestaciones.length - 1;
  return resto > 0 ? `${prestaciones[0].description} +${resto}` : prestaciones[0].description;
}

/** Los planes de tratamiento del paciente que siguen abiertos (ni anulados ni completados), de los doctores que la persona ve, con sus
 *  prestaciones pendientes. Los que no tienen nada pendiente no aparecen; los más nuevos, primero. */
export function planesParaCita(
  budgets: readonly Budget[],
  patientId: string,
  veDoctor: (dentistId: string) => boolean,
): { budget: Budget; items: BudgetItem[] }[] {
  if (!patientId) return [];
  return budgets
    .filter((b) => b.patientId === patientId && b.status !== "anulado" && b.status !== "completado" && veDoctor(b.dentistId))
    .map((budget) => ({ budget, items: budget.items.filter((i) => i.status === "pendiente") }))
    .filter((x) => x.items.length > 0)
    .sort((a, b) => b.budget.createdAt.localeCompare(a.budget.createdAt));
}

/** La prestación de un plan, como se guarda en la cita. Sin pieza no lleva el campo (Firestore no acepta `undefined`). */
export function prestacionDeItem(b: Budget, it: BudgetItem): PrestacionCita {
  return { cpt: it.cpt, description: it.description, ...(it.tooth ? { tooth: it.tooth } : {}), budgetId: b.id, itemId: it.id };
}

/** ¿Esa prestación del plan ya está elegida para la cita? */
export function estaTildado(prestaciones: readonly PrestacionCita[], budgetId: string, itemId: string): boolean {
  return prestaciones.some((p) => p.budgetId === budgetId && p.itemId === itemId);
}

/** Tilda (al final) o destilda una prestación de un plan. */
export function alternarItem(prestaciones: readonly PrestacionCita[], b: Budget, it: BudgetItem): PrestacionCita[] {
  return estaTildado(prestaciones, b.id, it.id)
    ? prestaciones.filter((p) => !(p.budgetId === b.id && p.itemId === it.id))
    : [...prestaciones, prestacionDeItem(b, it)];
}

/** El plan al que queda unida la cita: el de la primera prestación de un plan. Sin ninguna, el que ya traía (reagendar una cita de un plan
 *  la deja en su plan), salvo que ese plan viniera de prestaciones que ahora se destildaron. */
export function budgetIdDeCita(
  prestaciones: readonly PrestacionCita[],
  anterior: { budgetId?: string; prestaciones?: readonly PrestacionCita[] },
): string | undefined {
  const delPlan = prestaciones.find((p) => p.budgetId);
  if (delPlan) return delPlan.budgetId;
  if (anterior.prestaciones?.some((p) => p.budgetId)) return undefined;
  return anterior.budgetId;
}

/** «Resina compuesta — 1 superficie · pieza 16». */
export function textoPrestacion(p: PrestacionCita): string {
  return p.tooth ? `${p.description} · pieza ${p.tooth}` : p.description;
}

/** El nombre del plan, o «Plan de tratamiento» si no tiene. */
export function nombreDelPlan(b: Budget): string {
  return b.name?.trim() || "Plan de tratamiento";
}
