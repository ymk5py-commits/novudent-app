"use client";
/** Gráficas Novudent — Recharts con la piel del design system:
 *  tooltips de tarjeta blanca, gradientes azure, ejes discretos.
 *  Todas reciben datos ya agregados (la página hace los cálculos). */
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, AreaChart, Area, Legend,
} from "recharts";
import { fmtGs } from "@/lib/store";

const AXIS = { fontSize: 10.5, fontWeight: 700, fill: "#64748B" } as const;
const GRID = "#EEF2F8";

/* ---------- tooltip de tarjeta (compartido) ---------- */
function CardTooltip({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-clinic-border bg-white px-3.5 py-2.5 shadow-pop">
      {label !== undefined && <p className="mb-1 font-mono text-[10px] font-extrabold uppercase tracking-wide text-clinic-muted">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-2 text-xs font-bold text-clinic-text">
          <span className="h-2 w-2 rounded-full" style={{ background: p.fill === "#fff" ? p.stroke : (p.payload?.fill ?? p.color ?? p.fill) }} />
          {p.name}: <span className="font-mono">{money ? fmtGs(p.value) : p.value.toLocaleString("es-PY")}</span>
        </p>
      ))}
    </div>
  );
}

/* ---------- barras semanales (ingresos o nº de citas) ---------- */
export function WeekBarsChart({ data, money, name }: { data: { d: string; v: number }[]; money?: boolean; name: string }) {
  const max = Math.max(...data.map((x) => x.v), 1);
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
          <defs>
            <linearGradient id="nv-bar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2E83F5" />
              <stop offset="100%" stopColor="#1769E0" />
            </linearGradient>
            <linearGradient id="nv-bar-soft" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#BFDBFE" />
              <stop offset="100%" stopColor="#93C5FD" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="d" axisLine={false} tickLine={false} tick={AXIS} dy={6} />
          <YAxis
            axisLine={false} tickLine={false} width={money ? 46 : 28}
            tick={AXIS}
            tickFormatter={(v: number) => (money ? (v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("es-PY", { maximumFractionDigits: 1 })}M` : `${Math.round(v / 1000)}k`) : String(v))}
          />
          <Tooltip cursor={{ fill: "rgba(46,131,245,0.07)" }} content={<CardTooltip money={money} />} />
          <Bar dataKey="v" name={name} radius={[7, 7, 0, 0]} animationDuration={900} animationEasing="ease-out" maxBarSize={38}>
            {data.map((x) => (
              <Cell key={x.d} fill={x.v === max && x.v > 0 ? "url(#nv-bar)" : "url(#nv-bar-soft)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- donut de estados de citas ---------- */
export function StatusDonutChart({ parts, centerLabel }: {
  parts: { label: string; v: number; color: string }[];
  centerLabel: string;
}) {
  const total = parts.reduce((s, p) => s + p.v, 0);
  const data = parts.filter((p) => p.v > 0).map((p) => ({ name: p.label, value: p.v, fill: p.color }));
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative h-40 w-40">
        <ResponsiveContainer>
          <PieChart>
            <Tooltip content={<CardTooltip />} />
            <Pie
              data={data.length ? data : [{ name: "Sin citas", value: 1, fill: GRID }]}
              dataKey="value" nameKey="name"
              innerRadius="68%" outerRadius="100%"
              paddingAngle={data.length > 1 ? 2.5 : 0}
              cornerRadius={5}
              stroke="none"
              animationDuration={900}
              animationEasing="ease-out"
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-2xl font-extrabold tabular-nums text-clinic-text">{total}</div>
            <div className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-clinic-muted">{centerLabel}</div>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            <span className="w-24 text-clinic-muted">{p.label}</span>
            <span className="font-bold tabular-nums text-clinic-text">{p.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- producción por profesional (barras horizontales) ---------- */
export function ProductionBarsChart({ data }: { data: { name: string; v: number; color: string }[] }) {
  const h = Math.max(data.length * 56, 64);
  return (
    <div className="w-full" style={{ height: h }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap="32%">
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis
            type="number" axisLine={false} tickLine={false} tick={AXIS}
            tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("es-PY", { maximumFractionDigits: 1 })}M` : `${Math.round(v / 1000)}k`)}
          />
          <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={120} tick={{ ...AXIS, fontSize: 11, fill: "#13233F" }} />
          <Tooltip cursor={{ fill: "rgba(46,131,245,0.07)" }} content={<CardTooltip money />} />
          <Bar dataKey="v" name="Cobrado 30d" radius={[0, 7, 7, 0]} animationDuration={900} animationEasing="ease-out" maxBarSize={22}>
            {data.map((x) => (
              <Cell key={x.name} fill={x.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- flujo de caja (área, 30 días) ---------- */
export function CashflowAreaChart({ data }: { data: { d: string; cobrado: number; gastos: number }[] }) {
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="nv-in" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0E9F6E" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#0E9F6E" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="nv-out" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#DC2626" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#DC2626" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="d" axisLine={false} tickLine={false} tick={AXIS} dy={6} minTickGap={24} />
          <YAxis
            axisLine={false} tickLine={false} width={46} tick={AXIS}
            tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("es-PY", { maximumFractionDigits: 1 })}M` : `${Math.round(v / 1000)}k`)}
          />
          <Tooltip content={<CardTooltip money />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
          <Area type="monotone" dataKey="cobrado" name="Cobrado" stroke="#0E9F6E" strokeWidth={2.5} fill="url(#nv-in)" animationDuration={900} dot={false} activeDot={{ r: 4 }} />
          <Area type="monotone" dataKey="gastos" name="Gastos" stroke="#DC2626" strokeWidth={2} fill="url(#nv-out)" animationDuration={900} dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
