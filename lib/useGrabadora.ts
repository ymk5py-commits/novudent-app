"use client";
/** Graba con el micrófono y entrega el audio en base64, que es lo que esperan las rutas /api/ia/*. */
import { useCallback, useEffect, useRef, useState } from "react";

export type EstadoGrabadora = "quieta" | "grabando" | "procesando";

/** Tope de una grabación: 5 minutos, muy por debajo de los 10 MB que acepta el servidor. */
export const MAX_SEGUNDOS = 300;

/** Un Blob de audio → base64 (por trozos: un `String.fromCharCode(...todo)` revienta la pila). */
export async function blobABase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const TROZO = 0x8000;
  for (let i = 0; i < bytes.length; i += TROZO) bin += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  return btoa(bin);
}

export function useGrabadora(alTerminar: (audioBase64: string, mimeType: string) => void | Promise<void>) {
  const [estado, setEstado] = useState<EstadoGrabadora>("quieta");
  const [error, setError] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  const grabador = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);
  // Siempre la última función, sin volver a armar `iniciar` en cada render.
  const final = useRef(alTerminar);
  useEffect(() => { final.current = alTerminar; });

  const parar = useCallback(() => {
    if (reloj.current) clearInterval(reloj.current);
    reloj.current = null;
    if (grabador.current && grabador.current.state !== "inactive") grabador.current.stop();
  }, []);

  // Al salir de la pantalla, el micrófono se suelta aunque se esté grabando.
  useEffect(() => () => {
    if (reloj.current) clearInterval(reloj.current);
    const g = grabador.current;
    if (g && g.state !== "inactive") { g.onstop = null; g.stop(); }
    g?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const iniciar = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const g = new MediaRecorder(stream, { mimeType: mime });
      trozos.current = [];
      g.ondataavailable = (e) => { if (e.data.size > 0) trozos.current.push(e.data); };
      g.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try {
          await final.current(await blobABase64(new Blob(trozos.current, { type: mime })), mime);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setEstado("quieta");
        }
      };
      g.start(1000);
      grabador.current = g;
      setSegundos(0);
      reloj.current = setInterval(() => setSegundos((s) => s + 1), 1000);
      setEstado("grabando");
    } catch {
      setError("No se pudo acceder al micrófono. Revisá los permisos del navegador.");
    }
  }, []);

  // Pasados los 5 minutos corta solo.
  useEffect(() => {
    if (estado === "grabando" && segundos >= MAX_SEGUNDOS) { setEstado("procesando"); parar(); }
  }, [estado, segundos, parar]);

  const detener = useCallback(() => { setEstado("procesando"); parar(); }, [parar]);

  return { estado, error, segundos, iniciar, detener };
}
