/**
 * Permisos del equipo (config.permisos), el rol Comercial y los roles propios.
 *
 * La clínica guarda en clinics/{cid}.config.permisos[rol] = { dar: [...], quitar: [...] }: la diferencia contra la matriz de fábrica
 * (lib/rbac.ts). Se hace cumplir en cinco puntos: cobrar (payments.manage), documentos y firmas (engagement.forms), la ficha clínica
 * (emr.write), los gastos (expenses.manage) y las liquidaciones (billing.reports). `tienePermiso()` tiene que dar lo mismo que
 * `permisoEfectivo()` del cliente.
 */
import assert from "node:assert/strict";
import { authed, caso, denegado, getDoc, getDocs, permitido, consultaFiltrada, setDoc, updateDoc } from "./compat.mjs";

const EQ = (cid, ruta) => `clinics/${cid}/${ruta}`;
const pagoEq = (id) => ({ id, amount: 1000, patientId: "pEq" });
const fiscalEq = (id) => ({ id, kind: "boleta", number: "001-001-0000009", amount: 1000 });
const cajaEq = (id) => ({ id, userId: "x", userName: "x", status: "abierta", openingBalance: 0 });
const firmaEq = (id) => ({ id, patientId: "pEq", status: "pendiente" });
const docEq = (id) => ({ id, patientId: "pEq", estado: "pendiente", nombre: "Historia Clínica" });
const radioEq = (id) => ({ id, patientId: "pEq", image: "data:image/jpeg;base64,AAA", findings: [] });
const odo = (diente) => ({ odontogram: { [diente]: { state: "caries" } } });
const ninguno = () => () => false;

/* Clínica P: caja pierde cobrar y gana gastos · recepción gana cobrar y pierde documentos · dentista gana documentos y pierde la ficha ·
 * asistente gana la ficha y las liquidaciones (y trae escritos, sin efecto, practice.config y users.manage) · el admin trae escrito que
 * se le saca todo (sin efecto). */

caso("permisos del equipo — cobrar: lo gana la recepción y lo pierde la caja", async () => {
  // recepP gana payments.manage
  await permitido("recepP payments", setDoc(authed("recepP"), EQ("clP", "payments/payR"), pagoEq("payR")));
  await permitido("recepP fiscalDocs", setDoc(authed("recepP"), EQ("clP", "fiscalDocs/fdR"), fiscalEq("fdR")));
  await permitido("recepP cashSessions", setDoc(authed("recepP"), EQ("clP", "cashSessions/csR"), cajaEq("csR")));
  // cajaP pierde payments.manage
  await denegado("cajaP payments", setDoc(authed("cajaP"), EQ("clP", "payments/payC"), pagoEq("payC")));
  await denegado("cajaP fiscalDocs", setDoc(authed("cajaP"), EQ("clP", "fiscalDocs/fdC"), fiscalEq("fdC")));
  await denegado("cajaP cashSessions", setDoc(authed("cajaP"), EQ("clP", "cashSessions/csC"), cajaEq("csC")));
  // lo que no tocó la clínica sigue como de fábrica: el dentista y la asistente no cobran
  await denegado("dentP payments", setDoc(authed("dentP"), EQ("clP", "payments/payD"), pagoEq("payD")));
  await denegado("asisP payments", setDoc(authed("asisP"), EQ("clP", "payments/payS"), pagoEq("payS")));
});

caso("permisos del equipo — documentos y firmas: lo gana el dentista y lo pierde la recepción", async () => {
  await permitido("dentP signatures", setDoc(authed("dentP"), EQ("clP", "signatures/sigD"), firmaEq("sigD")));
  await denegado("recepP signatures", setDoc(authed("recepP"), EQ("clP", "signatures/sigR"), firmaEq("sigR")));
  // la recepción sin documentos tampoco escribe los documentos clínicos (no tiene ni documentos ni ficha)
  await denegado("recepP clinicalDocs", setDoc(authed("recepP"), EQ("clP", "clinicalDocs/cdR"), docEq("cdR")));
  // el dentista sigue pudiendo con los documentos clínicos, ahora por documentos y no por la ficha
  await permitido("dentP clinicalDocs", setDoc(authed("dentP"), EQ("clP", "clinicalDocs/cdD"), docEq("cdD")));
  // la caja no se tocó: conserva documentos y firmas
  await permitido("cajaP signatures", setDoc(authed("cajaP"), EQ("clP", "signatures/sigC"), firmaEq("sigC")));
});

