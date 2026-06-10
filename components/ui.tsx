"use client";
import { ReactNode } from "react";
import { X } from "lucide-react";
import type { BillingFlag, AppointmentStatus } from "@/lib/types";
import { FLAG_INFO } from "@/lib/billing";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-clinic-border bg-white shadow-card ${className}`}>{children}</div>;
}

export function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
  className = "",
  tip,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "outline";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  tip?: string;
}) {
  const styles = {
    primary: "bg-azure-600 text-white hover:bg-azure-700 disabled:bg-clinic-border disabled:text-clinic-muted",
    ghost: "text-clinic-text hover:bg-clinic-bg",
    outline: "border border-clinic-border text-clinic-text hover:border-azure-300 hover:text-azure-700 bg-white",
    danger: "bg-state-errbg text-state-err hover:bg-red-100",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-tip={tip}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({ tone, children, tip }: { tone: "ok" | "warn" | "err" | "info" | "hold" | "muted"; children: ReactNode; tip?: string }) {
  const c = {
    ok: "bg-state-okbg text-state-ok",
    warn: "bg-state-warnbg text-state-warn",
    err: "bg-state-errbg text-state-err",
    info: "bg-state-infobg text-state-info",
    hold: "bg-state-holdbg text-state-hold",
    muted: "bg-clinic-bg text-clinic-muted",
  }[tone];
  return (
    <span data-tip={tip} className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide ${c}`}>
      {children}
    </span>
  );
}

export function FlagBadge({ flag }: { flag: BillingFlag }) {
  const info = FLAG_INFO[flag];
  return <Badge tone={info.tone === "err" ? "err" : info.tone} tip={info.desc}>{info.label}</Badge>;
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const map = {
    confirmada: { tone: "ok" as const, label: "Confirmada" },
    pendiente: { tone: "warn" as const, label: "Pendiente" },
    cancelada: { tone: "err" as const, label: "Cancelada" },
  }[status];
  return <Badge tone={map.tone}>{map.label}</Badge>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/40 p-4" onClick={onClose}>
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-pop ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-clinic-text">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-full hover:bg-clinic-bg">
            <X className="h-4 w-4 text-clinic-muted" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-clinic-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-clinic-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-clinic-border bg-white px-3 py-2 text-sm text-clinic-text placeholder:text-clinic-muted/60 focus:border-azure-500 focus:outline-none";

export function Empty({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-clinic-border bg-white p-10 text-center">
      <div className="text-sm font-bold text-clinic-text">{title}</div>
      {desc && <div className="mt-1 text-sm text-clinic-muted">{desc}</div>}
    </div>
  );
}
