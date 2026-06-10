"use client";
/**
 * Capa de datos de Novudent (demo).
 * Repositorio tipado sobre localStorage con datos semilla. La interfaz pública
 * (useDB / acciones) está pensada para reemplazarse por una API REST + PostgreSQL
 * en producción sin tocar las páginas (Fase 1 del roadmap: multi-tenant real).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { DB, Session, Appointment, Patient, BillingRecord, User, Procedure, EmrNote } from "./types";
import { buildSeed } from "./seed";
import { submitToBilling, releaseFromHold } from "./billing";

const DB_KEY = "novudent.db.v1";
const SES_KEY = "novudent.session.v1";

function loadDB(): DB {
  if (typeof window === "undefined") return buildSeed();
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {}
  const seed = buildSeed();
  localStorage.setItem(DB_KEY, JSON.stringify(seed));
  return seed;
}

interface Ctx {
  db: DB;
  session: Session | null;
  ready: boolean;
  login: (userId: string) => void;
  logout: () => void;
  resetDemo: () => void;
  /* Agenda */
  upsertAppointment: (a: Appointment) => void;
  deleteAppointment: (id: string) => void;
  /* Pacientes / engagement */
  upsertPatient: (p: Patient) => void;
  completeForm: (patientId: string, formId: string, fields: { label: string; value: string }[], completedAt: string) => void;
  addEmrNote: (patientId: string, note: EmrNote) => void;
  /* Facturación */
  upsertBilling: (b: BillingRecord) => void;
  submitBilling: (id: string) => void;
  releaseBilling: (id: string) => void;
  toggleAch: (id: string) => void;
  /* Configuración */
  upsertUser: (u: User) => void;
  upsertProcedure: (p: Procedure) => void;
  setOnboarding: (k: keyof DB["onboarding"], v: boolean) => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(buildSeed);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDb(loadDB());
    try {
      const s = localStorage.getItem(SES_KEY);
      if (s) setSession(JSON.parse(s));
    } catch {}
    setReady(true);
  }, []);

  const persist = useCallback((next: DB) => {
    setDb(next);
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const value = useMemo<Ctx>(() => {
    const by = session?.name ?? "sistema";
    return {
      db,
      session,
      ready,
      login: (userId) => {
        const u = db.users.find((x) => x.id === userId);
        if (!u) return;
        const s: Session = { userId: u.id, clinicId: u.clinicId, role: u.role, name: u.name };
        setSession(s);
        localStorage.setItem(SES_KEY, JSON.stringify(s));
      },
      logout: () => {
        setSession(null);
        localStorage.removeItem(SES_KEY);
      },
      resetDemo: () => {
        const seed = buildSeed();
        persist(seed);
      },
      upsertAppointment: (a) =>
        persist({ ...db, appointments: db.appointments.some((x) => x.id === a.id) ? db.appointments.map((x) => (x.id === a.id ? a : x)) : [...db.appointments, a] }),
      deleteAppointment: (id) => persist({ ...db, appointments: db.appointments.filter((x) => x.id !== id) }),
      upsertPatient: (p) =>
        persist({ ...db, patients: db.patients.some((x) => x.id === p.id) ? db.patients.map((x) => (x.id === p.id ? p : x)) : [...db.patients, p] }),
      completeForm: (patientId, formId, fields, completedAt) =>
        persist({
          ...db,
          patients: db.patients.map((p) => {
            if (p.id !== patientId) return p;
            const forms = p.forms.map((f) => (f.id === formId ? { ...f, fields, status: "completado" as const, completedAt } : f));
            const stillPending = forms.some((f) => f.status === "pendiente");
            return { ...p, forms, historyUpdatePending: stillPending ? p.historyUpdatePending : false };
          }),
        }),
      addEmrNote: (patientId, note) =>
        persist({ ...db, patients: db.patients.map((p) => (p.id === patientId ? { ...p, emr: [note, ...p.emr] } : p)) }),
      upsertBilling: (b) =>
        persist({ ...db, billing: db.billing.some((x) => x.id === b.id) ? db.billing.map((x) => (x.id === b.id ? b : x)) : [...db.billing, b] }),
      submitBilling: (id) => persist({ ...db, billing: db.billing.map((b) => (b.id === id ? submitToBilling(b, by) : b)) }),
      releaseBilling: (id) => persist({ ...db, billing: db.billing.map((b) => (b.id === id ? releaseFromHold(b, by) : b)) }),
      toggleAch: (id) =>
        persist({
          ...db,
          billing: db.billing.map((b) => {
            if (b.id !== id) return b;
            const has = b.flags.includes("ACH");
            return {
              ...b,
              flags: has ? b.flags.filter((f) => f !== "ACH") : [...b.flags, "ACH"],
              history: [...b.history, { at: new Date().toISOString(), action: has ? "Pago automático desactivado (ACH)" : "Pago automático activado (ACH)", by }],
            };
          }),
        }),
      upsertUser: (u) =>
        persist({ ...db, users: db.users.some((x) => x.id === u.id) ? db.users.map((x) => (x.id === u.id ? u : x)) : [...db.users, u] }),
      upsertProcedure: (p) =>
        persist({ ...db, procedures: db.procedures.some((x) => x.cpt === p.cpt) ? db.procedures.map((x) => (x.cpt === p.cpt ? p : x)) : [...db.procedures, p] }),
      setOnboarding: (k, v) => persist({ ...db, onboarding: { ...db.onboarding, [k]: v } }),
    };
  }, [db, session, ready, persist]);

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
