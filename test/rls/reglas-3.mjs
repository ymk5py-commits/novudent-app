/**
 * Auditoría de aislamiento multi-clínica (originales: «AUDITORÍA DE AISLAMIENTO MULTI-CLÍNICA (ago-2026)», secciones 1 a 7).
 * Los barridos recorren las 36 colecciones por clínica: alcanza con que UNA se escape para que se filtre historia clínica entre clínicas.
 */
import assert from "node:assert/strict";
import {
  anon, authed, barrido, caso, consultaFiltrada, deleteDoc, denegado, directorio, getDoc, getDocs, getTodas, permitido,
  sembrarRuta, setDoc, TABLAS_CLINICA, updateDoc, uuidDe, actualizarComoAdmin,
} from "./compat.mjs";
import { directo } from "./semilla.mjs";

const COLECCIONES_DE_CLINICA = TABLAS_CLINICA;

// ---- 1. Barrido cross-clínica sobre las 36 colecciones ----

caso("AISLAMIENTO: un miembro de A no LEE ninguna colección de la clínica X", async () => {
  await barrido("adminA lee clX/<colección>/seed", "denegado", COLECCIONES_DE_CLINICA, (c) => getDoc(authed("adminA"), `clinics/clX/${c}/seed`));
});

caso("AISLAMIENTO: un miembro de A no ESCRIBE ninguna colección de la clínica X", async () => {
  await barrido("adminA escribe clX/<colección>/seed", "denegado", COLECCIONES_DE_CLINICA, (c) => setDoc(authed("adminA"), `clinics/clX/${c}/seed`, { hackeado: true }));
});

caso("AISLAMIENTO: un miembro de A no BORRA ninguna colección de la clínica X", async () => {
  await barrido("adminA borra clX/<colección>/seed", "denegado", COLECCIONES_DE_CLINICA, (c) => deleteDoc(authed("adminA"), `clinics/clX/${c}/seed`));
});

caso("AISLAMIENTO: un miembro de A no LISTA colecciones de la clínica X (query, no get)", { diferencia: "Firestore rechaza la consulta entera; Postgres la contesta vacía (la RLS filtra). Denegado = no devuelve ningún documento de clX y los hay." }, async () => {
  await barrido("adminA lista clX/<colección>", "denegado", COLECCIONES_DE_CLINICA, async (c) =>
    consultaFiltrada(await getDocs(authed("adminA"), `clinics/clX/${c}`), () => false));
});

caso("AISLAMIENTO: el doc raíz de la clínica X (config, token de Botika) es opaco para A", async () => {
  await denegado("adminA lee clX", getDoc(authed("adminA"), "clinics/clX"));
  await denegado("adminA cambia clX", updateDoc(authed("adminA"), "clinics/clX", { name: "robada" }));
  await denegado("adminA borra clX", deleteDoc(authed("adminA"), "clinics/clX"));
  await denegado("adminA lee subscriptions/clX", getDoc(authed("adminA"), "subscriptions/clX"));
});

caso("CONTROL: un miembro legítimo de X SÍ opera sus colecciones (el deny de arriba es aislamiento, no cobro/plan)", async () => {
  // surveyResponses es de escritura server-only por diseño (alta pública vía /api)
  const cols = COLECCIONES_DE_CLINICA.filter((c) => c !== "surveyResponses");
  await barrido("adminX escribe clX/<colección>/ok", "permitido", cols, (c) => {
    // directMessages valida el contenido (remitente, destinatario, texto): va un directo bien formado.
    const datos = c === "directMessages" ? directo({ id: "ok", cid: "clX", de: "adminX", a: "recepX" }) : { id: "ok" };
    return setDoc(authed("adminX"), `clinics/clX/${c}/ok`, datos);
  });
});

// ---- 2. Cuenta recién registrada, sin clínica ----
// GoTrue deja registrarse a cualquiera con la clave pública (hace falta para la demo): llega con un uid válido y CERO membresías.

caso("FORASTERO: una cuenta sin clínica no lee NADA de una clínica real", async () => {
  await barrido("forastero lee clX/<colección>/seed", "denegado", COLECCIONES_DE_CLINICA, (c) => getDoc(authed("forastero"), `clinics/clX/${c}/seed`));
  await denegado("forastero lee clX", getDoc(authed("forastero"), "clinics/clX"));
  await denegado("forastero lee subscriptions/clX", getDoc(authed("forastero"), "subscriptions/clX"));
});

