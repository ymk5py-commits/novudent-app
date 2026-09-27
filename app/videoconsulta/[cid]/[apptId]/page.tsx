"use client";
/** Página pública de videoconsulta (el paciente abre el link de la clínica).
 *  La sala se deriva del token `?t=` del link (no adivinable). Sin él, cae a la
 *  sala legacy por compatibilidad con links viejos. Sin sesión.
 *
 *  La sala se abre en meet.jit.si a página completa, no embebida: desde el 18/5/2023
 *  meet.jit.si corta a los 5 minutos las llamadas embebidas en otros sitios («only meant
 *  for demo purposes»). Y desde el 24/8/2023 el primero que entra (el moderador) tiene
 *  que iniciar sesión con Google, GitHub o Facebook: por eso el profesional entra
 *  primero y el paciente, si llega antes, ve «esperando al anfitrión». Para una
 *  videoconsulta embebida y sin esas condiciones hace falta JaaS u otro proveedor. */
import { use, useEffect, useState } from "react";
import { Video, Mic, Clock } from "lucide-react";

/* En Next 15+ `params` es una Promise: se desenvuelve con React.use(). */
export default function VideoConsultaPublic({ params }: { params: Promise<{ cid: string; apptId: string }> }) {
  const { cid, apptId } = use(params);
  const [room, setRoom] = useState<string | null>(null);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    setRoom(t ? `nvd-${t}` : `nvd-${cid}-${apptId}`);
  }, [cid, apptId]);
  const sala = room ? `https://meet.jit.si/${encodeURIComponent(room)}#userInfo.displayName=%22Paciente%22` : null;

  return (
    <div className="flex min-h-screen flex-col bg-clinic-bg">
      <header className="flex items-center gap-2 border-b border-clinic-border bg-white px-4 py-3">
        <span className="font-logo text-lg font-extrabold text-azure-600">Novudent</span>
        <span className="text-sm text-clinic-muted">· Videoconsulta</span>
      </header>
      <main className="flex flex-1 items-start justify-center p-4 sm:p-8">
        <section className="w-full max-w-lg space-y-5 rounded-3xl bg-white p-6 shadow-card">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-azure-50 text-azure-600"><Video className="h-5 w-5" /></span>
            <h1 className="text-xl font-extrabold text-clinic-text">Tu videoconsulta</h1>
          </div>
          <ol className="space-y-3 text-sm text-clinic-text">
            <li className="flex gap-2"><Mic className="mt-0.5 h-4 w-4 shrink-0 text-azure-600" /> Tocá «Entrar a la videoconsulta» y permití la cámara y el micrófono cuando el navegador lo pida.</li>
            <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-azure-600" /> Si todavía no entró tu profesional, vas a ver que se espera al anfitrión: quedate en esa pantalla, la consulta arranca sola cuando entra.</li>
          </ol>
          {sala ? (
            <a href={sala} className="btn-shine flex w-full items-center justify-center gap-2 rounded-xl bg-azure-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-azure-700">
              <Video className="h-4 w-4" /> Entrar a la videoconsulta
            </a>
          ) : (
            <p className="py-3 text-center text-sm text-clinic-muted">Cargando…</p>
          )}
          <p className="text-center text-[11px] text-clinic-muted">La videollamada es por Jitsi Meet (meet.jit.si), en tu navegador. No hace falta instalar nada.</p>
        </section>
      </main>
    </div>
  );
}
