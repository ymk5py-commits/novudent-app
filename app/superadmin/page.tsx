"use client";
/** Panel del dueño del SaaS (Carlos): alta de clínicas nuevas.
 *  No aparece en ninguna navegación — URL directa /superadmin.
 *  Toda la seguridad vive en el servidor: sin OWNER_PANEL_KEY válida,
 *  /api/clinicas rechaza la solicitud. */
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Building2, KeyRound, Mail, Lock, User as UserIcon, Phone, MapPin,
  LoaderCircle, CheckCircle2, Copy, ArrowRight, ShieldCheck, Plus,
} from "lucide-react";
import { Field, inputCls } from "@/components/ui";
import { PLANS, type PlanId } from "@/lib/plan";
import { Reveal } from "@/components/motion";

type Created = {
  clinicId: string;
  clinicName: string;
  plan: PlanId;
  admin: { name: string; email: string };
  bookingUrl: string;
};

export default function SuperAdminPage() {
  const [ownerKey, setOwnerKey] = useState("");
  const [plan, setPlan] = useState<PlanId>("clinica");
  const [clinicName, setClinicName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clinicas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerKey, plan, clinicName, phone, address, adminName, adminEmail, adminPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setCreated(data as Created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  function copySummary() {
    if (!created) return;
    const text = [
      `¡Bienvenido a Novudent, ${created.clinicName}! 🦷`,
      `Tu plan: Plan ${PLANS[created.plan]?.label ?? "Clínica"}${PLANS[created.plan]?.priceUsd ? ` (USD ${PLANS[created.plan].priceUsd}/mes)` : ""}`,
      ``,
      `Tu acceso de administrador:`,
      `• Entrá en: ${location.origin}/login`,
      `• Email: ${created.admin.email}`,
      `• Contraseña temporal: ${adminPassword}`,
      `  (al entrar te pediremos crear tu propia contraseña)`,
      ``,
      `Agenda online para tus pacientes:`,
      `${location.origin}${created.bookingUrl}`,
      ``,
      `Desde Configuración → Usuarios del equipo podés crear las cuentas de tus doctores y asistentes.`,
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function reset() {
    setCreated(null);
    setClinicName(""); setPhone(""); setAddress("");
    setAdminName(""); setAdminEmail(""); setAdminPassword("");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-clinic-bg p-6" style={{ background: "linear-gradient(160deg,#0F1F3D 0%,#07142C 75%)" }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="w-full max-w-lg">
        <Reveal y={0} className="mb-6 text-center">
          <div className="font-logo text-3xl tracking-[0.22em] text-white">NOVUdent</div>
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-azure-500/20 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-azure-200">
            <ShieldCheck className="h-3 w-3" /> Panel del propietario
          </div>
        </Reveal>

        <Reveal delay={0.08} className="rounded-3xl border border-white/10 bg-white p-7 shadow-pop">
          {created ? (
            <div className="space-y-4">
              <div className="text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-state-okbg text-state-ok">
                  <CheckCircle2 className="h-7 w-7" />
                </span>
                <h1 className="mt-3 text-xl font-extrabold text-navy-800">¡Clínica creada!</h1>
                <p className="mt-1 text-sm text-clinic-muted">Pasale estos datos a tu cliente para que entre hoy mismo.</p>
              </div>

              <div className="space-y-2.5 rounded-2xl bg-clinic-bg p-4 text-sm">
                <div className="flex justify-between gap-3"><span className="text-clinic-muted">Clínica</span><b className="text-clinic-text">{created.clinicName}</b></div>
                <div className="flex justify-between gap-3"><span className="text-clinic-muted">Plan</span><b className="text-azure-700">Plan {PLANS[created.plan]?.label ?? "Clínica"}{PLANS[created.plan]?.priceUsd ? ` · $${PLANS[created.plan].priceUsd}/mes` : ""}</b></div>
                <div className="flex justify-between gap-3"><span className="text-clinic-muted">ID interno</span><span className="font-mono text-xs font-bold text-clinic-text">{created.clinicId}</span></div>
                <div className="flex justify-between gap-3"><span className="text-clinic-muted">Admin</span><b className="text-clinic-text">{created.admin.name}</b></div>
                <div className="flex justify-between gap-3"><span className="text-clinic-muted">Email de acceso</span><span className="font-mono text-xs font-bold text-clinic-text">{created.admin.email}</span></div>
                <div className="flex justify-between gap-3"><span className="text-clinic-muted">Ingresa en</span><a href="/login" className="font-bold text-azure-700 hover:underline">/login</a></div>
                <div className="flex justify-between gap-3"><span className="text-clinic-muted">Agenda online</span><a href={created.bookingUrl} className="truncate font-mono text-xs font-bold text-azure-700 hover:underline">{created.bookingUrl}</a></div>
              </div>

              <button onClick={copySummary} className="grid w-full place-items-center rounded-2xl bg-azure-600 py-3 text-sm font-extrabold text-white shadow-[0_8px_24px_-8px_rgba(46,131,245,0.6)] transition-all hover:-translate-y-0.5 hover:bg-azure-700">
                <span className="inline-flex items-center gap-2">
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "¡Copiado!" : "Copiar mensaje de bienvenida (con contraseña)"}
                </span>
              </button>
              <button onClick={reset} className="grid w-full place-items-center rounded-2xl border border-clinic-border py-3 text-sm font-bold text-clinic-text transition-colors hover:bg-clinic-bg">
                <span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Crear otra clínica</span>
              </button>
              <p className="text-center text-[11px] leading-relaxed text-clinic-muted">
                El admin de la clínica crea a sus doctores y asistentes desde <b>Configuración → Usuarios del equipo</b>.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h1 className="text-xl font-extrabold text-navy-800">Nueva clínica cliente</h1>
                <p className="mt-1 text-sm text-clinic-muted">
                  Crea la clínica y la cuenta de su administrador en un solo paso.
                </p>
              </div>

              <Field label="Tu clave de propietario">
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
                  <input type="password" required className={`${inputCls} pl-9`} value={ownerKey} onChange={(e) => setOwnerKey(e.target.value)} placeholder="OWNER_PANEL_KEY" autoComplete="off" />
                </div>
              </Field>

              <div className="border-t border-clinic-border pt-4">
                <p className="mb-3 font-mono text-[10px] font-extrabold uppercase tracking-[0.2em] text-clinic-muted">Plan contratado</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.values(PLANS)).map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setPlan(p.id)}
                      className={`rounded-2xl border-2 p-3 text-left transition-all ${
                        plan === p.id
                          ? "border-azure-600 bg-azure-50 shadow-[0_6px_18px_-8px_rgba(46,131,245,0.5)]"
                          : "border-clinic-border hover:border-azure-300"
                      }`}
                    >
                      <span className={`block text-sm font-extrabold ${plan === p.id ? "text-azure-700" : "text-clinic-text"}`}>{p.label}</span>
                      <span className="block font-mono text-[11px] font-bold text-clinic-muted">
                        {p.priceUsd ? `$${p.priceUsd}/mes` : "A medida"}
                      </span>
                      <span className="mt-1 block text-[10px] leading-snug text-clinic-muted">
                        {p.id === "solo" ? "1 profesional" : p.id === "clinica" ? "Hasta 5 prof. · todo incluido" : "Multi-sucursal · ilimitado"}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-clinic-muted">
                  El plan limita los módulos y la cantidad de profesionales dentro de la app. Se puede cambiar después.
                </p>
              </div>

              <div className="border-t border-clinic-border pt-4">
                <p className="mb-3 font-mono text-[10px] font-extrabold uppercase tracking-[0.2em] text-clinic-muted">Datos de la clínica</p>
                <div className="space-y-3.5">
                  <Field label="Nombre de la clínica">
                    <div className="relative">
                      <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
                      <input required className={`${inputCls} pl-9`} value={clinicName} onChange={(e) => setClinicName(e.target.value)} placeholder="Clínica Dental Sonrisa" />
                    </div>
                  </Field>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <Field label="Teléfono (opcional)">
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
                        <input className={`${inputCls} pl-9`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+595 21 ..." />
                      </div>
                    </Field>
                    <Field label="Dirección (opcional)">
                      <div className="relative">
                        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
                        <input className={`${inputCls} pl-9`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Asunción" />
                      </div>
                    </Field>
                  </div>
                </div>
              </div>

              <div className="border-t border-clinic-border pt-4">
                <p className="mb-3 font-mono text-[10px] font-extrabold uppercase tracking-[0.2em] text-clinic-muted">Cuenta del administrador</p>
                <div className="space-y-3.5">
                  <Field label="Nombre y apellido">
                    <div className="relative">
                      <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
                      <input required className={`${inputCls} pl-9`} value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Dra. Ana Pérez" />
                    </div>
                  </Field>
                  <Field label="Email de acceso">
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
                      <input type="email" required className={`${inputCls} pl-9`} value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="ana@clinicasonrisa.com" />
                    </div>
                  </Field>
                  <Field label="Contraseña inicial (6+ caracteres)">
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
                      <input type="text" required minLength={6} className={`${inputCls} pl-9 font-mono`} value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="ej. Sonrisa2026" autoComplete="off" />
                    </div>
                  </Field>
                </div>
              </div>

              {error && <p role="alert" className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-state-err">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="grid w-full place-items-center rounded-2xl bg-azure-600 py-3 text-sm font-extrabold text-white shadow-[0_8px_24px_-8px_rgba(46,131,245,0.6)] transition-all hover:-translate-y-0.5 hover:bg-azure-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-clinic-border disabled:text-clinic-muted disabled:shadow-none"
              >
                {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <span className="inline-flex items-center gap-2">Crear clínica y cuenta admin <ArrowRight className="h-4 w-4" /></span>}
              </button>
            </form>
          )}
        </Reveal>
        <p className="mt-4 text-center text-[11px] text-white/40">Solo para el propietario de Novudent. Las clínicas gestionan sus propios usuarios.</p>
      </motion.div>
    </div>
  );
}
