/** Carga de una clínica: qué lee la tienda al abrirla, cómo arma la `DB` y qué siembra o actualiza en la demo.
 *
 *  Antes vivía dentro de `lib/store.tsx` mezclada con las llamadas a Firestore (`loadFirestore` y `seedFirestore`). Acá solo hay decisiones y
 *  armado de datos: todo el acceso a la base pasa por `DatosDeBackend`, así que se prueba con el backend en memoria y sirve igual con cualquier
 *  otro. Pruebas: carga.test.ts. */
import type {
  AgendaBlock, Appointment, BillingRecord, Box, Branch, Budget, Campaign, CashSession, CrmCard, DB, DirectMessage, DocumentoClinico, EduVideo,
  EnvironmentalLog, Expense, FiscalDoc, LabOrder, MgmtTask, OutboxTask, Patient, PatientNote, Payment, Procedure, RadiographRec,
  RecoveryMonitor, RutinaCheck, Settlement, SignatureDoc, StockItem, StockMove, SterilizationCycle, Subscription, Survey, SurveyResponse,
  TeamMessage, User, WaitlistEntry,
} from "../types";
import { buildSeed } from "../seed";
import { can } from "../rbac";
import { CLINICA_DEMO } from "./constantes";
import type { DatosDeBackend, Doc, FiltroDeDirectos, LecturaDeClinica, OperacionDeLote } from "./tipos";

/** Qué parte de `directMessages` lee cada uno.
 *
 *  Un directo es de sus dos participantes y del admin (firestore.rules), y como las reglas NO son filtros, pedir la colección entera siendo
 *  recepcionista no devuelve «lo suyo»: Firestore rechaza la consulta ENTERA. Por eso cada uno pide sus conversaciones
 *  (`participants` contiene su id); la colección completa es para el admin y para la demo, que es pública. El rol sale del padrón que se está
 *  cargando —la misma fuente que usan las reglas— y no de la sesión de localStorage, que se edita a mano. */
export function filtroDeDirectos(cid: string, usuarios: Doc[], usuarioId: string | null): FiltroDeDirectos {
  if (cid === CLINICA_DEMO) return "todos";
  const yo = usuarioId ? (usuarios as unknown as User[]).find((u) => u.id === usuarioId) : undefined;
  if (!usuarioId || !yo || yo.active === false) return "ninguno";
  return can(yo.role, "users.manage") ? "todos" : { participante: usuarioId };
}

/** Las colecciones que trae la semilla de la demo (las otras —radiografías, firmas, CRM…— nacen vacías). */
const COLECCIONES_SEMBRADAS = [
  "users", "patients", "appointments", "billing", "procedures", "budgets", "payments", "expenses", "stock", "stockMoves", "waitlist", "outbox",
  "patientNotes", "fiscalDocs", "cashSessions", "sterilizationCycles", "teamMessages", "directMessages", "surveys", "surveyResponses",
  "mgmtTasks", "environmentalLogs", "eduVideos", "branches", "clinicalDocs", "routineChecks", "agendaBlocks",
] as const;

/** Las operaciones que escriben la semilla de la demo (el documento de la clínica y cada documento de las colecciones sembradas). */
export function opsDeSemilla(seed: DB): OperacionDeLote[] {
  const ops: OperacionDeLote[] = [{ tipo: "guardarClinica", data: { ...seed.clinics[0], onboarding: seed.onboarding } }];
  const listas = seed as unknown as Record<string, Array<Record<string, unknown>>>;
  for (const col of COLECCIONES_SEMBRADAS) {
    for (const x of listas[col]) ops.push({ tipo: "guardar", col, id: String(col === "procedures" ? x.cpt : x.id), data: x });
  }
  return ops;
}

const filas = <T,>(docs: Doc[] | undefined) => (docs ?? []) as unknown as T[];

/** Arma la `DB` de la tienda con lo que devolvió el backend. */
export function armarDB(cid: string, lectura: LecturaDeClinica): DB {
  const meta = lectura.clinica as any;
  const c = lectura.colecciones;
  return {
    clinics: [{ id: cid, name: meta.name, plan: meta.plan, config: meta.config }],
    users: filas<User>(c.users),
    patients: filas<Patient>(c.patients),
    appointments: filas<Appointment>(c.appointments),
    billing: filas<BillingRecord>(c.billing),
    procedures: filas<Procedure>(c.procedures),
    budgets: filas<Budget>(c.budgets),
    payments: filas<Payment>(c.payments),
    expenses: filas<Expense>(c.expenses),
    stock: filas<StockItem>(c.stock),
    stockMoves: filas<StockMove>(c.stockMoves),
    waitlist: filas<WaitlistEntry>(c.waitlist),
    outbox: filas<OutboxTask>(c.outbox),
    recoveryMonitors: filas<RecoveryMonitor>(c.recoveryMonitors),
    radiographs: filas<RadiographRec>(c.radiographs),
    signatures: filas<SignatureDoc>(c.signatures),
    crmCards: filas<CrmCard>(c.crmCards),
    campaigns: filas<Campaign>(c.campaigns),
    labOrders: filas<LabOrder>(c.labOrders),
    settlements: filas<Settlement>(c.settlements),
    boxes: filas<Box>(c.boxes),
    patientNotes: filas<PatientNote>(c.patientNotes),
    fiscalDocs: filas<FiscalDoc>(c.fiscalDocs),
    cashSessions: filas<CashSession>(c.cashSessions),
    sterilizationCycles: filas<SterilizationCycle>(c.sterilizationCycles),
    teamMessages: filas<TeamMessage>(c.teamMessages),
    directMessages: filas<DirectMessage>(c.directMessages),
    clinicalDocs: filas<DocumentoClinico>(c.clinicalDocs),
    routineChecks: filas<RutinaCheck>(c.routineChecks),
    agendaBlocks: filas<AgendaBlock>(c.agendaBlocks),
    surveys: filas<Survey>(c.surveys),
    surveyResponses: filas<SurveyResponse>(c.surveyResponses),
    mgmtTasks: filas<MgmtTask>(c.mgmtTasks),
    environmentalLogs: filas<EnvironmentalLog>(c.environmentalLogs),
    eduVideos: filas<EduVideo>(c.eduVideos),
    branches: filas<Branch>(c.branches),
    onboarding: meta.onboarding ?? { usersCreated: false, servicesDefined: false, tourDone: false },
    subscription: (lectura.suscripcion as Subscription | null) ?? null,
  };
}

