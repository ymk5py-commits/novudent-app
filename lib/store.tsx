"use client";
/**
 * Capa de datos de Novudent.
 * Backend real: Firestore (clinics/{id} + subcolecciones) con write-through.
 * Fallback: localStorage si Firestore no está disponible (p. ej., base aún no
 * creada en la consola o reglas que deniegan acceso). La UI consume la misma
 * interfaz en ambos modos.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, onSnapshot,
} from "firebase/firestore";
import { app, fsdb, createAuthUser, signInEmail, currentIdToken, signOutUser, currentAuthUid } from "./firebase";

/** Espera a que Firebase Auth termine de restaurar la sesión guardada.
 *
 *  ⚠️ ACÁ VIVÍA UN `signInAnonymously` Y NO HAY QUE REPONERLO.
 *
 *  Existía porque las reglas desplegadas en producción eran las de por defecto
 *  de Firebase (`allow read, write: if request.auth != null`), o sea que hacía
 *  falta CUALQUIER sesión para leer algo. Con las reglas reales ya desplegadas
 *  eso no aplica: `isDemo(cid)` es `cid == 'cl_demo'` y no pide sesión, y los
 *  usuarios reales entran con email y contraseña.
 *
 *  Y hacía daño de dos formas:
 *
 *  1. ROMPÍA LA SESIÓN REAL. La restauración de Firebase es asíncrona: en una
 *     carga fría `auth.currentUser` es `null` aunque el usuario tenga sesión
 *     válida. El `if (!auth.currentUser) signInAnonymously(...)` se disparaba
 *     entonces y le PISABA la sesión real con una anónima. Con la regla abierta
 *     no se notaba (cualquier sesión servía); con las reglas reales, anónimo no
 *     es miembro de ninguna clínica → Firestore deniega → el store cae a "modo
 *     local" y descarta las escrituras en silencio. Ese era el "entro y no
 *     guarda nada".
 *  2. Dejaba basura: una cuenta anónima nueva por visita. Se habían acumulado
 *     213 de 216 usuarios del proyecto.
 *
 *  Lo que sí hace falta es ESPERAR a que la restauración termine antes de
 *  consultar Firestore, para que `loadFirestore` corra con el usuario de verdad
 *  y no con `null`. */
async function ensureAuth() {
  try {
    const { getAuth } = await import("firebase/auth");
    await getAuth(app).authStateReady();
  } catch (e) {
    console.warn("No se pudo esperar el estado de sesión:", e);
  }
}
import type {
  DB, Session, Appointment, Patient, BillingRecord, User, Procedure, EmrNote, OdontogramStatus, OdontogramToothState, Budget, Payment, Expense, StockItem, StockMove, WaitlistEntry, Prescription, PatientFileRec, OrthoRecord, Clinic, OutboxTask, OutboxResult, RecoveryMonitor, RadiographRec, SignatureDoc, ConsentTemplate, PatientNote, FiscalDoc, CashSession, SterilizationCycle, TeamMessage, Survey, SurveyResponse, MgmtTask, EnvironmentalLog, EduVideo, Branch, CrmCard, Campaign, LabOrder, Settlement, Box, Subscription,
} from "./types";
import { DEFAULT_ODONTOGRAM_STATUS } from "./types";
import { buildSeed } from "./seed";
import { submitToBilling, releaseFromHold } from "./billing";
import { planUserLimitError } from "./plan";
import { worstSeverity } from "./recovery";
import { formatMoney, DEFAULT_CURRENCY, type CurrencyCode } from "./currency";
import { registrarFallo, resolverFallo, clasificarError } from "./write-errors";

const DB_KEY = "novudent.db.v4";
const SES_KEY = "novudent.session.v1";
const DEMO_CLINIC_ID = "cl_demo";
/** Clínica activa (multi-clínica). Se resuelve desde la sesión guardada antes
 *  de cargar Firestore; cambia al iniciar sesión con una cuenta de otra clínica. */
let CLINIC_ID = DEMO_CLINIC_ID;
/** Moneda activa de la clínica. La setea `loadFirestore` al cargar y
 *  `updateClinicConfig` al cambiarla; `fmtGs`/`fmtMoney` la consumen. */
let ACTIVE_CURRENCY: CurrencyCode = DEFAULT_CURRENCY;
function resolveClinicId(): string {
  try {
    const s = JSON.parse(localStorage.getItem(SES_KEY) || "null");
    if (s?.clinicId) return s.clinicId as string;
  } catch {}
  return DEMO_CLINIC_ID;
}
type Backend = "connecting" | "firebase" | "local";

/* Firestore no acepta `undefined` → sanitizamos vía JSON */
const clean = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function loadLocal(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {}
  const seed = buildSeed();
  try { localStorage.setItem(DB_KEY, JSON.stringify(seed)); } catch {}
  return seed;
}

async function seedFirestore(seed: DB) {
  const batch = writeBatch(fsdb);
  const clinic = seed.clinics[0];
  batch.set(doc(fsdb, "clinics", CLINIC_ID), clean({ ...clinic, onboarding: seed.onboarding }));
  for (const u of seed.users) batch.set(doc(fsdb, "clinics", CLINIC_ID, "users", u.id), clean(u));
  for (const p of seed.patients) batch.set(doc(fsdb, "clinics", CLINIC_ID, "patients", p.id), clean(p));
  for (const a of seed.appointments) batch.set(doc(fsdb, "clinics", CLINIC_ID, "appointments", a.id), clean(a));
  for (const b of seed.billing) batch.set(doc(fsdb, "clinics", CLINIC_ID, "billing", b.id), clean(b));
  for (const pr of seed.procedures) batch.set(doc(fsdb, "clinics", CLINIC_ID, "procedures", pr.cpt), clean(pr));
  for (const g of seed.budgets) batch.set(doc(fsdb, "clinics", CLINIC_ID, "budgets", g.id), clean(g));
  for (const p of seed.payments) batch.set(doc(fsdb, "clinics", CLINIC_ID, "payments", p.id), clean(p));
  for (const e of seed.expenses) batch.set(doc(fsdb, "clinics", CLINIC_ID, "expenses", e.id), clean(e));
  for (const s of seed.stock) batch.set(doc(fsdb, "clinics", CLINIC_ID, "stock", s.id), clean(s));
  for (const m of seed.stockMoves) batch.set(doc(fsdb, "clinics", CLINIC_ID, "stockMoves", m.id), clean(m));
  for (const w of seed.waitlist) batch.set(doc(fsdb, "clinics", CLINIC_ID, "waitlist", w.id), clean(w));
  for (const t of seed.outbox) batch.set(doc(fsdb, "clinics", CLINIC_ID, "outbox", t.id), clean(t));
  for (const n of seed.patientNotes) batch.set(doc(fsdb, "clinics", CLINIC_ID, "patientNotes", n.id), clean(n));
  for (const d of seed.fiscalDocs) batch.set(doc(fsdb, "clinics", CLINIC_ID, "fiscalDocs", d.id), clean(d));
  for (const cs of seed.cashSessions) batch.set(doc(fsdb, "clinics", CLINIC_ID, "cashSessions", cs.id), clean(cs));
  for (const sc of seed.sterilizationCycles) batch.set(doc(fsdb, "clinics", CLINIC_ID, "sterilizationCycles", sc.id), clean(sc));
  for (const tm of seed.teamMessages) batch.set(doc(fsdb, "clinics", CLINIC_ID, "teamMessages", tm.id), clean(tm));
  for (const s of seed.surveys) batch.set(doc(fsdb, "clinics", CLINIC_ID, "surveys", s.id), clean(s));
  for (const r of seed.surveyResponses) batch.set(doc(fsdb, "clinics", CLINIC_ID, "surveyResponses", r.id), clean(r));
  for (const mt of seed.mgmtTasks) batch.set(doc(fsdb, "clinics", CLINIC_ID, "mgmtTasks", mt.id), clean(mt));
  for (const e of seed.environmentalLogs) batch.set(doc(fsdb, "clinics", CLINIC_ID, "environmentalLogs", e.id), clean(e));
  for (const v of seed.eduVideos) batch.set(doc(fsdb, "clinics", CLINIC_ID, "eduVideos", v.id), clean(v));
  for (const br of seed.branches) batch.set(doc(fsdb, "clinics", CLINIC_ID, "branches", br.id), clean(br));
  await batch.commit();
}

