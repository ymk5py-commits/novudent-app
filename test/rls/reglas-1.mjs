/**
 * Casos 1–50 de test/firestore-rules.test.mjs, en el mismo orden y con los mismos nombres. Ver compat.mjs para el puente.
 * Lo que se cambió respecto del original está marcado con «Postgres:» en el comentario del caso.
 */
import {
  anon, authed, BORRAR, caso, deleteDoc, denegado, directorio, getDoc, permitido, sembrarRuta, setDoc, updateDoc, uuidDe,
} from "./compat.mjs";

caso("miembro A NO lee pacientes de la clínica B", async () => {
  await denegado("adminA lee clB/patients/pb", getDoc(authed("adminA"), "clinics/clB/patients/pb"));
});

caso("miembro A SÍ lee pacientes de su propia clínica", async () => {
  await permitido("adminA lee clA/patients/p1", getDoc(authed("adminA"), "clinics/clA/patients/p1"));
});

caso("miembro A NO escribe en la clínica B", async () => {
  await denegado("adminA escribe clB/patients/pb", setDoc(authed("adminA"), "clinics/clB/patients/pb", { hacked: true }));
});

/* Empleado dado de baja (active:false): la credencial le sigue sirviendo, pero ya no es miembro. */
caso("empleado con active:false NO lee ni escribe pacientes de su ex-clínica", async () => {
  await sembrarRuta("clinics/clA/users/bajaA", { id: "bajaA", role: "assistant", active: false, clinicId: "clA", email: "baja@a.com" });
  await denegado("bajaA lee", getDoc(authed("bajaA"), "clinics/clA/patients/p1"));
  await denegado("bajaA escribe (merge)", setDoc(authed("bajaA"), "clinics/clA/patients/p1", { firstName: "Editado" }, { merge: true }));
  await denegado("bajaA borra", deleteDoc(authed("bajaA"), "clinics/clA/patients/p1"));
});

caso("dentista NO puede ascenderse a admin (escalada de privilegios)", async () => {
  await denegado("dentA se pone role admin", setDoc(authed("dentA"), "clinics/clA/users/dentA", { id: "dentA", role: "admin", active: true, clinicId: "clA", email: "dent@a.com" }));
});

caso("usuario SÍ puede editar SOLO su nombre/color (self-update lista blanca)", async () => {
  await permitido("dentA cambia name y color",
    setDoc(authed("dentA"), "clinics/clA/users/dentA", { id: "dentA", role: "dentist", active: true, clinicId: "clA", email: "dent@a.com", mustChangePassword: true, commissionPct: 25, name: "Dr. Nuevo Nombre", color: "#123456" }, { merge: true }));
});

caso("usuario NO puede limpiar su propio mustChangePassword (solo el servidor)", async () => {
  await denegado("dentA limpia mustChangePassword", setDoc(authed("dentA"), "clinics/clA/users/dentA", { mustChangePassword: false }, { merge: true }));
});

caso("dentista NO puede subir su propio commissionPct (fraude de comisiones)", async () => {
  await denegado("dentA sube commissionPct", setDoc(authed("dentA"), "clinics/clA/users/dentA", { commissionPct: 99 }, { merge: true }));
});

caso("usuario NO puede BORRAR campos por omisión (set sin merge solo name/color)", async () => {
  // set() sin merge omite role/active/clinicId/email/commissionPct → cambian (se borran) → fuera de la lista blanca.
  await denegado("dentA reemplaza su documento con solo name y color", setDoc(authed("dentA"), "clinics/clA/users/dentA", { name: "Solo Nombre", color: "#000000" }));
});

caso("admin SÍ gestiona usuarios de su clínica", async () => {
  await permitido("adminA crea un usuario", setDoc(authed("adminA"), "clinics/clA/users/nuevo", { id: "nuevo", role: "assistant", active: true, clinicId: "clA", email: "n@a.com" }));
});

