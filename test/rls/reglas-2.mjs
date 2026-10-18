/**
 * Auditoría de cobro y de escalada de privilegios dentro de una misma clínica (originales: «AUDITORÍA DE COBRO (ago-2026)» y
 * «AUDITORÍA — escalada de privilegios DENTRO de una misma clínica»). Los AGUJERO / VULN / PENDIENTE fijan el comportamiento
 * ACTUAL de Firestore, no el deseado: se transcriben igual para que Postgres lo reproduzca (la migración no cambia las reglas).
 */
import assert from "node:assert/strict";
import { authed, caso, deleteDoc, denegado, getDoc, permitido, sembrarRuta, setDoc, updateDoc } from "./compat.mjs";

caso("SUSCRIPCIÓN: un admin NO puede BORRAR su suscripción (volvería al grandfathering)", async () => {
  await denegado("adminA borra subscriptions/clA", deleteDoc(authed("adminA"), "subscriptions/clA"));
});

caso("CERRADO · el plan Solo ya no escribe `outbox` (WhatsApp lo paga el dueño del SaaS)", async () => {
  await denegado("adminS outbox", setDoc(authed("adminS"), "clinics/clS/outbox/o1", { id: "o1", kind: "whatsapp", status: "pendiente" }));
  await permitido("adminA outbox", setDoc(authed("adminA"), "clinics/clA/outbox/o1", { id: "o1", kind: "whatsapp", status: "pendiente" }));
});

caso("CERRADO · el plan Solo ya no escribe `cashSessions` (feature `caja` = Clínica+)", async () => {
  await denegado("adminS cashSessions", setDoc(authed("adminS"), "clinics/clS/cashSessions/cs1", { id: "cs1", status: "abierta" }));
  await permitido("adminA cashSessions", setDoc(authed("adminA"), "clinics/clA/cashSessions/csNueva", { id: "csNueva", status: "abierta" }));
});

caso("VULN(CRÍTICO): una suscripción 'active' SIN currentPeriodEndMs escribe sin límite de tiempo", async () => {
  // Es el estado en el que queda el doc después del bug del webhook: sin fecha, subActive() se reduce a mirar el status.
  await sembrarRuta("clinics/clZ", { id: "clZ", name: "Z", plan: "cadena" });
  await sembrarRuta("clinics/clZ/users/adminZ", { id: "adminZ", role: "admin", active: true, clinicId: "clZ", email: "admin@z.com" });
  await sembrarRuta("subscriptions/clZ", { clinicId: "clZ", plan: "cadena", status: "active", provider: "lemonsqueezy", lsSubscriptionId: "sub_777" });
  // CORRECTO SERÍA: denegado (la suscripción real está cancelada). Se reproduce el comportamiento actual.
  await permitido("adminZ escribe pacientes", setDoc(authed("adminZ"), "clinics/clZ/patients/p1", { id: "p1" }));
  await permitido("adminZ escribe crmCards (premium de Cadena)", setDoc(authed("adminZ"), "clinics/clZ/crmCards/c1", { id: "c1" }));
});

caso("NEGOCIO: el dentista tampoco lee los gastos", async () => {
  await denegado("dentA lee expenses", getDoc(authed("dentA"), "clinics/clA/expenses/exp1"));
});

caso("NEGOCIO: el admin SÍ lee y escribe los gastos", async () => {
  await permitido("adminA lee", getDoc(authed("adminA"), "clinics/clA/expenses/exp1"));
  await permitido("adminA escribe", setDoc(authed("adminA"), "clinics/clA/expenses/expNuevo", { id: "expNuevo", amount: 1 }));
});

caso("NEGOCIO: la recepción ya NO escribe gastos (antes podía, era isStaff)", async () => {
  await denegado("asisA escribe expenses", setDoc(authed("asisA"), "clinics/clA/expenses/expX", { id: "expX", amount: 1 }));
});

caso("SALARIOS: nadie salvo el admin lee las liquidaciones", async () => {
  await denegado("asisA lee settlements", getDoc(authed("asisA"), "clinics/clA/settlements/liq1"));
  await denegado("dentA lee settlements", getDoc(authed("dentA"), "clinics/clA/settlements/liq1"));
  await permitido("adminA lee settlements", getDoc(authed("adminA"), "clinics/clA/settlements/liq1"));
});

caso("OPERACIÓN INTACTA: «Recepción y caja» sigue cobrando y viendo pagos", async () => {
  await permitido("cajaA lee payments", getDoc(authed("cajaA"), "clinics/clA/payments/pay1"));
  await permitido("cajaA escribe payments", setDoc(authed("cajaA"), "clinics/clA/payments/payNuevo", { id: "payNuevo", amount: 50000 }));
});

/* ---- CRÍTICO · LECTURA: sueldos y comisiones del equipo ---- */