caso("FORASTERO: una cuenta sin clínica no puede AUTO-INSCRIBIRSE (bootstrap de membresía)", { noAplica: "serviceAccounts y directory no existen (las escrituras a ellos fallan porque no hay tabla); lo que cuenta —crearse un users propio para ser miembro— sigue denegado." }, async () => {
  // isMember() se apoya en la existencia del documento de usuario con su authUid. Si esa creación fuera libre, cualquiera se haría miembro.
  await denegado("forastero se crea admin en clX", setDoc(authed("forastero"), "clinics/clX/users/forastero", { id: "forastero", role: "admin", active: true, clinicId: "clX", email: "f@x.com" }));
  await denegado("forastero se crea admin en clA", setDoc(authed("forastero"), "clinics/clA/users/forastero", { id: "forastero", role: "admin", active: true, clinicId: "clA", email: "f@x.com" }));
  await denegado("forastero se escribe en serviceAccounts", setDoc(authed("forastero"), "serviceAccounts/forastero", { note: "yo" }));
  await denegado("forastero se escribe en directory", setDoc(authed("forastero"), "directory/forastero", { clinicId: "clX", email: "f@x.com" }));
});

// ---- 3. Sin sesión (isDemo no exige estar autenticado) ----

caso("ANÓNIMO: sin sesión no se lee ni escribe ninguna clínica real", async () => {
  await barrido("anon lee clX/<colección>/seed", "denegado", COLECCIONES_DE_CLINICA, (c) => getDoc(anon(), `clinics/clX/${c}/seed`));
  await barrido("anon escribe clX/<colección>/x", "denegado", COLECCIONES_DE_CLINICA, (c) => setDoc(anon(), `clinics/clX/${c}/x`, { x: 1 }));
  await denegado("anon lee clX", getDoc(anon(), "clinics/clX"));
});

caso("ANÓNIMO: no se pueden enumerar las clínicas del proyecto", { diferencia: "Firestore rechaza la consulta entera; Postgres contesta con lo permitido: anon solo ve la demo, un admin solo su clínica (y la demo, que es pública). Denegado = no aparece ninguna otra. leads no tiene permisos de tabla para nadie." }, async () => {
  const sinLoAjeno = (permitidos) => (r) => consultaFiltrada(r, (d) => permitidos.includes(d.id));
  await denegado("anon lista clinics", sinLoAjeno(["cl_demo"])(await getDocs(anon(), "clinics")));
  await denegado("adminA lista clinics", sinLoAjeno(["clA", "cl_demo"])(await getDocs(authed("adminA"), "clinics")));
  await denegado("adminA lista directory", getDocs(authed("adminA"), "directory"));
  await denegado("adminA lista subscriptions", sinLoAjeno(["clA", "cl_demo"])(await getDocs(authed("adminA"), "subscriptions")));
  await denegado("adminA lista leads", getDocs(authed("adminA"), "leads"));
  // y lo propio sí se ve
  const propias = await getDocs(authed("adminA"), "clinics");
  assert.ok(propias.ids.includes("clA"), "adminA tiene que ver su propia clínica");
});

caso("COLLECTION GROUP: no se puede barrer una colección a través de TODAS las clínicas", { diferencia: "Firestore rechaza la consulta de grupo; Postgres la contesta con lo permitido (las clínicas propias y la demo). Denegado = no devuelve filas de otra clínica." }, async () => {
  // El agujero clásico de multi-tenant: un solo query que devuelve los pacientes de todas las clínicas del proyecto.
  const ajenas = (propias) => (r) => {
    if (!r.ok) return { ok: false, error: r.error, codigo: r.codigo, motivo: r.motivo };
    const fuera = r.filas.filter((f) => !propias.includes(f.clinic_id));
    return { ok: fuera.length > 0, motivo: "consulta filtrada (solo lo permitido)" };
  };
  await barrido("adminA barre <colección> de todas las clínicas", "denegado", ["patients", "users", "signatures", "radiographs", "payments", "settlements", "billing", "directMessages"],
    async (c) => ajenas(["clA", "cl_demo"])(await getTodas(authed("adminA"), c)));
  await barrido("anon barre <colección> de todas las clínicas", "denegado", ["patients", "users", "signatures", "radiographs", "payments", "settlements", "billing", "directMessages"],
    async (c) => ajenas(["cl_demo"])(await getTodas(anon(), c)));
});

// ---- 4. Envenenamiento del directorio (ruteo de login uid → clínica) ----

