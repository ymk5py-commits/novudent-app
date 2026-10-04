/** Confirmación de cita por link: la ruta real, con Firestore y el rate limit simulados. */
import { describe, it, expect, beforeEach, vi } from "vitest";

const TOKEN = "tok_ABCDEFGHIJKLmnop";
const DOCS: Record<string, Record<string, unknown> | null> = {};
const CITAS: Array<{ id: string; data: Record<string, unknown> }> = [];
const patchFields = vi.fn(async () => {});
vi.mock("@/lib/server/firestore-rest", () => ({
  isServerFirestoreConfigured: () => true,
  getDocument: vi.fn(async (path: string) => DOCS[path] ?? null),
  queryWhere: vi.fn(async (_parent: string, _col: string, _field: string, value: unknown) => CITAS.filter((c) => c.data.confirmToken === value)),
  patchFields: (...a: unknown[]) => patchFields(...(a as [])),
}));
vi.mock("@/lib/server/rate-limit", () => ({
  rateLimit: () => ({ ok: true }),
  clientIp: () => "1.2.3.4",
  tooManyRequests: () => new Response("rate", { status: 429 }),
}));

import { GET, POST } from "./route";

const get = (q: string) => GET(new Request(`http://x/api/citas/confirmar?${q}`) as unknown as Parameters<typeof GET>[0]);
const post = (body: unknown) => POST(new Request("http://x/api/citas/confirmar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as unknown as Parameters<typeof POST>[0]);
const futuro = new Date(Date.now() + 3 * 86_400_000).toISOString();

beforeEach(() => {
  patchFields.mockClear();
  CITAS.length = 0;
  CITAS.push({ id: "a1", data: { confirmToken: TOKEN, patientId: "p1", dentistId: "u2", start: futuro, end: futuro, status: "pendiente" } });
  Object.assign(DOCS, {
    "clinics/cl_1": { name: "Clínica Demo", config: { phone: "+595 21 555 000" } },
    "clinics/cl_1/patients/p1": { firstName: "María", lastName: "González", document: "3456789", phone: "+595981111111" },
    "clinics/cl_1/users/u2": { name: "Dra. Sofía Benítez" },
  });
});

describe("GET /api/citas/confirmar", () => {
  it("devuelve la cita con el nombre de pila, sin documento ni teléfono del paciente", async () => {
    const r = await get(`cid=cl_1&token=${TOKEN}`);
    const d = await r.json();
    expect(d).toMatchObject({ ok: true, clinica: "Clínica Demo", paciente: "María", profesional: "Dra. Sofía Benítez", estado: "pendiente", puedeResponder: true });
    const crudo = JSON.stringify(d);
    expect(crudo).not.toContain("3456789");
    expect(crudo).not.toContain("González");
    expect(crudo).not.toContain("+595981111111");
  });
  it("token inexistente o mal formado: el mismo 404 genérico", async () => {
    expect((await get("cid=cl_1&token=otroTokenQueNoExiste1")).status).toBe(404);
    expect((await get("cid=cl_1&token=../x")).status).toBe(404);
    expect((await get(`cid=../../x&token=${TOKEN}`)).status).toBe(404);
  });
});

describe("POST /api/citas/confirmar", () => {
  it("confirmar por WhatsApp escribe solo los campos que cambian", async () => {
    const r = await post({ cid: "cl_1", token: TOKEN, accion: "confirmar", v: "wa" });
    expect(await r.json()).toEqual({ ok: true, resultado: "confirmada" });
    expect(patchFields).toHaveBeenCalledWith("clinics/cl_1/appointments/a1", expect.objectContaining({ status: "confirmada", estadoId: "confirmado_whatsapp", confirmedVia: "link" }));
  });
  it("anular libera la cita", async () => {
    await post({ cid: "cl_1", token: TOKEN, accion: "anular" });
    expect(patchFields).toHaveBeenCalledWith("clinics/cl_1/appointments/a1", expect.objectContaining({ status: "cancelada", estadoId: "anulado_paciente" }));
  });
  it("una cita ya anulada no se puede volver a tocar desde el link", async () => {
    CITAS[0].data.status = "cancelada";
    const r = await post({ cid: "cl_1", token: TOKEN, accion: "confirmar" });
    expect(r.status).toBe(409);
    expect(patchFields).not.toHaveBeenCalled();
  });
  it("acción desconocida o token ajeno: no escribe nada", async () => {
    expect((await post({ cid: "cl_1", token: TOKEN, accion: "borrar" })).status).toBe(400);
    expect((await post({ cid: "cl_1", token: "otroTokenQueNoExiste1", accion: "anular" })).status).toBe(404);
    expect(patchFields).not.toHaveBeenCalled();
  });
});
