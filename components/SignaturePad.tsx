"use client";
/**
 * Pad de firma reusable (canvas + Pointer Events). Se usa tanto en la página
 * pública `/firmar/[cid]/[token]` como en el tab Consentimientos de la ficha.
 *
 * - Dibuja con Pointer Events (mouse/touch/lápiz) y `setPointerCapture` para no
 *   perder el trazo si el puntero sale del canvas a mitad de movimiento.
 * - Escala el lienzo por `devicePixelRatio` para que las líneas se vean nítidas
 *   en pantallas retina (el buffer interno es mayor que el tamaño CSS).
 * - Expone el PNG de dos formas: `onChange(dataUrl)` al terminar cada trazo, y un
 *   `ref` imperativo con `toDataURL()` / `clear()` / `isEmpty()`.
 * - "Vacío" = todavía no se dibujó ningún trazo (para no dejar firmar en blanco).
 *
 * Sin dependencias nuevas.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";

export interface SignaturePadHandle {
  /** PNG (data URL) del trazo actual; null/"" si está vacío. */
  toDataURL: () => string;
  /** Limpia el lienzo y vuelve al estado vacío. */
  clear: () => void;
  /** true si todavía no se dibujó nada. */
  isEmpty: () => boolean;
}

interface SignaturePadProps {
  /** Emite el PNG (data URL) cada vez que se termina un trazo. */
  onChange?: (dataUrl: string) => void;
  /** Alto CSS del lienzo en px (el ancho es 100%). Default 220. */
  height?: number;
  /** Texto guía que aparece mientras está vacío. */
  placeholder?: string;
  className?: string;
}

const STROKE_COLOR = "#0B1D3D"; // navy-900 (tinta de marca)
const STROKE_WIDTH = 2.5;

const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { onChange, height = 220, placeholder = "Firmá acá", className = "" },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  /** Reconfigura el contexto tras un resize (el buffer se reinicia al cambiar
   *  width/height del canvas, por eso fijamos estilo de línea cada vez). */
  const configureCtx = (ctx: CanvasRenderingContext2D, dpr: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = STROKE_WIDTH;
    ctx.strokeStyle = STROKE_COLOR;
  };

  /** Ajusta el buffer del canvas al tamaño CSS * devicePixelRatio. Borra el
   *  contenido (es esperable al redimensionar; la firma no se persiste a medias). */
  const resize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (ctx) configureCtx(ctx, dpr);
    setEmpty(true);
  };

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Coordenada del puntero relativa al canvas (en px CSS). */
  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const emit = () => {
    const canvas = canvasRef.current;
    if (canvas && onChange) onChange(empty ? "" : canvas.toDataURL("image/png"));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    drawing.current = true;
    last.current = pointFromEvent(e);
    setEmpty(false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !last.current) return;
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    // un pointerdown sin movimiento deja un punto: lo registramos igual como trazo
    const canvas = canvasRef.current;
    if (canvas && onChange) onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      // limpiar en coordenadas del buffer (reset transform), luego restaurar
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    drawing.current = false;
    last.current = null;
    setEmpty(true);
    onChange?.("");
  };

  useImperativeHandle(
    ref,
    (): SignaturePadHandle => ({
      toDataURL: () => {
        const canvas = canvasRef.current;
        return canvas && !empty ? canvas.toDataURL("image/png") : "";
      },
      clear,
      isEmpty: () => empty,
    }),
    [empty]
  );

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-clinic-border bg-white">
        <canvas
          ref={canvasRef}
          style={{ height, touchAction: "none" }}
          className="block w-full cursor-crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
        />
        {empty && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="select-none text-sm font-semibold text-clinic-muted/70">{placeholder}</span>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-end">
        <button
          type="button"
          onClick={clear}
          disabled={empty}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-clinic-muted hover:bg-clinic-bg disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Eraser className="h-3.5 w-3.5" /> Borrar
        </button>
      </div>
    </div>
  );
});

export default SignaturePad;
