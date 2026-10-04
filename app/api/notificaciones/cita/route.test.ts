/** Aviso de cita por correo: la ruta real, con Firestore, la sesión y Resend simulados. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const DOCS: Record<string, Record<string, unknown> | null> = {};
vi.mock("@/lib/server/firestore-rest", () => ({
  getDocument: vi.fn(async (path: string) => DOCS[path] ?? null),
  patchFields: vi.fn(async () => {}),
  isServerFirestoreConfigured: () => true,
}));
vi.mock("@/lib/server/auth", () => ({
  verifyIdToken: vi.fn(async () => ({ uid: "uid_recep" })),
  AuthError: class AuthError extends Error { status = 403; },
}));
let ROL = "receptionist";
vi.mock("@/lib/server/require-feature", () => ({
  requireMiembro: vi.fn(async () => ({ uid: "uid_recep", clinicId: "cl_1", role: ROL })),
}));
vi.mock("@/lib/server/rate-limit", () => ({
  rateLimit: () => ({ ok: true }),
  clientIp: () => "1.2.3.4",
  tooManyRequests: () => new Response("rate", { status: 429 }),
}));

import { POST } from "./route";
import { patchFields } from "@/lib/server/firestore-rest";

const post = (body: unknown) =>
  new Request("http://x/api/notificaciones/cita", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as unknown as Parameters<typeof POST>[0];

const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));

beforeEach(() => {
  ROL = "receptionist";
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Clínica Demo <avisos@ejemplo.com>";
  Object.assign(DOCS, {
    "clinics/cl_1": { name: "Clínica Demo", config: { timezone: "America/Asuncion" } },
    "clinics/cl_1/appointments/a1": { patientId: "p1", dentistId: "u2", start: "2026-10-06T13:00:00.000Z", status: "pendiente" },
    "clinics/cl_1/patients/p1": { firstName: "María", email: "maria@example.com" },
    "clinics/cl_1/users/u2": { name: "Dra. Sofía Benítez" },
  });
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM; });

describe("POST /api/notificaciones/cita", () => {
  it("sin Resend configurado responde 503 y no manda nada", async () => {
    delete process.env.RESEND_API_KEY;
    const r = await POST(post({ appointmentId: "a1", tipo: "confirmacion" }));
    expect(r.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("manda la confirmación al email del paciente, armada con los datos guardados", async () => {
    const r = await POST(post({ appointmentId: "a1", tipo: "confirmacion", texto: "esto lo ignora" }));
    expect((await r.json()).ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const enviado = JSON.parse(String(init.body));
    expect(enviado.to).toEqual(["maria@example.com"]);
    expect(enviado.subject).toContain("Clínica Demo");
    expect(enviado.text).toContain("Dra. Sofía Benítez");
    expect(enviado.text).not.toContain("esto lo ignora");
  });

  it("la confirmación lleva el link para confirmar o anular, y la cita guarda su token", async () => {
    DOCS["clinics/cl_1/appointments/a1"] = { patientId: "p1", dentistId: "u2", start: new Date(Date.now() + 3 * 86_400_000).toISOString(), status: "pendiente" };
    vi.mocked(patchFields).mockClear();
    await POST(post({ appointmentId: "a1", tipo: "confirmacion" }));
    const enviado = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    const [ruta, campos] = vi.mocked(patchFields).mock.calls[0] as unknown as [string, { confirmToken: string }];
    expect(ruta).toBe("clinics/cl_1/appointments/a1");
    expect(enviado.text).toContain(`/confirmar/cl_1/${campos.confirmToken}?v=mail`);
    expect(enviado.html).toContain("Confirmar o anular mi cita");
  });

  it("si la cita ya tiene token lo reusa, y el aviso de estado no lleva link", async () => {
    DOCS["clinics/cl_1/appointments/a1"] = { patientId: "p1", start: new Date(Date.now() + 3 * 86_400_000).toISOString(), status: "pendiente", confirmToken: "tok_ABCDEFGHIJKLmnop" };
    vi.mocked(patchFields).mockClear();
    await POST(post({ appointmentId: "a1", tipo: "confirmacion" }));
    expect(patchFields).not.toHaveBeenCalled();
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).text).toContain("/confirmar/cl_1/tok_ABCDEFGHIJKLmnop");
    fetchMock.mockClear();
    await POST(post({ appointmentId: "a1", tipo: "estado" }));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).text).not.toContain("/confirmar/");
  });

  it("un rol sin datos personales no le escribe al paciente", async () => {
    ROL = "dentist";
    const r = await POST(post({ appointmentId: "a1", tipo: "confirmacion" }));
    expect(r.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si el paciente no tiene email, lo dice", async () => {
    DOCS["clinics/cl_1/patients/p1"] = { firstName: "María" };
    const r = await POST(post({ appointmentId: "a1", tipo: "estado" }));
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/email/);
  });

  it("rechaza un tipo de aviso desconocido", async () => {
    const r = await POST(post({ appointmentId: "a1", tipo: "promo" }));
    expect(r.status).toBe(400);
  });
});
