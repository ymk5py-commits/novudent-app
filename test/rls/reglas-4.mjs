/**
 * Mensajes directos (chat), documentos clínicos, rutina del administrador y espacios bloqueados de la agenda.
 *
 * Mensajes directos: la única colección de la clínica que un miembro no lee entera. Un directo es de sus dos participantes y del admin.
 * La difusión del admin se guarda como UNA copia por destinatario (mismo difusionId): cada uno lee la suya y nada más.
 * En Firestore pedir la colección entera siendo no-admin fallaba entero; en Postgres la contestan con lo propio (spec §5.2).
 */
import assert from "node:assert/strict";
import {
  anon, authed, barrido, caso, consultaFiltrada, deleteDoc, denegado, getDoc, getDocs, permitido, setDoc, updateDoc,
} from "./compat.mjs";
import { bloqueoDeAgenda, directo } from "./semilla.mjs";

const DM = (cid = "clA") => `clinics/${cid}/directMessages`;
const esDe = (id) => (d) => Array.isArray(d.data?.participants) && d.data.participants.includes(id);

caso("DIRECTOS: lo leen sus dos participantes; otra persona de la misma clínica NO", async () => {
  await permitido("dentA (quien lo mandó)", getDoc(authed("dentA"), `${DM()}/dm1`));
  await permitido("asisA (a quien le llegó)", getDoc(authed("asisA"), `${DM()}/dm1`));
  await denegado("recepA", getDoc(authed("recepA"), `${DM()}/dm1`));
  await denegado("cajaA", getDoc(authed("cajaA"), `${DM()}/dm1`));
});

caso("DIRECTOS: el admin lee cualquier directo de su clínica y lista la colección entera", async () => {
  await permitido("adminA lee dm1", getDoc(authed("adminA"), `${DM()}/dm1`));
  const todos = await permitido("adminA lista todo", getDocs(authed("adminA"), DM()));
  for (const id of ["dm1", "dmEx", "cpDent", "cpAsis", "cpRecep"]) assert.ok(todos.ids.includes(id), `falta ${id}`);
});

caso("DIRECTOS: un no-admin NO lista la colección entera; SÍ la consulta por participants (la del store)", { diferencia: "Firestore rechaza la consulta entera de un no-admin (las reglas no son filtros). Postgres la contesta con lo propio: pedirla completa trae solo los directos de esa persona. Denegado = no trae ninguno ajeno. El cliente ya no necesita la consulta especial." }, async () => {
  await denegado("recepA pide TODA la colección y recibe algo ajeno", consultaFiltrada(await getDocs(authed("recepA"), DM()), esDe("recepA")));
  const mios = await permitido("recepA consulta por participants", getDocs(authed("recepA"), DM(), { participante: "recepA" }));
  assert.ok(mios.ids.includes("cpRecep"));
  assert.ok(mios.docs.every((d) => d.data.participants.includes("recepA")));
  // Y no sirve pedir las conversaciones de OTRO.
  await denegado("recepA pide las conversaciones de dentA", consultaFiltrada(await getDocs(authed("recepA"), DM(), { participante: "dentA" }), esDe("recepA")));
});

caso("DIFUSIÓN: cada destinatario lee solo SU copia — no averigua a quién más le llegó", async () => {
  const asis = authed("asisA");
  await permitido("asisA lee su copia", getDoc(asis, `${DM()}/cpAsis`));
  await denegado("asisA lee la copia de dentA", getDoc(asis, `${DM()}/cpDent`));
  await denegado("asisA lee la copia de recepA", getDoc(asis, `${DM()}/cpRecep`));
  // Ni consultando por el difusionId que trae su propia copia.
  await denegado("asisA consulta por difusionId", consultaFiltrada(await getDocs(asis, DM(), { campo: "difusionId", valor: "dif1" }), esDe("asisA")));
  // El admin sí ve a quién le llegó.
  const copias = await permitido("adminA consulta por difusionId", getDocs(authed("adminA"), DM(), { campo: "difusionId", valor: "dif1" }));
  assert.deepEqual(copias.docs.map((d) => d.data.toId).sort(), ["asisA", "dentA", "recepA"]);
});

