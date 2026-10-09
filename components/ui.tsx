"use client";
import { ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ESTADO_TONO, estadoDeCita } from "@/lib/estadosCita";
import { useEstadosCita } from "@/lib/useEstadosCita";
import type { BillingFlag, AppointmentStatus } from "@/lib/types";
import { FLAG_INFO } from "@/lib/billing";

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return <div id={id} className={`rounded border border-clinic-border bg-white ${className}`}>{children}</div>;
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
      "bg-azure-600 text-white hover:bg-azure-700 active:scale-[0.98] disabled:bg-clinic-border disabled:text-clinic-muted disabled:shadow-none",
    ghost: "text-clinic-text hover:bg-clinic-bg active:scale-[0.98]",
    outline: "border border-clinic-border bg-white text-clinic-text hover:border-azure-300 hover:bg-azure-50 hover:text-azure-700 active:scale-[0.98]",
    danger: "bg-state-errbg text-state-err hover:bg-red-100 active:scale-[0.98]",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-tip={tip}
      className={`inline-flex min-h-[30px] items-center justify-center gap-1.5 rounded px-3 py-1 text-[13px] font-semibold transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-200 disabled:cursor-not-allowed ${styles} ${className}`}
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
    <span data-tip={tip} className={`inline-flex items-center rounded px-2 py-0.5 text-[12px] font-semibold ${c}`}>
      {children}
    </span>
  );
}

export function FlagBadge({ flag }: { flag: BillingFlag }) {
  const info = FLAG_INFO[flag];
  return <Badge tone={info.tone === "err" ? "err" : info.tone} tip={info.desc}>{info.label}</Badge>;
}

export function StatusBadge({ status, estadoId }: { status: AppointmentStatus; estadoId?: string }) {
  const estados = useEstadosCita();
  const e = estadoDeCita({ status, estadoId }, estados);
  return (
    <Badge tone={ESTADO_TONO[e.base] ?? "muted"}>
      <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: e.color }} />
      {e.label}
    </Badge>
  );
}

/** Selector de lo que puede recibir foco dentro del diálogo (para la trampa de foco). */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Comportamiento accesible de un diálogo modal (WCAG 2.1 AA): atrapa el foco
 * mientras está abierto (Tab no se escapa al fondo) y lo devuelve a quien lo
 * abrió al cerrarse — sin esto el usuario de teclado queda "perdido" al
 * principio de la página.
 *
 * **Las ventanas son persistentes** (pedido de Croman, 8-oct-2026: «que se
 * cierren con cancelar o con la X de arriba, para evitar que se cierren»): ni
 * Escape ni un clic afuera las cierran, porque se perdía lo que se estaba
 * cargando. Se cierran con la X o con el botón «Cancelar» de cada una. Por lo
 * mismo, al abrir el foco va al panel (que anuncia el título) y no a la X: un
 * Enter de más ya no la cierra. Si un campo pide `autoFocus`, se lo respeta.
 *
 * Es un hook y no un componente para que cada diálogo conserve su markup (el
 * visor de consentimientos, por ejemplo, tiene estilos de impresión propios).
 *
 * Devuelve los props a esparcir en el panel: `<div {...dialogProps}>`.
 */
export function useDialogA11y() {
  const panel = useRef<HTMLDivElement>(null);
  // Quién abrió el diálogo: se lee al renderizar, antes de que un `autoFocus` de adentro se lleve el foco.
  const abridor = useRef<HTMLElement | null>(typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null));
  const titleId = useId();

  const enfocables = useCallback(
    () => Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null),
    []
  );

  useEffect(() => {
    // Al abrir, el foco entra al diálogo: al campo con `autoFocus` si lo hay; si no, al panel.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      // Con un diálogo abierto encima de otro (p. ej. «Crear paciente» sobre «Dar
      // cita»), solo responde el de más arriba.
      const abiertos = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (abiertos.length > 1 && abiertos[abiertos.length - 1] !== panel.current) return;
      if (e.key !== "Tab") return;
      const els = enfocables();
      if (els.length === 0) { e.preventDefault(); return; }
      const primero = els[0], ultimo = els[els.length - 1];
      // Ciclar dentro del diálogo en vez de salir al fondo (también desde el panel, donde arranca el foco).
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === panel.current)) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    const quien = abridor.current;
    return () => {
      document.removeEventListener("keydown", onKey, true);
      quien?.focus?.();
    };
  }, [enfocables]);

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