caso("DIRECTORY: un admin NO puede reescribir ni borrar la entrada ya existente de otro uid", { noAplica: "directory no existe. El ruteo de un uid está en SU documento de usuario: un admin de otra clínica no lo puede cambiar, ni borrar, ni copiar el authUid a su clínica (índice único)." }, async () => {
  await denegado("adminA reapunta el usuario adminX (cambia su authUid)", updateDoc(authed("adminA"), "clinics/clX/users/adminX", { authUid: uuidDe("adminA") }));
  await denegado("adminA borra el usuario adminX", deleteDoc(authed("adminA"), "clinics/clX/users/adminX"));
  await denegado("adminA agrega a su clínica el authUid de adminX", setDoc(authed("adminA"), "clinics/clA/users/robo", { id: "robo", role: "assistant", active: true, clinicId: "clA", email: "x@x.com", authUid: uuidDe("adminX") }));
  const r = await directorio(authed("adminX"));
  assert.equal(r.filas[0]?.clinic_id, "clX", "adminX sigue ruteando a clX");
});

caso("DIRECTORY: un admin SÍ puede sembrar el ruteo de un uid ajeno SIN entrada previa (residual)", { noAplica: "directory no existe. El residual sigue igual: un admin da de alta en SU clínica a un uid que todavía no es de nadie (y desde ese momento esa persona rutea a esa clínica)." }, async () => {
  // La condición que se pierde en Firestore —que el users/{uid} lo crea el propio admin— sigue sin atar nada.
  await permitido("adminA crea el usuario uidAjeno", setDoc(authed("adminA"), "clinics/clA/users/uidAjeno",
    { id: "uidAjeno", role: "assistant", active: true, clinicId: "clA", email: "ajeno@otra.com" }));
  const r = await directorio(authed("uidAjeno"));
  await permitido("uidAjeno rutea a clA", { ...r, ok: r.ok && r.filas[0].clinic_id === "clA" });
});

caso("CERRADO · nadie rutea un uid ajeno hacia la demo aunque se haga 'admin' de ella", async () => {
  /* `isDemo(cid)` no mira el rol, así que hacerse admin de `cl_demo` es gratis: alcanza con escribirse el propio users/{uid} con role:'admin'.
   * Desde esa silla se sembraba el ruteo de un uid ajeno hacia la demo. La demo queda excluida como destino de ruteo. */
  await permitido("forastero se hace admin de la demo", setDoc(authed("forastero"), "clinics/cl_demo/users/forastero", { id: "forastero", role: "admin", active: true, clinicId: "cl_demo", email: "f@x.com" }));
  await permitido("forastero planta un usuario con el authUid de otraPersona", setDoc(authed("forastero"), "clinics/cl_demo/users/otroUid", { id: "otroUid", role: "assistant", active: true, clinicId: "cl_demo", email: "v@v.com" }));
  // …pero el ruteo del login ya no: mi_directorio() nunca devuelve la demo.
  await denegado("otroUid rutea a la demo", directorio(authed("otroUid")));
});

// ---- 5. El campo `clinicId` de adentro del doc no se valida (backlog I8) ----

caso("I8: se guarda en la clínica A un documento que dice pertenecer a la clínica X", async () => {
  // El PATH aísla, el CAMPO miente. Nada en las reglas exige data.clinicId == cid.
  await permitido("adminA patients con clinicId clX", setDoc(authed("adminA"), "clinics/clA/patients/pMentira", { id: "pMentira", clinicId: "clX", firstName: "Mentira" }));
  await permitido("adminA outbox con clinicId clX", setDoc(authed("adminA"), "clinics/clA/outbox/tMentira", { id: "tMentira", clinicId: "clX", type: "cobranza", status: "pendiente" }));
  await permitido("adminA users con clinicId clX", setDoc(authed("adminA"), "clinics/clA/users/uMentira", { id: "uMentira", role: "assistant", active: true, clinicId: "clX", email: "u@a.com" }));
});

caso("I8: un admin puede mentir el clinicId de SU PROPIO doc de usuario (sale en la Session)", async () => {
  await permitido("adminA se pone clinicId cl_demo", updateDoc(authed("adminA"), "clinics/clA/users/adminA", { clinicId: "cl_demo" }));
  await actualizarComoAdmin("clinics/clA/users/adminA", { clinicId: "clA" });
});

// ---- 6. La demo (cl_demo) como superficie sin autenticación ----

caso("CERRADO · SIN SESIÓN ya no se planta un usuario en cl_demo", async () => {
  await denegado("anon planta un admin en la demo", setDoc(anon(), "clinics/cl_demo/users/plantado",
    { id: "plantado", authUid: uuidDe("plantado"), role: "admin", active: true, clinicId: "cl_demo", email: "admin@a.com", name: "Impostor" }));
});