caso("DIRECTOS: un ex empleado (active:false) ya no lee ni sus propios directos", async () => {
  await denegado("exA lee su directo", getDoc(authed("exA"), `${DM()}/dmEx`));
  const r = await getDocs(authed("exA"), DM(), { participante: "exA" });
  await denegado("exA consulta por participants", { ok: r.ok && r.ids.length > 0, motivo: "consulta filtrada (no trae nada)", vacio: r.existentes.length ? null : "no hay directos" });
});

caso("DIRECTOS: un miembro manda un directo bien formado a otra persona de su clínica", async () => {
  await permitido("recepA → dentA", setDoc(authed("recepA"), `${DM()}/dmOk`, directo({ id: "dmOk", de: "recepA", a: "dentA" })));
  // El tope es de 2000 caracteres, inclusive (el mismo que la interfaz).
  await permitido("texto de 2000 caracteres", setDoc(authed("recepA"), `${DM()}/dmLargo`, directo({ id: "dmLargo", de: "recepA", a: "dentA", texto: "x".repeat(2000) })));
});

caso("DIRECTOS: nadie manda un directo a nombre de otro (ni el admin, ni sin sesión)", async () => {
  const casos = [
    ["remitente ajeno", "dentA", directo({ id: "fx1", de: "asisA", a: "recepA" })],
    ["participants sin el que escribe", "dentA", directo({ id: "fx2", de: "dentA", a: "recepA", participants: ["asisA", "recepA"] })],
    ["un tercero colado en participants", "dentA", directo({ id: "fx3", de: "dentA", a: "recepA", participants: ["dentA", "recepA", "cajaA"] })],
    ["el admin firmando por la dentista", "adminA", directo({ id: "fx4", de: "dentA", a: "recepA" })],
  ];
  await barrido("suplantaciones", "denegado", casos, ([, quien, datos]) => setDoc(authed(quien), `${DM()}/${datos.id}`, datos));
  await denegado("sin sesión", setDoc(anon(), `${DM()}/fx5`, directo({ id: "fx5", de: "dentA", a: "recepA" })));
});

caso("DIRECTOS: el alta valida destinatario, texto y forma del documento", async () => {
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
  await barrido("altas inválidas", "denegado", casos, ([, docId, datos]) => setDoc(authed("dentA"), `${DM()}/${docId}`, datos));
});

caso("DIFUSIÓN: solo el admin la manda — un difusionId en el alta de otro rol se rechaza", async () => {
  await denegado("dentA con difusionId", setDoc(authed("dentA"), `${DM()}/dfNo`, directo({ id: "dfNo", de: "dentA", a: "asisA", difusionId: "difTrucha" })));
  await denegado("cajaA con difusionId", setDoc(authed("cajaA"), `${DM()}/dfNo2`, directo({ id: "dfNo2", de: "cajaA", a: "asisA", difusionId: "difTrucha" })));
  await permitido("adminA con difusionId", setDoc(authed("adminA"), `${DM()}/dfSi`, directo({ id: "dfSi", de: "adminA", a: "cajaA", difusionId: "dif2" })));
});

caso("DIRECTOS: lo marca leído el destinatario y nadie más (ni el remitente, ni el admin)", async () => {
  const leido = { readAt: "2026-09-27T12:05:00.000Z" };
  await denegado("dentA (quien lo mandó)", updateDoc(authed("dentA"), `${DM()}/dm1`, leido));
  await denegado("recepA (un tercero)", updateDoc(authed("recepA"), `${DM()}/dm1`, leido));
  await denegado("adminA (lo lee, no lo toca)", updateDoc(authed("adminA"), `${DM()}/dm1`, leido));
  await permitido("asisA (el destinatario)", updateDoc(authed("asisA"), `${DM()}/dm1`, leido));
});

caso("DIRECTOS: el destinatario solo toca readAt — no reescribe el texto ni el remitente", async () => {
  const asis = authed("asisA");
  await denegado("cambia el texto", updateDoc(asis, `${DM()}/dm1`, { text: "Nunca dije eso" }));
  await denegado("readAt y fromId", updateDoc(asis, `${DM()}/dm1`, { readAt: "2026-09-27T12:06:00.000Z", fromId: "adminA" }));
  await denegado("cambia participants", updateDoc(asis, `${DM()}/dm1`, { participants: ["asisA", "recepA"] }));
});

