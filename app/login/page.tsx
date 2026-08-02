"use client";
/* Puerta de entrada — mismo sistema editorial que la landing (components/Landing.tsx).
 * Bricolage para títulos, Instrument Sans de cuerpo, JetBrains Mono para etiquetas.
 * Papel en vez de blanco puro, filetes en vez de sombras, esquinas rectas.
 * NO usa `Field`/`inputCls` de components/ui.tsx: eso es vocabulario del PANEL
 * (paridad Dentalink, esquinas redondeadas) y acá el registro es otro. */
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldCheck, Stethoscope, Headset, Mail, Lock, Eye, EyeOff, LoaderCircle, ArrowLeft, RotateCcw } from "lucide-react";
import { useStore } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/rbac";

const ICON = { admin: ShieldCheck, dentist: Stethoscope, assistant: Headset } as const;

/** Caja de texto editorial: esquinas rectas, filete de 1 px, 44 px de alto. */
const edInput =
  "w-full min-h-[44px] border border-clinic-border bg-white px-3.5 py-2.5 text-sm text-clinic-text placeholder:text-clinic-muted/60 transition-colors focus:border-azure-600 focus:outline-none focus:ring-1 focus:ring-azure-600";

/** Etiqueta de campo en mono, como los rótulos de la landing. */
function EdField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-clinic-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

