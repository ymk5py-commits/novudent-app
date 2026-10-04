"use client";
/** Lista de prestaciones del plan agrupada por sección (paridad Dentalink):
 *  columnas Prestación / Pieza / Dscto / Precio / Pago (estado por fila).
 *  Sin money.view (roles v3) se ocultan descuento, precio y total. */
import { Fragment } from "react";
import { CircleCheck, ShoppingCart } from "lucide-react";
import { fmtGs } from "@/lib/store";
import { budgetInteres, budgetTotal } from "@/lib/budgets";
import { useAlcance } from "@/lib/useAlcance";
import type { Budget, BudgetItem } from "@/lib/types";
import { Card, Empty } from "@/components/ui";

export function PrestacionesList({ budget }: { budget: Budget }) {
  const verMontos = useAlcance().puede("money.view");
  if (budget.items.length === 0) return <Empty title="Sin prestaciones" desc="Las prestaciones del plan aparecerán acá." />;

  const sections = new Map<string, BudgetItem[]>();
  for (const it of budget.items) {
    const s = it.section || "Sección sin nombre";
    if (!sections.has(s)) sections.set(s, []);
    sections.get(s)!.push(it);
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className={`w-full text-sm ${verMontos ? "min-w-[620px]" : "min-w-[420px]"}`}>
        <thead>
          <tr className="border-b border-clinic-border text-left text-[13px] font-bold text-clinic-text">
            <th className="px-4 py-2">Prestación</th>
            <th className="px-2 py-2">Pieza</th>
            {verMontos && <th className="px-2 py-2 text-right">Dscto</th>}
            {verMontos && <th className="px-2 py-2 text-right">Precio</th>}
            <th className="px-2 py-2 text-center">Pago</th>
          </tr>
        </thead>
        <tbody>
          {[...sections.entries()].map(([name, items]) => (
            <Fragment key={name}>
              <tr className="bg-clinic-bg/60">
                <td colSpan={verMontos ? 5 : 3} className="px-4 py-2 text-[13px] font-semibold text-clinic-muted">{name}</td>
              </tr>
              {items.map((it) => {
                const dscto = it.discountPct ?? budget.discountPct ?? 0;
                const done = it.status === "realizado";
                return (
                  <tr key={it.id} className="border-b border-clinic-border last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="tabular-nums text-[11px] text-clinic-muted">{it.cpt}</span>{" "}
                      <span className="text-clinic-text">{it.description}</span>
                    </td>
                    <td className="px-2 py-2.5 text-clinic-muted">{it.tooth ?? "—"}</td>
                    {verMontos && <td className="px-2 py-2.5 text-right text-clinic-muted">{dscto ? `${dscto}%` : "—"}</td>}
                    {verMontos && <td className="px-2 py-2.5 text-right tabular-nums">{fmtGs(it.price)}</td>}
                    <td className="px-2 py-2.5 text-center" title={done ? "Realizado" : "Pendiente"}>
                      {done ? <CircleCheck className="mx-auto h-4 w-4 text-state-ok" /> : <ShoppingCart className="mx-auto h-4 w-4 text-state-err" />}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
        {verMontos && (
          <tfoot>
            {budgetInteres(budget) > 0 && (
              <tr className="border-t border-clinic-border text-clinic-muted">
                <td colSpan={3} className="px-4 py-2 text-right text-sm">Interés por financiamiento</td>
                <td className="px-2 py-2 text-right tabular-nums text-sm">{fmtGs(budgetInteres(budget))}</td>
                <td />
              </tr>
            )}
            <tr className="border-t border-clinic-border">
              <td colSpan={3} className="px-4 py-3 text-right text-sm font-bold text-clinic-text">Total{budget.discountPct ? ` (−${budget.discountPct}%${budgetInteres(budget) > 0 ? " + interés" : ""})` : budgetInteres(budget) > 0 ? " (+ interés)" : ""}</td>
              <td className="px-2 py-2 text-right tabular-nums text-base font-bold text-clinic-text">{fmtGs(budgetTotal(budget))}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </Card>
  );
}
