"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Stethoscope, Headset, Mail, Lock, Eye, EyeOff, LoaderCircle, ArrowLeft, Sparkles, RotateCcw, KeyRound, CheckCircle2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/rbac";
import { Field, inputCls } from "@/components/ui";
import { sendPasswordReset } from "@/lib/firebase";

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

/** Errores del envío de "olvidé mi contraseña". A propósito NO tiene un caso
 *  para `auth/user-not-found`: tratarlo distinto de un envío exitoso le deja a
 *  cualquiera probar emails uno por uno para descubrir cuáles están
 *  registrados en una clínica — el caller ya lo swallowea antes de llegar acá. */
function friendlyResetError(e: any): string {
  const code = e?.code ?? "";
  if (code.includes("invalid-email")) return "Ese email no tiene un formato válido.";
  if (code.includes("too-many-requests")) return "Demasiados intentos. Esperá unos minutos y probá de nuevo.";
  if (code.includes("network")) return "Sin conexión. Verificá tu internet.";
  return "No pudimos enviar el correo. Probá de nuevo en un momento.";
}

export default function Login() {
  const { db, login, loginWithEmail, seedDemo, ready, backend } = useStore();
  const router = useRouter();
  /* La demo ya no se ofrece al público: Novudent se vende con acceso
     solicitado. NO se borró — sigue viva en `/login?demo=1` para mostrarla en
     una reunión de venta. Borrarla habría dejado a Carlos sin su herramienta de
     demostración, que es justo lo contrario de lo que se busca.
     *
     * Arranca en `false` A PROPÓSITO, aunque la URL ya traiga `?demo=1`. Leer
     * `window.location.search` durante el render rompía la hidratación: el HTML
     * del servidor no conoce `window` (siempre renderiza sin la pestaña de
     * demo), y si el cliente calculaba `true` en su primer render, React
     * encontraba un árbol distinto al que acababa de recibir y tiraba la página
     * entera — "Hydration failed" en la consola, la MISMA familia de bug que ya
     * rompió la landing esta semana. El useEffect de abajo corre recién después
     * de que React confirmó que el primer render coincidió; ahí sí es seguro
     * activar la pestaña. Carlos ve un parpadeo de un frame en su demo de
     * venta, no una página que se cae en cualquier visita normal. */
  const [demoHabilitada, setDemoHabilitada] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("demo")) setDemoHabilitada(true);
  }, []);
  const [tab, setTab] = useState<"auth" | "demo">("auth");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demoUsers = db.users.filter((u) => !u.authUid);

  /* Recuperar contraseña: vista aparte dentro de la misma card, no una página
   * nueva — así conserva el email que la persona ya haya tecleado. Antes esto
   * no existía y cada olvido era un llamado a Carlos para recrear la cuenta a
   * mano; no escala pasadas un puñado de clínicas. */
  const [vista, setVista] = useState<"login" | "recuperar">("login");
  const [recEmail, setRecEmail] = useState("");
  const [recBusy, setRecBusy] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [recEnviado, setRecEnviado] = useState(false);

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

  async function submitRecuperar(e: React.FormEvent) {
    e.preventDefault();
    setRecBusy(true);
    setRecError(null);
    try {
      await sendPasswordReset(recEmail.trim());
      setRecEnviado(true);
    } catch (err: any) {
      // user-not-found se trata IGUAL que un envío exitoso: no hay que
      // distinguirlo, o cualquiera podría probar emails uno por uno para
      // descubrir cuáles están dados de alta en una clínica.
      if (String(err?.code ?? "").includes("user-not-found")) setRecEnviado(true);
      else setRecError(friendlyResetError(err));
    } finally {
      setRecBusy(false);
    }
  }

  function volverALogin() {
    setVista("login");
    setRecError(null);
    setRecEnviado(false);
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
        {/* Sin animación de entrada: framer serializa el opacity:0 en el HTML del
            servidor. Si no hidrata, el formulario de login queda invisible — y es
            la puerta de entrada a la app. No vale medio segundo de fundido. */}
        <div className="w-full max-w-md">
          <div className="mb-6 text-center lg:hidden">
            <div className="font-logo text-3xl tracking-[0.22em] text-navy-800">NOVUdent</div>
          </div>

          <div className="rounded-3xl border border-clinic-border bg-white p-7 shadow-pop">
            {/* Tabs */}
            {demoHabilitada && (
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
            )}

            {vista === "recuperar" ? (
              recEnviado ? (
                <div className="space-y-4 text-center">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-state-okbg text-state-ok">
                    <CheckCircle2 className="h-6 w-6" />
                  </span>
                  <div>
                    <h1 className="text-xl font-extrabold text-navy-800">Revisá tu correo</h1>
                    <p className="mt-1.5 text-sm leading-relaxed text-clinic-muted">
                      Si <b>{recEmail.trim()}</b> tiene una cuenta en Novudent, te llegó un
                      correo con el link para elegir una contraseña nueva.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={volverALogin}
                    className="text-sm font-bold text-azure-700 hover:underline"
                  >
                    Volver a iniciar sesión
                  </button>
                </div>
              ) : (
                <form onSubmit={submitRecuperar} className="space-y-4">
                  <div>
                    <button
                      type="button"
                      onClick={volverALogin}
                      className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-clinic-muted hover:text-clinic-text"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> Volver
                    </button>
                    <h1 className="flex items-center gap-2 text-xl font-extrabold text-navy-800">
                      <KeyRound className="h-5 w-5 text-azure-600" /> Recuperar contraseña
                    </h1>
                    <p className="mt-1 text-sm text-clinic-muted">
                      Ingresá el email con el que te dio de alta el administrador de tu clínica.
                    </p>
                  </div>
                  <Field label="Email">
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
                      <input type="email" required autoComplete="email" className={`${inputCls} pl-9`} value={recEmail} onChange={(e) => setRecEmail(e.target.value)} placeholder="vos@tuclinica.com" />
                    </div>
                  </Field>
                  {recError && <p role="alert" className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-state-err">{recError}</p>}
                  <button
                    type="submit"
                    disabled={recBusy}
                    className="grid w-full place-items-center rounded-2xl bg-azure-600 py-3 text-sm font-extrabold text-white shadow-[0_8px_24px_-8px_rgba(46,131,245,0.6)] transition-all hover:-translate-y-0.5 hover:bg-azure-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-clinic-border disabled:text-clinic-muted disabled:shadow-none"
                  >
                    {recBusy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : "Enviar instrucciones"}
                  </button>
                </form>
              )
            ) : tab === "auth" || !demoHabilitada ? (
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
                <div className="-mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => { setRecEmail(email); setVista("recuperar"); }}
                    className="text-xs font-bold text-azure-700 hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
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
                  (Configuración → Usuarios). ¿Querés conocer Novudent? <a href="/#acceso" className="font-bold text-azure-700 hover:underline">Pedí tu acceso</a>.
                </p>
              </form>
            ) : (
              <div className="space-y-2.5">
                <div className="mb-4">
                  <h1 className="text-xl font-extrabold text-navy-800">Recorré la demo</h1>
                  <p className="mt-1 text-sm text-clinic-muted">Datos de ejemplo. Cada rol ve y puede hacer cosas distintas (RBAC).</p>
                </div>
                {ready && demoUsers.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-clinic-border p-5 text-center">
                    <p className="text-sm font-semibold text-clinic-text">La demo está vacía</p>
                    <p className="mt-1 text-xs leading-relaxed text-clinic-muted">
                      Cargá los datos de ejemplo (pacientes, agenda, caja) para recorrerla.
                      Tus cuentas reales no se tocan.
                    </p>
                    <button
                      onClick={async () => {
                        setSeeding(true);
                        try { await seedDemo(); } finally { setSeeding(false); }
                      }}
                      disabled={seeding}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-azure-600 px-4 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-azure-700 disabled:cursor-not-allowed disabled:bg-clinic-border disabled:text-clinic-muted"
                    >
                      {seeding ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      Restaurar datos de demo
                    </button>
                  </div>
                )}
                {ready &&
                  demoUsers.map((u) => {
                    const Icon = ICON[u.role];
                    return (
                      <button
                        key={u.id}
                        onClick={async () => { await login(u.id); router.replace("/app"); }}
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
                <p className="pt-1 text-center font-mono text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                  Backend: {backend === "firebase" ? "Firebase conectado" : backend === "local" ? "modo local" : "conectando…"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
