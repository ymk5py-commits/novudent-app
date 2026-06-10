"use client";
/** StatCard — adaptado del componente "Card" (card-10) de 21st.dev:
 *  KPI con count-up (framer-motion) y mini sparkline, tema clínico claro. */
import * as React from "react";
import { animate, motion, useInView, useMotionValue, useTransform } from "framer-motion";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Tone = "azure" | "green" | "amber";

export interface StatCardProps {
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  icon: React.ReactNode;
  tone?: Tone;
  trend?: number[];
  href?: string;
}

const tones: Record<Tone, { chip: string; stroke: string }> = {
  azure: { chip: "bg-gradient-to-br from-azure-50 to-white text-azure-600", stroke: "#2E83F5" },
  green: { chip: "bg-gradient-to-br from-state-okbg to-white text-state-ok", stroke: "#0E9F6E" },
  amber: { chip: "bg-gradient-to-br from-state-warnbg to-white text-state-warn", stroke: "#B45309" },
};

function Sparkline({ data, stroke }: { data: number[]; stroke: string }) {
  const w = 96, h = 32, pad = 2;
  const min = Math.min(...data);
  const range = Math.max(...data) - min || 1;
  const points = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-24" aria-hidden="true">
      <motion.polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />
    </svg>
  );
}

export function StatCard({ label, value, suffix, prefix, icon, tone = "azure", trend, href }: StatCardProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => Math.round(v).toLocaleString());

  React.useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, { duration: 1.2, ease: "easeOut" });
    return () => controls.stop();
  }, [inView, value, mv]);

  const t = tones[tone];
  const Tag = (href ? "a" : "div") as React.ElementType;

  return (
    <Tag
      {...(href ? { href } : {})}
      className={cn(
        "group block rounded-2xl border border-clinic-border bg-white p-5 shadow-card",
        "transition-all duration-300 hover:-translate-y-1 hover:shadow-pop sm:rounded-3xl"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ring-clinic-border/60", t.chip)}>
          {icon}
        </span>
        {trend && trend.length > 1 && <Sparkline data={trend} stroke={t.stroke} />}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-clinic-text tabular-nums">
        {prefix && <span className="mr-0.5 text-lg font-medium text-clinic-muted">{prefix}</span>}
        <motion.span ref={ref}>{display}</motion.span>
        {suffix && <span className="ml-0.5 text-lg font-medium text-clinic-muted">{suffix}</span>}
      </p>
      <p className="mt-1 text-sm font-medium text-clinic-muted">{label}</p>
    </Tag>
  );
}
