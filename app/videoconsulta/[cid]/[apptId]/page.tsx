"use client";
/** Página pública de videoconsulta (el paciente abre el link de la clínica).
 *  Sala determinística por clínica+cita; sin sesión. */
import { VideoConsulta } from "@/components/VideoConsulta";

export default function VideoConsultaPublic({ params }: { params: { cid: string; apptId: string } }) {
  const room = `nvd-${params.cid}-${params.apptId}`;
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
            <VideoConsulta room={room} displayName="Paciente" />
          </div>
        </div>
      </main>
    </div>
  );
}
