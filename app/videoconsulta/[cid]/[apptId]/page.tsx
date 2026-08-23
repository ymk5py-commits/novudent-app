"use client";
/** Página pública de videoconsulta (el paciente abre el link de la clínica).
 *  La sala se deriva del token `?t=` del link (no adivinable). Sin él, cae a la
 *  sala legacy por compatibilidad con links viejos. Sin sesión. */
import { use, useEffect, useState } from "react";
import { VideoConsulta } from "@/components/VideoConsulta";

/* En Next 15+ `params` es una Promise: se desenvuelve con React.use(). */
export default function VideoConsultaPublic({ params }: { params: Promise<{ cid: string; apptId: string }> }) {
  const { cid, apptId } = use(params);
  const [room, setRoom] = useState<string | null>(null);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    setRoom(t ? `nvd-${t}` : `nvd-${cid}-${apptId}`);
  }, [cid, apptId]);

  return (
    <div className="flex min-h-screen flex-col bg-clinic-bg">
      <header className="flex items-center gap-2 border-b border-clinic-border bg-white px-4 py-3">
        <span className="font-logo text-lg font-extrabold text-azure-600">Novudent</span>
        <span className="text-sm text-clinic-muted">· Videoconsulta</span>
      </header>
      <main className="flex flex-1 flex-col p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
          <p className="mb-2 text-sm text-clinic-muted">Estás por unirte a tu videoconsulta. Permití el acceso a cámara y micrófono cuando el navegador lo pida.</p>
          <div className="min-h-[60vh] flex-1">
            {room ? <VideoConsulta room={room} displayName="Paciente" /> : <p className="py-12 text-center text-sm text-clinic-muted">Cargando…</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
