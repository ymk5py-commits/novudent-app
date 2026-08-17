/**
 * Tests de las Firestore Security Rules (aislamiento multi-clínica).
 *
 * Requiere Java + el emulador de Firestore. Ejecutar:
 *   npm run test:rules
 * (equivale a: firebase emulators:exec --only firestore "node --test test/firestore-rules.test.mjs")
 *
 * Prueba lo que las reglas DEBEN garantizar:
 *   - un miembro de la clínica A NO puede leer/escribir datos de la clínica B
 *   - un no-admin NO puede ascenderse a admin ni tocar la lista de usuarios
 *   - un usuario SÍ puede limpiar su propio mustChangePassword (sin escalar)
 *   - la demo (cl_demo) es abierta; el resto, denegado por defecto
 *   - directory: cada uno lee solo su entrada; un admin solo crea entradas a su clínica
 *   - serviceAccounts es inaccesible desde el cliente
 */
import { readFileSync } from "node:fs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

const PROJECT_ID = "novudent-rules-test";
let testEnv;

/** Contexto autenticado con uid + (opcional) seed de membresía vía admin. */
function authed(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}
function anon() {
  return testEnv.unauthenticatedContext().firestore();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });

  // Sembrar membresías SIN reglas (contexto privilegiado).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Clínica A: adminA + dentistA + asistenteA
    await setDoc(doc(db, "clinics/clA"), { id: "clA", name: "A", plan: "clinica" });
    await setDoc(doc(db, "clinics/clA/users/adminA"), { id: "adminA", role: "admin", active: true, clinicId: "clA", email: "admin@a.com" });
    await setDoc(doc(db, "clinics/clA/users/dentA"), { id: "dentA", role: "dentist", active: true, clinicId: "clA", email: "dent@a.com", mustChangePassword: true, commissionPct: 25 });
    await setDoc(doc(db, "clinics/clA/users/asisA"), { id: "asisA", role: "assistant", active: true, clinicId: "clA", email: "asis@a.com" });
    await setDoc(doc(db, "clinics/clA/patients/p1"), { id: "p1", firstName: "Ana" });
    await setDoc(doc(db, "subscriptions/clA"), { clinicId: "clA", plan: "clinica", status: "active" });

    await setDoc(doc(db, "clinics/clA/payments/pay1"), { id: "pay1", amount: 1000 });
    await setDoc(doc(db, "clinics/clA/expenses/exp1"), { id: "exp1", amount: 500 });
    await setDoc(doc(db, "clinics/clA/settlements/liq1"), { id: "liq1", dentistId: "dentA", total: 3000000 });
    // Clínica B
    await setDoc(doc(db, "clinics/clB"), { id: "clB", name: "B", plan: "solo" });
    await setDoc(doc(db, "clinics/clB/users/adminB"), { id: "adminB", role: "admin", active: true, clinicId: "clB", email: "admin@b.com" });
    await setDoc(doc(db, "clinics/clB/patients/pb"), { id: "pb", firstName: "Beto" });
    // Clínica V: suscripción VENCIDA (impago) — para probar el modo solo-lectura
    await setDoc(doc(db, "clinics/clV"), { id: "clV", name: "V", plan: "clinica" });
    await setDoc(doc(db, "clinics/clV/users/adminV"), { id: "adminV", role: "admin", active: true, clinicId: "clV", email: "admin@v.com" });
    await setDoc(doc(db, "clinics/clV/patients/pv"), { id: "pv", firstName: "Vito" });
    await setDoc(doc(db, "subscriptions/clV"), { clinicId: "clV", plan: "clinica", status: "past_due" });

    // Clínica S: plan SOLO al día — para probar el gating de módulos premium
    await setDoc(doc(db, "clinics/clS"), { id: "clS", name: "S", plan: "solo" });
    await setDoc(doc(db, "clinics/clS/users/adminS"), { id: "adminS", role: "admin", active: true, clinicId: "clS", email: "admin@s.com" });
    await setDoc(doc(db, "subscriptions/clS"), { clinicId: "clS", plan: "solo", status: "active" });

    // Clínica G: SIN doc de suscripción — grandfathering (anterior al cobro)
    await setDoc(doc(db, "clinics/clG"), { id: "clG", name: "G" });
    await setDoc(doc(db, "clinics/clG/users/adminG"), { id: "adminG", role: "admin", active: true, clinicId: "clG", email: "admin@g.com" });

    // Clínica E: activa pero con el PERÍODO VENCIDO (webhook de impago perdido)
    await setDoc(doc(db, "clinics/clE"), { id: "clE", name: "E", plan: "clinica" });
    await setDoc(doc(db, "clinics/clE/users/adminE"), { id: "adminE", role: "admin", active: true, clinicId: "clE", email: "admin@e.com" });
    await setDoc(doc(db, "subscriptions/clE"), { clinicId: "clE", plan: "clinica", status: "active", currentPeriodEndMs: 1000 });

    // Demo
    await setDoc(doc(db, "clinics/cl_demo"), { id: "cl_demo", name: "Demo" });
    // Service account allowlist
    await setDoc(doc(db, "serviceAccounts/svc1"), { note: "worker" });
    // Directory
    await setDoc(doc(db, "directory/adminA"), { clinicId: "clA", email: "admin@a.com" });
  });
});