const ARGUMENTOS = [
  "Odontograma FDI con morfología real",
  "Recordatorios por WhatsApp",
  "Facturación con validación de códigos",
  "Roles y permisos por usuario",
];

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
  const { db, login, loginWithEmail, seedDemo, ready, backend } = useStore();
  const router = useRouter();
  const [tab, setTab] = useState<"auth" | "demo">("auth");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demoUsers = db.users.filter((u) => !u.authUid);

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
    <div className="grid min-h-screen bg-paper font-body text-clinic-text lg:grid-cols-2">
      {/* ===== Columna de marca — la masthead de la landing, entintada en navy ===== */}
      <div className="hidden bg-navy-800 lg:block">
        <div className="flex h-full flex-col justify-between p-12">
          <a href="/" className="ed-link ed-tap inline-flex w-max items-center gap-2 text-[13px] font-bold text-white/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Volver al sitio
          </a>

          <div>
            <div className="font-display text-5xl font-extrabold tracking-[-0.03em] text-white">NOVUdent</div>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.3em] text-white/45">
              Software de gestión odontológica
            </p>
            <p className="mt-7 max-w-sm leading-relaxed text-white/60">
              Agenda, odontograma, ficha clínica y facturación con estados.
              La clínica completa, en una sola plataforma.
            </p>
            {/* Hoja de especificaciones en miniatura: filete y número, sin iconitos. */}
            <ul className="mt-9 max-w-sm border-t border-white/15">
              {ARGUMENTOS.map((t, i) => (
                <li key={t} className="flex items-baseline gap-4 border-b border-white/15 py-3">
                  <span className="font-mono text-[11px] font-bold tabular-nums text-azure-300">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[13px] leading-snug text-white/80">{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="font-mono text-[11px] leading-relaxed text-white/40">
            © {new Date().getFullYear()} Novudent · NOVUM Holding · Asunción, Paraguay
          </p>
        </div>
      </div>

      {/* ===== Formulario ===== */}
      <div className="grid place-items-center px-5 py-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="w-full max-w-md">
          {/* Masthead en móvil (en escritorio la marca vive en la columna navy) */}
          <div className="ed-rule-double mb-8 pb-4 text-center lg:hidden">
            <a href="/" className="ed-tap inline-block">
              <span className="font-display text-3xl font-extrabold tracking-[-0.02em] text-navy-800">NOVUdent</span>
            </a>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.3em] text-clinic-muted">
              Software de gestión odontológica
            </p>
          </div>

          <div className="ed-figure">
            {/* Pestañas: dos bloques con filete, el activo entintado en navy */}
            <div className="grid grid-cols-2 border-b border-clinic-border">
              {([["auth", "Iniciar sesión"], ["demo", "Ver demo"]] as const).map(([k, l], i) => (
                <button
                  key={k}
                  onClick={() => { setTab(k); setError(null); }}
                  className={`min-h-[44px] px-3 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.16em] transition-colors duration-200 ${i > 0 ? "border-l border-clinic-border" : ""} ${tab === k ? "bg-navy-800 text-white" : "bg-paper-2 text-clinic-muted hover:text-clinic-text"}`}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="p-6 sm:p-7">
              {tab === "auth" ? (
                <form onSubmit={submit} className="space-y-4">
                  <div>
                    <h1 className="font-display text-2xl font-extrabold tracking-[-0.025em] text-navy-800">Bienvenido de nuevo</h1>
                    <p className="mt-1.5 text-sm leading-relaxed text-clinic-muted">
                      Ingresá con la cuenta que te creó el administrador de tu clínica.
                    </p>
                  </div>
                  <EdField label="Email">
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
                      <input type="email" required autoComplete="email" className={`${edInput} pl-9`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@tuclinica.com" />
                    </div>
                  </EdField>
                  <EdField label="Contraseña">
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
                      <input type={show ? "text" : "password"} required autoComplete="current-password" className={`${edInput} pl-9 pr-12`} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" />
                      <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center text-clinic-muted transition-colors hover:text-clinic-text">
                        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </EdField>
                  {error && (
                    <p role="alert" className="border-l-2 border-state-err bg-state-errbg px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-state-err">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={busy || !ready}
                    className="grid min-h-[44px] w-full place-items-center border border-navy-800 bg-navy-800 px-6 py-3 text-sm font-bold text-white transition-colors duration-200 hover:bg-navy-700 disabled:cursor-not-allowed disabled:border-clinic-border disabled:bg-clinic-border disabled:text-clinic-muted"
                  >
                    {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : "Entrar"}
                  </button>
                  <p className="text-[12px] leading-relaxed text-clinic-muted">
                    ¿Sin cuenta? Las cuentas las crea el <b className="font-bold text-clinic-text">administrador</b> de tu
                    clínica (Configuración → Usuarios). ¿Querés conocer Novudent? Usá la pestaña{" "}
                    <b className="font-bold text-clinic-text">Ver demo</b>.
                  </p>
                </form>
              ) : (
                <div>
                  <h1 className="font-display text-2xl font-extrabold tracking-[-0.025em] text-navy-800">Recorré la demo</h1>
                  <p className="mt-1.5 text-sm leading-relaxed text-clinic-muted">
                    Datos de ejemplo. Cada rol ve y puede hacer cosas distintas (RBAC).
                  </p>

                  {ready && demoUsers.length === 0 && (
                    <div className="mt-6 border border-dashed border-clinic-border p-5 text-center">
                      <p className="font-display text-base font-bold tracking-[-0.015em] text-navy-800">La demo está vacía</p>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-clinic-muted">
                        Cargá los datos de ejemplo (pacientes, agenda, caja) para recorrerla.
                        Tus cuentas reales no se tocan.
                      </p>
                      <button
                        onClick={async () => {
                          setSeeding(true);
                          try { await seedDemo(); } finally { setSeeding(false); }
                        }}
                        disabled={seeding}
                        className="mt-4 inline-flex min-h-[44px] items-center gap-2 border border-navy-800 bg-navy-800 px-5 py-2.5 text-sm font-bold text-white transition-colors duration-200 hover:bg-navy-700 disabled:cursor-not-allowed disabled:border-clinic-border disabled:bg-clinic-border disabled:text-clinic-muted"
                      >
                        {seeding ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        Restaurar datos de demo
                      </button>
                    </div>
                  )}

                  {ready && demoUsers.length > 0 && (
                    <div className="mt-6 border-t border-clinic-border">
                      {demoUsers.map((u) => {
                        const Icon = ICON[u.role];
                        return (
                          <button
                            key={u.id}
                            onClick={() => { login(u.id); router.replace("/app"); }}
                            className="flex min-h-[44px] w-full items-center gap-3.5 border-b border-clinic-border py-3.5 text-left transition-colors duration-200 hover:bg-paper-2"
                          >
                            <span className="grid h-10 w-10 shrink-0 place-items-center text-white" style={{ background: u.color }}>
                              <Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-clinic-text">{u.name}</span>
                              <span className="block truncate font-mono text-[11px] uppercase tracking-[0.14em] text-clinic-muted">
                                {ROLE_LABEL[u.role]}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <p className="mt-4 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-clinic-muted">
                    Backend: {backend === "firebase" ? "Firebase conectado" : backend === "local" ? "modo local" : "conectando…"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Vuelta al sitio en móvil — en escritorio ya está arriba de la columna navy */}
          <p className="mt-6 text-center lg:hidden">
            <a href="/" className="ed-link ed-tap inline-flex items-center gap-1.5 text-[13px] font-bold text-clinic-muted hover:text-clinic-text">
              <ArrowLeft className="h-3.5 w-3.5" /> Volver al sitio
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