caso("permisos del equipo — ficha clínica: la gana la asistente y la pierde el dentista", async () => {
  await permitido("asisP odontograma", updateDoc(authed("asisP"), EQ("clP", "patients/pEq"), odo("11")));
  await permitido("asisP radiographs", setDoc(authed("asisP"), EQ("clP", "radiographs/rxS"), radioEq("rxS")));
  await permitido("asisP clinicalDocs", setDoc(authed("asisP"), EQ("clP", "clinicalDocs/cdS"), docEq("cdS")));
  await denegado("dentP odontograma", updateDoc(authed("dentP"), EQ("clP", "patients/pEq"), odo("12")));
  await denegado("dentP radiographs", setDoc(authed("dentP"), EQ("clP", "radiographs/rxD"), radioEq("rxD")));
  // pero la demografía la sigue editando cualquier miembro, y ganar la ficha no da las firmas
  await permitido("dentP demografía", updateDoc(authed("dentP"), EQ("clP", "patients/pEq"), { phone: "0991" }));
  await denegado("asisP signatures", setDoc(authed("asisP"), EQ("clP", "signatures/sigS"), firmaEq("sigS")));
});

caso("permisos del equipo — gastos: los gana la caja, y nadie más los lee", { diferencia: "Listar los gastos: Firestore rechaza la consulta de quien no puede; Postgres la contesta vacía. Denegado = no devuelve ninguno." }, async () => {
  await permitido("cajaP lee un gasto", getDoc(authed("cajaP"), EQ("clP", "expenses/expEq")));
  await permitido("cajaP lista los gastos", getDocs(authed("cajaP"), EQ("clP", "expenses")));
  await permitido("cajaP escribe un gasto", setDoc(authed("cajaP"), EQ("clP", "expenses/expC"), { id: "expC", amount: 10 }));
  for (const uid of ["recepP", "dentP", "asisP"]) {
    await denegado(`${uid} lee`, getDoc(authed(uid), EQ("clP", "expenses/expEq")));
    await denegado(`${uid} lista`, consultaFiltrada(await getDocs(authed(uid), EQ("clP", "expenses")), ninguno()));
    await denegado(`${uid} escribe`, setDoc(authed(uid), EQ("clP", `expenses/exp${uid}`), { id: `exp${uid}`, amount: 10 }));
  }
});

caso("permisos del equipo — liquidaciones: las gana la asistente, y nadie más las lee", { diferencia: "Listar las liquidaciones: Firestore rechaza la consulta de quien no puede; Postgres la contesta vacía. Denegado = no devuelve ninguna." }, async () => {
  await permitido("asisP lee", getDoc(authed("asisP"), EQ("clP", "settlements/liqEq")));
  await permitido("asisP lista", getDocs(authed("asisP"), EQ("clP", "settlements")));
  await permitido("asisP escribe", setDoc(authed("asisP"), EQ("clP", "settlements/liqS"), { id: "liqS", dentistId: "dentP", total: 1 }));
  for (const uid of ["cajaP", "recepP", "dentP"]) {
    await denegado(`${uid} lee`, getDoc(authed(uid), EQ("clP", "settlements/liqEq")));
    await denegado(`${uid} lista`, consultaFiltrada(await getDocs(authed(uid), EQ("clP", "settlements")), ninguno()));
    await denegado(`${uid} escribe`, setDoc(authed(uid), EQ("clP", `settlements/liq${uid}`), { id: `liq${uid}`, total: 1 }));
  }
});

caso("permisos del equipo — al administrador no se le saca nada, ni escribiéndolo a mano en la configuración", async () => {
  await permitido("adminP cobra", setDoc(authed("adminP"), EQ("clP", "payments/payA"), pagoEq("payA")));
  await permitido("adminP escribe la ficha", updateDoc(authed("adminP"), EQ("clP", "patients/pEq"), { emr: [{ note: "control" }] }));
  await permitido("adminP firma", setDoc(authed("adminP"), EQ("clP", "signatures/sigA"), firmaEq("sigA")));
  await permitido("adminP lee gastos", getDoc(authed("adminP"), EQ("clP", "expenses/expEq")));
  await permitido("adminP lee liquidaciones", getDoc(authed("adminP"), EQ("clP", "settlements/liqEq")));
});

