"use client";
/** Botón reusable de envío de email (vía /api/email → Resend). Degrada con un
 *  mensaje claro si el servidor no tiene RESEND_API_KEY/EMAIL_FROM o el paciente
 *  no tiene email cargado. */
import { useState } from "react";
import { currentIdToken } from "@/lib/firebase";
import { Mail, Loader2, Check } from "lucide-react";

export function EmailButton({ to, subject, html, label = "Enviar por email", disabled }: {
  to?: string; subject: string; html: string; label?: string; disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  const send = async () => {
    if (!to) { setState("error"); setMsg("El paciente no tiene email cargado."); return; }
    setState("sending"); setMsg(null);
    try {
      const token = await currentIdToken();
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ to, subject, html }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo enviar.");
      setState("sent");
    } catch (e: any) { setState("error"); setMsg(e.message); }
  };

  return (
    <span className="inline-flex flex-col items-end">
      <button
        onClick={send}
        disabled={disabled || state === "sending" || state === "sent"}
        className="inline-flex items-center gap-1.5 rounded-xl border border-clinic-border px-3 py-2 text-sm font-bold text-clinic-text transition-colors hover:border-azure-300 hover:text-azure-700 disabled:opacity-60"
      >
        {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "sent" ? <Check className="h-4 w-4 text-state-ok" /> : <Mail className="h-4 w-4" />}
        {state === "sent" ? "Enviado" : label}
      </button>
      {state === "error" && msg && <span className="mt-1 max-w-[220px] text-right text-[11px] leading-tight text-state-err">{msg}</span>}
    </span>
  );
}