after(async () => { await testEnv?.cleanup(); });

test("miembro A NO lee pacientes de la clínica B", async () => {
  await assertFails(getDoc(doc(authed("adminA"), "clinics/clB/patients/pb")));
});

test("miembro A SÍ lee pacientes de su propia clínica", async () => {
  await assertSucceeds(getDoc(doc(authed("adminA"), "clinics/clA/patients/p1")));
});

test("miembro A NO escribe en la clínica B", async () => {
  await assertFails(setDoc(doc(authed("adminA"), "clinics/clB/patients/pb"), { hacked: true }));
});

/* Empleado dado de baja (active:false): la credencial de Firebase le sigue
 * sirviendo, pero las reglas ya no lo tratan como miembro. Sin esto leía,
 * editaba y borraba toda la historia clínica desde la consola del navegador. */
test("empleado con active:false NO lee ni escribe pacientes de su ex-clínica", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "clinics/clA/users/bajaA"),
      { id: "bajaA", role: "assistant", active: false, clinicId: "clA", email: "baja@a.com" });
  });
  await assertFails(getDoc(doc(authed("bajaA"), "clinics/clA/patients/p1")));
  await assertFails(setDoc(doc(authed("bajaA"), "clinics/clA/patients/p1"), { firstName: "Editado" }, { merge: true }));
  await assertFails(deleteDoc(doc(authed("bajaA"), "clinics/clA/patients/p1")));
});

test("dentista NO puede ascenderse a admin (escalada de privilegios)", async () => {
  await assertFails(
    setDoc(doc(authed("dentA"), "clinics/clA/users/dentA"), { id: "dentA", role: "admin", active: true, clinicId: "clA", email: "dent@a.com" })
  );
});

test("usuario SÍ puede editar SOLO su nombre/color (self-update lista blanca)", async () => {
  await assertSucceeds(
    setDoc(doc(authed("dentA"), "clinics/clA/users/dentA"), { id: "dentA", role: "dentist", active: true, clinicId: "clA", email: "dent@a.com", mustChangePassword: true, commissionPct: 25, name: "Dr. Nuevo Nombre", color: "#123456" }, { merge: true })
  );
});

test("usuario NO puede limpiar su propio mustChangePassword (solo el servidor)", async () => {
  await assertFails(
    setDoc(doc(authed("dentA"), "clinics/clA/users/dentA"), { mustChangePassword: false }, { merge: true })
  );
});

test("dentista NO puede subir su propio commissionPct (fraude de comisiones)", async () => {
  await assertFails(
    setDoc(doc(authed("dentA"), "clinics/clA/users/dentA"), { commissionPct: 99 }, { merge: true })
  );
});

test("usuario NO puede BORRAR campos por omisión (set sin merge solo name/color)", async () => {
  // set() sin merge omite role/active/clinicId/email/commissionPct → affectedKeys
  // los incluye (los borra) → hasOnly(['name','color']) lo rechaza.
  await assertFails(
    setDoc(doc(authed("dentA"), "clinics/clA/users/dentA"), { name: "Solo Nombre", color: "#000000" })
  );
});

