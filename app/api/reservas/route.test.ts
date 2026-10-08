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
/** Las consultas que filtran EN Firestore (las citas de un día, un paciente por CI): por defecto no devuelven nada. */
type Fila = { id: string; data: Record<string, unknown> };
const queryRange = vi.fn(async (..._a: unknown[]): Promise<Fila[]> => []);
const queryIn = vi.fn(async (..._a: unknown[]): Promise<Fila[]> => []);

vi.mock("@/lib/server/firestore-rest", () => ({
  getDocument: (...a: unknown[]) => getDocument(...(a as [string])),
  listCollection: (...a: unknown[]) => listCollection(...(a as [string, string])),
  setDocument: (...a: unknown[]) => setDocument(...(a as [])),
  patchFields: (...a: unknown[]) => patchFields(...(a as [])),
  createIfAbsent: (...a: unknown[]) => createIfAbsent(...(a as [])),
  queryRange: (...a: unknown[]) => queryRange(...a),
  queryIn: (...a: unknown[]) => queryIn(...a),
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

describe("campos extra (Pacientes → Configuración, columna «Agenda online»)", () => {
  const conCampos = (pf: unknown) => { (CLINIC.config as Record<string, unknown>).patientFields = pf; };
  const listaOriginal = listCollection.getMockImplementation()!;
  const llamadas = () => setDocument.mock.calls as unknown as [string, Record<string, unknown>][];
  const docPaciente = () => llamadas().find(([path]) => path.includes("/patients/"))?.[1];
  const turno = { ...datosPaciente, date: MANANA, time: "11:00" };

  beforeEach(() => { setDocument.mockClear(); createIfAbsent.mockClear(); });
  afterEach(() => {
    delete (CLINIC.config as Record<string, unknown>).patientFields;
    listCollection.mockImplementation(listaOriginal);
  });

  it("el GET publica los campos que pide la clínica (solo clave, etiqueta, tipo y si es requerido)", async () => {
    conCampos({ email: { present: { online: true }, required: { online: true } }, fechaNacimiento: { present: { online: true } } });
    const j = await (await GET(req(`http://x/api/reservas?clinicId=cl_demo&date=${MANANA}`))).json();
    expect(j.campos).toEqual([
      { key: "fechaNacimiento", label: "Fecha de nacimiento", tipo: "fecha", requerido: false },
      { key: "email", label: "Email", tipo: "email", requerido: true },
    ]);
  });

  it("sin configuración pide solo el email, obligatorio (la reserva crea la ficha del paciente)", async () => {
    const j = await (await GET(req(`http://x/api/reservas?clinicId=cl_demo&date=${MANANA}`))).json();
    expect(j.campos).toEqual([{ key: "email", label: "Email", tipo: "email", requerido: true }]);
  });

  it("sin configuración, una reserva sin email se rechaza sin tomar el turno; con email entra", async () => {
    const sin = await POST(post(turno));
    expect(sin.status).toBe(400);
    expect((await sin.json()).error).toMatch(/Email/);
    expect(createIfAbsent).not.toHaveBeenCalled();
    const con = await POST(post({ ...turno, extras: { email: "ana@correo.com" } }));
    expect(con.status).toBe(200);
    expect(docPaciente()).toMatchObject({ email: "ana@correo.com" });
  });

  it("si falta un extra requerido rechaza la reserva sin tomar el turno", async () => {
    conCampos({ email: { present: { online: true }, required: { online: true } } });
    const r = await POST(post(turno));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/Email/);
    expect(createIfAbsent).not.toHaveBeenCalled();
    expect(setDocument).not.toHaveBeenCalled();
  });

  it("un email mal escrito cuenta como faltante", async () => {
    conCampos({ email: { present: { online: true }, required: { online: true } } });
    const r = await POST(post({ ...turno, extras: { email: "no-es-un-mail" } }));
    expect(r.status).toBe(400);
  });

  it("guarda los extras válidos en el paciente nuevo y descarta lo que la clínica no pidió", async () => {
    conCampos({ email: { present: { online: true }, required: { online: true } }, ciudad: { present: { online: true } }, numeroInterno: { present: { online: true } } });
    const r = await POST(post({ ...turno, extras: { email: "Ana@Mail.com", ciudad: "Luque", direccion: "no la pidieron", numeroInterno: "X-1", firstName: "hack" } }));
    expect((await r.json()).ok).toBe(true);
    const p = docPaciente();
    expect(p).toMatchObject({ firstName: "Ana", lastName: "Prueba", document: "1234567", email: "ana@mail.com", city: "Luque" });
    expect(p).not.toHaveProperty("address");
    expect(p).not.toHaveProperty("internalNumber"); // no aplica en la reserva online
  });

  it("a un paciente que ya existe (mismo CI) no le pisa los datos", async () => {
    conCampos({ email: { present: { online: true } } });
    listCollection.mockImplementation((async (_parent: string, col: string) =>
      col === "users" ? [{ id: "u2", data: { role: "dentist", active: true, name: "Dra. Prueba" } }]
        : col === "patients" ? [{ id: "p9", data: { document: "1234567" } }]
        : []) as unknown as typeof listaOriginal,
    );
    const r = await POST(post({ ...turno, extras: { email: "otro@mail.com" } }));
    expect((await r.json()).ok).toBe(true);
    expect(docPaciente()).toBeUndefined();
  });
});

/* ===== La agenda ocupada se mide en la hora de la clínica =====
 * Las citas del panel se guardan como instante UTC («…T12:00:00.000Z» = 09:00 en Asunción) y las online como hora local sin zona. Comparar
 * `start.slice(11, 16)` con los turnos de la grilla dejaba libre el turno ocupado y ocupaba otro: la reserva online pisaba citas. */
describe("agenda ocupada: citas del panel (UTC) y reservas online (hora local)", () => {
  const listaOriginal = listCollection.getMockImplementation()!;
  const llamadas = () => setDocument.mock.calls as unknown as [string, Record<string, unknown>][];
  // Las citas del día salen de queryRange (filtrado en Firestore), no de listCollection.
  const conCitas = (citas: Record<string, unknown>[], pacientes: { id: string; data: Record<string, unknown> }[] = []) => {
    queryRange.mockImplementation(async () => citas.map((data, i) => ({ id: `a${i}`, data })));
    listCollection.mockImplementation((async (_parent: string, col: string) =>
      col === "users" ? [{ id: "u2", data: { role: "dentist", active: true, name: "Dra. Prueba" } }, { id: "u4", data: { role: "dentist", active: true, name: "Dr. Otro" } }]
        : col === "patients" ? pacientes
        : []) as unknown as typeof listaOriginal);
  };
  const cita = (start: string, end: string, extra: Record<string, unknown> = {}) => ({ dentistId: "u2", status: "confirmada", start, end, ...extra });
  const slotsDe = async (dentista = "u2") => ((await (await GET(req(`http://x/api/reservas?clinicId=cl_demo&date=${MANANA}`))).json()).slots[dentista] ?? []) as string[];
  const turno = (time: string) => ({ ...datosPaciente, date: MANANA, time, extras: { email: "ana@correo.com" } });

  beforeEach(() => { setDocument.mockClear(); createIfAbsent.mockClear(); });
  afterEach(() => { listCollection.mockImplementation(listaOriginal); queryRange.mockImplementation(async () => []); });

  it("una cita del panel de las 09:00 (guardada en UTC) saca el turno de las 09:00 y no el de las 12:00", async () => {
    conCitas([cita("2026-08-07T12:00:00.000Z", "2026-08-07T12:30:00.000Z")]);
    const slots = await slotsDe();
    expect(slots).not.toContain("09:00");
    expect(slots).toContain("12:00");
  });

  it("una cita larga saca todos los turnos que pisa", async () => {
    conCitas([cita("2026-08-07T12:00:00.000Z", "2026-08-07T13:00:00.000Z")]);
    const slots = await slotsDe();
    expect(slots).not.toContain("09:00");
    expect(slots).not.toContain("09:30");
    expect(slots).toContain("10:00");
  });

  it("una reserva online (hora local sin zona) saca su turno", async () => {
    conCitas([cita("2026-08-07T11:00:00", "2026-08-07T11:30:00", { source: "online", status: "pendiente" })]);
    const slots = await slotsDe();
    expect(slots).not.toContain("11:00");
    expect(slots).toContain("11:30");
  });

  it("una cita cancelada no ocupa, y la de otro profesional tampoco", async () => {
    conCitas([cita("2026-08-07T12:00:00.000Z", "2026-08-07T12:30:00.000Z", { status: "cancelada" }), cita("2026-08-07T13:00:00.000Z", "2026-08-07T13:30:00.000Z", { dentistId: "u4" })]);
    expect(await slotsDe("u2")).toContain("09:00");
    expect(await slotsDe("u2")).toContain("10:00");
    expect(await slotsDe("u4")).not.toContain("10:00");
  });

  it("el POST no deja tomar un turno que una cita del panel ya ocupa (aunque el horario sea el mismo en hora local)", async () => {
    conCitas([cita("2026-08-07T12:00:00.000Z", "2026-08-07T12:30:00.000Z")]);
    const r = await POST(post(turno("09:00")));
    expect(r.status).toBe(409);
    expect(llamadas().some(([path]) => path.includes("/appointments/"))).toBe(false);
  });

  it("el POST tampoco deja pisar a mitad de una cita larga, pero sí tomar el turno que viene después", async () => {
    conCitas([cita("2026-08-07T12:00:00.000Z", "2026-08-07T13:00:00.000Z")]);
    expect((await POST(post(turno("09:30")))).status).toBe(409);
    expect((await POST(post(turno("10:00")))).status).toBe(200);
  });

  it("antes se reservaba encima: el turno que sí estaba libre (las 12:00) se puede tomar", async () => {
    conCitas([cita("2026-08-07T12:00:00.000Z", "2026-08-07T12:30:00.000Z")]);
    expect((await POST(post(turno("12:00")))).status).toBe(200);
  });
});

describe("el paciente que reserva por la web queda con la Historia Clínica pendiente", () => {
  const listaOriginal = listCollection.getMockImplementation()!;
  const llamadas = () => setDocument.mock.calls as unknown as [string, Record<string, unknown>][];
  const turno = { ...datosPaciente, date: MANANA, time: "11:00", extras: { email: "ana@correo.com" } };

  beforeEach(() => { setDocument.mockClear(); });
  afterEach(() => listCollection.mockImplementation(listaOriginal));

  it("un paciente nuevo trae su Historia Clínica pendiente, igual que el alta de la recepción", async () => {
    const r = await POST(post(turno));
    expect(r.status).toBe(200);
    const paciente = llamadas().find(([path]) => path.includes("/patients/"));
    const hc = llamadas().find(([path]) => path.includes("/clinicalDocs/"));
    expect(paciente).toBeDefined();
    expect(hc).toBeDefined();
    const patientId = String(paciente![1].id);
    expect(hc![0]).toBe(`clinics/cl_demo/clinicalDocs/cd_${patientId}_hc`);
    expect(hc![1]).toMatchObject({ patientId, plantillaId: "historia_clinica", estado: "pendiente", createdBy: "reserva-online" });
  });

  it("un paciente que ya existe (mismo CI) no recibe otra Historia Clínica", async () => {
    listCollection.mockImplementation((async (_parent: string, col: string) =>
      col === "users" ? [{ id: "u2", data: { role: "dentist", active: true, name: "Dra. Prueba" } }]
        : col === "patients" ? [{ id: "p9", data: { document: "1234567" } }]
        : []) as unknown as typeof listaOriginal);
    expect((await POST(post(turno))).status).toBe(200);
    expect(llamadas().some(([path]) => path.includes("/clinicalDocs/"))).toBe(false);
  });
});

/* ===== No depender de «los primeros 500 documentos» =====
 * `listCollection(…, 500)` baja los 500 documentos de MENOR id, o sea los más viejos: con más de 500 citas la disponibilidad dejaba de ver las
 * recientes (doble reserva) y con más de 500 pacientes no encontraba al existente (ficha duplicada, y otra Historia Clínica pendiente). */
describe("la reserva online mira solo lo del día y busca al paciente por CI en Firestore", () => {
  const listaOriginal = listCollection.getMockImplementation()!;
  const llamadas = () => setDocument.mock.calls as unknown as [string, Record<string, unknown>][];
  const turno = { ...datosPaciente, date: MANANA, time: "11:00", extras: { email: "ana@correo.com" } };
  const sinCitaTomada = (a: unknown[]) => a[1] === "appointments";

  beforeEach(() => { queryRange.mockClear(); queryIn.mockClear(); listCollection.mockClear(); setDocument.mockClear(); });
  afterEach(() => { listCollection.mockImplementation(listaOriginal); queryRange.mockImplementation(async () => []); queryIn.mockImplementation(async () => []); });

  it("el GET pide las citas de un rango alrededor del día (la víspera y el día siguiente: las del panel están en UTC), no la colección entera", async () => {
    await GET(req(`http://x/api/reservas?clinicId=cl_demo&date=${MANANA}`));
    expect(queryRange.mock.calls).toContainEqual(["clinics/cl_demo", "appointments", "start", "2026-08-06", "2026-08-09", expect.any(Number)]);
    expect(listCollection.mock.calls.some(sinCitaTomada)).toBe(false);
  });

  it("el POST también", async () => {
    await POST(post(turno));
    expect(queryRange.mock.calls).toContainEqual(["clinics/cl_demo", "appointments", "start", "2026-08-06", "2026-08-09", expect.any(Number)]);
    expect(listCollection.mock.calls.some(sinCitaTomada)).toBe(false);
  });

  it("una cita que devuelve la consulta del día ocupa su turno, sin importar cuántas citas viejas tenga la clínica", async () => {
    queryRange.mockImplementation(async () => [{ id: "reciente", data: { dentistId: "u2", status: "confirmada", start: "2026-08-07T12:00:00.000Z", end: "2026-08-07T12:30:00.000Z" } }]);
    const j = await (await GET(req(`http://x/api/reservas?clinicId=cl_demo&date=${MANANA}`))).json();
    expect(j.slots.u2).not.toContain("09:00");
    expect((await POST(post({ ...turno, time: "09:00" }))).status).toBe(409);
  });

  it("busca al paciente por CI en Firestore, con y sin puntos (así la guardan las clínicas), y no revisa las primeras 500 fichas", async () => {
    await POST(post(turno));
    expect(queryIn.mock.calls).toContainEqual(["clinics/cl_demo", "patients", "document", ["1234567", "1.234.567"], expect.any(Number)]);
  });

  it("un paciente guardado con puntos («1.234.567») es el mismo: no se crea otro ni otra Historia Clínica", async () => {
    queryIn.mockImplementation(async () => [{ id: "p9", data: { document: "1.234.567" } }]);
    expect((await POST(post(turno))).status).toBe(200);
    expect(llamadas().some(([path]) => path.includes("/patients/"))).toBe(false);
    expect(llamadas().some(([path]) => path.includes("/clinicalDocs/"))).toBe(false);
    const cita = llamadas().find(([path]) => path.includes("/appointments/"));
    expect(cita?.[1]).toMatchObject({ patientId: "p9" });
  });

  it("y uno guardado con otro formato («1 234 567») se encuentra con la revisión de respaldo", async () => {
    listCollection.mockImplementation((async (_parent: string, col: string) =>
      col === "users" ? [{ id: "u2", data: { role: "dentist", active: true, name: "Dra. Prueba" } }]
        : col === "patients" ? [{ id: "p8", data: { document: "1 234 567" } }]
        : []) as unknown as typeof listaOriginal);
    expect((await POST(post(turno))).status).toBe(200);
    expect(llamadas().some(([path]) => path.includes("/patients/"))).toBe(false);
  });

  it("una CI que nadie tiene crea el paciente (con su Historia Clínica pendiente)", async () => {
    expect((await POST(post(turno))).status).toBe(200);
    expect(llamadas().some(([path]) => path.includes("/patients/"))).toBe(true);
    expect(llamadas().some(([path]) => path.includes("/clinicalDocs/"))).toBe(true);
  });
});
