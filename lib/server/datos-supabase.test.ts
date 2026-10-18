/**
 * `DatosDeServidor` sobre PostgREST. Se prueba con `fetch` mockeado: lo que importa es QUÉ pedido sale (tabla, filtros, encabezados), porque
 * ahí están los riesgos —un id que se cuela en un filtro, una tabla que no debía poder tocarse— y el comportamiento de cada operación.
 * El comportamiento contra una base real lo cubre `datos-supabase.supabase.test.ts` (necesita el stack).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearDatosSupabase } from "./datos-supabase";

interface Llamada { metodo: string; url: URL; cabeceras: Record<string, string>; cuerpo: unknown }
let llamadas: Llamada[] = [];
let respuestas: Array<{ status?: number; json?: unknown }> = [];

function falso() {
  llamadas = [];
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    llamadas.push({
      metodo: init?.method ?? "GET",
      url: new URL(String(url)),
      cabeceras: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
      cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = respuestas.shift() ?? { json: [] };
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  });
}
const datos = () => crearDatosSupabase({ url: "http://kong.test", serviceKey: "clave-de-servicio", fetch: falso() as unknown as typeof fetch });
const q = (i = 0) => llamadas[i].url.searchParams;

beforeEach(() => { respuestas = []; });
afterEach(() => { vi.unstubAllEnvs(); });

describe("configuración", () => {
  it("estaConfigurado pide la URL y la clave de servicio", () => {
    expect(crearDatosSupabase({ url: "http://x", serviceKey: "k" }).estaConfigurado()).toBe(true);
    expect(crearDatosSupabase({ url: "http://x", serviceKey: "" }).estaConfigurado()).toBe(false);
    expect(crearDatosSupabase({ url: "", serviceKey: "k" }).estaConfigurado()).toBe(false);
  });

  it("sin configuración las operaciones rechazan antes de salir a la red", async () => {
    const f = falso();
    const d = crearDatosSupabase({ url: "", serviceKey: "", fetch: f as unknown as typeof fetch });
    await expect(d.getDocument("clinics/cl_x")).rejects.toThrow(/configur/i);
    expect(f).not.toHaveBeenCalled();
  });

  it("lee SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY del entorno al llamar", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://publica.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k1");
    expect(crearDatosSupabase().estaConfigurado()).toBe(true);
    vi.stubEnv("SUPABASE_URL", "http://interna.test");
    const f = falso();
    vi.stubGlobal("fetch", f);
    await crearDatosSupabase().getDocument("clinics/cl_x");
    vi.unstubAllGlobals();
    expect(llamadas[0].url.origin).toBe("http://interna.test");
  });
});

describe("getDocument", () => {
  it("trae el documento de la clínica con la clave de servicio en los dos encabezados", async () => {
    respuestas = [{ json: [{ data: { id: "cl_x", name: "X" } }] }];
    expect(await datos().getDocument("clinics/cl_x")).toEqual({ id: "cl_x", name: "X" });
    expect(llamadas[0].url.pathname).toBe("/rest/v1/clinics");
    expect(q().get("id")).toBe("eq.cl_x");
    expect(q().get("select")).toBe("data");
    expect(llamadas[0].cabeceras.apikey).toBe("clave-de-servicio");
    expect(llamadas[0].cabeceras.authorization).toBe("Bearer clave-de-servicio");
  });

  it("una subcolección filtra por clinic_id e id", async () => {
    respuestas = [{ json: [{ data: { id: "p1" } }] }];
    await datos().getDocument("clinics/cl_x/patients/p1");
    expect(llamadas[0].url.pathname).toBe("/rest/v1/patients");
    expect([q().get("clinic_id"), q().get("id")]).toEqual(["eq.cl_x", "eq.p1"]);
  });

  it("las colecciones de primer nivel van a su tabla, sin clinic_id", async () => {
    respuestas = [{ json: [{ data: { clinicId: "cl_x" } }] }];
    expect(await datos().getDocument("subscriptions/cl_x")).toEqual({ clinicId: "cl_x" });
    expect(llamadas[0].url.pathname).toBe("/rest/v1/subscriptions");
    expect(q().has("clinic_id")).toBe(false);
  });

  it("devuelve null si no hay fila", async () => {
    respuestas = [{ json: [] }];
    expect(await datos().getDocument("clinics/nadie")).toBeNull();
  });

  it("un id con caracteres de filtro NO agrega parámetros: viaja entero como valor", async () => {
    respuestas = [{ json: [] }];
    await datos().getDocument("clinics/cl_x/patients/p1&select=*&id=neq.zzz");
    expect(q().getAll("select")).toEqual(["data"]);
    expect(q().getAll("id")).toEqual(["eq.p1&select=*&id=neq.zzz"]);
  });

  it("solo toca tablas del manifiesto: auth.users, tablas inventadas, `..` y rutas torcidas se rechazan sin salir a la red", async () => {
    const f = falso();
    const d = crearDatosSupabase({ url: "http://kong.test", serviceKey: "k", fetch: f as unknown as typeof fetch });
    for (const p of ["auth/users", "clinics/cl_x/auth.users/u1", "clinics/cl_x/pg_catalog/u1", "clinics/../subscriptions/x", "clinics//users/u1", "clinics/cl_x/patients", "", "clinics/cl_x/patients/p1/extra", "otra/x", "serviceAccounts/x"]) {
      await expect(d.getDocument(p), p).rejects.toThrow();
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("un error de PostgREST rechaza con el estado", async () => {
    respuestas = [{ status: 401, json: { message: "JWT expired", code: "PGRST303" } }];
    await expect(datos().getDocument("clinics/cl_x")).rejects.toThrow(/401/);
  });
});

describe("directory/{uid} (virtual: sale de users.authUid)", () => {
  beforeEach(() => { llamadas = []; });
  it("getDocument busca al usuario por authUid y devuelve clínica, id del documento y email", async () => {
    respuestas = [{ json: [{ clinic_id: "cl_a", id: "u_viejo", data: { email: "a@b.c", authUid: "uid-nuevo" } }] }];
    expect(await datos().getDocument("directory/uid-nuevo")).toEqual({ clinicId: "cl_a", userId: "u_viejo", email: "a@b.c" });
    expect(llamadas[0].url.pathname).toBe("/rest/v1/users");
    expect(q().get("data->>authUid")).toBe("eq.uid-nuevo");
  });

  it("la demo no cuenta: cualquiera con una sesión anónima puede plantar una ficha en cl_demo, así que el directorio nunca la devuelve", async () => {
    const d = datos();
    respuestas = [{ json: [] }, { json: [] }];
    await d.getDocument("directory/uid-anonimo");
    expect(q().get("clinic_id")).toBe("neq.cl_demo");
    expect(await d.createIfAbsent("directory/uid-anonimo", { clinicId: "cl_a" })).toBe(true);
    expect(q(1).get("clinic_id")).toBe("neq.cl_demo");
  });

  it("getDocument devuelve null si nadie tiene ese authUid", async () => {
    respuestas = [{ json: [] }];
    expect(await datos().getDocument("directory/nadie")).toBeNull();
  });

  it("setDocument no escribe nada (el documento de usuario ES el índice)", async () => {
    const f = falso();
    await crearDatosSupabase({ url: "http://k", serviceKey: "k", fetch: f as unknown as typeof fetch }).setDocument("directory/u1", { clinicId: "cl_a" });
    expect(f).not.toHaveBeenCalled();
  });

  it("createIfAbsent devuelve true si no hay usuario con ese authUid y false si ya existe", async () => {
    respuestas = [{ json: [] }, { json: [{ clinic_id: "cl_a", id: "u1", data: {} }] }];
    const d = datos();
    expect(await d.createIfAbsent("directory/u1", { clinicId: "cl_a" })).toBe(true);
    expect(await d.createIfAbsent("directory/u1", { clinicId: "cl_a" })).toBe(false);
  });

  it("las demás operaciones sobre directory se rechazan", async () => {
    const d = datos();
    await expect(d.patchFields("directory/u1", { a: 1 })).rejects.toThrow();
    await expect(d.listCollection("", "directory")).rejects.toThrow();
  });
});

describe("listCollection", () => {
  it("pide los N de menor id de la clínica", async () => {
    respuestas = [{ json: [{ id: "a", data: { id: "a" } }, { id: "b", data: { id: "b" } }] }];
    expect(await datos().listCollection("clinics/cl_x", "users", 300)).toEqual([{ id: "a", data: { id: "a" } }, { id: "b", data: { id: "b" } }]);
    expect(llamadas[0].url.pathname).toBe("/rest/v1/users");
    expect([q().get("clinic_id"), q().get("order"), q().get("limit"), q().get("select")]).toEqual(["eq.cl_x", "id.asc", "300", "id,data"]);
  });

  it("el tope por defecto es 300", async () => {
    respuestas = [{ json: [] }];
    await datos().listCollection("clinics/cl_x", "users");
    expect(q().get("limit")).toBe("300");
  });

  it("con más de 1000 pagina (PostgREST corta en db-max-rows=1000) y se detiene al llegar al límite", async () => {
    const pagina = (desde: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${desde + i}`, data: {} }));
    respuestas = [{ json: pagina(0, 1000) }, { json: pagina(1000, 500) }];
    const filas = await datos().listCollection("clinics/cl_x", "patients", 1500);
    expect(filas).toHaveLength(1500);
    expect(llamadas.map((l) => [l.url.searchParams.get("offset"), l.url.searchParams.get("limit")])).toEqual([["0", "1000"], ["1000", "500"]]);
  });

  it("si una página viene corta, no pide más", async () => {
    respuestas = [{ json: Array.from({ length: 1000 }, (_, i) => ({ id: `i${i}`, data: {} })) }, { json: [{ id: "z", data: {} }] }];
    expect(await datos().listCollection("clinics/cl_x", "patients", 5000)).toHaveLength(1001);
    expect(llamadas).toHaveLength(2);
  });

  it("el padre tiene que ser clinics/{cid} y la colección del manifiesto", async () => {
    const d = datos();
    await expect(d.listCollection("subscriptions", "users")).rejects.toThrow();
    await expect(d.listCollection("clinics/cl_x", "auth.users")).rejects.toThrow();
    expect(llamadas).toHaveLength(0);
  });
});

describe("queryWhere / queryRange / queryIn", () => {
  it("queryWhere compara el campo dentro de data como texto", async () => {
    respuestas = [{ json: [{ id: "a1", data: { token: "t" } }] }];
    expect(await datos().queryWhere("clinics/cl_x", "appointments", "confirmToken", "tok123", 2)).toEqual([{ id: "a1", data: { token: "t" } }]);
    expect(q().get("data->>confirmToken")).toBe("eq.tok123");
    expect([q().get("clinic_id"), q().get("limit")]).toEqual(["eq.cl_x", "2"]);
  });

  it("un valor numérico o booleano se compara por su texto", async () => {
    respuestas = [{ json: [] }, { json: [] }];
    const d = datos();
    await d.queryWhere("clinics/cl_x", "patients", "edad", 33);
    await d.queryWhere("clinics/cl_x", "patients", "activo", true);
    expect([q(0).get("data->>edad"), q(1).get("data->>activo")]).toEqual(["eq.33", "eq.true"]);
  });

  it("un campo que no es un identificador simple se rechaza (no se cuela en el filtro)", async () => {
    const d = datos();
    for (const campo of ["", "a.b", "a b", "a)or(b", "x->y", "id,data", "a;b", "é"]) {
      await expect(d.queryWhere("clinics/cl_x", "patients", campo, "v"), campo).rejects.toThrow();
    }
    expect(llamadas).toHaveLength(0);
  });

  it("queryWhere rechaza valores que no son escalares", async () => {
    await expect(datos().queryWhere("clinics/cl_x", "patients", "a", { b: 1 })).rejects.toThrow();
    await expect(datos().queryWhere("clinics/cl_x", "patients", "a", null)).rejects.toThrow();
  });

  it("queryRange manda desde <= campo < hasta como dos filtros y vuelve a comprobar el rango en JavaScript", async () => {
    respuestas = [{ json: [
      { id: "a", data: { start: "2026-10-16T09:00" } },
      { id: "b", data: { start: "2026-10-16" } },        // === desde → entra
      { id: "c", data: { start: "2026-10-19" } },        // === hasta → afuera (la comparación de la base pudo dejarlo pasar)
      { id: "d", data: { start: "2026-10-20T10:00" } },  // afuera
      { id: "e", data: {} },                             // sin el campo → afuera
    ] }];
    const filas = await datos().queryRange("clinics/cl_x", "appointments", "start", "2026-10-16", "2026-10-19", 500);
    expect(q().getAll("data->>start")).toEqual(["gte.2026-10-16", "lt.2026-10-19"]);
    expect(filas.map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("queryIn arma in.(…) con cada valor entre comillas y escapadas", async () => {
    respuestas = [{ json: [] }];
    await datos().queryIn("clinics/cl_x", "patients", "document", ["123", 'a"b,c)', "x\\y"], 5);
    expect(q().get("data->>document")).toBe('in.("123","a\\"b,c)","x\\\\y")');
    expect(q().get("limit")).toBe("5");
  });

  it("queryIn con la lista vacía no pide nada y devuelve []", async () => {
    const f = falso();
    expect(await crearDatosSupabase({ url: "http://k", serviceKey: "k", fetch: f as unknown as typeof fetch }).queryIn("clinics/cl_x", "patients", "document", [])).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("escrituras", () => {
  it("setDocument hace upsert (reemplaza el documento entero) y no manda undefined", async () => {
    respuestas = [{ status: 201 }];
    await datos().setDocument("clinics/cl_x/patients/p1", { id: "p1", a: 1, b: undefined });
    const l = llamadas[0];
    expect(l.metodo).toBe("POST");
    expect(l.url.pathname).toBe("/rest/v1/patients");
    expect(l.url.searchParams.get("on_conflict")).toBe("clinic_id,id");
    expect(l.cabeceras.prefer).toContain("resolution=merge-duplicates");
    expect(l.cuerpo).toEqual({ clinic_id: "cl_x", id: "p1", data: { id: "p1", a: 1 } });
  });

  it("setDocument en una colección raíz no manda clinic_id", async () => {
    respuestas = [{ status: 201 }];
    await datos().setDocument("subscriptions/cl_x", { plan: "solo" });
    expect(llamadas[0].url.searchParams.get("on_conflict")).toBe("id");
    expect(llamadas[0].cuerpo).toEqual({ id: "cl_x", data: { plan: "solo" } });
  });

  it("setDocument sobre clinics/{cid} guarda el documento de la clínica", async () => {
    respuestas = [{ status: 201 }];
    await datos().setDocument("clinics/cl_x", { id: "cl_x", name: "X" });
    expect(llamadas[0].url.pathname).toBe("/rest/v1/clinics");
    expect(llamadas[0].cuerpo).toEqual({ id: "cl_x", data: { id: "cl_x", name: "X" } });
  });

  it("setDocument rechaza si la base rechaza", async () => {
    respuestas = [{ status: 403, json: { code: "42501", message: "new row violates row-level security policy" } }];
    await expect(datos().setDocument("clinics/cl_x/patients/p1", {})).rejects.toThrow(/403/);
  });

  it("createIfAbsent inserta ignorando duplicados: true si insertó, false si ya existía", async () => {
    respuestas = [{ json: [{ id: "t1" }] }, { json: [] }];
    const d = datos();
    expect(await d.createIfAbsent("clinics/cl_x/slotLocks/t1", { a: 1 })).toBe(true);
    expect(await d.createIfAbsent("clinics/cl_x/slotLocks/t1", { a: 1 })).toBe(false);
    expect(llamadas[0].cabeceras.prefer).toContain("resolution=ignore-duplicates");
    expect(llamadas[0].cabeceras.prefer).toContain("return=representation");
    expect(llamadas[0].url.searchParams.get("on_conflict")).toBe("clinic_id,id");
  });

  it("createIfAbsent propaga los errores que no son «ya existe»", async () => {
    respuestas = [{ status: 500, json: { message: "boom" } }];
    await expect(datos().createIfAbsent("clinics/cl_x/slotLocks/t1", {})).rejects.toThrow(/500/);
  });
});

describe("patchFields (cambia solo esos campos, con control de concurrencia por updated_at)", () => {
  it("lee el documento y lo actualiza SOLO si no cambió desde que se leyó", async () => {
    respuestas = [
      { json: [{ data: { id: "a1", otro: 7 }, updated_at: "2026-10-17T10:00:00.123456+00:00" }] },
      { json: [{ id: "a1" }] },
    ];
    await datos().patchFields("clinics/cl_x/appointments/a1", { confirmToken: "t" });
    expect(llamadas[0].metodo).toBe("GET");
    expect(q(0).get("select")).toBe("data,updated_at");
    const p = llamadas[1];
    expect(p.metodo).toBe("PATCH");
    expect(p.url.pathname).toBe("/rest/v1/appointments");
    expect([p.url.searchParams.get("clinic_id"), p.url.searchParams.get("id"), p.url.searchParams.get("updated_at")]).toEqual(["eq.cl_x", "eq.a1", "eq.2026-10-17T10:00:00.123456+00:00"]);
    expect(p.cabeceras.prefer).toContain("return=representation");
    expect((p.cuerpo as { data: unknown }).data).toEqual({ id: "a1", otro: 7, confirmToken: "t" });
  });

  it("si alguien lo cambió en el medio (el PATCH no toca filas), relee y reintenta", async () => {
    respuestas = [
      { json: [{ data: { a: 1 }, updated_at: "T1" }] }, { json: [] },
      { json: [{ data: { a: 1, b: 2 }, updated_at: "T2" }] }, { json: [{ id: "x" }] },
    ];
    await datos().patchFields("clinics/cl_x/appointments/a1", { c: 3 });
    expect((llamadas[3].cuerpo as { data: unknown }).data).toEqual({ a: 1, b: 2, c: 3 });
    expect(llamadas[3].url.searchParams.get("updated_at")).toBe("eq.T2");
  });

  it("después de varios intentos fallidos rechaza (no pisa)", async () => {
    respuestas = Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? { json: [{ data: {}, updated_at: `T${i}` }] } : { json: [] }));
    await expect(datos().patchFields("clinics/cl_x/appointments/a1", { c: 3 })).rejects.toThrow(/concurren/i);
  });

  it("si el documento no existe lo crea con esos campos (como el PATCH de Firestore)", async () => {
    respuestas = [{ json: [] }, { json: [{ id: "a1" }] }];
    await datos().patchFields("clinics/cl_x/appointments/a1", { c: 3 });
    const p = llamadas[1];
    expect(p.metodo).toBe("POST");
    expect(p.cabeceras.prefer).toContain("resolution=ignore-duplicates");
    expect(p.cuerpo).toEqual({ clinic_id: "cl_x", id: "a1", data: { c: 3 } });
  });

  it("en una colección raíz (webhookEvents) usa solo id", async () => {
    respuestas = [{ json: [{ data: { estado: "recibido" }, updated_at: "T1" }] }, { json: [{ id: "ev1" }] }];
    await datos().patchFields("webhookEvents/ev1", { estado: "aplicado" });
    expect(llamadas[1].url.searchParams.has("clinic_id")).toBe(false);
    expect(llamadas[1].url.searchParams.get("id")).toBe("eq.ev1");
    expect((llamadas[1].cuerpo as { data: unknown }).data).toEqual({ estado: "aplicado" });
  });

  it("un campo en undefined se quita del documento", async () => {
    respuestas = [{ json: [{ data: { a: 1, b: 2 }, updated_at: "T1" }] }, { json: [{ id: "x" }] }];
    await datos().patchFields("clinics/cl_x/appointments/a1", { a: undefined, c: null });
    expect((llamadas[1].cuerpo as { data: unknown }).data).toEqual({ b: 2, c: null });
  });
});