caso("AGUJERO (LECTURA) · cualquier empleado lee commissionPct/salaryBase de sus compañeros", async () => {
  // `settlements` está cerrado al admin porque es dato salarial, pero los MISMOS números viven en users, que lee todo miembro.
  const snapAsis = await permitido("asisA lee el usuario de dentA", getDoc(authed("asisA"), "clinics/clA/users/dentA"));
  assert.equal(snapAsis.data.commissionPct, 25);    // ← la recepción ve la comisión del doctor
  assert.equal(snapAsis.data.salaryBase, 2000000);  // ← y su sueldo base
  const snapDent = await permitido("dentA lee el usuario de asisA", getDoc(authed("dentA"), "clinics/clA/users/asisA"));
  assert.equal(snapDent.data.role, "assistant");
});

/* ---- CRÍTICO · ESCRITURA: evadir el blindaje EMR borrando el paciente ---- */

caso("CERRADO · el ASISTENTE ya no evade el blindaje EMR con borrar+recrear", async () => {
  await permitido("asisA lee la ficha", getDoc(authed("asisA"), "clinics/clA/patients/pEmr"));
  await denegado("asisA fabrica la evolución", updateDoc(authed("asisA"), "clinics/clA/patients/pEmr", { emr: [{ note: "FORJADO" }] }));
  await denegado("asisA borra la ficha", deleteDoc(authed("asisA"), "clinics/clA/patients/pEmr"));
  // El admin sí puede borrar (fusión de fichas), que es el único caso real de la UI.
  await permitido("adminA borra un duplicado", deleteDoc(authed("adminA"), "clinics/clA/patients/pBorrable"));
});

caso("CERRADO · el ASISTENTE no crea pacientes con odontograma/EMR fabricado, pero sí carga uno normal", async () => {
  await denegado("asisA crea un paciente con odontograma y EMR", setDoc(authed("asisA"), "clinics/clA/patients/pFake", {
    id: "pFake", firstName: "Fabricado",
    odontogram: { teeth: { 21: "caries" } },
    emr: [{ id: "e", note: "diagnóstico inventado por alguien sin emr.write" }],
  }));
  /* La recepción TIENE que poder dar de alta un paciente: es su trabajo. Lo que no puede es traer campos clínicos en el alta. */
  await permitido("recepA da de alta un paciente", setDoc(authed("recepA"), "clinics/clA/patients/pRecepcion", {
    id: "pRecepcion", firstName: "Alta", lastName: "de mostrador", phone: "0981",
  }));
});

/* ---- ALTO · ESCRITURA: radiografías (EMR por imagen) ---- */

caso("CERRADO · el ASISTENTE ya no escribe ni borra radiografías; el dentista sí", async () => {
  await denegado("asisA escribe una radiografía", setDoc(authed("asisA"), "clinics/clA/radiographs/rxFake", { id: "rxFake", patientId: "pEmr", findings: ["hallazgo inventado"] }));
  await denegado("asisA borra una radiografía", deleteDoc(authed("asisA"), "clinics/clA/radiographs/rx1"));
  await permitido("dentA escribe una radiografía", setDoc(authed("dentA"), "clinics/clA/radiographs/rxOk", { id: "rxOk", patientId: "pEmr", findings: ["caries 26"] }));
});

/* ---- ALTO · ESCRITURA: consentimientos firmados ---- */

caso("CERRADO · el DENTISTA no escribe consentimientos y NADIE los borra", async () => {
  await denegado("dentA escribe una firma", setDoc(authed("dentA"), "clinics/clA/signatures/sigFake", { id: "sigFake", patientId: "pEmr" }));
  /* Una firma emitida es prueba legal: el borrado se cierra para todos los roles, admin incluido. */
  await denegado("asisA borra una firma", deleteDoc(authed("asisA"), "clinics/clA/signatures/sig1"));
  await denegado("adminA borra una firma", deleteDoc(authed("adminA"), "clinics/clA/signatures/sig1"));
  await permitido("recepA escribe una firma", setDoc(authed("recepA"), "clinics/clA/signatures/sigOk", { id: "sigOk", patientId: "pEmr" }));
});

/* ---- ALTO · ESCRITURA: caja / arqueo (payments.manage) ---- */

caso("CERRADO · el DENTISTA ya no abre caja ni cierra el arqueo ajeno", async () => {
  await denegado("dentA abre una caja", setDoc(authed("dentA"), "clinics/clA/cashSessions/csFake", { id: "csFake", userId: "dentA", status: "abierta", openingBalance: 0 }));
  await denegado("dentA cierra el arqueo ajeno", updateDoc(authed("dentA"), "clinics/clA/cashSessions/cs1", { status: "cerrada", countedCash: 0, note: "arqueo forjado" }));
  // La recepción, que es quien hace el arqueo, sigue pudiendo.
  await permitido("cajaA cierra el arqueo", updateDoc(authed("cajaA"), "clinics/clA/cashSessions/cs1", { status: "cerrada", countedCash: 200000 }));
});

/* ---- ALTO · ESCRITURA: documentos fiscales (boletas / devoluciones) ---- */

