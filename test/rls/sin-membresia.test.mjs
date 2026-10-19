/**
 * Quien NO tiene membresía en una clínica no ve ni escribe nada fuera de cl_demo (spec 17-oct §4: el registro de GoTrue está abierto a
 * propósito porque la demo pública usa la sesión anónima, así que cualquiera llega con la clave pública y un uid válido).
 *
 * Se prueba con cinco «personas» sin acceso a la clínica de la víctima, contra TODAS las tablas y todos los comandos:
 *   anon          la clave pública, sin sesión
 *   visitante     la sesión anónima de la demo (rol authenticated, is_anonymous)
 *   forastero     una cuenta con email, creada por cualquiera con la clave pública (autoregistro), sin usuario en ninguna clínica
 *   sinSub        un JWT de rol authenticated SIN uid (no lo emite GoTrue, pero la base no debe confiar en eso)
 *   dadoDeBaja    miembro de la clínica con active:false (la credencial le sigue sirviendo)
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  TABLAS_CLINICA, TABLAS_RAIZ, TODAS_LAS_TABLAS, admin, cerrar, como, intentar, leerComoAdmin, prepararBase, sembrar, sesiones, uuidDe,
} from "./entorno.mjs";

const SOLO_SERVIDOR = ["webhookEvents", "leads", "checkoutTokens"];
const VICTIMA = "clVictima";

const personas = {
  anon: sesiones.anon,
  visitante: sesiones.visitante("visitanteDeLaDemo"),
  forastero: sesiones.usuario("forastero"),
  sinSub: { rol: "authenticated", claims: { role: "authenticated" } },
  dadoDeBaja: sesiones.usuario("exVictima"),
};
const noAnon = Object.entries(personas).filter(([n]) => n !== "anon");

const idDe = (tabla, cid) => (tabla === "clinics" || tabla === "subscriptions" || SOLO_SERVIDOR.includes(tabla) ? cid : "doc1");
const filaDe = (t, cid) => (TABLAS_CLINICA.includes(t) ? { clinic: cid, id: "doc1" } : { clinic: null, id: cid });

before(async () => {
  await prepararBase();
  // Clínica víctima: un documento en CADA tabla, y su administrador activo + un ex empleado de baja.
  for (const t of TODAS_LAS_TABLAS) {
    const f = filaDe(t, VICTIMA);
    if (t === "users") continue;
    await sembrar(t, f.clinic, f.id, { id: f.id, clinicId: VICTIMA, secreto: "PII de la víctima", participants: ["admVictima", "otro"] });
  }
  await sembrar("users", VICTIMA, "doc1", { id: "doc1", role: "admin", active: true, authUid: uuidDe("admVictima"), secreto: "PII" });
  await sembrar("users", VICTIMA, "exVictima", { id: "exVictima", role: "admin", active: false, authUid: uuidDe("exVictima") });
  // La demo: un documento en cada tabla por clínica y una raíz
  for (const t of TABLAS_CLINICA) await sembrar(t, "cl_demo", "demo1", { id: "demo1", clinicId: "cl_demo", participants: ["u1", "u2"], toId: "u2" });
  await sembrar("clinics", null, "cl_demo", { id: "cl_demo", name: "Demo" });
  await sembrar("subscriptions", null, "cl_demo", { plan: "cadena", status: "active" });
});
after(async () => { await cerrar(); });

describe("fuera de cl_demo, sin membresía: nada", () => {
  for (const [nombre, S] of Object.entries(personas)) {
    test(`${nombre}: no ve ninguna fila de la clínica de la víctima en ninguna tabla`, async () => {
      for (const t of TODAS_LAS_TABLAS) {
        const col = TABLAS_CLINICA.includes(t) ? "clinic_id" : "id";
        const r = await intentar(S, `select count(*)::int as n from public."${t}" where ${col} = $1`, [VICTIMA]);
        if (r.ok) assert.equal(r.filas[0].n, 0, `${nombre} ve ${r.filas[0].n} fila(s) de ${t}`);
        else assert.equal(r.codigo, "42501", `${t}: ${r.error}`); // sin permisos de tabla: también es no ver
      }
    });

    test(`${nombre}: sin filtrar por clínica, lo único que ve es la demo`, async () => {
      for (const t of TODAS_LAS_TABLAS) {
        const col = TABLAS_CLINICA.includes(t) ? "clinic_id" : "id";
        const r = await intentar(S, `select ${col} as c from public."${t}" where ${col} <> 'cl_demo'`);
        if (r.ok) assert.deepEqual(r.filas, [], `${nombre} ve filas ajenas en ${t}`);
      }
    });

    test(`${nombre}: no crea, cambia ni borra nada fuera de la demo (todas las tablas, todos los comandos)`, async () => {
      for (const t of TODAS_LAS_TABLAS) {
        const f = filaDe(t, VICTIMA);
        const antes = await leerComoAdmin(t, f.clinic, f.id);
        // alta de un documento nuevo en la clínica de la víctima, por la API (rpc) y directo
        const nuevo = await intentar(S, `select public.guardar($1, $2, 'nuevo', '{"id":"nuevo"}'::jsonb)`, [t, f.clinic]);
        assert.equal(nuevo.ok, false, `${nombre} creó un documento en ${t} (rpc)`);
        const directo = await intentar(S, TABLAS_CLINICA.includes(t)
          ? `insert into public."${t}" (clinic_id, id, data) values ($1, 'directo', '{}')` : `insert into public."${t}" (id, data) values ('directo', '{}')`, TABLAS_CLINICA.includes(t) ? [VICTIMA] : []);
        assert.equal(directo.ok, false, `${nombre} insertó en ${t}`);
        // pisar el que existe, por la API y directo (un update bloqueado por la RLS no da error: afecta 0 filas)
        const pisar = await intentar(S, `select public.guardar($1, $2, $3, '{"hackeado":true}'::jsonb)`, [t, f.clinic, f.id]);
        assert.equal(pisar.ok, false, `${nombre} pisó ${t}/${f.id} (rpc)`);
        const upd = await intentar(S, TABLAS_CLINICA.includes(t)
          ? `update public."${t}" set data = '{"hackeado":true}' where clinic_id = $1` : `update public."${t}" set data = '{"hackeado":true}' where id = $1`, [VICTIMA]);
        if (upd.ok) assert.equal(upd.cuantas, 0, `${nombre} actualizó ${upd.cuantas} fila(s) de ${t}`);
        const del = await intentar(S, TABLAS_CLINICA.includes(t) ? `delete from public."${t}" where clinic_id = $1` : `delete from public."${t}" where id = $1`, [VICTIMA]);
        if (del.ok) assert.equal(del.cuantas, 0, `${nombre} borró ${del.cuantas} fila(s) de ${t}`);
        const q = await intentar(S, `select public.quitar($1, $2, $3)`, [t, f.clinic, f.id]);
        if (q.ok) assert.equal(q.filas[0].quitar, 0, `${nombre} borró ${t}/${f.id} (rpc)`);
        assert.deepEqual(await leerComoAdmin(t, f.clinic, f.id), antes, `${t}/${f.id} cambió`);
      }
    });

    test(`${nombre}: no se hace miembro (ni de la clínica de la víctima ni de ninguna otra)`, async () => {
      for (const cid of [VICTIMA, "clOtra"]) {
        const alta = await intentar(S, `select public.guardar('users', $1, 'yo', $2::jsonb)`, [cid, JSON.stringify({ id: "yo", role: "admin", active: true, authUid: S.claims.sub ?? uuidDe("sinSub") })]);
        assert.equal(alta.ok, false, `${nombre} se dio de alta en ${cid}`);
      }
      const dir = await intentar(S, `select * from public.mi_directorio()`);
      if (dir.ok) assert.deepEqual(dir.filas, []);
      const yo = await intentar(S, `select public.mi_usuario($1) as u`, [VICTIMA]);
      if (yo.ok) assert.equal(yo.filas[0].u, null);
    });

    test(`${nombre}: ni por lote ni cambiando la clínica de un documento suyo de la demo`, async () => {
      const lote = await intentar(S, `select public.lote($1::jsonb)`, [JSON.stringify([
        { op: "guardar", tabla: "patients", clinic_id: "cl_demo", id: "dentroDeLote", data: { id: "dentroDeLote" } },
        { op: "guardar", tabla: "patients", clinic_id: VICTIMA, id: "fueraDeLote", data: { id: "fueraDeLote" } },
      ])]);
      assert.equal(lote.ok, false);
      assert.equal(await leerComoAdmin("patients", "cl_demo", "dentroDeLote"), null, "el lote es atómico: no queda ni lo de la demo");
      assert.equal(await leerComoAdmin("patients", VICTIMA, "fueraDeLote"), null);
      if (nombre !== "anon") {
        // un documento de la demo que se intenta mudar a la clínica de la víctima: la clave no se cambia
        await sembrar("patients", "cl_demo", "mudanza", { id: "mudanza" });
        const m = await intentar(S, `update public.patients set clinic_id = $1 where clinic_id = 'cl_demo' and id = 'mudanza'`, [VICTIMA]);
        assert.ok(!m.ok || m.cuantas === 0, "no se muda un documento de la demo a otra clínica");
        assert.notEqual(await leerComoAdmin("patients", "cl_demo", "mudanza"), null);
      }
    });
  }

  test("no vacían tablas (truncate) ni leen las del servidor, con ningún permiso de tabla heredado", async () => {
    for (const [nombre, S] of Object.entries(personas)) {
      for (const t of TODAS_LAS_TABLAS) assert.equal((await intentar(S, `truncate public."${t}"`)).ok, false, `${nombre} pudo vaciar ${t}`);
      const leads = await intentar(S, `select count(*)::int as n from public.leads`);
      assert.equal(leads.ok && leads.filas[0].n > 0, false, `${nombre} lee leads`);
    }
  });
});

describe("dentro de cl_demo: lo que corresponde", () => {
  test("anon (sin sesión) solo MIRA la demo: no escribe nada", async () => {
    for (const t of TABLAS_CLINICA) {
      const r = await intentar(personas.anon, `select count(*)::int as n from public."${t}" where clinic_id = 'cl_demo'`);
      // expenses y stock se leen con isDemoRW: sin sesión no se ve nada (y sin permisos de tabla, tampoco)
      if (["expenses", "stock"].includes(t)) assert.ok(!r.ok || r.filas[0].n === 0, `anon ve ${t} de la demo`);
      else assert.ok(r.ok && r.filas[0].n >= 1, `anon no ve ${t} de la demo (${r.error})`);
      const w = await intentar(personas.anon, `select public.guardar($1, 'cl_demo', 'anon1', '{"id":"anon1"}'::jsonb)`, [t]);
      assert.equal(w.ok, false, `anon escribió ${t} de la demo`);
    }
    const dem = await intentar(personas.anon, `select id from public.clinics where id = 'cl_demo'`);
    assert.deepEqual(dem.filas, [{ id: "cl_demo" }]);
  });

  test("la sesión anónima de la demo (y cualquier cuenta sin clínica) escribe la demo entera y nada más", async () => {
    for (const [nombre, S] of noAnon) {
      if (nombre === "sinSub" || nombre === "dadoDeBaja") continue; // sin uid no hay sesión; el de baja se prueba aparte
      for (const t of TABLAS_CLINICA) {
        const r = await intentar(S, `select public.guardar($1, 'cl_demo', $2, $3::jsonb)`, [t, `v_${nombre}`, JSON.stringify({ id: `v_${nombre}` })]);
        assert.equal(r.ok, true, `${nombre} no pudo escribir ${t} en la demo: ${r.error}`);
      }
    }
  });

  test("sin uid (JWT authenticated sin sub) la demo se mira pero no se escribe: isDemoRW exige sesión de verdad", async () => {
    const r = await intentar(personas.sinSub, `select public.guardar('patients', 'cl_demo', 'sinSub1', '{"id":"sinSub1"}'::jsonb)`);
    assert.equal(r.ok, false);
    const l = await intentar(personas.sinSub, `select count(*)::int as n from public.patients where clinic_id = 'cl_demo'`);
    assert.ok(l.ok && l.filas[0].n >= 1);
  });

  test("las tablas del servidor (leads, webhookEvents, checkoutTokens) y las suscripciones no se escriben ni en la demo", async () => {
    for (const [nombre, S] of Object.entries(personas)) {
      for (const t of SOLO_SERVIDOR) {
        const r = await intentar(S, `select public.guardar($1, null, 'cl_demo', '{"x":1}'::jsonb)`, [t]);
        assert.equal(r.ok, false, `${nombre} escribió ${t}`);
        const l = await intentar(S, `select count(*)::int as n from public."${t}"`);
        assert.equal(l.ok && l.filas[0].n > 0, false, `${nombre} lee ${t}`);
      }
      const s = await intentar(S, `select public.guardar('subscriptions', null, 'cl_demo', '{"plan":"cadena","status":"active"}'::jsonb)`);
      assert.equal(s.ok, false, `${nombre} escribió la suscripción de la demo`);
    }
  });

  test("el dado de baja ya no es nadie en su clínica, pero la demo la usa como cualquiera", async () => {
    const S = personas.dadoDeBaja;
    const dir = await intentar(S, `select * from public.mi_directorio()`);
    assert.deepEqual(dir.filas, []);
    const demo = await intentar(S, `select public.guardar('patients', 'cl_demo', 'baja1', '{"id":"baja1"}'::jsonb)`);
    assert.equal(demo.ok, true);
  });

  test("los roles TRUNCATE / REFERENCES / TRIGGER nunca se otorgaron (lo cubre esquema.test.mjs); ejecutar funciones de datos no abre nada", async () => {
    const tablas = TABLAS_RAIZ.length + TABLAS_CLINICA.length;
    assert.equal(tablas, TODAS_LAS_TABLAS.length);
    assert.equal((await admin(`select count(*)::int as n from public.leads`))[0].n, 1, "leads sigue intacta");
  });
});

describe("transacciones de verdad: lo que falla no deja rastro", () => {
  test("una operación rechazada dentro de una transacción larga no deja a medias la anterior", async () => {
    await assert.rejects(como(personas.visitante, async (c) => {
      await c.query(`select public.guardar('patients', 'cl_demo', 'atomico', '{"id":"atomico"}'::jsonb)`);
      await c.query(`select public.guardar('patients', '${VICTIMA}', 'atomico', '{"id":"atomico"}'::jsonb)`);
    }));
    assert.equal(await leerComoAdmin("patients", "cl_demo", "atomico"), null);
  });
});
