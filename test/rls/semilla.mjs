/**
 * La siembra de test/firestore-rules.test.mjs (su `before`), tal cual, contra Postgres: las mismas clínicas, personas y documentos.
 * Los documentos de usuario llevan además `authUid` (el uuid de GoTrue de esa persona; sembrarRuta lo agrega).
 * `directory` y `serviceAccounts` ya no existen: sus siembras se omiten.
 */
import { before, after } from "node:test";
import { cerrar, prepararBase } from "./entorno.mjs";
import { sembrarFusion, sembrarRuta as set, TABLAS_CLINICA } from "./compat.mjs";

/** Un mensaje directo bien formado, igual al que arma lib/chat.ts. `extra` pisa o agrega campos. */
export function directo({ id, cid = "clA", de, a, texto = "Hola, ¿tenés un minuto?", ...extra }) {
  return {
    id, clinicId: cid, fromId: de, fromName: `Usuario ${de}`, toId: a,
    participants: [de, a], text: texto, createdAt: "2026-09-27T12:00:00.000Z", ...extra,
  };
}

/** Un espacio bloqueado de la agenda como lo arma lib/bloqueos.ts (`armarBloqueos`). */
export function bloqueoDeAgenda(id, cid = "clA", extra = {}) {
  return {
    id, clinicId: cid, dentistId: "*", start: "2026-10-12T15:00:00.000Z", end: "2026-10-12T16:00:00.000Z",
    reason: "Almuerzo", createdAt: "2026-10-08T12:00:00.000Z", createdBy: "Recepción", ...extra,
  };
}