caso("la demo: se LEE sin sesión, se ESCRIBE solo con sesión", { diferencia: "Postgres: se siembra el documento a leer (leer uno que no existe devuelve vacío con cualquier regla, así que no probaría nada). `anon` es la clave pública sin sesión; la sesión anónima de la demo es el rol authenticated." }, async () => {
  await sembrarRuta("clinics/cl_demo/patients/xLeer", { id: "xLeer" });
  await permitido("anon mira la demo", getDoc(anon(), "clinics/cl_demo/patients/xLeer"));
  await denegado("anon escribe en la demo", setDoc(anon(), "clinics/cl_demo/patients/x", { id: "x" }));
  await permitido("una sesión (visitante) escribe en la demo", setDoc(authed("visitante"), "clinics/cl_demo/patients/x", { id: "x" }));
});

caso("anónimo NO escribe en una clínica real", async () => {
  await denegado("anon escribe en clA", setDoc(anon(), "clinics/clA/patients/x", { id: "x" }));
});

/* ── directory: ya no existe. El ruteo uid → clínica sale de users.data->>'authUid' (public.mi_directorio()). ── */

caso("directory: cada uno lee SOLO su entrada", { noAplica: "directory no existe: lo reemplaza public.mi_directorio(), que solo devuelve la clínica de la propia sesión; los usuarios de otra clínica no se ven." }, async () => {
  await permitido("adminA tiene su clínica (mi_directorio)", directorio(authed("adminA")));
  await denegado("adminB lee el usuario de adminA (de donde sale el ruteo)", getDoc(authed("adminB"), "clinics/clA/users/adminA"));
  const dirB = await directorio(authed("adminB"));
  if (dirB.filas[0]?.clinic_id !== "clB") throw new Error(`adminB debería rutear a clB y rutea a ${dirB.filas[0]?.clinic_id}`);
});

caso("directory: un admin NO crea una entrada apuntando a otra clínica", { noAplica: "directory no existe. Lo que impedía —que un admin enrute a alguien hacia OTRA clínica— ahora es: un admin no crea usuarios en una clínica que no es la suya, ni agrega a su clínica a una persona que ya es de otra (índice único de authUid)." }, async () => {
  await denegado("adminA crea el usuario dentA en la clínica clB", setDoc(authed("adminA"), "clinics/clB/users/dentA", { id: "dentA", role: "assistant", active: true, clinicId: "clB", email: "x@x.com", authUid: uuidDe("dentA") }));
  await denegado("adminA agrega a su clínica a adminX (que ya es de clX)", setDoc(authed("adminA"), "clinics/clA/users/copiaDeX", { id: "copiaDeX", role: "admin", active: true, clinicId: "clA", email: "x@x.com", authUid: uuidDe("adminX") }));
});

caso("directory: admin SÍ crea entrada de un uid que YA es miembro de su clínica", { noAplica: "directory no existe: dentA ya es miembro de clA, y su ruteo sale solo del documento de usuario (no hay entrada que crear)." }, async () => {
  const r = await directorio(authed("dentA"));
  await permitido("dentA rutea a clA sin escribir nada", { ...r, ok: r.ok && r.filas[0].clinic_id === "clA" });
});

caso("directory: admin NO puede sembrar el routing de un uid que NO es miembro (anti-envenenamiento)", { noAplica: "directory no existe. Un uid sin usuario en ninguna clínica no tiene ruteo (mi_directorio vacío) y no puede crearse uno solo (ver «FORASTERO … AUTO-INSCRIBIRSE»); que un admin dé de alta a una persona en SU clínica es lo mismo que antes (ver «residual»)." }, async () => {
  await denegado("forastero no tiene clínica", directorio(authed("forastero")));
  await denegado("forastero se da de alta solo en clA", setDoc(authed("forastero"), "clinics/clA/users/forastero", { id: "forastero", role: "admin", active: true, clinicId: "clA", email: "f@x.com" }));
});

caso("dinero: un DENTISTA NO escribe payments/expenses (no maneja dinero)", async () => {
  await denegado("dentA escribe payments", setDoc(authed("dentA"), "clinics/clA/payments/payX", { id: "payX", amount: 1 }));
  await denegado("dentA escribe expenses", setDoc(authed("dentA"), "clinics/clA/expenses/expX", { id: "expX", amount: 1 }));
});

caso("dinero: la CAJA (admin / Recepción y caja) SÍ escribe payments; gastos solo el admin", async () => {
  await permitido("cajaA escribe payments", setDoc(authed("cajaA"), "clinics/clA/payments/payY", { id: "payY", amount: 1 }));
  await permitido("adminA escribe expenses", setDoc(authed("adminA"), "clinics/clA/expenses/expY", { id: "expY", amount: 1 }));
});

