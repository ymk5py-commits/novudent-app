/**
 * GET /api/reservas SIN fecha — el nombre de la clínica para el encabezado de la página pública.
 *
 * `/reservar/{clinicId}` mostraba «NOVUdent» arriba y «Reservá tu cita» como título, y el nombre de la clínica aparecía recién
 * después de elegir un día (el GET de disponibilidad exige una fecha). Sin fecha, la ruta contesta SOLO el nombre: nada de
 * profesionales, agenda ni configuración. Es una ruta pública: este test fija qué se expone y qué no.
 *
 * Firestore se mockea igual que en route.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const CLINIC = {
  name: "Clínica Aura",
  email: "contacto@aura.example",
  config: {
    timezone: "America/Asuncion",
    phone: "+595 21 555 000",
    botika: { connected: true, automations: { confirmCita: true }, templates: { confirmCita: "SECRETO" } },
  },
};

const getDocument = vi.fn(async (path: string) => (path === "clinics/cl_aura" ? CLINIC : null));
const listCollection = vi.fn(async (_parent: string, col: string) =>
  col === "users" ? [{ id: "u2", data: { role: "dentist", active: true, name: "Dra. Prueba" } }] : [],
);
const rateLimit = vi.fn(() => ({ ok: true }));

vi.mock("@/lib/server/firestore-rest", () => ({
  getDocument: (...a: unknown[]) => getDocument(...(a as [string])),
  listCollection: (...a: unknown[]) => listCollection(...(a as [string, string])),
  setDocument: async () => {},
  patchFields: async () => {},
  createIfAbsent: async () => true,
  isServerFirestoreConfigured: () => true,
}));

vi.mock("@/lib/server/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => rateLimit(...(a as [])),
  clientIp: () => "1.2.3.4",
  tooManyRequests: () => new Response("rate", { status: 429 }),
}));

import { GET } from "./route";

const req = (url: string) => new Request(url) as unknown as Parameters<typeof GET>[0];

beforeEach(() => {
  getDocument.mockClear();
  listCollection.mockClear();
  rateLimit.mockClear();
});

describe("GET /api/reservas?clinicId=… (sin fecha)", () => {
  it("contesta el nombre de la clínica", async () => {
    const r = await GET(req("http://x/api/reservas?clinicId=cl_aura"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, clinic: { name: "Clínica Aura" } });
  });

  it("no expone profesionales, horarios, citas ni nada de la configuración de la clínica", async () => {
    const r = await GET(req("http://x/api/reservas?clinicId=cl_aura"));
    const texto = JSON.stringify(await r.json());
    for (const prohibido of ["dentists", "Dra. Prueba", "slots", "SECRETO", "botika", "contacto@aura.example", "+595", "timezone"]) {
      expect(texto, prohibido).not.toContain(prohibido);
    }
    // Ni siquiera lee la agenda ni los usuarios para contestar esto.
    expect(listCollection).not.toHaveBeenCalled();
  });

  it("una clínica que no existe da 404", async () => {
    const r = await GET(req("http://x/api/reservas?clinicId=cl_no_existe"));
    expect(r.status).toBe(404);
    expect((await r.json()).ok).toBe(false);
  });

  it("un clinicId inválido da 400 y ni consulta Firestore", async () => {
    for (const malo of ["", "../otra", "a b", "x".repeat(80)]) {
      const r = await GET(req(`http://x/api/reservas?clinicId=${encodeURIComponent(malo)}`));
      expect(r.status, `clinicId «${malo}»`).toBe(400);
    }
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("sigue pasando por el límite de pedidos de siempre", async () => {
    await GET(req("http://x/api/reservas?clinicId=cl_aura"));
    expect(rateLimit).toHaveBeenCalledTimes(1);
  });

  it("una clínica sin nombre cargado contesta un nombre genérico, nunca vacío", async () => {
    getDocument.mockResolvedValueOnce({ config: {} } as never);
    const r = await GET(req("http://x/api/reservas?clinicId=cl_aura"));
    expect((await r.json()).clinic.name).toBe("Clínica");
  });

  it("con una fecha inválida sigue siendo un error (no se confunde con «sin fecha»)", async () => {
    const r = await GET(req("http://x/api/reservas?clinicId=cl_aura&date=mañana"));
    expect(r.status).toBe(400);
  });
});