/** Un clic en el fondo de una ventana persistente no la cierra: marca la X un momento para que se vea por dónde se cierra.
 *  Devuelve el handler del fondo y si la X tiene que estar marcada. */
export function useAvisoDeCierre() {
  const [aviso, setAviso] = useState(false);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(false), 2000);
    return () => clearTimeout(t);
  }, [aviso]);
  const alTocarElFondo = (e: React.MouseEvent) => { if (e.target === e.currentTarget) setAviso(true); };
  return { aviso, alTocarElFondo };
}

/** La X de arriba de una ventana. `aviso`: se marca (un clic afuera no cierra; ver useAvisoDeCierre). */
export function BotonCerrar({ onClose, aviso }: { onClose: () => void; aviso?: boolean }) {
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        title="Cerrar"
        data-aviso={aviso ? "si" : undefined}
        className={`grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-clinic-bg ${aviso ? "bg-azure-50 ring-2 ring-azure-400" : ""}`}
      >
        <X className={`h-4 w-4 ${aviso ? "text-azure-700" : "text-clinic-muted"}`} />
      </button>
      {aviso && (
        <span role="status" className="absolute right-0 top-full z-20 mt-1.5 whitespace-nowrap rounded bg-navy-900 px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-pop">
          Para cerrar, tocá la X o «Cancelar»
        </span>
      )}
    </span>
  );
}

/**
 * Monta en un portal sobre <body>. Necesario para los diálogos: dentro del
 * árbol de la página quedan atrapados en el contexto de apilamiento que crea
 * PageTransition (framer-motion aplica transform/opacity), así que su z-50 NO
 * llega a tapar el header sticky (z-30) — el usuario podía seguir usando el
 * buscador y cerrar sesión con un modal abierto, contradiciendo aria-modal.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);   // en SSR no hay document
  return montado ? createPortal(<div className="app-portal">{children}</div>, document.body) : null;
}

/** Contenido del diálogo. Va aparte de <Modal> a propósito: así useDialogA11y
 *  se monta DENTRO del portal, cuando el panel ya existe en el DOM. Si el hook
 *  viviera en Modal, su efecto correría en el primer render —cuando el portal
 *  todavía devuelve null— y el foco nunca entraría al diálogo. */
function ModalContent({ title, onClose, children, wide, xl }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; xl?: boolean }) {
  const { titleId, dialogProps } = useDialogA11y();
  const { aviso, alTocarElFondo } = useAvisoDeCierre();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/40 p-4" onClick={alTocarElFondo} role="presentation">
      <div
        {...dialogProps}
        className={`max-h-[90vh] w-full overflow-y-auto overscroll-contain rounded border border-clinic-border bg-white px-5 pb-5 shadow-pop outline-none ${xl ? "max-w-6xl" : wide ? "max-w-3xl" : "max-w-lg"}`}
      >
        {/* El título y la X quedan fijos arriba: con una ventana larga, la X sigue a mano. */}
        <div className="sticky top-0 z-10 -mx-5 mb-4 flex items-center justify-between gap-3 border-b border-clinic-border bg-white px-5 py-3">
          <h3 id={titleId} className="text-[16px] font-bold text-clinic-text">{title}</h3>
          <BotonCerrar onClose={onClose} aviso={aviso} />
        </div>
        {children}
      </div>
    </div>
  );
}

/** El pie de una ventana larga (los botones de guardar y cancelar): queda fijo abajo mientras se recorre la ventana. Va al final del
 *  contenido de un <Modal>. */
export function ModalPie({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={`sticky -bottom-5 z-10 -mx-5 -mb-5 mt-4 border-t border-clinic-border bg-white px-5 py-3 ${className}`}>
      {children}
    </div>
  );
}

/** Diálogo modal accesible y persistente: se cierra con la X o con «Cancelar», nunca con un clic afuera ni con Escape. Ver
 *  useDialogA11y. */
export function Modal(props: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; xl?: boolean }) {
  return (
    <Portal>
      <ModalContent {...props} />
    </Portal>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-semibold text-clinic-text">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-clinic-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full min-h-[32px] rounded border border-clinic-border bg-white px-2.5 py-1.5 text-[13px] text-clinic-text placeholder:text-clinic-muted/60 transition-[border-color,box-shadow] focus:border-azure-600 focus:ring-2 focus:ring-azure-100";

export function Empty({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="rounded border border-dashed border-clinic-border bg-white p-8 text-center">
      <div className="text-sm font-bold text-clinic-text">{title}</div>
      {desc && <div className="mt-1 text-sm text-clinic-muted">{desc}</div>}
    </div>
  );
}
