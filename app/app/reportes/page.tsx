"use client";
/** Informes de gestión: KPIs de 30 días, producción y comisiones por profesional,
 *  tasa de aceptación de presupuestos, morosidad y reportes descargables (Excel/CSV). */
import { useMemo } from "react";
import { ShieldAlert, Download, TrendingUp, TrendingDown, Scale, FileSpreadsheet, Percent } from "lucide-react";
import { useStore, fmtGs, fmtDate, fullName } from "@/lib/store";
import { can } from "@/lib/rbac";
import { budgetTotal, patientBalance, PAYMENT_METHOD_LABEL } from "@/lib/budgets";
import { Card, Btn, Badge } from "@/components/ui";

/** Descarga CSV con BOM UTF-8 (abre directo en Excel) */
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const DAYS30 = 30 * 24 * 3600 * 1000;

export default function ReportsPage() {
  const { db, session } = useStore();

  const data = useMemo(() => {
    const since = Date.now() - DAYS30;
    const inWindow = (iso: string) => new Date(iso).getTime() >= since;

    const pays = db.payments.filter((p) => inWindow(p.date));
    const exps = db.expenses.filter((e) => inWindow(e.date));
    const collected = pays.reduce((s, p) => s + p.amount, 0);
    const spent = exps.reduce((s, e) => s + e.amount, 0);

    const presented = db.budgets.filter((b) => b.status !== "borrador" && b.status !== "anulado");
    const accepted = db.budgets.filter((b) => b.status === "aceptado" || b.status === "completado");
    const acceptRate = presented.length ? Math.round((accepted.length / presented.length) * 100) : 0;

    /* producción cobrada por profesional (pagos ligados a presupuestos del dentista) */
    const dentists = db.users.filter((u) => u.role === "dentist");
    const production = dentists.map((d) => {
      const collectedFor = pays
        .filter((p) => {
          const b = p.budgetId ? db.budgets.find((x) => x.id === p.budgetId) : undefined;
          return b?.dentistId === d.id;
        })
        .reduce((s, p) => s + p.amount, 0);
      const pct = d.commissionPct ?? 0;
      return { d, collected: collectedFor, pct, commission: Math.round((collectedFor * pct) / 100) };
    });
    const maxProd = Math.max(1, ...production.map((x) => x.collected));

    const debtors = db.patients
      .map((p) => ({ p, balance: patientBalance(p.id, db.budgets, db.payments) }))
      .filter((x) => x.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    return { pays, exps, collected, spent, presented, accepted, acceptRate, production, maxProd, debtors };
  }, [db]);

  if (!session) return null;
  if (!can(session.role, "billing.reports")) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-lg font-extrabold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">Los informes financieros son del <b>Administrador</b> y la <b>Asistente</b>.</p>
      </Card>
    );
  }

  const patientName = (id: string) => {
    const p = db.patients.find((x) => x.id === id);
    return p ? fullName(p) : "—";
  };

  const EXPORTS: { label: string; file: string; rows: () => (string | number)[][] }[] = [
    {
      label: "Pagos", file: "pagos.csv",
      rows: () => [
        ["Fecha", "Paciente", "Concepto", "Método", "Monto Gs", "Recibido por"],
        ...db.payments.map((p) => [p.date.slice(0, 10), patientName(p.patientId), p.concept, PAYMENT_METHOD_LABEL[p.method], p.amount, p.receivedBy]),
      ],
    },
    {
      label: "Gastos", file: "gastos.csv",
      rows: () => [
        ["Fecha", "Categoría", "Proveedor", "Descripción", "Monto Gs", "Registrado por"],
        ...db.expenses.map((e) => [e.date.slice(0, 10), e.category, e.supplier ?? "", e.description, e.amount, e.registeredBy]),
      ],
    },
    {
      label: "Presupuestos", file: "presupuestos.csv",
      rows: () => [
        ["Fecha", "Paciente", "Estado", "Ítems", "Descuento %", "Cuotas", "Total Gs"],
        ...db.budgets.map((b) => [b.createdAt.slice(0, 10), patientName(b.patientId), b.status, b.items.length, b.discountPct ?? 0, b.installments ?? 1, budgetTotal(b)]),
      ],
    },
    {
      label: "Comisiones", file: "comisiones.csv",
      rows: () => [
        ["Profesional", "Producción cobrada 30d Gs", "% Comisión", "Comisión Gs"],
        ...data.production.map((x) => [x.d.name, x.collected, x.pct, x.commission]),
      ],
    },
    {
      label: "Pacientes", file: "pacientes.csv",
      rows: () => [
        ["Nombre", "Apellido", "CI", "Teléfono", "Email", "Aseguradora", "Saldo Gs"],
        ...db.patients.map((p) => [p.firstName, p.lastName, p.document, p.phone, p.email ?? "", p.insurer ?? "", patientBalance(p.id, db.budgets, db.payments)]),
      ],
    },
    {
      label: "Citas", file: "citas.csv",
      rows: () => [
        ["Fecha", "Hora", "Paciente", "Profesional", "Título", "Estado", "Importe Gs"],
        ...db.appointments.map((a) => {
          const d = db.users.find((u) => u.id === a.dentistId);
          return [a.start.slice(0, 10), a.start.slice(11, 16), patientName(a.patientId), d?.name ?? "", a.title, a.status, a.amount - a.discount];
        }),
      ],
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-clinic-text">Informes de gestión</h1>
          <p className="text-sm text-clinic-muted">Resultados de los últimos 30 días + reportes descargables.</p>
        </div>
      </div>

      {/* KPIs 30 días */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-state-ok"><TrendingUp className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Cobrado 30d</span></div>
          <div className="mt-1 font-mono text-xl font-extrabold text-clinic-text">{fmtGs(data.collected)}</div>
          <div className="mt-1 text-[11px] text-clinic-muted">{data.pays.length} pagos</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-state-err"><TrendingDown className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Gastos 30d</span></div>
          <div className="mt-1 font-mono text-xl font-extrabold text-clinic-text">{fmtGs(data.spent)}</div>
          <div className="mt-1 text-[11px] text-clinic-muted">{data.exps.length} registros</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-azure-600"><Scale className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Resultado</span></div>
          <div className={`mt-1 font-mono text-xl font-extrabold ${data.collected - data.spent >= 0 ? "text-state-ok" : "text-state-err"}`}>{fmtGs(data.collected - data.spent)}</div>
          <div className="mt-1 text-[11px] text-clinic-muted">cobrado − gastos</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-azure-600"><Percent className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Aceptación</span></div>
          <div className="mt-1 font-mono text-xl font-extrabold text-clinic-text">{data.acceptRate}%</div>
          <div className="mt-1 text-[11px] text-clinic-muted">{data.accepted.length} de {data.presented.length} presupuestos</div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* producción + comisiones */}
        <Card className="p-5">
          <h2 className="font-extrabold text-clinic-text">Producción y comisiones por profesional</h2>
          <p className="text-[11px] text-clinic-muted">Pagos cobrados (30 días) sobre presupuestos de cada profesional.</p>
          <div className="mt-4 space-y-4">
            {data.production.map(({ d, collected, pct, commission }) => (
              <div key={d.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-bold text-clinic-text">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-mono text-xs font-extrabold">{fmtGs(collected)}</span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-clinic-bg">
                  <div className="h-full rounded-full bg-gradient-to-r from-azure-500 to-azure-600 transition-all duration-700" style={{ width: `${(collected / data.maxProd) * 100}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-clinic-muted">
                  <span>Comisión {pct}%</span>
                  <span className="font-mono font-bold text-state-ok">{fmtGs(commission)}</span>
                </div>
              </div>
            ))}
            {data.production.length === 0 && <p className="py-6 text-center text-sm text-clinic-muted">Sin profesionales activos.</p>}
          </div>
        </Card>

        {/* morosidad */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-clinic-text">Morosidad — saldos pendientes</h2>
            <Badge tone={data.debtors.length ? "warn" : "ok"}>{data.debtors.length}</Badge>
          </div>
          {data.debtors.length === 0 ? (
            <p className="py-8 text-center text-sm text-clinic-muted">🎉 Sin deudores.</p>
          ) : (
            <ul className="mt-3 divide-y divide-clinic-border">
              {data.debtors.map(({ p, balance }) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <a href={`/app/pacientes/${p.id}`} className="text-sm font-semibold text-clinic-text hover:text-azure-700">{fullName(p)}</a>
                  <span className="font-mono text-sm font-extrabold text-state-err">{fmtGs(balance)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 rounded-xl bg-clinic-bg p-3 text-[11px] text-clinic-muted">
            Las tareas de cobro con recordatorio por WhatsApp están en <a className="font-bold text-azure-700" href="/app/caja">Caja → Cuentas por cobrar</a>.
          </p>
        </Card>
      </div>

      {/* exportables */}
      <Card className="p-5">
        <div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Reportes descargables (Excel)</h2></div>
        <p className="text-[11px] text-clinic-muted">CSV con codificación UTF-8 — se abren directamente en Excel o Google Sheets.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {EXPORTS.map((x) => (
            <Btn key={x.file} variant="outline" onClick={() => downloadCsv(x.file, x.rows())}>
              <Download className="h-3.5 w-3.5" /> {x.label}
            </Btn>
          ))}
        </div>
      </Card>
    </div>
  );
}
