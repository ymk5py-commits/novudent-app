/** El tiempo real, la lectura paginada y las escrituras del adaptador de Supabase con un cliente FALSO (sin red): los casos difíciles que el contrato de datos no ve
 *  (eventos fuera de orden, canales que se caen, borrados de otra clínica, páginas que cambian). Revisión independiente del 17-oct-2026. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearDatosSupabase } from "./supabase";
import type { Doc } from "./tipos";

type FilaT = { clinic_id?: string; id: string; data: Doc; updated_at: string };
type Resultado = { data: unknown; error: { code?: string; message: string } | null };

/** Un banco de tablas, canales y llamadas a funciones que hace de `SupabaseClient`. */
function banco() {
  const tablas = new Map<string, FilaT[]>();
  const consultas: Array<{ tabla: string; filtros: string[] }> = [];
  const canales: CanalFalso[] = [];
  const quitados: CanalFalso[] = [];
  const errores: Array<{ tabla: string; resultado: Resultado }> = []; // errores programados para la próxima lectura de esa tabla
  const rpcs: Array<{ nombre: string; args: unknown }> = [];
  let respuestaRpc: (nombre: string, args: unknown) => Resultado = () => ({ data: null, error: null });

  class CanalFalso {
    manejador: ((ev: unknown) => void) | null = null;
    estado: ((estado: string, err?: Error) => void) | null = null;
    config: Record<string, string> | null = null;
    cerrado = false;
    constructor(readonly nombre: string) {}
    on(_tipo: string, config: Record<string, string>, manejador: (ev: unknown) => void) { this.config = config; this.manejador = manejador; return this; }
    subscribe(cb: (estado: string, err?: Error) => void) { this.estado = cb; return this; }
    cambio(ev: unknown) { this.manejador?.(ev); }
    notificar(estado: string, err?: Error) { this.estado?.(estado, err); }
  }

  function consulta(tabla: string) {
    const filtros: string[] = [];
    let limite = Infinity;
    let columnas = "";
    const q: Record<string, unknown> = {};
    const filas = (): FilaT[] => {
      let r = [...(tablas.get(tabla) ?? [])];
      for (const f of filtros) {
        const [op, col, val] = f.split("|");
        if (op === "eq") r = r.filter((x) => String((x as unknown as Record<string, unknown>)[col]) === val);
        if (op === "neq") r = r.filter((x) => String((x as unknown as Record<string, unknown>)[col]) !== val);
        if (op === "gt") r = r.filter((x) => String((x as unknown as Record<string, unknown>)[col]) > val);
      }
      r.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return r.slice(0, limite);
    };
    const resolver = (): Resultado => {
      consultas.push({ tabla, filtros: [...filtros] });
      const e = errores.findIndex((x) => x.tabla === tabla);
      if (e >= 0) return errores.splice(e, 1)[0].resultado;
      return { data: filas().map((f) => (columnas.includes("updated_at") ? f : { id: f.id })), error: null };
    };
    Object.assign(q, {
      select: (c: string) => { columnas = c; return q; },
      eq: (c: string, v: string) => { filtros.push(`eq|${c}|${v}`); return q; },
      neq: (c: string, v: string) => { filtros.push(`neq|${c}|${v}`); return q; },
      gt: (c: string, v: string) => { filtros.push(`gt|${c}|${v}`); return q; },
      order: () => q,
      limit: (n: number) => { limite = n; return q; },
      range: () => { throw new Error("la lectura pagina por clave (gt), no por desplazamiento"); },
      maybeSingle: async () => { const r = resolver(); return r.error ? r : { data: (r.data as unknown[])[0] ?? null, error: null }; },
      then: (ok: (r: Resultado) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, mal),
    });
    return q;
  }

  const cliente = {
    from: (tabla: string) => consulta(tabla),
    channel: (nombre: string) => { const c = new CanalFalso(nombre); canales.push(c); return c; },
    removeChannel: async (c: CanalFalso) => { c.cerrado = true; quitados.push(c); c.notificar("CLOSED"); return "ok"; },
    rpc: async (nombre: string, args: unknown) => { rpcs.push({ nombre, args }); return respuestaRpc(nombre, args); },
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  };

  return {
    cliente: cliente as never,
    tablas, consultas, canales, quitados, rpcs, errores,
    poner: (tabla: string, filas: FilaT[]) => tablas.set(tabla, filas),
    responderRpc: (f: (n: string, a: unknown) => Resultado) => { respuestaRpc = f; },
  };
}