test("admin SÍ gestiona usuarios de su clínica", async () => {
  await assertSucceeds(
    setDoc(doc(authed("adminA"), "clinics/clA/users/nuevo"), { id: "nuevo", role: "assistant", active: true, clinicId: "clA", email: "n@a.com" })
  );
});

test("la demo es abierta para cualquier sesión (incluida anónima)", async () => {
  await assertSucceeds(setDoc(doc(anon(), "clinics/cl_demo/patients/x"), { id: "x" }));
});

test("anónimo NO escribe en una clínica real", async () => {
  await assertFails(setDoc(doc(anon(), "clinics/clA/patients/x"), { id: "x" }));
});

test("directory: cada uno lee SOLO su entrada", async () => {
  await assertSucceeds(getDoc(doc(authed("adminA"), "directory/adminA")));
  await assertFails(getDoc(doc(authed("adminB"), "directory/adminA")));
});

test("directory: un admin NO crea una entrada apuntando a otra clínica", async () => {
  await assertFails(setDoc(doc(authed("adminA"), "directory/dentA"), { clinicId: "clB", email: "x@x.com" }));
});

test("directory: admin SÍ crea entrada de un uid que YA es miembro de su clínica", async () => {
  // dentA es miembro de clA (existe clinics/clA/users/dentA) y aún no tiene directory
  await assertSucceeds(setDoc(doc(authed("adminA"), "directory/dentA"), { clinicId: "clA", email: "dent@a.com" }));
});

test("directory: admin NO puede sembrar el routing de un uid que NO es miembro (anti-envenenamiento)", async () => {
  await assertFails(setDoc(doc(authed("adminA"), "directory/forastero"), { clinicId: "clA", email: "f@x.com" }));
});

test("dinero: un DENTISTA NO escribe payments/expenses (no maneja dinero)", async () => {
  await assertFails(setDoc(doc(authed("dentA"), "clinics/clA/payments/payX"), { id: "payX", amount: 1 }));
  await assertFails(setDoc(doc(authed("dentA"), "clinics/clA/expenses/expX"), { id: "expX", amount: 1 }));
});

test("dinero: el STAFF (admin/asistente) SÍ escribe payments/expenses", async () => {
  await assertSucceeds(setDoc(doc(authed("asisA"), "clinics/clA/payments/payY"), { id: "payY", amount: 1 }));
  await assertSucceeds(setDoc(doc(authed("adminA"), "clinics/clA/expenses/expY"), { id: "expY", amount: 1 }));
});

test("dinero: el dentista SÍ puede LEER payments/expenses (solo no escribir)", async () => {
  await assertSucceeds(getDoc(doc(authed("dentA"), "clinics/clA/payments/pay1")));
});

test("serviceAccounts es inaccesible desde el cliente", async () => {
  await assertFails(getDoc(doc(authed("adminA"), "serviceAccounts/svc1")));
  await assertFails(setDoc(doc(authed("adminA"), "serviceAccounts/hack"), { x: 1 }));
});

test("colección no enumerada queda denegada por defecto", async () => {
  await assertFails(getDoc(doc(authed("adminA"), "clinics/clA/secretos/x")));
});

test("recoveryMonitors: un miembro lee/escribe los de su clínica; otra clínica NO", async () => {
  await assertSucceeds(setDoc(doc(authed("dentA"), "clinics/clA/recoveryMonitors/m1"), { id: "m1", patientId: "p1" }));
  await assertFails(getDoc(doc(authed("adminA"), "clinics/clB/recoveryMonitors/x")));
});

// ---- EMR: campos clínicos del paciente solo los escribe rol clínico (RBAC) ----

test("EMR: un ASISTENTE NO puede modificar el odontograma del paciente", async () => {
  await assertFails(updateDoc(doc(authed("asisA"), "clinics/clA/patients/p1"), { odontogram: { "11": { state: "caries" } } }));
});

