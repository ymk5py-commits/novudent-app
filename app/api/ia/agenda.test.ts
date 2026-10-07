/**
 * Las dos rutas de IA de «Mi agenda»: dictar la semana y el resumen semanal.
 *
 * Se prueba lo que importa de cada una: que no gasten Gemini sin sesión ni plan (el gate va ANTES del
 * modelo), que lo que devuelve el modelo se valide antes de llegar a la pantalla, y que los montos
 * no salgan para quien no ve reportes financieros.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/server/auth", () => {
  class AuthError extends Error {
    status: number;
    constructor(message: string, status = 401) { super(message); this.status = status; }
  }
  return { AuthError, verifyIdToken: vi.fn(async () => ({ uid: "u1" })) };
});
vi.mock("@/lib/server/require-feature", () => ({
  requireFeature: vi.fn(async () => ({ uid: "u1", clinicId: "c1", role: "admin" })),
}));
vi.mock("@/lib/server/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: () => "1.1.1.1",
  tooManyRequests: () => new Response("demasiadas", { status: 429 }),
}));

import { AuthError, verifyIdToken } from "@/lib/server/auth";
import { requireFeature } from "@/lib/server/require-feature";

const HOY = "2026-10-06";
const GEMINI = "generativelanguage.googleapis.com";

let llamadas: { url: string; body: any }[] = [];
let respuestaGemini: () => Response;

const gemini = (texto: string, status = 200) => () =>
  new Response(JSON.stringify(status === 200 ? { candidates: [{ content: { parts: [{ text: texto }] } }] } : { error: { message: "boom" } }), { status });

beforeEach(() => {
  llamadas = [];
  respuestaGemini = gemini(JSON.stringify({ tareas: [{ titulo: "Llamar a Ana López", fecha: "2026-10-08", paciente: "Ana López" }] }));
  vi.stubEnv("GEMINI_API_KEY", "key_del_dueño");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
    llamadas.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
    return respuestaGemini();
  }));
  vi.mocked(verifyIdToken).mockResolvedValue({ uid: "u1" } as never);
  vi.mocked(requireFeature).mockResolvedValue({ uid: "u1", clinicId: "c1", role: "admin" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

// Imports explícitos: vite no resuelve un `import(`./${ruta}/route`)` armado con una variable.
const rutas = {
  "agenda-semana": () => import("./agenda-semana/route"),
  "agenda-resumen": () => import("./agenda-resumen/route"),
};

const pedir = (ruta: keyof typeof rutas, body: unknown) =>
  rutas[ruta]().then(({ POST }) =>
    POST(new Request(`https://novudent-app.vercel.app/api/ia/${ruta}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer t" }, body: JSON.stringify(body),
    }) as never));

const aGemini = () => llamadas.filter((l) => l.url.includes(GEMINI));

describe("POST /api/ia/agenda-semana", () => {
  it("con texto: arma las tareas, y las valida (una fecha pasada cae en hoy)", async () => {
    respuestaGemini = gemini(JSON.stringify({ tareas: [{ titulo: "Llamar a Ana López", fecha: "2026-10-01", paciente: "Ana López" }, { titulo: "Pedir guantes", fecha: "2026-10-09" }], transcripcion: "" }));
    const res = await pedir("agenda-semana", { texto: "el jueves pedir guantes y llamar a Ana López", hoy: HOY });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.tareas).toEqual([
      { titulo: "Llamar a Ana López", fecha: HOY, paciente: "Ana López" },
      { titulo: "Pedir guantes", fecha: "2026-10-09" },
    ]);
  });

  it("le pasa a Gemini el dictado y qué día es hoy", async () => {
    await pedir("agenda-semana", { texto: "el jueves pedir guantes", hoy: HOY });
    expect(aGemini()).toHaveLength(1);
    const prompt = aGemini()[0].body.contents[0].parts.map((p: { text?: string }) => p.text ?? "").join("\n");
    expect(prompt).toContain("el jueves pedir guantes");
    expect(prompt).toContain("2026-10-06");
    expect(prompt).toContain("martes");
  });

  it("con audio: lo manda como inline_data, sin el sufijo de codecs, y devuelve la transcripción", async () => {
    respuestaGemini = gemini(JSON.stringify({ tareas: [{ titulo: "Pedir guantes", fecha: HOY }], transcripcion: "pedir guantes hoy" }));
    const res = await pedir("agenda-semana", { audio: "QUFB", mimeType: "audio/webm;codecs=opus", hoy: HOY });
    const j = await res.json();
    expect(j.transcripcion).toBe("pedir guantes hoy");
    const partes = aGemini()[0].body.contents[0].parts;
    expect(partes.find((p: { inline_data?: unknown }) => p.inline_data)?.inline_data).toEqual({ mime_type: "audio/webm", data: "QUFB" });
  });

  it("sin texto ni audio: 400 y no gasta Gemini", async () => {
    const res = await pedir("agenda-semana", { hoy: HOY });
    expect(res.status).toBe(400);
    expect(aGemini()).toHaveLength(0);
  });

  it("con un «hoy» que no es una fecha: 400 y no gasta Gemini", async () => {
    const res = await pedir("agenda-semana", { texto: "algo", hoy: "mañana" });
    expect(res.status).toBe(400);
    expect(aGemini()).toHaveLength(0);
  });

  it("un dictado larguísimo o un audio gigante: 413 y no gasta Gemini", async () => {
    expect((await pedir("agenda-semana", { texto: "x".repeat(4001), hoy: HOY })).status).toBe(413);
    expect((await pedir("agenda-semana", { audio: "A".repeat(14 * 1024 * 1024), hoy: HOY })).status).toBe(413);
    expect(aGemini()).toHaveLength(0);
  });

  it("si el modelo no encuentra tareas: 422 con una pista", async () => {
    respuestaGemini = gemini(JSON.stringify({ tareas: [], transcripcion: "" }));
    const res = await pedir("agenda-semana", { texto: "hola", hoy: HOY });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/tareas/);
  });

  it("si Gemini falla: 502 con un mensaje genérico (no filtra el detalle)", async () => {
    respuestaGemini = gemini("", 500);
    const res = await pedir("agenda-semana", { texto: "algo", hoy: HOY });
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("boom");
  });

  it("sin sesión: 401 y no gasta Gemini", async () => {
    vi.mocked(verifyIdToken).mockRejectedValueOnce(new AuthError("sin token", 401));
    const res = await pedir("agenda-semana", { texto: "algo", hoy: HOY });
    expect(res.status).toBe(401);
    expect(aGemini()).toHaveLength(0);
  });

  it("sin el plan con IA: 403 y no gasta Gemini", async () => {
    vi.mocked(requireFeature).mockRejectedValueOnce(new AuthError("Tu plan no incluye Novudent IA.", 403));
    const res = await pedir("agenda-semana", { texto: "algo", hoy: HOY });
    expect(res.status).toBe(403);
    expect(aGemini()).toHaveLength(0);
    expect(vi.mocked(requireFeature)).toHaveBeenCalledWith("u1", "ia");
  });
});

describe("POST /api/ia/agenda-resumen", () => {
  const datos = {
    hoy: HOY, semana: { desde: "2026-10-05", hasta: "2026-10-11" },
    misTareas: { total: 4, hechas: 1, pendientes: 3, atrasadas: 1 },
    produccionSemanaGs: 4_567_890,
  };

  beforeEach(() => { respuestaGemini = gemini("• Vas 1 de 4 tareas.\n• Tenés 1 atrasada."); });

  it("devuelve el resumen y le pasa los datos a Gemini", async () => {
    const res = await pedir("agenda-resumen", { datos });
    expect(res.status).toBe(200);
    expect((await res.json()).resumen).toContain("Vas 1 de 4 tareas");
    expect(JSON.stringify(aGemini()[0].body)).toContain('\\"hechas\\":1');
  });

  it("la producción solo viaja si el rol ve reportes financieros (admin sí)", async () => {
    await pedir("agenda-resumen", { datos });
    expect(JSON.stringify(aGemini()[0].body)).toContain("4567890");
  });

  it("…y NO viaja si el rol no los ve, aunque el navegador la mande", async () => {
    vi.mocked(requireFeature).mockResolvedValue({ uid: "u1", clinicId: "c1", role: "receptionist" });
    await pedir("agenda-resumen", { datos });
    expect(JSON.stringify(aGemini()[0].body)).not.toContain("4567890");
  });

  it("sin datos: 400; con datos enormes: 413; ninguno gasta Gemini", async () => {
    expect((await pedir("agenda-resumen", {})).status).toBe(400);
    expect((await pedir("agenda-resumen", { datos: "x" })).status).toBe(400);
    expect((await pedir("agenda-resumen", { datos: { basura: "x".repeat(30_000) } })).status).toBe(413);
    expect(aGemini()).toHaveLength(0);
  });

  it("si Gemini falla: 502", async () => {
    respuestaGemini = gemini("", 500);
    expect((await pedir("agenda-resumen", { datos })).status).toBe(502);
  });

  it("sin el plan con IA: 403 y no gasta Gemini", async () => {
    vi.mocked(requireFeature).mockRejectedValueOnce(new AuthError("Tu plan no incluye Novudent IA.", 403));
    expect((await pedir("agenda-resumen", { datos })).status).toBe(403);
    expect(aGemini()).toHaveLength(0);
  });
});
