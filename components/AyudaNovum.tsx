"use client";
/** Asistente de ayuda dentro de Novudent. Responde consultas frecuentes en el navegador
 * y prepara el contacto con NOVUM cuando la respuesta necesita una persona. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock, Mail, MessageCircle, Send } from "lucide-react";
import { Modal } from "@/components/ui";
import { waLink } from "@/lib/store";
import { SOPORTE, linkCorreoSoporte, mensajeSoporte, type CanalesSoporte } from "@/lib/soporte";
import { responderAyuda, type RespuestaAyuda } from "@/lib/soporte-bot";

type Mensaje = { id: number; autor: "bot" | "usuario"; texto: string; enlace?: RespuestaAyuda["enlace"] };
const inicial: Mensaje = { id: 0, autor: "bot", texto: "¡Hola! Soy el asistente de Novudent. Preguntame cómo usar una función o elegí un tema. Si necesitás al equipo de NOVUM, te ayudo a preparar un correo." };
const temas = ["Agenda", "Pacientes", "Odontograma", "Caja", "Soporte humano"];

export default function AyudaNovum({ clinica, usuario, onClose, canales = SOPORTE }: {
  clinica: string; usuario: string; onClose: () => void; canales?: CanalesSoporte;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([inicial]);
  const [entrada, setEntrada] = useState("");
  const [ultimaConsulta, setUltimaConsulta] = useState("");
  const siguienteId = useRef(1);
  const conversacion = useRef<HTMLDivElement>(null);
  const quien = { clinica, usuario };

  useEffect(() => {
    if (conversacion.current) conversacion.current.scrollTop = conversacion.current.scrollHeight;
  }, [mensajes]);

  function consultar(textoCrudo: string) {
    const texto = textoCrudo.trim();
    if (!texto) return;
    const respuesta = responderAyuda(texto);
    setEntrada("");
    setUltimaConsulta(texto);
    setMensajes((actuales) => [
      ...actuales,
      { id: siguienteId.current++, autor: "usuario", texto },
      { id: siguienteId.current++, autor: "bot", texto: respuesta.texto, enlace: respuesta.enlace },
    ]);
  }

  return (
    <Modal title="Ayuda de Novum" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-clinic-muted">Consultá sobre el uso de Novudent. Este asistente responde con guías; no accede a las fichas ni a los datos de pacientes.</p>
        <div ref={conversacion} role="log" aria-label="Conversación con el asistente" className="max-h-[38vh] min-h-[220px] space-y-3 overflow-y-auto rounded-2xl border border-clinic-border bg-clinic-bg/60 p-4">
          {mensajes.map((mensaje) => (
            <div key={mensaje.id} className={mensaje.autor === "bot" ? "mr-auto max-w-[88%] rounded-2xl border border-clinic-border bg-white px-4 py-3 text-sm text-clinic-text" : "ml-auto max-w-[88%] rounded-2xl bg-azure-600 px-4 py-3 text-sm text-white"}>
              <p className="whitespace-pre-wrap">{mensaje.texto}</p>
              {mensaje.enlace && <Link href={mensaje.enlace.href} onClick={onClose} className="mt-2 inline-flex items-center gap-1 font-bold text-azure-700 underline underline-offset-2">{mensaje.enlace.texto} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></Link>}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Temas frecuentes">
          {temas.map((tema) => <button key={tema} type="button" onClick={() => consultar(tema)} className="rounded-full border border-azure-200 bg-azure-50 px-3 py-1.5 text-xs font-semibold text-azure-700 hover:bg-azure-100">{tema}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); consultar(entrada); }} className="flex gap-2">
          <label htmlFor="consulta-ayuda" className="sr-only">Escribí tu consulta</label>
          <input id="consulta-ayuda" value={entrada} onChange={(e) => setEntrada(e.target.value)} maxLength={500} placeholder="Escribí tu consulta sobre Novudent" className="min-w-0 flex-1 rounded-xl border border-clinic-border bg-white px-3 py-2.5 text-sm text-clinic-text placeholder:text-clinic-muted focus:border-azure-500 focus:outline-none focus:ring-2 focus:ring-azure-100" />
          <button type="submit" disabled={!entrada.trim()} aria-label="Consultar al asistente" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-azure-600 text-white hover:bg-azure-700 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" aria-hidden /></button>
        </form>
        <div className="border-t border-clinic-border pt-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-clinic-text"><MessageCircle className="h-4 w-4 text-azure-600" aria-hidden /> ¿Necesitás ayuda de una persona?</div>
          <p className="mb-3 text-xs text-clinic-muted">El asistente no envía mensajes al equipo. Si abrís el correo preparado, tendrás que pulsar Enviar en tu aplicación de correo. No incluyas datos de pacientes ni contraseñas.</p>
          <div className="flex flex-wrap gap-2">
            {canales.email && <a href={linkCorreoSoporte(canales.email, quien, ultimaConsulta)} className="inline-flex items-center gap-2 rounded-xl border border-azure-200 bg-azure-50 px-3 py-2 text-sm font-semibold text-azure-700 hover:bg-azure-100"><Mail className="h-4 w-4" aria-hidden /> Preparar correo a {canales.email}</a>}
            {canales.whatsapp && <a href={waLink(canales.whatsapp, mensajeSoporte(quien, ultimaConsulta))} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-clinic-border px-3 py-2 text-sm font-semibold text-clinic-text hover:bg-clinic-bg"><MessageCircle className="h-4 w-4" aria-hidden /> Abrir WhatsApp</a>}
          </div>
          {canales.horario && <p className="mt-3 flex items-center gap-2 text-xs text-clinic-muted"><Clock className="h-3.5 w-3.5" aria-hidden /> Horario de atención: {canales.horario}</p>}
        </div>
      </div>
    </Modal>
  );
}
