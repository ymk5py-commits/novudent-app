"use client";

/** Hoja del plan de tratamiento. Se monta fuera del panel para que sus
 * animaciones, columnas y contenedores con overflow no recorten el PDF. */
import { PrintLetterhead, PrintPortal } from "@/components/PrintDocument";
import { budgetBalance, budgetDescuento, budgetInteres, budgetPaid, budgetSubtotal, budgetTotal, installmentValue, BUDGET_STATUS_INFO } from "@/lib/budgets";
import { fmtGs, fullName } from "@/lib/store";
import type { Budget, BudgetItem, Clinic, Patient, Payment } from "@/lib/types";

type Props = {
  budget: Budget;
  clinic: Clinic;
  patient: Patient;
  professional?: string;
  payments: Payment[];
  showFinancials: boolean;
  showPersonal: boolean;
};

const date = (value: string) => new Date(value).toLocaleDateString("es-PY", { day: "2-digit", month: "long", year: "numeric" });

export function PlanPrintDocument(props: Props) {
  return <PrintPortal><Document {...props} /></PrintPortal>;
}

function Document({ budget, clinic, patient, professional, payments, showFinancials, showPersonal }: Props) {
  const sections = new Map<string, BudgetItem[]>();
  for (const item of budget.items) {
    const section = item.section?.trim() || "Prestaciones";
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section)!.push(item);
  }

  const subtotal = budgetSubtotal(budget);
  const total = budgetTotal(budget);
  const paid = budgetPaid(budget.id, payments);
  const balance = Math.max(0, budgetBalance(budget, payments));
  const installment = installmentValue(budget);
  const title = budget.name?.trim() || (budget.planType === "ortodoncia" ? "Tratamiento de ortodoncia" : "Plan general");

  return (
    <div className="plan-print-root" aria-hidden="true" data-testid="plan-print-document">
      <article className="plan-print-sheet">
        <PrintLetterhead clinic={clinic} label="PLAN DE TRATAMIENTO" />

        <section className="plan-print-intro">
          <div>
            <span className="plan-print-eyebrow">PROPUESTA CLÍNICA · N.º {budget.id}</span>
            <h1>{title}</h1>
            <p>Detalle de las prestaciones previstas para este tratamiento.</p>
          </div>
          <span className="plan-print-status">{BUDGET_STATUS_INFO[budget.status].label}</span>
        </section>

        <section className="plan-print-details" aria-label="Datos del plan">
          <div><span>Paciente</span><strong>{fullName(patient)}</strong></div>
          {showPersonal && patient.document && <div><span>Documento</span><strong>{patient.document}</strong></div>}
          <div><span>Profesional</span><strong>{professional || "—"}</strong></div>
          <div><span>Fecha de emisión</span><strong>{date(budget.createdAt)}</strong></div>
          {budget.dueDate && <div><span>Válido hasta</span><strong>{date(budget.dueDate)}</strong></div>}
        </section>

        <section className="plan-print-services" aria-label="Prestaciones del tratamiento">
          <div className="plan-print-section-title">
            <h2>Prestaciones</h2>
            <span>{budget.items.length} {budget.items.length === 1 ? "prestación" : "prestaciones"}</span>
          </div>
          <table className={showFinancials ? "" : "plan-print-no-money"}>
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Pieza</th>
                {showFinancials && <th className="plan-print-money">Importe</th>}
              </tr>
            </thead>
            <tbody>
              {[...sections.entries()].map(([section, items]) => (
                <SectionRows key={section} section={section} items={items} showFinancials={showFinancials} />
              ))}
              {budget.items.length === 0 && <tr><td colSpan={showFinancials ? 3 : 2} className="plan-print-empty">Aún no se cargaron prestaciones.</td></tr>}
            </tbody>
          </table>
        </section>

        {showFinancials && (
          <section className="plan-print-finance" aria-label="Resumen del presupuesto">
            <div className="plan-print-finance-label">
              <span>INVERSIÓN EN TU SALUD</span>
              <p>Importes del plan en la moneda de la clínica.</p>
            </div>
            <div className="plan-print-totals">
              <div><span>Subtotal</span><strong>{fmtGs(subtotal)}</strong></div>
              {(budget.discountPct ?? 0) > 0 && <div><span>Descuento {budget.discountPct}%{budget.convenio ? ` · ${budget.convenio}` : ""}</span><strong>− {fmtGs(budgetDescuento(budget))}</strong></div>}
              {budgetInteres(budget) > 0 && <div><span>Interés por financiamiento</span><strong>{fmtGs(budgetInteres(budget))}</strong></div>}
              <div className="plan-print-grand-total"><span>Total del plan</span><strong>{fmtGs(total)}</strong></div>
              {installment !== null && <div><span>{budget.financiamiento ? `Financiado${budget.financiamiento.pie > 0 ? ` · pie ${fmtGs(budget.financiamiento.pie)} +` : ":"} ${budget.financiamiento.cuotas} cuotas` : `Opción en ${budget.installments} cuotas`}</span><strong>{fmtGs(installment)} / cuota</strong></div>}
              {paid > 0 && <div><span>Abonado</span><strong>{fmtGs(paid)}</strong></div>}
              {paid > 0 && <div><span>Saldo pendiente</span><strong>{fmtGs(balance)}</strong></div>}
            </div>
          </section>
        )}

        {budget.patientComments?.trim() && (
          <section className="plan-print-comments">
            <h2>Indicaciones y observaciones</h2>
            <p>{budget.patientComments.trim()}</p>
          </section>
        )}

        <footer className="plan-print-footer">
          <span>Documento emitido por {clinic.name} con Novudent.</span>
          <span>Plan N.º {budget.id}</span>
        </footer>
      </article>
    </div>
  );
}

function SectionRows({ section, items, showFinancials }: { section: string; items: BudgetItem[]; showFinancials: boolean }) {
  return (
    <>
      <tr className="plan-print-group"><td colSpan={showFinancials ? 3 : 2}>{section}</td></tr>
      {items.map((item) => (
        <tr key={item.id}>
          <td><strong>{item.description}</strong>{item.cpt && <span className="plan-print-code">{item.cpt}</span>}</td>
          <td>{item.tooth || "—"}</td>
          {showFinancials && <td className="plan-print-money">{fmtGs(item.price)}</td>}
        </tr>
      ))}
    </>
  );
}
