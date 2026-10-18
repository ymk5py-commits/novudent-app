/**
 * Hito 1 — las funciones auxiliares de los permisos (las `function` de firestore.rules), una por una, antes de que las use ninguna política.
 * Cada una se llama como la sesión de una persona (rol authenticated con el `sub` de GoTrue), igual que desde una política.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { admin, cerrar, como, ejecutar, intentar, prepararBase, sembrar, sesiones, uuidDe } from "./entorno.mjs";

const usuario = (id, role, extra = {}) => ({ id, role, active: true, authUid: uuidDe(id), email: `${id}@x.com`, ...extra });
const uno = async (sesion, sql, params = []) => (await ejecutar(sesion, sql, params))[0].r;
const es = (nombre, cid) => uno(sesiones.usuario(nombre), `select interno."${cid.fn}"($1) as r`, [cid.cid]);

before(async () => {
  await prepararBase();
  // Clínica A: una persona de cada rol de fábrica, una dada de baja y una con el campo `active` ausente
  await sembrar("clinics", null, "clA", { id: "clA", plan: "clinica", config: { timezone: "America/Asuncion" } });
  for (const [id, role] of [["adminA", "admin"], ["cajaA", "cashier"], ["recepA", "receptionist"], ["comA", "commercial"], ["dentA", "dentist"], ["asisA", "assistant"]]) {
    await sembrar("users", "clA", id, usuario(id, role));
  }
  await sembrar("users", "clA", "bajaA", usuario("bajaA", "admin", { active: false }));
  await sembrar("users", "clA", "viejoA", { id: "viejoA", role: "dentist", authUid: uuidDe("viejoA") }); // sin `active`
  await sembrar("users", "clA", "nuloA", usuario("nuloA", "dentist", { active: null }));
  await sembrar("users", "clA", "sinRolA", { id: "sinRolA", authUid: uuidDe("sinRolA"), active: true });
  await sembrar("users", "clA", "sinUidA", { id: "sinUidA", role: "admin", active: true }); // sin authUid: no es de nadie
  // Clínica B: otra persona
  await sembrar("clinics", null, "clB", { id: "clB", plan: "solo" });
  await sembrar("users", "clB", "adminB", usuario("adminB", "admin"));
});
after(async () => { await cerrar(); });

describe("interno.uid", () => {
  test("lee el sub de request.jwt.claims (como PostgREST) y devuelve null sin sesión", async () => {
    assert.equal(await uno(sesiones.usuario("adminA"), "select interno.uid()::text as r"), uuidDe("adminA"));
    assert.equal(await uno(sesiones.anon, "select interno.uid()::text as r"), null);
    assert.equal(await uno(sesiones.servicio, "select interno.uid()::text as r"), null);
  });
  test("también entiende el viejo request.jwt.claim.sub, y el valor no se filtra de un pedido al siguiente", async () => {
    const r = await como(sesiones.anon, async (c) => {
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, ["22222222-2222-4222-8222-222222222222"]);
      return (await c.query("select interno.uid()::text as r")).rows[0].r;
    });
    assert.equal(r, "22222222-2222-4222-8222-222222222222");
    assert.equal(await uno(sesiones.anon, "select interno.uid()::text as r"), null);
  });
});

describe("isDemo / isDemoRW", () => {
  test("isDemo es igualdad exacta con cl_demo (nunca prefijo ni contains)", async () => {
    for (const [cid, esperado] of [["cl_demo", true], ["cl_clinica-demo", false], ["cl_demo-suffix", false], ["CL_DEMO", false], ["", false]]) {
      assert.equal(await uno(sesiones.anon, `select interno."isDemo"($1) as r`, [cid]), esperado, cid);
    }
  });
  test("isDemoRW exige sesión: la anónima de GoTrue sí, la clave pública sin sesión no", async () => {
    assert.equal(await uno(sesiones.visitante(), `select interno."isDemoRW"('cl_demo') as r`), true);
    assert.equal(await uno(sesiones.usuario("cualquiera"), `select interno."isDemoRW"('cl_demo') as r`), true);
    assert.equal(await uno(sesiones.anon, `select interno."isDemoRW"('cl_demo') as r`), false);
    assert.equal(await uno(sesiones.visitante(), `select interno."isDemoRW"('cl_clinica-demo') as r`), false);
  });
});

describe("isMember / isAdmin / mi_usuario", () => {
  test("un miembro activo lo es; quien no tiene documento, no", async () => {
    for (const id of ["adminA", "cajaA", "recepA", "comA", "dentA", "asisA"]) assert.equal(await es(id, { fn: "isMember", cid: "clA" }), true, id);
    assert.equal(await es("forastero", { fn: "isMember", cid: "clA" }), false);
    assert.equal(await es("adminB", { fn: "isMember", cid: "clA" }), false, "ser de la clínica B no es ser de la A");
    assert.equal(await es("adminA", { fn: "isMember", cid: "clB" }), false);
    assert.equal(await uno(sesiones.anon, `select interno."isMember"('clA') as r`), false);
  });

  test("un documento sin authUid no es de nadie", async () => {
    assert.equal(await uno(sesiones.usuario("sinUidA"), `select interno."isMember"('clA') as r`), false);
  });

  test("active:false lo saca; un documento sin `active` o con active:null sigue siendo miembro (como `.get('active', true) != false`)", async () => {
    assert.equal(await es("bajaA", { fn: "isMember", cid: "clA" }), false);
    assert.equal(await es("bajaA", { fn: "isAdmin", cid: "clA" }), false);
    assert.equal(await es("viejoA", { fn: "isMember", cid: "clA" }), true);
    assert.equal(await es("nuloA", { fn: "isMember", cid: "clA" }), true);
  });

  test("isAdmin solo para role = admin", async () => {
    assert.equal(await es("adminA", { fn: "isAdmin", cid: "clA" }), true);
    for (const id of ["cajaA", "recepA", "comA", "dentA", "asisA", "sinRolA", "forastero"]) assert.equal(await es(id, { fn: "isAdmin", cid: "clA" }), false, id);
  });

  test("mi_usuario devuelve el id del DOCUMENTO (no el uid de login) y null si no es miembro", async () => {
    assert.equal(await uno(sesiones.usuario("dentA"), `select interno.mi_usuario('clA') as r`), "dentA");
    assert.equal(await uno(sesiones.usuario("dentA"), `select public.mi_usuario('clA') as r`), "dentA");
    assert.equal(await uno(sesiones.usuario("dentA"), `select interno.mi_usuario('clB') as r`), null);
    assert.equal(await uno(sesiones.usuario("bajaA"), `select interno.mi_usuario('clA') as r`), null);
    assert.equal(await uno(sesiones.usuario("forastero"), `select interno.mi_usuario('clA') as r`), null);
  });

  test("el id del documento puede ser distinto del authUid (usuarios migrados): se sigue ubicando por authUid", async () => {
    await sembrar("users", "clA", "u_viejo_firebase_9", { id: "u_viejo_firebase_9", role: "dentist", active: true, authUid: uuidDe("migrado") });
    assert.equal(await uno(sesiones.usuario("migrado"), `select interno.mi_usuario('clA') as r`), "u_viejo_firebase_9");
    assert.equal(await es("migrado", { fn: "isMember", cid: "clA" }), true);
  });

  test("mi_directorio: la clínica y el usuario de la sesión; nunca la demo; ninguna fila si está de baja o no tiene", async () => {
    const dir = (nombre) => ejecutar(sesiones.usuario(nombre), `select clinic_id, user_id from public.mi_directorio()`);
    assert.deepEqual(await dir("adminA"), [{ clinic_id: "clA", user_id: "adminA" }]);
    assert.deepEqual(await dir("adminB"), [{ clinic_id: "clB", user_id: "adminB" }]);
    assert.deepEqual(await dir("bajaA"), []);
    assert.deepEqual(await dir("forastero"), []);
    // el id del documento no es el uid de login (usuarios migrados de Firebase): devuelve el del documento
    await sembrar("users", "clA", "u_viejo_firebase_7", { id: "u_viejo_firebase_7", role: "dentist", active: true, authUid: uuidDe("migrado2") });
    assert.deepEqual(await dir("migrado2"), [{ clinic_id: "clA", user_id: "u_viejo_firebase_7" }]);
    // alguien planta un usuario en la demo con el authUid de otra persona: no la rutea a la demo
    await sembrar("users", "cl_demo", "plantado", { id: "plantado", role: "admin", active: true, authUid: uuidDe("victima") });
    assert.deepEqual(await dir("victima"), []);
    await sembrar("users", "clB", "victima", usuario("victima", "assistant"));
    assert.deepEqual(await dir("victima"), [{ clinic_id: "clB", user_id: "victima" }]);
    assert.deepEqual(await ejecutar(sesiones.servicio, `select * from public.mi_directorio()`), [], "la clave de servicio no es nadie");
  });
});

describe("tienePermiso y sus atajos (isCaja, isRecepcion, isClinical, puedeGastos, puedeLiquidaciones)", () => {
  const FABRICA = {
    isCaja: ["adminA", "cajaA"],
    isRecepcion: ["adminA", "cajaA", "recepA", "comA"],
    isClinical: ["adminA", "dentA"],
    puedeGastos: ["adminA"],
    puedeLiquidaciones: ["adminA"],
  };
  const TODOS = ["adminA", "cajaA", "recepA", "comA", "dentA", "asisA"];

  test("sin ajustes rige la matriz de fábrica", async () => {
    for (const [fn, permitidos] of Object.entries(FABRICA)) {
      for (const id of TODOS) assert.equal(await es(id, { fn, cid: "clA" }), permitidos.includes(id), `${fn} · ${id}`);
    }
  });

  test("un forastero, un dado de baja y quien no tiene rol no pueden nada, ni siquiera lo de fábrica", async () => {
    for (const fn of Object.keys(FABRICA)) {
      for (const id of ["forastero", "bajaA", "sinRolA", "sinUidA"]) assert.equal(await es(id, { fn, cid: "clA" }), false, `${fn} · ${id}`);
    }
    assert.equal(await uno(sesiones.anon, `select interno."isCaja"('clA') as r`), false);
  });

  test("los ajustes de la clínica dan y sacan permisos, en el acto y solo en esa clínica", async () => {
    await sembrar("clinics", null, "clP", { id: "clP", config: { permisos: {
      cashier: { dar: ["expenses.manage"], quitar: ["payments.manage"] },
      receptionist: { dar: ["payments.manage"], quitar: ["engagement.forms"] },
      dentist: { dar: ["engagement.forms"], quitar: ["emr.write"] },
      assistant: { dar: ["emr.write", "billing.reports", "practice.config", "users.manage"], quitar: [] },
      admin: { quitar: ["payments.manage", "emr.write"] },
    } } });
    for (const [id, role] of [["adminP", "admin"], ["cajaP", "cashier"], ["recepP", "receptionist"], ["dentP", "dentist"], ["asisP", "assistant"]]) {
      await sembrar("users", "clP", id, usuario(id, role));
    }
    const verdad = (fn, id) => es(id, { fn, cid: "clP" });
    assert.equal(await verdad("isCaja", "recepP"), true, "la recepción gana cobrar");
    assert.equal(await verdad("isCaja", "cajaP"), false, "la caja pierde cobrar");
    assert.equal(await verdad("puedeGastos", "cajaP"), true, "la caja gana gastos");
    assert.equal(await verdad("isRecepcion", "dentP"), true, "el dentista gana documentos");
    assert.equal(await verdad("isRecepcion", "recepP"), false, "la recepción pierde documentos");
    assert.equal(await verdad("isClinical", "asisP"), true, "la asistente gana la ficha");
    assert.equal(await verdad("isClinical", "dentP"), false, "el dentista pierde la ficha");
    assert.equal(await verdad("puedeLiquidaciones", "asisP"), true, "la asistente gana las liquidaciones");
    for (const fn of Object.keys(FABRICA)) assert.equal(await verdad(fn, "adminP"), true, `al admin no se le saca nada (${fn})`);
    // la misma persona de rol receptionist en otra clínica sin ajustes no cobra
    assert.equal(await es("recepA", { fn: "isCaja", cid: "clA" }), false);
  });

  test("dar y quitar a la vez: gana dar; listas o mapas mal formados se ignoran y rige la fábrica", async () => {
    await sembrar("clinics", null, "clQ", { id: "clQ", config: { permisos: {
      receptionist: { dar: ["payments.manage"], quitar: ["payments.manage", "engagement.forms"] },
      cashier: "basura",
      dentist: { dar: "emr.write", quitar: 3 },
      assistant: ["emr.write"],
    } } });
    for (const [id, role] of [["recepQ", "receptionist"], ["cajaQ", "cashier"], ["dentQ", "dentist"], ["asisQ", "assistant"]]) await sembrar("users", "clQ", id, usuario(id, role));
    assert.equal(await es("recepQ", { fn: "isCaja", cid: "clQ" }), true, "dar gana a quitar");
    assert.equal(await es("recepQ", { fn: "isRecepcion", cid: "clQ" }), false, "quitar rige");
    assert.equal(await es("cajaQ", { fn: "isCaja", cid: "clQ" }), true, "«basura» en vez de un mapa: fábrica");
    assert.equal(await es("dentQ", { fn: "isClinical", cid: "clQ" }), true, "listas que no son listas: fábrica");
    assert.equal(await es("asisQ", { fn: "isClinical", cid: "clQ" }), false, "un arreglo en vez de un mapa: fábrica");
  });

  test("config o permisos que no son mapas se ignoran, aunque el rol parezca un índice de arreglo", async () => {
    await sembrar("clinics", null, "clZ", { id: "clZ", config: { permisos: [{ dar: ["payments.manage"] }] } });
    await sembrar("users", "clZ", "cero", usuario("cero", "0"));
    await sembrar("users", "clZ", "cajaZ", usuario("cajaZ", "cashier"));
    assert.equal(await es("cero", { fn: "isCaja", cid: "clZ" }), false);
    assert.equal(await es("cajaZ", { fn: "isCaja", cid: "clZ" }), true);
    await sembrar("clinics", null, "clZ2", { id: "clZ2", config: "texto" });
    await sembrar("users", "clZ2", "cajaZ2", usuario("cajaZ2", "cashier"));
    assert.equal(await es("cajaZ2", { fn: "isCaja", cid: "clZ2" }), true);
  });

  test("un rol propio (rp_…) no hereda nada de fábrica: lo que puede es su `dar`; roles raros como «constructor» o «__proto__» no pueden nada", async () => {
    await sembrar("clinics", null, "clR", { id: "clR", config: { permisos: {
      rp_ab12cd34: { dar: ["payments.manage", "expenses.manage"], quitar: [] },
      rp_borrado1: { dar: [], quitar: [] },
    } } });
    for (const [id, role] of [["propR", "rp_ab12cd34"], ["vacioR", "rp_sinentrada"], ["huerfanoR", "rp_borrado1"], ["rarR", "constructor"], ["protoR", "__proto__"], ["comR", "commercial"]]) {
      await sembrar("users", "clR", id, usuario(id, role));
    }
    const verdad = (fn, id) => es(id, { fn, cid: "clR" });
    assert.equal(await verdad("isCaja", "propR"), true);
    assert.equal(await verdad("puedeGastos", "propR"), true);
    assert.equal(await verdad("isRecepcion", "propR"), false, "ni siquiera lo que tienen todos los roles de fábrica");
    assert.equal(await verdad("isClinical", "propR"), false);
    for (const id of ["vacioR", "huerfanoR", "rarR", "protoR"]) for (const fn of Object.keys(FABRICA)) assert.equal(await verdad(fn, id), false, `${fn} · ${id}`);
    assert.equal(await verdad("isRecepcion", "comR"), true, "Comercial es un rol de fábrica");
    assert.equal(await verdad("isCaja", "comR"), false);
  });
});

describe("subActive, effectivePlan, canWrite, canWritePremium", () => {
  const sub = (cid, data) => sembrar("subscriptions", null, cid, data);
  const usuariosDe = async (cid) => { await sembrar("clinics", null, cid, { id: cid, plan: "clinica" }); await sembrar("users", cid, `admin${cid}`, usuario(`admin${cid}`, "admin")); };
  const f = (cid, fn, ...args) => uno(sesiones.usuario(`admin${cid}`), `select interno."${fn}"($1${args.length ? ", $2" : ""}) as r`, [cid, ...args]);

  test("subActive: sin documento de suscripción → sí (grandfathering)", async () => {
    await usuariosDe("clS1");
    assert.equal(await f("clS1", "subActive"), true);
  });
  test("subActive: active y trialing sí; past_due, canceled y sin estado no", async () => {
    for (const [cid, status, esperado] of [["clS2", "active", true], ["clS3", "trialing", true], ["clS4", "past_due", false], ["clS5", "canceled", false], ["clS6", undefined, false]]) {
      await usuariosDe(cid);
      await sub(cid, { clinicId: cid, plan: "clinica", ...(status ? { status } : {}) });
      assert.equal(await f(cid, "subActive"), esperado, `${cid} ${status}`);
    }
  });
  test("subActive: el período vencido corta la escritura aunque el estado diga active; sin currentPeriodEndMs no vence nunca", async () => {
    await usuariosDe("clS7"); await sub("clS7", { plan: "clinica", status: "active", currentPeriodEndMs: 1000 });
    assert.equal(await f("clS7", "subActive"), false);
    await usuariosDe("clS8"); await sub("clS8", { plan: "clinica", status: "active", currentPeriodEndMs: Date.now() + 86_400_000 });
    assert.equal(await f("clS8", "subActive"), true);
    await usuariosDe("clS9"); await sub("clS9", { plan: "clinica", status: "active" });
    assert.equal(await f("clS9", "subActive"), true, "el caso de la auditoría: sin fecha, no vence");
    await usuariosDe("clS10"); await sub("clS10", { plan: "clinica", status: "active", currentPeriodEndMs: "mañana" });
    assert.equal(await f("clS10", "subActive"), false, "una fecha que no es un número no pasa");
  });

  test("effectivePlan: la suscripción manda; sin ella, clinics.plan; sin ninguno de los dos, 'clinica'", async () => {
    await usuariosDe("clE1"); await sub("clE1", { plan: "cadena", status: "active" });
    assert.equal(await f("clE1", "effectivePlan"), "cadena");
    await sembrar("clinics", null, "clE2", { id: "clE2", plan: "solo" }); await sembrar("users", "clE2", "adminclE2", usuario("adminclE2", "admin"));
    assert.equal(await f("clE2", "effectivePlan"), "solo");
    await sembrar("clinics", null, "clE3", { id: "clE3" }); await sembrar("users", "clE3", "adminclE3", usuario("adminclE3", "admin"));
    assert.equal(await f("clE3", "effectivePlan"), "clinica");
    await usuariosDe("clE4"); await sub("clE4", { status: "active" });
    assert.equal(await f("clE4", "effectivePlan"), null, "suscripción sin plan: no es de ningún plan");
  });

  test("canWrite: miembro con la suscripción al día, o la demo con sesión; no la demo sin sesión ni un forastero", async () => {
    assert.equal(await f("clS2", "canWrite"), true);
    assert.equal(await f("clS4", "canWrite"), false, "suscripción vencida");
    assert.equal(await f("clS1", "canWrite"), true, "sin suscripción");
    assert.equal(await uno(sesiones.usuario("forastero"), `select interno."canWrite"('clS2') as r`), false);
    assert.equal(await uno(sesiones.visitante(), `select interno."canWrite"('cl_demo') as r`), true);
    assert.equal(await uno(sesiones.anon, `select interno."canWrite"('cl_demo') as r`), false);
  });

  test("canWritePremium: además el plan tiene que estar en la lista", async () => {
    const premium = (cid, planes) => uno(sesiones.usuario(`admin${cid}`), `select interno."canWritePremium"($1, $2::text[]) as r`, [cid, planes]);
    assert.equal(await premium("clE1", ["cadena"]), true);
    assert.equal(await premium("clE1", ["solo"]), false);
    assert.equal(await premium("clS4", ["clinica", "cadena"]), false, "plan bueno pero suscripción vencida");
    assert.equal(await premium("clE4", ["clinica", "cadena"]), false, "suscripción sin plan");
    assert.equal(await uno(sesiones.visitante(), `select interno."canWritePremium"('cl_demo', array['cadena']) as r`), true, "la demo nunca se bloquea por plan");
  });
});

describe("ejecución", () => {
  test("las funciones de interno no se ejecutan sin permiso explícito, y service_role las ejecuta", async () => {
    const r = await intentar(sesiones.servicio, `select interno."isMember"('clA') as r`);
    assert.equal(r.ok, true);
    assert.equal(r.filas[0].r, false, "la clave de servicio no tiene sub: no es miembro de nadie (salta RLS, no las funciones)");
  });
  test("TODAS las funciones de public e interno (no solo las security definer) fijan el search_path", async () => {
    const sin = await admin(`
      select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'interno') and not coalesce(p.proconfig, '{}') @> array['search_path=""']`);
    assert.deepEqual(sin, []);
  });
});