caso("DIRECTOS: nadie borra un mensaje, ni el admin", async () => {
  for (const quien of ["dentA", "asisA", "adminA"]) {
    await denegado(`${quien} borra dm1`, deleteDoc(authed(quien), `${DM()}/dm1`));
  }
});

caso("DIRECTOS: con la suscripción vencida se leen y se marcan leídos, pero no se manda nada nuevo", async () => {
  await permitido("dentV lee", getDoc(authed("dentV"), `${DM("clV")}/dmV`));
  await permitido("dentV marca leído", updateDoc(authed("dentV"), `${DM("clV")}/dmV`, { readAt: "2026-09-27T12:07:00.000Z" }));
  await denegado("adminV manda uno nuevo", setDoc(authed("adminV"), `${DM("clV")}/dmV2`, directo({ id: "dmV2", cid: "clV", de: "adminV", a: "dentV" })));
});

caso("DIRECTOS: la demo sigue siendo el sandbox público de siempre", async () => {
  await permitido("anon lista la demo", getDocs(anon(), DM("cl_demo")));
  // En la demo el remitente es un usuario de ejemplo (u1…), no el uid de la sesión anónima.
  await permitido("visitante manda en la demo", setDoc(authed("visitante"), `${DM("cl_demo")}/dmDemo`, directo({ id: "dmDemo", cid: "cl_demo", de: "u1", a: "u2" })));
  await denegado("anon manda en la demo", setDoc(anon(), `${DM("cl_demo")}/dmDemo2`, directo({ id: "dmDemo2", cid: "cl_demo", de: "u1", a: "u2" })));
});

/* ══ DOCUMENTOS CLÍNICOS (clinicalDocs) ═══════════════════════════════════════════════════════════════
 * Los edita quien gestiona formularios (admin, caja, recepción) o escribe la ficha (dentista). El asistente lee y no escribe.
 * Nadie los borra desde el cliente: se anulan. Con la suscripción vencida se lee y no se escribe. */

caso("documentos clínicos: admin, caja, recepción y dentista escriben; el asistente no", async () => {
  for (const uid of ["adminA", "cajaA", "recepA", "dentA"]) {
    await permitido(`${uid} crea`, setDoc(authed(uid), `clinics/clA/clinicalDocs/cd_${uid}`, { id: `cd_${uid}`, patientId: "pEmr", estado: "pendiente" }));
    await permitido(`${uid} completa (merge)`, setDoc(authed(uid), `clinics/clA/clinicalDocs/cd_${uid}`, { estado: "completado" }, { merge: true }));
  }
  await denegado("asisA crea", setDoc(authed("asisA"), "clinics/clA/clinicalDocs/cd_asis", { id: "cd_asis", patientId: "pEmr", estado: "pendiente" }));
  await denegado("asisA anula uno existente (merge)", setDoc(authed("asisA"), "clinics/clA/clinicalDocs/cdSeed", { estado: "anulado" }, { merge: true }));
});

caso("documentos clínicos: todos los miembros leen, y un desconocido no", async () => {
  for (const uid of ["adminA", "cajaA", "recepA", "dentA", "asisA"]) {
    await permitido(`${uid} lee`, getDoc(authed(uid), "clinics/clA/clinicalDocs/cdSeed"));
  }
  await denegado("anon", getDoc(anon(), "clinics/clA/clinicalDocs/cdSeed"));
  await denegado("adminB", getDoc(authed("adminB"), "clinics/clA/clinicalDocs/cdSeed"));
});

caso("documentos clínicos: no se borran desde el cliente, ni el admin", async () => {
  for (const uid of ["adminA", "recepA", "dentA", "asisA"]) {
    await denegado(`${uid} borra`, deleteDoc(authed(uid), "clinics/clA/clinicalDocs/cdSeed"));
  }
});

caso("documentos clínicos: con la suscripción vencida se lee y no se escribe", async () => {
  await permitido("adminV lee", getDoc(authed("adminV"), "clinics/clV/clinicalDocs/cdV"));
  await denegado("adminV crea", setDoc(authed("adminV"), "clinics/clV/clinicalDocs/cdV2", { id: "cdV2", patientId: "pv", estado: "pendiente" }));
  await denegado("dentV completa (merge)", setDoc(authed("dentV"), "clinics/clV/clinicalDocs/cdV", { estado: "completado" }, { merge: true }));
});

