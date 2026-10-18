/** Salida de correo del servidor. SMTP permite usar una cuenta propia; Resend queda como compatibilidad explícita.
 * «Aceptado» significa que el servidor recibió el mensaje, no que llegó a la bandeja del destinatario.
 * No se reintenta automáticamente: un timeout después de DATA puede haber aceptado el mensaje y reenviarlo lo duplicaría. */
import nodemailer from "nodemailer";

/** Los remitentes que Novudent conoce. Cada uno es una dirección del dominio con su propio papel:
 *  - `hola`: conversación con una persona (pedidos de acceso, respuestas); aquí SÍ se lee lo que contesten.
 *  - `info`: información general y comercial.
 *  - `no-reply`: avisos automáticos (citas, recuperación de contraseña); nadie lee las respuestas.
 *  Para sumar otro: agregarlo acá y cargar `EMAIL_FROM_<ID>` en Coolify (`-` pasa a `_`). La dirección vive en
 *  el entorno, no en el código, así que cambiarla no obliga a compilar. Sin `EMAIL_FROM_<ID>` se usa `EMAIL_FROM`. */
export const REMITENTES = ["hola", "info", "no-reply"] as const;
export type RemitenteId = (typeof REMITENTES)[number];

export interface MensajeCorreo { to: string[]; subject: string; text?: string; html?: string; reply_to?: string; remitente?: RemitenteId }
export interface CorreoAceptado { id: string; estado: "aceptado"; proveedor: "smtp" | "resend" }
export class ErrorCorreo extends Error {
  constructor(public readonly codigo: "configuracion" | "mensaje" | "proveedor") {
    super(codigo === "configuracion" ? "El envío de correos no está configurado." : codigo === "mensaje" ? "El mensaje de correo no es válido." : "El servidor de correo no confirmó el envío.");
  }
}

function configuracion(remitente?: RemitenteId) {
  if (remitente !== undefined && !REMITENTES.includes(remitente)) throw new ErrorCorreo("mensaje");
  const sufijo = remitente?.toUpperCase().replace(/-/g, "_");
  const proveedor = process.env.CORREO_PROVEEDOR?.trim().toLowerCase() || (process.env.SMTP_HOST ? "smtp" : "resend");
  const from = (sufijo && process.env[`EMAIL_FROM_${sufijo}`]) || process.env.EMAIL_FROM;
  if (!from || /[\r\n]/.test(from)) throw new ErrorCorreo("configuracion");
  if (proveedor === "resend" && process.env.RESEND_API_KEY) return { proveedor, from, key: process.env.RESEND_API_KEY } as const;
  if (proveedor === "smtp") {
    const port = Number(process.env.SMTP_PORT || "587");
    const host = process.env.SMTP_HOST?.trim();
    // Un remitente puede tener su propia cuenta (ImprovMX da un usuario por dirección). Usuario y contraseña van juntos:
    // si falta uno de los dos NO se completa con la cuenta común, porque se mandaría con la identidad equivocada.
    const propioUser = sufijo ? process.env[`SMTP_USER_${sufijo}`] : undefined;
    const propioPass = sufijo ? process.env[`SMTP_PASSWORD_${sufijo}`] : undefined;
    if (Boolean(propioUser) !== Boolean(propioPass)) throw new ErrorCorreo("configuracion");
    const user = propioUser || process.env.SMTP_USER;
    const pass = propioPass || process.env.SMTP_PASSWORD;
    if (!host || /[\s/]/.test(host) || !user || !pass || ![465, 587].includes(port)) throw new ErrorCorreo("configuracion");
    return { proveedor, from, host, port, user, pass } as const;
  }
  throw new ErrorCorreo("configuracion");
}

export function correoConfigurado(remitente?: RemitenteId): boolean {
  try { configuracion(remitente); return true; } catch { return false; }
}

export async function enviarCorreo(m: MensajeCorreo): Promise<CorreoAceptado> {
  const c = configuracion(m.remitente);
  const direccion = (s: unknown): s is string => typeof s === "string" && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(s);
  if (!Array.isArray(m.to) || !m.to.length || m.to.length > 10 || !m.to.every(direccion)
    || typeof m.subject !== "string" || !m.subject.trim() || m.subject.length > 200 || /[\r\n]/.test(m.subject)
    || (!m.text && !m.html) || (m.text !== undefined && typeof m.text !== "string") || (m.html !== undefined && typeof m.html !== "string")
    || (m.reply_to !== undefined && !direccion(m.reply_to))
    || Buffer.byteLength((m.text || "") + (m.html || ""), "utf8") > 1_048_576) throw new ErrorCorreo("mensaje");
  try {
    if (c.proveedor === "resend") {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.key}` },
        // Campos explícitos: `remitente` es nuestro, Resend lo rechazaría como desconocido.
        body: JSON.stringify({ from: c.from, to: m.to, subject: m.subject, text: m.text, html: m.html, reply_to: m.reply_to }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || typeof body.id !== "string" || !body.id) throw new ErrorCorreo("proveedor");
      return { id: body.id, estado: "aceptado", proveedor: "resend" };
    }
    const transporte = nodemailer.createTransport({
      host: c.host, port: c.port, secure: c.port === 465, requireTLS: true,
      auth: { user: c.user, pass: c.pass }, tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
    });
    try {
      const r = await transporte.sendMail({ from: c.from, to: m.to, subject: m.subject, text: m.text, html: m.html, replyTo: m.reply_to });
      if (!r.messageId || r.rejected?.length || r.accepted?.length !== m.to.length) throw new ErrorCorreo("proveedor");
      return { id: r.messageId, estado: "aceptado", proveedor: "smtp" };
    } finally { transporte.close(); }
  } catch {
    // Los errores SMTP pueden contener credenciales, destinatarios y texto del servidor: no se propagan ni se registran.
    throw new ErrorCorreo("proveedor");
  }
}
