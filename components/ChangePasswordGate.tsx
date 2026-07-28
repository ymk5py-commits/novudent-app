"use client";
/** Cambio de contraseña OBLIGATORIO al primer login.
 *  Bloquea el dashboard hasta que el usuario reemplaza la contraseña inicial
 *  que le asignó el administrador (cierra el riesgo de la credencial inicial
 *  que viaja en texto). Se muestra cuando el usuario tiene mustChangePassword. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff, LoaderCircle, ShieldCheck, LogOut } from "lucide-react";
import { useStore } from "@/lib/store";
import { Field, inputCls } from "@/components/ui";

function friendlyError(e: any): string {
  const code = e?.code ?? "";
  if (code.includes("requires-recent-login"))
    return "Por seguridad, cerrá sesión y volvé a entrar para poder cambiar tu contraseña.";
  if (code.includes("weak-password")) return "La contraseña debe tener al menos 6 caracteres.";
  if (code.includes("network")) return "Sin conexión. Verificá tu internet.";
  return e?.message ?? "No se pudo cambiar la contraseña.";
}

export default function ChangePasswordGate() {
  const { changeMyPassword, logout, session } = useStore();
  const router = useRouter();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (p1.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    if (p1 !== p2) { setError("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try {
      await changeMyPassword(p1);
      // el flag queda en false → el Shell deja pasar al dashboard
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center p-6" style={{ background: "linear-gradient(160deg,#0F1F3D 0%,#07142C 75%)" }}>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="font-logo text-3xl tracking-[0.22em] text-white">NOVUdent</div>
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-azure-500/20 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-azure-200">
            <ShieldCheck className="h-3 w-3" /> Seguridad
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white p-7 shadow-pop">
          <h1 className="text-xl font-extrabold text-navy-800">Creá tu contraseña</h1>
          <p className="mt-1 text-sm text-clinic-muted">
            Hola {session?.name?.split(" ")[0]} 👋 Por seguridad, reemplazá la contraseña inicial
            que te dieron por una tuya antes de continuar.
          </p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Nueva contraseña">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
                <input type={show ? "text" : "password"} required minLength={6} autoComplete="new-password" className={`${inputCls} pl-9 pr-10`} value={p1} onChange={(e) => setP1(e.target.value)} placeholder="Mínimo 6 caracteres" />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar" : "Mostrar"} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-clinic-muted hover:text-clinic-text">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Field label="Repetí la contraseña">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
                <input type={show ? "text" : "password"} required minLength={6} autoComplete="new-password" className={`${inputCls} pl-9`} value={p2} onChange={(e) => setP2(e.target.value)} placeholder="Repetir" />
              </div>
            </Field>
            {error && <p role="alert" className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-state-err">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="grid w-full place-items-center rounded-2xl bg-azure-600 py-3 text-sm font-extrabold text-white shadow-[0_8px_24px_-8px_rgba(46,131,245,0.6)] transition-all hover:-translate-y-0.5 hover:bg-azure-700 disabled:cursor-not-allowed disabled:bg-clinic-border disabled:text-clinic-muted"
            >
              {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : "Guardar y continuar"}
            </button>
            <button
              type="button"
              onClick={() => { logout(); router.replace("/login"); }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-clinic-border py-2.5 text-sm font-bold text-clinic-muted transition-colors hover:bg-clinic-bg"
            >
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
