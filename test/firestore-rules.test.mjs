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
import { doc, getDoc, getDocs, collection, collectionGroup, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

const PROJECT_ID = "novudent-rules-test";
let testEnv;

/** Las 31 colecciones por clínica que escribe el store (lib/store.tsx:162-164)
 *  + `slotLocks`, que escribe la ruta de reservas online. Se usan para barrer
 *  el aislamiento colección por colección: alcanza con que UNA se escape para
 *  que se filtre historia clínica entre clínicas. */
const COLECCIONES_DE_CLINICA = [
  "users", "patients", "appointments", "billing", "procedures", "budgets",
  "payments", "expenses", "stock", "stockMoves", "waitlist", "outbox",
  "slotLocks", "recoveryMonitors", "radiographs", "signatures", "crmCards",
  "campaigns", "labOrders", "settlements", "boxes", "patientNotes",
  "fiscalDocs", "cashSessions", "sterilizationCycles", "teamMessages",
  "surveys", "surveyResponses", "mgmtTasks", "environmentalLogs", "eduVideos",
  "branches",
];

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
    await setDoc(doc(db, "clinics/clA/users/dentA"), { id: "dentA", role: "dentist", active: true, clinicId: "clA", email: "dent@a.com", mustChangePassword: true, commissionPct: 25, salaryBase: 2000000 });
    await setDoc(doc(db, "clinics/clA/users/asisA"), { id: "asisA", role: "assistant", active: true, clinicId: "clA", email: "asis@a.com" });
    await setDoc(doc(db, "clinics/clA/patients/p1"), { id: "p1", firstName: "Ana" });
    await setDoc(doc(db, "subscriptions/clA"), { clinicId: "clA", plan: "clinica", status: "active" });

    // Fixtures de la auditoría de escalada intra-clínica (ver bloque AGUJERO al final).
    await setDoc(doc(db, "clinics/clA/patients/pEmr"), { id: "pEmr", firstName: "Elena", lastName: "Ramos", phone: "0981", odontogram: { teeth: { 11: "sano" } }, emr: [{ id: "e1", note: "Evolución original del dentista" }] });
    await setDoc(doc(db, "clinics/clA/patients/pBorrable"), { id: "pBorrable", firstName: "Duplicado", lastName: "A fusionar" });
    await setDoc(doc(db, "clinics/clA/radiographs/rx1"), { id: "rx1", patientId: "pEmr", image: "data:image/jpeg;base64,AAA", findings: ["caries 26"] });
    await setDoc(doc(db, "clinics/clA/signatures/sig1"), { id: "sig1", patientId: "pEmr", status: "firmado", signature: "data:image/png;base64,AAA" });
    await setDoc(doc(db, "clinics/clA/billing/bil1"), { id: "bil1", patientId: "pEmr", status: "hold", amount: 500000 });
    await setDoc(doc(db, "clinics/clA/procedures/D0120"), { cpt: "D0120", description: "Consulta", price: 150000 });
    await setDoc(doc(db, "clinics/clA/cashSessions/cs1"), { id: "cs1", userId: "asisA", userName: "Recepción", status: "abierta", openingBalance: 200000 });
    await setDoc(doc(db, "clinics/clA/fiscalDocs/fd1"), { id: "fd1", kind: "boleta", number: "001-001-0000001", amount: 500000 });

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

    /* Clínica X: la VÍCTIMA del barrido de aislamiento. Plan cadena + suscripción
     * al día para que ningún deny pueda atribuirse al cobro o al gating de plan:
     * si adminA no puede tocarla, es por aislamiento y por nada más. Sembrada con
     * un documento en CADA colección. */
    await setDoc(doc(db, "clinics/clX"), { id: "clX", name: "X", plan: "cadena", config: { botika: { token: "SECRETO" } } });
    await setDoc(doc(db, "subscriptions/clX"), { clinicId: "clX", plan: "cadena", status: "active" });
    await setDoc(doc(db, "clinics/clX/users/adminX"), { id: "adminX", role: "admin", active: true, clinicId: "clX", email: "admin@x.com" });
    for (const c of COLECCIONES_DE_CLINICA) {
      await setDoc(doc(db, `clinics/clX/${c}/seed`), { id: "seed", clinicId: "clX", secreto: "PII de la clínica X" });
    }
    await setDoc(doc(db, "directory/adminX"), { clinicId: "clX", email: "admin@x.com" });

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

test("la demo: se LEE sin sesión, se ESCRIBE solo con sesión", async () => {
  /* Ojo con la semántica del harness: `anon()` es unauthenticatedContext(), o
     sea SIN NINGUNA sesión. Una sesión anónima de Firebase Auth sí trae uid y
     hace verdadero a isSignedIn() — para las reglas se ve como `visitante`. */
  await assertSucceeds(getDoc(doc(anon(), "clinics/cl_demo/patients/x")));       // mirar: sí
  await assertFails(setDoc(doc(anon(), "clinics/cl_demo/patients/x"), { id: "x" })); // escribir sin sesión: no
  await assertSucceeds(setDoc(doc(authed("visitante"), "clinics/cl_demo/patients/x"), { id: "x" }));
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

test("COBRO: la demo nunca se bloquea por suscripción ni por plan", async () => {
  // Con sesión (la anónima que abre el cliente al entrar), la demo escribe todo
  // — incluidas las colecciones premium — sin doc de suscripción.
  await assertSucceeds(setDoc(doc(authed("visitante"), "clinics/cl_demo/radiographs/r1"), { id: "r1" }));
  await assertSucceeds(setDoc(doc(authed("visitante"), "clinics/cl_demo/outbox/o1"), { id: "o1" }));
});

// ---- Números del negocio: solo el dueño (no alcanza el gating de la UI) ----

test("NEGOCIO: la recepción NO puede LEER los gastos de la clínica", async () => {
  // La UI ya se los oculta, pero el cliente lee Firestore directo: sin esta
  // regla, un asistente saca los costos del negocio por SDK en dos líneas.
  await assertFails(getDoc(doc(authed("asisA"), "clinics/clA/expenses/exp1")));
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA DE COBRO (ago-2026) — PoC de hallazgos abiertos.
//
// ⚠️  Los tests marcados VULN fijan el comportamiento ACTUAL, no el deseado:
//     pasan porque describen el agujero. Al arreglarlo hay que invertir la
//     aserción (assertSucceeds → assertFails).
// ═══════════════════════════════════════════════════════════════════════════

test("SUSCRIPCIÓN: un admin NO puede BORRAR su suscripción (volvería al grandfathering)", async () => {
  // Sin esta garantía, `delete subscriptions/{cid}` deja a la clínica sin doc,
  // y tanto isSubscriptionActive() como subActive() dan true SIN vencimiento:
  // gratis para siempre con dos líneas en la consola del navegador.
  await assertFails(deleteDoc(doc(authed("adminA"), "subscriptions/clA")));
});

test("CERRADO · el plan Solo ya no escribe `outbox` (WhatsApp lo paga el dueño del SaaS)", async () => {
  /* `integraciones` es feature de Clínica+ y la UI la bloquea, pero la regla
     usaba canWrite() (solo suscripción). Cada doc de outbox lo materializa y
     ENVÍA el cron de Botika: mensajes pagados por el dueño del SaaS para un
     cliente de $45 que no contrató el módulo, y por SDK directo sin pasar por
     la UI. Ahora exige canWritePremium(cid, ['clinica','cadena']). */
  await assertFails(setDoc(doc(authed("adminS"), "clinics/clS/outbox/o1"), { id: "o1", kind: "whatsapp", status: "pendiente" }));
  await assertSucceeds(setDoc(doc(authed("adminA"), "clinics/clA/outbox/o1"), { id: "o1", kind: "whatsapp", status: "pendiente" }));
});

test("CERRADO · el plan Solo ya no escribe `cashSessions` (feature `caja` = Clínica+)", async () => {
  await assertFails(setDoc(doc(authed("adminS"), "clinics/clS/cashSessions/cs1"), { id: "cs1", status: "abierta" }));
  await assertSucceeds(setDoc(doc(authed("adminA"), "clinics/clA/cashSessions/csNueva"), { id: "csNueva", status: "abierta" }));
});

test("VULN(CRÍTICO): una suscripción 'active' SIN currentPeriodEndMs escribe sin límite de tiempo", async () => {
  // Es el estado en el que queda el doc después del bug del webhook: un
  // `subscription_updated` de una suscripción cancelada se guarda como
  // status:"active", y como el payload no trae renews_at, setDocument (PATCH sin
  // updateMask) BORRA el currentPeriodEndMs anterior.
  // A partir de ahí subActive() (firestore.rules:94) se reduce a mirar el status:
  // no hay ninguna fecha que pueda vencer.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "clinics/clZ"), { id: "clZ", name: "Z", plan: "cadena" });
    await setDoc(doc(db, "clinics/clZ/users/adminZ"), { id: "adminZ", role: "admin", active: true, clinicId: "clZ", email: "admin@z.com" });
    // En Lemon Squeezy esta suscripción está CANCELADA; en Novudent quedó así:
    await setDoc(doc(db, "subscriptions/clZ"), { clinicId: "clZ", plan: "cadena", status: "active", provider: "lemonsqueezy", lsSubscriptionId: "sub_777" });
  });
  // CORRECTO SERÍA: assertFails (la suscripción real está cancelada).
  await assertSucceeds(setDoc(doc(authed("adminZ"), "clinics/clZ/patients/p1"), { id: "p1" }));
  await assertSucceeds(setDoc(doc(authed("adminZ"), "clinics/clZ/crmCards/c1"), { id: "c1" })); // + premium de Cadena
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

// =============================================================================
// AUDITORÍA — escalada de privilegios DENTRO de una misma clínica (ago-2026)
//
// Estos tests contrastan la matriz RBAC de lib/rbac.ts (que la UI aplica
// escondiendo botones) contra lo que las reglas realmente permiten por SDK.
// Cada `AGUJERO` documenta un permiso que la UI niega y las reglas conceden:
// se afirma el comportamiento ACTUAL para que el suite quede en verde y sirva
// de línea de base. Al aplicar el fix, dar vuelta el assert (assertSucceeds →
// assertFails) — el test pasa a ser la regresión que blinda el arreglo.
//
// Los controles del final verifican las escaladas que YA están cerradas.
// =============================================================================

/* ---- CRÍTICO · LECTURA: sueldos y comisiones del equipo ------------------ */

test("AGUJERO (LECTURA) · cualquier empleado lee commissionPct/salaryBase de sus compañeros", async () => {
  // `settlements` está cerrado a admin justamente porque es dato salarial, pero
  // los MISMOS números viven en clinics/{cid}/users/{uid}, que lee todo miembro.
  // Fix: sacar commissionPct/salaryBase del doc de usuario (o subcolección
  // admin-only), o partir el read de users en "propio | admin" + lista pública.
  const snapAsis = await assertSucceeds(getDoc(doc(authed("asisA"), "clinics/clA/users/dentA")));
  assert.equal(snapAsis.data().commissionPct, 25);   // ← la recepción ve la comisión del doctor
  assert.equal(snapAsis.data().salaryBase, 2000000); // ← y su sueldo base
  const snapDent = await assertSucceeds(getDoc(doc(authed("dentA"), "clinics/clA/users/asisA")));
  assert.equal(snapDent.data().role, "assistant");
});

/* ---- CRÍTICO · ESCRITURA: evadir el blindaje EMR borrando el paciente ---- */

test("CERRADO · el ASISTENTE ya no evade el blindaje EMR con borrar+recrear", async () => {
  /* El shield de patientClinicalFields() solo corría en `update`; `create` y
     `delete` eran "cualquier miembro", así que la cadena leer → borrar → recrear
     reescribía odontograma/evoluciones/recetas sin ser rol clínico, y quedaba
     indistinguible de un guardado legítimo. Ahora las tres puntas están cerradas. */
  const asis = authed("asisA");
  await assertSucceeds(getDoc(doc(asis, "clinics/clA/patients/pEmr")));           // leer: sí
  await assertFails(updateDoc(doc(asis, "clinics/clA/patients/pEmr"), { emr: [{ note: "FORJADO" }] }));
  await assertFails(deleteDoc(doc(asis, "clinics/clA/patients/pEmr")));           // borrar: ya no
  // El admin sí puede borrar (fusión de fichas), que es el único caso real de la UI.
  await assertSucceeds(deleteDoc(doc(authed("adminA"), "clinics/clA/patients/pBorrable")));
});

test("CERRADO · el ASISTENTE no crea pacientes con odontograma/EMR fabricado, pero sí carga uno normal", async () => {
  await assertFails(setDoc(doc(authed("asisA"), "clinics/clA/patients/pFake"), {
    id: "pFake", firstName: "Fabricado",
    odontogram: { teeth: { 21: "caries" } },
    emr: [{ id: "e", note: "diagnóstico inventado por alguien sin emr.write" }],
  }));
  /* La recepción TIENE que poder dar de alta un paciente: es su trabajo. Lo que
     no puede es traer campos clínicos en el alta. */
  await assertSucceeds(setDoc(doc(authed("asisA"), "clinics/clA/patients/pRecepcion"), {
    id: "pRecepcion", firstName: "Alta", lastName: "de mostrador", phone: "0981",
  }));
});

/* ---- ALTO · ESCRITURA: radiografías (EMR por imagen) --------------------- */

test("CERRADO · el ASISTENTE ya no escribe ni borra radiografías; el dentista sí", async () => {
  await assertFails(setDoc(doc(authed("asisA"), "clinics/clA/radiographs/rxFake"),
    { id: "rxFake", patientId: "pEmr", findings: ["hallazgo inventado"] }));
  await assertFails(deleteDoc(doc(authed("asisA"), "clinics/clA/radiographs/rx1")));
  await assertSucceeds(setDoc(doc(authed("dentA"), "clinics/clA/radiographs/rxOk"),
    { id: "rxOk", patientId: "pEmr", findings: ["caries 26"] }));
});

/* ---- ALTO · ESCRITURA: consentimientos firmados ------------------------- */

test("CERRADO · el DENTISTA no escribe consentimientos y NADIE los borra", async () => {
  await assertFails(setDoc(doc(authed("dentA"), "clinics/clA/signatures/sigFake"), { id: "sigFake", patientId: "pEmr" }));
  /* Una firma emitida es prueba legal: el borrado se cierra para todos los roles,
     admin incluido. Se anula cambiando su estado, no se elimina. */
  await assertFails(deleteDoc(doc(authed("asisA"), "clinics/clA/signatures/sig1")));
  await assertFails(deleteDoc(doc(authed("adminA"), "clinics/clA/signatures/sig1")));
  await assertSucceeds(setDoc(doc(authed("asisA"), "clinics/clA/signatures/sigOk"), { id: "sigOk", patientId: "pEmr" }));
});

/* ---- ALTO · ESCRITURA: caja / arqueo (payments.manage) ------------------ */

test("CERRADO · el DENTISTA ya no abre caja ni cierra el arqueo ajeno", async () => {
  await assertFails(setDoc(doc(authed("dentA"), "clinics/clA/cashSessions/csFake"),
    { id: "csFake", userId: "dentA", status: "abierta", openingBalance: 0 }));
  await assertFails(updateDoc(doc(authed("dentA"), "clinics/clA/cashSessions/cs1"),
    { status: "cerrada", countedCash: 0, note: "arqueo forjado" }));
  // La recepción, que es quien hace el arqueo, sigue pudiendo.
  await assertSucceeds(updateDoc(doc(authed("asisA"), "clinics/clA/cashSessions/cs1"),
    { status: "cerrada", countedCash: 200000 }));
});

/* ---- ALTO · ESCRITURA: documentos fiscales (boletas / devoluciones) ----- */

test("CERRADO · el DENTISTA ya no emite devoluciones ni borra boletas", async () => {
  await assertFails(setDoc(doc(authed("dentA"), "clinics/clA/fiscalDocs/fdFake"),
    { id: "fdFake", kind: "devolucion", amount: 5000000, patientId: "pEmr" }));
  await assertFails(deleteDoc(doc(authed("dentA"), "clinics/clA/fiscalDocs/fd1")));
  // El staff emite; solo el admin puede borrar un documento fiscal.
  await assertSucceeds(setDoc(doc(authed("asisA"), "clinics/clA/fiscalDocs/fdOk"),
    { id: "fdOk", kind: "boleta", amount: 500000 }));
  await assertSucceeds(deleteDoc(doc(authed("adminA"), "clinics/clA/fiscalDocs/fd1")));
});

/* ---- MEDIO · ESCRITURA: billing submit / finalize ----------------------- */

test("PENDIENTE · billing sigue sin distinguir submit de finalize", async () => {
  /* Matriz: billing.submit = admin|asistente (dentista NO), billing.finalize =
     admin|dentista (asistente NO). La regla de `billing` es canWrite(cid), o sea
     cualquier miembro: ninguna de las dos direcciones se aplica.
     NO se arregló todavía porque exige partir la regla por campo (`status`), y
     eso necesita fijar antes cuáles son los estados válidos de la máquina. */
  await assertSucceeds(setDoc(doc(authed("dentA"), "clinics/clA/billing/bilFake"), { id: "bilFake", status: "hold" }));
  await assertSucceeds(updateDoc(doc(authed("asisA"), "clinics/clA/billing/bil1"), { status: "finalizada" }));
});

/* ---- MEDIO · ESCRITURA: catálogo de prestaciones y config (practice.config) */

test("CERRADO · un no-admin ya no cambia los precios del catálogo", async () => {
  await assertFails(updateDoc(doc(authed("asisA"), "clinics/clA/procedures/D0120"), { price: 1 }));
  await assertFails(deleteDoc(doc(authed("dentA"), "clinics/clA/procedures/D0120")));
  await assertSucceeds(updateDoc(doc(authed("adminA"), "clinics/clA/procedures/D0120"), { price: 160000 }));
});

test("PENDIENTE · un no-admin todavía escribe config de la práctica (boxes/branches/surveys/eduVideos)", async () => {
  /* Las cuatro pantallas son admin-only en la UI pero las reglas las dejan en
     canWrite/canWritePremium. Queda para el próximo lote: son cambios de bajo
     riesgo pero tocan cuatro reglas y conviene probarlas juntas. */
  await assertSucceeds(setDoc(doc(authed("dentA"), "clinics/clA/boxes/bxFake"), { id: "bxFake" }));
  await assertSucceeds(setDoc(doc(authed("dentA"), "clinics/clA/branches/brFake"), { id: "brFake" }));
});

/* ---- MEDIO · ESCRITURA: inventario (inventory.manage) ------------------- */

test("AGUJERO (ESCRITURA) · el DENTISTA escribe stock/stockMoves (UI: inventory.manage)", async () => {
  await assertSucceeds(setDoc(doc(authed("dentA"), "clinics/clA/stock/stFake"), { id: "stFake", qty: 999 }));
  await assertSucceeds(setDoc(doc(authed("dentA"), "clinics/clA/stockMoves/smFake"), { id: "smFake", delta: -50 }));
});

/* ---- MEDIO · el límite de usuarios del plan es solo del cliente --------- */

test("AGUJERO · una clínica del plan Solo crea usuarios sin tope (planUserLimitError es del cliente)", async () => {
  // lib/plan.ts:84 (maxUsers/maxDentists) se evalúa en lib/store.tsx:816, en el
  // navegador. Las reglas solo piden isAdmin(cid): sin tope ni de usuarios ni de
  // profesionales. Un admin del plan Solo levanta la clínica entera pagando Solo.
  for (let i = 0; i < 12; i++) {
    await assertSucceeds(setDoc(doc(authed("adminS"), `clinics/clS/users/extra${i}`),
      { id: `extra${i}`, role: "dentist", active: true, clinicId: "clS", email: `e${i}@s.com` }));
  }
});

/* ---- CONTROLES: escaladas que YA están cerradas (deben seguir fallando) -- */

test("CONTROL: siguen cerradas las escaladas de rol, dinero y salarios", async () => {
  await assertFails(updateDoc(doc(authed("dentA"), "clinics/clA/users/dentA"), { role: "admin" }));     // auto-ascenso
  // Ojo con el matiz de diff(): affectedKeys() solo lista los campos cuyo VALOR
  // cambió, así que reescribir `active:true` sobre un `active:true` da un set
  // vacío y hasOnly(['name','color']) lo acepta. Es inocuo (no-op), pero por eso
  // el control tiene que probar un cambio REAL de valor.
  await assertFails(updateDoc(doc(authed("dentA"), "clinics/clA/users/dentA"), { active: false }));     // tocar active
  await assertFails(updateDoc(doc(authed("dentA"), "clinics/clA/users/dentA"), { clinicId: "clB" }));   // mudarse de clínica
  await assertFails(updateDoc(doc(authed("dentA"), "clinics/clA/users/dentA"), { mustChangePassword: false }));
  await assertFails(deleteDoc(doc(authed("dentA"), "clinics/clA/users/dentA")));                        // borrar+recrear el user
  await assertFails(updateDoc(doc(authed("asisA"), "clinics/clA/users/adminA"), { role: "assistant" })); // degradar al admin
  await assertFails(setDoc(doc(authed("asisA"), "clinics/clA/expenses/expHack"), { id: "expHack" }));   // gastos
  await assertFails(setDoc(doc(authed("dentA"), "clinics/clA/payments/payHack"), { id: "payHack" }));   // caja
  await assertFails(getDoc(doc(authed("dentA"), "clinics/clA/settlements/liq1")));                      // liquidaciones
});

// =============================================================================
// AUDITORÍA DE AISLAMIENTO MULTI-CLÍNICA (ago-2026)
//
// Estas reglas recién se desplegaron hoy: hasta ahora producción corría con el
// default de Firebase (`request.auth != null`), o sea sin frontera alguna entre
// clínicas. Lo de abajo ataca esa frontera colección por colección.
// =============================================================================

/** Corre `fn(col)` sobre todas las colecciones y devuelve las que NO fallaron. */
async function fugas(fn) {
  const rotas = [];
  for (const c of COLECCIONES_DE_CLINICA) {
    try {
      await assertFails(fn(c));
    } catch {
      rotas.push(c);
    }
  }
  return rotas;
}

// ---- 1. Barrido cross-clínica sobre las 32 colecciones ----

test("AISLAMIENTO: un miembro de A no LEE ninguna colección de la clínica X", async () => {
  const rotas = await fugas((c) => getDoc(doc(authed("adminA"), `clinics/clX/${c}/seed`)));
  assert.deepEqual(rotas, [], `colecciones LEGIBLES desde otra clínica: ${rotas.join(", ")}`);
});

test("AISLAMIENTO: un miembro de A no ESCRIBE ninguna colección de la clínica X", async () => {
  const rotas = await fugas((c) => setDoc(doc(authed("adminA"), `clinics/clX/${c}/seed`), { hackeado: true }));
  assert.deepEqual(rotas, [], `colecciones ESCRIBIBLES desde otra clínica: ${rotas.join(", ")}`);
});

test("AISLAMIENTO: un miembro de A no BORRA ninguna colección de la clínica X", async () => {
  const rotas = await fugas((c) => deleteDoc(doc(authed("adminA"), `clinics/clX/${c}/seed`)));
  assert.deepEqual(rotas, [], `colecciones BORRABLES desde otra clínica: ${rotas.join(", ")}`);
});

test("AISLAMIENTO: un miembro de A no LISTA colecciones de la clínica X (query, no get)", async () => {
  // `get` de un doc puntual y `list` de la colección se autorizan por caminos
  // distintos en Firestore: hay que probar los dos.
  const rotas = [];
  for (const c of COLECCIONES_DE_CLINICA) {
    try { await assertFails(getDocs(collection(authed("adminA"), `clinics/clX/${c}`))); }
    catch { rotas.push(c); }
  }
  assert.deepEqual(rotas, [], `colecciones LISTABLES desde otra clínica: ${rotas.join(", ")}`);
});

test("AISLAMIENTO: el doc raíz de la clínica X (config, token de Botika) es opaco para A", async () => {
  await assertFails(getDoc(doc(authed("adminA"), "clinics/clX")));
  await assertFails(updateDoc(doc(authed("adminA"), "clinics/clX"), { name: "robada" }));
  await assertFails(deleteDoc(doc(authed("adminA"), "clinics/clX")));
  await assertFails(getDoc(doc(authed("adminA"), "subscriptions/clX")));
});

test("CONTROL: un miembro legítimo de X SÍ opera sus colecciones (el deny de arriba es aislamiento, no cobro/plan)", async () => {
  const rotas = [];
  for (const c of COLECCIONES_DE_CLINICA) {
    // surveyResponses es de escritura server-only por diseño (alta pública vía /api)
    if (c === "surveyResponses") continue;
    try { await assertSucceeds(setDoc(doc(authed("adminX"), `clinics/clX/${c}/ok`), { id: "ok" })); }
    catch { rotas.push(c); }
  }
  assert.deepEqual(rotas, [], `colecciones que el propio dueño NO puede escribir: ${rotas.join(", ")}`);
});

// ---- 2. Cuenta recién registrada, sin clínica ----
// El proyecto usa `createUserWithEmailAndPassword` (lib/firebase.ts:44), o sea
// el proveedor Email/Password está habilitado y la apiKey web está en el bundle:
// cualquiera se registra solo y llega con un uid válido y CERO membresías.

test("FORASTERO: una cuenta sin clínica no lee NADA de una clínica real", async () => {
  const rotas = await fugas((c) => getDoc(doc(authed("forastero"), `clinics/clX/${c}/seed`)));
  assert.deepEqual(rotas, [], `legibles por un usuario sin clínica: ${rotas.join(", ")}`);
  await assertFails(getDoc(doc(authed("forastero"), "clinics/clX")));
  await assertFails(getDoc(doc(authed("forastero"), "subscriptions/clX")));
});

test("FORASTERO: una cuenta sin clínica no puede AUTO-INSCRIBIRSE (bootstrap de membresía)", async () => {
  // isMember() se apoya en la existencia de clinics/{cid}/users/{uid}. Si esa
  // creación fuera libre, cualquiera se haría miembro de cualquier clínica.
  await assertFails(setDoc(doc(authed("forastero"), "clinics/clX/users/forastero"),
    { id: "forastero", role: "admin", active: true, clinicId: "clX", email: "f@x.com" }));
  await assertFails(setDoc(doc(authed("forastero"), "clinics/clA/users/forastero"),
    { id: "forastero", role: "admin", active: true, clinicId: "clA", email: "f@x.com" }));
  await assertFails(setDoc(doc(authed("forastero"), "serviceAccounts/forastero"), { note: "yo" }));
  await assertFails(setDoc(doc(authed("forastero"), "directory/forastero"), { clinicId: "clX", email: "f@x.com" }));
});

// ---- 3. Sin sesión (isDemo no exige estar autenticado) ----

test("ANÓNIMO: sin sesión no se lee ni escribe ninguna clínica real", async () => {
  const leibles = await fugas((c) => getDoc(doc(anon(), `clinics/clX/${c}/seed`)));
  assert.deepEqual(leibles, [], `legibles SIN SESIÓN: ${leibles.join(", ")}`);
  const escribibles = await fugas((c) => setDoc(doc(anon(), `clinics/clX/${c}/x`), { x: 1 }));
  assert.deepEqual(escribibles, [], `escribibles SIN SESIÓN: ${escribibles.join(", ")}`);
  await assertFails(getDoc(doc(anon(), "clinics/clX")));
});

test("ANÓNIMO: no se pueden enumerar las clínicas del proyecto", async () => {
  await assertFails(getDocs(collection(anon(), "clinics")));
  await assertFails(getDocs(collection(authed("adminA"), "clinics")));
  await assertFails(getDocs(collection(authed("adminA"), "directory")));
  await assertFails(getDocs(collection(authed("adminA"), "subscriptions")));
  await assertFails(getDocs(collection(authed("adminA"), "leads")));
});

test("COLLECTION GROUP: no se puede barrer una colección a través de TODAS las clínicas", async () => {
  // El agujero clásico de multi-tenant en Firestore: si existiera un
  // `match /{path=**}/patients/{id}` permisivo, un solo query devolvería los
  // pacientes de todas las clínicas del proyecto.
  for (const c of ["patients", "users", "signatures", "radiographs", "payments", "settlements", "billing"]) {
    await assertFails(getDocs(collectionGroup(authed("adminA"), c)));
    await assertFails(getDocs(collectionGroup(anon(), c)));
  }
});

// ---- 4. Envenenamiento del directorio (ruteo de login uid → clínica) ----

test("DIRECTORY: un admin NO puede reescribir ni borrar la entrada ya existente de otro uid", async () => {
  await assertFails(updateDoc(doc(authed("adminA"), "directory/adminX"), { clinicId: "clA" }));
  await assertFails(deleteDoc(doc(authed("adminA"), "directory/adminX")));
  await assertFails(setDoc(doc(authed("adminA"), "directory/adminX"), { clinicId: "clA", email: "x@x.com" }));
});

test("DIRECTORY: un admin SÍ puede sembrar el ruteo de un uid ajeno SIN entrada previa (residual)", async () => {
  // La regla exige `exists(clinics/{cid}/users/{uid})` — pero ese doc lo crea el
  // propio admin, así que la condición no ata nada: dos escrituras y el uid
  // ajeno queda ruteado a la clínica del atacante en su próximo login.
  await assertSucceeds(setDoc(doc(authed("adminA"), "clinics/clA/users/uidAjeno"),
    { id: "uidAjeno", role: "assistant", active: true, clinicId: "clA", email: "ajeno@otra.com" }));
  await assertSucceeds(setDoc(doc(authed("adminA"), "directory/uidAjeno"),
    { clinicId: "clA", email: "ajeno@otra.com" }));
});

test("CERRADO · nadie rutea un uid ajeno hacia la demo aunque se haga 'admin' de ella", async () => {
  /* `isDemo(cid)` no mira el rol, así que hacerse admin de `cl_demo` es gratis:
     alcanza con escribirse el propio users/{uid} con role:'admin'. Desde esa
     silla se sembraba `directory/{uid ajeno}` → cl_demo, y ese usuario, al
     ingresar con su contraseña real, aterrizaba en una clínica que se lee desde
     internet sin credenciales. La demo queda excluida como destino de ruteo. */
  await assertSucceeds(setDoc(doc(authed("forastero"), "clinics/cl_demo/users/forastero"),
    { id: "forastero", role: "admin", active: true, clinicId: "cl_demo", email: "f@x.com" }));
  await assertSucceeds(setDoc(doc(authed("forastero"), "clinics/cl_demo/users/otroUid"),
    { id: "otroUid", role: "assistant", active: true, clinicId: "cl_demo", email: "v@v.com" }));
  // …pero el ruteo del login ya no.
  await assertFails(setDoc(doc(authed("forastero"), "directory/otroUid"),
    { clinicId: "cl_demo", email: "v@v.com" }));
});

// ---- 5. El campo `clinicId` de adentro del doc no se valida (backlog I8) ----

test("I8: se guarda en la clínica A un documento que dice pertenecer a la clínica X", async () => {
  // El PATH aísla, el CAMPO miente. Nada en las reglas exige
  // request.resource.data.clinicId == cid.
  await assertSucceeds(setDoc(doc(authed("adminA"), "clinics/clA/patients/pMentira"),
    { id: "pMentira", clinicId: "clX", firstName: "Mentira" }));
  await assertSucceeds(setDoc(doc(authed("adminA"), "clinics/clA/outbox/tMentira"),
    { id: "tMentira", clinicId: "clX", type: "cobranza", status: "pendiente" }));
  await assertSucceeds(setDoc(doc(authed("adminA"), "clinics/clA/users/uMentira"),
    { id: "uMentira", role: "assistant", active: true, clinicId: "clX", email: "u@a.com" }));
});

test("I8: un admin puede mentir el clinicId de SU PROPIO doc de usuario (sale en la Session)", async () => {
  // lib/store.tsx:810 arma la sesión con `clinicId: u.clinicId` — el campo, no
  // el path: la sesión queda declarando una clínica que no es donde escribe.
  await assertSucceeds(updateDoc(doc(authed("adminA"), "clinics/clA/users/adminA"), { clinicId: "cl_demo" }));
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), "clinics/clA/users/adminA"), { clinicId: "clA" });
  });
});