caso("documentos clínicos: la demo es abierta para quien tiene sesión", async () => {
  await permitido("crea", setDoc(authed("cualquiera"), "clinics/cl_demo/clinicalDocs/cd_demo_x", { id: "cd_demo_x", patientId: "p1", estado: "pendiente" }));
  await permitido("borra", deleteDoc(authed("cualquiera"), "clinics/cl_demo/clinicalDocs/cd_demo_x"));
});

/* ══ RUTINA DEL ADMINISTRADOR (routineChecks) ═════════════════════════════════════════════════════════
 * Un documento por casillero tildado (`${paso}__${periodo}`). Lo tilda y lo destilda solo el administrador; todos los miembros leen. */
const RC = (cid, id) => `clinics/${cid}/routineChecks/${id}`;
const casillero = (id, extra = {}) => ({ id, paso: id.split("__")[0], periodo: id.split("__")[1], hechoPor: "adminA", hechoPorNombre: "Admin A", hechoEn: "2026-10-07T12:00:00.000Z", ...extra });

caso("rutina del administrador: el admin tilda, cambia y destilda", async () => {
  await permitido("tilda", setDoc(authed("adminA"), RC("clA", "cobrado__2026-10-07"), casillero("cobrado__2026-10-07")));
  await permitido("cambia (merge)", setDoc(authed("adminA"), RC("clA", "cobrado__2026-10-07"), { hechoPorNombre: "Otro" }, { merge: true }));
  await permitido("destilda", deleteDoc(authed("adminA"), RC("clA", "cobrado__2026-10-07")));
});

caso("rutina del administrador: caja, recepción, dentista y asistente no escriben ni destildan", async () => {
  for (const uid of ["cajaA", "recepA", "dentA", "asisA"]) {
    await denegado(`${uid} tilda`, setDoc(authed(uid), RC("clA", `deudores__${uid}`), casillero(`deudores__${uid}`)));
    await denegado(`${uid} cambia (merge)`, setDoc(authed(uid), RC("clA", "caja__2026-10-01"), { hechoPorNombre: "Pisado" }, { merge: true }));
    await denegado(`${uid} destilda`, deleteDoc(authed(uid), RC("clA", "caja__2026-10-01")));
  }
});

caso("rutina del administrador: todos los miembros leen, y un desconocido o de otra clínica no", async () => {
  for (const uid of ["adminA", "cajaA", "recepA", "dentA", "asisA"]) {
    await permitido(`${uid} lee`, getDoc(authed(uid), RC("clA", "caja__2026-10-01")));
  }
  await denegado("anon", getDoc(anon(), RC("clA", "caja__2026-10-01")));
  await denegado("adminB", getDoc(authed("adminB"), RC("clA", "caja__2026-10-01")));
});

caso("rutina del administrador: el admin de otra clínica no escribe en la mía", async () => {
  await denegado("adminB tilda en clA", setDoc(authed("adminB"), RC("clA", "caja__2026-10-08"), casillero("caja__2026-10-08")));
});

caso("rutina del administrador: con la suscripción vencida se lee y no se escribe", async () => {
  await permitido("adminV lee", getDoc(authed("adminV"), RC("clV", "caja__2026-10-01")));
  await denegado("adminV tilda", setDoc(authed("adminV"), RC("clV", "caja__2026-10-02"), casillero("caja__2026-10-02")));
  await denegado("adminV destilda", deleteDoc(authed("adminV"), RC("clV", "caja__2026-10-01")));
});

caso("rutina del administrador: la demo es abierta para quien tiene sesión, no para un anónimo sin sesión", async () => {
  await permitido("cualquiera tilda", setDoc(authed("cualquiera"), RC("cl_demo", "caja__2026-10-07"), casillero("caja__2026-10-07")));
  await permitido("cualquiera destilda", deleteDoc(authed("cualquiera"), RC("cl_demo", "caja__2026-10-07")));
  await denegado("anon tilda", setDoc(anon(), RC("cl_demo", "caja__2026-10-08"), casillero("caja__2026-10-08")));
});

