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
import { doc, getDoc, getDocs, collection, collectionGroup, setDoc, updateDoc, deleteDoc, query, where } from "firebase/firestore";

const PROJECT_ID = "novudent-rules-test";
let testEnv;

/** Las 35 colecciones por clínica que escribe el store (loadFirestore en
 *  lib/store.tsx) + `slotLocks`, que escribe la ruta de reservas online. Se usan
 *  para barrer el aislamiento colección por colección: alcanza con que UNA se
 *  escape para que se filtre historia clínica entre clínicas. */
const COLECCIONES_DE_CLINICA = [
  "users", "patients", "appointments", "billing", "procedures", "budgets",
  "payments", "expenses", "stock", "stockMoves", "waitlist", "outbox",
  "slotLocks", "recoveryMonitors", "radiographs", "signatures", "crmCards",
  "campaigns", "labOrders", "settlements", "boxes", "patientNotes",
  "fiscalDocs", "cashSessions", "sterilizationCycles", "teamMessages",
  "surveys", "surveyResponses", "mgmtTasks", "environmentalLogs", "eduVideos",
  "branches", "directMessages", "clinicalDocs", "routineChecks",
];

/** Un mensaje directo bien formado, igual al que arma lib/chat.ts. `extra` pisa
 *  o agrega campos: así cada prueba rompe UNA sola condición de la regla. */
function directo({ id, cid = "clA", de, a, texto = "Hola, ¿tenés un minuto?", ...extra }) {
  return {
    id, clinicId: cid, fromId: de, fromName: `Usuario ${de}`, toId: a,
    participants: [de, a], text: texto, createdAt: "2026-09-27T12:00:00.000Z", ...extra,
  };
}

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
    // Roles v3: la recepción se separa de la caja.
    await setDoc(doc(db, "clinics/clA/users/cajaA"), { id: "cajaA", role: "cashier", active: true, clinicId: "clA", email: "caja@a.com" });
    await setDoc(doc(db, "clinics/clA/users/recepA"), { id: "recepA", role: "receptionist", active: true, clinicId: "clA", email: "recep@a.com" });
    await setDoc(doc(db, "clinics/clA/patients/p1"), { id: "p1", firstName: "Ana" });
    await setDoc(doc(db, "subscriptions/clA"), { clinicId: "clA", plan: "clinica", status: "active" });

    // Fixtures de la auditoría de escalada intra-clínica (ver bloque AGUJERO al final).
    await setDoc(doc(db, "clinics/clA/patients/pEmr"), { id: "pEmr", firstName: "Elena", lastName: "Ramos", phone: "0981", odontogram: { teeth: { 11: "sano" } }, emr: [{ id: "e1", note: "Evolución original del dentista" }] });
    await setDoc(doc(db, "clinics/clA/patients/pBorrable"), { id: "pBorrable", firstName: "Duplicado", lastName: "A fusionar" });
    await setDoc(doc(db, "clinics/clA/radiographs/rx1"), { id: "rx1", patientId: "pEmr", image: "data:image/jpeg;base64,AAA", findings: ["caries 26"] });
    await setDoc(doc(db, "clinics/clA/clinicalDocs/cdSeed"), { id: "cdSeed", patientId: "pEmr", estado: "completado", nombre: "Historia Clínica" });
    await setDoc(doc(db, "clinics/clA/routineChecks/caja__2026-10-01"), { id: "caja__2026-10-01", paso: "caja", periodo: "2026-10-01", hechoPor: "adminA", hechoPorNombre: "Admin A", hechoEn: "2026-10-01T12:00:00.000Z" });
    await setDoc(doc(db, "clinics/clA/signatures/sig1"), { id: "sig1", patientId: "pEmr", status: "firmado", signature: "data:image/png;base64,AAA" });
    await setDoc(doc(db, "clinics/clA/billing/bil1"), { id: "bil1", patientId: "pEmr", status: "hold", amount: 500000 });
    await setDoc(doc(db, "clinics/clA/procedures/D0120"), { cpt: "D0120", description: "Consulta", price: 150000 });
    await setDoc(doc(db, "clinics/clA/cashSessions/cs1"), { id: "cs1", userId: "asisA", userName: "Recepción", status: "abierta", openingBalance: 200000 });
    await setDoc(doc(db, "clinics/clA/fiscalDocs/fd1"), { id: "fd1", kind: "boleta", number: "001-001-0000001", amount: 500000 });

    await setDoc(doc(db, "clinics/clA/payments/pay1"), { id: "pay1", amount: 1000 });
    await setDoc(doc(db, "clinics/clA/expenses/exp1"), { id: "exp1", amount: 500 });
    await setDoc(doc(db, "clinics/clA/settlements/liq1"), { id: "liq1", dentistId: "dentA", total: 3000000 });

    // Chat directo (ver el bloque MENSAJES DIRECTOS al final): un directo entre la
    // dentista y la asistente, y una difusión del admin repartida en tres copias.
    await setDoc(doc(db, "clinics/clA/users/exA"), { id: "exA", role: "receptionist", active: false, clinicId: "clA", email: "ex@a.com" });
    await setDoc(doc(db, "clinics/clA/directMessages/dm1"), directo({ id: "dm1", de: "dentA", a: "asisA" }));
    await setDoc(doc(db, "clinics/clA/directMessages/dmEx"), directo({ id: "dmEx", de: "adminA", a: "exA", texto: "Pasá a firmar la baja" }));
    for (const [id, a] of [["cpDent", "dentA"], ["cpAsis", "asisA"], ["cpRecep", "recepA"]]) {
      await setDoc(doc(db, `clinics/clA/directMessages/${id}`), directo({ id, de: "adminA", a, texto: "El viernes cerramos a las 16", difusionId: "dif1" }));
    }
    // Clínica B
    await setDoc(doc(db, "clinics/clB"), { id: "clB", name: "B", plan: "solo" });
    await setDoc(doc(db, "clinics/clB/users/adminB"), { id: "adminB", role: "admin", active: true, clinicId: "clB", email: "admin@b.com" });
    await setDoc(doc(db, "clinics/clB/patients/pb"), { id: "pb", firstName: "Beto" });
    // Clínica V: suscripción VENCIDA (impago) — para probar el modo solo-lectura
    await setDoc(doc(db, "clinics/clV"), { id: "clV", name: "V", plan: "clinica" });
    await setDoc(doc(db, "clinics/clV/users/adminV"), { id: "adminV", role: "admin", active: true, clinicId: "clV", email: "admin@v.com" });
    await setDoc(doc(db, "clinics/clV/patients/pv"), { id: "pv", firstName: "Vito" });
    await setDoc(doc(db, "subscriptions/clV"), { clinicId: "clV", plan: "clinica", status: "past_due" });
    await setDoc(doc(db, "clinics/clV/users/dentV"), { id: "dentV", role: "dentist", active: true, clinicId: "clV", email: "dent@v.com" });
    await setDoc(doc(db, "clinics/clV/clinicalDocs/cdV"), { id: "cdV", patientId: "pv", estado: "pendiente" });
    await setDoc(doc(db, "clinics/clV/routineChecks/caja__2026-10-01"), { id: "caja__2026-10-01", paso: "caja", periodo: "2026-10-01" });
    await setDoc(doc(db, "clinics/clV/directMessages/dmV"), directo({ id: "dmV", cid: "clV", de: "adminV", a: "dentV" }));

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
    // Segunda persona de X: un directo necesita un destinatario de la misma clínica.
    await setDoc(doc(db, "clinics/clX/users/recepX"), { id: "recepX", role: "receptionist", active: true, clinicId: "clX", email: "recep@x.com" });
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

    /* ---- PERMISOS DEL EQUIPO (config.permisos): la clínica reparte y saca permisos por rol ----
     * Plan clínica y suscripción al día para que ningún deny se pueda atribuir al cobro o al plan. */
    const seedEquipo = async (cid, permisos, extra = {}) => {
      await setDoc(doc(db, `clinics/${cid}`), { id: cid, name: cid, plan: "clinica", config: permisos === undefined ? { timezone: "America/Asuncion" } : { timezone: "America/Asuncion", permisos } });
      await setDoc(doc(db, `subscriptions/${cid}`), { clinicId: cid, plan: "clinica", status: "active", ...extra });
      const L = cid.slice(2); // clP → P
      for (const [rol, id] of [["admin", "admin"], ["cashier", "caja"], ["receptionist", "recep"], ["dentist", "dent"], ["assistant", "asis"]]) {
        await setDoc(doc(db, `clinics/${cid}/users/${id}${L}`), { id: `${id}${L}`, role: rol, active: true, clinicId: cid, email: `${id}@${cid}.com` });
      }
      await setDoc(doc(db, `clinics/${cid}/patients/pEq`), { id: "pEq", firstName: "Paciente", lastName: "Del equipo", phone: "0981", odontogram: { teeth: { 11: "sano" } } });
      await setDoc(doc(db, `clinics/${cid}/expenses/expEq`), { id: "expEq", amount: 500 });
      await setDoc(doc(db, `clinics/${cid}/settlements/liqEq`), { id: "liqEq", dentistId: `dent${L}`, total: 3000000 });
    };
    // P: reparte y saca en los cinco puntos que hacen cumplir las reglas, más datos que NO valen (el admin, los permisos solo del admin).
    await seedEquipo("clP", {
      cashier: { dar: ["expenses.manage"], quitar: ["payments.manage"] },
      receptionist: { dar: ["payments.manage"], quitar: ["engagement.forms"] },
      dentist: { dar: ["engagement.forms"], quitar: ["emr.write"] },
      assistant: { dar: ["emr.write", "billing.reports", "practice.config", "users.manage"], quitar: [] },
      admin: { quitar: ["payments.manage", "emr.write", "engagement.forms", "expenses.manage", "billing.reports"] },
    });
    // Q: ajustes mal formados o contradictorios (nadie los escribe a mano en la app, pero Firestore se puede editar).
    await seedEquipo("clQ", {
      receptionist: { dar: ["payments.manage"], quitar: ["payments.manage", "engagement.forms"] }, // dar y quitar a la vez: gana dar
      cashier: "basura", // no es un mapa: se ignora y rige la fábrica
      dentist: { dar: "emr.write", quitar: 3 }, // listas que no son listas: se ignoran
    });
    // M: arranca sin ajustes; el administrador los cambia durante las pruebas.
    await seedEquipo("clM", undefined);
    // V2: suscripción vencida con permisos repartidos: el cobro sigue mandando.
    await seedEquipo("clW", { receptionist: { dar: ["payments.manage"] } }, { status: "past_due" });

    /* R: ROLES PROPIOS y el rol de fábrica «Comercial». Un rol propio (id «rp_…») no hereda nada de fábrica: lo que puede es su lista `dar`.
     * `rolesPropios` (los nombres) no lo lee ninguna regla: las reglas solo miran `permisos[role]`. */
    await seedEquipo("clR", {
      rp_ab12cd34: { dar: ["payments.manage", "expenses.manage"], quitar: [] },
      rp_borrado1: { dar: [], quitar: [] }, // un rol que se borró: queda una entrada neutra
    });
    await setDoc(doc(db, "clinics/clR"), { config: { rolesPropios: [{ id: "rp_ab12cd34", nombre: "Contador" }] } }, { merge: true });
    for (const [id, role] of [["comR", "commercial"], ["propR", "rp_ab12cd34"], ["vacioR", "rp_sinentrada"], ["huerfanoR", "rp_borrado1"], ["rarR", "constructor"], ["protoR", "__proto__"]]) {
      await setDoc(doc(db, `clinics/clR/users/${id}`), { id, role, active: true, clinicId: "clR", email: `${id}@clr.com` });
    }
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

