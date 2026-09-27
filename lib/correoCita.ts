/* Correo al paciente sobre su cita (confirmación o cambio de estado). Se arma del lado
 * del servidor con los datos guardados, nunca con texto que mande el navegador: así la
 * ruta no sirve para mandar correos arbitrarios en nombre de la clínica. */
import { ESTADO_LABEL } from "./estadosCita";
import type { AppointmentStatus } from "./types";
import { SITE_URL } from "./site";

export type TipoCorreoCita = "confirmacion" | "estado";

export interface DatosCorreoCita {
  clinica: string;
  paciente: string;
  profesional?: string;
  sucursal?: string;
  inicio: string; // ISO
  estado: AppointmentStatus;
  zonaHoraria?: string;
}

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function correoCita(tipo: TipoCorreoCita, d: DatosCorreoCita): { asunto: string; texto: string; html: string } {
  const tz = d.zonaHoraria || "America/Asuncion";
  const fecha = new Date(d.inicio).toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
  const hora = new Date(d.inicio).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
  const cuando = `${fecha} a las ${hora}`;
  const detalle = [d.profesional && `Profesional: ${d.profesional}`, d.sucursal && `Sucursal: ${d.sucursal}`].filter(Boolean) as string[];
  const asunto = tipo === "confirmacion"
    ? `Tu cita en ${d.clinica}: ${cuando}`
    : `Tu cita en ${d.clinica} del ${fecha}: ${ESTADO_LABEL[d.estado].toLowerCase()}`;
  const cuerpo = tipo === "confirmacion"
    ? [`Hola ${d.paciente}:`, `Te esperamos el ${cuando} en ${d.clinica}.`, ...detalle, "Si no podés venir, respondé este correo y te ayudamos a cambiar el horario."]
    : [`Hola ${d.paciente}:`, `Tu cita del ${cuando} en ${d.clinica} quedó como «${ESTADO_LABEL[d.estado]}».`, ...detalle, "Ante cualquier duda, respondé este correo."];
  const texto = cuerpo.join("\n\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#051735">${cuerpo.map((p) => `<p>${escapar(p)}</p>`).join("")}<p style="color:#6b7a8f;font-size:12px">${escapar(d.clinica)} · enviado con Novudent</p><img src="${SITE_URL}/marca/novudent-logo.png" alt="Novudent" width="110" height="21" style="display:block;border:0"></div>`;
  return { asunto, texto, html };
}
