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
import { app, fsdb, createAuthUser, signInEmail, currentIdToken } from "./firebase";

/** Autenticación anónima: requisito de las reglas de producción
 *  (`request.auth != null`). Si el proveedor no está habilitado, seguimos
 *  igual — las reglas decidirán. */
async function ensureAuth() {
  try {
    const { getAuth, signInAnonymously } = await import("firebase/auth");
    const auth = getAuth(app);
    if (!auth.currentUser) await signInAnonymously(auth);
  } catch (e) {
    console.warn("Auth anónima no disponible:", e);
  }
}
import type {
  DB, Session, Appointment, Patient, BillingRecord, User, Procedure, EmrNote, ToothRecord,
  Budget, Payment, Expense, StockItem, StockMove, WaitlistEntry, Prescription, PatientFileRec, OrthoRecord, Clinic,
  OutboxTask, OutboxResult, RecoveryMonitor,
} from "./types";
import { buildSeed } from "./seed";
import { submitToBilling, releaseFromHold } from "./billing";
import { planUserLimitError } from "./plan";
import { worstSeverity } from "./recovery";

const DB_KEY = "novudent.db.v4";
const SES_KEY = "novudent.session.v1";
const DEMO_CLINIC_ID = "cl_demo";
/** Clínica activa (multi-clínica). Se resuelve desde la sesión guardada antes
 *  de cargar Firestore; cambia al iniciar sesión con una cuenta de otra clínica. */
let CLINIC_ID = DEMO_CLINIC_ID;
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
  const col = (name: string) => getDocs(collection(fsdb, "clinics", CLINIC_ID, name));
  const [users, patients, appointments, billing, procedures, budgets, payments, expenses, stock, stockMoves, waitlist, outbox, recoveryMonitors] = await Promise.all([
    col("users"), col("patients"), col("appointments"), col("billing"), col("procedures"),
    col("budgets"), col("payments"), col("expenses"), col("stock"), col("stockMoves"), col("waitlist"), col("outbox"), col("recoveryMonitors"),
  ]);
  const db: DB = {
    clinics: [{ id: CLINIC_ID, name: meta.name, plan: meta.plan, config: meta.config }],
    users: users.docs.map((d) => d.data() as User),
    patients: patients.docs.map((d) => d.data() as Patient),
    appointments: appointments.docs.map((d) => d.data() as Appointment),
    billing: billing.docs.map((d) => d.data() as BillingRecord),
    procedures: procedures.docs.map((d) => d.data() as Procedure),
    budgets: budgets.docs.map((d) => d.data() as Budget),
    payments: payments.docs.map((d) => d.data() as Payment),
    expenses: expenses.docs.map((d) => d.data() as Expense),
    stock: stock.docs.map((d) => d.data() as StockItem),
    stockMoves: stockMoves.docs.map((d) => d.data() as StockMove),
    waitlist: waitlist.docs.map((d) => d.data() as WaitlistEntry),
    outbox: outbox.docs.map((d) => d.data() as OutboxTask),
    recoveryMonitors: recoveryMonitors.docs.map((d) => d.data() as RecoveryMonitor),
    onboarding: meta.onboarding ?? { usersCreated: false, servicesDefined: false, tourDone: false },
  };
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
  setTooth: (patientId: string, tooth: string, rec: ToothRecord | null) => void;
  addPerioSession: (patientId: string, session: import("./types").PerioSession) => void;
  upsertBilling: (b: BillingRecord) => void;
  submitBilling: (id: string) => void;
  releaseBilling: (id: string) => void;
  toggleAch: (id: string) => void;
  toggleFollowUp: (id: string) => void;
  upsertUser: (u: User) => void;
  upsertProcedure: (p: Procedure) => void;
  setOnboarding: (k: keyof DB["onboarding"], v: boolean) => void;
  /* — Presupuestos — */
  upsertBudget: (b: Budget) => void;
  deleteBudget: (id: string) => void;
  /* — Caja — */
  addPayment: (p: Payment) => void;
  deletePayment: (id: string) => void;
  addExpense: (e: Expense) => void;
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
    try {
      const s = localStorage.getItem(SES_KEY);
      if (s) setSession(JSON.parse(s));
    } catch {}
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
  const persist = useCallback((next: DB) => {
    setDb(next);
    try { localStorage.setItem(DB_KEY, JSON.stringify(next)); } catch {}
  }, []);

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
  const fsSave = useCallback((colName: string, id: string, data: unknown) => {
    if (backendRef.current !== "firebase") return;
    setDoc(doc(fsdb, "clinics", clinicIdRef.current, colName, id), clean(data)).catch((e) => console.warn("fsSave", e));
  }, []);
  const fsDelete = useCallback((colName: string, id: string) => {
    if (backendRef.current !== "firebase") return;
    deleteDoc(doc(fsdb, "clinics", clinicIdRef.current, colName, id)).catch((e) => console.warn("fsDelete", e));
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
        let u =
          db.users.find((x) => x.authUid === uid) ??
          db.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
        if (!u && backendRef.current === "firebase") {
          /* Multi-clínica: la cuenta puede pertenecer a OTRA clínica.
           * El directorio global uid → clinicId nos dice cuál; cargamos esa
           * clínica completa y seguimos ahí. */
          const dir = await getDoc(doc(fsdb, "directory", uid)).catch(() => null);
          const clinicId = dir?.exists() ? (dir.data() as any).clinicId : null;
          if (clinicId && clinicId !== CLINIC_ID) {
            CLINIC_ID = clinicId;
            const remote = await loadFirestore();
            u =
              remote.users.find((x) => x.authUid === uid) ??
              remote.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
            if (u) {
              setDb(remote);
              try { localStorage.setItem(DB_KEY, JSON.stringify(remote)); } catch {}
            } else {
              CLINIC_ID = resolveClinicId(); // revertimos: el doc de usuario no está
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
      logout: () => { setSession(null); localStorage.removeItem(SES_KEY); },
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
            currentIds.filter((i) => !seedIds.includes(i)).forEach((i) => fsDelete(colName, i));
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
      setTooth: (patientId, tooth, rec) =>
        patchPatient(patientId, (p) => {
          const od = { ...(p.odontogram ?? {}) };
          if (rec) od[tooth] = rec; else delete od[tooth];
          return { ...p, odontogram: od };
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
        persist({ ...db, payments: [...db.payments, p] });
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
export function fmtGs(n: number) {
  return "Gs " + n.toLocaleString("es-PY");
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
