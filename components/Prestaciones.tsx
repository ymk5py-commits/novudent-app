"use client";
/** Lista de prestaciones del plan agrupada por sección (paridad Dentalink):
 *  columnas Prestación / Pieza / Dscto / Precio / Pago (estado por fila). */
import { Fragment } from "react";
import { CircleCheck, ShoppingCart } from "lucide-react";
import { fmtGs } from "@/lib/store";
import { budgetTotal } from "@/lib/budgets";
import type { Budget, BudgetItem } from "@/lib/types";
import { Card, Empty } from "@/components/ui";

export function PrestacionesList({ budget }: { budget: Budget }) {
  if (budget.items.length === 0) return <Empty title="Sin prestaciones" desc="Las prestaciones del plan aparecerán acá." />;

  const sections = new Map<string, BudgetItem[]>();
  for (const it of budget.items) {
    const s = it.section || "Sección sin nombre";
    if (!sections.has(s)) sections.set(s, []);
    sections.get(s)!.push(it);
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
            <th className="px-4 py-3">Prestación</th>
            <th className="px-2 py-3">Pieza</th>
            <th className="px-2 py-3 text-right">Dscto</th>
            <th className="px-2 py-3 text-right">Precio</th>
            <th className="px-2 py-3 text-center">Pago</th>
          </tr>
        </thead>
        <tbody>
          {[...sections.entries()].map(([name, items]) => (
            <Fragment key={name}>
              <tr className="bg-clinic-bg/60">
                <td colSpan={5} className="px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-clinic-muted">{name}</td>
              </tr>
              {items.map((it) => {
                const dscto = it.discountPct ?? budget.discountPct ?? 0;
                const done = it.status === "realizado";
                return (
                  <tr key={it.id} className="border-b border-clinic-border last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[11px] text-clinic-muted">{it.cpt}</span>{" "}
                      <span className="text-clinic-text">{it.description}</span>
                    </td>
                    <td className="px-2 py-2.5 text-clinic-muted">{it.tooth ?? "—"}</td>
                    <td className="px-2 py-2.5 text-right text-clinic-muted">{dscto ? `${dscto}%` : "—"}</td>
                    <td className="px-2 py-2.5 text-right font-mono">{fmtGs(it.price)}</td>
                    <td className="px-2 py-2.5 text-center" title={done ? "Realizado" : "Pendiente"}>
                      {done ? <CircleCheck className="mx-auto h-4 w-4 text-state-ok" /> : <ShoppingCart className="mx-auto h-4 w-4 text-state-err" />}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-clinic-border">
            <td colSpan={3} className="px-4 py-3 text-right text-sm font-bold text-clinic-text">Total{budget.discountPct ? ` (−${budget.discountPct}%)` : ""}</td>
            <td className="px-2 py-3 text-right font-mono text-base font-extrabold text-clinic-text">{fmtGs(budgetTotal(budget))}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}