const fila = (id: string, data: Doc, updated_at: string, clinic_id = "cl1"): FilaT => ({ clinic_id, id, data: { id, ...data }, updated_at });
const evento = (eventType: "INSERT" | "UPDATE" | "DELETE", nueva: FilaT | null, vieja: Partial<FilaT> | null = null, commit_timestamp = "2026-10-17T12:00:00Z") =>
  ({ eventType, new: nueva ?? {}, old: vieja ?? {}, commit_timestamp });
/** Deja correr las promesas pendientes (sin tocar los temporizadores falsos). */
async function drenar() { for (let i = 0; i < 40; i++) await Promise.resolve(); }

beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); });
afterEach(() => { vi.useRealTimers(); });

describe("escucharColeccion", () => {
  it("entrega el estado inicial sin esperar a que el canal quede suscripto (el primer SUBSCRIBED de un servidor frío tarda segundos)", async () => {
    const b = banco();
    b.poner("outbox", [fila("t1", { status: "pendiente" }, "2026-10-17T10:00:00Z")]);
    const vistos: Doc[][] = [];
    crearDatosSupabase(b.cliente, async () => null).escucharColeccion("cl1", "outbox", (d) => vistos.push(d));
    await vi.advanceTimersByTimeAsync(0); await drenar();
    expect(vistos).toEqual([[{ id: "t1", status: "pendiente" }]]);
    expect(b.canales).toHaveLength(1);
    expect(b.canales[0].config).toMatchObject({ table: "outbox", filter: "clinic_id=eq.cl1" });
  });

  it("después de la lectura: un alta, un cambio y un borrado llegan en orden, cada uno como un estado nuevo", async () => {
    const b = banco();
    const vistos: Doc[][] = [];
    crearDatosSupabase(b.cliente, async () => null).escucharColeccion("cl1", "outbox", (d) => vistos.push(d));
    await drenar();
    const canal = b.canales[0];
    canal.cambio(evento("INSERT", fila("t1", { n: 1 }, "2026-10-17T10:00:01Z")));
    canal.cambio(evento("UPDATE", fila("t1", { n: 2 }, "2026-10-17T10:00:02Z")));
    canal.cambio(evento("DELETE", null, { clinic_id: "cl1", id: "t1" }));
    expect(vistos.map((v) => v.map((d) => d.n))).toEqual([[], [1], [2], []]);
  });

  it("un borrado de OTRA clínica (Realtime no filtra los DELETE) no toca la lista ni dispara una entrega", async () => {
    const b = banco();
    b.poner("outbox", [fila("t1", { n: 1 }, "2026-10-17T10:00:00Z")]);
    const vistos: Doc[][] = [];
    crearDatosSupabase(b.cliente, async () => null).escucharColeccion("cl1", "outbox", (d) => vistos.push(d));
    await drenar();
    b.canales[0].cambio(evento("DELETE", null, { clinic_id: "cl_otra", id: "t1" }));
    expect(vistos).toHaveLength(1);
    expect(vistos[0]).toHaveLength(1);
  });

  it("dos cambios del mismo documento con el MISMO updated_at (una lote los hace en una transacción) se entregan los dos: queda el último", async () => {
    const b = banco();
    const vistos: Doc[][] = [];
    crearDatosSupabase(b.cliente, async () => null).escucharColeccion("cl1", "outbox", (d) => vistos.push(d));
    await drenar();
    const mismo = "2026-10-17T10:00:05Z";
    b.canales[0].cambio(evento("UPDATE", fila("t1", { estado: "intermedio" }, mismo)));
    b.canales[0].cambio(evento("UPDATE", fila("t1", { estado: "final" }, mismo)));
    expect(vistos.at(-1)).toEqual([{ id: "t1", estado: "final" }]);
  });

  it("una vez sincronizada, un evento se aplica en el orden en que llega aunque su updated_at sea menor (now() es la hora de INICIO de la transacción, no monótono)", async () => {
    const b = banco();
    const vistos: Doc[][] = [];
    crearDatosSupabase(b.cliente, async () => null).escucharColeccion("cl1", "outbox", (d) => vistos.push(d));
    await drenar();
    b.canales[0].cambio(evento("UPDATE", fila("t1", { v: "corta" }, "2026-10-17T10:00:05Z")));
    b.canales[0].cambio(evento("UPDATE", fila("t1", { v: "larga" }, "2026-10-17T10:00:00Z"))); // transacción larga, empezó antes, terminó después
    expect(vistos.at(-1)).toEqual([{ id: "t1", v: "larga" }]);
  });

  it("los eventos que llegan MIENTRAS se lee se aplican después, salvo los más viejos que la fila leída", async () => {
    const b = banco();
    b.poner("outbox", [fila("a", { v: "leida" }, "2026-10-17T10:00:10Z"), fila("b", { v: "leida" }, "2026-10-17T10:00:10Z")]);
    const vistos: Doc[][] = [];
    crearDatosSupabase(b.cliente, async () => null).escucharColeccion("cl1", "outbox", (d) => vistos.push(d));
    // el evento llega antes de que termine la lectura (los microtareas todavía no corrieron)
    b.canales[0].cambio(evento("UPDATE", fila("a", { v: "vieja" }, "2026-10-17T10:00:05Z"))); // anterior a lo leído → se descarta
    b.canales[0].cambio(evento("UPDATE", fila("b", { v: "nueva" }, "2026-10-17T10:00:20Z"))); // posterior → se aplica
    await drenar();
    expect(vistos.at(-1)?.sort((x, y) => String(x.id).localeCompare(String(y.id)))).toEqual([{ id: "a", v: "leida" }, { id: "b", v: "nueva" }]);
  });

  it("con la lectura caída y cientos de eventos de por medio, al recuperarse entrega un estado coherente (el último evento) y la cola no crece sin tope", async () => {
    const b = banco();
    b.poner("outbox", [fila("t1", { n: 0 }, "2026-10-17T10:00:00Z")]);
    b.errores.push({ tabla: "outbox", resultado: { data: null, error: { message: "boom" } } });
    const vistos: Doc[][] = [];
    crearDatosSupabase(b.cliente, async () => null).escucharColeccion("cl1", "outbox", (d) => vistos.push(d));
    await drenar(); // la primera lectura falla
    for (let i = 0; i < 700; i++) b.canales[0].cambio(evento("UPDATE", fila("t1", { n: i }, "2026-10-17T10:00:00Z")));
    await vi.advanceTimersByTimeAsync(40_000); await drenar();
    expect(vistos.at(-1)).toEqual([{ id: "t1", n: 699 }]); // la lectura al recuperarse + lo que llegó después, sin haber guardado los 700
  });

  it("si la lectura inicial falla avisa y reintenta con espera creciente hasta lograrla", async () => {
    const b = banco();
    b.poner("outbox", [fila("t1", { n: 1 }, "2026-10-17T10:00:00Z")]);
    b.errores.push({ tabla: "outbox", resultado: { data: null, error: { message: "red caída" } } });
    b.errores.push({ tabla: "outbox", resultado: { data: null, error: { message: "red caída" } } });
    const vistos: Doc[][] = [];
    const fallos: unknown[] = [];
    crearDatosSupabase(b.cliente, async () => null).escucharColeccion("cl1", "outbox", (d) => vistos.push(d), undefined, (e) => fallos.push(e));
    await drenar();
    expect(vistos).toEqual([]);
    expect(fallos).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000); await drenar();
    expect(fallos).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2_000); await drenar();
    expect(vistos).toEqual([[{ id: "t1", n: 1 }]]);
  });

  it("si el canal se CIERRA (token vencido con la pestaña dormida, servidor reiniciado) crea otro, y al suscribirse lee de nuevo y entrega lo que cambió", async () => {
    const b = banco();
    b.poner("outbox", [fila("t1", { n: 1 }, "2026-10-17T10:00:00Z")]);
    const vistos: Doc[][] = [];
    crearDatosSupabase(b.cliente, async () => null).escucharColeccion("cl1", "outbox", (d) => vistos.push(d));
    await drenar();
    expect(b.canales).toHaveLength(1);
    b.canales[0].notificar("CLOSED");
    await vi.advanceTimersByTimeAsync(1_000); await drenar();
    expect(b.canales).toHaveLength(2);
    expect(b.quitados).toContain(b.canales[0]);
    b.tablas.set("outbox", [fila("t1", { n: 2 }, "2026-10-17T10:05:00Z")]); // cambió mientras estuvo caído
    b.canales[1].notificar("SUBSCRIBED");
    await drenar();
    expect(vistos.at(-1)).toEqual([{ id: "t1", n: 2 }]);
  });

  it("al desuscribir quita el canal y no queda ningún reintento programado", async () => {
    const b = banco();
    const vistos: Doc[][] = [];
    const parar = crearDatosSupabase(b.cliente, async () => null).escucharColeccion("cl1", "outbox", (d) => vistos.push(d));
    await drenar();
    b.canales[0].notificar("CLOSED"); // programa un reintento
    parar();
    await vi.advanceTimersByTimeAsync(60_000); await drenar();
    expect(b.canales).toHaveLength(1); // no creó otro
    expect(b.quitados).toContain(b.canales[0]);
    const antes = vistos.length;
    b.canales[0].cambio(evento("INSERT", fila("t2", {}, "2026-10-17T11:00:00Z")));
    expect(vistos).toHaveLength(antes);
  });

  it("participante y ordenarPor: solo los suyos, de menor a mayor, y el empate se desempata por id", async () => {
    const b = banco();
    b.poner("directMessages", [
      fila("b", { participants: ["u1", "u2"], createdAt: "2026-01-01" }, "2026-10-17T10:00:00Z"),
      fila("a", { participants: ["u1", "u2"], createdAt: "2026-01-01" }, "2026-10-17T10:00:00Z"),
      fila("c", { participants: ["u3", "u2"], createdAt: "2025-01-01" }, "2026-10-17T10:00:00Z"),
      fila("d", { participants: ["u1"] }, "2026-10-17T10:00:00Z"), // sin el campo: no aparece
    ]);
    let ultimo: Doc[] = [];
    crearDatosSupabase(b.cliente, async () => null).escucharColeccion("cl1", "directMessages", (d) => { ultimo = d; }, { participante: "u1", ordenarPor: "createdAt" });
    await drenar();
    expect(ultimo.map((d) => d.id)).toEqual(["a", "b"]);
  });
});