test("dinero: la CAJA (admin / Recepción y caja) SÍ escribe payments; gastos solo el admin", async () => {
  await assertSucceeds(setDoc(doc(authed("cajaA"), "clinics/clA/payments/payY"), { id: "payY", amount: 1 }));
  await assertSucceeds(setDoc(doc(authed("adminA"), "clinics/clA/expenses/expY"), { id: "expY", amount: 1 }));
});

test("roles v3: ni la RECEPCIONISTA ni el ASISTENTE DE DOCTORES escriben dinero", async () => {
  for (const quien of ["recepA", "asisA"]) {
    await assertFails(setDoc(doc(authed(quien), "clinics/clA/payments/payNo"), { id: "payNo", amount: 1 }));
    await assertFails(setDoc(doc(authed(quien), "clinics/clA/cashSessions/csNo"), { id: "csNo", openedAt: "x" }));
    await assertFails(setDoc(doc(authed(quien), "clinics/clA/fiscalDocs/fdNo"), { id: "fdNo", total: 1 }));
    await assertFails(setDoc(doc(authed(quien), "clinics/clA/expenses/expNo"), { id: "expNo", amount: 1 }));
  }
});

test("roles v3: los consentimientos los firma la recepción, no el asistente de doctores", async () => {
  await assertSucceeds(setDoc(doc(authed("recepA"), "clinics/clA/signatures/sigRecep"), { id: "sigRecep", patientId: "pEmr" }));
  await assertSucceeds(setDoc(doc(authed("cajaA"), "clinics/clA/signatures/sigCaja"), { id: "sigCaja", patientId: "pEmr" }));
  await assertFails(setDoc(doc(authed("asisA"), "clinics/clA/signatures/sigAsis"), { id: "sigAsis", patientId: "pEmr" }));
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
  await assertSucceeds(updateDoc(doc(authed("recepA"), "clinics/clA/patients/p1"), { phone: "0991", city: "Asunción" }));
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

test("OPERACIÓN INTACTA: «Recepción y caja» sigue cobrando y viendo pagos", async () => {
  // El corte es "números del negocio", NO la operación de mostrador: si esto
  // fallara, recepción no podría cobrarle a un paciente.
  await assertSucceeds(getDoc(doc(authed("cajaA"), "clinics/clA/payments/pay1")));
  await assertSucceeds(setDoc(doc(authed("cajaA"), "clinics/clA/payments/payNuevo"), { id: "payNuevo", amount: 50000 }));
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
  await assertSucceeds(setDoc(doc(authed("recepA"), "clinics/clA/patients/pRecepcion"), {
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
  await assertSucceeds(setDoc(doc(authed("recepA"), "clinics/clA/signatures/sigOk"), { id: "sigOk", patientId: "pEmr" }));
});

/* ---- ALTO · ESCRITURA: caja / arqueo (payments.manage) ------------------ */

test("CERRADO · el DENTISTA ya no abre caja ni cierra el arqueo ajeno", async () => {
  await assertFails(setDoc(doc(authed("dentA"), "clinics/clA/cashSessions/csFake"),
    { id: "csFake", userId: "dentA", status: "abierta", openingBalance: 0 }));
  await assertFails(updateDoc(doc(authed("dentA"), "clinics/clA/cashSessions/cs1"),
    { status: "cerrada", countedCash: 0, note: "arqueo forjado" }));
  // La recepción, que es quien hace el arqueo, sigue pudiendo.
  await assertSucceeds(updateDoc(doc(authed("cajaA"), "clinics/clA/cashSessions/cs1"),
    { status: "cerrada", countedCash: 200000 }));
});

/* ---- ALTO · ESCRITURA: documentos fiscales (boletas / devoluciones) ----- */

test("CERRADO · el DENTISTA ya no emite devoluciones ni borra boletas", async () => {
  await assertFails(setDoc(doc(authed("dentA"), "clinics/clA/fiscalDocs/fdFake"),
    { id: "fdFake", kind: "devolucion", amount: 5000000, patientId: "pEmr" }));
  await assertFails(deleteDoc(doc(authed("dentA"), "clinics/clA/fiscalDocs/fd1")));
  // El staff emite; solo el admin puede borrar un documento fiscal.
  await assertSucceeds(setDoc(doc(authed("cajaA"), "clinics/clA/fiscalDocs/fdOk"),
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

// ---- 1. Barrido cross-clínica sobre las 33 colecciones ----

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
    // directMessages valida el contenido (remitente, destinatario, texto): va un directo bien formado.
    const datos = c === "directMessages" ? directo({ id: "ok", cid: "clX", de: "adminX", a: "recepX" }) : { id: "ok" };
    try { await assertSucceeds(setDoc(doc(authed("adminX"), `clinics/clX/${c}/ok`), datos)); }
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
  for (const c of ["patients", "users", "signatures", "radiographs", "payments", "settlements", "billing", "directMessages"]) {
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

// =============================================================================
// MENSAJES DIRECTOS (chat) — la única colección de la clínica que un miembro NO
// lee entera. Un directo es de sus dos participantes y del admin. La difusión del
// admin se guarda como UNA copia por destinatario (mismo difusionId): cada uno lee
// la suya y nada más, así que no hay forma de averiguar a quién más le llegó.
//
// Fixtures del before(): dm1 (dentA → asisA), dmEx (adminA → exA, dado de baja),
// la difusión dif1 repartida en cpDent / cpAsis / cpRecep, y dmV en la clínica V
// (suscripción vencida).
// =============================================================================

const DM = (cid = "clA") => `clinics/${cid}/directMessages`;

test("DIRECTOS: lo leen sus dos participantes; otra persona de la misma clínica NO", async () => {
  await assertSucceeds(getDoc(doc(authed("dentA"), `${DM()}/dm1`))); // quien lo mandó
  await assertSucceeds(getDoc(doc(authed("asisA"), `${DM()}/dm1`))); // a quien le llegó
  await assertFails(getDoc(doc(authed("recepA"), `${DM()}/dm1`)));
  await assertFails(getDoc(doc(authed("cajaA"), `${DM()}/dm1`)));
});

test("DIRECTOS: el admin lee cualquier directo de su clínica y lista la colección entera", async () => {
  await assertSucceeds(getDoc(doc(authed("adminA"), `${DM()}/dm1`)));
  const todos = await assertSucceeds(getDocs(collection(authed("adminA"), DM())));
  const ids = todos.docs.map((d) => d.id);
  for (const id of ["dm1", "dmEx", "cpDent", "cpAsis", "cpRecep"]) assert.ok(ids.includes(id), `falta ${id}`);
});

test("DIRECTOS: un no-admin NO lista la colección entera; SÍ la consulta por participants (la del store)", async () => {
  // Las reglas no son filtros: pedir todo siendo recepcionista no trae «lo suyo», falla entero.
  await assertFails(getDocs(collection(authed("recepA"), DM())));
  const mios = await assertSucceeds(getDocs(query(collection(authed("recepA"), DM()), where("participants", "array-contains", "recepA"))));
  assert.ok(mios.docs.some((d) => d.id === "cpRecep"));
  assert.ok(mios.docs.every((d) => d.data().participants.includes("recepA")));
  // Y no sirve pedir las conversaciones de OTRO.
  await assertFails(getDocs(query(collection(authed("recepA"), DM()), where("participants", "array-contains", "dentA"))));
});

test("DIFUSIÓN: cada destinatario lee solo SU copia — no averigua a quién más le llegó", async () => {
  const asis = authed("asisA");
  await assertSucceeds(getDoc(doc(asis, `${DM()}/cpAsis`)));
  await assertFails(getDoc(doc(asis, `${DM()}/cpDent`)));
  await assertFails(getDoc(doc(asis, `${DM()}/cpRecep`)));
  // Ni consultando por el difusionId que trae su propia copia.
  await assertFails(getDocs(query(collection(asis, DM()), where("difusionId", "==", "dif1"))));
  // El admin sí ve a quién le llegó.
  const copias = await assertSucceeds(getDocs(query(collection(authed("adminA"), DM()), where("difusionId", "==", "dif1"))));
  assert.deepEqual(copias.docs.map((d) => d.data().toId).sort(), ["asisA", "dentA", "recepA"]);
});

test("DIRECTOS: un ex empleado (active:false) ya no lee ni sus propios directos", async () => {
  await assertFails(getDoc(doc(authed("exA"), `${DM()}/dmEx`)));
  await assertFails(getDocs(query(collection(authed("exA"), DM()), where("participants", "array-contains", "exA"))));
});

test("DIRECTOS: un miembro manda un directo bien formado a otra persona de su clínica", async () => {
  await assertSucceeds(setDoc(doc(authed("recepA"), `${DM()}/dmOk`), directo({ id: "dmOk", de: "recepA", a: "dentA" })));
  // El tope es de 2000 caracteres, inclusive (el mismo que la interfaz).
  await assertSucceeds(setDoc(doc(authed("recepA"), `${DM()}/dmLargo`), directo({ id: "dmLargo", de: "recepA", a: "dentA", texto: "x".repeat(2000) })));
});

test("DIRECTOS: nadie manda un directo a nombre de otro (ni el admin, ni sin sesión)", async () => {
  const casos = [
    ["remitente ajeno", "dentA", directo({ id: "fx1", de: "asisA", a: "recepA" })],
    ["participants sin el que escribe", "dentA", directo({ id: "fx2", de: "dentA", a: "recepA", participants: ["asisA", "recepA"] })],
    ["un tercero colado en participants", "dentA", directo({ id: "fx3", de: "dentA", a: "recepA", participants: ["dentA", "recepA", "cajaA"] })],
    ["el admin firmando por la dentista", "adminA", directo({ id: "fx4", de: "dentA", a: "recepA" })],
  ];
  const pasaron = [];
  for (const [nombre, quien, datos] of casos) {
    try { await assertFails(setDoc(doc(authed(quien), `${DM()}/${datos.id}`), datos)); }
    catch { pasaron.push(nombre); }
  }
  assert.deepEqual(pasaron, [], `suplantaciones que la regla dejó pasar: ${pasaron.join(", ")}`);
  await assertFails(setDoc(doc(anon(), `${DM()}/fx5`), directo({ id: "fx5", de: "dentA", a: "recepA" })));
});

test("DIRECTOS: el alta valida destinatario, texto y forma del documento", async () => {
  const sinTexto = directo({ id: "v11", de: "dentA", a: "recepA" });
  delete sinTexto.text;
  const casos = [
    ["a sí mismo", "v1", directo({ id: "v1", de: "dentA", a: "dentA", participants: ["dentA", "dentA"] })],
    ["a alguien que no es de la clínica", "v2", directo({ id: "v2", de: "dentA", a: "forastero" })],
    ["a un ex empleado", "v3", directo({ id: "v3", de: "dentA", a: "exA" })],
    ["a alguien de otra clínica", "v4", directo({ id: "v4", de: "dentA", a: "adminB" })],
    ["texto en blanco", "v5", directo({ id: "v5", de: "dentA", a: "recepA", texto: "   " })],
    ["texto de 2001 caracteres", "v6", directo({ id: "v6", de: "dentA", a: "recepA", texto: "x".repeat(2001) })],
    ["clinicId de otra clínica", "v7", directo({ id: "v7", de: "dentA", a: "recepA", clinicId: "clB" })],
    ["id distinto del documento", "v8", directo({ id: "otro", de: "dentA", a: "recepA" })],
    ["campo de más", "v9", directo({ id: "v9", de: "dentA", a: "recepA", adjunto: "data:x" })],
    ["ya marcado leído en el alta", "v10", directo({ id: "v10", de: "dentA", a: "recepA", readAt: "2026-09-27T12:01:00.000Z" })],
    ["sin texto", "v11", sinTexto],
  ];
  const pasaron = [];
  for (const [nombre, docId, datos] of casos) {
    try { await assertFails(setDoc(doc(authed("dentA"), `${DM()}/${docId}`), datos)); }
    catch { pasaron.push(nombre); }
  }
  assert.deepEqual(pasaron, [], `altas inválidas que la regla dejó pasar: ${pasaron.join(", ")}`);
});

test("DIFUSIÓN: solo el admin la manda — un difusionId en el alta de otro rol se rechaza", async () => {
  await assertFails(setDoc(doc(authed("dentA"), `${DM()}/dfNo`), directo({ id: "dfNo", de: "dentA", a: "asisA", difusionId: "difTrucha" })));
  await assertFails(setDoc(doc(authed("cajaA"), `${DM()}/dfNo2`), directo({ id: "dfNo2", de: "cajaA", a: "asisA", difusionId: "difTrucha" })));
  await assertSucceeds(setDoc(doc(authed("adminA"), `${DM()}/dfSi`), directo({ id: "dfSi", de: "adminA", a: "cajaA", difusionId: "dif2" })));
});

test("DIRECTOS: lo marca leído el destinatario y nadie más (ni el remitente, ni el admin)", async () => {
  const leido = { readAt: "2026-09-27T12:05:00.000Z" };
  await assertFails(updateDoc(doc(authed("dentA"), `${DM()}/dm1`), leido));  // quien lo mandó
  await assertFails(updateDoc(doc(authed("recepA"), `${DM()}/dm1`), leido)); // un tercero
  await assertFails(updateDoc(doc(authed("adminA"), `${DM()}/dm1`), leido)); // el admin lo lee, no lo toca
  await assertSucceeds(updateDoc(doc(authed("asisA"), `${DM()}/dm1`), leido));
});

test("DIRECTOS: el destinatario solo toca readAt — no reescribe el texto ni el remitente", async () => {
  const asis = authed("asisA");
  await assertFails(updateDoc(doc(asis, `${DM()}/dm1`), { text: "Nunca dije eso" }));
  await assertFails(updateDoc(doc(asis, `${DM()}/dm1`), { readAt: "2026-09-27T12:06:00.000Z", fromId: "adminA" }));
  await assertFails(updateDoc(doc(asis, `${DM()}/dm1`), { participants: ["asisA", "recepA"] }));
});

test("DIRECTOS: nadie borra un mensaje, ni el admin", async () => {
  for (const quien of ["dentA", "asisA", "adminA"]) {
    await assertFails(deleteDoc(doc(authed(quien), `${DM()}/dm1`)));
  }
});

test("DIRECTOS: con la suscripción vencida se leen y se marcan leídos, pero no se manda nada nuevo", async () => {
  await assertSucceeds(getDoc(doc(authed("dentV"), `${DM("clV")}/dmV`)));
  await assertSucceeds(updateDoc(doc(authed("dentV"), `${DM("clV")}/dmV`), { readAt: "2026-09-27T12:07:00.000Z" }));
  await assertFails(setDoc(doc(authed("adminV"), `${DM("clV")}/dmV2`), directo({ id: "dmV2", cid: "clV", de: "adminV", a: "dentV" })));
});

test("DIRECTOS: la demo sigue siendo el sandbox público de siempre", async () => {
  await assertSucceeds(getDocs(collection(anon(), DM("cl_demo"))));
  // En la demo el remitente es un usuario de ejemplo (u1…), no el uid de la sesión anónima.
  await assertSucceeds(setDoc(doc(authed("visitante"), `${DM("cl_demo")}/dmDemo`), directo({ id: "dmDemo", cid: "cl_demo", de: "u1", a: "u2" })));
  await assertFails(setDoc(doc(anon(), `${DM("cl_demo")}/dmDemo2`), directo({ id: "dmDemo2", cid: "cl_demo", de: "u1", a: "u2" })));
});

/* ══ DOCUMENTOS CLÍNICOS (clinicalDocs) ══════════════════════════════════════════════
 * Los edita quien gestiona formularios (admin, caja, recepción) o escribe la ficha (dentista).
 * El asistente lee y no escribe. Nadie los borra desde el cliente: se anulan. Con la
 * suscripción vencida se lee y no se escribe. El aislamiento entre clínicas lo barre la lista
 * COLECCIONES_DE_CLINICA de arriba. */
test("documentos clínicos: admin, caja, recepción y dentista escriben; el asistente no", async () => {
  for (const uid of ["adminA", "cajaA", "recepA", "dentA"]) {
    await assertSucceeds(setDoc(doc(authed(uid), `clinics/clA/clinicalDocs/cd_${uid}`), { id: `cd_${uid}`, patientId: "pEmr", estado: "pendiente" }));
    await assertSucceeds(setDoc(doc(authed(uid), `clinics/clA/clinicalDocs/cd_${uid}`), { estado: "completado" }, { merge: true }));
  }
  await assertFails(setDoc(doc(authed("asisA"), "clinics/clA/clinicalDocs/cd_asis"), { id: "cd_asis", patientId: "pEmr", estado: "pendiente" }));
  await assertFails(setDoc(doc(authed("asisA"), "clinics/clA/clinicalDocs/cdSeed"), { estado: "anulado" }, { merge: true }));
});

test("documentos clínicos: todos los miembros leen, y un desconocido no", async () => {
  for (const uid of ["adminA", "cajaA", "recepA", "dentA", "asisA"]) {
    await assertSucceeds(getDoc(doc(authed(uid), "clinics/clA/clinicalDocs/cdSeed")));
  }
  await assertFails(getDoc(doc(anon(), "clinics/clA/clinicalDocs/cdSeed")));
  await assertFails(getDoc(doc(authed("adminB"), "clinics/clA/clinicalDocs/cdSeed")));
});

test("documentos clínicos: no se borran desde el cliente, ni el admin", async () => {
  for (const uid of ["adminA", "recepA", "dentA", "asisA"]) {
    await assertFails(deleteDoc(doc(authed(uid), "clinics/clA/clinicalDocs/cdSeed")));
  }
});

test("documentos clínicos: con la suscripción vencida se lee y no se escribe", async () => {
  await assertSucceeds(getDoc(doc(authed("adminV"), "clinics/clV/clinicalDocs/cdV")));
  await assertFails(setDoc(doc(authed("adminV"), "clinics/clV/clinicalDocs/cdV2"), { id: "cdV2", patientId: "pv", estado: "pendiente" }));
  await assertFails(setDoc(doc(authed("dentV"), "clinics/clV/clinicalDocs/cdV"), { estado: "completado" }, { merge: true }));
});

test("documentos clínicos: la demo es abierta para quien tiene sesión", async () => {
  await assertSucceeds(setDoc(doc(authed("cualquiera"), "clinics/cl_demo/clinicalDocs/cd_demo_x"), { id: "cd_demo_x", patientId: "p1", estado: "pendiente" }));
  await assertSucceeds(deleteDoc(doc(authed("cualquiera"), "clinics/cl_demo/clinicalDocs/cd_demo_x")));
});

/* ══ RUTINA DEL ADMINISTRADOR (routineChecks) ════════════════════════════════════════
 * Un documento por casillero tildado (`${paso}__${periodo}`). Lo tilda y lo destilda solo el
 * administrador; todos los miembros leen. Con la suscripción vencida se lee y no se escribe. El
 * aislamiento entre clínicas lo barre la lista COLECCIONES_DE_CLINICA de arriba. */
const RC = (cid, id) => `clinics/${cid}/routineChecks/${id}`;
const casillero = (id, extra = {}) => ({ id, paso: id.split("__")[0], periodo: id.split("__")[1], hechoPor: "adminA", hechoPorNombre: "Admin A", hechoEn: "2026-10-07T12:00:00.000Z", ...extra });

test("rutina del administrador: el admin tilda, cambia y destilda", async () => {
  await assertSucceeds(setDoc(doc(authed("adminA"), RC("clA", "cobrado__2026-10-07")), casillero("cobrado__2026-10-07")));
  await assertSucceeds(setDoc(doc(authed("adminA"), RC("clA", "cobrado__2026-10-07")), { hechoPorNombre: "Otro" }, { merge: true }));
  await assertSucceeds(deleteDoc(doc(authed("adminA"), RC("clA", "cobrado__2026-10-07"))));
});

test("rutina del administrador: caja, recepción, dentista y asistente no escriben ni destildan", async () => {
  for (const uid of ["cajaA", "recepA", "dentA", "asisA"]) {
    await assertFails(setDoc(doc(authed(uid), RC("clA", `deudores__${uid}`)), casillero(`deudores__${uid}`)));
    await assertFails(setDoc(doc(authed(uid), RC("clA", "caja__2026-10-01")), { hechoPorNombre: "Pisado" }, { merge: true }));
    await assertFails(deleteDoc(doc(authed(uid), RC("clA", "caja__2026-10-01"))));
  }
});

test("rutina del administrador: todos los miembros leen, y un desconocido o de otra clínica no", async () => {
  for (const uid of ["adminA", "cajaA", "recepA", "dentA", "asisA"]) {
    await assertSucceeds(getDoc(doc(authed(uid), RC("clA", "caja__2026-10-01"))));
  }
  await assertFails(getDoc(doc(anon(), RC("clA", "caja__2026-10-01"))));
  await assertFails(getDoc(doc(authed("adminB"), RC("clA", "caja__2026-10-01"))));
});

test("rutina del administrador: el admin de otra clínica no escribe en la mía", async () => {
  await assertFails(setDoc(doc(authed("adminB"), RC("clA", "caja__2026-10-08")), casillero("caja__2026-10-08")));
});

test("rutina del administrador: con la suscripción vencida se lee y no se escribe", async () => {
  await assertSucceeds(getDoc(doc(authed("adminV"), RC("clV", "caja__2026-10-01"))));
  await assertFails(setDoc(doc(authed("adminV"), RC("clV", "caja__2026-10-02")), casillero("caja__2026-10-02")));
  await assertFails(deleteDoc(doc(authed("adminV"), RC("clV", "caja__2026-10-01"))));
});

test("rutina del administrador: la demo es abierta para quien tiene sesión, no para un anónimo sin sesión", async () => {
  await assertSucceeds(setDoc(doc(authed("cualquiera"), RC("cl_demo", "caja__2026-10-07")), casillero("caja__2026-10-07")));
  await assertSucceeds(deleteDoc(doc(authed("cualquiera"), RC("cl_demo", "caja__2026-10-07"))));
  await assertFails(setDoc(doc(anon(), RC("cl_demo", "caja__2026-10-08")), casillero("caja__2026-10-08")));
});

/* ===== PERMISOS DEL EQUIPO (config.permisos) =====
 * La clínica guarda en clinics/{cid}.config.permisos[rol] = { dar: [...], quitar: [...] }: la diferencia contra la matriz de
 * fábrica (lib/rbac.ts). Las reglas la aplican en los cinco puntos que hacen cumplir la matriz: cobrar (payments.manage),
 * documentos y firmas (engagement.forms), la ficha clínica (emr.write), los gastos (expenses.manage) y las liquidaciones
 * (billing.reports). `tienePermiso()` tiene que dar lo mismo que `permisoEfectivo()` del cliente.
 *
 * Clínica P: caja pierde cobrar y gana gastos · recepción gana cobrar y pierde documentos · dentista gana documentos y pierde la
 * ficha · asistente gana la ficha y las liquidaciones (y trae escritos, sin efecto, practice.config y users.manage) · el admin trae
 * escrito que se le saca todo (sin efecto). */
const EQ = (cid, ruta) => `clinics/${cid}/${ruta}`;
const pagoEq = (id) => ({ id, amount: 1000, patientId: "pEq" });
const fiscalEq = (id) => ({ id, kind: "boleta", number: "001-001-0000009", amount: 1000 });
const cajaEq = (id) => ({ id, userId: "x", userName: "x", status: "abierta", openingBalance: 0 });
const firmaEq = (id) => ({ id, patientId: "pEq", status: "pendiente" });
const docEq = (id) => ({ id, patientId: "pEq", estado: "pendiente", nombre: "Historia Clínica" });
const radioEq = (id) => ({ id, patientId: "pEq", image: "data:image/jpeg;base64,AAA", findings: [] });

test("permisos del equipo — cobrar: lo gana la recepción y lo pierde la caja", async () => {
  // recepP gana payments.manage
  await assertSucceeds(setDoc(doc(authed("recepP"), EQ("clP", "payments/payR")), pagoEq("payR")));
  await assertSucceeds(setDoc(doc(authed("recepP"), EQ("clP", "fiscalDocs/fdR")), fiscalEq("fdR")));
  await assertSucceeds(setDoc(doc(authed("recepP"), EQ("clP", "cashSessions/csR")), cajaEq("csR")));
  // cajaP pierde payments.manage
  await assertFails(setDoc(doc(authed("cajaP"), EQ("clP", "payments/payC")), pagoEq("payC")));
  await assertFails(setDoc(doc(authed("cajaP"), EQ("clP", "fiscalDocs/fdC")), fiscalEq("fdC")));
  await assertFails(setDoc(doc(authed("cajaP"), EQ("clP", "cashSessions/csC")), cajaEq("csC")));
  // lo que no tocó la clínica sigue como de fábrica: el dentista y la asistente no cobran
  await assertFails(setDoc(doc(authed("dentP"), EQ("clP", "payments/payD")), pagoEq("payD")));
  await assertFails(setDoc(doc(authed("asisP"), EQ("clP", "payments/payS")), pagoEq("payS")));
});

test("permisos del equipo — documentos y firmas: lo gana el dentista y lo pierde la recepción", async () => {
  await assertSucceeds(setDoc(doc(authed("dentP"), EQ("clP", "signatures/sigD")), firmaEq("sigD")));
  await assertFails(setDoc(doc(authed("recepP"), EQ("clP", "signatures/sigR")), firmaEq("sigR")));
  // la recepción sin documentos tampoco escribe los documentos clínicos (no tiene ni documentos ni ficha)
  await assertFails(setDoc(doc(authed("recepP"), EQ("clP", "clinicalDocs/cdR")), docEq("cdR")));
  // el dentista sigue pudiendo con los documentos clínicos, ahora por documentos y no por la ficha
  await assertSucceeds(setDoc(doc(authed("dentP"), EQ("clP", "clinicalDocs/cdD")), docEq("cdD")));
  // la caja no se tocó: conserva documentos y firmas
  await assertSucceeds(setDoc(doc(authed("cajaP"), EQ("clP", "signatures/sigC")), firmaEq("sigC")));
});

test("permisos del equipo — ficha clínica: la gana la asistente y la pierde el dentista", async () => {
  await assertSucceeds(updateDoc(doc(authed("asisP"), EQ("clP", "patients/pEq")), { odontogram: { "11": { state: "caries" } } }));
  await assertSucceeds(setDoc(doc(authed("asisP"), EQ("clP", "radiographs/rxS")), radioEq("rxS")));
  await assertSucceeds(setDoc(doc(authed("asisP"), EQ("clP", "clinicalDocs/cdS")), docEq("cdS")));
  await assertFails(updateDoc(doc(authed("dentP"), EQ("clP", "patients/pEq")), { odontogram: { "12": { state: "caries" } } }));
  await assertFails(setDoc(doc(authed("dentP"), EQ("clP", "radiographs/rxD")), radioEq("rxD")));
  // pero la demografía la sigue editando cualquier miembro, y ganar la ficha no da las firmas
  await assertSucceeds(updateDoc(doc(authed("dentP"), EQ("clP", "patients/pEq")), { phone: "0991" }));
  await assertFails(setDoc(doc(authed("asisP"), EQ("clP", "signatures/sigS")), firmaEq("sigS")));
});

test("permisos del equipo — gastos: los gana la caja, y nadie más los lee", async () => {
  await assertSucceeds(getDoc(doc(authed("cajaP"), EQ("clP", "expenses/expEq"))));
  await assertSucceeds(getDocs(collection(authed("cajaP"), EQ("clP", "expenses"))));
  await assertSucceeds(setDoc(doc(authed("cajaP"), EQ("clP", "expenses/expC")), { id: "expC", amount: 10 }));
  for (const uid of ["recepP", "dentP", "asisP"]) {
    await assertFails(getDoc(doc(authed(uid), EQ("clP", "expenses/expEq"))));
    await assertFails(getDocs(collection(authed(uid), EQ("clP", "expenses"))));
    await assertFails(setDoc(doc(authed(uid), EQ("clP", `expenses/exp${uid}`)), { id: `exp${uid}`, amount: 10 }));
  }
});

test("permisos del equipo — liquidaciones: las gana la asistente, y nadie más las lee", async () => {
  await assertSucceeds(getDoc(doc(authed("asisP"), EQ("clP", "settlements/liqEq"))));
  await assertSucceeds(getDocs(collection(authed("asisP"), EQ("clP", "settlements"))));
  await assertSucceeds(setDoc(doc(authed("asisP"), EQ("clP", "settlements/liqS")), { id: "liqS", dentistId: "dentP", total: 1 }));
  for (const uid of ["cajaP", "recepP", "dentP"]) {
    await assertFails(getDoc(doc(authed(uid), EQ("clP", "settlements/liqEq"))));
    await assertFails(getDocs(collection(authed(uid), EQ("clP", "settlements"))));
    await assertFails(setDoc(doc(authed(uid), EQ("clP", `settlements/liq${uid}`)), { id: `liq${uid}`, total: 1 }));
  }
});

test("permisos del equipo — al administrador no se le saca nada, ni escribiéndolo a mano en la configuración", async () => {
  await assertSucceeds(setDoc(doc(authed("adminP"), EQ("clP", "payments/payA")), pagoEq("payA")));
  await assertSucceeds(updateDoc(doc(authed("adminP"), EQ("clP", "patients/pEq")), { emr: [{ note: "control" }] }));
  await assertSucceeds(setDoc(doc(authed("adminP"), EQ("clP", "signatures/sigA")), firmaEq("sigA")));
  await assertSucceeds(getDoc(doc(authed("adminP"), EQ("clP", "expenses/expEq"))));
  await assertSucceeds(getDoc(doc(authed("adminP"), EQ("clP", "settlements/liqEq"))));
});

test("permisos del equipo — crear usuarios y configurar la clínica no se reparten, aunque estén escritos", async () => {
  // asisP trae practice.config y users.manage en dar: las reglas de esas cosas siguen siendo solo del administrador
  await assertFails(setDoc(doc(authed("asisP"), EQ("clP", "procedures/D9999")), { cpt: "D9999", description: "x", price: 1 }));
  await assertFails(setDoc(doc(authed("asisP"), EQ("clP", "users/nuevoP")), { id: "nuevoP", role: "admin", active: true, clinicId: "clP" }));
  await assertFails(setDoc(doc(authed("asisP"), EQ("clP", "routineChecks/caja__2026-10-08")), { id: "caja__2026-10-08", paso: "caja", periodo: "2026-10-08" }));
  await assertFails(updateDoc(doc(authed("asisP"), "clinics/clP"), { name: "Renombrada por la asistente" }));
});

test("permisos del equipo — nadie se da permisos a sí mismo: solo el administrador escribe config.permisos", async () => {
  for (const uid of ["cajaP", "recepP", "dentP", "asisP"]) {
    await assertFails(updateDoc(doc(authed(uid), "clinics/clP"), { "config.permisos": { [uid]: { dar: ["payments.manage"] } } }));
    await assertFails(setDoc(doc(authed(uid), "clinics/clP"), { config: { permisos: {} } }, { merge: true }));
  }
});

test("permisos del equipo — los ajustes de una clínica no valen en otra", async () => {
  // recepP cobra en la clínica P, pero la recepción de la clínica A no (A no repartió nada)
  await assertSucceeds(setDoc(doc(authed("recepP"), EQ("clP", "payments/payR2")), pagoEq("payR2")));
  await assertFails(setDoc(doc(authed("recepA"), EQ("clA", "payments/payR3")), pagoEq("payR3")));
  await assertFails(setDoc(doc(authed("recepP"), EQ("clA", "payments/payR4")), pagoEq("payR4")));
});

test("permisos del equipo — sin ajustes (clínica sin config.permisos) rige la matriz de fábrica", async () => {
  await assertSucceeds(setDoc(doc(authed("cajaM"), EQ("clM", "payments/payC")), pagoEq("payC")));
  await assertSucceeds(setDoc(doc(authed("recepM"), EQ("clM", "signatures/sigR")), firmaEq("sigR")));
  await assertSucceeds(updateDoc(doc(authed("dentM"), EQ("clM", "patients/pEq")), { odontogram: { "11": { state: "caries" } } }));
  await assertFails(setDoc(doc(authed("recepM"), EQ("clM", "payments/payR")), pagoEq("payR")));
  await assertFails(setDoc(doc(authed("dentM"), EQ("clM", "signatures/sigD")), firmaEq("sigD")));
  await assertFails(updateDoc(doc(authed("asisM"), EQ("clM", "patients/pEq")), { odontogram: { "12": { state: "caries" } } }));
  await assertFails(getDoc(doc(authed("cajaM"), EQ("clM", "expenses/expEq"))));
  await assertFails(getDoc(doc(authed("cajaM"), EQ("clM", "settlements/liqEq"))));
});

test("permisos del equipo — dar y quitar a la vez: gana dar; listas mal formadas se ignoran y rige la fábrica", async () => {
  // clínica Q
  await assertSucceeds(setDoc(doc(authed("recepQ"), EQ("clQ", "payments/payR")), pagoEq("payR"))); // dar gana a quitar
  await assertFails(setDoc(doc(authed("recepQ"), EQ("clQ", "signatures/sigR")), firmaEq("sigR"))); // quitar documentos sí rige
  await assertSucceeds(setDoc(doc(authed("cajaQ"), EQ("clQ", "payments/payC")), pagoEq("payC"))); // «basura» en vez de un mapa: fábrica
  await assertSucceeds(updateDoc(doc(authed("dentQ"), EQ("clQ", "patients/pEq")), { odontogram: { "11": { state: "caries" } } })); // listas que no son listas: fábrica
  await assertFails(updateDoc(doc(authed("asisQ"), EQ("clQ", "patients/pEq")), { odontogram: { "12": { state: "caries" } } }));
});

test("permisos del equipo — el cambio rige en el acto, al darlo y al sacarlo", async () => {
  // clínica M arranca de fábrica: la recepción no cobra y la caja sí
  await assertFails(setDoc(doc(authed("recepM"), EQ("clM", "payments/payR1")), pagoEq("payR1")));
  await assertSucceeds(setDoc(doc(authed("cajaM"), EQ("clM", "payments/payC1")), pagoEq("payC1")));
  // el administrador reparte y saca
  await assertSucceeds(updateDoc(doc(authed("adminM"), "clinics/clM"), {
    "config.permisos": {
      cashier: { dar: [], quitar: ["payments.manage"] },
      receptionist: { dar: ["payments.manage"], quitar: [] },
      dentist: { dar: [], quitar: [] },
      assistant: { dar: [], quitar: [] },
    },
  }));
  await assertSucceeds(setDoc(doc(authed("recepM"), EQ("clM", "payments/payR2")), pagoEq("payR2")));
  await assertFails(setDoc(doc(authed("cajaM"), EQ("clM", "payments/payC2")), pagoEq("payC2")));
  // y vuelve a la fábrica escribiendo las listas vacías (así lo guarda la pantalla)
  await assertSucceeds(updateDoc(doc(authed("adminM"), "clinics/clM"), {
    "config.permisos": {
      cashier: { dar: [], quitar: [] }, receptionist: { dar: [], quitar: [] },
      dentist: { dar: [], quitar: [] }, assistant: { dar: [], quitar: [] },
    },
  }));
  await assertFails(setDoc(doc(authed("recepM"), EQ("clM", "payments/payR3")), pagoEq("payR3")));
  await assertSucceeds(setDoc(doc(authed("cajaM"), EQ("clM", "payments/payC3")), pagoEq("payC3")));
});

test("permisos del equipo — con la suscripción vencida se lee y no se escribe, aunque se haya repartido el permiso", async () => {
  // clínica W (past_due): recepW tiene payments.manage repartido, pero el cobro manda
  await assertFails(setDoc(doc(authed("recepW"), EQ("clW", "payments/payR")), pagoEq("payR")));
  await assertSucceeds(getDoc(doc(authed("recepW"), EQ("clW", "patients/pEq"))));
});

/* ===== COMERCIAL y ROLES PROPIOS =====
 * «Comercial» es un rol de fábrica más: agenda, datos del paciente, presupuestos y CRM; documentos y firmas sí (engagement.forms), cobrar,
 * ficha clínica, gastos y liquidaciones no. Un rol propio (id «rp_…») no tiene nada de fábrica: lo que puede es su lista `dar`. */

test("Comercial — firma y arma documentos clínicos (engagement.forms) pero no cobra ni toca la ficha, ni ve gastos ni liquidaciones", async () => {
  await assertSucceeds(setDoc(doc(authed("comR"), EQ("clR", "signatures/sigCom")), firmaEq("sigCom")));
  await assertSucceeds(setDoc(doc(authed("comR"), EQ("clR", "clinicalDocs/cdCom")), docEq("cdCom")));
  await assertFails(setDoc(doc(authed("comR"), EQ("clR", "payments/payCom")), pagoEq("payCom")));
  await assertFails(setDoc(doc(authed("comR"), EQ("clR", "fiscalDocs/fdCom")), fiscalEq("fdCom")));
  await assertFails(updateDoc(doc(authed("comR"), EQ("clR", "patients/pEq")), { odontogram: { "11": { state: "caries" } } }));
  await assertFails(getDoc(doc(authed("comR"), EQ("clR", "expenses/expEq"))));
  await assertFails(getDoc(doc(authed("comR"), EQ("clR", "settlements/liqEq"))));
  // lo demás de un miembro sí: lee pacientes y edita la demografía
  await assertSucceeds(getDoc(doc(authed("comR"), EQ("clR", "patients/pEq"))));
  await assertSucceeds(updateDoc(doc(authed("comR"), EQ("clR", "patients/pEq")), { phone: "0985" }));
});

test("roles propios — un rol propio puede lo que la clínica le dio en «dar» y nada más", async () => {
  await assertSucceeds(setDoc(doc(authed("propR"), EQ("clR", "payments/payProp")), pagoEq("payProp")));
  await assertSucceeds(setDoc(doc(authed("propR"), EQ("clR", "cashSessions/csProp")), cajaEq("csProp")));
  await assertSucceeds(getDoc(doc(authed("propR"), EQ("clR", "expenses/expEq"))));
  await assertSucceeds(setDoc(doc(authed("propR"), EQ("clR", "expenses/expProp")), { id: "expProp", amount: 5 }));
  // lo que no se le dio: nada, ni siquiera lo que tienen todos los roles de fábrica
  await assertFails(setDoc(doc(authed("propR"), EQ("clR", "signatures/sigProp")), firmaEq("sigProp")));
  await assertFails(setDoc(doc(authed("propR"), EQ("clR", "clinicalDocs/cdProp")), docEq("cdProp")));
  await assertFails(updateDoc(doc(authed("propR"), EQ("clR", "patients/pEq")), { odontogram: { "12": { state: "caries" } } }));
  await assertFails(getDoc(doc(authed("propR"), EQ("clR", "settlements/liqEq"))));
});

test("roles propios — sin entrada en config.permisos, o con una vacía, o con un id que no existe: no puede nada, pero sigue siendo miembro", async () => {
  for (const uid of ["vacioR", "huerfanoR", "rarR", "protoR"]) {
    await assertFails(setDoc(doc(authed(uid), EQ("clR", `payments/pay${uid}`)), pagoEq(`pay${uid}`)));
    await assertFails(setDoc(doc(authed(uid), EQ("clR", `signatures/sig${uid}`)), firmaEq(`sig${uid}`)));
    await assertFails(getDoc(doc(authed(uid), EQ("clR", "expenses/expEq"))));
    await assertFails(updateDoc(doc(authed(uid), EQ("clR", "patients/pEq")), { odontogram: { "13": { state: "caries" } } }));
    await assertSucceeds(getDoc(doc(authed(uid), EQ("clR", "patients/pEq"))));
  }
});

test("roles propios — quien tiene un rol propio no puede darse permisos ni cambiarse el rol (solo el administrador escribe)", async () => {
  await assertFails(updateDoc(doc(authed("propR"), "clinics/clR"), { "config.permisos.rp_ab12cd34": { dar: ["payments.manage", "emr.write"] } }));
  await assertFails(updateDoc(doc(authed("propR"), "clinics/clR"), { "config.rolesPropios": [{ id: "rp_ab12cd34", nombre: "Dueño" }] }));
  await assertFails(updateDoc(doc(authed("propR"), "clinics/clR/users/propR"), { role: "admin" }));
  await assertFails(setDoc(doc(authed("propR"), "clinics/clR/users/propR"), { role: "admin" }, { merge: true }));
});

test("roles propios — el administrador sí crea un rol, se lo asigna a alguien y el cambio rige en el acto", async () => {
  await assertFails(setDoc(doc(authed("vacioR"), EQ("clR", "payments/payAntes")), pagoEq("payAntes")));
  await assertSucceeds(updateDoc(doc(authed("adminR"), "clinics/clR"), {
    "config.rolesPropios": [{ id: "rp_ab12cd34", nombre: "Contador" }, { id: "rp_nuevo0001", nombre: "Cobranzas" }],
    "config.permisos.rp_nuevo0001": { dar: ["payments.manage", "money.view"], quitar: [] },
  }));
  await assertSucceeds(updateDoc(doc(authed("adminR"), "clinics/clR/users/vacioR"), { role: "rp_nuevo0001" }));
  await assertSucceeds(setDoc(doc(authed("vacioR"), EQ("clR", "payments/payDespues")), pagoEq("payDespues")));
  // y al sacarle el rol, lo pierde
  await assertSucceeds(updateDoc(doc(authed("adminR"), "clinics/clR/users/vacioR"), { role: "rp_sinentrada" }));
  await assertFails(setDoc(doc(authed("vacioR"), EQ("clR", "payments/payOtraVez")), pagoEq("payOtraVez")));
});