test("EMR: un ASISTENTE NO puede escribir evoluciones/recetas/perio del paciente", async () => {
  await assertFails(updateDoc(doc(authed("asisA"), "clinics/clA/patients/p1"), { emr: [{ note: "x" }] }));
  await assertFails(updateDoc(doc(authed("asisA"), "clinics/clA/patients/p1"), { perio: [{ at: "2026-06-22" }] }));
});

test("EMR: el ASISTENTE SÍ puede editar demografía del paciente (no clínico)", async () => {
  await assertSucceeds(updateDoc(doc(authed("asisA"), "clinics/clA/patients/p1"), { phone: "0991", city: "Asunción" }));
});

test("EMR: un DENTISTA SÍ puede escribir el odontograma/EMR del paciente", async () => {
  await assertSucceeds(updateDoc(doc(authed("dentA"), "clinics/clA/patients/p1"), { odontogram: { "11": { state: "caries" } } }));
});

test("EMR: un ADMIN SÍ puede escribir el EMR del paciente", async () => {
  await assertSucceeds(updateDoc(doc(authed("adminA"), "clinics/clA/patients/p1"), { emr: [{ note: "control" }] }));
});

// ---- Monetización: el plan lo fija la suscripción, no el cliente ----

test("MONETIZACIÓN: un admin NO puede auto-ascenderse de plan (clinics/{cid}.plan)", async () => {
  // El agujero de ingresos: sin esta regla, dos líneas en la consola del
  // navegador desbloquean todos los módulos premium sin pagar.
  await assertFails(updateDoc(doc(authed("adminA"), "clinics/clA"), { plan: "cadena" }));
});

test("MONETIZACIÓN: el admin SÍ puede editar el resto de la config de su clínica", async () => {
  await assertSucceeds(updateDoc(doc(authed("adminA"), "clinics/clA"), { name: "Clínica A renombrada" }));
});

test("MONETIZACIÓN: un admin NO puede borrar su clínica", async () => {
  await assertFails(deleteDoc(doc(authed("adminA"), "clinics/clA")));
});

test("SUSCRIPCIÓN: un miembro LEE la suscripción de su clínica (gating/banner)", async () => {
  await assertSucceeds(getDoc(doc(authed("dentA"), "subscriptions/clA")));
});

test("SUSCRIPCIÓN: ni el admin puede escribirla (solo el webhook/servicio)", async () => {
  await assertFails(setDoc(doc(authed("adminA"), "subscriptions/clA"), { clinicId: "clA", plan: "cadena", status: "active" }));
});

test("SUSCRIPCIÓN: no se lee la suscripción de OTRA clínica", async () => {
  await assertFails(getDoc(doc(authed("adminA"), "subscriptions/clB")));
});

// ---- Enforcement de cobro en las REGLAS (no solo en la UI) ----

test("COBRO: suscripción vencida (past_due) → NO puede escribir", async () => {
  await assertFails(setDoc(doc(authed("adminV"), "clinics/clV/patients/nuevo"), { id: "nuevo" }));
  await assertFails(setDoc(doc(authed("adminV"), "clinics/clV/appointments/a1"), { id: "a1" }));
});

test("COBRO: suscripción vencida SÍ puede LEER y exportar (historia clínica)", async () => {
  // Al vencer no se bloquea el acceso: son datos médicos, la clínica debe poder
  // consultarlos y exportarlos (LGPD / Ley 1581).
  await assertSucceeds(getDoc(doc(authed("adminV"), "clinics/clV/patients/pv")));
});

test("COBRO: período vencido corta la escritura aunque el status diga 'active'", async () => {
  // Defensa en profundidad por si se pierde el webhook de impago.
  await assertFails(setDoc(doc(authed("adminE"), "clinics/clE/patients/x"), { id: "x" }));
});

test("COBRO: clínica SIN doc de suscripción sigue escribiendo (grandfathering)", async () => {
  // Si esto fallara, el deploy dejaría a las clínicas existentes en solo-lectura.
  await assertSucceeds(setDoc(doc(authed("adminG"), "clinics/clG/patients/x"), { id: "x" }));
});

test("COBRO: clínica al día escribe normal", async () => {
  await assertSucceeds(setDoc(doc(authed("adminA"), "clinics/clA/appointments/aOk"), { id: "aOk" }));
});

