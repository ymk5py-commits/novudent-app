import type { Prescription } from "./types";
import { escapeHtml } from "./html";

/* Recetas del paciente (paridad Dentalink: filtrar por tratamiento, «Mostrar anuladas» y en
 * cada receta Enviar · Imprimir · Duplicar · Anular). Una receta emitida no se borra: se
 * anula y queda en la ficha, que es un registro clínico. */

/** "todas" | "sin" (sin plan de tratamiento) | id de un plan. */
export type FiltroTratamiento = string;

export function recetasVisibles(list: readonly Prescription[], f: { tratamiento: FiltroTratamiento; mostrarAnuladas: boolean }): Prescription[] {
  return list.filter((rx) => {
    if (!f.mostrarAnuladas && rx.voidedAt) return false;
    if (f.tratamiento === "todas") return true;
    if (f.tratamiento === "sin") return !rx.budgetId;
    return rx.budgetId === f.tratamiento;
  });
}

export function anularReceta(rx: Prescription, ctx: { now: string; by: string }): Prescription {
  return rx.voidedAt ? rx : { ...rx, voidedAt: ctx.now, voidedBy: ctx.by };
}

/** Lo que se copia al duplicar: los medicamentos, las indicaciones y el tratamiento. */
export function baseDeDuplicado(rx: Prescription): Pick<Prescription, "items" | "notes" | "budgetId"> {
  return {
    items: rx.items.map((it) => ({ ...it })),
    ...(rx.notes ? { notes: rx.notes } : {}),
    ...(rx.budgetId ? { budgetId: rx.budgetId } : {}),
  };
}

/** La receta como correo al paciente. Todo el texto pasa por escapeHtml. */
export function recetaHtml(rx: Prescription, o: { clinica: string; paciente: string; fecha: string }): string {
  const items = rx.items.map((it) =>
    `<li style="margin:0 0 8px"><b>${escapeHtml(it.drug)}</b><br><span style="color:#555">${escapeHtml([it.dose, it.freq, it.days].filter(Boolean).join(" — "))}</span></li>`).join("");
  return `<div style="font-family:'Open Sans',Arial,sans-serif;font-size:14px;color:#333;max-width:560px">
<h2 style="font-size:16px;margin:0 0 4px">Receta</h2>
<p style="margin:0 0 16px;color:#666">${escapeHtml(o.clinica)} · ${escapeHtml(o.fecha)} · ${escapeHtml(rx.dentistName)}</p>
<p style="margin:0 0 12px">Hola ${escapeHtml(o.paciente)}: te enviamos la receta que te indicaron en la consulta.</p>
<div style="border:1px solid #e5e5e5;border-radius:4px;padding:12px 16px">
<div style="font-size:22px;font-weight:700;margin:0 0 6px">℞</div>
<ul style="list-style:none;margin:0;padding:0">${items}</ul>
${rx.notes ? `<p style="margin:10px 0 0;padding-top:8px;border-top:1px solid #e5e5e5;color:#555;white-space:pre-wrap">${escapeHtml(rx.notes)}</p>` : ""}
</div>
<p style="margin:16px 0 0;color:#666;font-size:12px">Ante cualquier duda sobre la medicación, consultá con tu odontólogo/a.</p>
</div>`;
}
