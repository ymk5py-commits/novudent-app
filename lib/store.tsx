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
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch,
} from "firebase/firestore";
import { fsdb } from "./firebase";
import type { DB, Session, Appointment, Patient, BillingRecord, User, Procedure, EmrNote, ToothRecord } from "./types";
import { buildSeed } from "./seed";
import { submitToBilling, releaseFromHold } from "./billing";

const DB_KEY = "novudent.db.v2";
const SES_KEY = "novudent.session.v1";
const CLINIC_ID = "cl_demo";
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
  await batch.commit();
}

async function loadFirestore(): Promise<DB> {
  const clinicSnap = await getDoc(doc(fsdb, "clinics", CLINIC_ID));
  if (!clinicSnap.exists()) {
    const seed = buildSeed();
    await seedFirestore(seed);
    return seed;
  }
  const meta = clinicSnap.data() as any;
  const col = (name: string) => getDocs(collection(fsdb, "clinics", CLINIC_ID, name));
  const [users, patients, appointments, billing, procedures] = await Promise.all([
    col("users"), col("patients"), col("appointments"), col("billing"), col("procedures"),
  ]);
  return {
    clinics: [{ id: CLINIC_ID, name: meta.name, config: meta.config }],
    users: users.docs.map((d) => d.data() as User),
    patients: patients.docs.map((d) => d.data() as Patient),
    appointments: appointments.docs.map((d) => d.data() as Appointment),
    billing: billing.docs.map((d) => d.data() as BillingRecord),
    procedures: procedures.docs.map((d) => d.data() as Procedure),
    onboarding: meta.onboarding ?? { usersCreated: false, servicesDefined: false, tourDone: false },
  };
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

interface Ctx {
  db: DB;
  session: Session | null;
  ready: boolean;
  backend: Backend;
  login: (userId: string) => void;
  logout: () => void;
  resetDemo: () => void;
  upsertAppointment: (a: Appointment) => void;
  deleteAppointment: (id: string) => void;
  upsertPatient: (p: Patient) => void;
  completeForm: (patientId: string, formId: string, fields: { label: string; value: string }[], completedAt: string) => void;
  addEmrNote: (patientId: string, note: EmrNote) => void;
  setTooth: (patientId: string, tooth: string, rec: ToothRecord | null) => void;
  upsertBilling: (b: BillingRecord) => void;
  submitBilling: (id: string) => void;
  releaseBilling: (id: string) => void;
  toggleAch: (id: string) => void;
  upsertUser: (u: User) => void;
  upsertProcedure: (p: Procedure) => void;
  setOnboarding: (k: keyof DB["onboarding"], v: boolean) => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(buildSeed);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [backend, setBackend] = useState<Backend>("connecting");
  const backendRef = useRef<Backend>("connecting");
  backendRef.current = backend;

  useEffect(() => {
    try {
      const s = localStorage.getItem(SES_KEY);
      if (s) setSession(JSON.parse(s));
    } catch {}
    (async () => {
      try {
        const remote = await withTimeout(loadFirestore(), 8000);
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

  /* write-through a Firestore (no-op en modo local) */
  const fsSave = useCallback((colName: string, id: string, data: unknown) => {
    if (backendRef.current !== "firebase") return;
    setDoc(doc(fsdb, "clinics", CLINIC_ID, colName, id), clean(data)).catch((e) => console.warn("fsSave", e));
  }, []);
  const fsDelete = useCallback((colName: string, id: string) => {
    if (backendRef.current !== "firebase") return;
    deleteDoc(doc(fsdb, "clinics", CLINIC_ID, colName, id)).catch((e) => console.warn("fsDelete", e));
  }, []);
  const fsMeta = useCallback((dbNow: DB) => {
    if (backendRef.current !== "firebase") return;
    const c = dbNow.clinics[0];
    setDoc(doc(fsdb, "clinics", CLINIC_ID), clean({ ...c, onboarding: dbNow.onboarding }), { merge: true }).catch(() => {});
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
      logout: () => { setSession(null); localStorage.removeItem(SES_KEY); },
      resetDemo: () => {
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
