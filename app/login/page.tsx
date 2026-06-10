"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldCheck, Stethoscope, Headset, Mail, Lock, Eye, EyeOff, LoaderCircle, ArrowLeft, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/rbac";
import { Field, inputCls } from "@/components/ui";

const ICON = { admin: ShieldCheck, dentist: Stethoscope, assistant: Headset } as const;

function friendlyAuthError(e: any): string {
  const code = e?.code ?? "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Email o contraseña incorrectos.";
  if (code.includes("operation-not-allowed"))
    return "El acceso con email/contraseña no está habilitado aún. En Firebase Console → Authentication → Sign-in method, habilitá «Email/Contraseña».";
  if (code.includes("too-many-requests")) return "Demasiados intentos. Esperá unos minutos.";
  if (code.includes("network")) return "Sin conexión. Verificá tu internet.";
  return e?.message ?? "No se pudo iniciar sesión.";
}

export default function Login() {
  const { db, login, loginWithEmail, ready, backend } = useStore();
  const router = useRouter();
  const [tab, setTab] = useState<"auth" | "demo">("auth");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginWithEmail(email.trim(), pass);
      router.replace("/app");
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca */}
      <div className="relative hidden overflow-hidden bg-navy-900 lg:block" style={{ background: "linear-gradient(160deg,#0F1F3D 0%,#07142C 75%)" }}>
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-azure-500/25 blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-azure-700/20 blur-[110px]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-white/60 transition-colors hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Volver al sitio
          </a>
          <div>
            <div className="font-logo text-5xl tracking-[0.22em] text-white">NOVUdent</div>
            <p className="mt-4 max-w-sm text-white/60">
              Agenda, odontograma, ficha clínica y facturación con estados.
              La clínica completa, en una sola plataforma.
            </p>
            <div className="mt-8 space-y-3">
              {["Odontograma FDI con morfología real", "Recordatorios por WhatsApp", "Facturación con validación de códigos", "Roles y permisos por usuario"].map((t) => (
                <div key={t} className="flex items-center gap-2.5 text-sm text-white/80">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-azure-500/25 text-azure-200"><Sparkles className="h-3 w-3" /></span>
                  {t}
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-white/40">© {new Date().getFullYear()} Novudent · NOVUM Holding · Asunción, Paraguay</p>
        </div>
      </div>

      {/* Formulario */}
      <div className="grid place-items-center bg-clinic-bg p-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="w-full max-w-md">
          <div className="mb-6 text-center lg:hidden">
            <div className="font-logo text-3xl tracking-[0.22em] text-navy-800">NOVUdent</div>
          </div>

          <div className="rounded-3xl border border-clinic-border bg-white p-7 shadow-pop">
            {/* Tabs */}
            <div className="mb-6 flex rounded-2xl bg-clinic-bg p-1">
              {([["auth", "Iniciar sesión"], ["demo", "Ver demo"]] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => { setTab(k); setError(null); }}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-all ${tab === k ? "bg-white text-navy-800 shadow-card" : "text-clinic-muted hover:text-clinic-text"}`}
                >
                  {l}
                </button>
              ))}
            </div>

            {tab === "auth" ? (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <h1 className="text-xl font-extrabold text-navy-800">Bienvenido de nuevo</h1>
                  <p className="mt-1 text-sm text-clinic-muted">
                    Ingresá con la cuenta que te creó el administrador de tu clínica.
                  </p>
                </div>
                <Field label="Email">
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
                    <input type="email" required autoComplete="email" className={`${inputCls} pl-9`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@tuclinica.com" />
                  </div>
                </Field>
                <Field label="Contraseña">
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
                    <input type={show ? "text" : "password"} required autoComplete="current-password" className={`${inputCls} pl-9 pr-10`} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" />
                    <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-clinic-muted hover:text-clinic-text">
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>
                {error && <p role="alert" className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-state-err">{error}</p>}
                <button
                  type="submit"
                  disabled={busy || !ready}
                  className="grid w-full place-items-center rounded-2xl bg-azure-600 py-3 text-sm font-extrabold text-white shadow-[0_8px_24px_-8px_rgba(46,131,245,0.6)] transition-all hover:-translate-y-0.5 hover:bg-azure-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-clinic-border disabled:text-clinic-muted disabled:shadow-none"
                >
                  {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : "Entrar"}
                </button>
                <p className="text-center text-[11px] leading-relaxed text-clinic-muted">
                  ¿Sin cuenta? Las cuentas las crea el <b>administrador</b> de tu clínica
                  (Configuración → Usuarios). ¿Querés conocer Novudent? Usá la pestaña <b>Ver demo</b>.
                </p>
              </form>
            ) : (
              <div className="space-y-2.5">
                <div className="mb-4">
                  <h1 className="text-xl font-extrabold text-navy-800">Recorré la demo</h1>
                  <p className="mt-1 text-sm text-clinic-muted">Datos de ejemplo. Cada rol ve y puede hacer cosas distintas (RBAC).</p>
                </div>
                {ready &&
                  db.users.filter((u) => !u.authUid).map((u) => {
                    const Icon = ICON[u.role];
                    return (
                      <button
                        key={u.id}
                        onClick={() => { login(u.id); router.replace("/app"); }}
                        className="flex w-full items-center gap-3 rounded-2xl border border-clinic-border p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-azure-300 hover:bg-azure-50 hover:shadow-card"
                      >
                        <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: u.color }}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="flex-1">
                          <span className="block text-sm font-bold text-clinic-text">{u.name}</span>
                          <span className="block text-xs text-clinic-muted">{ROLE_LABEL[u.role]}</span>
                        </span>
                      </button>
                    );
                  })}
                <p className="pt-1 text-center font-mono text-[10px] font-bold uppercase tracking-wide text-clinic-muted">
                  Backend: {backend === "firebase" ? "Firebase conectado" : backend === "local" ? "modo local" : "conectando…"}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