caso("roles v3: ni la RECEPCIONISTA ni el ASISTENTE DE DOCTORES escriben dinero", async () => {
  for (const quien of ["recepA", "asisA"]) {
    await denegado(`${quien} payments`, setDoc(authed(quien), "clinics/clA/payments/payNo", { id: "payNo", amount: 1 }));
    await denegado(`${quien} cashSessions`, setDoc(authed(quien), "clinics/clA/cashSessions/csNo", { id: "csNo", openedAt: "x" }));
    await denegado(`${quien} fiscalDocs`, setDoc(authed(quien), "clinics/clA/fiscalDocs/fdNo", { id: "fdNo", total: 1 }));
    await denegado(`${quien} expenses`, setDoc(authed(quien), "clinics/clA/expenses/expNo", { id: "expNo", amount: 1 }));
  }
});

caso("roles v3: los consentimientos los firma la recepción, no el asistente de doctores", async () => {
  await permitido("recepA firma", setDoc(authed("recepA"), "clinics/clA/signatures/sigRecep", { id: "sigRecep", patientId: "pEmr" }));
  await permitido("cajaA firma", setDoc(authed("cajaA"), "clinics/clA/signatures/sigCaja", { id: "sigCaja", patientId: "pEmr" }));
  await denegado("asisA firma", setDoc(authed("asisA"), "clinics/clA/signatures/sigAsis", { id: "sigAsis", patientId: "pEmr" }));
});

caso("dinero: el dentista SÍ puede LEER payments/expenses (solo no escribir)", async () => {
  await permitido("dentA lee payments", getDoc(authed("dentA"), "clinics/clA/payments/pay1"));
});

caso("serviceAccounts es inaccesible desde el cliente", { noAplica: "serviceAccounts no existe: la «cuenta de servicio» es la clave service_role de Supabase, que el navegador no tiene. Escribir una «cuenta de servicio» ahora es escribir en una tabla que no existe." }, async () => {
  await denegado("adminA lee serviceAccounts/svc1", getDoc(authed("adminA"), "serviceAccounts/svc1"));
  await denegado("adminA escribe serviceAccounts/hack", setDoc(authed("adminA"), "serviceAccounts/hack", { x: 1 }));
});

caso("colección no enumerada queda denegada por defecto", async () => {
  await denegado("adminA lee una colección que no existe", getDoc(authed("adminA"), "clinics/clA/secretos/x"));
});

caso("recoveryMonitors: un miembro lee/escribe los de su clínica; otra clínica NO", { diferencia: "Postgres: se siembra el documento de la otra clínica (leer uno que no existe no prueba nada)." }, async () => {
  await permitido("dentA escribe recoveryMonitors", setDoc(authed("dentA"), "clinics/clA/recoveryMonitors/m1", { id: "m1", patientId: "p1" }));
  await sembrarRuta("clinics/clB/recoveryMonitors/x", { id: "x" });
  await denegado("adminA lee recoveryMonitors de clB", getDoc(authed("adminA"), "clinics/clB/recoveryMonitors/x"));
});

// ---- EMR: campos clínicos del paciente solo los escribe rol clínico (RBAC) ----

caso("EMR: un ASISTENTE NO puede modificar el odontograma del paciente", async () => {
  await denegado("asisA cambia odontogram", updateDoc(authed("asisA"), "clinics/clA/patients/p1", { odontogram: { "11": { state: "caries" } } }));
});

caso("EMR: un ASISTENTE NO puede escribir evoluciones/recetas/perio del paciente", async () => {
  await denegado("asisA cambia emr", updateDoc(authed("asisA"), "clinics/clA/patients/p1", { emr: [{ note: "x" }] }));
  await denegado("asisA cambia perio", updateDoc(authed("asisA"), "clinics/clA/patients/p1", { perio: [{ at: "2026-06-22" }] }));
});

caso("EMR: el ASISTENTE SÍ puede editar demografía del paciente (no clínico)", async () => {
  await permitido("recepA cambia phone y city", updateDoc(authed("recepA"), "clinics/clA/patients/p1", { phone: "0991", city: "Asunción" }));
});

