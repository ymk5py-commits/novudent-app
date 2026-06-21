"use client";
/** Informes de gestión: KPIs de 30 días, producción y comisiones por profesional,
 *  tasa de aceptación de presupuestos, morosidad y reportes descargables (Excel/CSV). */
import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, Download, TrendingUp, TrendingDown, Scale, FileSpreadsheet, Percent, Bot, Star } from "lucide-react";
import { useStore, fmtGs, fmtDate, fullName } from "@/lib/store";
import { can } from "@/lib/rbac";
import { budgetTotal, patientBalance, PAYMENT_METHOD_LABEL } from "@/lib/budgets";
import { Card, Btn, Badge } from "@/components/ui";
import { PlanLocked, useClinicPlan } from "@/components/PlanGate";
import { ReportsIAPanel } from "@/components/NovudentIA";
import { CashflowAreaChart, ProductionBarsChart } from "@/components/Charts";
import { AnalisisConversion } from "@/components/AnalisisConversion";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

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
  const [tab, setTab] = useState<"desempeno" | "analisis" | "excel">("desempeno");
  // Deep-link desde el menú (Reportes ▾): /app/reportes#analisis abre esa pestaña.
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace("#", "");
      if (h === "desempeno" || h === "analisis" || h === "excel") setTab(h);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const data = useMemo(() => {
    const since = Date.now() - DAYS30;
    const inWindow = (iso: string) => new Date(iso).getTime() >= since;

    const pays = db.payments.filter((p) => inWindow(p.date) && !p.voidedAt);
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

    /* flujo de caja diario (30 días): cobrado vs gastos */
    const cashflow = Array.from({ length: 30 }, (_, i) => {
      const day = new Date(since + (i + 1) * 24 * 3600 * 1000);
      const key = day.toISOString().slice(0, 10);
      return {
        d: day.toLocaleDateString("es-PY", { day: "2-digit", month: "short" }),
        cobrado: pays.filter((p) => p.date.slice(0, 10) === key).reduce((s, p) => s + p.amount, 0),
        gastos: exps.filter((e) => e.date.slice(0, 10) === key).reduce((s, e) => s + e.amount, 0),
      };
    });

    const debtors = db.patients
      .map((p) => ({ p, balance: patientBalance(p.id, db.budgets, db.payments) }))
      .filter((x) => x.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    /* NPS (encuestas respondidas vía Botika) */
    const surveys = db.patients.filter((p) => p.nps).map((p) => ({ p, ...p.nps! }));
    const prom = surveys.filter((s) => s.score >= 9).length;
    const pasv = surveys.filter((s) => s.score >= 7 && s.score <= 8).length;
    const detr = surveys.filter((s) => s.score <= 6).length;
    const npsScore = surveys.length ? Math.round(((prom - detr) / surveys.length) * 100) : null;

    return { pays, exps, collected, spent, presented, accepted, acceptRate, production, maxProd, cashflow, debtors, surveys, prom, pasv, detr, npsScore };
  }, [db]);

  const plan = useClinicPlan();
  if (!session) return null;
  if (!plan.features.includes("reportes")) return <PlanLocked feature="reportes" />;
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
    {
      label: "Inventario", file: "inventario.csv",
      rows: () => [
        ["Producto", "Categoría", "Stock", "Mínimo", "Costo Gs", "Valorización Gs"],
        ...db.stock.map((s) => [s.name, s.category, s.stock, s.minStock, s.cost, s.stock * s.cost]),
      ],
    },
    {
      label: "Laboratorios", file: "laboratorios.csv",
      rows: () => [
        ["Paciente", "Laboratorio", "Trabajo", "Enviado", "Vencimiento", "Costo Gs", "Estado"],
        ...db.labOrders.map((o) => [patientName(o.patientId), o.lab, o.workType, o.sentAt.slice(0, 10), o.dueAt?.slice(0, 10) ?? "", o.cost ?? 0, o.status]),
      ],
    },
  ];

  // Payload compacto para Reportes IA — agregados ya computados, nunca
  // la DB cruda. Nombres en español para que el modelo los entienda.
  const iaDatos = {
    ventana: "últimos 30 días",
    cobradoGs: data.collected,
    gastadoGs: data.spent,
    resultadoGs: data.collected - data.spent,
    presupuestos: {
      presentados: data.presented.length,
      aceptados: data.accepted.length,
      tasaAceptacionPct: data.acceptRate,
    },
    produccionPorProfesional: data.production.map((x) => ({
      nombre: x.d.name,
      cobradoGs: x.collected,
      comisionPct: x.pct,
      comisionGs: x.commission,
    })),
    morosos: data.debtors.slice(0, 10).map((x) => ({
      paciente: fullName(x.p),
      saldoGs: x.balance,
    })),
    nps: {
      score: data.npsScore,
      respuestas: data.surveys.length,
      promotores: data.prom,
      pasivos: data.pasv,
      detractores: data.detr,
    },
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-clinic-text">Informes de gestión</h1>
          <p className="text-sm text-clinic-muted">Resultados de los últimos 30 días + reportes descargables.</p>
        </div>
      </div>

      {/* Sub-pestañas estilo Dentalink */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-clinic-border bg-white p-1">
        {([["desempeno", "Panel de desempeño"], ["analisis", "Análisis de pacientes"], ["excel", "Reportes Excel"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${tab === k ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}>{label}</button>
        ))}
      </div>

      {tab === "analisis" && <AnalisisConversion />}

      {tab === "desempeno" && (
      <div className="space-y-5">
      {/* Novudent IA — pregúntale a tus datos */}
      <Reveal><ReportsIAPanel datos={iaDatos} /></Reveal>

      {/* KPIs 30 días */}
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem className="block h-full">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-state-ok"><TrendingUp className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Cobrado 30d</span></div>
          <div className="mt-1 font-mono text-xl font-extrabold text-clinic-text">{fmtGs(data.collected)}</div>
          <div className="mt-1 text-[11px] text-clinic-muted">{data.pays.length} pagos</div>
        </Card>
        </StaggerItem>
        <StaggerItem className="block h-full">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-state-err"><TrendingDown className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Gastos 30d</span></div>
          <div className="mt-1 font-mono text-xl font-extrabold text-clinic-text">{fmtGs(data.spent)}</div>
          <div className="mt-1 text-[11px] text-clinic-muted">{data.exps.length} registros</div>
        </Card>
        </StaggerItem>
        <StaggerItem className="block h-full">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-azure-600"><Scale className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Resultado</span></div>
          <div className={`mt-1 font-mono text-xl font-extrabold ${data.collected - data.spent >= 0 ? "text-state-ok" : "text-state-err"}`}>{fmtGs(data.collected - data.spent)}</div>
          <div className="mt-1 text-[11px] text-clinic-muted">cobrado − gastos</div>
        </Card>
        </StaggerItem>
        <StaggerItem className="block h-full">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-azure-600"><Percent className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Aceptación</span></div>
          <div className="mt-1 font-mono text-xl font-extrabold text-clinic-text">{data.acceptRate}%</div>
          <div className="mt-1 text-[11px] text-clinic-muted">{data.accepted.length} de {data.presented.length} presupuestos</div>
        </Card>
        </StaggerItem>
      </Stagger>

      {/* flujo de caja 30 días — cobrado vs gastos */}
      <Reveal>
      <Card className="p-5">
        <h2 className="font-extrabold text-clinic-text">Flujo de caja — últimos 30 días</h2>
        <p className="text-[11px] text-clinic-muted">Cobros y gastos por día. Pasá el mouse para ver el detalle.</p>
        <div className="mt-4">
          <CashflowAreaChart data={data.cashflow} />
        </div>
      </Card>
      </Reveal>

      <Reveal className="grid gap-5 lg:grid-cols-2">
        {/* producción + comisiones */}
        <Card className="p-5">
          <h2 className="font-extrabold text-clinic-text">Producción y comisiones por profesional</h2>
          <p className="text-[11px] text-clinic-muted">Pagos cobrados (30 días) sobre presupuestos de cada profesional.</p>
          <div className="mt-4">
            <ProductionBarsChart data={data.production.map((x) => ({ name: x.d.name, v: x.collected, color: x.d.color }))} />
            <div className="mt-2 space-y-1.5">
              {data.production.map(({ d, pct, commission }) => (
                <div key={d.id} className="flex items-center justify-between text-[11px] text-clinic-muted">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                    {d.name} · comisión {pct}%
                  </span>
                  <span className="font-mono font-bold text-state-ok">{fmtGs(commission)}</span>
                </div>
              ))}
            </div>
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
      </Reveal>

      {/* NPS — encuestas vía Botika */}
      <Reveal>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-azure-600" />
            <h2 className="font-extrabold text-clinic-text">Encuestas NPS</h2>
            <Badge tone="info" tip="Las encuestas las hace Botika por WhatsApp al completar cada tratamiento">
              <span className="inline-flex items-center gap-1"><Bot className="h-3 w-3" /> vía Botika</span>
            </Badge>
          </div>
          <a href="/app/integraciones" className="text-xs font-bold text-azure-700 hover:underline">Configurar →</a>
        </div>
        {data.npsScore === null ? (
          <p className="py-6 text-center text-sm text-clinic-muted">Aún no hay encuestas respondidas. Botika las envía automáticamente al completar tratamientos.</p>
        ) : (
          <div className="mt-4 grid gap-5 lg:grid-cols-[180px_1fr]">
            <div className="rounded-2xl bg-navy-800 p-5 text-center text-white">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-azure-200">NPS</div>
              <div className="mt-1 font-mono text-4xl font-extrabold">{data.npsScore > 0 ? `+${data.npsScore}` : data.npsScore}</div>
              <div className="mt-1 text-[11px] text-white/60">{data.surveys.length} encuesta{data.surveys.length !== 1 && "s"}</div>
            </div>
            <div>
              {/* barra apilada */}
              <div className="flex h-4 overflow-hidden rounded-full bg-clinic-bg">
                {data.prom > 0 && <div className="bg-state-ok transition-all duration-700" style={{ width: `${(data.prom / data.surveys.length) * 100}%` }} title={`Promotores: ${data.prom}`} />}
                {data.pasv > 0 && <div className="bg-state-warn transition-all duration-700" style={{ width: `${(data.pasv / data.surveys.length) * 100}%` }} title={`Pasivos: ${data.pasv}`} />}
                {data.detr > 0 && <div className="bg-state-err transition-all duration-700" style={{ width: `${(data.detr / data.surveys.length) * 100}%` }} title={`Detractores: ${data.detr}`} />}
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-clinic-muted">
                <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-state-ok" />Promotores (9-10): <b>{data.prom}</b></span>
                <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-state-warn" />Pasivos (7-8): <b>{data.pasv}</b></span>
                <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-state-err" />Detractores (0-6): <b>{data.detr}</b></span>
              </div>
              {/* últimos comentarios */}
              <div className="mt-3 space-y-1.5">
                {data.surveys
                  .filter((s) => s.comment)
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .slice(0, 3)
                  .map((s) => (
                    <p key={s.p.id} className="rounded-xl bg-clinic-bg px-3 py-2 text-xs text-clinic-muted">
                      <b className="font-mono text-clinic-text">{s.score}/10</b> — “{s.comment}” · <a href={`/app/pacientes/${s.p.id}`} className="font-bold text-azure-700 hover:underline">{fullName(s.p)}</a>
                    </p>
                  ))}
              </div>
            </div>
          </div>
        )}
      </Card>
      </Reveal>

      </div>
      )}

      {tab === "excel" && (
      <div className="space-y-5">
      {/* exportables */}
      <Reveal>
      <Card className="p-5">
        <div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Reportes descargables (Excel)</h2></div>
        <p className="text-[11px] text-clinic-muted">CSV con codificación UTF-8 — se abren directamente en Excel o Google Sheets.</p>
        <div className="mt-4 space-y-4">
          {(() => {
            const CAT: Record<string, string> = { Pagos: "Finanzas", Gastos: "Finanzas", Presupuestos: "Finanzas", Comisiones: "Nóminas", Pacientes: "Pacientes", Citas: "Pacientes", Inventario: "Inventario", Laboratorios: "Laboratorios" };
            const ORDER = ["Finanzas", "Pacientes", "Inventario", "Laboratorios", "Nóminas"];
            return ORDER.map((cat) => {
              const xs = EXPORTS.filter((x) => (CAT[x.label] ?? "Otros") === cat);
              if (!xs.length) return null;
              return (
                <div key={cat}>
                  <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-clinic-muted">{cat}</div>
                  <div className="flex flex-wrap gap-2">
                    {xs.map((x) => (
                      <Btn key={x.file} variant="outline" onClick={() => downloadCsv(x.file, x.rows())}>
                        <Download className="h-3.5 w-3.5" /> {x.label}
                      </Btn>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </Card>
      </Reveal>
      </div>
      )}
    </div>
  );
}
