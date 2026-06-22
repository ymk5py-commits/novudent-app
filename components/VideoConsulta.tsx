"use client";
/** Videoconsulta embebida con Jitsi Meet (telemedicina — spec 9.3). Sin API key
 *  ni costo: usa la IFrame API pública de meet.jit.si. Si el embed no carga,
 *  hay link de respaldo para abrir la sala en una pestaña nueva. */
import { useEffect, useRef } from "react";

declare global {
  interface Window { JitsiMeetExternalAPI?: new (domain: string, opts: Record<string, unknown>) => { dispose: () => void; addEventListener: (e: string, cb: () => void) => void } }
}

export function VideoConsulta({ room, displayName, onClose }: { room: string; displayName?: string; onClose?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ dispose: () => void; addEventListener: (e: string, cb: () => void) => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const init = () => {
      if (cancelled || !ref.current || !window.JitsiMeetExternalAPI) return;
      ref.current.innerHTML = "";
      apiRef.current = new window.JitsiMeetExternalAPI("meet.jit.si", {
        roomName: room,
        parentNode: ref.current,
        width: "100%",
        height: "100%",
        userInfo: displayName ? { displayName } : undefined,
        configOverwrite: { prejoinPageEnabled: false, startWithAudioMuted: false },
      });
      if (onClose) apiRef.current.addEventListener("readyToClose", onClose);
    };
    if (window.JitsiMeetExternalAPI) {
      init();
    } else {
      const existing = document.getElementById("jitsi-ext-api") as HTMLScriptElement | null;
      if (existing) existing.addEventListener("load", init);
      else {
        const s = document.createElement("script");
        s.id = "jitsi-ext-api";
        s.src = "https://meet.jit.si/external_api.js";
        s.async = true;
        s.onload = init;
        document.body.appendChild(s);
      }
    }
    return () => { cancelled = true; try { apiRef.current?.dispose(); } catch { /* ya cerrada */ } };
  }, [room, displayName, onClose]);

  return (
    <div className="flex h-full w-full flex-col">
      <div ref={ref} className="min-h-[420px] flex-1 overflow-hidden rounded-xl bg-black" />
      <p className="mt-2 text-center text-[11px] text-clinic-muted">
        ¿No carga el video? <a href={`https://meet.jit.si/${encodeURIComponent(room)}`} target="_blank" rel="noopener noreferrer" className="font-bold text-azure-600 hover:underline">Abrí la videollamada en una pestaña nueva</a>.
      </p>
    </div>
  );
}
