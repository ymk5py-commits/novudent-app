"use client";
/**
 * Capa de datos de Novudent.
 * Backend real: Firestore (clinics/{id} + subcolecciones) con write-through.
 * Fallback: localStorage si Firestore no está disponible (p. ej., base aún no
 * creada en la consola o reglas que deniegan acceso). La UI consume la misma
 * interfaz en ambos modos.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { backendDeDatos } from "./backend";
import { cargarDB, opsDeSemilla } from "./backend/carga";
import { CLINICA_DEMO } from "./backend/constantes";

import type {
  DB, Session, Appointment, Patient, BillingRecord, User, Procedure, EmrNote, OdontogramStatus, OdontogramToothState, Budget, Payment, Expense, StockItem, StockMove, WaitlistEntry, Prescription, PatientFileRec, OrthoRecord, Clinic, OutboxTask, OutboxResult, RecoveryMonitor, RadiographRec, SignatureDoc, ConsentTemplate, PatientNote, FiscalDoc, CashSession, SterilizationCycle, TeamMessage, DirectMessage, Survey, SurveyResponse, MgmtTask, EnvironmentalLog, EduVideo, Branch, CrmCard, Campaign, LabOrder, Settlement, Box, Subscription,
  DocumentoClinico, RutinaCheck, RolId, QuitaDeLista, AgendaBlock,
} from "./types";
import { completarCache } from "./cacheLocal";
import { DEFAULT_ODONTOGRAM_STATUS } from "./types";
import { buildSeed } from "./seed";
import { can, aplicarRolesDeLaClinica, mismaConfiguracionDeRoles } from "./rbac";
import { fichaDemasiadoGrande, fusionarFichas, piezasEnConflicto, reasignarClaveDerivada, type ResultadoFusion } from "./fusionFichas";
import { citasSinBox } from "./boxes";
import { anularHistoriasClinicasRepetidas, historiaClinicaPendiente, plantillasDeClinica } from "./documentosClinicos";
import { submitToBilling, releaseFromHold } from "./billing";
import { worstSeverity } from "./recovery";
import { formatMoney, DEFAULT_CURRENCY, type CurrencyCode } from "./currency";
import { registrarFallo, resolverFallo, clasificarError, vigilarEscritura } from "./write-errors";
import { parseFecha } from "./tareas";
import { idCheck, type PasoId } from "./rutinaAdmin";
import { historiasClinicasPendientes } from "./documentosClinicos";
import { aplicarDatosClinica, type DatosClinica } from "./datosClinica";

const DB_KEY = "novudent.db.v4";
const SES_KEY = "novudent.session.v1";
const DEMO_CLINIC_ID = CLINICA_DEMO;
/** Id de la clínica de ejemplo: la pantalla de ingreso lo usa para saber si lo cargado es la demo. */
export const CLINICA_DEMO_ID = DEMO_CLINIC_ID;
/** Clínica activa (multi-clínica). Se resuelve desde la sesión guardada antes
 *  de cargar la base; cambia al iniciar sesión con una cuenta de otra clínica. */
let CLINIC_ID = DEMO_CLINIC_ID;
/** Moneda activa de la clínica. La setea `loadRemote` al cargar y
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

function loadLocal(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      // Un caché guardado antes de una colección nueva (chat directo, documentos clínicos, rutina, bloqueos de agenda) no la trae.
      return completarCache(JSON.parse(raw) as DB);
    }
  } catch {}
  const seed = buildSeed();
  try { localStorage.setItem(DB_KEY, JSON.stringify(seed)); } catch {}
  return seed;
}

/** Carga la clínica activa (`CLINIC_ID`) desde la base y deja lista su moneda. Qué se lee, cómo se arma la `DB` y qué se siembra o se pone al
 *  día en la demo: lib/backend/carga.ts (`cargarDB`). */