caso("EMR: un DENTISTA SÍ puede escribir el odontograma/EMR del paciente", async () => {
  await permitido("dentA cambia odontogram", updateDoc(authed("dentA"), "clinics/clA/patients/p1", { odontogram: { "11": { state: "caries" } } }));
});

caso("EMR: un ADMIN SÍ puede escribir el EMR del paciente", async () => {
  await permitido("adminA cambia emr", updateDoc(authed("adminA"), "clinics/clA/patients/p1", { emr: [{ note: "control" }] }));
});

// ---- Seguimiento: quitar a un paciente de «Sin próxima cita» (`Patient.seguimiento`) ----
const QUITA = { cerradoAt: "2026-10-08T14:00:00.000Z", motivo: "No quiere continuar", por: "Laura Recepción" };

caso("SEGUIMIENTO: recepción y dentista pueden quitar a un paciente de la lista y volver a incluirlo (no es un campo clínico)", async () => {
  await permitido("recepA quita", updateDoc(authed("recepA"), "clinics/clA/patients/p1", { seguimiento: QUITA }));
  await permitido("dentA vuelve a incluir (deleteField)", updateDoc(authed("dentA"), "clinics/clA/patients/p1", { seguimiento: BORRAR }));
  await permitido("dentA quita", updateDoc(authed("dentA"), "clinics/clA/patients/p1", { seguimiento: QUITA }));
  await permitido("recepA vuelve a incluir (deleteField)", updateDoc(authed("recepA"), "clinics/clA/patients/p1", { seguimiento: BORRAR }));
});

caso("SEGUIMIENTO: la ficha entera con la quita (setDoc sin merge) pasa si lo clínico queda igual, y la recepción no puede colar lo clínico de paso", async () => {
  const ficha = (await getDoc(authed("adminA"), "clinics/clA/patients/pEmr")).data;
  await permitido("recepA guarda la ficha entera con la quita", setDoc(authed("recepA"), "clinics/clA/patients/pEmr", { ...ficha, seguimiento: QUITA }));
  await denegado("recepA cuela una evolución forjada", setDoc(authed("recepA"), "clinics/clA/patients/pEmr", { ...ficha, emr: [{ id: "e1", note: "Evolución forjada" }], seguimiento: QUITA }));
  // Volver a incluir = la ficha sin el campo.
  await permitido("recepA vuelve a incluir (la ficha sin el campo)", setDoc(authed("recepA"), "clinics/clA/patients/pEmr", ficha));
  const despues = (await getDoc(authed("adminA"), "clinics/clA/patients/pEmr")).data;
  if (despues.seguimiento !== undefined) throw new Error("seguimiento debería haberse quitado");
});

caso("SEGUIMIENTO: otra clínica no puede tocar la quita de un paciente ajeno", async () => {
  await denegado("adminB toca la quita de un paciente de clA", updateDoc(authed("adminB"), "clinics/clA/patients/p1", { seguimiento: QUITA }));
});

// ---- Monetización: el plan lo fija la suscripción, no el cliente ----

caso("MONETIZACIÓN: un admin NO puede auto-ascenderse de plan (clinics/{cid}.plan)", async () => {
  await denegado("adminA pone plan cadena", updateDoc(authed("adminA"), "clinics/clA", { plan: "cadena" }));
});

caso("MONETIZACIÓN: el admin SÍ puede editar el resto de la config de su clínica", async () => {
  await permitido("adminA renombra su clínica", updateDoc(authed("adminA"), "clinics/clA", { name: "Clínica A renombrada" }));
});

caso("MONETIZACIÓN: un admin NO puede borrar su clínica", async () => {
  await denegado("adminA borra clA", deleteDoc(authed("adminA"), "clinics/clA"));
});

caso("SUSCRIPCIÓN: un miembro LEE la suscripción de su clínica (gating/banner)", async () => {
  await permitido("dentA lee subscriptions/clA", getDoc(authed("dentA"), "subscriptions/clA"));
});

caso("SUSCRIPCIÓN: ni el admin puede escribirla (solo el webhook/servicio)", async () => {
  await denegado("adminA escribe subscriptions/clA", setDoc(authed("adminA"), "subscriptions/clA", { clinicId: "clA", plan: "cadena", status: "active" }));
});

