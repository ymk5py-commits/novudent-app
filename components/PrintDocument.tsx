"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Logotipo } from "@/components/Marca";
import type { Clinic } from "@/lib/types";

/** Saca la hoja del árbol animado de la app antes de imprimirla. */
export function PrintPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    document.body.classList.add("plan-print-active");
    setTarget(document.body);
    return () => document.body.classList.remove("plan-print-active");
  }, []);
  return target ? createPortal(children, target) : null;
}

/** Mismo membrete para propuestas clínicas y documentos firmados. */
export function PrintLetterhead({ clinic, label }: { clinic: Clinic; label: string }) {
  return (
    <>
      <header className="plan-print-header flex flex-wrap items-start justify-between gap-4">
        <div className="plan-print-brand flex flex-col items-start gap-1">
          <Logotipo className="plan-print-logo h-10 w-auto" />
          <span className="text-[12px] font-bold text-azure-700">{label}</span>
        </div>
        <div className="plan-print-clinic flex max-w-[250px] flex-col items-end text-right text-xs text-clinic-muted">
          {clinic.config.logo && <img src={clinic.config.logo} alt="" className="plan-print-clinic-logo mb-1 h-8 w-auto max-w-32 object-contain" />}
          <strong className="text-clinic-text">{clinic.name}</strong>
          {clinic.config.address && <span>{clinic.config.address}</span>}
          {clinic.config.phone && <span>{clinic.config.phone}</span>}
        </div>
      </header>
      <div className="plan-print-accent mt-4 h-1 w-full bg-azure-600" />
    </>
  );
}
