"use client";
/** «Agenda online» (Configuración): todo lo de la reserva por internet en un solo lugar. El link para compartir (con su QR para
 *  imprimir), cuánta anticipación mínima se pide y dónde se elige qué datos se piden al reservar. */
import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { CalendarClock, Download, ExternalLink } from "lucide-react";
import { useStore } from "@/lib/store";
import { anticipacionDe } from "@/lib/reserva-online";
import { Card, Field, inputCls } from "@/components/ui";

export function AgendaOnline() {
  const { db, updateClinicConfig } = useStore();
  const clinic = db.clinics[0];
  const clinicId = clinic?.id ?? "";
  const [url, setUrl] = useState(`/reservar/${clinicId}`);
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => { setUrl(`${window.location.origin}/reservar/${clinicId}`); }, [clinicId]);
  useEffect(() => {
    let viva = true;
    QRCode.toDataURL(url, { margin: 1, width: 280 }).then((d) => { if (viva) setQr(d); }).catch(() => { if (viva) setQr(null); });
    return () => { viva = false; };
  }, [url]);

  const copiar = async () => {
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { /* sin portapapeles o sin permiso: no se muestra «Copiado» */ }
  };
  const btn = "inline-flex items-center gap-1.5 rounded-xl border border-clinic-border px-3 py-2 text-xs font-bold hover:border-azure-300 hover:text-azure-700";

  return (
    <Card className="p-5">
      <div id="reserva-online" className="mb-1 flex scroll-mt-24 items-center gap-2"><CalendarClock aria-hidden className="h-4 w-4 text-azure-600" /><h2 className="font-bold text-clinic-text">Agenda online</h2></div>
      <p className="mb-3 text-xs text-clinic-muted">Compartí este link en tu web, Instagram, WhatsApp o Facebook para que los pacientes reserven solos. Las reservas entran a la agenda como pendientes de validar.</p>

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-clinic-border bg-clinic-bg px-3 py-2 text-xs text-clinic-text">{url}</code>
            <button type="button" onClick={copiar} className={`${btn} text-clinic-text`}>{copiado ? "Copiado" : "Copiar link"}</button>
            <a href={url} target="_blank" rel="noopener noreferrer" className={`${btn} text-clinic-muted`}>Abrir <ExternalLink aria-hidden className="h-3 w-3" /></a>
          </div>

          <div className="mt-4 max-w-sm">
            <Field label="Anticipación mínima" hint={`Con cuánta anticipación puede el paciente tomar un turno. Se calcula en la zona horaria de la clínica (${clinic?.config.timezone || "sin configurar"}).`}>
              <select
                value={String(anticipacionDe(clinic?.config))}
                onChange={(e) => updateClinicConfig({ onlineBooking: { ...clinic?.config.onlineBooking, minLeadHoras: Number(e.target.value) } })}
                className={inputCls}
              >
                {/* El default (12) tiene que figurar en la lista: un <select> controlado cuyo value no matchea ninguna opción se ve en blanco. */}
                <option value="0">Sin anticipación (hasta la hora del turno)</option>
                <option value="1">1 hora</option>
                <option value="2">2 horas</option>
                <option value="4">4 horas</option>
                <option value="8">8 horas</option>
                <option value="12">12 horas</option>
                <option value="24">24 horas</option>
              </select>
            </Field>
          </div>
          <p className="mt-2 text-[11px] text-clinic-muted">
            Con <b>0</b> el paciente puede reservar para hoy mismo hasta la hora del turno. Con <b>24</b> necesita al menos un día completo de aviso.
          </p>
          <p className="mt-3 text-xs text-clinic-muted">
            Los datos que se piden al reservar (cédula, WhatsApp, correo…) se eligen en{" "}
            <Link href="/app/pacientes#configuracion" className="font-bold text-azure-700 hover:underline">Campos del paciente</Link>, columna «Agenda online».
          </p>
        </div>

        {qr && (
          <figure className="shrink-0 text-center">
            <img src={qr} alt="Código QR de la agenda online" width={140} height={140} className="rounded-lg border border-clinic-border" />
            <figcaption className="mt-1.5 text-[11px] text-clinic-muted">Imprimilo para la recepción</figcaption>
            <a href={qr} download="agenda-online-qr.png" className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-azure-700 hover:underline"><Download aria-hidden className="h-3 w-3" /> Descargar QR</a>
          </figure>
        )}
      </div>
    </Card>
  );
}