/** Pone al día la demo (SOLO la demo: una clínica real recién creada está vacía a propósito). Modifica `db` y escribe lo que agrega. */
async function actualizarDemo(backend: DatosDeBackend, cid: string, db: DB): Promise<void> {
  if (cid !== CLINICA_DEMO) return;

  /* Upgrade v3: bases creadas antes de los módulos nuevos — sembramos presupuestos/caja/inventario/espera demo una sola vez. */
  if (db.budgets.length === 0 && db.stock.length === 0) {
    const seed = buildSeed();
    const ops: OperacionDeLote[] = [];
    for (const g of seed.budgets) ops.push({ tipo: "guardar", col: "budgets", id: g.id, data: g });
    for (const p of seed.payments) ops.push({ tipo: "guardar", col: "payments", id: p.id, data: p });
    for (const e of seed.expenses) ops.push({ tipo: "guardar", col: "expenses", id: e.id, data: e });
    for (const s of seed.stock) ops.push({ tipo: "guardar", col: "stock", id: s.id, data: s });
    for (const m of seed.stockMoves) ops.push({ tipo: "guardar", col: "stockMoves", id: m.id, data: m });
    for (const w of seed.waitlist) ops.push({ tipo: "guardar", col: "waitlist", id: w.id, data: w });
    /* enriquecer config (convenios/plantilla) y pacientes demo (recetas/ortodoncia) si faltan */
    const cfg = { ...seed.clinics[0].config, ...db.clinics[0].config };
    if (!db.clinics[0].config?.convenios) {
      ops.push({ tipo: "mezclarClinica", data: { config: cfg } });
      db.clinics[0].config = cfg;
    }
    db.patients = db.patients.map((p) => {
      const sp = seed.patients.find((x) => x.id === p.id);
      if (!sp) return p;
      const upgraded = { ...p, prescriptions: p.prescriptions ?? sp.prescriptions, ortho: p.ortho ?? sp.ortho };
      if (upgraded !== p && (sp.prescriptions || sp.ortho)) ops.push({ tipo: "guardar", col: "patients", id: p.id, data: upgraded });
      return upgraded;
    });
    db.users = db.users.map((u) => {
      const su = seed.users.find((x) => x.id === u.id);
      if (su?.commissionPct && u.commissionPct === undefined) {
        const up = { ...u, commissionPct: su.commissionPct };
        ops.push({ tipo: "guardar", col: "users", id: u.id, data: up });
        return up;
      }
      return u;
    });
    await backend.lote(cid, ops).catch((e) => console.warn("upgrade v3", e));
    db.budgets = seed.budgets; db.payments = seed.payments; db.expenses = seed.expenses;
    db.stock = seed.stock; db.stockMoves = seed.stockMoves; db.waitlist = seed.waitlist;
  }

  /* Upgrade v4: integración Botika (outbox + NPS + config) */
  if (db.outbox.length === 0) {
    const seed = buildSeed();
    const ops: OperacionDeLote[] = [];
    for (const t of seed.outbox) ops.push({ tipo: "guardar", col: "outbox", id: t.id, data: t });
    if (!db.clinics[0].config?.botika) {
      const cfg = { ...db.clinics[0].config, botika: seed.clinics[0].config.botika };
      ops.push({ tipo: "mezclarClinica", data: { config: cfg } });
      db.clinics[0].config = cfg;
    }
    db.patients = db.patients.map((p) => {
      const sp = seed.patients.find((x) => x.id === p.id);
      if (sp?.nps && !p.nps) {
        const up = { ...p, nps: sp.nps };
        ops.push({ tipo: "guardar", col: "patients", id: p.id, data: up });
        return up;
      }
      return p;
    });
    await backend.lote(cid, ops).catch((e) => console.warn("upgrade v4", e));
    db.outbox = seed.outbox;
  }
}

/** Carga la clínica `cid` desde el backend y devuelve la `DB` de la tienda.
 *  - Si no existe y es la demo, la siembra. Si no existe y es una clínica real, rechaza con `CLINICA_NO_ENCONTRADA` (sesión huérfana: quien
 *    llama limpia y vuelve a la demo).
 *  - Una colección que el rol no puede leer llega vacía (que una asistente no vea los gastos ES la regla de negocio; la interfaz ya esconde
 *    esas pantallas por `can(role, …)`).
 *  - Los errores de red, de cuota o de configuración sí rechazan. */
export async function cargarDB(backend: DatosDeBackend, cid: string): Promise<DB> {
  const lectura = await backend.leerClinica(cid, { directos: (usuarios, usuarioId) => filtroDeDirectos(cid, usuarios, usuarioId) });
  if (!lectura) {
    if (cid !== CLINICA_DEMO) throw new Error("CLINICA_NO_ENCONTRADA");
    const seed = buildSeed();
    await backend.lote(cid, opsDeSemilla(seed));
    return seed;
  }
  const db = armarDB(cid, lectura);
  await actualizarDemo(backend, cid, db);
  return db;
}
