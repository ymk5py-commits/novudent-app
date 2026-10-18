/**
 * De punta a punta contra el stack COMPLETO de Supabase (Kong → PostgREST / GoTrue / Realtime → Postgres), con el esquema aplicado.
 * Se corre con scripts/supabase/probar-stack.sh, que levanta el stack descartable y exporta STACK_URL, STACK_ANON y STACK_SERVICE.
 * Sin esas variables se saltea (para que `node --test test/rls` a secas no falle).
 *
 * Lo que agrega a las pruebas con `set local role`: que PostgREST le pase a la base el JWT como esperan las políticas, que las rpc
 * se llamen con los nombres de parámetros del contrato (supabase/README.md), que GoTrue emita lo que las reglas esperan y que
 * Realtime aplique la RLS de cada suscriptor.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const URL_BASE = process.env.STACK_URL;
const ANON = process.env.STACK_ANON;
const SERVICIO = process.env.STACK_SERVICE;
const skip = URL_BASE && ANON && SERVICIO ? false : "falta STACK_URL / STACK_ANON / STACK_SERVICE: corré scripts/supabase/probar-stack.sh";

async function http(metodo, ruta, { token = ANON, cuerpo, headers = {} } = {}) {
  const r = await fetch(`${URL_BASE}${ruta}`, {
    method: metodo,
    headers: { apikey: token === SERVICIO ? SERVICIO : ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(20_000),
  });
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* no es JSON */ }
  return { status: r.status, json, texto };
}
const rpc = (nombre, args, token) => http("POST", `/rest/v1/rpc/${nombre}`, { token, cuerpo: args });
const guardar = (token, tabla, clinic_id, id, data) => rpc("guardar", { tabla, clinic_id, id, data }, token);
const leer = (token, ruta) => http("GET", `/rest/v1/${ruta}`, { token });
const denegadoHttp = (r) => [401, 403].includes(r.status);

let T = {}; // tokens y uuids de las cuentas

async function cuenta(email, password) {
  const c = await http("POST", "/auth/v1/admin/users", { token: SERVICIO, cuerpo: { email, password, email_confirm: true } });
  assert.equal(c.status, 200, `crear ${email}: ${c.texto}`);
  const s = await http("POST", "/auth/v1/token?grant_type=password", { cuerpo: { email, password } });
  assert.equal(s.status, 200, `iniciar sesión ${email}: ${s.texto}`);
  return { uid: c.json.id, token: s.json.access_token };
}

before(async () => {
  if (skip) return;
  const clave = `Clave-${randomUUID().slice(0, 12)}`;
  for (const n of ["adminA", "dentA", "asisA", "adminB"]) T[n] = await cuenta(`${n.toLowerCase()}-${randomUUID().slice(0, 6)}@novudent.test`, clave);
  const anonima = await http("POST", "/auth/v1/signup", { cuerpo: {} });
  assert.equal(anonima.status, 200, `sesión anónima: ${anonima.texto}`);
  T.visitante = { uid: anonima.json.user.id, token: anonima.json.access_token };
  assert.equal(anonima.json.user.is_anonymous, true);

  // Siembra con la clave de servicio (también prueba las rpc con service_role)
  const S = (tabla, cid, id, data) => guardar(SERVICIO, tabla, cid, id, data).then((r) => assert.equal(r.status, 204, `${tabla}/${id}: ${r.texto}`));
  await S("clinics", null, "clA", { id: "clA", name: "A", plan: "clinica", config: {} });
  await S("clinics", null, "clB", { id: "clB", name: "B", plan: "clinica" });
  await S("clinics", null, "cl_demo", { id: "cl_demo", name: "Demo" });
  await S("subscriptions", null, "clA", { clinicId: "clA", plan: "clinica", status: "active" });
  for (const [id, role] of [["adminA", "admin"], ["dentA", "dentist"], ["asisA", "assistant"]]) await S("users", "clA", id, { id, role, active: true, authUid: T[id].uid, email: `${id}@a.com` });
  await S("users", "clB", "adminB", { id: "adminB", role: "admin", active: true, authUid: T.adminB.uid });
  await S("patients", "clA", "p1", { id: "p1", firstName: "Ana", emr: [] });
  await S("patients", "clB", "pb", { id: "pb", firstName: "Beto" });
  await S("patients", "cl_demo", "pd", { id: "pd", firstName: "Demo" });
  const dm = (id, de, a) => ({ id, clinicId: "clA", fromId: de, fromName: de, toId: a, participants: [de, a], text: "hola", createdAt: "2026-10-17T12:00:00.000Z" });
  await S("directMessages", "clA", "dm1", dm("dm1", "dentA", "asisA"));
});