// ---- 6. La demo (cl_demo) como superficie sin autenticación ----

test("CERRADO · SIN SESIÓN ya no se planta un usuario en cl_demo", async () => {
  /* `isDemo(cid)` no llamaba a isSignedIn(), así que `clinics/cl_demo/**` era
     escribible por cualquiera en internet con la apiKey web (que va en el
     bundle). Combinado con el login —que buscaba al usuario por EMAIL dentro de
     la clínica cargada, y en la pantalla de ingreso esa es la demo— este doc
     secuestraba el login de un admin real. Las dos puntas están cerradas: el
     login resuelve por uid/directorio, y escribir la demo exige sesión. */
  await assertFails(setDoc(doc(anon(), "clinics/cl_demo/users/plantado"),
    { id: "plantado", authUid: "plantado", role: "admin", active: true, clinicId: "cl_demo", email: "admin@a.com", name: "Impostor" }));
});

test("CERRADO · SIN SESIÓN ya no se borra ni se defacea el doc raíz de la demo", async () => {
  /* Borrar el doc raíz reabría la colisión de id: el único anti-colisión del
     alta era mirar si el doc existía, así que la próxima clínica llamada "Demo"
     nacía como `cl_demo` y quedaba pública para siempre. Ahora hay dos frenos:
     esto exige sesión, y `cl_demo` es un id reservado en /api/clinicas. */
  await assertFails(setDoc(doc(anon(), "clinics/cl_demo"), { id: "cl_demo", name: "defaceada", plan: "cadena" }));
  await assertFails(deleteDoc(doc(anon(), "clinics/cl_demo")));
});