before(async () => {
  await prepararBase();

  // Clínica A: adminA + dentistA + asistenteA
  await set("clinics/clA", { id: "clA", name: "A", plan: "clinica" });
  await set("clinics/clA/users/adminA", { id: "adminA", role: "admin", active: true, clinicId: "clA", email: "admin@a.com" });
  await set("clinics/clA/users/dentA", { id: "dentA", role: "dentist", active: true, clinicId: "clA", email: "dent@a.com", mustChangePassword: true, commissionPct: 25, salaryBase: 2000000 });
  await set("clinics/clA/users/asisA", { id: "asisA", role: "assistant", active: true, clinicId: "clA", email: "asis@a.com" });
  // Roles v3: la recepción se separa de la caja.
  await set("clinics/clA/users/cajaA", { id: "cajaA", role: "cashier", active: true, clinicId: "clA", email: "caja@a.com" });
  await set("clinics/clA/users/recepA", { id: "recepA", role: "receptionist", active: true, clinicId: "clA", email: "recep@a.com" });
  await set("clinics/clA/patients/p1", { id: "p1", firstName: "Ana" });
  await set("subscriptions/clA", { clinicId: "clA", plan: "clinica", status: "active" });

  // Fixtures de la auditoría de escalada intra-clínica.
  await set("clinics/clA/patients/pEmr", { id: "pEmr", firstName: "Elena", lastName: "Ramos", phone: "0981", odontogram: { teeth: { 11: "sano" } }, emr: [{ id: "e1", note: "Evolución original del dentista" }] });
  await set("clinics/clA/patients/pBorrable", { id: "pBorrable", firstName: "Duplicado", lastName: "A fusionar" });
  await set("clinics/clA/radiographs/rx1", { id: "rx1", patientId: "pEmr", image: "data:image/jpeg;base64,AAA", findings: ["caries 26"] });
  await set("clinics/clA/clinicalDocs/cdSeed", { id: "cdSeed", patientId: "pEmr", estado: "completado", nombre: "Historia Clínica" });
  await set("clinics/clA/routineChecks/caja__2026-10-01", { id: "caja__2026-10-01", paso: "caja", periodo: "2026-10-01", hechoPor: "adminA", hechoPorNombre: "Admin A", hechoEn: "2026-10-01T12:00:00.000Z" });
  await set("clinics/clA/agendaBlocks/blSeed", bloqueoDeAgenda("blSeed", "clA"));
  await set("clinics/clA/signatures/sig1", { id: "sig1", patientId: "pEmr", status: "firmado", signature: "data:image/png;base64,AAA" });
  await set("clinics/clA/billing/bil1", { id: "bil1", patientId: "pEmr", status: "hold", amount: 500000 });
  await set("clinics/clA/procedures/D0120", { cpt: "D0120", description: "Consulta", price: 150000 });
  await set("clinics/clA/cashSessions/cs1", { id: "cs1", userId: "asisA", userName: "Recepción", status: "abierta", openingBalance: 200000 });
  await set("clinics/clA/fiscalDocs/fd1", { id: "fd1", kind: "boleta", number: "001-001-0000001", amount: 500000 });

  await set("clinics/clA/payments/pay1", { id: "pay1", amount: 1000 });
  await set("clinics/clA/expenses/exp1", { id: "exp1", amount: 500 });
  await set("clinics/clA/settlements/liq1", { id: "liq1", dentistId: "dentA", total: 3000000 });

  // Chat directo: un directo entre la dentista y la asistente, y una difusión del admin repartida en tres copias.
  await set("clinics/clA/users/exA", { id: "exA", role: "receptionist", active: false, clinicId: "clA", email: "ex@a.com" });
  await set("clinics/clA/directMessages/dm1", directo({ id: "dm1", de: "dentA", a: "asisA" }));
  await set("clinics/clA/directMessages/dmEx", directo({ id: "dmEx", de: "adminA", a: "exA", texto: "Pasá a firmar la baja" }));
  for (const [id, a] of [["cpDent", "dentA"], ["cpAsis", "asisA"], ["cpRecep", "recepA"]]) {
    await set(`clinics/clA/directMessages/${id}`, directo({ id, de: "adminA", a, texto: "El viernes cerramos a las 16", difusionId: "dif1" }));
  }

  // Clínica B
  await set("clinics/clB", { id: "clB", name: "B", plan: "solo" });
  await set("clinics/clB/users/adminB", { id: "adminB", role: "admin", active: true, clinicId: "clB", email: "admin@b.com" });
  await set("clinics/clB/patients/pb", { id: "pb", firstName: "Beto" });

  // Clínica V: suscripción VENCIDA (impago) — para probar el modo solo-lectura
  await set("clinics/clV", { id: "clV", name: "V", plan: "clinica" });
  await set("clinics/clV/users/adminV", { id: "adminV", role: "admin", active: true, clinicId: "clV", email: "admin@v.com" });
  await set("clinics/clV/patients/pv", { id: "pv", firstName: "Vito" });
  await set("subscriptions/clV", { clinicId: "clV", plan: "clinica", status: "past_due" });
  await set("clinics/clV/users/dentV", { id: "dentV", role: "dentist", active: true, clinicId: "clV", email: "dent@v.com" });
  await set("clinics/clV/clinicalDocs/cdV", { id: "cdV", patientId: "pv", estado: "pendiente" });
  await set("clinics/clV/routineChecks/caja__2026-10-01", { id: "caja__2026-10-01", paso: "caja", periodo: "2026-10-01" });
  await set("clinics/clV/agendaBlocks/blV", bloqueoDeAgenda("blV", "clV"));
  await set("clinics/clV/directMessages/dmV", directo({ id: "dmV", cid: "clV", de: "adminV", a: "dentV" }));

  // Clínica S: plan SOLO al día — para probar el gating de módulos premium
  await set("clinics/clS", { id: "clS", name: "S", plan: "solo" });
  await set("clinics/clS/users/adminS", { id: "adminS", role: "admin", active: true, clinicId: "clS", email: "admin@s.com" });
  await set("subscriptions/clS", { clinicId: "clS", plan: "solo", status: "active" });

  // Clínica G: SIN doc de suscripción — grandfathering (anterior al cobro)
  await set("clinics/clG", { id: "clG", name: "G" });
  await set("clinics/clG/users/adminG", { id: "adminG", role: "admin", active: true, clinicId: "clG", email: "admin@g.com" });

  // Clínica E: activa pero con el PERÍODO VENCIDO (webhook de impago perdido)
  await set("clinics/clE", { id: "clE", name: "E", plan: "clinica" });
  await set("clinics/clE/users/adminE", { id: "adminE", role: "admin", active: true, clinicId: "clE", email: "admin@e.com" });
  await set("subscriptions/clE", { clinicId: "clE", plan: "clinica", status: "active", currentPeriodEndMs: 1000 });

  /* Clínica X: la VÍCTIMA del barrido de aislamiento. Plan cadena + suscripción al día para que ningún deny pueda atribuirse al cobro o al
   * gating de plan. Sembrada con un documento en CADA colección. */
  await set("clinics/clX", { id: "clX", name: "X", plan: "cadena", config: { botika: { token: "SECRETO" } } });
  await set("subscriptions/clX", { clinicId: "clX", plan: "cadena", status: "active" });
  await set("clinics/clX/users/adminX", { id: "adminX", role: "admin", active: true, clinicId: "clX", email: "admin@x.com" });
  // Segunda persona de X: un directo necesita un destinatario de la misma clínica.
  await set("clinics/clX/users/recepX", { id: "recepX", role: "receptionist", active: true, clinicId: "clX", email: "recep@x.com" });
  for (const c of TABLAS_CLINICA) {
    // `users` ya tiene sus documentos (adminX, recepX): el «seed» de siempre va igual, como un documento más
    await set(`clinics/clX/${c}/seed`, { id: "seed", clinicId: "clX", secreto: "PII de la clínica X" });
  }

  // Demo
  await set("clinics/cl_demo", { id: "cl_demo", name: "Demo" });

  /* ---- PERMISOS DEL EQUIPO (config.permisos): la clínica reparte y saca permisos por rol ---- */
  const seedEquipo = async (cid, permisos, extra = {}) => {
    await set(`clinics/${cid}`, { id: cid, name: cid, plan: "clinica", config: permisos === undefined ? { timezone: "America/Asuncion" } : { timezone: "America/Asuncion", permisos } });
    await set(`subscriptions/${cid}`, { clinicId: cid, plan: "clinica", status: "active", ...extra });
    const L = cid.slice(2); // clP → P
    for (const [rol, id] of [["admin", "admin"], ["cashier", "caja"], ["receptionist", "recep"], ["dentist", "dent"], ["assistant", "asis"]]) {
      await set(`clinics/${cid}/users/${id}${L}`, { id: `${id}${L}`, role: rol, active: true, clinicId: cid, email: `${id}@${cid}.com` });
    }
    await set(`clinics/${cid}/patients/pEq`, { id: "pEq", firstName: "Paciente", lastName: "Del equipo", phone: "0981", odontogram: { teeth: { 11: "sano" } } });
    await set(`clinics/${cid}/expenses/expEq`, { id: "expEq", amount: 500 });
    await set(`clinics/${cid}/settlements/liqEq`, { id: "liqEq", dentistId: `dent${L}`, total: 3000000 });
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
  // W: suscripción vencida con permisos repartidos: el cobro sigue mandando.
  await seedEquipo("clW", { receptionist: { dar: ["payments.manage"] } }, { status: "past_due" });

  /* R: ROLES PROPIOS y el rol de fábrica «Comercial». Un rol propio (id «rp_…») no hereda nada de fábrica: lo que puede es su lista `dar`. */
  await seedEquipo("clR", {
    rp_ab12cd34: { dar: ["payments.manage", "expenses.manage"], quitar: [] },
    rp_borrado1: { dar: [], quitar: [] }, // un rol que se borró: queda una entrada neutra
  });
  await sembrarFusion("clinics/clR", { config: { rolesPropios: [{ id: "rp_ab12cd34", nombre: "Contador" }] } });
  for (const [id, role] of [["comR", "commercial"], ["propR", "rp_ab12cd34"], ["vacioR", "rp_sinentrada"], ["huerfanoR", "rp_borrado1"], ["rarR", "constructor"], ["protoR", "__proto__"]]) {
    await set(`clinics/clR/users/${id}`, { id, role, active: true, clinicId: "clR", email: `${id}@clr.com` });
  }
});

after(async () => { await cerrar(); });