/* ══ ESPACIOS BLOQUEADOS DE LA AGENDA (agendaBlocks) ═════════════════════════════════════════════════
 * La regla es la de las citas: lee todo miembro, el usuario de servicio (la reserva online) y la demo; escribe cualquier miembro con la
 * suscripción al día. Quién bloquea (agenda.edit) lo esconde la interfaz, igual que con las citas. */
const BL = (cid, id) => `clinics/${cid}/agendaBlocks/${id}`;

caso("bloqueos de agenda: todos los miembros leen (también la lista del día); un desconocido o alguien de otra clínica no", { diferencia: "La lista de otra clínica: Firestore rechaza la consulta, Postgres la contesta vacía (los hay)." }, async () => {
  for (const uid of ["adminA", "cajaA", "recepA", "dentA", "asisA"]) {
    await permitido(`${uid} lee`, getDoc(authed(uid), BL("clA", "blSeed")));
  }
  const dia = await permitido("recepA lista los bloqueos de un rango", getDocs(authed("recepA"), "clinics/clA/agendaBlocks", { rango: ["start", "2026-10-11", "2026-10-14"] }));
  assert.ok(dia.ids.includes("blSeed"));
  await denegado("anon", getDoc(anon(), BL("clA", "blSeed")));
  await denegado("adminB", getDoc(authed("adminB"), BL("clA", "blSeed")));
  await denegado("adminB lista la colección de clA", consultaFiltrada(await getDocs(authed("adminB"), "clinics/clA/agendaBlocks"), () => false));
});

caso("bloqueos de agenda: los crea, cambia y quita cualquier miembro con la suscripción al día, como las citas", async () => {
  for (const uid of ["adminA", "cajaA", "recepA", "dentA", "asisA"]) {
    await permitido(`${uid} crea`, setDoc(authed(uid), BL("clA", `bl_${uid}`), bloqueoDeAgenda(`bl_${uid}`)));
    await permitido(`${uid} cambia (merge)`, setDoc(authed(uid), BL("clA", `bl_${uid}`), { reason: "Reunión" }, { merge: true }));
    await permitido(`${uid} quita`, deleteDoc(authed(uid), BL("clA", `bl_${uid}`)));
  }
});

caso("bloqueos de agenda: un miembro dado de baja o alguien de otra clínica no escribe ni borra", async () => {
  await denegado("exA crea", setDoc(authed("exA"), BL("clA", "bl_ex"), bloqueoDeAgenda("bl_ex")));
  await denegado("exA borra", deleteDoc(authed("exA"), BL("clA", "blSeed")));
  await denegado("adminB crea", setDoc(authed("adminB"), BL("clA", "bl_b"), bloqueoDeAgenda("bl_b")));
  await denegado("adminB borra", deleteDoc(authed("adminB"), BL("clA", "blSeed")));
});

caso("bloqueos de agenda: el usuario de servicio (la reserva online) los lee", async () => {
  await permitido("svc1 lee", getDoc(authed("svc1"), BL("clA", "blSeed")));
  const dia = await permitido("svc1 lista un rango", getDocs(authed("svc1"), "clinics/clA/agendaBlocks", { rango: ["start", "2026-10-11", "2026-10-14"] }));
  assert.ok(dia.ids.includes("blSeed"));
});

caso("bloqueos de agenda: con la suscripción vencida se leen y no se crean ni se quitan", async () => {
  await permitido("adminV lee", getDoc(authed("adminV"), BL("clV", "blV")));
  await denegado("adminV crea", setDoc(authed("adminV"), BL("clV", "blV2"), bloqueoDeAgenda("blV2", "clV")));
  await denegado("adminV quita", deleteDoc(authed("adminV"), BL("clV", "blV")));
});

caso("bloqueos de agenda: la demo se lee sin sesión y se escribe solo con sesión", async () => {
  await permitido("cualquiera crea", setDoc(authed("cualquiera"), BL("cl_demo", "bl_demo"), bloqueoDeAgenda("bl_demo", "cl_demo")));
  await permitido("anon lee", getDoc(anon(), BL("cl_demo", "bl_demo")));
  await denegado("anon crea", setDoc(anon(), BL("cl_demo", "bl_anon"), bloqueoDeAgenda("bl_anon", "cl_demo")));
  await permitido("cualquiera quita", deleteDoc(authed("cualquiera"), BL("cl_demo", "bl_demo")));
});