test("DEMO: desde la demo NO se alcanza ninguna clínica real", async () => {
  // Ser 'admin' de cl_demo no vale en ninguna otra clínica: isDemo/isAdmin
  // siempre se evalúan contra el {cid} del path.
  const leibles = await fugas((c) => getDoc(doc(authed("forastero"), `clinics/clX/${c}/seed`)));
  assert.deepEqual(leibles, [], `alcanzables desde la demo: ${leibles.join(", ")}`);
  await assertFails(getDoc(doc(authed("forastero"), "clinics/clA")));
  await assertFails(getDoc(doc(authed("forastero"), "clinics/clA/users/adminA")));
});

// ---- 7. Colecciones raíz de servicio: cerradas al cliente ----

test("RAÍZ: leads / checkoutTokens / webhookEvents son opacos para cualquier cliente", async () => {
  for (const p of ["leads/l1", "checkoutTokens/t1", "webhookEvents/e1"]) {
    await assertFails(getDoc(doc(authed("adminA"), p)));
    await assertFails(setDoc(doc(authed("adminA"), p), { x: 1 }));
    await assertFails(getDoc(doc(anon(), p)));
    await assertFails(setDoc(doc(anon(), p), { x: 1 }));
  }
});

test("CERRADO · SIN SESIÓN no se escribe NINGUNA colección de cl_demo", async () => {
  /* La demo entera era una superficie de escritura sin autenticar. Como el
     proyecto Firebase —y su cuota— es UNO SOLO, el abuso de acá pegaba en las
     clínicas reales; y con el proyecto en Blaze eso es factura. */
  const abiertas = [];
  for (const c of COLECCIONES_DE_CLINICA) {
    if (c === "surveyResponses") continue; // server-only por diseño
    try { await assertFails(setDoc(doc(anon(), `clinics/cl_demo/${c}/anon_${c}`), { basura: "x".repeat(100) })); }
    catch { abiertas.push(c); }
  }
  assert.deepEqual(abiertas, [], `colecciones de la demo escribibles sin sesión: ${abiertas.join(", ")}`);
});

