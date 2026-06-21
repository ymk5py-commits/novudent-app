"use client";
/** Pantalla "Análisis & Conversión de pacientes" (paridad Dentalink):
 *  embudo de conversión + tarjetas + línea temporal + 6 donuts demográficos. */
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { conversionFunnel, conversionTimeline } from "@/lib/conversion";
import { ageBucket, procedureCategory, CATEGORY_LABEL, GENDER_LABEL } from "@/lib/categorias";
import { PAYMENT_METHOD_LABEL } from "@/lib/budgets";
import { Download } from "lucide-react";
import { Card, inputCls } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import { FunnelChart, ConversionLineChart, StatusDonutChart } from "@/components/Charts";
import { Reveal } from "@/components/motion";

const PALETTE = ["#14A6C0", "#0E9F6E", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#64748B"];
const AGE_ORDER = ["<14", "15-20", "21-35", "36-50", "51-65", ">65", "Sin dato"];
const APPT_STATUS_LABEL: Record<string, string> = { confirmada: "Confirmada", pendiente: "Pendiente", completada: "Completada", cancelada: "Cancelada", ausente: "Ausente" };

function countBy<T>(items: T[], key: (x: T) => string): { label: string; v: number }[] {
  const m = new Map<string, number>();
  for (const it of items) { const k = key(it); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([label, v]) => ({ label, v }));
}
const withColors = (parts: { label: string; v: number }[]) =>
  parts.map((p, i) => ({ ...p, color: PALETTE[i % PALETTE.length] }));

export function AnalisisConversion() {
  const { db } = useStore();
  const today = new Date();
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [from, setFrom] = useState(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()).toISOString().slice(0, 10));

  const data = useMemo(() => {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to) + 86_399_000;
    const funnel = conversionFunnel(db.appointments, db.budgets, fromMs, toMs);
    const timeline = conversionTimeline(db.appointments, db.budgets, 12);

    const ageRaw = countBy(db.patients, (p) => ageBucket(p.birthDate));
    const ageParts = AGE_ORDER.map((b) => ({ label: b, v: ageRaw.find((c) => c.label === b)?.v ?? 0 })).filter((x) => x.v > 0);
    const genderParts = countBy(db.patients, (p) => (p.gender ? GENDER_LABEL[p.gender] : "Sin dato"));
    const cityParts = countBy(db.patients, (p) => p.city ?? "Sin dato");
    const payParts = countBy(db.payments, (p) => PAYMENT_METHOD_LABEL[p.method] ?? p.method);
    const items = db.budgets.flatMap((b) => b.items);
    const catParts = countBy(items, (it) => CATEGORY_LABEL[procedureCategory(it.cpt, db.procedures)]);
    const statusParts = countBy(db.appointments, (a) => APPT_STATUS_LABEL[a.status] ?? a.status);

    const donuts = [
      { title: "Edad", center: "PACIENTES", parts: withColors(ageParts) },
      { title: "Género", center: "PACIENTES", parts: withColors(genderParts) },
      { title: "Ciudad", center: "PACIENTES", parts: withColors(cityParts) },
      { title: "Medios de pago", center: "PAGOS", parts: withColors(payParts) },
      { title: "Categoría de acciones", center: "ÍTEMS", parts: withColors(catParts) },
      { title: "Estado de las citas", center: "CITAS", parts: withColors(statusParts) },
    ];
    return { funnel, timeline, donuts };
  }, [db, from, to]);

  const f = data.funnel;
  const stages = [
    { label: "Citas agendadas", value: f.agendadas, pct: 100, color: "#14A6C0" },
    { label: "Citas confirmadas", value: f.confirmadas, pct: f.pctConfirmadas, color: "#0E9F6E" },
    { label: "Presup. aceptados", value: f.aceptados, pct: f.pctAceptados, color: "#F59E0B" },
  ];
  const cards = [
    { label: "Citas agendadas", pct: 100, v: f.agendadas, color: "text-azure-600" },
    { label: "Citas confirmadas", pct: f.pctConfirmadas, v: f.confirmadas, color: "text-state-ok" },
    { label: "Presupuestos aceptados", pct: f.pctAceptados, v: f.aceptados, color: "text-state-warn" },
  ];

  const descargar = () => {
    const rows: (string | number)[][] = [
      ["Embudo de conversión", "Cantidad", "%"],
      ["Citas agendadas", f.agendadas, 100],
      ["Citas confirmadas", f.confirmadas, f.pctConfirmadas],
      ["Presupuestos aceptados", f.aceptados, f.pctAceptados],
      [],
      ["Donut", "Categoría", "Cantidad"],
      ...data.donuts.flatMap((d) => d.parts.map((p) => [d.title, p.label, p.v] as (string | number)[])),
    ];
    downloadCsv("analisis-conversion.csv", rows);
  };

  return (
    <Reveal className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-clinic-text">Conversión de pacientes</h2>
          <p className="text-[11px] text-clinic-muted">De la cita al presupuesto aceptado. El embudo usa el período; la línea, los últimos 12 meses.</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-auto`} />
          <span className="text-clinic-muted">→</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`${inputCls} w-auto`} />
          <button onClick={descargar} className="inline-flex items-center gap-1.5 rounded-xl border border-clinic-border px-3 py-1.5 text-xs font-bold text-clinic-text hover:border-azure-300 hover:text-azure-700"><Download className="h-3.5 w-3.5" /> Descargar</button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card className="p-5">
          <h3 className="mb-3 text-center text-xs font-extrabold uppercase tracking-wide text-clinic-muted">Conversión total del período</h3>
          <FunnelChart stages={stages} />
        </Card>
        <Card className="p-5">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-clinic-muted">Conversión a través del tiempo</h3>
          <ConversionLineChart data={data.timeline} />
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-5 text-center">
            <div className={`font-mono text-3xl font-extrabold ${c.color}`}>{c.pct}%</div>
            <div className="mt-1 text-xs font-bold uppercase tracking-wide text-clinic-muted">{c.label}</div>
            <div className="mt-1 font-mono text-sm font-bold text-clinic-text">{c.v.toLocaleString("es-PY")}</div>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-1 text-lg font-extrabold text-clinic-text">Datos genéricos de los pacientes</h2>
        <p className="mb-4 text-[11px] text-clinic-muted">Distribución demográfica y de comportamiento de la base de pacientes.</p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.donuts.map((d) => (
            <Card key={d.title} className="p-5">
              <h3 className="mb-3 text-sm font-extrabold text-clinic-text">{d.title}</h3>
              {d.parts.length === 0 ? (
                <p className="py-8 text-center text-sm text-clinic-muted">Sin datos.</p>
              ) : (
                <StatusDonutChart parts={d.parts} centerLabel={d.center} />
              )}
            </Card>
          ))}
        </div>
      </div>
    </Reveal>
  );
}