async function loadRemote(): Promise<DB> {
  const remota = await cargarDB(backendDeDatos, CLINIC_ID);
  ACTIVE_CURRENCY = (remota.clinics[0]?.config?.currency as CurrencyCode) ?? DEFAULT_CURRENCY;
  return remota;
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
  login: (userId: string) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  createTeamUser: (data: { name: string; email: string; role: RolId; password: string; color: string; phone?: string }) => Promise<void>;
  /** Cambia la contraseña del usuario actual y limpia mustChangePassword (cambio inicial obligatorio) */
  changeMyPassword: (newPassword: string) => Promise<void>;
  logout: () => void;
  /** La puerta de la demo (/login?demo=1): cierra la sesión de la clínica real que haya quedado
   *  en este navegador y carga la clínica de ejemplo. */
  entrarEnDemo: () => Promise<void>;
  resetDemo: () => void;
  /** Restaura los datos de ejemplo SIN borrar cuentas reales (login vacío) */
  seedDemo: () => Promise<void>;
  upsertAppointment: (a: Appointment) => void;
  deleteAppointment: (id: string) => void;
  /* — Espacios bloqueados de la agenda (lib/bloqueos.ts): se crean de a varios (una repetición) y se quitan de a uno o toda la serie — */
  addAgendaBlocks: (bs: AgendaBlock[]) => void;
  deleteAgendaBlocks: (ids: string[]) => void;
  upsertPatient: (p: Patient) => void;
  /** Quita a un paciente de «Sin próxima cita» o, con `null`, lo vuelve a incluir. A diferencia de `upsertPatient`, en Firestore escribe SOLO ese campo
   *  (`updateDoc`): la ficha que tiene la pantalla puede estar vieja y reescribirla entera (`setDoc` sin merge) pisaría lo que otra persona cargó
   *  después —el odontograma, las evoluciones—, sin ningún aviso. */
  setSeguimientoPaciente: (patientId: string, quita: QuitaDeLista | null) => void;
  /** Alta de un paciente nuevo: lo guarda y le deja la Historia Clínica pendiente (si la clínica la tiene). */
  crearPaciente: (p: Patient, por: { id: string; name: string }) => void;
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
  /** Guarda varios servicios de una vez (carga en bloque, ajuste de precios): un solo cambio de estado y de caché local. */
  upsertProcedures: (ps: Procedure[]) => void;
  deleteProcedure: (cpt: string) => void;
  setOnboarding: (k: keyof DB["onboarding"], v: boolean) => void;
  /* — Rutina del administrador: tildar o destildar un casillero (un documento por paso y período) — */
  setRutinaCheck: (paso: PasoId, periodo: string, hecho: boolean) => void;
  /* — Presupuestos — */
  upsertBudget: (b: Budget) => void;
  deleteBudget: (id: string) => void;
  /* — Caja — */
  addPayment: (p: Payment) => void;
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
  /** Reemplaza una receta existente (se usa para anularla: las recetas no se borran). */
  updatePrescription: (patientId: string, rx: Prescription) => void;
  addPatientFile: (patientId: string, f: PatientFileRec) => void;
  removePatientFile: (patientId: string, fileId: string) => void;
  /** Fusiona la ficha `removeId` dentro de `keepId` (irreversible). Se frena, sin tocar nada, si las dos juntas no entrarían en un documento. */
  mergePatients: (keepId: string, removeId: string) => ResultadoFusion;
  setOrtho: (patientId: string, ortho: OrthoRecord | null) => void;
  addOrthoControl: (patientId: string, c: { date: string; note: string; by: string }) => void;
  /* — Configuración — */
  /** `true` si se guardó (o no hay servidor); `false` si Firestore la rechazó (queda el aviso «No se guardó»). Se puede ignorar el resultado. */
  updateClinicConfig: (patch: Partial<Clinic["config"]>) => Promise<boolean>;
  /** Nombre (campo `name` del documento de la clínica), dirección y teléfono (`config`) de una sola vez, para que un solo guardado
   *  no pise al otro. Los datos tienen que venir revisados (`revisarDatosClinica`). Mismo resultado que `updateClinicConfig`. */
  updateClinicProfile: (datos: DatosClinica) => Promise<boolean>;
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
  /** Mensaje directo a una persona (lo arma lib/chat.ts nuevoDirecto). */
  addDirectMessage: (m: DirectMessage) => void;
  /** Difusión general del admin: una copia por destinatario (lib/chat.ts armarDifusion). */
  addDifusion: (copias: DirectMessage[]) => void;
  /** Marca como leídos los directos recibidos; ignora los que no son para la sesión. */
  markDirectsRead: (ids: string[]) => void;
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
  /* — Documentos clínicos (no se borran: se anulan con updateClinicalDoc) — */
  addClinicalDoc: (d: DocumentoClinico) => void;
  updateClinicalDoc: (d: DocumentoClinico) => void;
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
  /* Lo que la clínica configuró de sus roles (Permisos del equipo: permisos, roles propios y los otros nombres) se aplica en CADA
   * render, antes de que se pinte ninguna pantalla: las ~100 llamadas a `can(role, p)` y las etiquetas de rol (`rolLabel`) lo leen del
   * módulo y no hay que pasárselo a ninguna. */
  aplicarRolesDeLaClinica(db.clinics[0]?.config);
  // El estado más nuevo, para los reintentos de escrituras que reescriben un documento entero (ver `fsMeta`).
  const dbRef = useRef(db);
  useEffect(() => { dbRef.current = db; }, [db]);
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
      void backendDeDatos.usuarioActual().then((uid) => {
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
        await withTimeout(backendDeDatos.esperarSesion(), 6000).catch(() => {});
        let remote: DB;
        try {
          remote = await withTimeout(loadRemote(), 9000);
        } catch (e: any) {
          if (String(e?.message).includes("CLINICA_NO_ENCONTRADA")) {
            // sesión apunta a una clínica que ya no existe → limpiar y volver a la demo
            localStorage.removeItem(SES_KEY);
            setSession(null);
            CLINIC_ID = DEMO_CLINIC_ID;
            remote = await withTimeout(loadRemote(), 9000);
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

  /* ===== El ROL sale de Firestore, no de localStorage =====
   *
   * Al restaurar la sesión se verifica que el uid de Firebase coincida con el
   * guardado, pero `role`, `clinicId` y `name` seguían saliendo del JSON de
   * localStorage — que lo edita cualquiera desde la consola del navegador. Un
   * asistente con credenciales legítimas se ponía `"role":"admin"` y le abría
   * toda la interfaz de administración: reportes de recaudación, sueldos y
   * comisiones (que se calculan en el cliente, no en el servidor).
   *
   * Las reglas de Firestore igual le frenaban las ESCRITURAS de admin, así que
   * no era una vía para corromper datos; era una vía para VER lo que no le toca.
   * Acá el rol se re-deriva del doc de usuario apenas la base carga, que es la
   * misma fuente de verdad que usan las reglas. Y si el usuario ya no está o lo
   * dieron de baja, la sesión se cierra sola en vez de quedar colgada. */
  useEffect(() => {
    if (!ready || !session || session.clinicId === DEMO_CLINIC_ID) return;
    if (backend !== "firebase") return; // en modo local no hay padrón que consultar

    const real = db.users.find((u) => u.id === session.userId || u.authUid === session.userId);
    if (!real || real.active === false) {
      localStorage.removeItem(SES_KEY);
      try { localStorage.removeItem(DB_KEY); } catch {}
      setSession(null);
      return;
    }
    if (real.role !== session.role || real.clinicId !== session.clinicId || real.name !== session.name) {
      const s: Session = { userId: session.userId, clinicId: real.clinicId, role: real.role, name: real.name };
      setSession(s);
      try { localStorage.setItem(SES_KEY, JSON.stringify(s)); } catch {}
    }
  }, [ready, backend, db.users, session]);

  /* ===== Tiempo real: suscripción (plan pagado) =====
   * `subscriptions/{cid}` la escribe SOLO el webhook de Lemon Squeezy — nunca el
   * cliente (firestore.rules). Antes se leía una vez con getDoc al cargar
   * cargarDB y quedaba congelada en memoria: alguien pagaba una mejora de
   * plan con la pestaña abierta y el sistema seguía negándole los módulos y
   * usuarios del plan nuevo hasta que recargaba a mano. Con onSnapshot el pago
   * se refleja apenas el webhook escribe, sin F5 — mismo patrón que el outbox
   * de Botika, más abajo. */
  useEffect(() => {
    if (backend !== "firebase") return;
    const cid = activeClinicId;
    return backendDeDatos.escucharSuscripcion(
      cid,
      (suscripcion) => {
        setDb((prev) => {
          // La clínica activa ya cambió (login multi-clínica): ignorar snapshot tardío.
          if ((prev.clinics[0]?.id ?? cid) !== cid) return prev;
          const next = { ...prev, subscription: suscripcion as Subscription | null };
          try { localStorage.setItem(DB_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
      },
      (e) => console.warn("listener subscription:", e)
    );
  }, [backend, activeClinicId]);

  /* ===== Tiempo real: permisos y roles del equipo =====
   * El administrador reparte o saca permisos, crea roles y les cambia el nombre desde Configuración. Las reglas de Firestore ya aplican el
   * cambio en el momento, así que la pantalla de quien tiene la sesión abierta tiene que enterarse también: si no, seguiría mostrando un botón
   * que el servidor rechaza (o escondiendo uno que ya puede usar) hasta que recargue.
   * Se toman SOLO `config.permisos`, `config.rolesPropios` y `config.nombresDeRoles` del documento de la clínica, nunca el resto de la
   * configuración: un snapshot de otro momento no puede pisar lo que este navegador todavía está guardando (ver `fsMeta`). Si el eco de una
   * escritura propia trae lo mismo que ya hay, no se toca el estado. */
  useEffect(() => {
    if (backend !== "firebase") return;
    const cid = activeClinicId;
    return backendDeDatos.escucharClinica(
      cid,
      (clinicaRemota) => {
        const remota = (clinicaRemota as { config?: { permisos?: unknown; rolesPropios?: unknown; nombresDeRoles?: unknown } } | null)?.config;
        setDb((prev) => {
          if ((prev.clinics[0]?.id ?? cid) !== cid) return prev; // snapshot tardío de otra clínica
          const clinica = prev.clinics[0];
          if (!clinica || mismaConfiguracionDeRoles(clinica.config, remota)) return prev;
          const config = {
            ...clinica.config,
            permisos: remota?.permisos as typeof clinica.config.permisos,
            rolesPropios: remota?.rolesPropios as typeof clinica.config.rolesPropios,
            nombresDeRoles: remota?.nombresDeRoles as typeof clinica.config.nombresDeRoles,
          };
          const next: DB = { ...prev, clinics: [{ ...clinica, config }] };
          try { localStorage.setItem(DB_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
      },
      (e) => console.warn("listener roles:", e)
    );
  }, [backend, activeClinicId]);

  /* ===== Tiempo real: outbox de Botika =====
   * Cuando el worker escribe `result`, la UI refleja EN VIVO la confirmación
   * de la cita o el NPS, sin recargar. El reflejo es idempotente. */
  useEffect(() => {
    if (backend !== "firebase") return;
    // Fijamos el id de la clínica al suscribir: la suscripción y los writes del
    // callback usan SIEMPRE el mismo `cid`, aunque la clínica activa cambie.
    const cid = activeClinicId;
    return backendDeDatos.escucharColeccion(
      cid,
      "outbox",
      (docs) => {
        const incoming = [...(docs as unknown as OutboxTask[])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setDb((prev) => {
          // Si la clínica activa ya cambió, ignoramos snapshots tardíos de la vieja.
          if ((prev.clinics[0]?.id ?? cid) !== cid) return prev;
          let next: DB = { ...prev, outbox: incoming };
          for (const t of incoming) {
            if (t.status !== "respondido") continue;
            const r = reflectOutbox(next, t);
            next = r.next;
            r.saves.forEach(([c, i, d]) =>
              backendDeDatos.guardar(cid, c, i, d).catch(() => {})
            );
          }
          try { localStorage.setItem(DB_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
      },
      undefined,
      (e) => console.warn("listener outbox:", e)
    );
    // re-suscribir si cambia la clínica cargada (login multi-clínica)
  }, [backend, activeClinicId]);

  /* ===== Tiempo real: mensajes directos del chat =====
   * Un directo tiene que llegar sin F5, y el contador de no leídos del menú tiene
   * que moverse en cualquier pantalla: por eso escucha el store y no la página del
   * chat. Misma consulta que `cargarDB` (ver `filtroDeDirectos` en lib/backend/carga.ts por qué un
   * no-admin NO puede pedir la colección entera). En una clínica real `session.userId` es el uid de
   * Firebase: la sesión solo se restaura si coincide (ver el primer efecto). */
  const sesionUid = session?.userId;
  const sesionRol = session?.role;
  useEffect(() => {
    if (backend !== "firebase" || !sesionUid || !sesionRol) return;
    const cid = activeClinicId;
    const todos = cid === DEMO_CLINIC_ID || can(sesionRol, "users.manage");
    return backendDeDatos.escucharColeccion(
      cid,
      "directMessages",
      (docs) => {
        const directMessages = docs as unknown as DirectMessage[];
        setDb((prev) => {
          if ((prev.clinics[0]?.id ?? cid) !== cid) return prev; // snapshot tardío de otra clínica
          const next = { ...prev, directMessages };
          try { localStorage.setItem(DB_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
      },
      todos ? undefined : { participante: sesionUid },
      (e) => console.warn("listener directMessages:", e)
    );
  }, [backend, activeClinicId, sesionUid, sesionRol]);

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
    const escribir = () => backendDeDatos.guardar(clinicIdRef.current, colName, id, data);
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
    const borrar = () => backendDeDatos.quitar(clinicIdRef.current, colName, id);
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
  /** Cambia UN campo de un documento (`undefined` lo borra) sin reescribir el resto: es para lo que se edita desde pantallas que pueden tener la
   *  ficha vieja en memoria. Mismo aviso «No se guardó» (y mismo reintento) que `fsSave`. */
  const fsCampo = useCallback((colName: string, id: string, campo: string, valor: unknown) => {
    if (backendRef.current !== "firebase") return;
    if (!id) { console.warn("fsCampo: id vacío, se omite", colName); return; }
    const escribir = () => backendDeDatos.fijarCampo(clinicIdRef.current, colName, id, campo, valor);
    escribir().then(
      () => resolverFallo(`${colName}/${id}`),
      (e) => {
        console.warn("fsCampo", e);
        registrarFallo({
          coleccion: colName, docId: id,
          causa: clasificarError(e),
          detalle: (e as { code?: string })?.code ?? String(e),
          reintentar: async () => { await escribir(); },
        });
      },
    );
  }, []);
  /** Guarda el documento de la clínica (su configuración). Devuelve `true` si se guardó o si no hay servidor (modo local) y `false` si
   *  Firestore la rechazó: en ese caso queda el aviso «No se guardó» (lib/write-errors.ts), igual que para cualquier otro documento.
   *  Antes terminaba en un `.catch(() => {})`: un link de pago, un plazo o una plantilla se veían guardados y no lo estaban. El botón
   *  «Reintentar» reescribe el estado de AHORA, no el de cuando falló: repetir el cuerpo viejo pisaría lo que se cambió después. */
  const fsMeta = useCallback((dbNow: DB): Promise<boolean> => {
    if (backendRef.current !== "firebase") return Promise.resolve(true);
    const c = dbNow.clinics[0];
    if (!c) return Promise.resolve(true);
    const cuerpo = (d: DB) => ({ ...d.clinics[0], onboarding: d.onboarding });
    return vigilarEscritura({
      coleccion: "clinics",
      docId: c.id,
      escribir: () => backendDeDatos.mezclarClinica(c.id, cuerpo(dbNow)),
      reintentar: () => (dbRef.current.clinics[0] ? backendDeDatos.mezclarClinica(c.id, cuerpo(dbRef.current)) : Promise.resolve()),
    });
  }, []);

  const value = useMemo<Ctx>(() => {
    const by = session?.name ?? "sistema";

    const patchPatient = (patientId: string, fn: (p: Patient) => Patient) => {
      const cur = db.patients.find((x) => x.id === patientId);
      if (!cur) return;
      const next = fn(cur);
      persist((prev) => ({ ...prev, patients: prev.patients.map((x) => (x.id === patientId ? next : x)) }));
      fsSave("patients", patientId, next);
    };
    const patchBilling = (id: string, fn: (b: BillingRecord) => BillingRecord) => {
      const cur = db.billing.find((x) => x.id === id);
      if (!cur) return;
      const next = fn(cur);
      persist((prev) => ({ ...prev, billing: prev.billing.map((x) => (x.id === id ? next : x)) }));
      fsSave("billing", id, next);
    };

    return {
      db, session, ready, backend,
      login: async (userId) => {
        const u = db.users.find((x) => x.id === userId);
        if (!u) return;
        /* Entrar a la demo abre una sesión ANÓNIMA. Las reglas dejan LEER
         * `cl_demo` sin credenciales (son datos de ejemplo, publicados a
         * propósito) pero para ESCRIBIR piden sesión: si no, cualquiera desde
         * internet podía cargar y borrar en la demo sin autenticarse, y quemar
         * la cuota del mismo proyecto Firebase que usan las clínicas reales.
         *
         * Se hace acá y no en el arranque: solo cuando alguien entra de verdad a
         * la demo. Ver el comentario de `signInAnonymousIfNeeded`. */
        if (u.clinicId === DEMO_CLINIC_ID) await backendDeDatos.iniciarSesionDeDemo();
        const s: Session = { userId: u.id, clinicId: u.clinicId, role: u.role, name: u.name };
        setSession(s);
        localStorage.setItem(SES_KEY, JSON.stringify(s));
      },
      loginWithEmail: async (email, password) => {
        const uid = await backendDeDatos.iniciarSesion(email, password); // lanza error de Firebase si falla

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
        await backendDeDatos.usuarioActual();

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
          const clinicId = await backendDeDatos.clinicaDelUsuario(uid).catch((e) => { dirErr = e; return null; });

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
            const remote = await loadRemote();
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
        // El servidor aplica el plan efectivo desde subscriptions/{cid}; el
        // campo plan del caché local puede quedar viejo tras una mejora de plan.
        const cid = clinicIdRef.current;
        if (cid === DEMO_CLINIC_ID) throw new Error("La demo no crea cuentas reales. Ingresá a una clínica para agregar usuarios.");
        if (backendRef.current !== "firebase") throw new Error("No hay conexión con la clínica. Reconectá antes de crear usuarios.");
        if (!session || session.clinicId !== cid || !can(session.role, "users.manage")) {
          throw new Error("Tu sesión no tiene permiso para crear usuarios en esta clínica.");
        }
        const token = await backendDeDatos.token();
        if (!token) throw new Error("Tu sesión expiró. Volvé a iniciar sesión.");
        const res = await fetch("/api/team-users", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name, email, role, password, color, phone }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok || !data.user) throw new Error(data.error || "No se pudo crear el usuario.");
        const u = data.user as User;
        if (u.clinicId !== cid) throw new Error("La respuesta del servidor corresponde a otra clínica. Recargá la página.");
        persist((prev) => ({ ...prev, users: [...prev.users.filter((x) => x.id !== u.id), u] }));
      },
      changeMyPassword: async (newPassword) => {
        // El cambio ocurre EN EL SERVIDOR: rota la contraseña en Firebase Auth y
        // recién entonces limpia mustChangePassword (que es inmutable desde el
        // cliente por reglas). Así el gate no se puede saltar sin cambiar la clave.
        const token = await backendDeDatos.token();
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
          persist((prev) => ({ ...prev, users: prev.users.map((u) => (u.id === up.id ? up : u)) }));
        }
      },
      /* Cerrar sesión de verdad, en este orden:
       *   1. `backendDeDatos.cerrarSesion()` mata la credencial de Firebase Auth. Sin esto el
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
        void backendDeDatos.cerrarSesion().catch((e) => console.warn("signOut:", e));
        localStorage.removeItem(SES_KEY);
        try { localStorage.removeItem(DB_KEY); } catch { /* ignore */ }
        setSession(null);
      },
      /* Si en este navegador quedó abierta una clínica real, la pantalla de ingreso cargaba ESA
       * clínica: la pestaña «Ver demo» mostraba sus usuarios (todos con cuenta real, que la demo
       * esconde) y decía «La demo está vacía», y «Restaurar datos de demo» no hacía nada porque
       * jamás siembra sobre una clínica real. Esto cierra esa sesión y carga la demo. */
      entrarEnDemo: async () => {
        void backendDeDatos.cerrarSesion().catch((e) => console.warn("signOut:", e));
        localStorage.removeItem(SES_KEY);
        try { localStorage.removeItem(DB_KEY); } catch { /* ignore */ }
        setSession(null);
        CLINIC_ID = DEMO_CLINIC_ID;
        try {
          await withTimeout(backendDeDatos.esperarSesion(), 6000).catch(() => {});
          setDb(await withTimeout(loadRemote(), 9000));
          setBackend("firebase");
        } catch (e) {
          console.warn("Firestore no disponible — usando modo local:", e);
          setDb(loadLocal());
          setBackend("local");
        }
      },
      seedDemo: async () => {
        if (clinicIdRef.current !== DEMO_CLINIC_ID) return; // jamás sobre una clínica real
        CLINIC_ID = DEMO_CLINIC_ID; // la clínica activa pasa a ser la demo
        const seed = buildSeed();
        if (backendRef.current === "firebase") await backendDeDatos.lote(DEMO_CLINIC_ID, opsDeSemilla(seed)).catch((e) => console.warn("seedDemo", e));
        const realUsers = db.users.filter((u) => u.authUid && !seed.users.some((s) => s.id === u.id));
        persist({ ...seed, users: [...seed.users, ...realUsers] });
      },
      resetDemo: () => {
        if (clinicIdRef.current !== DEMO_CLINIC_ID) return; // jamás sobre una clínica real
        CLINIC_ID = DEMO_CLINIC_ID; // la clínica activa pasa a ser la demo
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
          // Lo que escribieron los visitantes en el chat directo de la demo.
          delExtras("directMessages", db.directMessages.map((x) => x.id), seed.directMessages.map((x) => x.id));
          delExtras("clinicalDocs", db.clinicalDocs.map((x) => x.id), seed.clinicalDocs.map((x) => x.id));
          delExtras("routineChecks", db.routineChecks.map((x) => x.id), seed.routineChecks.map((x) => x.id));
          // Los espacios que bloquearon los visitantes de la demo.
          delExtras("agendaBlocks", db.agendaBlocks.map((x) => x.id), seed.agendaBlocks.map((x) => x.id));
          backendDeDatos.lote(DEMO_CLINIC_ID, opsDeSemilla(seed)).catch(() => {});
        }
        persist(seed);
      },
      upsertAppointment: (a) => {
        persist((prev) => ({ ...prev, appointments: prev.appointments.some((x) => x.id === a.id) ? prev.appointments.map((x) => (x.id === a.id ? a : x)) : [...prev.appointments, a] }));
        fsSave("appointments", a.id, a);
      },
      deleteAppointment: (id) => {
        persist((prev) => ({ ...prev, appointments: prev.appointments.filter((x) => x.id !== id) }));
        fsDelete("appointments", id);
      },
      addAgendaBlocks: (bs) => {
        if (bs.length === 0) return;
        const nuevos = new Map(bs.map((b) => [b.id, b]));
        persist((prev) => ({ ...prev, agendaBlocks: [...prev.agendaBlocks.filter((x) => !nuevos.has(x.id)), ...nuevos.values()] }));
        for (const b of nuevos.values()) fsSave("agendaBlocks", b.id, b);
      },
      deleteAgendaBlocks: (ids) => {
        if (ids.length === 0) return;
        const quitar = new Set(ids);
        persist((prev) => ({ ...prev, agendaBlocks: prev.agendaBlocks.filter((x) => !quitar.has(x.id)) }));
        for (const id of quitar) fsDelete("agendaBlocks", id);
      },
      upsertPatient: (p) => {
        persist((prev) => ({ ...prev, patients: prev.patients.some((x) => x.id === p.id) ? prev.patients.map((x) => (x.id === p.id ? p : x)) : [...prev.patients, p] }));
        fsSave("patients", p.id, p);
      },
      setSeguimientoPaciente: (patientId, quita) => {
        persist((prev) => ({
          ...prev,
          patients: prev.patients.map((x) => {
            if (x.id !== patientId) return x;
            if (quita) return { ...x, seguimiento: quita };
            const { seguimiento: _quitado, ...sinQuita } = x;
            void _quitado;
            return sinQuita;
          }),
        }));
        fsCampo("patients", patientId, "seguimiento", quita ?? undefined);
      },
      crearPaciente: (p, por) => {
        // Id determinístico: si la pantalla guarda dos veces el mismo alta, no se duplica la Historia Clínica.
        const hc = historiaClinicaPendiente({
          id: `cd_${p.id}_hc`, clinicId: p.clinicId, patientId: p.id,
          plantillas: plantillasDeClinica(db.clinics[0]?.config), by: por, now: new Date().toISOString(),
        });
        persist((prev) => ({
          ...prev,
          patients: prev.patients.some((x) => x.id === p.id) ? prev.patients.map((x) => (x.id === p.id ? p : x)) : [...prev.patients, p],
          ...(hc ? { clinicalDocs: [hc, ...prev.clinicalDocs.filter((x) => x.id !== hc.id)] } : {}),
        }));
        fsSave("patients", p.id, p);
        if (hc) fsSave("clinicalDocs", hc.id, hc);
      },
      mergePatients: (keepId, removeId) => {
        if (keepId === removeId) return { ok: false, error: "Elegí dos fichas distintas." };
        const keep = db.patients.find((p) => p.id === keepId);
        const remove = db.patients.find((p) => p.id === removeId);
        if (!keep || !remove) return { ok: false, error: "No se encontró alguna de las dos fichas." };
        // Primero se arma la ficha que queda y se mira que entre en un documento de Firestore (1 MiB: radiografías y archivos pesan). Si no
        // entra no se toca NADA: Firestore rechazaría el guardado y la duplicada, ya borrada, se perdería con sus evoluciones y archivos.
        const merged = fusionarFichas(keep, remove);
        if (fichaDemasiadoGrande(merged)) {
          return { ok: false, error: "Las dos fichas juntas pesan demasiado para guardarse en una sola (por los archivos y radiografías). Borrá algunos archivos de una de las dos y probá de nuevo." };
        }
        const enConflicto = piezasEnConflicto(keep, remove);
        // Reasigna patientId en TODAS las colecciones que lo llevan y re-guarda los docs cambiados. Si falta una, esos registros quedan
        // apuntando a una ficha que ya no existe (una fila sin nombre en la lista de espera, mensajes automáticos huérfanos…).
        const reassign = <T extends { id: string; patientId?: string }>(col: string, arr: T[], extra?: (x: T) => Partial<T>): T[] =>
          arr.map((x) => {
            if (x.patientId !== removeId) return x;
            const up = { ...x, patientId: keepId, ...(extra?.(x) ?? {}) };
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
        const waitlist = reassign("waitlist", db.waitlist);
        const outbox = reassign("outbox", db.outbox);
        // Documentos clínicos: la Historia Clínica pendiente que el alta le dejó a cada ficha termina duplicada en la que queda; la que sobra se anula.
        let clinicalDocs = reassign("clinicalDocs", db.clinicalDocs);
        const anuladas = anularHistoriasClinicasRepetidas(clinicalDocs, keepId, { now: new Date().toISOString(), by: session?.name ?? "Fusión de fichas" });
        if (anuladas.length > 0) {
          const porId = new Map(anuladas.map((d) => [d.id, d]));
          clinicalDocs = clinicalDocs.map((d) => porId.get(d.id) ?? d);
          anuladas.forEach((d) => fsSave("clinicalDocs", d.id, d));
        }
        // Tareas: al paciente nuevo, y las claves de tareas derivadas que llevan el id del paciente (`cobranza:p6`) pasan a la ficha que queda
        // para no perder lo cerrado, postergado o asignado (salvo que la ficha que queda ya tenga una tarea con esa misma clave).
        const nombre = `${keep.firstName} ${keep.lastName}`.trim();
        const clavesEnUso = new Set(db.mgmtTasks.map((t) => t.derivedKey).filter((k): k is string => !!k));
        const mgmtTasks = reassign("mgmtTasks", db.mgmtTasks, (t) => {
          const clave = reasignarClaveDerivada(t.derivedKey, removeId, keepId);
          return { patientName: nombre, ...(clave !== t.derivedKey && clave && !clavesEnUso.has(clave) ? { derivedKey: clave } : {}) };
        });
        const patients = db.patients.filter((p) => p.id !== removeId).map((p) => (p.id === keepId ? merged : p));
        persist((prev) => ({ ...prev, patients, appointments, billing, budgets, payments, signatures, radiographs, recoveryMonitors, crmCards, labOrders, patientNotes, fiscalDocs, clinicalDocs, waitlist, outbox, mgmtTasks }));
        fsSave("patients", keepId, merged);
        fsDelete("patients", removeId);
        return { ok: true, piezasEnConflicto: enConflicto };
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
        persist((prev) => ({ ...prev, billing: prev.billing.some((x) => x.id === b.id) ? prev.billing.map((x) => (x.id === b.id ? b : x)) : [...prev.billing, b] }));
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
        persist((prev) => ({ ...prev, users: prev.users.some((x) => x.id === u.id) ? prev.users.map((x) => (x.id === u.id ? u : x)) : [...prev.users, u] }));
        fsSave("users", u.id, u);
      },
      upsertProcedure: (p) => {
        persist((prev) => ({ ...prev, procedures: prev.procedures.some((x) => x.cpt === p.cpt) ? prev.procedures.map((x) => (x.cpt === p.cpt ? p : x)) : [...prev.procedures, p] }));
        fsSave("procedures", p.cpt, p);
      },
      upsertProcedures: (ps) => {
        if (ps.length === 0) return;
        const nuevos = new Map(ps.map((p) => [p.cpt, p]));
        persist((prev) => {
          const existentes = new Set(prev.procedures.map((x) => x.cpt));
          return { ...prev, procedures: [...prev.procedures.map((x) => nuevos.get(x.cpt) ?? x), ...[...nuevos.values()].filter((p) => !existentes.has(p.cpt))] };
        });
        for (const p of nuevos.values()) fsSave("procedures", p.cpt, p);
      },
      deleteProcedure: (cpt) => {
        persist((prev) => ({ ...prev, procedures: prev.procedures.filter((x) => x.cpt !== cpt) }));
        fsDelete("procedures", cpt);
      },
      setOnboarding: (k, v) => {
        const next = { ...db, onboarding: { ...db.onboarding, [k]: v } };
        // Estado local desde `prev` (el último): con `next` armado sobre `db`, una acción encadenada pisaba a la anterior.
        persist((prev) => ({ ...prev, onboarding: { ...prev.onboarding, [k]: v } }));
        fsMeta(next);
      },
      setRutinaCheck: (paso, periodo, hecho) => {
        const id = idCheck(paso, periodo);
        if (!hecho) {
          persist((prev) => ({ ...prev, routineChecks: prev.routineChecks.filter((x) => x.id !== id) }));
          fsDelete("routineChecks", id);
          return;
        }
        const c: RutinaCheck = { id, paso, periodo, hechoPor: session?.userId ?? "", hechoPorNombre: session?.name ?? "", hechoEn: new Date().toISOString() };
        persist((prev) => ({ ...prev, routineChecks: [c, ...prev.routineChecks.filter((x) => x.id !== id)] }));
        fsSave("routineChecks", id, c);
      },
      /* — Presupuestos — */
      upsertBudget: (b) => {
        persist((prev) => ({ ...prev, budgets: prev.budgets.some((x) => x.id === b.id) ? prev.budgets.map((x) => (x.id === b.id ? b : x)) : [...prev.budgets, b] }));
        fsSave("budgets", b.id, b);
      },
      deleteBudget: (id) => {
        persist((prev) => ({ ...prev, budgets: prev.budgets.filter((x) => x.id !== id) }));
        fsDelete("budgets", id);
      },
      /* — Caja — */
      addPayment: (p) => {
        // updater funcional → seguro al llamarse en bucle síncrono (pago multi-plan):
        // cada iteración parte del estado previo y acumula, sin last-write-wins.
        persist((prev) => ({ ...prev, payments: [...prev.payments, p] }));
        fsSave("payments", p.id, p);
      },
      addExpense: (e) => {
        persist((prev) => ({ ...prev, expenses: [...prev.expenses, e] }));
        fsSave("expenses", e.id, e);
      },
      updateExpense: (e) => {
        persist((prev) => ({ ...prev, expenses: prev.expenses.map((x) => (x.id === e.id ? e : x)) }));
        fsSave("expenses", e.id, e);
      },
      deleteExpense: (id) => {
        persist((prev) => ({ ...prev, expenses: prev.expenses.filter((x) => x.id !== id) }));
        fsDelete("expenses", id);
      },
      /* — Inventario — */
      upsertStockItem: (s) => {
        persist((prev) => ({ ...prev, stock: prev.stock.some((x) => x.id === s.id) ? prev.stock.map((x) => (x.id === s.id ? s : x)) : [...prev.stock, s] }));
        fsSave("stock", s.id, s);
      },
      deleteStockItem: (id) => {
        persist((prev) => ({ ...prev, stock: prev.stock.filter((x) => x.id !== id), stockMoves: prev.stockMoves.filter((m) => m.itemId !== id) }));
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
        persist((prev) => ({ ...prev, stock: prev.stock.map((s) => (s.id === m.itemId ? updated : s)), stockMoves: [m, ...prev.stockMoves] }));
        fsSave("stock", updated.id, updated);
        fsSave("stockMoves", m.id, m);
      },
      /* — Lista de espera — */
      addWaitlist: (w) => {
        persist((prev) => ({ ...prev, waitlist: [...prev.waitlist, w] }));
        fsSave("waitlist", w.id, w);
      },
      removeWaitlist: (id) => {
        persist((prev) => ({ ...prev, waitlist: prev.waitlist.filter((x) => x.id !== id) }));
        fsDelete("waitlist", id);
      },
      /* — Ficha del paciente — */
      addPrescription: (patientId, rx) =>
        patchPatient(patientId, (p) => ({ ...p, prescriptions: [rx, ...(p.prescriptions ?? [])] })),
      updatePrescription: (patientId, rx) =>
        patchPatient(patientId, (p) => ({ ...p, prescriptions: (p.prescriptions ?? []).map((x) => (x.id === rx.id ? rx : x)) })),
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
        // Estado local desde `prev` (el último): con `next` armado sobre `db`, una acción encadenada pisaba a la anterior.
        persist((prev) => ({ ...prev, clinics: [{ ...prev.clinics[0], config: { ...prev.clinics[0].config, ...patch } }] }));
        return fsMeta(next);
      },
      updateClinicProfile: (datos) => {
        const c = db.clinics[0];
        if (!c) return Promise.resolve(false);
        const next = { ...db, clinics: [aplicarDatosClinica(c, datos)] };
        // Estado local desde `prev` (el último), como `updateClinicConfig`.
        persist((prev) => ({ ...prev, clinics: [aplicarDatosClinica(prev.clinics[0], datos)] }));
        return fsMeta(next);
      },
      importPatients: (list) => {
        if (list.length === 0) return;
        // Igual que el alta de la recepción (`crearPaciente`): cada paciente importado queda con la Historia Clínica pendiente.
        const hcs = historiasClinicasPendientes(list, {
          plantillas: plantillasDeClinica(db.clinics[0]?.config),
          by: { id: session?.userId ?? "", name: session?.name ?? "Importación" },
          now: new Date().toISOString(),
        });
        const idsHc = new Set(hcs.map((h) => h.id));
        persist((prev) => ({
          ...prev,
          patients: [...prev.patients, ...list],
          clinicalDocs: [...hcs, ...prev.clinicalDocs.filter((x) => !idsHc.has(x.id))],
        }));
        list.forEach((p) => fsSave("patients", p.id, p));
        hcs.forEach((h) => fsSave("clinicalDocs", h.id, h));
      },
      /* — Integración Botika (outbox) — */
      addOutboxTask: (t) => {
        persist((prev) => ({ ...prev, outbox: [t, ...prev.outbox] }));
        fsSave("outbox", t.id, t);
      },
      deleteOutboxTask: (id) => {
        persist((prev) => ({ ...prev, outbox: prev.outbox.filter((x) => x.id !== id) }));
        fsDelete("outbox", id);
      },
      applyOutboxResult: (taskId, result) => {
        const task = db.outbox.find((t) => t.id === taskId);
        if (!task) return;
        const updated: OutboxTask = { ...task, status: result.error ? "error" : "respondido", result };
        const base: DB = { ...db, outbox: db.outbox.map((t) => (t.id === taskId ? updated : t)) };
        const { saves } = reflectOutbox(base, updated);
        // Estado local desde `prev` (el último): con `next` armado sobre `db`, una acción encadenada pisaba a la anterior.
        persist((prev) => {
          const t = prev.outbox.find((x) => x.id === taskId);
          if (!t) return prev;
          const up: OutboxTask = { ...t, status: result.error ? "error" : "respondido", result };
          return reflectOutbox({ ...prev, outbox: prev.outbox.map((x) => (x.id === taskId ? up : x)) }, up).next;
        });
        saves.forEach(([c, i, d]) => fsSave(c, i, d));
        fsSave("outbox", updated.id, updated);
      },
      /* — Monitor de recuperación post-operatoria — */
      addRecoveryMonitor: (m) => {
        persist((prev) => ({ ...prev, recoveryMonitors: [m, ...prev.recoveryMonitors] }));
        fsSave("recoveryMonitors", m.id, m);
      },
      resolveRecoveryMonitor: (id, by) => {
        const mon = db.recoveryMonitors.find((m) => m.id === id);
        if (!mon) return;
        const up = { ...mon, status: "completado" as const, resolvedAt: new Date().toISOString(), resolvedBy: by };
        persist((prev) => ({ ...prev, recoveryMonitors: prev.recoveryMonitors.map((m) => (m.id === id ? up : m)) }));
        fsSave("recoveryMonitors", id, up);
      },
      /* — Análisis IA de radiografías — */
      addPatientNote: (n: PatientNote) => {
        persist((prev) => ({ ...prev, patientNotes: [n, ...prev.patientNotes] }));
        fsSave("patientNotes", n.id, n);
      },
      updatePatientNote: (n: PatientNote) => {
        persist((prev) => ({ ...prev, patientNotes: prev.patientNotes.map((x) => (x.id === n.id ? n : x)) }));
        fsSave("patientNotes", n.id, n);
      },
      deletePatientNote: (id: string) => {
        persist((prev) => ({ ...prev, patientNotes: prev.patientNotes.filter((x) => x.id !== id) }));
        fsDelete("patientNotes", id);
      },
      addFiscalDoc: (d: FiscalDoc) => {
        persist((prev) => ({ ...prev, fiscalDocs: [d, ...prev.fiscalDocs] }));
        fsSave("fiscalDocs", d.id, d);
      },
      deleteFiscalDoc: (id: string) => {
        persist((prev) => ({ ...prev, fiscalDocs: prev.fiscalDocs.filter((x) => x.id !== id) }));
        fsDelete("fiscalDocs", id);
      },
      voidPayment: (id, by, reason) => {
        const p = db.payments.find((x) => x.id === id);
        if (!p) return;
        const up = { ...p, voidedAt: new Date().toISOString(), voidedBy: by, ...(reason ? { voidReason: reason } : {}) };
        persist((prev) => ({ ...prev, payments: prev.payments.map((x) => (x.id === id ? up : x)) }));
        fsSave("payments", id, up);
      },
      markCheckCobrado: (id, by) => {
        const p = db.payments.find((x) => x.id === id);
        if (!p || !p.check) return;
        const up = { ...p, check: { ...p.check, cobradoAt: new Date().toISOString(), cobradoBy: by } };
        persist((prev) => ({ ...prev, payments: prev.payments.map((x) => (x.id === id ? up : x)) }));
        fsSave("payments", id, up);
      },
      openCashSession: (s) => {
        persist((prev) => ({ ...prev, cashSessions: [s, ...prev.cashSessions] }));
        fsSave("cashSessions", s.id, s);
      },
      closeCashSession: (id, countedCash, note) => {
        const s = db.cashSessions.find((x) => x.id === id);
        if (!s) return;
        const up: CashSession = { ...s, status: "cerrada", closedAt: new Date().toISOString(), countedCash, note: note || undefined };
        persist((prev) => ({ ...prev, cashSessions: prev.cashSessions.map((x) => (x.id === id ? up : x)) }));
        fsSave("cashSessions", id, up);
      },
      addSterilizationCycle: (c) => {
        persist((prev) => ({ ...prev, sterilizationCycles: [c, ...prev.sterilizationCycles] }));
        fsSave("sterilizationCycles", c.id, c);
      },
      updateSterilizationCycle: (c) => {
        persist((prev) => ({ ...prev, sterilizationCycles: prev.sterilizationCycles.map((x) => (x.id === c.id ? c : x)) }));
        fsSave("sterilizationCycles", c.id, c);
      },
      deleteSterilizationCycle: (id) => {
        persist((prev) => ({ ...prev, sterilizationCycles: prev.sterilizationCycles.filter((x) => x.id !== id) }));
        fsDelete("sterilizationCycles", id);
      },
      addTeamMessage: (m) => {
        persist((prev) => ({ ...prev, teamMessages: [...prev.teamMessages, m] }));
        fsSave("teamMessages", m.id, m);
      },
      addDirectMessage: (m) => {
        persist((prev) => ({ ...prev, directMessages: [...prev.directMessages, m] }));
        fsSave("directMessages", m.id, m);
      },
      addDifusion: (copias) => {
        // Todas las copias en un solo updater: nada de last-write-wins (ver persist).
        persist((prev) => ({ ...prev, directMessages: [...prev.directMessages, ...copias] }));
        copias.forEach((m) => fsSave("directMessages", m.id, m));
      },
      markDirectsRead: (ids) => {
        if (!session || ids.length === 0) return;
        const at = new Date().toISOString();
        // Solo lo que es PARA la sesión: la regla rechaza el resto (el admin y la
        // demo tienen en memoria directos ajenos).
        const leidos = db.directMessages
          .filter((m) => ids.includes(m.id) && m.toId === session.userId && !m.readAt)
          .map((m) => ({ ...m, readAt: at }));
        if (leidos.length === 0) return;
        const porId = new Map(leidos.map((m) => [m.id, m]));
        persist((prev) => ({ ...prev, directMessages: prev.directMessages.map((m) => porId.get(m.id) ?? m) }));
        // Doc completo con readAt: es lo único que cambia, así la regla
        // (affectedKeys ⊆ [readAt]) lo acepta.
        leidos.forEach((m) => fsSave("directMessages", m.id, m));
      },
      addSurvey: (s) => {
        persist((prev) => ({ ...prev, surveys: [s, ...prev.surveys] }));
        fsSave("surveys", s.id, s);
      },
      updateSurvey: (s) => {
        persist((prev) => ({ ...prev, surveys: prev.surveys.map((x) => (x.id === s.id ? s : x)) }));
        fsSave("surveys", s.id, s);
      },
      deleteSurvey: (id) => {
        persist((prev) => ({ ...prev, surveys: prev.surveys.filter((x) => x.id !== id) }));
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
        persist((prev) => ({ ...prev, environmentalLogs: [e, ...prev.environmentalLogs] }));
        fsSave("environmentalLogs", e.id, e);
      },
      updateEnvironmentalLog: (e) => {
        persist((prev) => ({ ...prev, environmentalLogs: prev.environmentalLogs.map((x) => (x.id === e.id ? e : x)) }));
        fsSave("environmentalLogs", e.id, e);
      },
      deleteEnvironmentalLog: (id) => {
        persist((prev) => ({ ...prev, environmentalLogs: prev.environmentalLogs.filter((x) => x.id !== id) }));
        fsDelete("environmentalLogs", id);
      },
      addEduVideo: (v) => {
        persist((prev) => ({ ...prev, eduVideos: [v, ...prev.eduVideos] }));
        fsSave("eduVideos", v.id, v);
      },
      updateEduVideo: (v) => {
        persist((prev) => ({ ...prev, eduVideos: prev.eduVideos.map((x) => (x.id === v.id ? v : x)) }));
        fsSave("eduVideos", v.id, v);
      },
      deleteEduVideo: (id) => {
        persist((prev) => ({ ...prev, eduVideos: prev.eduVideos.filter((x) => x.id !== id) }));
        fsDelete("eduVideos", id);
      },
      addBranch: (b) => {
        persist((prev) => ({ ...prev, branches: [...prev.branches, b] }));
        fsSave("branches", b.id, b);
      },
      updateBranch: (b) => {
        persist((prev) => ({ ...prev, branches: prev.branches.map((x) => (x.id === b.id ? b : x)) }));
        fsSave("branches", b.id, b);
      },
      deleteBranch: (id) => {
        persist((prev) => ({ ...prev, branches: prev.branches.filter((x) => x.id !== id) }));
        fsDelete("branches", id);
      },
      addRadiograph: (r: RadiographRec) => {
        persist((prev) => ({ ...prev, radiographs: [r, ...prev.radiographs] }));
        fsSave("radiographs", r.id, r);
      },
      updateRadiograph: (r: RadiographRec) => {
        persist((prev) => ({ ...prev, radiographs: prev.radiographs.map((x) => (x.id === r.id ? r : x)) }));
        fsSave("radiographs", r.id, r);
      },
      deleteRadiograph: (id: string) => {
        persist((prev) => ({ ...prev, radiographs: prev.radiographs.filter((x) => x.id !== id) }));
        fsDelete("radiographs", id);
      },
      /* — Firma electrónica / consentimientos — */
      addSignature: (s: SignatureDoc) => {
        persist((prev) => ({ ...prev, signatures: [s, ...prev.signatures] }));
        fsSave("signatures", s.id, s);
      },
      updateSignature: (s: SignatureDoc) => {
        persist((prev) => ({ ...prev, signatures: prev.signatures.map((x) => (x.id === s.id ? s : x)) }));
        fsSave("signatures", s.id, s);
      },
      deleteSignature: (id: string) => {
        persist((prev) => ({ ...prev, signatures: prev.signatures.filter((x) => x.id !== id) }));
        fsDelete("signatures", id);
      },
      addClinicalDoc: (d: DocumentoClinico) => {
        persist((prev) => ({ ...prev, clinicalDocs: [d, ...prev.clinicalDocs] }));
        fsSave("clinicalDocs", d.id, d);
      },
      updateClinicalDoc: (d: DocumentoClinico) => {
        persist((prev) => ({ ...prev, clinicalDocs: prev.clinicalDocs.map((x) => (x.id === d.id ? d : x)) }));
        fsSave("clinicalDocs", d.id, d);
      },
      saveConsentTemplates: (list: ConsentTemplate[]) => {
        // Mismo mecanismo que `updateClinicConfig`: actualiza el config de la
        // clínica y lo persiste vía `fsMeta` (setDoc clinics/{id} con merge).
        const c = db.clinics[0];
        const nextClinic = { ...c, config: { ...c.config, consentTemplates: list } };
        const next = { ...db, clinics: [nextClinic] };
        // Estado local desde `prev` (el último): con `next` armado sobre `db`, una acción encadenada pisaba a la anterior.
        persist((prev) => ({ ...prev, clinics: [{ ...prev.clinics[0], config: { ...prev.clinics[0].config, consentTemplates: list } }] }));
        fsMeta(next);
      },
      /* — CRM (embudo de pacientes) — */
      addCrmCard: (c: CrmCard) => {
        persist((prev) => ({ ...prev, crmCards: [c, ...prev.crmCards] }));
        fsSave("crmCards", c.id, c);
      },
      updateCrmCard: (c: CrmCard) => {
        persist((prev) => ({ ...prev, crmCards: prev.crmCards.map((x) => (x.id === c.id ? c : x)) }));
        fsSave("crmCards", c.id, c);
      },
      deleteCrmCard: (id: string) => {
        persist((prev) => ({ ...prev, crmCards: prev.crmCards.filter((x) => x.id !== id) }));
        fsDelete("crmCards", id);
      },
      addCampaign: (c: Campaign) => {
        persist((prev) => ({ ...prev, campaigns: [c, ...prev.campaigns] }));
        fsSave("campaigns", c.id, c);
      },
      updateCampaign: (c: Campaign) => {
        persist((prev) => ({ ...prev, campaigns: prev.campaigns.map((x) => (x.id === c.id ? c : x)) }));
        fsSave("campaigns", c.id, c);
      },
      deleteCampaign: (id: string) => {
        persist((prev) => ({ ...prev, campaigns: prev.campaigns.filter((x) => x.id !== id) }));
        fsDelete("campaigns", id);
      },
      /* — Laboratorios — */
      addLabOrder: (o: LabOrder) => {
        persist((prev) => ({ ...prev, labOrders: [o, ...prev.labOrders] }));
        fsSave("labOrders", o.id, o);
      },
      updateLabOrder: (o: LabOrder) => {
        persist((prev) => ({ ...prev, labOrders: prev.labOrders.map((x) => (x.id === o.id ? o : x)) }));
        fsSave("labOrders", o.id, o);
      },
      deleteLabOrder: (id: string) => {
        persist((prev) => ({ ...prev, labOrders: prev.labOrders.filter((x) => x.id !== id) }));
        fsDelete("labOrders", id);
      },
      /* — Liquidaciones — */
      addSettlement: (s: Settlement) => {
        persist((prev) => ({ ...prev, settlements: [s, ...prev.settlements] }));
        fsSave("settlements", s.id, s);
      },
      updateSettlement: (s: Settlement) => {
        persist((prev) => ({ ...prev, settlements: prev.settlements.map((x) => (x.id === s.id ? s : x)) }));
        fsSave("settlements", s.id, s);
      },
      deleteSettlement: (id: string) => {
        persist((prev) => ({ ...prev, settlements: prev.settlements.filter((x) => x.id !== id) }));
        fsDelete("settlements", id);
      },
      /* — Box / Sillones — */
      addBox: (b: Box) => {
        persist((prev) => ({ ...prev, boxes: [b, ...prev.boxes] }));
        fsSave("boxes", b.id, b);
      },
      updateBox: (b: Box) => {
        persist((prev) => ({ ...prev, boxes: prev.boxes.map((x) => (x.id === b.id ? b : x)) }));
        fsSave("boxes", b.id, b);
      },
      deleteBox: (id: string) => {
        // Las citas de ese box quedan sin box (no se borran ni quedan apuntando a un box que ya no existe).
        const sueltas = citasSinBox(db.appointments, id);
        persist((prev) => ({
          ...prev,
          boxes: prev.boxes.filter((x) => x.id !== id),
          appointments: prev.appointments.map((a) => {
            if (a.boxId !== id) return a;
            const { boxId: _quitado, ...resto } = a;
            return resto;
          }),
        }));
        fsDelete("boxes", id);
        for (const a of sueltas) fsSave("appointments", a.id, a);
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
        persist((prev) => ({ ...prev, budgets: prev.budgets.map((b) => (b.id === budgetId ? up : b)) }));
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
/** Fecha corta (04-nov.). Las fechas de calendario YYYY-MM-DD se leen en hora local
 *  (`parseFecha`): antes se mostraban un día antes en Paraguay. */
export function fmtDate(iso: string) {
  return parseFecha(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short" });
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