caso("SUSCRIPCIÓN: no se lee la suscripción de OTRA clínica", { diferencia: "Postgres: se siembra subscriptions/clB (leer una que no existe no prueba nada)." }, async () => {
  await sembrarRuta("subscriptions/clB", { clinicId: "clB", plan: "solo", status: "active" });
  await denegado("adminA lee subscriptions/clB", getDoc(authed("adminA"), "subscriptions/clB"));
});

// ---- Enforcement de cobro en las REGLAS (no solo en la UI) ----

caso("COBRO: suscripción vencida (past_due) → NO puede escribir", async () => {
  await denegado("adminV crea un paciente", setDoc(authed("adminV"), "clinics/clV/patients/nuevo", { id: "nuevo" }));
  await denegado("adminV crea una cita", setDoc(authed("adminV"), "clinics/clV/appointments/a1", { id: "a1" }));
});

caso("COBRO: suscripción vencida SÍ puede LEER y exportar (historia clínica)", async () => {
  await permitido("adminV lee un paciente", getDoc(authed("adminV"), "clinics/clV/patients/pv"));
});

caso("COBRO: período vencido corta la escritura aunque el status diga 'active'", async () => {
  await denegado("adminE escribe", setDoc(authed("adminE"), "clinics/clE/patients/x", { id: "x" }));
});

caso("COBRO: clínica SIN doc de suscripción sigue escribiendo (grandfathering)", async () => {
  await permitido("adminG escribe", setDoc(authed("adminG"), "clinics/clG/patients/x", { id: "x" }));
});

caso("COBRO: clínica al día escribe normal", async () => {
  await permitido("adminA crea una cita", setDoc(authed("adminA"), "clinics/clA/appointments/aOk", { id: "aOk" }));
});

caso("PLAN: el plan Solo NO escribe módulos premium (radiografías, firma, labs)", async () => {
  await denegado("adminS radiographs", setDoc(authed("adminS"), "clinics/clS/radiographs/r1", { id: "r1" }));
  await denegado("adminS signatures", setDoc(authed("adminS"), "clinics/clS/signatures/s1", { id: "s1" }));
  await denegado("adminS labOrders", setDoc(authed("adminS"), "clinics/clS/labOrders/l1", { id: "l1" }));
});

caso("PLAN: el plan Clínica SÍ escribe los premium de su plan", async () => {
  await permitido("adminA radiographs", setDoc(authed("adminA"), "clinics/clA/radiographs/r1", { id: "r1" }));
  await permitido("adminA labOrders", setDoc(authed("adminA"), "clinics/clA/labOrders/l1", { id: "l1" }));
});

caso("PLAN: el CRM es solo de Cadena — ni Clínica ni Solo lo escriben", async () => {
  await denegado("adminA crmCards (plan clínica)", setDoc(authed("adminA"), "clinics/clA/crmCards/c1", { id: "c1" }));
  await denegado("adminS campaigns (plan solo)", setDoc(authed("adminS"), "clinics/clS/campaigns/c1", { id: "c1" }));
});

caso("PLAN: el plan Solo SÍ escribe lo básico (agenda, pacientes)", async () => {
  await permitido("adminS appointments", setDoc(authed("adminS"), "clinics/clS/appointments/a1", { id: "a1" }));
  await permitido("adminS patients", setDoc(authed("adminS"), "clinics/clS/patients/p1", { id: "p1" }));
});

caso("COBRO: la demo nunca se bloquea por suscripción ni por plan", async () => {
  await permitido("visitante radiographs en la demo", setDoc(authed("visitante"), "clinics/cl_demo/radiographs/r1", { id: "r1" }));
  await permitido("visitante outbox en la demo", setDoc(authed("visitante"), "clinics/cl_demo/outbox/o1", { id: "o1" }));
});

// ---- Números del negocio: solo el dueño (no alcanza el gating de la UI) ----

caso("NEGOCIO: la recepción NO puede LEER los gastos de la clínica", async () => {
  await denegado("asisA lee expenses", getDoc(authed("asisA"), "clinics/clA/expenses/exp1"));
});