describe("escucharClinica / escucharSuscripcion", () => {
  it("el borrado de otro documento de la misma tabla no se entrega como un cambio de este", async () => {
    const b = banco();
    b.poner("clinics", [{ id: "cl1", data: { id: "cl1", name: "A" }, updated_at: "2026-10-17T10:00:00Z" }]);
    const vistos: Array<Doc | null> = [];
    crearDatosSupabase(b.cliente, async () => null).escucharClinica("cl1", (c) => vistos.push(c));
    await drenar();
    b.canales[0].cambio(evento("DELETE", null, { id: "cl_otra" }));
    expect(vistos).toHaveLength(1);
    b.canales[0].cambio(evento("DELETE", null, { id: "cl1" }));
    expect(vistos.at(-1)).toBeNull();
  });
});

describe("leerClinica", () => {
  it("lee por clave (id > último), no por desplazamiento: una fila que aparece entre páginas no duplica ni saltea otras", async () => {
    const b = banco();
    b.poner("clinics", [{ id: "cl1", data: { id: "cl1" }, updated_at: "2026-10-17T10:00:00Z" }]);
    b.poner("patients", Array.from({ length: 7 }, (_, i) => fila(`p${i}`, { i }, "2026-10-17T10:00:00Z")));
    const datos = crearDatosSupabase(b.cliente, async () => null);
    const l = (await datos.leerClinica("cl1", { directos: () => "ninguno" }))!;
    expect(l.colecciones.patients.map((d) => d.id)).toEqual(["p0", "p1", "p2", "p3", "p4", "p5", "p6"]);
    const pacientes = b.consultas.filter((c) => c.tabla === "patients");
    expect(pacientes.length).toBeGreaterThanOrEqual(1);
    expect(pacientes[0].filtros.some((f) => f.startsWith("gt|"))).toBe(false); // la primera página no lleva «mayor que»
  });

  it("users es OBLIGATORIA: si no se puede leer (permiso, infraestructura) la carga falla; no entrega un padrón vacío que desloguearía a todos", async () => {
    const b = banco();
    b.poner("clinics", [{ id: "cl1", data: { id: "cl1" }, updated_at: "2026-10-17T10:00:00Z" }]);
    b.errores.push({ tabla: "users", resultado: { data: null, error: { code: "42501", message: "permission denied for table users" } } });
    await expect(crearDatosSupabase(b.cliente, async () => null).leerClinica("cl1", { directos: () => "ninguno" })).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("las demás colecciones sin permiso (la demo leída como anónimo no ve los gastos) llegan vacías, sin romper la carga", async () => {
    const b = banco();
    b.poner("clinics", [{ id: "cl1", data: { id: "cl1" }, updated_at: "2026-10-17T10:00:00Z" }]);
    b.errores.push({ tabla: "expenses", resultado: { data: null, error: { code: "42501", message: "permission denied for table expenses" } } });
    const l = (await crearDatosSupabase(b.cliente, async () => null).leerClinica("cl1", { directos: () => "ninguno" }))!;
    expect(l.colecciones.expenses).toEqual([]);
  });
});

describe("escrituras", () => {
  it("lote con más de 1000 operaciones se rechaza (partirlo rompería «todas o ninguna») y no llama a la base", async () => {
    const b = banco();
    const ops = Array.from({ length: 1001 }, (_, i) => ({ tipo: "guardar" as const, col: "patients", id: `p${i}`, data: { id: `p${i}` } }));
    await expect(crearDatosSupabase(b.cliente, async () => null).lote("cl1", ops)).rejects.toThrow(/1000/);
    expect(b.rpcs).toHaveLength(0);
  });

  it("lote valida los ids como las demás escrituras (un id con «/» no entra por esta puerta)", async () => {
    const b = banco();
    await expect(crearDatosSupabase(b.cliente, async () => null).lote("cl1", [{ tipo: "guardar", col: "patients", id: "a/b", data: {} }])).rejects.toThrow();
    await expect(crearDatosSupabase(b.cliente, async () => null).lote("cl1", [{ tipo: "guardar", col: "patients", id: "", data: {} }])).rejects.toThrow();
    expect(b.rpcs).toHaveLength(0);
  });

  it("fijarCampo sobre un documento inexistente da not-found; si no se puede ni comprobar (red) devuelve el error original, no un not-found inventado", async () => {
    const b = banco();
    b.responderRpc(() => ({ data: null, error: { code: "42501", message: "no se pudo cambiar patients/x: no existe o ninguna regla lo permite" } }));
    const datos = crearDatosSupabase(b.cliente, async () => null);
    await expect(datos.fijarCampo("cl1", "patients", "x", "a", 1)).rejects.toMatchObject({ code: "not-found" });
    b.errores.push({ tabla: "patients", resultado: { data: null, error: { message: "Failed to fetch" } } });
    await expect(datos.fijarCampo("cl1", "patients", "x", "a", 1)).rejects.toMatchObject({ code: "permission-denied" });
  });
});