async function loadFirestore(): Promise<DB> {
  const clinicSnap = await getDoc(doc(fsdb, "clinics", CLINIC_ID));
  if (!clinicSnap.exists()) {
    /* Solo la clínica demo se auto-siembra. Una clínica real inexistente
     * significa sesión huérfana → el caller limpia y vuelve a la demo. */
    if (CLINIC_ID !== DEMO_CLINIC_ID) throw new Error("CLINICA_NO_ENCONTRADA");
    const seed = buildSeed();
    await seedFirestore(seed);
    return seed;
  }
  const meta = clinicSnap.data() as any;
  /* Suscripción SaaS: colección RAÍZ, solo-lectura para el cliente (la escribe
   * el webhook con el usuario de servicio). Si no existe, la clínica es
   * anterior al cobro → grandfathered (ver lib/subscription.ts). */
  const subSnap = await getDoc(doc(fsdb, "subscriptions", CLINIC_ID)).catch(() => null);
  /* Una colección que el ROL no tiene permiso de leer devuelve vacío, no rompe.
   *
   * Esto no es defensa preventiva: sin el catch, Novudent queda INUTILIZABLE
   * para dentistas y asistentes en cuanto se despliegan las reglas de RBAC.
   * Las 31 colecciones se piden en un solo `Promise.all`, que rechaza al primer
   * error; `expenses` y `settlements` son admin-only por regla, así que el
   * permission-denied de un dentista tumbaba el arranque ENTERO y lo mandaba a
   * "modo local". O sea: la clínica compra el sistema y solo el dueño puede
   * entrar. Que no se haya notado todavía es porque las reglas del 30-jul
   * pueden no estar desplegadas — el bug estaba armado esperando ese deploy.
   *
   * Devolver vacío es lo correcto, no un parche: que una asistente no vea los
   * gastos ES la regla de negocio. La interfaz ya esconde esas pantallas por
   * `can(role, …)`, así que una lista vacía es exactamente lo que corresponde. */
  const col = async (name: string) => {
    try {
      return await getDocs(collection(fsdb, "clinics", CLINIC_ID, name));
    } catch (e: any) {
      if (e?.code === "permission-denied") return null;
      throw e; // red caída, cuota, config rota: eso sí tiene que explotar
    }
  };
  /** `.docs` de un snapshot que puede no haberse podido leer. */
  const filas = <T,>(snap: { docs: { data: () => unknown }[] } | null): T[] =>
    snap ? snap.docs.map((d) => d.data() as T) : [];
  const [users, patients, appointments, billing, procedures, budgets, payments, expenses, stock, stockMoves, waitlist, outbox, recoveryMonitors, radiographs, signatures, crmCards, campaigns, labOrders, settlements, boxes, patientNotes, fiscalDocs, cashSessions, sterilizationCycles, teamMessages, surveys, surveyResponses, mgmtTasks, environmentalLogs, eduVideos, branches] = await Promise.all([
    col("users"), col("patients"), col("appointments"), col("billing"), col("procedures"),
    col("budgets"), col("payments"), col("expenses"), col("stock"), col("stockMoves"), col("waitlist"), col("outbox"), col("recoveryMonitors"), col("radiographs"), col("signatures"),
    col("crmCards"), col("campaigns"), col("labOrders"), col("settlements"), col("boxes"), col("patientNotes"), col("fiscalDocs"), col("cashSessions"), col("sterilizationCycles"), col("teamMessages"), col("surveys"), col("surveyResponses"), col("mgmtTasks"), col("environmentalLogs"), col("eduVideos"), col("branches"),
  ]);
  const db: DB = {
    clinics: [{ id: CLINIC_ID, name: meta.name, plan: meta.plan, config: meta.config }],
    users: filas<User>(users),
    patients: filas<Patient>(patients),
    appointments: filas<Appointment>(appointments),
    billing: filas<BillingRecord>(billing),
    procedures: filas<Procedure>(procedures),
    budgets: filas<Budget>(budgets),
    payments: filas<Payment>(payments),
    expenses: filas<Expense>(expenses),
    stock: filas<StockItem>(stock),
    stockMoves: filas<StockMove>(stockMoves),
    waitlist: filas<WaitlistEntry>(waitlist),
    outbox: filas<OutboxTask>(outbox),
    recoveryMonitors: filas<RecoveryMonitor>(recoveryMonitors),
    radiographs: filas<RadiographRec>(radiographs),
    signatures: filas<SignatureDoc>(signatures),
    crmCards: filas<CrmCard>(crmCards),
    campaigns: filas<Campaign>(campaigns),
    labOrders: filas<LabOrder>(labOrders),
    settlements: filas<Settlement>(settlements),
    boxes: filas<Box>(boxes),
    patientNotes: filas<PatientNote>(patientNotes),
    fiscalDocs: filas<FiscalDoc>(fiscalDocs),
    cashSessions: filas<CashSession>(cashSessions),
    sterilizationCycles: filas<SterilizationCycle>(sterilizationCycles),
    teamMessages: filas<TeamMessage>(teamMessages),
    surveys: filas<Survey>(surveys),
    surveyResponses: filas<SurveyResponse>(surveyResponses),
    mgmtTasks: filas<MgmtTask>(mgmtTasks),
    environmentalLogs: filas<EnvironmentalLog>(environmentalLogs),
    eduVideos: filas<EduVideo>(eduVideos),
    branches: filas<Branch>(branches),
    onboarding: meta.onboarding ?? { usersCreated: false, servicesDefined: false, tourDone: false },
    subscription: subSnap?.exists() ? (subSnap.data() as Subscription) : null,
  };
  ACTIVE_CURRENCY = (db.clinics[0]?.config?.currency as CurrencyCode) ?? DEFAULT_CURRENCY;
  /* Upgrade v3: bases creadas antes de los módulos nuevos — sembramos
   * presupuestos/caja/inventario/espera demo una sola vez. SOLO en la demo:
   * una clínica real recién creada está vacía a propósito. */
  if (CLINIC_ID === DEMO_CLINIC_ID && db.budgets.length === 0 && db.stock.length === 0) {
    const seed = buildSeed();
    const batch = writeBatch(fsdb);
    for (const g of seed.budgets) batch.set(doc(fsdb, "clinics", CLINIC_ID, "budgets", g.id), clean(g));
    for (const p of seed.payments) batch.set(doc(fsdb, "clinics", CLINIC_ID, "payments", p.id), clean(p));
    for (const e of seed.expenses) batch.set(doc(fsdb, "clinics", CLINIC_ID, "expenses", e.id), clean(e));
    for (const s of seed.stock) batch.set(doc(fsdb, "clinics", CLINIC_ID, "stock", s.id), clean(s));
    for (const m of seed.stockMoves) batch.set(doc(fsdb, "clinics", CLINIC_ID, "stockMoves", m.id), clean(m));
    for (const w of seed.waitlist) batch.set(doc(fsdb, "clinics", CLINIC_ID, "waitlist", w.id), clean(w));
    /* enriquecer config (convenios/plantilla) y pacientes demo (recetas/ortodoncia) si faltan */
    const cfg = { ...seed.clinics[0].config, ...db.clinics[0].config };
    if (!db.clinics[0].config?.convenios) {
      batch.set(doc(fsdb, "clinics", CLINIC_ID), clean({ config: cfg }), { merge: true });
      db.clinics[0].config = cfg;
    }
    db.patients = db.patients.map((p) => {
      const sp = seed.patients.find((x) => x.id === p.id);
      if (!sp) return p;
      const upgraded = { ...p, prescriptions: p.prescriptions ?? sp.prescriptions, ortho: p.ortho ?? sp.ortho };
      if (upgraded !== p && (sp.prescriptions || sp.ortho)) batch.set(doc(fsdb, "clinics", CLINIC_ID, "patients", p.id), clean(upgraded));
      return upgraded;
    });
    db.users = db.users.map((u) => {
      const su = seed.users.find((x) => x.id === u.id);
      if (su?.commissionPct && u.commissionPct === undefined) {
        const up = { ...u, commissionPct: su.commissionPct };
        batch.set(doc(fsdb, "clinics", CLINIC_ID, "users", u.id), clean(up));
        return up;
      }
      return u;
    });
    await batch.commit().catch((e) => console.warn("upgrade v3", e));
    db.budgets = seed.budgets; db.payments = seed.payments; db.expenses = seed.expenses;
    db.stock = seed.stock; db.stockMoves = seed.stockMoves; db.waitlist = seed.waitlist;
  }
  /* Upgrade v4: integración Botika (outbox + NPS + config) — solo demo */
  if (CLINIC_ID === DEMO_CLINIC_ID && db.outbox.length === 0) {
    const seed = buildSeed();
    const batch = writeBatch(fsdb);
    for (const t of seed.outbox) batch.set(doc(fsdb, "clinics", CLINIC_ID, "outbox", t.id), clean(t));
    if (!db.clinics[0].config?.botika) {
      const cfg = { ...db.clinics[0].config, botika: seed.clinics[0].config.botika };
      batch.set(doc(fsdb, "clinics", CLINIC_ID), clean({ config: cfg }), { merge: true });
      db.clinics[0].config = cfg;
    }
    db.patients = db.patients.map((p) => {
      const sp = seed.patients.find((x) => x.id === p.id);
      if (sp?.nps && !p.nps) {
        const up = { ...p, nps: sp.nps };
        batch.set(doc(fsdb, "clinics", CLINIC_ID, "patients", p.id), clean(up));
        return up;
      }
      return p;
    });
    await batch.commit().catch((e) => console.warn("upgrade v4", e));
    db.outbox = seed.outbox;
  }
  return db;
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/** Reflejo idempotente del resultado de una tarea Botika sobre citas/pacientes.
 *  Devuelve el DB actualizado + los docs a persistir (solo si algo cambió). */
function reflectOutbox(prev: DB, task: OutboxTask): { next: DB; saves: [string, string, unknown][] } {
  let next = prev;
  const saves: [string, string, unknown][] = [];
  const r = task.result;
  if (!r) return { next, saves };
  // Un resultado con error NO refleja nada (cita/NPS). Cierra la asimetría con
  // el path de snapshot, que ya excluía las tareas no "respondido".
  if (r.error) return { next, saves };

  if ((task.type === "confirmar_cita" || task.type === "reagendar") && r.confirmed && task.refId) {
    const appt = next.appointments.find((a) => a.id === task.refId);
    if (appt && (appt.status !== "confirmada" || appt.confirmedVia !== "botika")) {
      const up = { ...appt, status: "confirmada" as const, reminderSent: true, confirmedVia: "botika" as const };
      next = { ...next, appointments: next.appointments.map((a) => (a.id === up.id ? up : a)) };
      saves.push(["appointments", up.id, up]);
    }
  }
  if (task.type === "nps" && typeof r.nps === "number") {
    const pat = next.patients.find((p) => p.id === task.patientId);
    // Idempotencia por `at`: no re-aplicar el mismo resultado.
    const already = pat?.npsHistory?.some((h) => h.at === r.at) || pat?.nps?.at === r.at;
    if (pat && !already) {
      const entry = { score: r.nps, comment: r.comment, at: r.at };
      // npsHistory acumula TODAS las encuestas (no se pierde el histórico);
      // `nps` guarda la última por compatibilidad con reportes.
      const prior = pat.npsHistory ?? (pat.nps ? [pat.nps] : []);
      const up = { ...pat, nps: entry, npsHistory: [entry, ...prior] };
      next = { ...next, patients: next.patients.map((p) => (p.id === up.id ? up : p)) };
      saves.push(["patients", up.id, up]);
    }
  }
  if (task.type === "postop" && r.severity && task.refId) {
    // refId = `${monitorId}#${offsetHours}` (lo setea Botika al materializar)
    const [monitorId, offsetStr] = String(task.refId).split("#");
    const mon = next.recoveryMonitors.find((m) => m.id === monitorId);
    if (mon) {
      const tps = mon.touchpoints.map((tp) =>
        String(tp.offsetHours) === offsetStr && tp.status !== "respondido"
          ? { ...tp, status: "respondido" as const, severity: r.severity, pain: r.pain, summary: r.summary, reply: r.comment, repliedAt: r.at }
          : tp
      );
      const worst = worstSeverity(tps);
      const escalated = tps.some((t) => t.severity === "rojo");
      const allDone = tps.every((t) => t.status === "respondido" || t.status === "vencido");
      const up: RecoveryMonitor = {
        ...mon, touchpoints: tps, worstSeverity: worst,
        status: escalated ? "escalado" : allDone ? "completado" : "activo",
        ...(escalated && !mon.alertedAt ? { alertedAt: r.at } : {}),
      };
      next = { ...next, recoveryMonitors: next.recoveryMonitors.map((m) => (m.id === up.id ? up : m)) };
      saves.push(["recoveryMonitors", up.id, up]);
      // si escaló por primera vez, encolar la alerta al doctor
      if (escalated && !mon.alertedAt) {
        const dentist = next.users.find((u) => u.id === mon.dentistId);
        const pat = next.patients.find((p) => p.id === mon.patientId);
        if (dentist?.phone) {
          const alertId = `postopalert_${monitorId}`;
          const alert: OutboxTask = {
            id: alertId, clinicId: mon.clinicId, type: "postop_alert" as const,
            patientId: mon.patientId, phone: dentist.phone,
            message: `🔴 ALERTA recuperación: ${pat ? pat.firstName + " " + pat.lastName : "paciente"} reporta posible complicación tras ${mon.procedure}. "${(r.summary || r.comment || "").slice(0, 140)}". Contactá al paciente.`,
            refId: monitorId, status: "pendiente" as const, createdAt: r.at, createdBy: "Monitor recuperación",
          };
          saves.push(["outbox", alertId, alert]);
        }
      }
    }
  }
  if (task.type === "negociacion" && r.negociacionStatus && task.refId) {
    const bud = next.budgets.find((b) => b.id === task.refId);
    if (bud) {
      const mapa: Record<"listo_para_cerrar" | "negociando" | "rechazado", "listo_para_cerrar" | "en_curso" | "sin_respuesta" | "rechazado"> = {
        listo_para_cerrar: "listo_para_cerrar",
        negociando: "en_curso",
        rechazado: "rechazado",
      } as const;
      const nuevoStatus = mapa[r.negociacionStatus];
      const up: Budget = {
        ...bud,
        negociacion: {
          ...(bud.negociacion ?? { intentos: 1, ultimoContactoAt: r.at }),
          status: nuevoStatus,
          financiacionElegida: r.financiacionElegida ?? bud.negociacion?.financiacionElegida,
          resumen: r.summary ?? bud.negociacion?.resumen,
          ultimoContactoAt: r.at,
        },
      };
      next = { ...next, budgets: next.budgets.map((b) => (b.id === up.id ? up : b)) };
      saves.push(["budgets", up.id, up]);
      if (nuevoStatus === "listo_para_cerrar") {
        const pat = next.patients.find((p) => p.id === bud.patientId);
        const alertId = `negolisto_${bud.id}`;
        const alert: OutboxTask = {
          id: alertId, clinicId: bud.clinicId, type: "negociacion_listo" as const,
          patientId: bud.patientId, phone: "",
          message: `💰 Presupuesto listo para cerrar: ${pat ? pat.firstName + " " + pat.lastName : "paciente"}${r.financiacionElegida ? ` (${r.financiacionElegida})` : ""}. Confirmá las condiciones.`,
          refId: bud.id, status: "pendiente" as const, createdAt: r.at, createdBy: "Negociación",
        };
        saves.push(["outbox", alertId, alert]);
      }
    }
  }
  return { next, saves };
}

interface Ctx {
  db: DB;
  session: Session | null;
  ready: boolean;
  backend: Backend;
  login: (userId: string) => void;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  createTeamUser: (data: { name: string; email: string; role: import("./types").Role; password: string; color: string; phone?: string }) => Promise<void>;
  /** Cambia la contraseña del usuario actual y limpia mustChangePassword (cambio inicial obligatorio) */
  changeMyPassword: (newPassword: string) => Promise<void>;
  logout: () => void;
  resetDemo: () => void;
  /** Restaura los datos de ejemplo SIN borrar cuentas reales (login vacío) */
  seedDemo: () => Promise<void>;
  upsertAppointment: (a: Appointment) => void;
  deleteAppointment: (id: string) => void;
  upsertPatient: (p: Patient) => void;
  completeForm: (patientId: string, formId: string, fields: { label: string; value: string }[], completedAt: string) => void;
  addEmrNote: (patientId: string, note: EmrNote) => void;
  /** Flujo clipboard: marca la actualización de historial médico como recibida con fecha de envío */
  markHistoryUpdate: (patientId: string, date: string) => void;
  /** Reemplaza el odontograma completo del paciente (lo llama el wrapper Odontogram.tsx en cada
   *  guardado — el motor reporta el payload entero, no diffs por diente). */
  setOdontogram: (patientId: string, status: OdontogramStatus, by: string) => void;
  /** Mezcla campos puntuales en UNA pieza sin necesitar el motor cargado (lo usa el Copiloto IA al
   *  aplicar hallazgos de una radiografía). Crea el odontograma si el paciente no tenía uno. */
  mergeOdontogramTooth: (patientId: string, tooth: string, fields: Partial<OdontogramToothState>, by: string) => void;
  addPerioSession: (patientId: string, session: import("./types").PerioSession) => void;
  upsertBilling: (b: BillingRecord) => void;
  submitBilling: (id: string) => void;
  releaseBilling: (id: string) => void;
  toggleAch: (id: string) => void;
  toggleFollowUp: (id: string) => void;
  upsertUser: (u: User) => void;
  upsertProcedure: (p: Procedure) => void;
  deleteProcedure: (cpt: string) => void;
  setOnboarding: (k: keyof DB["onboarding"], v: boolean) => void;
  /* — Presupuestos — */
  upsertBudget: (b: Budget) => void;
  deleteBudget: (id: string) => void;
  /* — Caja — */
  addPayment: (p: Payment) => void;
  deletePayment: (id: string) => void;
  addExpense: (e: Expense) => void;
  updateExpense: (e: Expense) => void;
  deleteExpense: (id: string) => void;
  /* — Inventario — */
  upsertStockItem: (s: StockItem) => void;
  deleteStockItem: (id: string) => void;
  /** registra movimiento y ajusta stock del ítem */
  addStockMove: (m: StockMove) => void;
  /* — Lista de espera — */
  addWaitlist: (w: WaitlistEntry) => void;
  removeWaitlist: (id: string) => void;
  /* — Ficha del paciente — */
  addPrescription: (patientId: string, rx: Prescription) => void;
  addPatientFile: (patientId: string, f: PatientFileRec) => void;
  removePatientFile: (patientId: string, fileId: string) => void;
  mergePatients: (keepId: string, removeId: string) => void;
  setOrtho: (patientId: string, ortho: OrthoRecord | null) => void;
  addOrthoControl: (patientId: string, c: { date: string; note: string; by: string }) => void;
  /* — Configuración — */
  updateClinicConfig: (patch: Partial<Clinic["config"]>) => void;
  importPatients: (list: Patient[]) => void;
  /* — Integración Botika (outbox) — */
  addOutboxTask: (t: OutboxTask) => void;
  deleteOutboxTask: (id: string) => void;
  /** Refleja el resultado que escribe Botika: actualiza tarea + cita/paciente según el tipo */
  applyOutboxResult: (taskId: string, result: OutboxResult) => void;
  /* — Negociación de presupuestos — */
  confirmNegociacion: (budgetId: string, by: string) => void;
  /* — Monitor de recuperación post-operatoria — */
  addRecoveryMonitor: (m: RecoveryMonitor) => void;
  resolveRecoveryMonitor: (id: string, by: string) => void;
  /* — Análisis IA de radiografías — */
  addRadiograph: (r: RadiographRec) => void;
  updateRadiograph: (r: RadiographRec) => void;
  deleteRadiograph: (id: string) => void;
  addPatientNote: (n: PatientNote) => void;
  updatePatientNote: (n: PatientNote) => void;
  deletePatientNote: (id: string) => void;
  addFiscalDoc: (d: FiscalDoc) => void;
  deleteFiscalDoc: (id: string) => void;
  voidPayment: (id: string, by: string, reason?: string) => void;
  /** Cheque acreditado en el banco. No toca el saldo del paciente — ya bajó al
   *  recibir el cheque; esto solo cambia su estado (ver checkStatus en lib/budgets.ts). */
  markCheckCobrado: (id: string, by: string) => void;
  openCashSession: (s: CashSession) => void;
  closeCashSession: (id: string, countedCash: number, note: string) => void;
  /* — Esterilización (cumplimiento) — */
  addSterilizationCycle: (c: SterilizationCycle) => void;
  updateSterilizationCycle: (c: SterilizationCycle) => void;
  deleteSterilizationCycle: (id: string) => void;
  /* — Chat interno del equipo — */
  addTeamMessage: (m: TeamMessage) => void;
  /* — Encuestas / NPS — */
  addSurvey: (s: Survey) => void;
  updateSurvey: (s: Survey) => void;
  deleteSurvey: (id: string) => void;
  /* — Tareas de gestión — */
  addMgmtTask: (t: MgmtTask) => void;
  updateMgmtTask: (t: MgmtTask) => void;
  deleteMgmtTask: (id: string) => void;
  /* — Registro ambiental — */
  addEnvironmentalLog: (e: EnvironmentalLog) => void;
  updateEnvironmentalLog: (e: EnvironmentalLog) => void;
  deleteEnvironmentalLog: (id: string) => void;
  /* — Videos educativos / 3D — */
  addEduVideo: (v: EduVideo) => void;
  updateEduVideo: (v: EduVideo) => void;
  deleteEduVideo: (id: string) => void;
  /* — Sucursales (multi-sede) — */
  addBranch: (b: Branch) => void;
  updateBranch: (b: Branch) => void;
  deleteBranch: (id: string) => void;
  /* — Firma electrónica / consentimientos — */
  addSignature: (s: SignatureDoc) => void;
  updateSignature: (s: SignatureDoc) => void;
  deleteSignature: (id: string) => void;
  /** Guarda las plantillas de consentimiento en el config de la clínica */
  saveConsentTemplates: (list: ConsentTemplate[]) => void;
  /* — CRM (embudo de pacientes) — */
  addCrmCard: (c: CrmCard) => void;
  updateCrmCard: (c: CrmCard) => void;
  deleteCrmCard: (id: string) => void;
  addCampaign: (c: Campaign) => void;
  updateCampaign: (c: Campaign) => void;
  deleteCampaign: (id: string) => void;
  /* — Laboratorios — */
  addLabOrder: (o: LabOrder) => void;
  updateLabOrder: (o: LabOrder) => void;
  deleteLabOrder: (id: string) => void;
  /* — Liquidaciones — */
  addSettlement: (s: Settlement) => void;
  updateSettlement: (s: Settlement) => void;
  deleteSettlement: (id: string) => void;
  /* — Box / Sillones — */
  addBox: (b: Box) => void;
  updateBox: (b: Box) => void;
  deleteBox: (id: string) => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(buildSeed);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [backend, setBackend] = useState<Backend>("connecting");
  const backendRef = useRef<Backend>("connecting");
  backendRef.current = backend;
  /* Clínica realmente cargada en memoria. TODA escritura a Firestore se ata a
   * ESTE id (no a la variable de módulo `CLINIC_ID`, que es mutable y puede
   * desincronizarse durante un cambio de clínica) → garantiza que los datos de
   * la clínica X nunca se escriban en la clínica Y. */
  const clinicIdRef = useRef<string>(DEMO_CLINIC_ID);
  clinicIdRef.current = db.clinics[0]?.id ?? CLINIC_ID;
  const activeClinicId = db.clinics[0]?.id ?? CLINIC_ID;

  useEffect(() => {
    let guardada: Session | null = null;
    try {
      const s = localStorage.getItem(SES_KEY);
      if (s) guardada = JSON.parse(s) as Session;
    } catch {}
    /* La sesión de localStorage NO alcanza para entrar a una clínica real: hay
     * que tener además la credencial de Firebase Auth, y que sea la de ESE
     * usuario. Antes se restauraba tal cual, así que cualquiera con acceso a la
     * PC escribía a mano `{"userId":…,"role":"admin"}` en esa clave y entraba —
     * o se autoascendía a admin para ver la recaudación y los sueldos, que se
     * calculan en el cliente. La demo (`cl_demo`) se restaura sin auth a
     * propósito: no tiene cuentas, se entra clickeando un rol. */
    if (guardada && guardada.clinicId !== DEMO_CLINIC_ID) {
      void currentAuthUid().then((uid) => {
        if (uid && uid === guardada!.userId) setSession(guardada);
        else {
          localStorage.removeItem(SES_KEY);
          try { localStorage.removeItem(DB_KEY); } catch {}
          setSession(null);
        }
      });
    } else if (guardada) {
      setSession(guardada);
    }
    CLINIC_ID = resolveClinicId();
    (async () => {
      try {
        await withTimeout(ensureAuth(), 6000).catch(() => {});
        let remote: DB;
        try {
          remote = await withTimeout(loadFirestore(), 9000);
        } catch (e: any) {
          if (String(e?.message).includes("CLINICA_NO_ENCONTRADA")) {
            // sesión apunta a una clínica que ya no existe → limpiar y volver a la demo
            localStorage.removeItem(SES_KEY);
            setSession(null);
            CLINIC_ID = DEMO_CLINIC_ID;
            remote = await withTimeout(loadFirestore(), 9000);
          } else throw e;
        }
        setDb(remote);
        setBackend("firebase");
      } catch (e) {
        console.warn("Firestore no disponible — usando modo local:", e);
        setDb(loadLocal());
        setBackend("local");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  /* persistencia local siempre (cache) + estado React */
  const persist = useCallback((next: DB | ((prev: DB) => DB)) => {
    setDb((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      try { localStorage.setItem(DB_KEY, JSON.stringify(resolved)); } catch {}
      return resolved;
    });
  }, []);

  /* ===== Tiempo real: suscripción (plan pagado) =====
   * `subscriptions/{cid}` la escribe SOLO el webhook de Lemon Squeezy — nunca el
   * cliente (firestore.rules). Antes se leía una vez con getDoc al cargar
   * loadFirestore y quedaba congelada en memoria: alguien pagaba una mejora de
   * plan con la pestaña abierta y el sistema seguía negándole los módulos y
   * usuarios del plan nuevo hasta que recargaba a mano. Con onSnapshot el pago
   * se refleja apenas el webhook escribe, sin F5 — mismo patrón que el outbox
   * de Botika, más abajo. */
  useEffect(() => {
    if (backend !== "firebase") return;
    const cid = activeClinicId;
    const unsub = onSnapshot(
      doc(fsdb, "subscriptions", cid),
      (snap) => {
        setDb((prev) => {
          // La clínica activa ya cambió (login multi-clínica): ignorar snapshot tardío.
          if ((prev.clinics[0]?.id ?? cid) !== cid) return prev;
          const subscription = snap.exists() ? (snap.data() as Subscription) : null;
          const next = { ...prev, subscription };
          try { localStorage.setItem(DB_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
      },
      (e) => console.warn("listener subscription:", e)
    );
    return unsub;
  }, [backend, activeClinicId]);

  /* ===== Tiempo real: outbox de Botika =====
   * Cuando el worker escribe `result`, la UI refleja EN VIVO la confirmación
   * de la cita o el NPS, sin recargar. El reflejo es idempotente. */
  useEffect(() => {
    if (backend !== "firebase") return;
    // Fijamos el id de la clínica al suscribir: la suscripción y los writes del
    // callback usan SIEMPRE el mismo `cid`, aunque la clínica activa cambie.
    const cid = activeClinicId;
    const unsub = onSnapshot(
      collection(fsdb, "clinics", cid, "outbox"),
      (snap) => {
        const incoming = snap.docs
          .map((d) => d.data() as OutboxTask)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setDb((prev) => {
          // Si la clínica activa ya cambió, ignoramos snapshots tardíos de la vieja.
          if ((prev.clinics[0]?.id ?? cid) !== cid) return prev;
          let next: DB = { ...prev, outbox: incoming };
          for (const t of incoming) {
            if (t.status !== "respondido") continue;
            const r = reflectOutbox(next, t);
            next = r.next;
            r.saves.forEach(([c, i, d]) =>
              setDoc(doc(fsdb, "clinics", cid, c, i), clean(d)).catch(() => {})
            );
          }
          try { localStorage.setItem(DB_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
      },
      (e) => console.warn("listener outbox:", e)
    );
    return unsub;
    // re-suscribir si cambia la clínica cargada (login multi-clínica)
  }, [backend, activeClinicId]);

  /* write-through a Firestore (no-op en modo local). Siempre escribe en la
   * clínica cargada en memoria (clinicIdRef), nunca en la global mutable. */
  /* Un fallo de escritura ya no muere en un console.warn.
   *
   * El store es write-through: el estado local se actualiza primero y la interfaz
   * dice "guardado" al instante. Si el setDoc de después fallaba —permisos,
   * suscripción vencida, red cortada— el usuario veía su trabajo en pantalla,
   * cerraba sesión y al volver no estaba. Sin un solo aviso. En una ficha clínica
   * eso es perder una evolución o un pago cobrado.
   *
   * Se avisa por un canal lateral (lib/write-errors.ts) en vez de propagar el
   * error: hay 83 llamadas a fsSave/fsDelete y cambiarles la firma a todas sería
   * enorme y riesgoso. El banner del Shell escucha ese canal. */
  const fsSave = useCallback((colName: string, id: string, data: unknown) => {
    if (backendRef.current !== "firebase") return;
    // Un id vacío hace crashear a Firestore doc() (ResourcePath.fromString(undefined));
    // guardá acá para que un doc mal formado nunca tumbe una operación de escritura.
    if (!id) { console.warn("fsSave: id vacío, se omite", colName); return; }
    const escribir = () =>
      setDoc(doc(fsdb, "clinics", clinicIdRef.current, colName, id), clean(data));
    escribir().then(
      () => resolverFallo(`${colName}/${id}`), // se recuperó: sacá el aviso
      (e) => {
        console.warn("fsSave", e);
        registrarFallo({
          coleccion: colName, docId: id,
          causa: clasificarError(e),
          detalle: (e as { code?: string })?.code ?? String(e),
          // El payload queda capturado en el closure, así que reintentar
          // reescribe exactamente lo que el usuario había cargado.
          reintentar: async () => { await escribir(); },
        });
      },
    );
  }, []);
  const fsDelete = useCallback((colName: string, id: string) => {
    if (backendRef.current !== "firebase") return;
    if (!id) { console.warn("fsDelete: id vacío, se omite", colName); return; }
    const borrar = () => deleteDoc(doc(fsdb, "clinics", clinicIdRef.current, colName, id));
    borrar().then(
      () => resolverFallo(`${colName}/${id}`),
      (e) => {
        console.warn("fsDelete", e);
        registrarFallo({
          coleccion: colName, docId: id,
          causa: clasificarError(e),
          detalle: (e as { code?: string })?.code ?? String(e),
          reintentar: async () => { await borrar(); },
        });
      },
    );
  }, []);
  const fsMeta = useCallback((dbNow: DB) => {
    if (backendRef.current !== "firebase") return;
    const c = dbNow.clinics[0];
    if (!c) return;
    setDoc(doc(fsdb, "clinics", c.id), clean({ ...c, onboarding: dbNow.onboarding }), { merge: true }).catch(() => {});
  }, []);

  const value = useMemo<Ctx>(() => {
    const by = session?.name ?? "sistema";

    const patchPatient = (patientId: string, fn: (p: Patient) => Patient) => {
      const cur = db.patients.find((x) => x.id === patientId);
      if (!cur) return;
      const next = fn(cur);
      persist({ ...db, patients: db.patients.map((x) => (x.id === patientId ? next : x)) });
      fsSave("patients", patientId, next);
    };
    const patchBilling = (id: string, fn: (b: BillingRecord) => BillingRecord) => {
      const cur = db.billing.find((x) => x.id === id);
      if (!cur) return;
      const next = fn(cur);
      persist({ ...db, billing: db.billing.map((x) => (x.id === id ? next : x)) });
      fsSave("billing", id, next);
    };

    return {
      db, session, ready, backend,
      login: (userId) => {
        const u = db.users.find((x) => x.id === userId);
        if (!u) return;
        const s: Session = { userId: u.id, clinicId: u.clinicId, role: u.role, name: u.name };
        setSession(s);
        localStorage.setItem(SES_KEY, JSON.stringify(s));
      },
      loginWithEmail: async (email, password) => {
        const uid = await signInEmail(email, password); // lanza error de Firebase si falla

        /* ESPERAR A QUE EL TOKEN LLEGUE A FIRESTORE.
         *
         * `signInWithEmailAndPassword` resuelve apenas Firebase Auth valida la
         * contraseña, pero el SDK de Firestore se entera del token nuevo por un
         * canal aparte y asíncrono. Sin esta espera, la primera lectura de abajo
         * salía SIN credencial: las reglas la rechazaban, el `catch` se la comía
         * y el login terminaba diciendo "tu cuenta no está asignada a ninguna
         * clínica" — con la clínica perfectamente creada y el usuario adentro.
         *
         * Antes no se notaba porque la app abría una sesión anónima al arrancar
         * y las reglas desplegadas aceptaban cualquier sesión: siempre había un
         * token. Al sacar la anónima y desplegar las reglas de verdad, quedó al
         * descubierto. */
        await currentAuthUid();

        /* IDENTIDAD POR uid, NUNCA POR EMAIL CONTRA LO QUE ESTÉ CARGADO.
         *
         * Acá había un segundo intento: `db.users.find(x => x.email === email)`.
         * El `db` en la pantalla de ingreso es SIEMPRE el de la demo (el logout
         * borra DB_KEY y `resolveClinicId` cae a `cl_demo`), y la demo se escribe
         * sin autenticar. O sea que cualquiera podía plantar un usuario en
         * `clinics/cl_demo/users/*` con el email de un admin real: ese admin
         * ponía su contraseña de verdad, Firebase la validaba, y el match por
         * email lo metía en la demo con el rol que el atacante hubiera escrito —
         * salteándose el bloque del directorio, que es el que resuelve la clínica
         * de verdad. Quedaba pegado ahí (la sesión persiste) y todo lo que
         * cargara —pacientes, historia clínica— iba a una clínica que se lee
         * desde internet sin credenciales.
         *
         * El match por `authUid` sí es seguro: lo compara contra el uid que
         * Firebase acaba de autenticar. El de email vive ahora dentro del bloque
         * del directorio, acotado a la clínica que el directorio indica. */
        let u = db.users.find((x) => x.authUid === uid);

        if (!u && backendRef.current === "firebase") {
          /* Multi-clínica: la cuenta pertenece a la clínica que diga el
           * directorio global (uid → clinicId). */
          let dirErr: unknown = null;
          const dir = await getDoc(doc(fsdb, "directory", uid)).catch((e) => { dirErr = e; return null; });
          const clinicId = dir?.exists() ? (dir.data() as any).clinicId : null;

          if (dirErr) {
            /* Antes esto se descartaba en silencio y el usuario recibía el
             * mensaje genérico de "no asignada", que manda a buscar el problema
             * al lugar equivocado. Si no se pudo leer el directorio es un fallo
             * de permisos o de red, y hay que decirlo. */
            console.error("login: no se pudo leer directory/", uid, dirErr);
            throw new Error("No pudimos verificar a qué clínica pertenece tu cuenta. Reintentá en unos segundos; si sigue igual, avisale al administrador.");
          }

          /* Se recarga SIEMPRE que el directorio indique una clínica, aunque
           * coincida con la que ya está en memoria. Antes se salteaba cuando
           * era la misma (`clinicId !== CLINIC_ID`) y ahí quedaba trabado: si un
           * intento anterior había dejado ese clinicId guardado, el `db` en
           * memoria seguía siendo el de la demo, no se recargaba nunca y el
           * login fallaba siempre con el mismo mensaje. */
          if (clinicId) {
            const anterior = CLINIC_ID;
            CLINIC_ID = clinicId;
            const remote = await loadFirestore();
            u =
              remote.users.find((x) => x.authUid === uid) ??
              remote.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
            if (u) {
              setDb(remote);
              try { localStorage.setItem(DB_KEY, JSON.stringify(remote)); } catch {}
            } else {
              CLINIC_ID = anterior; // revertimos: el doc de usuario no está
            }
          }
        }
        if (!u) {
          throw new Error("Tu cuenta existe pero no está asignada a ninguna clínica. Pedile al administrador que cree tu usuario en Configuración.");
        }
        if (!u.active) throw new Error("Tu usuario está desactivado. Contactá al administrador.");
        const s: Session = { userId: u.id, clinicId: u.clinicId, role: u.role, name: u.name };
        setSession(s);
        localStorage.setItem(SES_KEY, JSON.stringify(s));
      },
      createTeamUser: async ({ name, email, role, password, color, phone }) => {
        // límite del plan contratado (profesionales / usuarios activos)
        const limitErr = planUserLimitError(db.clinics[0], db.users, role);
        if (limitErr) throw new Error(limitErr);
        const cid = clinicIdRef.current; // clínica del admin que crea (la cargada)
        const uid = await createAuthUser(email, password); // cuenta real en Firebase Auth
        const u: User = { id: uid, authUid: uid, clinicId: cid, name, email, role, color, active: true, mustChangePassword: true, ...(phone?.trim() ? { phone: phone.trim() } : {}) };
        // Escribir el doc del usuario Y el directorio ANTES de declarar éxito:
        // si el write falla (reglas/red), el alta NO se reporta como exitosa
        // (no queda una cuenta de Auth sin doc). El directorio requiere que el
        // users/{uid} ya exista (regla), por eso va después y secuencial.
        if (backendRef.current === "firebase") {
          await setDoc(doc(fsdb, "clinics", cid, "users", u.id), clean(u));
          await setDoc(doc(fsdb, "directory", uid), { clinicId: cid, email });
        }
        persist({ ...db, users: [...db.users, u] });
      },
      changeMyPassword: async (newPassword) => {
        // El cambio ocurre EN EL SERVIDOR: rota la contraseña en Firebase Auth y
        // recién entonces limpia mustChangePassword (que es inmutable desde el
        // cliente por reglas). Así el gate no se puede saltar sin cambiar la clave.
        const token = await currentIdToken();
        if (!token) throw new Error("No hay sesión activa. Volvé a iniciar sesión.");
        const res = await fetch("/api/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          // clinicId como respaldo si directory/{uid} faltara (datos a medias)
          body: JSON.stringify({ newPassword, clinicId: session?.clinicId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo cambiar la contraseña.");
        // El servidor ya limpió el flag en Firestore → reflejarlo localmente para
        // que el gate deje pasar (en el próximo load llega confirmado del server).
        const me = db.users.find((u) => u.id === session?.userId);
        if (me) {
          const up = { ...me, mustChangePassword: false };
          persist({ ...db, users: db.users.map((u) => (u.id === up.id ? up : u)) });
        }
      },
      /* Cerrar sesión de verdad, en este orden:
       *   1. `signOutUser()` mata la credencial de Firebase Auth. Sin esto el
       *      logout era cosmético: la uid seguía autenticada en IndexedDB y
       *      cualquiera en esa PC volvía a entrar reescribiendo la clave de
       *      sesión en localStorage, o leía el padrón entero desde la consola.
       *   2. Se limpia el cache del padrón: tiene PII de pacientes (nombre, CI,
       *      historia, radiografías en base64) y no debe sobrevivir en una PC
       *      compartida de recepción (LGPD / Ley 1581).
       * `setSession(null)` va al final y es lo que además corta los listeners
       * en vivo, que si no seguían reescribiendo el padrón a localStorage
       * después de haberlo borrado. */
      logout: () => {
        void signOutUser().catch((e) => console.warn("signOut:", e));
        localStorage.removeItem(SES_KEY);
        try { localStorage.removeItem(DB_KEY); } catch { /* ignore */ }
        setSession(null);
      },
      seedDemo: async () => {
        if (clinicIdRef.current !== DEMO_CLINIC_ID) return; // jamás sobre una clínica real
        CLINIC_ID = DEMO_CLINIC_ID; // seedFirestore escribe en CLINIC_ID — lo forzamos a demo
        const seed = buildSeed();
        if (backendRef.current === "firebase") await seedFirestore(seed).catch((e) => console.warn("seedDemo", e));
        const realUsers = db.users.filter((u) => u.authUid && !seed.users.some((s) => s.id === u.id));
        persist({ ...seed, users: [...seed.users, ...realUsers] });
      },
      resetDemo: () => {
        if (clinicIdRef.current !== DEMO_CLINIC_ID) return; // jamás sobre una clínica real
        CLINIC_ID = DEMO_CLINIC_ID; // seedFirestore/fsDelete operan sobre demo
        const seed = buildSeed();
        if (backendRef.current === "firebase") {
          // borrar extras y reescribir semilla
          const delExtras = (colName: string, currentIds: string[], seedIds: string[]) =>
            currentIds.filter((i) => i && !seedIds.includes(i)).forEach((i) => fsDelete(colName, i));
          delExtras("users", db.users.map((x) => x.id), seed.users.map((x) => x.id));
          delExtras("patients", db.patients.map((x) => x.id), seed.patients.map((x) => x.id));
          delExtras("appointments", db.appointments.map((x) => x.id), seed.appointments.map((x) => x.id));
          delExtras("billing", db.billing.map((x) => x.id), seed.billing.map((x) => x.id));
          delExtras("procedures", db.procedures.map((x) => x.cpt), seed.procedures.map((x) => x.cpt));
          delExtras("budgets", db.budgets.map((x) => x.id), seed.budgets.map((x) => x.id));
          delExtras("payments", db.payments.map((x) => x.id), seed.payments.map((x) => x.id));
          delExtras("expenses", db.expenses.map((x) => x.id), seed.expenses.map((x) => x.id));
          delExtras("stock", db.stock.map((x) => x.id), seed.stock.map((x) => x.id));
          delExtras("stockMoves", db.stockMoves.map((x) => x.id), seed.stockMoves.map((x) => x.id));
          delExtras("waitlist", db.waitlist.map((x) => x.id), seed.waitlist.map((x) => x.id));
          delExtras("outbox", db.outbox.map((x) => x.id), seed.outbox.map((x) => x.id));
          // `mgmtTasks` guarda los OVERRIDES de las tareas automáticas (cerrada,
          // postergada, asignada). Sin borrarlos acá, "Reiniciar demo" no limpia
          // nada: el override sobrevive, y como su trabajo es SUPRIMIR la tarea
          // derivada, la bandeja queda muda para siempre.
          delExtras("mgmtTasks", db.mgmtTasks.map((x) => x.id), seed.mgmtTasks.map((x) => x.id));
          seedFirestore(seed).catch(() => {});
        }
        persist(seed);
      },
      upsertAppointment: (a) => {
        persist({ ...db, appointments: db.appointments.some((x) => x.id === a.id) ? db.appointments.map((x) => (x.id === a.id ? a : x)) : [...db.appointments, a] });
        fsSave("appointments", a.id, a);
      },
      deleteAppointment: (id) => {
        persist({ ...db, appointments: db.appointments.filter((x) => x.id !== id) });
        fsDelete("appointments", id);
      },
      upsertPatient: (p) => {
        persist({ ...db, patients: db.patients.some((x) => x.id === p.id) ? db.patients.map((x) => (x.id === p.id ? p : x)) : [...db.patients, p] });
        fsSave("patients", p.id, p);
      },
      mergePatients: (keepId, removeId) => {
        if (keepId === removeId) return;
        const keep = db.patients.find((p) => p.id === keepId);
        const remove = db.patients.find((p) => p.id === removeId);
        if (!keep || !remove) return;
        // Reasigna patientId en todas las colecciones y re-guarda los docs cambiados.
        const reassign = <T extends { id: string; patientId: string }>(col: string, arr: T[]): T[] =>
          arr.map((x) => {
            if (x.patientId !== removeId) return x;
            const up = { ...x, patientId: keepId };
            fsSave(col, x.id, up);
            return up;
          });
        const appointments = reassign("appointments", db.appointments);
        const billing = reassign("billing", db.billing);
        const budgets = reassign("budgets", db.budgets);
        const payments = reassign("payments", db.payments);
        const signatures = reassign("signatures", db.signatures);
        const radiographs = reassign("radiographs", db.radiographs);
        const recoveryMonitors = reassign("recoveryMonitors", db.recoveryMonitors);
        const crmCards = reassign("crmCards", db.crmCards);
        const labOrders = reassign("labOrders", db.labOrders);
        const patientNotes = reassign("patientNotes", db.patientNotes);
        const fiscalDocs = reassign("fiscalDocs", db.fiscalDocs);
        // Fusiona los datos embebidos en la ficha que se mantiene.
        const merged: Patient = {
          ...keep,
          forms: [...keep.forms, ...remove.forms],
          emr: [...keep.emr, ...remove.emr],
          files: [...(keep.files ?? []), ...(remove.files ?? [])],
          perio: [...(keep.perio ?? []), ...(remove.perio ?? [])],
          odontogram: (keep.odontogram || remove.odontogram) ? {
            ...DEFAULT_ODONTOGRAM_STATUS,
            ...(remove.odontogram ?? {}),
            ...(keep.odontogram ?? {}),
            teeth: { ...(remove.odontogram?.teeth ?? {}), ...(keep.odontogram?.teeth ?? {}) },
          } : undefined,
        };
        const patients = db.patients.filter((p) => p.id !== removeId).map((p) => (p.id === keepId ? merged : p));
        persist({ ...db, patients, appointments, billing, budgets, payments, signatures, radiographs, recoveryMonitors, crmCards, labOrders, patientNotes, fiscalDocs });
        fsSave("patients", keepId, merged);
        fsDelete("patients", removeId);
      },
      completeForm: (patientId, formId, fields, completedAt) =>
        patchPatient(patientId, (p) => {
          const forms = p.forms.map((f) => (f.id === formId ? { ...f, fields, status: "completado" as const, completedAt } : f));
          const stillPending = forms.some((f) => f.status === "pendiente");
          return { ...p, forms, historyUpdatePending: stillPending ? p.historyUpdatePending : false };
        }),
      addEmrNote: (patientId, note) => patchPatient(patientId, (p) => ({ ...p, emr: [note, ...p.emr] })),
      addPerioSession: (patientId, session) =>
        patchPatient(patientId, (p) => ({ ...p, perio: [session, ...(p.perio ?? [])] })),
      markHistoryUpdate: (patientId, date) =>
        patchPatient(patientId, (p) => ({ ...p, historyUpdatePending: false, historyUpdateDate: date })),
      setOdontogram: (patientId, status, by) =>
        patchPatient(patientId, (p) => ({
          ...p,
          odontogram: status,
          odontogramUpdatedBy: by,
          odontogramUpdatedAt: new Date().toISOString(),
        })),
      mergeOdontogramTooth: (patientId, tooth, fields, by) =>
        patchPatient(patientId, (p) => {
          const base: OdontogramStatus = p.odontogram ?? DEFAULT_ODONTOGRAM_STATUS;
          const teeth = { ...base.teeth, [tooth]: { ...(base.teeth[tooth] ?? {}), ...fields } };
          return {
            ...p,
            odontogram: { ...base, teeth },
            odontogramUpdatedBy: by,
            odontogramUpdatedAt: new Date().toISOString(),
          };
        }),
      upsertBilling: (b) => {
        persist({ ...db, billing: db.billing.some((x) => x.id === b.id) ? db.billing.map((x) => (x.id === b.id ? b : x)) : [...db.billing, b] });
        fsSave("billing", b.id, b);
      },
      submitBilling: (id) => patchBilling(id, (b) => submitToBilling(b, by)),
      releaseBilling: (id) => patchBilling(id, (b) => releaseFromHold(b, by)),
      toggleAch: (id) =>
        patchBilling(id, (b) => {
          const has = b.flags.includes("ACH");
          return {
            ...b,
            flags: has ? b.flags.filter((f) => f !== "ACH") : [...b.flags, "ACH"],
            history: [...b.history, { at: new Date().toISOString(), action: has ? "Pago automático desactivado (ACH)" : "Pago automático activado (ACH)", by }],
          };
        }),
      toggleFollowUp: (id) =>
        patchBilling(id, (b) => {
          const has = b.flags.includes("SEGUIMIENTO");
          return {
            ...b,
            flags: has ? b.flags.filter((f) => f !== "SEGUIMIENTO") : [...b.flags, "SEGUIMIENTO"],
            history: [...b.history, { at: new Date().toISOString(), action: has ? "Seguimiento completado (quita SEGUIMIENTO)" : "Marcado para seguimiento de pago (SEGUIMIENTO)", by }],
          };
        }),
      upsertUser: (u) => {
        persist({ ...db, users: db.users.some((x) => x.id === u.id) ? db.users.map((x) => (x.id === u.id ? u : x)) : [...db.users, u] });
        fsSave("users", u.id, u);
      },
      upsertProcedure: (p) => {
        persist({ ...db, procedures: db.procedures.some((x) => x.cpt === p.cpt) ? db.procedures.map((x) => (x.cpt === p.cpt ? p : x)) : [...db.procedures, p] });
        fsSave("procedures", p.cpt, p);
      },
      deleteProcedure: (cpt) => {
        persist({ ...db, procedures: db.procedures.filter((x) => x.cpt !== cpt) });
        fsDelete("procedures", cpt);
      },
      setOnboarding: (k, v) => {
        const next = { ...db, onboarding: { ...db.onboarding, [k]: v } };
        persist(next);
        fsMeta(next);
      },
      /* — Presupuestos — */
      upsertBudget: (b) => {
        persist({ ...db, budgets: db.budgets.some((x) => x.id === b.id) ? db.budgets.map((x) => (x.id === b.id ? b : x)) : [...db.budgets, b] });
        fsSave("budgets", b.id, b);
      },
      deleteBudget: (id) => {
        persist({ ...db, budgets: db.budgets.filter((x) => x.id !== id) });
        fsDelete("budgets", id);
      },
      /* — Caja — */
      addPayment: (p) => {
        // updater funcional → seguro al llamarse en bucle síncrono (pago multi-plan):
        // cada iteración parte del estado previo y acumula, sin last-write-wins.
        persist((prev) => ({ ...prev, payments: [...prev.payments, p] }));
        fsSave("payments", p.id, p);
      },
      deletePayment: (id) => {
        persist({ ...db, payments: db.payments.filter((x) => x.id !== id) });
        fsDelete("payments", id);
      },
      addExpense: (e) => {
        persist({ ...db, expenses: [...db.expenses, e] });
        fsSave("expenses", e.id, e);
      },
      updateExpense: (e) => {
        persist({ ...db, expenses: db.expenses.map((x) => (x.id === e.id ? e : x)) });
        fsSave("expenses", e.id, e);
      },
      deleteExpense: (id) => {
        persist({ ...db, expenses: db.expenses.filter((x) => x.id !== id) });
        fsDelete("expenses", id);
      },
      /* — Inventario — */
      upsertStockItem: (s) => {
        persist({ ...db, stock: db.stock.some((x) => x.id === s.id) ? db.stock.map((x) => (x.id === s.id ? s : x)) : [...db.stock, s] });
        fsSave("stock", s.id, s);
      },
      deleteStockItem: (id) => {
        persist({ ...db, stock: db.stock.filter((x) => x.id !== id), stockMoves: db.stockMoves.filter((m) => m.itemId !== id) });
        fsDelete("stock", id);
      },
      addStockMove: (m) => {
        const item = db.stock.find((s) => s.id === m.itemId);
        if (!item) return;
        // Una salida no puede exceder el stock disponible: registrar un movimiento
        // mayor dejaría el stock (clamp a 0) inconsistente con el qty guardado.
        if (m.type === "salida" && m.qty > item.stock) return;
        const delta = m.type === "entrada" ? m.qty : -m.qty;
        const updated = { ...item, stock: Math.max(0, item.stock + delta) };
        persist({ ...db, stock: db.stock.map((s) => (s.id === m.itemId ? updated : s)), stockMoves: [m, ...db.stockMoves] });
        fsSave("stock", updated.id, updated);
        fsSave("stockMoves", m.id, m);
      },
      /* — Lista de espera — */
      addWaitlist: (w) => {
        persist({ ...db, waitlist: [...db.waitlist, w] });
        fsSave("waitlist", w.id, w);
      },
      removeWaitlist: (id) => {
        persist({ ...db, waitlist: db.waitlist.filter((x) => x.id !== id) });
        fsDelete("waitlist", id);
      },
      /* — Ficha del paciente — */
      addPrescription: (patientId, rx) =>
        patchPatient(patientId, (p) => ({ ...p, prescriptions: [rx, ...(p.prescriptions ?? [])] })),
      addPatientFile: (patientId, f) =>
        patchPatient(patientId, (p) => ({ ...p, files: [f, ...(p.files ?? [])] })),
      removePatientFile: (patientId, fileId) =>
        patchPatient(patientId, (p) => ({ ...p, files: (p.files ?? []).filter((x) => x.id !== fileId) })),
      setOrtho: (patientId, ortho) =>
        patchPatient(patientId, (p) => ({ ...p, ortho: ortho ?? undefined })),
      addOrthoControl: (patientId, c) =>
        patchPatient(patientId, (p) =>
          p.ortho ? { ...p, ortho: { ...p.ortho, controls: [...p.ortho.controls, c] } } : p
        ),
      /* — Configuración — */
      updateClinicConfig: (patch) => {
        const c = db.clinics[0];
        const nextClinic = { ...c, config: { ...c.config, ...patch } };
        ACTIVE_CURRENCY = (nextClinic.config.currency as CurrencyCode) ?? DEFAULT_CURRENCY;
        const next = { ...db, clinics: [nextClinic] };
        persist(next);
        fsMeta(next);
      },
      importPatients: (list) => {
        persist({ ...db, patients: [...db.patients, ...list] });
        list.forEach((p) => fsSave("patients", p.id, p));
      },
      /* — Integración Botika (outbox) — */
      addOutboxTask: (t) => {
        persist({ ...db, outbox: [t, ...db.outbox] });
        fsSave("outbox", t.id, t);
      },
      deleteOutboxTask: (id) => {
        persist({ ...db, outbox: db.outbox.filter((x) => x.id !== id) });
        fsDelete("outbox", id);
      },
      applyOutboxResult: (taskId, result) => {
        const task = db.outbox.find((t) => t.id === taskId);
        if (!task) return;
        const updated: OutboxTask = { ...task, status: result.error ? "error" : "respondido", result };
        const base: DB = { ...db, outbox: db.outbox.map((t) => (t.id === taskId ? updated : t)) };
        const { next, saves } = reflectOutbox(base, updated);
        persist(next);
        saves.forEach(([c, i, d]) => fsSave(c, i, d));
        fsSave("outbox", updated.id, updated);
      },
      /* — Monitor de recuperación post-operatoria — */
      addRecoveryMonitor: (m) => {
        persist({ ...db, recoveryMonitors: [m, ...db.recoveryMonitors] });
        fsSave("recoveryMonitors", m.id, m);
      },
      resolveRecoveryMonitor: (id, by) => {
        const mon = db.recoveryMonitors.find((m) => m.id === id);
        if (!mon) return;
        const up = { ...mon, status: "completado" as const, resolvedAt: new Date().toISOString(), resolvedBy: by };
        persist({ ...db, recoveryMonitors: db.recoveryMonitors.map((m) => (m.id === id ? up : m)) });
        fsSave("recoveryMonitors", id, up);
      },
      /* — Análisis IA de radiografías — */
      addPatientNote: (n: PatientNote) => {
        persist({ ...db, patientNotes: [n, ...db.patientNotes] });
        fsSave("patientNotes", n.id, n);
      },
      updatePatientNote: (n: PatientNote) => {
        persist({ ...db, patientNotes: db.patientNotes.map((x) => (x.id === n.id ? n : x)) });
        fsSave("patientNotes", n.id, n);
      },
      deletePatientNote: (id: string) => {
        persist({ ...db, patientNotes: db.patientNotes.filter((x) => x.id !== id) });
        fsDelete("patientNotes", id);
      },
      addFiscalDoc: (d: FiscalDoc) => {
        persist({ ...db, fiscalDocs: [d, ...db.fiscalDocs] });
        fsSave("fiscalDocs", d.id, d);
      },
      deleteFiscalDoc: (id: string) => {
        persist({ ...db, fiscalDocs: db.fiscalDocs.filter((x) => x.id !== id) });
        fsDelete("fiscalDocs", id);
      },
      voidPayment: (id, by, reason) => {
        const p = db.payments.find((x) => x.id === id);
        if (!p) return;
        const up = { ...p, voidedAt: new Date().toISOString(), voidedBy: by, ...(reason ? { voidReason: reason } : {}) };
        persist({ ...db, payments: db.payments.map((x) => (x.id === id ? up : x)) });
        fsSave("payments", id, up);
      },
      markCheckCobrado: (id, by) => {
        const p = db.payments.find((x) => x.id === id);
        if (!p || !p.check) return;
        const up = { ...p, check: { ...p.check, cobradoAt: new Date().toISOString(), cobradoBy: by } };
        persist({ ...db, payments: db.payments.map((x) => (x.id === id ? up : x)) });
        fsSave("payments", id, up);
      },
      openCashSession: (s) => {
        persist({ ...db, cashSessions: [s, ...db.cashSessions] });
        fsSave("cashSessions", s.id, s);
      },
      closeCashSession: (id, countedCash, note) => {
        const s = db.cashSessions.find((x) => x.id === id);
        if (!s) return;
        const up: CashSession = { ...s, status: "cerrada", closedAt: new Date().toISOString(), countedCash, note: note || undefined };
        persist({ ...db, cashSessions: db.cashSessions.map((x) => (x.id === id ? up : x)) });
        fsSave("cashSessions", id, up);
      },
      addSterilizationCycle: (c) => {
        persist({ ...db, sterilizationCycles: [c, ...db.sterilizationCycles] });
        fsSave("sterilizationCycles", c.id, c);
      },
      updateSterilizationCycle: (c) => {
        persist({ ...db, sterilizationCycles: db.sterilizationCycles.map((x) => (x.id === c.id ? c : x)) });
        fsSave("sterilizationCycles", c.id, c);
      },
      deleteSterilizationCycle: (id) => {
        persist({ ...db, sterilizationCycles: db.sterilizationCycles.filter((x) => x.id !== id) });
        fsDelete("sterilizationCycles", id);
      },
      addTeamMessage: (m) => {
        persist((prev) => ({ ...prev, teamMessages: [...prev.teamMessages, m] }));
        fsSave("teamMessages", m.id, m);
      },
      addSurvey: (s) => {
        persist({ ...db, surveys: [s, ...db.surveys] });
        fsSave("surveys", s.id, s);
      },
      updateSurvey: (s) => {
        persist({ ...db, surveys: db.surveys.map((x) => (x.id === s.id ? s : x)) });
        fsSave("surveys", s.id, s);
      },
      deleteSurvey: (id) => {
        persist({ ...db, surveys: db.surveys.filter((x) => x.id !== id) });
        fsDelete("surveys", id);
      },
      addMgmtTask: (t) => {
        persist((prev) => ({ ...prev, mgmtTasks: [t, ...prev.mgmtTasks] }));
        fsSave("mgmtTasks", t.id, t);
      },
      updateMgmtTask: (t) => {
        persist((prev) => ({ ...prev, mgmtTasks: prev.mgmtTasks.map((x) => (x.id === t.id ? t : x)) }));
        fsSave("mgmtTasks", t.id, t);
      },
      deleteMgmtTask: (id) => {
        persist((prev) => ({ ...prev, mgmtTasks: prev.mgmtTasks.filter((x) => x.id !== id) }));
        fsDelete("mgmtTasks", id);
      },
      addEnvironmentalLog: (e) => {
        persist({ ...db, environmentalLogs: [e, ...db.environmentalLogs] });
        fsSave("environmentalLogs", e.id, e);
      },
      updateEnvironmentalLog: (e) => {
        persist({ ...db, environmentalLogs: db.environmentalLogs.map((x) => (x.id === e.id ? e : x)) });
        fsSave("environmentalLogs", e.id, e);
      },
      deleteEnvironmentalLog: (id) => {
        persist({ ...db, environmentalLogs: db.environmentalLogs.filter((x) => x.id !== id) });
        fsDelete("environmentalLogs", id);
      },
      addEduVideo: (v) => {
        persist({ ...db, eduVideos: [v, ...db.eduVideos] });
        fsSave("eduVideos", v.id, v);
      },
      updateEduVideo: (v) => {
        persist({ ...db, eduVideos: db.eduVideos.map((x) => (x.id === v.id ? v : x)) });
        fsSave("eduVideos", v.id, v);
      },
      deleteEduVideo: (id) => {
        persist({ ...db, eduVideos: db.eduVideos.filter((x) => x.id !== id) });
        fsDelete("eduVideos", id);
      },
      addBranch: (b) => {
        persist({ ...db, branches: [...db.branches, b] });
        fsSave("branches", b.id, b);
      },
      updateBranch: (b) => {
        persist({ ...db, branches: db.branches.map((x) => (x.id === b.id ? b : x)) });
        fsSave("branches", b.id, b);
      },
      deleteBranch: (id) => {
        persist({ ...db, branches: db.branches.filter((x) => x.id !== id) });
        fsDelete("branches", id);
      },
      addRadiograph: (r: RadiographRec) => {
        persist({ ...db, radiographs: [r, ...db.radiographs] });
        fsSave("radiographs", r.id, r);
      },
      updateRadiograph: (r: RadiographRec) => {
        persist({ ...db, radiographs: db.radiographs.map((x) => (x.id === r.id ? r : x)) });
        fsSave("radiographs", r.id, r);
      },
      deleteRadiograph: (id: string) => {
        persist({ ...db, radiographs: db.radiographs.filter((x) => x.id !== id) });
        fsDelete("radiographs", id);
      },
      /* — Firma electrónica / consentimientos — */
      addSignature: (s: SignatureDoc) => {
        persist({ ...db, signatures: [s, ...db.signatures] });
        fsSave("signatures", s.id, s);
      },
      updateSignature: (s: SignatureDoc) => {
        persist({ ...db, signatures: db.signatures.map((x) => (x.id === s.id ? s : x)) });
        fsSave("signatures", s.id, s);
      },
      deleteSignature: (id: string) => {
        persist({ ...db, signatures: db.signatures.filter((x) => x.id !== id) });
        fsDelete("signatures", id);
      },
      saveConsentTemplates: (list: ConsentTemplate[]) => {
        // Mismo mecanismo que `updateClinicConfig`: actualiza el config de la
        // clínica y lo persiste vía `fsMeta` (setDoc clinics/{id} con merge).
        const c = db.clinics[0];
        const nextClinic = { ...c, config: { ...c.config, consentTemplates: list } };
        const next = { ...db, clinics: [nextClinic] };
        persist(next);
        fsMeta(next);
      },
      /* — CRM (embudo de pacientes) — */
      addCrmCard: (c: CrmCard) => {
        persist({ ...db, crmCards: [c, ...db.crmCards] });
        fsSave("crmCards", c.id, c);
      },
      updateCrmCard: (c: CrmCard) => {
        persist({ ...db, crmCards: db.crmCards.map((x) => (x.id === c.id ? c : x)) });
        fsSave("crmCards", c.id, c);
      },
      deleteCrmCard: (id: string) => {
        persist({ ...db, crmCards: db.crmCards.filter((x) => x.id !== id) });
        fsDelete("crmCards", id);
      },
      addCampaign: (c: Campaign) => {
        persist({ ...db, campaigns: [c, ...db.campaigns] });
        fsSave("campaigns", c.id, c);
      },
      updateCampaign: (c: Campaign) => {
        persist({ ...db, campaigns: db.campaigns.map((x) => (x.id === c.id ? c : x)) });
        fsSave("campaigns", c.id, c);
      },
      deleteCampaign: (id: string) => {
        persist({ ...db, campaigns: db.campaigns.filter((x) => x.id !== id) });
        fsDelete("campaigns", id);
      },
      /* — Laboratorios — */
      addLabOrder: (o: LabOrder) => {
        persist({ ...db, labOrders: [o, ...db.labOrders] });
        fsSave("labOrders", o.id, o);
      },
      updateLabOrder: (o: LabOrder) => {
        persist({ ...db, labOrders: db.labOrders.map((x) => (x.id === o.id ? o : x)) });
        fsSave("labOrders", o.id, o);
      },
      deleteLabOrder: (id: string) => {
        persist({ ...db, labOrders: db.labOrders.filter((x) => x.id !== id) });
        fsDelete("labOrders", id);
      },
      /* — Liquidaciones — */
      addSettlement: (s: Settlement) => {
        persist({ ...db, settlements: [s, ...db.settlements] });
        fsSave("settlements", s.id, s);
      },
      updateSettlement: (s: Settlement) => {
        persist({ ...db, settlements: db.settlements.map((x) => (x.id === s.id ? s : x)) });
        fsSave("settlements", s.id, s);
      },
      deleteSettlement: (id: string) => {
        persist({ ...db, settlements: db.settlements.filter((x) => x.id !== id) });
        fsDelete("settlements", id);
      },
      /* — Box / Sillones — */
      addBox: (b: Box) => {
        persist({ ...db, boxes: [b, ...db.boxes] });
        fsSave("boxes", b.id, b);
      },
      updateBox: (b: Box) => {
        persist({ ...db, boxes: db.boxes.map((x) => (x.id === b.id ? b : x)) });
        fsSave("boxes", b.id, b);
      },
      deleteBox: (id: string) => {
        persist({ ...db, boxes: db.boxes.filter((x) => x.id !== id) });
        fsDelete("boxes", id);
      },
      /* — Negociación de presupuestos — */
      confirmNegociacion: (budgetId, by) => {
        const bud = db.budgets.find((b) => b.id === budgetId);
        if (!bud) return;
        const up: Budget = {
          ...bud,
          status: "aceptado" as const,
          negociacion: bud.negociacion ? { ...bud.negociacion, status: "listo_para_cerrar" as const } : undefined,
          history: [...bud.history, { at: new Date().toISOString(), action: "Aceptado tras negociación del bot", by }],
        };
        persist({ ...db, budgets: db.budgets.map((b) => (b.id === budgetId ? up : b)) });
        fsSave("budgets", budgetId, up);
      },
    };
  }, [db, session, ready, backend, persist, fsSave, fsDelete, fsMeta]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore fuera de StoreProvider");
  return ctx;
}

/* ===== Utilidades compartidas ===== */
/** Formatea un monto en la moneda activa de la clínica (configurable).
 *  Conserva el nombre `fmtGs` por compatibilidad; usar `fmtMoney` en código nuevo. */
export function fmtGs(n: number) {
  return formatMoney(n, ACTIVE_CURRENCY);
}
export const fmtMoney = fmtGs;
/** Moneda activa (para componentes que necesiten el símbolo/código). */
export function activeCurrency(): CurrencyCode {
  return ACTIVE_CURRENCY;
}
export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false });
}
export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short" });
}
export function fullName(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`;
}

/** Link de WhatsApp con mensaje precargado (confirmación de citas / cobranzas) */
export function waLink(phone: string, message: string) {
  const num = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

/** Rellena la plantilla de recordatorio con los datos de la cita */
export function fillReminder(template: string, vars: { paciente: string; fecha: string; hora: string; clinica: string }) {
  return template
    .replaceAll("{paciente}", vars.paciente)
    .replaceAll("{fecha}", vars.fecha)
    .replaceAll("{hora}", vars.hora)
    .replaceAll("{clinica}", vars.clinica);
}
