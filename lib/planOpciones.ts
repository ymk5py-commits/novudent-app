import type { Budget } from "./types";
import { budgetDescuento, budgetInteres, budgetTotal, installmentValue } from "./budgets";
import { PERIODICIDAD_LABEL } from "./financiamiento";
import { escapeHtml } from "./html";

/* Opciones del plan de tratamiento (paridad Dentalink: «Opciones ▾»). Lógica pura: cada
 * función devuelve el plan nuevo con su línea en el historial; la pantalla solo guarda. */

type Ctx = { now: string; by: string };

const conHistoria = (b: Budget, action: string, ctx: Ctx): Budget["history"] => [...b.history, { at: ctx.now, action, by: ctx.by }];

/** Copia de un plan para volver a presentarlo: mismas prestaciones, todas pendientes, en
 *  borrador y sin lo que es propio del original (cuotas, financiamiento, negociación, fotos). */
export function duplicarPlan(b: Budget, o: { id: string } & Ctx): Budget {
  const base = b.name?.trim() || (b.planType === "ortodoncia" ? "Ortodoncia" : "Plan general");
  return {
    id: o.id,
    clinicId: b.clinicId,
    patientId: b.patientId,
    dentistId: b.dentistId,
    createdAt: o.now,
    status: "borrador",
    name: `${base} (copia)`,
    ...(b.planType ? { planType: b.planType } : {}),
    ...(b.discountPct ? { discountPct: b.discountPct } : {}),
    ...(b.convenio ? { convenio: b.convenio } : {}),
    ...(b.notes ? { notes: b.notes } : {}),
    ...(b.patientComments ? { patientComments: b.patientComments } : {}),
    items: b.items.map((i, k) => ({
      id: `${o.id}_i${k + 1}`,
      cpt: i.cpt,
      description: i.description,
      ...(i.tooth ? { tooth: i.tooth } : {}),
      price: i.price,
      ...(i.section ? { section: i.section } : {}),
      ...(i.discountPct !== undefined ? { discountPct: i.discountPct } : {}),
      status: "pendiente" as const,
    })),
    history: [{ at: o.now, action: `Duplicado del plan #${b.id}`, by: o.by }],
  };
}

/** Cuántas prestaciones del plan quedan sin realizar (para avisar antes de finalizar). */
export const pendientesDe = (b: Pick<Budget, "items">): number => b.items.filter((i) => i.status !== "realizado").length;

/** Finaliza el plan: pasa a «Completado» y sale de «En ejecución». */
export function finalizarPlan(b: Budget, ctx: Ctx): Budget {
  const p = pendientesDe(b);
  return { ...b, status: "completado", history: conHistoria(b, p > 0 ? `Plan finalizado con ${p} prestación${p === 1 ? "" : "es"} sin realizar` : "Plan finalizado", ctx) };
}

/** Reabre un plan finalizado: vuelve a «En ejecución». */
export function reabrirPlan(b: Budget, ctx: Ctx): Budget {
  return { ...b, status: "aceptado", history: conHistoria(b, "Plan reabierto", ctx) };
}

/** Cambia el profesional a cargo del plan. */
export function cambiarProfesional(b: Budget, dentistId: string, nombres: { antes: string; despues: string }, ctx: Ctx): Budget {
  if (dentistId === b.dentistId) return b;
  return { ...b, dentistId, history: conHistoria(b, `Profesional a cargo: ${nombres.antes} → ${nombres.despues}`, ctx) };
}

export type ModoEnvio = "completo" | "solo_total" | "sin_detalle";

export const MODO_ENVIO_LABEL: Record<ModoEnvio, string> = {
  completo: "Presupuesto completo",
  solo_total: "Solo el total",
  sin_detalle: "Sin detalle de precios",
};

/** Prefijo de la entrada de historial que deja cada envío (así se arma «Ver historial de envíos»). */
export const ENVIO_PREFIJO = "Presupuesto enviado por e-mail";

