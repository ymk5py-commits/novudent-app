import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const smtp = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn(), createTransport: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.createTransport } }));
import { correoConfigurado, enviarCorreo } from "./correo";

const mensaje = { to: ["paciente@example.com"], subject: "Tu cita", text: "Aviso de Novudent" };
beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ["CORREO_PROVEEDOR", "RESEND_API_KEY", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"]) vi.stubEnv(k, "");
  vi.stubEnv("EMAIL_FROM", "Novudent <avisos@example.com>");
  smtp.createTransport.mockReturnValue(smtp);
  smtp.sendMail.mockResolvedValue({ messageId: "smtp-1", accepted: mensaje.to, rejected: [] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function activarSmtp(port = "587") {
  vi.stubEnv("CORREO_PROVEEDOR", "smtp"); vi.stubEnv("SMTP_HOST", "smtp.example.com"); vi.stubEnv("SMTP_USER", "avisos@example.com");
  vi.stubEnv("SMTP_PASSWORD", "contraseña-secreta"); vi.stubEnv("SMTP_PORT", port);
}

describe("correo propio", () => {
  it("sin cuenta configurada rechaza y no simula éxito", async () => {
    expect(correoConfigurado()).toBe(false);
    await expect(enviarCorreo(mensaje)).rejects.toMatchObject({ codigo: "configuracion" });
    expect(smtp.createTransport).not.toHaveBeenCalled();
  });
  it.each(["465", "587"])("SMTP en %s exige TLS y distingue aceptación de entrega", async (port) => {
    activarSmtp(port);
    expect(await enviarCorreo({ ...mensaje, reply_to: "clinica@example.com" })).toEqual({ id: "smtp-1", estado: "aceptado", proveedor: "smtp" });
    expect(smtp.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: Number(port), secure: port === "465", requireTLS: true,
      tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" }, disableFileAccess: true, disableUrlAccess: true }));
    expect(smtp.sendMail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: "clinica@example.com" }));
    expect(smtp.close).toHaveBeenCalledOnce();
  });
  it("una configuración SMTP incompleta no vuelve silenciosamente a Resend", () => {
    activarSmtp(); vi.stubEnv("SMTP_PASSWORD", ""); vi.stubEnv("RESEND_API_KEY", "re_test");
    expect(correoConfigurado()).toBe(false);
  });
  it("un rechazo parcial no se declara éxito", async () => {
    activarSmtp(); smtp.sendMail.mockResolvedValue({ messageId: "id", accepted: [], rejected: mensaje.to });
    await expect(enviarCorreo(mensaje)).rejects.toMatchObject({ codigo: "proveedor" });
  });
  it("un fallo no expone credenciales ni reintenta un envío posiblemente aceptado", async () => {
    activarSmtp(); smtp.sendMail.mockRejectedValue(new Error("contraseña-secreta paciente@example.com"));
    await expect(enviarCorreo(mensaje)).rejects.toThrow("El servidor de correo no confirmó el envío.");
    expect(smtp.sendMail).toHaveBeenCalledOnce(); expect(smtp.close).toHaveBeenCalledOnce();
  });
  it.each([
    { ...mensaje, subject: "Cita\r\nBcc: intruso@example.com" },
    { ...mensaje, to: ["a@example.com,b@example.com"] },
    { ...mensaje, text: "a".repeat(1_048_577) },
    { ...mensaje, to: Array(11).fill("a@example.com") },
    { ...mensaje, reply_to: "a@example.com\r\nBcc: b@example.com" },
  ])("rechaza mensajes inválidos antes de contactar SMTP", async (m) => {
    activarSmtp(); await expect(enviarCorreo(m)).rejects.toMatchObject({ codigo: "mensaje" });
    expect(smtp.createTransport).not.toHaveBeenCalled();
  });
  it("conserva Resend para instalaciones existentes", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "re_1" }), { status: 200 })); vi.stubGlobal("fetch", f);
    expect(await enviarCorreo(mensaje)).toEqual({ id: "re_1", estado: "aceptado", proveedor: "resend" });
    expect(smtp.createTransport).not.toHaveBeenCalled();
  });
});
