/**
 * Hito 1 — el esquema que genera scripts/supabase/generar-esquema.mjs, aplicado a un Postgres real (supabase/postgres).
 * Una tabla por colección del manifiesto, claves, índices, disparadores, publicación de Realtime e idempotencia.
 * Y los invariantes de seguridad que valen en cualquier momento: RLS en todas las tablas y nada abierto por defecto.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  MANIFIESTO, SIN_TABLA, TABLAS_CLINICA, TABLAS_RAIZ, TODAS_LAS_TABLAS, TABLAS_ESCUCHADAS,
  admin, aplicarMigraciones, cerrar, prepararBase, sembrar, leerComoAdmin,
} from "./entorno.mjs";

before(async () => { await prepararBase(); });
after(async () => { await cerrar(); });

const tablasPublicas = async () => (await admin("select tablename from pg_tables where schemaname = 'public' order by 1")).map((r) => r.tablename);

describe("tablas", () => {
  test("hay una tabla por colección del manifiesto y ninguna más", async () => {
    assert.deepEqual(await tablasPublicas(), [...TODAS_LAS_TABLAS].sort());
  });

  test("directory y serviceAccounts no se migran", async () => {
    const tablas = await tablasPublicas();
    for (const t of SIN_TABLA) assert.ok(!tablas.includes(t), `${t} no debería tener tabla`);
    assert.ok(SIN_TABLA.includes("directory") && SIN_TABLA.includes("serviceAccounts"));
  });

  test("las colecciones por clínica son (clinic_id, id, data jsonb, updated_at) con clave (clinic_id, id)", async () => {
    for (const t of TABLAS_CLINICA) {
      const cols = await admin(
        `select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [t]);
      assert.deepEqual(cols.map((c) => `${c.column_name}:${c.data_type}:${c.is_nullable}`),
        ["clinic_id:text:NO", "id:text:NO", "data:jsonb:NO", "updated_at:timestamp with time zone:NO"], t);
      assert.match(cols[3].column_default, /now\(\)/, `${t}.updated_at por defecto now()`);
      const pk = await admin(
        `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
         where i.indrelid = format('public.%I', $1::text)::regclass and i.indisprimary order by array_position(i.indkey::int2[], a.attnum)`, [t]);
      assert.deepEqual(pk.map((r) => r.attname), ["clinic_id", "id"], `${t}: clave primaria`);
    }
  });

  test("las colecciones raíz son (id, data jsonb, updated_at), sin clinic_id, con clave id", async () => {
    for (const t of TABLAS_RAIZ) {
      const cols = await admin(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [t]);
      assert.deepEqual(cols.map((c) => c.column_name), ["id", "data", "updated_at"], t);
      const pk = await admin(
        `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = format('public.%I', $1::text)::regclass and i.indisprimary`, [t]);
      assert.deepEqual(pk.map((r) => r.attname), ["id"], `${t}: clave primaria`);
    }
  });

  test("un documento no pasa de 2 MiB (la demo la escribe cualquiera)", async () => {
    const casiDos = "x".repeat(1_900_000);
    await admin(`insert into public.patients (clinic_id, id, data) values ('clBig', 'justo', jsonb_build_object('foto', $1::text))`, [casiDos]);
    await assert.rejects(admin(`insert into public.patients (clinic_id, id, data) values ('clBig', 'enorme', jsonb_build_object('foto', $1::text))`, [casiDos + casiDos]), (e) => e.code === "23514");
    await assert.rejects(admin(`insert into public.subscriptions (id, data) values ('enorme', jsonb_build_object('foto', $1::text))`, [casiDos + casiDos]), (e) => e.code === "23514");
  });

  test("`data` tiene que ser un objeto JSON", async () => {
    await assert.rejects(admin(`insert into public.patients (clinic_id, id, data) values ('clX', 'p', '[1]')`), /patients_data_objeto/);
    await assert.rejects(admin(`insert into public.patients (clinic_id, id, data) values ('clX', 'p', '"texto"')`), /patients_data_objeto/);
  });
});

describe("disparadores de la fila", () => {
  test("updated_at se renueva en cada update", async () => {
    await sembrar("patients", "clU", "p1", { id: "p1" });
    const [antes] = await admin(`select updated_at from public.patients where clinic_id = 'clU' and id = 'p1'`);
    await admin(`select pg_sleep(0.05)`);
    await admin(`update public.patients set data = '{"id":"p1","x":1}' where clinic_id = 'clU' and id = 'p1'`);
    const [despues] = await admin(`select updated_at from public.patients where clinic_id = 'clU' and id = 'p1'`);
    assert.ok(despues.updated_at > antes.updated_at);
  });

  test("la clave de un documento no se cambia (ni su clínica ni su id)", async () => {
    await sembrar("patients", "clU", "p2", { id: "p2" });
    await assert.rejects(admin(`update public.patients set clinic_id = 'clOtra' where clinic_id = 'clU' and id = 'p2'`), (e) => e.code === "42501");
    await assert.rejects(admin(`update public.patients set id = 'otro' where clinic_id = 'clU' and id = 'p2'`), (e) => e.code === "42501");
    await sembrar("subscriptions", null, "clU", { plan: "solo" });
    await assert.rejects(admin(`update public.subscriptions set id = 'otro' where id = 'clU'`), (e) => e.code === "42501");
  });
});

describe("índices", () => {
  const indices = async (tabla) => (await admin(`select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = $1`, [tabla]));

  test("users: un authUid pertenece a una sola clínica real (la demo no cuenta) y se busca por índice", async () => {
    const defs = (await indices("users")).map((i) => i.indexdef.toLowerCase());
    assert.ok(defs.some((d) => d.includes("create unique index") && d.includes("authuid") && d.includes("cl_demo")), "falta el índice único parcial de authUid");
    assert.ok(defs.some((d) => !d.includes("unique") && d.includes("authuid")), "falta el índice de consulta (clinic_id, authUid)");
    await sembrar("users", "clI1", "u1", { id: "u1", authUid: "11111111-1111-4111-8111-111111111111" });
    await assert.rejects(sembrar("users", "clI2", "u9", { id: "u9", authUid: "11111111-1111-4111-8111-111111111111" }), (e) => e.code === "23505");
    // en la demo se puede repetir (cualquiera planta un usuario ahí) y no bloquea a nadie
    await sembrar("users", "cl_demo", "d1", { id: "d1", authUid: "11111111-1111-4111-8111-111111111111" });
    await sembrar("users", "cl_demo", "d2", { id: "d2", authUid: "11111111-1111-4111-8111-111111111111" });
  });

  test("hay índices para las consultas que hace el servidor y el chat", async () => {
    const todos = async (t) => (await indices(t)).map((i) => i.indexdef).join("\n");
    assert.match(await todos("appointments"), /start/);
    assert.match(await todos("appointments"), /confirmToken/);
    assert.match(await todos("agendaBlocks"), /start/);
    assert.match(await todos("signatures"), /token/);
    assert.match(await todos("patients"), /document/);
    assert.match(await todos("directMessages"), /gin/i);
    assert.match(await todos("outbox"), /status/);
  });
});

describe("Realtime", () => {
  test("las tablas que el navegador escucha están en la publicación supabase_realtime con replica identity full", async () => {
    const pub = (await admin(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1`)).map((r) => r.tablename);
    assert.deepEqual(pub, [...TABLAS_ESCUCHADAS].sort());
    for (const t of TABLAS_ESCUCHADAS) {
      const [{ relreplident }] = await admin(`select relreplident from pg_class where oid = format('public.%I', $1::text)::regclass`, [t]);
      assert.equal(relreplident, "f", `${t}: replica identity full`);
    }
  });
});

describe("seguridad por defecto", () => {
  test("todas las tablas tienen RLS activado (sin force: las funciones del dueño tienen que poder leer users)", async () => {
    const filas = await admin(`select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`);
    assert.equal(filas.length, TODAS_LAS_TABLAS.length);
    for (const f of filas) {
      assert.equal(f.relrowsecurity, true, `${f.relname}: RLS apagado`);
      assert.equal(f.relforcerowsecurity, false, `${f.relname}: no debe tener force`);
    }
  });

  test("anon y authenticated nunca tienen TRUNCATE, REFERENCES, TRIGGER ni MAINTAIN, y sin una política no tienen ningún permiso", async () => {
    for (const t of TODAS_LAS_TABLAS) {
      for (const rol of ["anon", "authenticated"]) {
        for (const p of ["TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]) {
          const [{ tiene }] = await admin(`select has_table_privilege($1, format('public.%I', $2::text), $3) as tiene`, [rol, t, p]);
          assert.equal(tiene, false, `${rol} tiene ${p} sobre ${t}`);
        }
        const [{ n }] = await admin(`select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = $1`, [t]);
        if (n === 0) {
          for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
            const [{ tiene }] = await admin(`select has_table_privilege($1, format('public.%I', $2::text), $3) as tiene`, [rol, t, p]);
            assert.equal(tiene, false, `${rol} tiene ${p} sobre ${t} sin ninguna política`);
          }
        }
      }
    }
  });

  test("service_role tiene todos los permisos de tabla (salta RLS, pero igual los necesita)", async () => {
    for (const t of TODAS_LAS_TABLAS) {
      for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        const [{ tiene }] = await admin(`select has_table_privilege('service_role', format('public.%I', $1::text), $2) as tiene`, [t, p]);
        assert.equal(tiene, true, `service_role sin ${p} sobre ${t}`);
      }
    }
  });

  test("lo único `security definer` que queda expuesto en `public` es mi_directorio (el resto corre con los permisos de quien llama)", async () => {
    const definer = await admin(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef order by 1`);
    assert.deepEqual(definer.map((f) => f.proname), ["mi_directorio"]);
  });

  test("PostgREST solo ve `public`: las funciones auxiliares viven en `interno`", async () => {
    const [{ n }] = await admin(`select count(*)::int as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('isMember', 'isAdmin', 'tienePermiso', 'isCaja')`);
    assert.equal(n, 0);
    const [{ tiene }] = await admin(`select has_schema_privilege('anon', 'interno', 'USAGE') as tiene`);
    assert.equal(tiene, true, "anon necesita USAGE sobre interno para evaluar las políticas");
  });
});

describe("migraciones", () => {
  test("se pueden aplicar otra vez sin error y sin cambiar nada (idempotentes)", async () => {
    await sembrar("patients", "clIdem", "p1", { id: "p1", firstName: "Ana" });
    const antes = JSON.stringify(await admin(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`));
    const politicasAntes = JSON.stringify(await admin(`select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`));
    await aplicarMigraciones();
    await aplicarMigraciones();
    assert.equal(JSON.stringify(await admin(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`)), antes);
    assert.equal(JSON.stringify(await admin(`select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`)), politicasAntes);
    assert.deepEqual(await leerComoAdmin("patients", "clIdem", "p1"), { id: "p1", firstName: "Ana" });
    assert.equal((await tablasPublicas()).length, TODAS_LAS_TABLAS.length);
  });

  test("el manifiesto no trae colecciones que el generador no conozca", () => {
    const conocidas = new Set([...MANIFIESTO.porClinica, ...MANIFIESTO.raiz, ...MANIFIESTO.noSeMigra]);
    assert.equal(conocidas.size, MANIFIESTO.porClinica.length + MANIFIESTO.raiz.length + MANIFIESTO.noSeMigra.length, "una colección repetida en el manifiesto");
  });
});