caso("CERRADO · el DENTISTA ya no emite devoluciones ni borra boletas", async () => {
  await denegado("dentA emite una devolución", setDoc(authed("dentA"), "clinics/clA/fiscalDocs/fdFake", { id: "fdFake", kind: "devolucion", amount: 5000000, patientId: "pEmr" }));
  await denegado("dentA borra una boleta", deleteDoc(authed("dentA"), "clinics/clA/fiscalDocs/fd1"));
  // El staff emite; solo el admin puede borrar un documento fiscal.
  await permitido("cajaA emite una boleta", setDoc(authed("cajaA"), "clinics/clA/fiscalDocs/fdOk", { id: "fdOk", kind: "boleta", amount: 500000 }));
  await permitido("adminA borra una boleta", deleteDoc(authed("adminA"), "clinics/clA/fiscalDocs/fd1"));
});

/* ---- MEDIO · ESCRITURA: billing submit / finalize ---- */

caso("PENDIENTE · billing sigue sin distinguir submit de finalize", async () => {
  await permitido("dentA escribe billing", setDoc(authed("dentA"), "clinics/clA/billing/bilFake", { id: "bilFake", status: "hold" }));
  await permitido("asisA finaliza billing", updateDoc(authed("asisA"), "clinics/clA/billing/bil1", { status: "finalizada" }));
});

/* ---- MEDIO · ESCRITURA: catálogo de prestaciones y config (practice.config) ---- */

caso("CERRADO · un no-admin ya no cambia los precios del catálogo", async () => {
  await denegado("asisA cambia un precio", updateDoc(authed("asisA"), "clinics/clA/procedures/D0120", { price: 1 }));
  await denegado("dentA borra una prestación", deleteDoc(authed("dentA"), "clinics/clA/procedures/D0120"));
  await permitido("adminA cambia un precio", updateDoc(authed("adminA"), "clinics/clA/procedures/D0120", { price: 160000 }));
});

caso("PENDIENTE · un no-admin todavía escribe config de la práctica (boxes/branches/surveys/eduVideos)", async () => {
  await permitido("dentA escribe boxes", setDoc(authed("dentA"), "clinics/clA/boxes/bxFake", { id: "bxFake" }));
  await permitido("dentA escribe branches", setDoc(authed("dentA"), "clinics/clA/branches/brFake", { id: "brFake" }));
});

/* ---- MEDIO · ESCRITURA: inventario (inventory.manage) ---- */

caso("AGUJERO (ESCRITURA) · el DENTISTA escribe stock/stockMoves (UI: inventory.manage)", async () => {
  await permitido("dentA escribe stock", setDoc(authed("dentA"), "clinics/clA/stock/stFake", { id: "stFake", qty: 999 }));
  await permitido("dentA escribe stockMoves", setDoc(authed("dentA"), "clinics/clA/stockMoves/smFake", { id: "smFake", delta: -50 }));
});

/* ---- MEDIO · el límite de usuarios del plan es solo del cliente ---- */

caso("AGUJERO · una clínica del plan Solo crea usuarios sin tope (planUserLimitError es del cliente)", async () => {
  for (let i = 0; i < 12; i++) {
    await permitido(`adminS crea el usuario extra${i}`, setDoc(authed("adminS"), `clinics/clS/users/extra${i}`,
      { id: `extra${i}`, role: "dentist", active: true, clinicId: "clS", email: `e${i}@s.com` }));
  }
});

/* ---- CONTROLES: escaladas que YA están cerradas (deben seguir fallando) ---- */

caso("CONTROL: siguen cerradas las escaladas de rol, dinero y salarios", async () => {
  await denegado("auto-ascenso", updateDoc(authed("dentA"), "clinics/clA/users/dentA", { role: "admin" }));
  // affectedKeys() solo lista los campos cuyo VALOR cambió: el control tiene que probar un cambio REAL de valor.
  await denegado("tocar active", updateDoc(authed("dentA"), "clinics/clA/users/dentA", { active: false }));
  await denegado("mudarse de clínica", updateDoc(authed("dentA"), "clinics/clA/users/dentA", { clinicId: "clB" }));
  await denegado("limpiar mustChangePassword", updateDoc(authed("dentA"), "clinics/clA/users/dentA", { mustChangePassword: false }));
  await denegado("borrar+recrear el usuario", deleteDoc(authed("dentA"), "clinics/clA/users/dentA"));
  await denegado("degradar al admin", updateDoc(authed("asisA"), "clinics/clA/users/adminA", { role: "assistant" }));
  await denegado("gastos", setDoc(authed("asisA"), "clinics/clA/expenses/expHack", { id: "expHack" }));
  await denegado("caja", setDoc(authed("dentA"), "clinics/clA/payments/payHack", { id: "payHack" }));
  await denegado("liquidaciones", getDoc(authed("dentA"), "clinics/clA/settlements/liq1"));
});