caso("CERRADO · SIN SESIÓN ya no se borra ni se defacea el doc raíz de la demo", async () => {
  await denegado("anon pisa clinics/cl_demo", setDoc(anon(), "clinics/cl_demo", { id: "cl_demo", name: "defaceada", plan: "cadena" }));
  await denegado("anon borra clinics/cl_demo", deleteDoc(anon(), "clinics/cl_demo"));
});

caso("DEMO: desde la demo NO se alcanza ninguna clínica real", async () => {
  // Ser 'admin' de cl_demo no vale en ninguna otra clínica: isDemo/isAdmin siempre se evalúan contra el {cid} del path.
  await barrido("forastero (admin de la demo) lee clX/<colección>/seed", "denegado", COLECCIONES_DE_CLINICA, (c) => getDoc(authed("forastero"), `clinics/clX/${c}/seed`));
  await denegado("forastero lee clA", getDoc(authed("forastero"), "clinics/clA"));
  await denegado("forastero lee clA/users/adminA", getDoc(authed("forastero"), "clinics/clA/users/adminA"));
});

// ---- 7. Colecciones raíz de servicio: cerradas al cliente ----

caso("RAÍZ: leads / checkoutTokens / webhookEvents son opacos para cualquier cliente", { diferencia: "Postgres: se siembran los documentos (leer uno que no existe no prueba nada). Ni anon ni authenticated tienen permisos de tabla sobre estas tres." }, async () => {
  for (const p of ["leads/l1", "checkoutTokens/t1", "webhookEvents/e1"]) {
    await sembrarRuta(p, { x: 0 });
    await denegado(`adminA lee ${p}`, getDoc(authed("adminA"), p));
    await denegado(`adminA escribe ${p}`, setDoc(authed("adminA"), p, { x: 1 }));
    await denegado(`anon lee ${p}`, getDoc(anon(), p));
    await denegado(`anon escribe ${p}`, setDoc(anon(), p, { x: 1 }));
  }
});

caso("CERRADO · SIN SESIÓN no se escribe NINGUNA colección de cl_demo", async () => {
  const cols = COLECCIONES_DE_CLINICA.filter((c) => c !== "surveyResponses"); // server-only por diseño
  await barrido("anon escribe cl_demo/<colección>/anon_<colección>", "denegado", cols, (c) => setDoc(anon(), `clinics/cl_demo/${c}/anon_${c}`, { basura: "x".repeat(100) }));
});

caso("CON sesión (la anónima del cliente) la demo sigue escribiéndose entera", async () => {
  // El contrapeso del test de arriba: cerrar el anónimo-sin-sesión no puede romper la demo de ventas.
  const cols = COLECCIONES_DE_CLINICA.filter((c) => c !== "surveyResponses");
  await barrido("visitante escribe cl_demo/<colección>/v_<colección>", "permitido", cols, (c) => setDoc(authed("visitante"), `clinics/cl_demo/${c}/v_${c}`, { id: `v_${c}` }));
});

caso("DEMO: `cl_clinica-demo` es una clínica REAL — isDemo debe ser igualdad exacta, nunca prefijo/contains", async () => {
  // Existe en producción una clínica real con id `cl_clinica-demo`. Si isDemo() pasara a startsWith/contains quedaría world-readable/writable.
  await sembrarRuta("clinics/cl_clinica-demo", { id: "cl_clinica-demo", name: "Clínica Demo (real)" });
  await sembrarRuta("clinics/cl_clinica-demo/patients/pReal", { id: "pReal", firstName: "Real" });
  await sembrarRuta("clinics/cl_demo-suffix/patients/pReal", { id: "pReal", firstName: "Real" });
  await denegado("anon lee cl_clinica-demo", getDoc(anon(), "clinics/cl_clinica-demo"));
  await denegado("anon lee cl_clinica-demo/patients/pReal", getDoc(anon(), "clinics/cl_clinica-demo/patients/pReal"));
  await denegado("anon escribe cl_clinica-demo/patients/pReal", setDoc(anon(), "clinics/cl_clinica-demo/patients/pReal", { firstName: "Hackeado" }));
  await denegado("anon lee cl_demo-suffix", getDoc(anon(), "clinics/cl_demo-suffix/patients/pReal"));
  await denegado("forastero lee cl_clinica-demo", getDoc(authed("forastero"), "clinics/cl_clinica-demo/patients/pReal"));
});
