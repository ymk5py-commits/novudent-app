"use client";
import { ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
    primary:
      "btn-shine bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-[0_6px_18px_-6px_rgba(16,185,129,0.5)] hover:from-emerald-600 hover:to-emerald-700 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:from-clinic-border disabled:to-clinic-border disabled:text-clinic-muted disabled:shadow-none disabled:translate-y-0",
    ghost: "text-clinic-text hover:bg-clinic-bg active:scale-[0.98]",
    outline: "border border-clinic-border text-clinic-text hover:border-azure-300 hover:text-azure-700 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] bg-white",
    danger: "bg-state-errbg text-state-err hover:bg-red-100 active:scale-[0.98]",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-tip={tip}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed ${styles} ${className}`}
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
    <span data-tip={tip} className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${c}`}>
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
    en_atencion: { tone: "info" as const, label: "En atención" },
    pendiente: { tone: "warn" as const, label: "Pendiente" },
    completada: { tone: "info" as const, label: "Completada" },
    cancelada: { tone: "err" as const, label: "Cancelada" },
    ausente: { tone: "warn" as const, label: "Ausente" },
  }[status];
  return <Badge tone={map.tone}>{map.label}</Badge>;
}

/** Selector de lo que puede recibir foco dentro del diálogo (para la trampa de foco). */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Comportamiento accesible de un diálogo modal (WCAG 2.1 AA):
 * cierra con Escape, atrapa el foco mientras está abierto (Tab no se escapa al
 * fondo) y lo devuelve a quien lo abrió al cerrarse — sin esto el usuario de
 * teclado queda "perdido" al principio de la página.
 *
 * Es un hook y no un componente para que cada diálogo conserve su markup (el
 * visor de consentimientos, por ejemplo, tiene estilos de impresión propios).
 *
 * Devuelve los props a esparcir en el panel: `<div {...dialogProps}>`.
 */
export function useDialogA11y(onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  const abridor = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const enfocables = useCallback(
    () => Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null),
    []
  );

  useEffect(() => {
    abridor.current = document.activeElement as HTMLElement | null;
    // Al abrir, el foco entra al diálogo (si no hay nada enfocable, al panel).
    (enfocables()[0] ?? panel.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      const els = enfocables();
      if (els.length === 0) { e.preventDefault(); return; }
      const primero = els[0], ultimo = els[els.length - 1];
      // Ciclar dentro del diálogo en vez de salir al fondo.
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      abridor.current?.focus?.();
    };
  }, [onClose, enfocables]);

  return {
    titleId,
    dialogProps: {
      ref: panel,
      role: "dialog" as const,
      "aria-modal": true,
      "aria-labelledby": titleId,
      tabIndex: -1,
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
    },
  };
}

/**
 * Monta en un portal sobre <body>. Necesario para los diálogos: dentro del
 * árbol de la página quedan atrapados en el contexto de apilamiento que crea
 * PageTransition (framer-motion aplica transform/opacity), así que su z-50 NO
 * llega a tapar el header sticky (z-30) — el usuario podía seguir usando el
 * buscador y cerrar sesión con un modal abierto, contradiciendo aria-modal.
 */
function Portal({ children }: { children: ReactNode }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);   // en SSR no hay document
  return montado ? createPortal(children, document.body) : null;
}

/** Contenido del diálogo. Va aparte de <Modal> a propósito: así useDialogA11y
 *  se monta DENTRO del portal, cuando el panel ya existe en el DOM. Si el hook
 *  viviera en Modal, su efecto correría en el primer render —cuando el portal
 *  todavía devuelve null— y el foco nunca entraría al diálogo. */
function ModalContent({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { titleId, dialogProps } = useDialogA11y(onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/40 p-4" onClick={onClose} role="presentation">
      <div
        {...dialogProps}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-pop outline-none ${wide ? "max-w-3xl" : "max-w-lg"}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id={titleId} className="text-lg font-extrabold text-clinic-text">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-full hover:bg-clinic-bg">
            <X className="h-4 w-4 text-clinic-muted" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Diálogo modal accesible. Ver useDialogA11y. */
export function Modal(props: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <Portal>
      <ModalContent {...props} />
    </Portal>
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
  "w-full rounded-xl border border-clinic-border bg-white px-3 py-2 text-sm text-clinic-text placeholder:text-clinic-muted/60 focus:border-azure-600";

export function Empty({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-clinic-border bg-white p-10 text-center">
      <div className="text-sm font-bold text-clinic-text">{title}</div>
      {desc && <div className="mt-1 text-sm text-clinic-muted">{desc}</div>}
    </div>
  );
}
