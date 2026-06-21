"use client";
/** Pantalla "Análisis & Conversión de pacientes" (paridad 1:1 Dentalink):
 *  encabezados cian centrados + rombo · embudo + línea temporal · tarjetas de
 *  color · 6 donuts demográficos con leyenda debajo. */
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { conversionFunnel, conversionTimeline } from "@/lib/conversion";
import { ageBucket, procedureCategory, CATEGORY_LABEL, GENDER_LABEL } from "@/lib/categorias";
import { PAYMENT_METHOD_LABEL } from "@/lib/budgets";
import { Download, Search, RefreshCw } from "lucide-react";
import { Card, inputCls } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import { FunnelChart, ConversionLineChart } from "@/components/Charts";
import { Reveal } from "@/components/motion";

const PALETTE = ["#14A6C0", "#0E9F6E", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#64748B"];
const AGE_ORDER = ["<14", "15-20", "21-35", "36-50", "51-65", ">65", "Sin dato"];
const AGE_LABEL: Record<string, string> = {
  "<14": "Menor de 14", "15-20": "Entre 15 y 20", "21-35": "Entre 21 y 35",
  "36-50": "Entre 36 y 50", "51-65": "Entre 51 y 65", ">65": "Sobre 65", "Sin dato": "Desconocida",
};
const APPT_STATUS_LABEL: Record<string, string> = { confirmada: "Confirmada", pendiente: "Pendiente", completada: "Completada", cancelada: "Cancelada", ausente: "Ausente" };

function countBy<T>(items: T[], key: (x: T) => string): { label: string; v: number }[] {
  const m = new Map<string, number>();
  for (const it of items) { const k = key(it); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([label, v]) => ({ label, v }));
}
const withColors = (parts: { label: string; v: number }[]) =>
  parts.map((p, i) => ({ ...p, color: PALETTE[i % PALETTE.length] }));

/** Encabezado de sección estilo Dentalink: título cian centrado + rombo azul. */
function SectionHeading({ children }: { children: string }) {
  return (
    <div className="text-center">
      <h2 className="text-base font-extrabold uppercase tracking-wide text-azure-600">{children}</h2>
      <div className="mx-auto mt-2 h-2.5 w-2.5 rotate-45 bg-azure-500" />
    </div>
  );
}

/** Donut compacto (SVG puro) con leyenda debajo — para la fila de 6. */
function DonutSvg({ parts, total }: { parts: { label: string; v: number; color: string }[]; total: number }) {
  const R = 30, C = 2 * Math.PI * R;
  let acc = 0;
  const segs = parts.filter((p) => p.v > 0).map((p) => {
    const len = (p.v / total) * C;
    const seg = { color: p.color, len, off: -acc };
    acc += len;
    return seg;
  });
  return (
    <svg viewBox="0 0 80 80" className="mx-auto block h-20 w-20" role="img" aria-label="Distribución">
      <g transform="rotate(-90 40 40)" fill="none" strokeWidth={13}>
        <circle cx="40" cy="40" r={R} stroke="#EDF0F4" />
        {segs.map((s, i) => (
          <circle key={i} cx="40" cy="40" r={R} stroke={s.color}
            strokeDasharray={`${s.len.toFixed(2)} ${(C - s.len).toFixed(2)}`}
            strokeDashoffset={s.off.toFixed(2)} strokeLinecap="butt" />
        ))}
      </g>
    </svg>
  );
}

function MiniDonut({ title, parts }: { title: string; parts: { label: string; v: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.v, 0);
  return (
    <Card className="p-3">
      <h3 className="mb-2 text-center text-[11px] font-extrabold leading-tight text-clinic-text">{title}</h3>
      {total === 0 ? (
        <p className="py-8 text-center text-[11px] text-clinic-muted">Sin datos.</p>
      ) : (
        <>
          <DonutSvg parts={parts} total={total} />
          <ul className="mt-3 space-y-1">
            {parts.filter((p) => p.v > 0).map((p) => (
              <li key={p.label} className="flex items-start gap-1.5 text-[10px] leading-snug">
                <span className="mt-[3px] h-2 w-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />
                <span className="flex-1 text-clinic-muted" title={p.label}>{p.label}</span>
                <span className="font-bold tabular-nums text-clinic-text">{p.v}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

export function AnalisisConversion() {
  const { db } = useStore();
  const today = new Date();
  const defTo = today.toISOString().slice(0, 10);
  const defFrom = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()).toISOString().slice(0, 10);
  // Filtro estilo Dentalink: se elige el rango y se aplica con "Filtrar".
  const [fromI, setFromI] = useState(defFrom);
  const [toI, setToI] = useState(defTo);
  const [from, setFrom] = useState(defFrom);
  const [to, setTo] = useState(defTo);
  const aplicar = () => { setFrom(fromI); setTo(toI); };

  const clinicName = db.clinics[0]?.name ?? "Mi clínica";
  const fmtUpd = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;

  const data = useMemo(() => {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to) + 86_399_000;
    const funnel = conversionFunnel(db.appointments, db.budgets, fromMs, toMs);
    const timeline = conversionTimeline(db.appointments, db.budgets, 12);

    const ageRaw = countBy(db.patients, (p) => ageBucket(p.birthDate));
    const ageParts = AGE_ORDER.map((b) => ({ label: AGE_LABEL[b] ?? b, v: ageRaw.find((c) => c.label === b)?.v ?? 0 })).filter((x) => x.v > 0);
    const genderParts = countBy(db.patients, (p) => (p.gender ? GENDER_LABEL[p.gender] : "Desconocido"));
    const cityParts = countBy(db.patients, (p) => p.city ?? "Desconocida");
    const payParts = countBy(db.payments, (p) => PAYMENT_METHOD_LABEL[p.method] ?? p.method);
    const items = db.budgets.flatMap((b) => b.items);
    const catParts = countBy(items, (it) => CATEGORY_LABEL[procedureCategory(it.cpt, db.procedures)]);
    const statusParts = countBy(db.appointments, (a) => APPT_STATUS_LABEL[a.status] ?? a.status);

    const donuts = [
      { title: "Edad", parts: withColors(ageParts) },
      { title: "Género", parts: withColors(genderParts) },
      { title: "Ciudad", parts: withColors(cityParts) },
      { title: "Medios de pago", parts: withColors(payParts) },
      { title: "Categoría de acciones", parts: withColors(catParts) },
      { title: "Estado de las citas", parts: withColors(statusParts) },
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
    { label: "Citas agendadas", pct: 100, v: f.agendadas, color: "#14A6C0" },
    { label: "Citas confirmadas", pct: f.pctConfirmadas, v: f.confirmadas, color: "#0E9F6E" },
    { label: "Presupuestos aceptados", pct: f.pctAceptados, v: f.aceptados, color: "#F59E0B" },
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
    <Reveal className="space-y-8">
      {/* ===== CONVERSIÓN DE LOS PACIENTES ===== */}
      <SectionHeading>Conversión de los pacientes</SectionHeading>
      <p className="mx-auto max-w-3xl text-center text-sm leading-relaxed text-clinic-muted">
        Esta gráfica representa la conversión de una cita a presupuesto aceptado. Esto quiere decir la cantidad de citas que
        fueron necesarias para generar un presupuesto y que éste fuera aceptado por el paciente. Un presupuesto se considera
        aceptado si alguna prestación ha sido realizada.
      </p>

      {/* Filtro */}
      <div className="text-center">
        <p className="text-sm font-extrabold text-clinic-text">Filtrar los resultados</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm">
          <input type="date" value={fromI} max={toI} onChange={(e) => setFromI(e.target.value)} className={`${inputCls} w-auto`} />
          <input type="date" value={toI} min={fromI} onChange={(e) => setToI(e.target.value)} className={`${inputCls} w-auto`} />
          <select className={`${inputCls} w-auto`} defaultValue="all">
            <option value="all">{clinicName}</option>
          </select>
          <button onClick={aplicar} className="inline-flex items-center gap-1.5 rounded-xl bg-azure-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-azure-700">
            <Search className="h-3.5 w-3.5" /> Filtrar
          </button>
          <button onClick={descargar} className="inline-flex items-center gap-1.5 rounded-xl border border-clinic-border px-3 py-2 text-xs font-bold text-clinic-text hover:border-azure-300 hover:text-azure-700">
            <Download className="h-3.5 w-3.5" /> Descargar
          </button>
        </div>
        <p className="mt-2 text-[11px] text-clinic-muted">
          Última actualización: {fmtUpd(today)} ·{" "}
          <button onClick={aplicar} className="inline-flex items-center gap-1 font-bold text-azure-600 hover:underline">
            <RefreshCw className="h-3 w-3" /> Actualizar
          </button>
        </p>
      </div>

      {/* Gráficos */}
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card className="p-5">
          <h3 className="mb-3 text-center text-xs font-extrabold uppercase tracking-wide text-clinic-muted">Conversión total del período</h3>
          <FunnelChart stages={stages} />
        </Card>
        <Card className="p-5">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-clinic-muted">Conversión de pacientes a través del tiempo</h3>
          <ConversionLineChart data={data.timeline} />
        </Card>
      </div>
      <p className="mx-auto max-w-3xl text-center text-[11px] text-clinic-muted">
        Mientras menor sea el porcentaje significa que a la clínica le toma más tiempo transformar una cita en un presupuesto aceptado.
      </p>

      {/* Valores totales */}
      <div>
        <p className="mb-3 text-center text-sm font-extrabold text-clinic-text">Valores totales de conversión para el período</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <div key={c.label} className="overflow-hidden rounded-2xl border border-clinic-border text-center shadow-sm">
              <div className="px-4 py-6 text-white" style={{ background: c.color }}>
                <div className="text-[11px] font-bold uppercase tracking-wide" style={{ opacity: 0.92 }}>{c.label}</div>
                <div className="mt-2 font-mono text-4xl font-extrabold leading-none">{c.pct}%</div>
              </div>
              <div className="bg-white py-2.5 font-mono text-base font-extrabold" style={{ color: c.color, borderBottom: `3px solid ${c.color}` }}>
                {c.v.toLocaleString("es-PY")}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== DATOS GENÉRICOS DE LOS PACIENTES ===== */}
      <SectionHeading>Datos genéricos de los pacientes</SectionHeading>
      <p className="mx-auto max-w-3xl text-center text-sm leading-relaxed text-clinic-muted">
        Estos datos representan a la totalidad de los pacientes de su clínica. Se incluyen datos demográficos y etarios, además
        del comportamiento en diversas acciones que pueden llevar a cabo dentro de la plataforma.
      </p>
      <p className="text-center text-[11px] italic text-clinic-muted">
        * Ciertos datos han sido omitidos por lo que los valores pueden no equivaler al total de pacientes.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {data.donuts.map((d) => (
          <MiniDonut key={d.title} title={d.title} parts={d.parts} />
        ))}
      </div>
    </Reveal>
  );
}