describe("PostgREST + GoTrue: el JWT llega a las políticas", { skip }, () => {
  test("sin clave la puerta de entrada rechaza; con la clave pública anda", async () => {
    const sin = await fetch(`${URL_BASE}/rest/v1/patients`);
    assert.equal(sin.status, 401);
    assert.equal((await leer(ANON, "patients?clinic_id=eq.cl_demo&select=id")).status, 200);
  });

  test("el administrador de A lee su clínica y no la de B (tablas camelCase incluidas)", async () => {
    const mia = await leer(T.adminA.token, "patients?clinic_id=eq.clA&select=id");
    assert.deepEqual(mia.json, [{ id: "p1" }]);
    assert.deepEqual((await leer(T.adminA.token, "patients?clinic_id=eq.clB&select=id")).json, []);
    const todos = await leer(T.adminA.token, "patients?select=clinic_id,id");
    assert.deepEqual(todos.json.map((p) => p.clinic_id).sort(), ["clA", "cl_demo"], "sin filtrar, solo ve su clínica y la demo");
    const dms = await leer(T.adminA.token, "directMessages?clinic_id=eq.clA&select=id");
    assert.deepEqual(dms.json, [{ id: "dm1" }], "el admin lee todos los directos");
  });

  test("mi_directorio y mi_usuario: la clínica y el id del DOCUMENTO de usuario, no el uid de login", async () => {
    const dir = await rpc("mi_directorio", {}, T.dentA.token);
    assert.equal(dir.status, 200);
    assert.deepEqual(dir.json, [{ clinic_id: "clA", user_id: "dentA" }]);
    assert.deepEqual((await rpc("mi_directorio", {}, T.visitante.token)).json, []);
    assert.deepEqual((await rpc("mi_usuario", { cid: "clA" }, T.asisA.token)).json, "asisA");
    assert.ok(denegadoHttp(await rpc("mi_directorio", {}, ANON)), "la clave pública sin sesión no llama a mi_directorio");
  });

  test("guardar / fijar_campo / mezclar_clinica / quitar / lote con los nombres de parámetros del contrato", async () => {
    const t = T.adminA.token;
    assert.equal((await guardar(t, "patients", "clA", "p2", { id: "p2", firstName: "Carla" })).status, 204);
    assert.equal((await rpc("fijar_campo", { tabla: "patients", clinic_id: "clA", id: "p2", campo: "phone", valor: "0981" }, t)).status, 204);
    assert.equal((await rpc("fijar_campo", { tabla: "patients", clinic_id: "clA", id: "p2", campo: "phone", valor: null }, t)).status, 204);
    assert.deepEqual((await leer(t, "patients?clinic_id=eq.clA&id=eq.p2&select=data")).json, [{ data: { id: "p2", firstName: "Carla", phone: null } }], "null se guarda como null");
    assert.equal((await rpc("fijar_campo", { tabla: "patients", clinic_id: "clA", id: "p2", campo: "phone", quitar: true }, t)).status, 204);
    assert.equal((await rpc("mezclar_clinica", { cid: "clA", parche: { config: { moneda: "PYG" } } }, t)).status, 204);
    const clinica = (await leer(t, "clinics?id=eq.clA&select=data")).json[0].data;
    assert.deepEqual(clinica.config, { moneda: "PYG" });
    const lote = await rpc("lote", { operaciones: [
      { op: "guardar", tabla: "patients", clinic_id: "clA", id: "p3", data: { id: "p3" } },
      { op: "fijar_campo", tabla: "patients", clinic_id: "clA", id: "p3", campo: "x", valor: 1 },
      { op: "quitar", tabla: "patients", clinic_id: "clA", id: "p2" },
    ] }, t);
    assert.equal(lote.status, 200);
    assert.equal(lote.json, 3);
    assert.deepEqual((await leer(t, "patients?clinic_id=eq.clA&select=id&order=id")).json.map((p) => p.id), ["p1", "p3"]);
    const roto = await rpc("lote", { operaciones: [
      { op: "guardar", tabla: "patients", clinic_id: "clA", id: "p4", data: { id: "p4" } },
      { op: "guardar", tabla: "patients", clinic_id: "clB", id: "p5", data: { id: "p5" } }, // la de otra clínica: rechazada
    ] }, t);
    assert.equal(roto.status, 403);
    assert.equal(roto.json.code, "42501");
    assert.deepEqual((await leer(t, "patients?clinic_id=eq.clA&id=eq.p4&select=id")).json, [], "el lote es atómico");
  });

  test("las reglas por campo y los roles se aplican por la API: el asistente no toca lo clínico, nadie cambia el plan, un usuario no se asciende", async () => {
    const as = T.asisA.token;
    const emr = await rpc("fijar_campo", { tabla: "patients", clinic_id: "clA", id: "p1", campo: "emr", valor: [{ note: "x" }] }, as);
    assert.equal(emr.status, 403);
    assert.equal(emr.json.code, "42501");
    assert.equal((await rpc("fijar_campo", { tabla: "patients", clinic_id: "clA", id: "p1", campo: "phone", valor: "0991" }, as)).status, 204, "la demografía sí");
    assert.ok(denegadoHttp(await rpc("fijar_campo", { tabla: "clinics", clinic_id: null, id: "clA", campo: "plan", valor: "cadena" }, T.adminA.token)));
    assert.ok(denegadoHttp(await rpc("fijar_campo", { tabla: "users", clinic_id: "clA", id: "dentA", campo: "role", valor: "admin" }, T.dentA.token)));
    assert.ok(denegadoHttp(await guardar(as, "payments", "clA", "pay1", { id: "pay1", amount: 1 })), "la asistente no cobra");
    assert.ok(denegadoHttp(await guardar(T.adminA.token, "clinics", null, "clZ", { id: "clZ" })), "un admin no crea clínicas");
  });

  test("un update directo de PostgREST bloqueado por la política no da error: afecta 0 filas (por eso existen las rpc)", async () => {
    const r = await http("PATCH", "/rest/v1/patients?clinic_id=eq.clB&id=eq.pb", { token: T.adminA.token, cuerpo: { data: { hackeado: true } }, headers: { Prefer: "return=representation" } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, []);
    const del = await http("DELETE", "/rest/v1/patients?clinic_id=eq.clB&id=eq.pb", { token: T.adminA.token, headers: { Prefer: "return=representation" } });
    assert.deepEqual(del.json, []);
    assert.deepEqual((await leer(SERVICIO, "patients?clinic_id=eq.clB&select=data")).json, [{ data: { id: "pb", firstName: "Beto" } }]);
  });

  test("anon (sin sesión) mira la demo y nada más, y no escribe", async () => {
    assert.deepEqual((await leer(ANON, "patients?select=clinic_id,id")).json, [{ clinic_id: "cl_demo", id: "pd" }]);
    assert.deepEqual((await leer(ANON, "clinics?select=id")).json, [{ id: "cl_demo" }]);
    assert.ok(denegadoHttp(await guardar(ANON, "patients", "cl_demo", "anon1", { id: "anon1" })));
    assert.ok(denegadoHttp(await leer(ANON, "leads?select=id")), "leads no tiene permisos de tabla");
  });

  test("la sesión anónima de GoTrue (la demo): escribe cl_demo y nada más, y no es de ninguna clínica", async () => {
    const v = T.visitante.token;
    assert.equal((await guardar(v, "patients", "cl_demo", "v1", { id: "v1" })).status, 204);
    assert.ok(denegadoHttp(await guardar(v, "patients", "clA", "v2", { id: "v2" })));
    assert.deepEqual((await leer(v, "patients?clinic_id=eq.clA&select=id")).json, []);
    assert.ok(denegadoHttp(await guardar(v, "users", "clA", "yo", { id: "yo", role: "admin", active: true, authUid: T.visitante.uid })), "no se hace miembro");
    assert.deepEqual((await leer(v, "subscriptions?select=id")).json, [], "ni la suscripción de A, ni la de una demo que no tiene");
  });

  test("service_role salta RLS y las reglas por campo (el servidor y el cargador de datos)", async () => {
    assert.equal((await leer(SERVICIO, "patients?select=id")).json.length >= 4, true);
    assert.equal((await rpc("fijar_campo", { tabla: "clinics", clinic_id: null, id: "clA", campo: "plan", valor: "cadena" }, SERVICIO)).status, 204);
    assert.equal((await leer(SERVICIO, "clinics?id=eq.clA&select=data")).json[0].data.plan, "cadena");
  });
});

// ───────────────────────────── Realtime ─────────────────────────────

/** Se suscribe a postgres_changes de una tabla con el JWT dado; devuelve los eventos que lleguen. */
function suscribir(token, tabla, filtro) {
  return new Promise((resolver, rechazar) => {
    const url = `${URL_BASE.replace("http", "ws")}/realtime/v1/websocket?apikey=${ANON}&vsn=1.0.0`;
    const ws = new WebSocket(url);
    const eventos = [];
    const topic = `realtime:${tabla}-${Math.random().toString(36).slice(2, 8)}`;
    const aviso = setTimeout(() => rechazar(new Error(`no llegó el aviso de suscripción (${tabla})`)), 20_000);
    const latido = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: "hb" })), 20_000);
    ws.onopen = () => ws.send(JSON.stringify({
      topic, event: "phx_join", ref: "1", join_ref: "1",
      payload: { config: { postgres_changes: [{ event: "*", schema: "public", table: tabla, ...(filtro ? { filter: filtro } : {}) }], broadcast: { self: false }, presence: { key: "" } }, access_token: token },
    }));
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.event === "postgres_changes") eventos.push(msg.payload.data);
      if (msg.event === "system" && msg.payload?.extension === "postgres_changes" && msg.payload.status === "ok") {
        clearTimeout(aviso);
        resolver({ eventos, cerrar: () => { clearInterval(latido); ws.close(); } });
      }
      if (msg.event === "phx_reply" && msg.payload?.status === "error") { clearTimeout(aviso); rechazar(new Error(`Realtime: ${JSON.stringify(msg.payload)}`)); }
      if (msg.event === "system" && msg.payload?.status === "error") { clearTimeout(aviso); rechazar(new Error(`Realtime: ${JSON.stringify(msg.payload)}`)); }
    };
    ws.onerror = () => { clearTimeout(aviso); rechazar(new Error("error de WebSocket")); };
  });
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(cond, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await esperar(150); } return cond(); }

