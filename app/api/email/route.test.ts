import { afterEach, beforeEach, expect, it, vi } from "vitest";
const dobles = vi.hoisted(() => ({ usuario: vi.fn(), miembro: vi.fn(), enviar: vi.fn() }));
vi.mock("@/lib/server/auth", async () => {
  const { AuthError } = await import("@/lib/server/auth-error");
  return { AuthError, verifyIdToken: dobles.usuario };
});
vi.mock("@/lib/server/require-feature", () => ({ requireMiembro: dobles.miembro }));
vi.mock("@/lib/server/correo", () => ({ correoConfigurado: () => true, enviarCorreo: dobles.enviar }));
vi.mock("@/lib/server/rate-limit", () => ({ rateLimit: async () => ({ ok: true }), tooManyRequests: () => new Response(null, { status: 429 }) }));
import { POST } from "./route";
import { AuthError } from "@/lib/server/auth-error";

beforeEach(() => {
  vi.clearAllMocks();
  dobles.usuario.mockResolvedValue({ uid: "u1", isAnonymous: false });
  dobles.miembro.mockResolvedValue({ clinicId: "cl1", role: "admin" });
  dobles.enviar.mockResolvedValue({ id: "m1", estado: "aceptado", proveedor: "smtp" });
});
afterEach(() => vi.restoreAllMocks());
const pedir = () => new Request("http://localhost/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: "paciente@example.com", subject: "Cita", text: "Aviso" }) }) as Parameters<typeof POST>[0];

it("una sesión de demo no convierte SMTP en un relay público", async () => {
  dobles.usuario.mockResolvedValue({ uid: "demo", isAnonymous: true });
  expect((await POST(pedir())).status).toBe(403);
  expect(dobles.enviar).not.toHaveBeenCalled();
});
it("una cuenta sin membresía no envía", async () => {
  dobles.miembro.mockRejectedValue(new AuthError("Sin membresía", 403));
  expect((await POST(pedir())).status).toBe(403);
  expect(dobles.enviar).not.toHaveBeenCalled();
});
it("confirma aceptación sin declarar entrega", async () => {
  const respuesta = await POST(pedir());
  expect(respuesta.status).toBe(200);
  expect(await respuesta.json()).toEqual({ ok: true, id: "m1", estado: "aceptado" });
});
it("un error SMTP no filtra credenciales", async () => {
  const espia = vi.spyOn(console, "error").mockImplementation(() => {});
  dobles.enviar.mockRejectedValue(new Error("secreto-smtp"));
  const respuesta = await POST(pedir());
  expect(respuesta.status).toBe(502);
  expect(await respuesta.text()).not.toContain("secreto-smtp");
  expect(JSON.stringify(espia.mock.calls)).not.toContain("secreto-smtp");
});