caso("permisos del equipo — crear usuarios y configurar la clínica no se reparten, aunque estén escritos", async () => {
  // asisP trae practice.config y users.manage en dar: las reglas de esas cosas siguen siendo solo del administrador
  await denegado("asisP procedures", setDoc(authed("asisP"), EQ("clP", "procedures/D9999"), { cpt: "D9999", description: "x", price: 1 }));
  await denegado("asisP users", setDoc(authed("asisP"), EQ("clP", "users/nuevoP"), { id: "nuevoP", role: "admin", active: true, clinicId: "clP" }));
  await denegado("asisP routineChecks", setDoc(authed("asisP"), EQ("clP", "routineChecks/caja__2026-10-08"), { id: "caja__2026-10-08", paso: "caja", periodo: "2026-10-08" }));
  await denegado("asisP configuración", updateDoc(authed("asisP"), "clinics/clP", { name: "Renombrada por la asistente" }));
});

caso("permisos del equipo — nadie se da permisos a sí mismo: solo el administrador escribe config.permisos", async () => {
  for (const uid of ["cajaP", "recepP", "dentP", "asisP"]) {
    await denegado(`${uid} updateDoc`, updateDoc(authed(uid), "clinics/clP", { "config.permisos": { [uid]: { dar: ["payments.manage"] } } }));
    await denegado(`${uid} setDoc merge`, setDoc(authed(uid), "clinics/clP", { config: { permisos: {} } }, { merge: true }));
  }
});

caso("permisos del equipo — los ajustes de una clínica no valen en otra", async () => {
  // recepP cobra en la clínica P, pero la recepción de la clínica A no (A no repartió nada)
  await permitido("recepP cobra en clP", setDoc(authed("recepP"), EQ("clP", "payments/payR2"), pagoEq("payR2")));
  await denegado("recepA cobra en clA", setDoc(authed("recepA"), EQ("clA", "payments/payR3"), pagoEq("payR3")));
  await denegado("recepP cobra en clA", setDoc(authed("recepP"), EQ("clA", "payments/payR4"), pagoEq("payR4")));
});

caso("permisos del equipo — sin ajustes (clínica sin config.permisos) rige la matriz de fábrica", async () => {
  await permitido("cajaM cobra", setDoc(authed("cajaM"), EQ("clM", "payments/payC"), pagoEq("payC")));
  await permitido("recepM firma", setDoc(authed("recepM"), EQ("clM", "signatures/sigR"), firmaEq("sigR")));
  await permitido("dentM escribe la ficha", updateDoc(authed("dentM"), EQ("clM", "patients/pEq"), odo("11")));
  await denegado("recepM cobra", setDoc(authed("recepM"), EQ("clM", "payments/payR"), pagoEq("payR")));
  await denegado("dentM firma", setDoc(authed("dentM"), EQ("clM", "signatures/sigD"), firmaEq("sigD")));
  await denegado("asisM escribe la ficha", updateDoc(authed("asisM"), EQ("clM", "patients/pEq"), odo("12")));
  await denegado("cajaM lee gastos", getDoc(authed("cajaM"), EQ("clM", "expenses/expEq")));
  await denegado("cajaM lee liquidaciones", getDoc(authed("cajaM"), EQ("clM", "settlements/liqEq")));
});

caso("permisos del equipo — dar y quitar a la vez: gana dar; listas mal formadas se ignoran y rige la fábrica", async () => {
  // clínica Q
  await permitido("recepQ cobra (dar gana a quitar)", setDoc(authed("recepQ"), EQ("clQ", "payments/payR"), pagoEq("payR")));
  await denegado("recepQ firma (quitar rige)", setDoc(authed("recepQ"), EQ("clQ", "signatures/sigR"), firmaEq("sigR")));
  await permitido("cajaQ cobra («basura» en vez de un mapa: fábrica)", setDoc(authed("cajaQ"), EQ("clQ", "payments/payC"), pagoEq("payC")));
  await permitido("dentQ escribe la ficha (listas que no son listas: fábrica)", updateDoc(authed("dentQ"), EQ("clQ", "patients/pEq"), odo("11")));
  await denegado("asisQ escribe la ficha", updateDoc(authed("asisQ"), EQ("clQ", "patients/pEq"), odo("12")));
});

