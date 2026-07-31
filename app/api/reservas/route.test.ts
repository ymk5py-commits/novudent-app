/**
 * Test de integración de la reserva online — ejercita la RUTA REAL.
 *
 * El POST es la frontera de verdad: la página pública filtra los horarios, pero
 * un cliente puede saltearse la UI y postear el turno que quiera. Si acá no se
 * revalida la anticipación mínima, alguien reserva para dentro de cinco minutos
 * y la clínica se entera cuando el paciente golpea la puerta.
 *
 * Firestore se mockea (la escritura real necesita el usuario de servicio, que en
 * local no está); todo lo demás —el cálculo de anticipación en la zona de la
 * clínica, el rango de fechas, los códigos de respuesta— es código de producción.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** La clínica de prueba vive en Asunción (UTC-3, sin horario de verano). */
const CLINIC = {
  name: "Clínica Demo",
  config: { timezone: "America/Asuncion", onlineBooking: { minLeadHoras: 2 } },
};

const getDocument = vi.fn(async (path: string) => (path.startsWith("clinics/") ? CLINIC : null));
/** Un dentista activo y la agenda vacía: así los slots que quedan dependen sólo
 *  de la anticipación, que es lo que este test mide. */
const listCollection = vi.fn(async (_parent: string, col: string) =>
  col === "users"
    ? [{ id: "u2", data: { role: "dentist", active: true, name: "Dra. Prueba" } }]
    : [],
);
const setDocument = vi.fn(async () => {});
const patchFields = vi.fn(async () => {});
const createIfAbsent = vi.fn(async () => true);

vi.mock("@/lib/server/firestore-rest", () => ({
  getDocument: (...a: unknown[]) => getDocument(...(a as [string])),
  listCollection: (...a: unknown[]) => listCollection(...(a as [string, string])),
  setDocument: (...a: unknown[]) => setDocument(...(a as [])),
  patchFields: (...a: unknown[]) => patchFields(...(a as [])),
  createIfAbsent: (...a: unknown[]) => createIfAbsent(...(a as [])),
  isServerFirestoreConfigured: () => true,
}));

vi.mock("@/lib/server/rate-limit", () => ({
  rateLimit: () => ({ ok: true }),
  clientIp: () => "1.2.3.4",
  tooManyRequests: () => new Response("rate", { status: 429 }),
}));

import { GET, POST } from "./route";

/** Un jueves a las 10:00 de Asunción (13:00 UTC). Jueves para no chocar con la
 *  regla de domingo cerrado. */
const AHORA = Date.parse("2026-08-06T13:00:00.000Z");
const HOY = "2026-08-06";
const MANANA = "2026-08-07";

const req = (url: string) => new Request(url) as unknown as Parameters<typeof GET>[0];
const post = (body: unknown) =>
  new Request("http://x/api/reservas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];

const datosPaciente = {
  clinicId: "cl_demo", dentistId: "u2",
  nombre: "Ana", apellido: "Prueba", ci: "1234567", telefono: "+595981000000",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  CLINIC.config.onlineBooking.minLeadHoras = 2;
});
afterEach(() => vi.useRealTimers());

describe("GET — disponibilidad", () => {
  it("con 2h de anticipación, hoy solo ofrece turnos desde las 12:00", async () => {
    const r = await GET(req(`http://x/api/reservas?clinicId=cl_demo&date=${HOY}`));
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.minLeadHoras).toBe(2);
    const slots: string[] = j.slots.u2 ?? [];
    // Son las 10:00 en la clínica: 11:30 no llega, 12:00 sí (borde exacto).
    expect(slots).not.toContain("11:30");
    expect(slots).toContain("12:00");
  });

  it("hoy YA NO se rechaza de plano — antes el rango arrancaba mañana", async () => {
    const r = await GET(req(`http://x/api/reservas?clinicId=cl_demo&date=${HOY}`));
    expect((await r.json()).ok).toBe(true);
  });

  it("con anticipación 0 aparece el turno de la hora siguiente", async () => {
    CLINIC.config.onlineBooking.minLeadHoras = 0;
    const r = await GET(req(`http://x/api/reservas?clinicId=cl_demo&date=${HOY}`));
    const slots: string[] = (await r.json()).slots.u2 ?? [];
    expect(slots).toContain("10:30");
    expect(slots).not.toContain("09:30"); // ya pasó
  });

  it("con 24h, mañana temprano desaparece pero mañana tarde queda", async () => {
    CLINIC.config.onlineBooking.minLeadHoras = 24;
    const r = await GET(req(`http://x/api/reservas?clinicId=cl_demo&date=${MANANA}`));
    const slots: string[] = (await r.json()).slots.u2 ?? [];
    expect(slots).not.toContain("08:00");
    expect(slots).toContain("11:00");
  });

  it("un día anterior a hoy se rechaza", async () => {
    const r = await GET(req("http://x/api/reservas?clinicId=cl_demo&date=2026-08-05"));
    expect(r.status).toBe(400);
  });
});

describe("POST — la frontera real", () => {
  it("rechaza un turno de hoy que no alcanza la anticipación", async () => {
    // 11:00 con 2h de anticipación y las 10:00 en la clínica: no llega.
    const r = await POST(post({ ...datosPaciente, date: HOY, time: "11:00" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/no disponible/i);
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("rechaza aunque el cliente se saltee la UI y postee un turno inmediato", async () => {
    const r = await POST(post({ ...datosPaciente, date: HOY, time: "10:00" }));
    expect(r.status).toBe(400);
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("acepta el turno que sí alcanza el borde", async () => {
    const r = await POST(post({ ...datosPaciente, date: HOY, time: "12:00" }));
    // No debe caer por la validación de fecha/anticipación. Puede seguir de
    // largo hacia el flujo de reserva, pero NO con "Horario no disponible".
    if (r.status === 400) expect((await r.json()).error).not.toMatch(/no disponible/i);
  });

  it("una anticipación ausente cae al default de 12h y NO deja pasar hoy a la tarde", async () => {
    // Es el caso de la clínica que nunca configuró nada: el control tiene que
    // seguir activo, no desaparecer por falta de config.
    CLINIC.config.onlineBooking = undefined as unknown as { minLeadHoras: number };
    const r = await POST(post({ ...datosPaciente, date: HOY, time: "16:00" }));
    expect(r.status).toBe(400);
    CLINIC.config.onlineBooking = { minLeadHoras: 2 };
  });
});
