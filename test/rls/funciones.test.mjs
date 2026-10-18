/**
 * Hito 1 — las operaciones de datos (guardar, quitar, fijar_campo, mezclar_clinica, lote) contra un Postgres real.
 * Se prueban con la clave de servicio (salta RLS) para ver solo su lógica; con RLS puesta se prueban en reglas.test.mjs.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { admin, cerrar, ejecutar, intentar, leerComoAdmin, prepararBase, sesiones } from "./entorno.mjs";

const S = sesiones.servicio;
const llamar = (sql, params) => ejecutar(S, sql, params);
const j = (x) => JSON.stringify(x);

before(async () => { await prepararBase(); });
after(async () => { await cerrar(); });

describe("fusion_profunda", () => {
  const fusionar = async (a, b) => (await llamar("select interno.fusion_profunda($1::jsonb, $2::jsonb) as r", [j(a), j(b)]))[0].r;

  test("mezcla objetos clave por clave, a cualquier profundidad", async () => {
    assert.deepEqual(
      await fusionar({ a: 1, config: { x: 1, anidado: { p: 1, q: 2 } } }, { b: 2, config: { y: 2, anidado: { q: 9, r: 3 } } }),
      { a: 1, b: 2, config: { x: 1, y: 2, anidado: { p: 1, q: 9, r: 3 } } });
  });

  test("los arreglos se reemplazan enteros, no se mezclan", async () => {
    assert.deepEqual(await fusionar({ config: { roles: [1, 2, 3] } }, { config: { roles: [9] } }), { config: { roles: [9] } });
    assert.deepEqual(await fusionar({ lista: [{ a: 1 }] }, { lista: [] }), { lista: [] });
  });

  test("null se guarda como null: no borra la clave", async () => {
    assert.deepEqual(await fusionar({ a: 1, b: { c: 1 } }, { a: null, b: null }), { a: null, b: null });
  });

  test("un valor que no es objeto reemplaza a un objeto, y al revés", async () => {
    assert.deepEqual(await fusionar({ a: { b: 1 } }, { a: "texto" }), { a: "texto" });
    assert.deepEqual(await fusionar({ a: "texto" }, { a: { b: 1 } }), { a: { b: 1 } });
  });

  test("un objeto vacío en el parche REEMPLAZA el campo (como Firestore y mezclarProfundo), y conserva a los hermanos", async () => {
    assert.deepEqual(await fusionar({ a: { b: 1 }, c: { d: 2 } }, { a: {} }), { a: {}, c: { d: 2 } });
    assert.deepEqual(await fusionar({ config: { a: { x: 1 }, b: { y: 2 }, lista: [1] } }, { config: { a: {}, lista: [] } }), { config: { a: {}, b: { y: 2 }, lista: [] } });
    assert.deepEqual(await fusionar({ a: { b: 1 } }, {}), { a: { b: 1 } }, "un parche vacío entero no cambia nada");
  });

  test("claves con caracteres raros (puntos, comillas, números) se tratan como una clave", async () => {
    assert.deepEqual(await fusionar({ "a.b": 1 }, { "a.b": 2, '"q"': 3, "11": 4 }), { "a.b": 2, '"q"': 3, "11": 4 });
  });
});

describe("guardar", () => {
  test("da el alta y después reemplaza el documento entero (setDoc sin merge)", async () => {
    await llamar("select public.guardar('patients', 'clG', 'p1', $1::jsonb)", [j({ id: "p1", nombre: "Ana", extra: { a: 1 } })]);
    assert.deepEqual(await leerComoAdmin("patients", "clG", "p1"), { id: "p1", nombre: "Ana", extra: { a: 1 } });
    await llamar("select public.guardar('patients', 'clG', 'p1', $1::jsonb)", [j({ id: "p1", nombre: "Ana María" })]);
    assert.deepEqual(await leerComoAdmin("patients", "clG", "p1"), { id: "p1", nombre: "Ana María" });
    assert.equal((await admin("select count(*)::int as n from public.patients where clinic_id = 'clG'"))[0].n, 1);
  });

  test("funciona con las tablas raíz (clinic_id null)", async () => {
    await llamar("select public.guardar('subscriptions', null, 'clG', $1::jsonb)", [j({ plan: "solo", status: "active" })]);
    assert.deepEqual(await leerComoAdmin("subscriptions", null, "clG"), { plan: "solo", status: "active" });
  });

  test("rechaza una tabla que no existe, el destino mal armado y un data que no es un objeto", async () => {
    for (const [sql, params, esperado] of [
      ["select public.guardar('directory', null, 'x', '{}'::jsonb)", [], "42P01"],
      ["select public.guardar('serviceAccounts', null, 'x', '{}'::jsonb)", [], "42P01"],
      ["select public.guardar('pg_authid', null, 'x', '{}'::jsonb)", [], "42P01"],
      [`select public.guardar('patients"; drop table public.users; --', 'clG', 'x', '{}'::jsonb)`, [], "42P01"],
      ["select public.guardar('patients', null, 'x', '{}'::jsonb)", [], "22023"],
      ["select public.guardar('patients', '', 'x', '{}'::jsonb)", [], "22023"],
      ["select public.guardar('subscriptions', 'clG', 'x', '{}'::jsonb)", [], "22023"],
      ["select public.guardar('patients', 'clG', '', '{}'::jsonb)", [], "22023"],
      ["select public.guardar('patients', 'clG', 'x', '[1]'::jsonb)", [], "22023"],
      ["select public.guardar('patients', 'clG', 'x', null)", [], "22023"],
    ]) {
      const r = await intentar(S, sql, params);
      assert.equal(r.ok, false, sql);
      assert.equal(r.codigo, esperado, `${sql} → ${r.error}`);
    }
    assert.ok((await admin("select to_regclass('public.users') as t"))[0].t, "la tabla users sigue existiendo");
  });
});

describe("quitar", () => {
  test("borra el documento y dice cuántos borró; si no existe, 0 y sin error", async () => {
    await llamar("select public.guardar('appointments', 'clQ', 'a1', '{\"id\":\"a1\"}'::jsonb)");
    assert.equal((await llamar("select public.quitar('appointments', 'clQ', 'a1') as n"))[0].n, 1);
    assert.equal(await leerComoAdmin("appointments", "clQ", "a1"), null);
    assert.equal((await llamar("select public.quitar('appointments', 'clQ', 'a1') as n"))[0].n, 0);
  });

  test("no toca el mismo id de otra clínica", async () => {
    await llamar("select public.guardar('appointments', 'clQ1', 'a1', '{\"id\":\"a1\"}'::jsonb)");
    await llamar("select public.guardar('appointments', 'clQ2', 'a1', '{\"id\":\"a1\"}'::jsonb)");
    await llamar("select public.quitar('appointments', 'clQ1', 'a1')");
    assert.deepEqual(await leerComoAdmin("appointments", "clQ2", "a1"), { id: "a1" });
  });
});

describe("fijar_campo", () => {
  const fijar = (extra) => llamar(`select public.fijar_campo('patients', 'clF', 'p1', ${extra})`);

  test("cambia un campo de primer nivel y no toca los demás", async () => {
    await llamar("select public.guardar('patients', 'clF', 'p1', $1::jsonb)", [j({ id: "p1", phone: "0981", odontogram: { 11: "sano" } })]);
    await fijar(`'phone', '"0991"'::jsonb`);
    assert.deepEqual(await leerComoAdmin("patients", "clF", "p1"), { id: "p1", phone: "0991", odontogram: { 11: "sano" } });
    await fijar(`'seguimiento', '{"motivo": "no quiere continuar"}'::jsonb`);
    assert.deepEqual((await leerComoAdmin("patients", "clF", "p1")).seguimiento, { motivo: "no quiere continuar" });
  });

  test("valor null se GUARDA como null (igual que Firestore), y la clave se quita solo con quitar = true", async () => {
    await fijar(`'phone', null`);
    assert.equal((await leerComoAdmin("patients", "clF", "p1")).phone, null);
    assert.ok("phone" in (await leerComoAdmin("patients", "clF", "p1")), "la clave sigue ahí, con null");
    await fijar(`'phone', '"0981"'::jsonb`);
    await fijar(`'phone', null, true`);
    assert.ok(!("phone" in (await leerComoAdmin("patients", "clF", "p1"))), "la clave se quitó");
    await fijar(`'noexiste', null, true`); // quitar una clave que no está no es un error
  });

  test("un campo vacío o con punto se rechaza (Firestore lo leería como una ruta anidada)", async () => {
    for (const campo of ["''", "'a.b'", "'config.permisos'", "null"]) {
      const r = await intentar(S, `select public.fijar_campo('patients', 'clF', 'p1', ${campo}, '1'::jsonb)`);
      assert.equal(r.ok, false, campo);
      assert.equal(r.codigo, "22023", campo);
    }
  });

  test("falla si el documento no existe (updateDoc → NOT_FOUND) y con una tabla que no está en la lista", async () => {
    const r = await intentar(S, `select public.fijar_campo('patients', 'clF', 'noexiste', 'x', '1'::jsonb)`);
    assert.equal(r.codigo, "42501");
    const t = await intentar(S, `select public.fijar_campo('directory', null, 'x', 'x', '1'::jsonb)`);
    assert.equal(t.codigo, "42P01");
  });

  test("funciona sobre una tabla raíz", async () => {
    await llamar("select public.guardar('subscriptions', null, 'clF', $1::jsonb)", [j({ plan: "solo", status: "active" })]);
    await llamar(`select public.fijar_campo('subscriptions', null, 'clF', 'status', '"past_due"'::jsonb)`);
    assert.deepEqual(await leerComoAdmin("subscriptions", null, "clF"), { plan: "solo", status: "past_due" });
  });
});

describe("mezclar_clinica", () => {
  test("fusión profunda sobre clinics.data; los arreglos se reemplazan y null se guarda", async () => {
    await llamar("select public.guardar('clinics', null, 'clM', $1::jsonb)", [j({ id: "clM", name: "M", plan: "clinica", config: { timezone: "America/Asuncion", permisos: { cashier: { dar: ["a"], quitar: [] } }, rolesPropios: [{ id: "rp_1" }] } })]);
    await llamar("select public.mezclar_clinica('clM', $1::jsonb)", [j({ config: { permisos: { receptionist: { dar: ["b"], quitar: [] } }, rolesPropios: [], moneda: null } })]);
    assert.deepEqual(await leerComoAdmin("clinics", null, "clM"), {
      id: "clM", name: "M", plan: "clinica",
      config: { timezone: "America/Asuncion", permisos: { cashier: { dar: ["a"], quitar: [] }, receptionist: { dar: ["b"], quitar: [] } }, rolesPropios: [], moneda: null },
    });
  });

  test("crea la clínica si no existe (setDoc con merge: true)", async () => {
    await llamar("select public.mezclar_clinica('clNueva', $1::jsonb)", [j({ config: { a: 1 } })]);
    assert.deepEqual(await leerComoAdmin("clinics", null, "clNueva"), { config: { a: 1 } });
  });

  test("rechaza un parche que no es un objeto", async () => {
    const r = await intentar(S, `select public.mezclar_clinica('clM', '[1]'::jsonb)`);
    assert.equal(r.codigo, "22023");
  });
});

describe("lote", () => {
  test("aplica todas las operaciones, en orden, y dice cuántas fueron", async () => {
    await llamar("select public.guardar('patients', 'clL', 'viejo', '{\"id\":\"viejo\"}'::jsonb)");
    await llamar("select public.guardar('clinics', null, 'clL', '{\"name\":\"L\"}'::jsonb)");
    const [{ n }] = await llamar("select public.lote($1::jsonb) as n", [j([
      { op: "guardar", tabla: "patients", clinic_id: "clL", id: "nuevo", data: { id: "nuevo", edad: 30 } },
      { op: "fijar_campo", tabla: "patients", clinic_id: "clL", id: "nuevo", campo: "edad", valor: 31 },
      { op: "fijar_campo", tabla: "patients", clinic_id: "clL", id: "nuevo", campo: "edad", quitar: true },
      { op: "quitar", tabla: "patients", clinic_id: "clL", id: "viejo" },
      { op: "mezclar_clinica", cid: "clL", parche: { config: { x: 1 } } },
    ])]);
    assert.equal(n, 5);
    assert.deepEqual(await leerComoAdmin("patients", "clL", "nuevo"), { id: "nuevo" });
    assert.equal(await leerComoAdmin("patients", "clL", "viejo"), null);
    assert.deepEqual(await leerComoAdmin("clinics", null, "clL"), { name: "L", config: { x: 1 } });
  });

  test("es atómico: si una operación falla, no queda ninguna de las anteriores", async () => {
    await llamar("select public.guardar('patients', 'clA2', 'p1', '{\"id\":\"p1\",\"v\":1}'::jsonb)");
    const r = await intentar(S, "select public.lote($1::jsonb)", [j([
      { op: "guardar", tabla: "patients", clinic_id: "clA2", id: "p1", data: { id: "p1", v: 2 } },
      { op: "guardar", tabla: "patients", clinic_id: "clA2", id: "p2", data: { id: "p2" } },
      { op: "fijar_campo", tabla: "patients", clinic_id: "clA2", id: "noexiste", campo: "x", valor: 1 }, // falla: no existe
    ])]);
    assert.equal(r.ok, false);
    assert.deepEqual(await leerComoAdmin("patients", "clA2", "p1"), { id: "p1", v: 1 }, "el primer guardar se deshizo");
    assert.equal(await leerComoAdmin("patients", "clA2", "p2"), null, "el segundo no quedó");
  });

  test("rechaza una operación desconocida, algo que no es un arreglo y más de 1000 operaciones", async () => {
    assert.equal((await intentar(S, `select public.lote('[{"op":"borrar_todo"}]'::jsonb)`)).codigo, "22023");
    assert.equal((await intentar(S, `select public.lote('{"op":"guardar"}'::jsonb)`)).codigo, "22023");
    const mil = Array.from({ length: 1001 }, (_, i) => ({ op: "guardar", tabla: "waitlist", clinic_id: "clBig", id: `w${i}`, data: { id: `w${i}` } }));
    assert.equal((await intentar(S, "select public.lote($1::jsonb)", [j(mil)])).codigo, "54000");
    assert.equal((await admin("select count(*)::int as n from public.waitlist where clinic_id = 'clBig'"))[0].n, 0);
  });

  test("un lote vacío no hace nada", async () => {
    assert.equal((await llamar("select public.lote('[]'::jsonb) as n"))[0].n, 0);
  });
});

describe("quién puede llamarlas", () => {
  test("anon no ejecuta ninguna (la demo se escribe con la sesión anónima de GoTrue, que es authenticated)", async () => {
    for (const sql of [
      "select public.guardar('patients', 'cl_demo', 'x', '{}'::jsonb)",
      "select public.quitar('patients', 'cl_demo', 'x')",
      "select public.fijar_campo('patients', 'cl_demo', 'x', 'a', '1'::jsonb)",
      "select public.mezclar_clinica('cl_demo', '{}'::jsonb)",
      "select public.lote('[]'::jsonb)",
      "select public.mi_usuario('cl_demo')",
      "select * from public.mi_directorio()",
    ]) {
      const r = await intentar(sesiones.anon, sql);
      assert.equal(r.ok, false, sql);
      assert.equal(r.codigo, "42501", `${sql} → ${r.error}`);
    }
  });

  test("las funciones auxiliares de `interno` no se pueden llamar desde la API (no está expuesto) y PUBLIC no las ejecuta", async () => {
    const [{ n }] = await admin(`select count(*)::int as n from information_schema.routine_privileges where specific_schema = 'interno' and grantee = 'PUBLIC'`);
    assert.equal(n, 0);
  });
});