describe("Realtime respeta la RLS de cada suscriptor", { skip }, () => {
  test("directMessages: llega a sus participantes y al admin, no a otra persona de la clínica ni a otra clínica ni a la demo", async () => {
    const admin = await suscribir(T.adminA.token, "directMessages", "clinic_id=eq.clA");
    const dent = await suscribir(T.dentA.token, "directMessages", "clinic_id=eq.clA");   // participante (remitente)
    const asis = await suscribir(T.asisA.token, "directMessages", "clinic_id=eq.clA");   // ni remitente ni destinatario del mensaje nuevo
    const otraClinica = await suscribir(T.adminB.token, "directMessages", "clinic_id=eq.clA");
    const visitante = await suscribir(T.visitante.token, "directMessages", "clinic_id=eq.clA");
    try {
      await esperar(1500);
      const nuevo = { id: "dmRT", clinicId: "clA", fromId: "adminA", fromName: "adminA", toId: "dentA", participants: ["adminA", "dentA"], text: "en vivo", createdAt: "2026-10-17T13:00:00.000Z" };
      assert.equal((await guardar(T.adminA.token, "directMessages", "clA", "dmRT", nuevo)).status, 204);
      assert.ok(await hasta(() => admin.eventos.length > 0 && dent.eventos.length > 0), "llegó a quien tenía que llegar");
      assert.equal(admin.eventos[0].type, "INSERT");
      assert.equal(admin.eventos[0].record.id, "dmRT");
      await esperar(2500);
      assert.equal(asis.eventos.length, 0, "otra persona de la clínica que no es participante");
      assert.equal(otraClinica.eventos.length, 0, "el admin de otra clínica");
      assert.equal(visitante.eventos.length, 0, "la sesión anónima de la demo");
    } finally {
      for (const s of [admin, dent, asis, otraClinica, visitante]) s.cerrar();
    }
  });

  test("outbox y teamMessages de la demo llegan a quien mira la demo, también sin sesión; los de una clínica real no", async () => {
    const anonDemo = await suscribir(ANON, "teamMessages", "clinic_id=eq.cl_demo");
    const anonReal = await suscribir(ANON, "teamMessages", "clinic_id=eq.clA");
    const miembro = await suscribir(T.dentA.token, "teamMessages", "clinic_id=eq.clA");
    try {
      await esperar(1500);
      await guardar(T.visitante.token, "teamMessages", "cl_demo", "tm1", { id: "tm1", text: "demo" });
      await guardar(T.adminA.token, "teamMessages", "clA", "tm2", { id: "tm2", text: "interno" });
      assert.ok(await hasta(() => anonDemo.eventos.length > 0 && miembro.eventos.length > 0), "los esperados llegaron");
      assert.equal(anonDemo.eventos[0].record.id, "tm1");
      assert.equal(miembro.eventos[0].record.id, "tm2");
      await esperar(2000);
      assert.equal(anonReal.eventos.length, 0, "sin sesión no se ve una clínica real en vivo");
      assert.equal(anonDemo.eventos.length, 1);
    } finally {
      for (const s of [anonDemo, anonReal, miembro]) s.cerrar();
    }
  });

  test("clinics: el cambio de permisos (config) llega al miembro de esa clínica en vivo", async () => {
    const miembro = await suscribir(T.dentA.token, "clinics", "id=eq.clA");
    const ajeno = await suscribir(T.adminB.token, "clinics", "id=eq.clA");
    try {
      await esperar(1500);
      assert.equal((await rpc("mezclar_clinica", { cid: "clA", parche: { config: { permisos: { cashier: { dar: [], quitar: [] } } } } }, T.adminA.token)).status, 204);
      assert.ok(await hasta(() => miembro.eventos.length > 0), "llegó");
      assert.deepEqual(miembro.eventos[0].record.data.config.permisos, { cashier: { dar: [], quitar: [] } });
      await esperar(2000);
      assert.equal(ajeno.eventos.length, 0);
    } finally {
      for (const s of [miembro, ajeno]) s.cerrar();
    }
  });
});