test("CON sesión (la anónima del cliente) la demo sigue escribiéndose entera", async () => {
  // El contrapeso del test de arriba: cerrar el anónimo-sin-sesión no puede
  // romper la demo de ventas, que es para lo que existe.
  const rotas = [];
  for (const c of COLECCIONES_DE_CLINICA) {
    if (c === "surveyResponses") continue;
    try { await assertSucceeds(setDoc(doc(authed("visitante"), `clinics/cl_demo/${c}/v_${c}`), { id: `v_${c}` })); }
    catch { rotas.push(c); }
  }
  assert.deepEqual(rotas, [], `colecciones de la demo rotas para un visitante: ${rotas.join(", ")}`);
});

test("DEMO: `cl_clinica-demo` es una clínica REAL — isDemo debe ser igualdad exacta, nunca prefijo/contains", async () => {
  // Existe en producción una clínica real con id `cl_clinica-demo`. Si alguna
  // vez isDemo() pasara de `cid == 'cl_demo'` a un startsWith/contains, esa
  // clínica quedaría world-readable/writable de un plumazo. Regresión dura.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "clinics/cl_clinica-demo"), { id: "cl_clinica-demo", name: "Clínica Demo (real)" });
    await setDoc(doc(db, "clinics/cl_clinica-demo/patients/pReal"), { id: "pReal", firstName: "Real" });
    await setDoc(doc(db, "clinics/cl_demo-suffix/patients/pReal"), { id: "pReal", firstName: "Real" });
  });
  await assertFails(getDoc(doc(anon(), "clinics/cl_clinica-demo")));
  await assertFails(getDoc(doc(anon(), "clinics/cl_clinica-demo/patients/pReal")));
  await assertFails(setDoc(doc(anon(), "clinics/cl_clinica-demo/patients/pReal"), { firstName: "Hackeado" }));
  await assertFails(getDoc(doc(anon(), "clinics/cl_demo-suffix/patients/pReal")));
  await assertFails(getDoc(doc(authed("forastero"), "clinics/cl_clinica-demo/patients/pReal")));
});
