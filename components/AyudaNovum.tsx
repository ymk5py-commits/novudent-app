"use client";
/** Panel «Ayuda» de la barra superior: por dónde la clínica le escribe a Novum, el
 *  equipo que hace Novudent, por cualquier cosa que no entienda o necesite saber
 *  (pedido del cliente en el documento de revisión: el «call center»).
 *
 *  Los canales salen de lib/soporte.ts (variables NEXT_PUBLIC_SOPORTE_*). Se
 *  muestran solo los que están bien cargados; sin ninguno, el panel lo dice con
 *  todas las letras en vez de ofrecer un botón que no lleva a ningún lado. */
import { Clock, Info, Mail, MessageCircle } from "lucide-react";
import { Modal } from "@/components/ui";
import { waLink } from "@/lib/store";
import { SOPORTE, haySoporte, linkCorreoSoporte, mensajeSoporte, type CanalesSoporte } from "@/lib/soporte";

const canal = "flex items-center gap-3 rounded-xl border border-clinic-border p-3 transition-colors";

export default function AyudaNovum({ clinica, usuario, onClose, canales = SOPORTE }: {
  clinica: string; usuario: string; onClose: () => void; canales?: CanalesSoporte;
}) {
  const quien = { clinica, usuario };
  return (
    <Modal title="Ayuda de Novum" onClose={onClose}>
      {haySoporte(canales) ? (
        <div className="space-y-3">
          <p className="text-sm text-clinic-muted">
            ¿Algo no se entiende o necesitás saber cómo se hace? Escribinos: te atiende el equipo de Novum, que hace Novudent.
          </p>
          {canales.whatsapp && (
            <a href={waLink(canales.whatsapp, mensajeSoporte(quien))} target="_blank" rel="noopener noreferrer" className={`${canal} hover:border-[#25D366]/50 hover:bg-[#25D366]/5`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#25D366]/15 text-[#128C7E]"><MessageCircle className="h-5 w-5" aria-hidden /></span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-clinic-text">Escribir por WhatsApp</span>
                <span className="block truncate text-xs text-clinic-muted">+{canales.whatsapp}</span>
              </span>
            </a>
          )}
          {canales.email && (
            <a href={linkCorreoSoporte(canales.email, quien)} className={`${canal} hover:border-azure-300 hover:bg-azure-50`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-azure-50 text-azure-600"><Mail className="h-5 w-5" aria-hidden /></span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-clinic-text">Escribir un correo</span>
                <span className="block truncate text-xs text-clinic-muted">{canales.email}</span>
              </span>
            </a>
          )}
          {canales.horario && (
            <p className="flex items-start gap-2 text-sm text-clinic-text">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-clinic-muted" aria-hidden />
              <span><span className="font-bold">Horario de atención:</span> {canales.horario}</span>
            </p>
          )}
          <p className="text-[11px] text-clinic-muted">El mensaje ya sale con el nombre de tu clínica y el tuyo, así sabemos quién escribe.</p>
        </div>
      ) : (
        <div role="status" className="flex gap-3 rounded-xl border border-state-warn/30 bg-state-warnbg p-4 text-sm text-state-warn">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-bold">El canal de soporte todavía no está configurado.</p>
            <p className="mt-1">Cuando esté listo, desde acá vas a poder escribirle a Novum por WhatsApp o por correo, y ver el horario de atención.</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