caso("permisos del equipo — el cambio rige en el acto, al darlo y al sacarlo", async () => {
  // clínica M arranca de fábrica: la recepción no cobra y la caja sí
  await denegado("recepM antes", setDoc(authed("recepM"), EQ("clM", "payments/payR1"), pagoEq("payR1")));
  await permitido("cajaM antes", setDoc(authed("cajaM"), EQ("clM", "payments/payC1"), pagoEq("payC1")));
  // el administrador reparte y saca
  await permitido("adminM reparte", updateDoc(authed("adminM"), "clinics/clM", {
    "config.permisos": {
      cashier: { dar: [], quitar: ["payments.manage"] },
      receptionist: { dar: ["payments.manage"], quitar: [] },
      dentist: { dar: [], quitar: [] },
      assistant: { dar: [], quitar: [] },
    },
  }));
  await permitido("recepM cobra", setDoc(authed("recepM"), EQ("clM", "payments/payR2"), pagoEq("payR2")));
  await denegado("cajaM ya no cobra", setDoc(authed("cajaM"), EQ("clM", "payments/payC2"), pagoEq("payC2")));
  // y vuelve a la fábrica escribiendo las listas vacías (así lo guarda la pantalla)
  await permitido("adminM vuelve a la fábrica", updateDoc(authed("adminM"), "clinics/clM", {
    "config.permisos": {
      cashier: { dar: [], quitar: [] }, receptionist: { dar: [], quitar: [] },
      dentist: { dar: [], quitar: [] }, assistant: { dar: [], quitar: [] },
    },
  }));
  await denegado("recepM ya no cobra", setDoc(authed("recepM"), EQ("clM", "payments/payR3"), pagoEq("payR3")));
  await permitido("cajaM cobra otra vez", setDoc(authed("cajaM"), EQ("clM", "payments/payC3"), pagoEq("payC3")));
});

caso("permisos del equipo — con la suscripción vencida se lee y no se escribe, aunque se haya repartido el permiso", async () => {
  // clínica W (past_due): recepW tiene payments.manage repartido, pero el cobro manda
  await denegado("recepW cobra", setDoc(authed("recepW"), EQ("clW", "payments/payR"), pagoEq("payR")));
  await permitido("recepW lee", getDoc(authed("recepW"), EQ("clW", "patients/pEq")));
});

/* ===== COMERCIAL y ROLES PROPIOS =====
 * «Comercial» es un rol de fábrica más: agenda, datos del paciente, presupuestos y CRM; documentos y firmas sí (engagement.forms),
 * cobrar, ficha clínica, gastos y liquidaciones no. Un rol propio (id «rp_…») no tiene nada de fábrica: lo que puede es su lista `dar`. */

caso("Comercial — firma y arma documentos clínicos (engagement.forms) pero no cobra ni toca la ficha, ni ve gastos ni liquidaciones", async () => {
  await permitido("comR signatures", setDoc(authed("comR"), EQ("clR", "signatures/sigCom"), firmaEq("sigCom")));
  await permitido("comR clinicalDocs", setDoc(authed("comR"), EQ("clR", "clinicalDocs/cdCom"), docEq("cdCom")));
  await denegado("comR payments", setDoc(authed("comR"), EQ("clR", "payments/payCom"), pagoEq("payCom")));
  await denegado("comR fiscalDocs", setDoc(authed("comR"), EQ("clR", "fiscalDocs/fdCom"), fiscalEq("fdCom")));
  await denegado("comR odontograma", updateDoc(authed("comR"), EQ("clR", "patients/pEq"), odo("11")));
  await denegado("comR expenses", getDoc(authed("comR"), EQ("clR", "expenses/expEq")));
  await denegado("comR settlements", getDoc(authed("comR"), EQ("clR", "settlements/liqEq")));
  // lo demás de un miembro sí: lee pacientes y edita la demografía
  await permitido("comR lee pacientes", getDoc(authed("comR"), EQ("clR", "patients/pEq")));
  await permitido("comR edita la demografía", updateDoc(authed("comR"), EQ("clR", "patients/pEq"), { phone: "0985" }));
});

