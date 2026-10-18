/**
 * Casos que el original de Firestore no tenía y que salieron de probar las políticas rompiéndolas a propósito (mutación): cada uno cubre
 * algo que, si se estropeaba, ninguno de los 143 casos lo notaba. Más: lo que tiene que poder hacer el servidor (service_role) y el
 * detalle de las reglas por campo con valores `null`.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { admin, cerrar, intentar, leerComoAdmin, prepararBase, sembrar, sesiones, uuidDe, TODAS_LAS_TABLAS, TABLAS_CLINICA } from "./entorno.mjs";

const usuario = (id, role, extra = {}) => ({ id, role, active: true, authUid: uuidDe(id), email: `${id}@x.com`, name: id, ...extra });
const U = (n) => sesiones.usuario(n);
const guardar = (S, tabla, cid, id, data) => intentar(S, "select public.guardar($1, $2, $3, $4::jsonb)", [tabla, cid, id, JSON.stringify(data)]);
const fijar = (S, tabla, cid, id, campo, valor) => intentar(S, "select public.fijar_campo($1, $2, $3, $4, $5::jsonb)", [tabla, cid, id, campo, JSON.stringify(valor)]);

before(async () => {
  await prepararBase();
  await sembrar("clinics", null, "clE", { id: "clE", plan: "clinica", config: {} });
  await sembrar("subscriptions", null, "clE", { plan: "clinica", status: "active" });
  for (const [id, role] of [["adminE", "admin"], ["dentE", "dentist"], ["asisE", "assistant"], ["recepE", "receptionist"]]) await sembrar("users", "clE", id, usuario(id, role));
  await sembrar("patients", "clE", "p1", { id: "p1", firstName: "Ana", odontogram: { 11: "sano" }, emr: [] });
  await sembrar("patients", "clE", "p2", { id: "p2", firstName: "Beto" });
});
after(async () => { await cerrar(); });

describe("users: cada uno edita SU documento y solo name/color", () => {
  test("no edita el nombre ni el color de OTRO usuario de su clínica; el admin sí", async () => {
    assert.equal((await fijar(U("dentE"), "users", "clE", "asisE", "name", "Cambiado por el dentista")).ok, false);
    assert.equal((await fijar(U("dentE"), "users", "clE", "asisE", "color", "#fff")).ok, false);
    assert.equal((await leerComoAdmin("users", "clE", "asisE")).name, "asisE");
    assert.equal((await fijar(U("dentE"), "users", "clE", "dentE", "name", "Mi nombre nuevo")).ok, true);
    assert.equal((await fijar(U("adminE"), "users", "clE", "asisE", "name", "Cambiado por el admin")).ok, true);
  });

  test("tampoco cambia su authUid (mudarse a otra cuenta) ni su id", async () => {
    assert.equal((await fijar(U("dentE"), "users", "clE", "dentE", "authUid", uuidDe("otraCuenta"))).ok, false);
    const r = await intentar(U("dentE"), `update public.users set id = 'otro' where clinic_id = 'clE' and id = 'dentE'`);
    assert.equal(r.ok, false);
  });
});

describe("clave inmutable en TODAS las tablas", () => {
  test("ninguna tabla deja cambiar el id ni la clínica de un documento (ni siquiera a service_role)", async () => {
    for (const t of TODAS_LAS_TABLAS) {
      const esClinica = TABLAS_CLINICA.includes(t);
      if (esClinica) await sembrar(t, "clK", "k1", { id: "k1" }); else await sembrar(t, null, "k1", { id: "k1" });
      const porId = await intentar(sesiones.servicio, `update public."${t}" set id = 'k2' where ${esClinica ? "clinic_id = 'clK' and " : ""}id = 'k1'`);
      assert.equal(porId.codigo, "42501", `${t}: cambió el id`);
      if (esClinica) {
        const porClinica = await intentar(sesiones.servicio, `update public."${t}" set clinic_id = 'clK2' where clinic_id = 'clK' and id = 'k1'`);
        assert.equal(porClinica.codigo, "42501", `${t}: cambió la clínica`);
      }
    }
  });
});

describe("patients: los campos clínicos, también con null y vacíos", () => {
  test("quien no es rol clínico no pone ni quita un campo clínico, aunque sea con null o con un valor vacío", async () => {
    for (const [campo, valor] of [["emr", null], ["emr", []], ["odontogram", {}], ["prescriptions", []], ["ortho", null], ["perio", null]]) {
      assert.equal((await fijar(U("asisE"), "patients", "clE", "p2", campo, valor)).ok, false, `asisE puso ${campo}=${JSON.stringify(valor)}`);
    }
    assert.equal((await fijar(U("asisE"), "patients", "clE", "p1", "emr", [])).ok, true, "reescribir el mismo valor no cambia nada: pasa (diff vacío)");
    assert.equal((await fijar(U("asisE"), "patients", "clE", "p1", "odontogram", { 11: "sano" })).ok, true);
  });

  test("el alta de un paciente con un campo clínico (aunque vacío) la rechaza la política; sin ellos, pasa", async () => {
    assert.equal((await guardar(U("recepE"), "patients", "clE", "nuevo1", { id: "nuevo1", emr: [] })).ok, false);
    assert.equal((await guardar(U("recepE"), "patients", "clE", "nuevo2", { id: "nuevo2", perio: null })).ok, false);
    assert.equal((await guardar(U("recepE"), "patients", "clE", "nuevo3", { id: "nuevo3", firstName: "Sin clínica" })).ok, true);
    assert.equal((await guardar(U("dentE"), "patients", "clE", "nuevo4", { id: "nuevo4", emr: [] })).ok, true, "un rol clínico sí");
  });

  test("setDoc de la ficha entera con lo clínico igual pasa (se actualiza, no se «da el alta»); con lo clínico distinto, no", async () => {
    const ficha = await leerComoAdmin("patients", "clE", "p1");
    assert.equal((await guardar(U("asisE"), "patients", "clE", "p1", { ...ficha, phone: "0981" })).ok, true);
    assert.equal((await guardar(U("asisE"), "patients", "clE", "p1", { ...ficha, perio: [{ at: "x" }] })).ok, false);
    assert.equal((await guardar(U("asisE"), "patients", "clE", "p1", { id: "p1", firstName: "Ana" })).ok, false, "sin el odontograma ni el emr (se quitan): cambia lo clínico");
  });
});

describe("clinics: el plan", () => {
  test("el admin no cambia el plan, pero reescribir el mismo valor (un no-op) pasa; con la suscripción como fuente, nada lo mueve", async () => {
    assert.equal((await fijar(U("adminE"), "clinics", null, "clE", "plan", "cadena")).ok, false);
    assert.equal((await fijar(U("adminE"), "clinics", null, "clE", "plan", "clinica")).ok, true);
    assert.equal((await intentar(U("adminE"), `select public.fijar_campo('clinics', null, 'clE', 'plan', null, true)`)).ok, false, "tampoco quitarlo");
    assert.equal((await intentar(U("adminE"), `select public.mezclar_clinica('clE', '{"plan":"cadena"}'::jsonb)`)).ok, false);
    assert.equal((await intentar(U("adminE"), `select public.mezclar_clinica('clE', '{"config":{"moneda":"PYG"}}'::jsonb)`)).ok, true);
    assert.equal((await leerComoAdmin("clinics", null, "clE")).plan, "clinica");
  });
});

describe("el servidor (service_role) y el cargador (postgres) no están sujetos a las reglas por campo", () => {
  test("service_role cambia el plan, el rol de un usuario, la ficha clínica y manda un directo con cualquier remitente", async () => {
    const S = sesiones.servicio;
    assert.equal((await fijar(S, "clinics", null, "clE", "plan", "cadena")).ok, true);
    assert.equal((await fijar(S, "users", "clE", "dentE", "role", "admin")).ok, true);
    assert.equal((await fijar(S, "patients", "clE", "p2", "emr", [{ note: "cargado por el servidor" }])).ok, true);
    const dm = { id: "dm1", clinicId: "clE", fromId: "cualquiera", fromName: "x", toId: "otro", participants: ["cualquiera", "otro"], text: "migrado", createdAt: "2026-01-01T00:00:00.000Z" };
    assert.equal((await guardar(S, "directMessages", "clE", "dm1", dm)).ok, true);
    assert.equal((await guardar(S, "directMessages", "clE", "dm2", { texto: "ni siquiera tiene la forma" })).ok, true);
  });

  test("una conexión directa como postgres (el cargador de datos) tampoco, y las funciones de datos le sirven igual", async () => {
    await admin(`update public.users set data = jsonb_set(data, '{role}', '"dentist"') where clinic_id = 'clE' and id = 'dentE'`);
    await admin(`select public.guardar('patients', 'clE', 'cargado', '{"id":"cargado","emr":[{"n":1}]}'::jsonb)`);
    assert.deepEqual((await leerComoAdmin("patients", "clE", "cargado")).emr, [{ n: 1 }]);
  });
});

describe("fecha: «ahora» para el vencimiento es la del servidor", () => {
  test("un período que vence dentro de un rato escribe; vencido ayer, no", async () => {
    await sembrar("subscriptions", null, "clE", { plan: "clinica", status: "active", currentPeriodEndMs: Date.now() + 3_600_000 });
    assert.equal((await guardar(U("adminE"), "appointments", "clE", "a1", { id: "a1" })).ok, true);
    await sembrar("subscriptions", null, "clE", { plan: "clinica", status: "active", currentPeriodEndMs: Date.now() - 86_400_000 });
    assert.equal((await guardar(U("adminE"), "appointments", "clE", "a2", { id: "a2" })).ok, false);
  });
});

describe("la demo tiene tope de filas por colección (5000, 53400)", () => {
  const TOPE = 5000;
  const llenarDemo = (tabla, cuantas, prefijo = "relleno") => admin(
    `insert into public."${tabla}" (clinic_id, id, data) select 'cl_demo', $1 || g, jsonb_build_object('id', $1 || g) from generate_series(1, $2::int) g`, [prefijo, cuantas]);
  const V = sesiones.visitante("visitanteTope");

  test("justo en el borde: con 4999 filas entra una más, con 5000 ya no; el reemplazo de una existente sí", async () => {
    await llenarDemo("patients", TOPE - 1);
    assert.equal((await guardar(V, "patients", "cl_demo", "la5000", { id: "la5000" })).ok, true);
    const rechazada = await guardar(V, "patients", "cl_demo", "la5001", { id: "la5001" });
    assert.equal(rechazada.ok, false);
    assert.equal(rechazada.codigo, "53400");
    assert.equal((await guardar(V, "patients", "cl_demo", "la5000", { id: "la5000", firstName: "reemplazo" })).ok, true, "reemplazar no es un alta");
    assert.equal((await fijar(V, "patients", "cl_demo", "la5000", "phone", "0981")).ok, true);
  });

  test("«Restaurar datos de demo» (borrar y volver a crear en una misma transacción) anda aunque la colección esté llena", async () => {
    const r = await intentar(V, "select public.lote($1::jsonb)", [JSON.stringify([
      { op: "quitar", tabla: "patients", clinic_id: "cl_demo", id: "relleno1" },
      { op: "guardar", tabla: "patients", clinic_id: "cl_demo", id: "restaurado", data: { id: "restaurado" } },
    ])]);
    assert.equal(r.ok, true, r.error);
    const sinBorrar = await intentar(V, "select public.lote($1::jsonb)", [JSON.stringify([
      { op: "guardar", tabla: "patients", clinic_id: "cl_demo", id: "otro1", data: { id: "otro1" } },
    ])]);
    assert.equal(sinBorrar.ok, false);
    assert.equal(sinBorrar.codigo, "53400");
  });

  test("las otras clínicas, el servidor y el cargador no tienen tope aunque la demo esté llena", async () => {
    await sembrar("subscriptions", null, "clE", { plan: "clinica", status: "active" }); // (el caso anterior la dejó vencida)
    assert.equal((await guardar(U("adminE"), "patients", "clE", "ok1", { id: "ok1" })).ok, true);
    assert.equal((await guardar(sesiones.servicio, "patients", "cl_demo", "delServidor", { id: "delServidor" })).ok, true);
    await admin(`insert into public.patients (clinic_id, id, data) values ('cl_demo', 'delCargador', '{"id":"delCargador"}')`);
  });

  test("el tope vale en las 36 colecciones de cada clínica", async () => {
    for (const t of TABLAS_CLINICA.filter((c) => c !== "patients")) {
      await llenarDemo(t, TOPE);
      const r = await guardar(V, t, "cl_demo", "uno-de-mas", { id: "uno-de-mas" });
      assert.equal(r.ok, false, `${t}: dejó pasar el alta número ${TOPE + 1}`);
      assert.equal(r.codigo, "53400", `${t}: ${r.error}`);
    }
  });
});