test("PLAN: el plan Solo NO escribe módulos premium (radiografías, firma, labs)", async () => {
  // El gating vivía solo en la UI: por SDK directo un plan Solo los escribía igual.
  await assertFails(setDoc(doc(authed("adminS"), "clinics/clS/radiographs/r1"), { id: "r1" }));
  await assertFails(setDoc(doc(authed("adminS"), "clinics/clS/signatures/s1"), { id: "s1" }));
  await assertFails(setDoc(doc(authed("adminS"), "clinics/clS/labOrders/l1"), { id: "l1" }));
});

test("PLAN: el plan Clínica SÍ escribe los premium de su plan", async () => {
  await assertSucceeds(setDoc(doc(authed("adminA"), "clinics/clA/radiographs/r1"), { id: "r1" }));
  await assertSucceeds(setDoc(doc(authed("adminA"), "clinics/clA/labOrders/l1"), { id: "l1" }));
});

test("PLAN: el CRM es solo de Cadena — ni Clínica ni Solo lo escriben", async () => {
  await assertFails(setDoc(doc(authed("adminA"), "clinics/clA/crmCards/c1"), { id: "c1" }));
  await assertFails(setDoc(doc(authed("adminS"), "clinics/clS/campaigns/c1"), { id: "c1" }));
});

test("PLAN: el plan Solo SÍ escribe lo básico (agenda, pacientes)", async () => {
  await assertSucceeds(setDoc(doc(authed("adminS"), "clinics/clS/appointments/a1"), { id: "a1" }));
  await assertSucceeds(setDoc(doc(authed("adminS"), "clinics/clS/patients/p1"), { id: "p1" }));
});

test("COBRO: la demo nunca se bloquea por suscripción", async () => {
  await assertSucceeds(setDoc(doc(anon(), "clinics/cl_demo/radiographs/r1"), { id: "r1" }));
});

// ---- Números del negocio: solo el dueño (no alcanza el gating de la UI) ----

test("NEGOCIO: la recepción NO puede LEER los gastos de la clínica", async () => {
  // La UI ya se los oculta, pero el cliente lee Firestore directo: sin esta
  // regla, un asistente saca los costos del negocio por SDK en dos líneas.
  await assertFails(getDoc(doc(authed("asisA"), "clinics/clA/expenses/exp1")));
});

test("NEGOCIO: el dentista tampoco lee los gastos", async () => {
  await assertFails(getDoc(doc(authed("dentA"), "clinics/clA/expenses/exp1")));
});

test("NEGOCIO: el admin SÍ lee y escribe los gastos", async () => {
  await assertSucceeds(getDoc(doc(authed("adminA"), "clinics/clA/expenses/exp1")));
  await assertSucceeds(setDoc(doc(authed("adminA"), "clinics/clA/expenses/expNuevo"), { id: "expNuevo", amount: 1 }));
});

test("NEGOCIO: la recepción ya NO escribe gastos (antes podía, era isStaff)", async () => {
  await assertFails(setDoc(doc(authed("asisA"), "clinics/clA/expenses/expX"), { id: "expX", amount: 1 }));
});

test("SALARIOS: nadie salvo el admin lee las liquidaciones", async () => {
  // Cuánto gana cada profesional es dato salarial.
  await assertFails(getDoc(doc(authed("asisA"), "clinics/clA/settlements/liq1")));
  await assertFails(getDoc(doc(authed("dentA"), "clinics/clA/settlements/liq1")));
  await assertSucceeds(getDoc(doc(authed("adminA"), "clinics/clA/settlements/liq1")));
});

test("OPERACIÓN INTACTA: la recepción sigue cobrando (caja) y viendo pagos", async () => {
  // El corte es "números del negocio", NO la operación de mostrador: si esto
  // fallara, recepción no podría cobrarle a un paciente.
  await assertSucceeds(getDoc(doc(authed("asisA"), "clinics/clA/payments/pay1")));
  await assertSucceeds(setDoc(doc(authed("asisA"), "clinics/clA/payments/payNuevo"), { id: "payNuevo", amount: 50000 }));
});