caso("roles propios — un rol propio puede lo que la clínica le dio en «dar» y nada más", async () => {
  await permitido("propR payments", setDoc(authed("propR"), EQ("clR", "payments/payProp"), pagoEq("payProp")));
  await permitido("propR cashSessions", setDoc(authed("propR"), EQ("clR", "cashSessions/csProp"), cajaEq("csProp")));
  await permitido("propR lee gastos", getDoc(authed("propR"), EQ("clR", "expenses/expEq")));
  await permitido("propR escribe gastos", setDoc(authed("propR"), EQ("clR", "expenses/expProp"), { id: "expProp", amount: 5 }));
  // lo que no se le dio: nada, ni siquiera lo que tienen todos los roles de fábrica
  await denegado("propR signatures", setDoc(authed("propR"), EQ("clR", "signatures/sigProp"), firmaEq("sigProp")));
  await denegado("propR clinicalDocs", setDoc(authed("propR"), EQ("clR", "clinicalDocs/cdProp"), docEq("cdProp")));
  await denegado("propR odontograma", updateDoc(authed("propR"), EQ("clR", "patients/pEq"), odo("12")));
  await denegado("propR liquidaciones", getDoc(authed("propR"), EQ("clR", "settlements/liqEq")));
});

caso("roles propios — sin entrada en config.permisos, o con una vacía, o con un id que no existe: no puede nada, pero sigue siendo miembro", async () => {
  for (const uid of ["vacioR", "huerfanoR", "rarR", "protoR"]) {
    await denegado(`${uid} payments`, setDoc(authed(uid), EQ("clR", `payments/pay${uid}`), pagoEq(`pay${uid}`)));
    await denegado(`${uid} signatures`, setDoc(authed(uid), EQ("clR", `signatures/sig${uid}`), firmaEq(`sig${uid}`)));
    await denegado(`${uid} lee gastos`, getDoc(authed(uid), EQ("clR", "expenses/expEq")));
    await denegado(`${uid} odontograma`, updateDoc(authed(uid), EQ("clR", "patients/pEq"), odo("13")));
    await permitido(`${uid} lee pacientes`, getDoc(authed(uid), EQ("clR", "patients/pEq")));
  }
});

caso("roles propios — quien tiene un rol propio no puede darse permisos ni cambiarse el rol (solo el administrador escribe)", async () => {
  await denegado("propR se da permisos", updateDoc(authed("propR"), "clinics/clR", { "config.permisos.rp_ab12cd34": { dar: ["payments.manage", "emr.write"] } }));
  await denegado("propR cambia los roles propios", updateDoc(authed("propR"), "clinics/clR", { "config.rolesPropios": [{ id: "rp_ab12cd34", nombre: "Dueño" }] }));
  await denegado("propR se pone admin", updateDoc(authed("propR"), "clinics/clR/users/propR", { role: "admin" }));
  await denegado("propR se pone admin (merge)", setDoc(authed("propR"), "clinics/clR/users/propR", { role: "admin" }, { merge: true }));
});

caso("roles propios — el administrador sí crea un rol, se lo asigna a alguien y el cambio rige en el acto", async () => {
  await denegado("vacioR antes", setDoc(authed("vacioR"), EQ("clR", "payments/payAntes"), pagoEq("payAntes")));
  await permitido("adminR crea el rol", updateDoc(authed("adminR"), "clinics/clR", {
    "config.rolesPropios": [{ id: "rp_ab12cd34", nombre: "Contador" }, { id: "rp_nuevo0001", nombre: "Cobranzas" }],
    "config.permisos.rp_nuevo0001": { dar: ["payments.manage", "money.view"], quitar: [] },
  }));
  await permitido("adminR se lo asigna a vacioR", updateDoc(authed("adminR"), "clinics/clR/users/vacioR", { role: "rp_nuevo0001" }));
  await permitido("vacioR cobra", setDoc(authed("vacioR"), EQ("clR", "payments/payDespues"), pagoEq("payDespues")));
  // y al sacarle el rol, lo pierde
  await permitido("adminR le saca el rol", updateDoc(authed("adminR"), "clinics/clR/users/vacioR", { role: "rp_sinentrada" }));
  await denegado("vacioR ya no cobra", setDoc(authed("vacioR"), EQ("clR", "payments/payOtraVez"), pagoEq("payOtraVez")));
  assert.ok(true);
});
