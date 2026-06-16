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
import { doc, getDoc, setDoc } from "firebase/firestore";

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
    await setDoc(doc(db, "clinics/clA/payments/pay1"), { id: "pay1", amount: 1000 });
    await setDoc(doc(db, "clinics/clA/expenses/exp1"), { id: "exp1", amount: 500 });
    // Clínica B
    await setDoc(doc(db, "clinics/clB"), { id: "clB", name: "B", plan: "solo" });
    await setDoc(doc(db, "clinics/clB/users/adminB"), { id: "adminB", role: "admin", active: true, clinicId: "clB", email: "admin@b.com" });
    await setDoc(doc(db, "clinics/clB/patients/pb"), { id: "pb", firstName: "Beto" });
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