/** Deja constancia de un envío del presupuesto en el historial del plan. */
export function registrarEnvio(b: Budget, modo: ModoEnvio, email: string, ctx: Ctx): Budget {
  return { ...b, history: conHistoria(b, `${ENVIO_PREFIJO} · ${MODO_ENVIO_LABEL[modo]} · ${email}`, ctx) };
}

/** Envíos del presupuesto, del más reciente al más viejo. */
export function enviosDe(b: Pick<Budget, "history">): { at: string; by: string; detalle: string }[] {
  return b.history
    .filter((h) => h.action.startsWith(ENVIO_PREFIJO))
    .map((h) => ({ at: h.at, by: h.by, detalle: h.action.slice(ENVIO_PREFIJO.length).replace(/^ · /, "") }))
    .reverse();
}

/** HTML del presupuesto para el correo. `fmt` formatea montos en la moneda de la clínica. */
export function presupuestoHtml(b: Budget, modo: ModoEnvio, o: { clinica: string; paciente: string; profesional: string; fmt: (n: number) => string }): string {
  const nombre = b.name?.trim() || (b.planType === "ortodoncia" ? "Tratamiento de ortodoncia" : "Plan de tratamiento");
  const td = 'style="padding:6px 0;border-bottom:1px solid #e5e5e5"';
  const filas = modo === "solo_total" ? "" : b.items.map((i) =>
    `<tr><td ${td}>${escapeHtml(i.description)}${i.tooth ? ` <span style="color:#666">(pieza ${escapeHtml(i.tooth)})</span>` : ""}</td>${modo === "completo" ? `<td ${td} align="right">${escapeHtml(o.fmt(i.price))}</td>` : ""}</tr>`).join("");
  const linea = (texto: string) => `<p style="margin:6px 0 0;text-align:right;color:#666">${texto}</p>`;
  const descuento = budgetDescuento(b);
  const interes = budgetInteres(b);
  const detalle = modo === "solo_total" ? "" : [
    modo === "completo" && descuento > 0 ? linea(`Descuento ${escapeHtml(String(b.discountPct))}%: − ${escapeHtml(o.fmt(descuento))}`) : "",
    interes > 0 ? linea(`Interés por financiamiento: ${escapeHtml(o.fmt(interes))}`) : "",
  ].join("");
  const f = b.financiamiento;
  const cuota = installmentValue(b);
  const formaDePago = modo !== "solo_total" && f && cuota !== null
    ? `<p style="margin:12px 0 0">Forma de pago: ${f.pie > 0 ? `pie de ${escapeHtml(o.fmt(f.pie))} y ` : ""}${f.cuotas} cuota${f.cuotas === 1 ? "" : "s"} ${escapeHtml(PERIODICIDAD_LABEL[f.periodicidad].toLowerCase())} de ${escapeHtml(o.fmt(cuota))}.</p>` : "";
  return `<div style="font-family:'Open Sans',Arial,sans-serif;font-size:14px;color:#333;max-width:560px">
<h2 style="font-size:16px;margin:0 0 4px">${escapeHtml(nombre)}</h2>
<p style="margin:0 0 16px;color:#666">${escapeHtml(o.clinica)} · ${escapeHtml(o.profesional)}</p>
<p style="margin:0 0 12px">Hola ${escapeHtml(o.paciente)}: te enviamos tu presupuesto.</p>
${filas ? `<table style="width:100%;border-collapse:collapse">${filas}</table>` : ""}
${detalle}
<p style="margin:12px 0 0;text-align:right;font-weight:700">Total: ${escapeHtml(o.fmt(budgetTotal(b)))}</p>
${formaDePago}
${b.patientComments ? `<p style="margin:16px 0 0;white-space:pre-wrap">${escapeHtml(b.patientComments)}</p>` : ""}
</div>`;
}
