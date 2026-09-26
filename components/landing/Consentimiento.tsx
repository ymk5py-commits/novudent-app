"use client";
/**
 * Aviso de cookies y panel de preferencias.
 *
 * - Aceptar y Rechazar pesan lo mismo (mismo tamaño, mismo estilo): rechazar no
 *   puede ser más difícil que aceptar.
 * - Hasta que la persona elige, no corre nada que no sea necesario: Analytics
 *   espera a `guardarConsentimiento(true)` (ver lib/firebase.ts).
 * - "Configurar cookies" (pie y /cookies) vuelve a abrir el panel desde cualquier
 *   página, para cambiar de opinión.
 * - Mientras el aviso está abierto, <html data-cookies="pendiente"> esconde la
 *   barra fija del celular para que no se pisen.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { abrirPreferencias, alAbrirPreferencias, guardarConsentimiento, leerConsentimiento } from "@/lib/consentimiento";

const boton =
  "inline-flex min-h-[44px] flex-1 basis-[7.5rem] items-center justify-center whitespace-nowrap rounded-full border border-lp-ink px-5 text-[15px] font-semibold text-lp-ink transition-colors duration-150 hover:bg-lp-ink hover:text-lp-onink";

export default function Consentimiento() {
  const [aviso, setAviso] = useState(false);
  const [analitica, setAnalitica] = useState(false);
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const c = leerConsentimiento();
    if (c) setAnalitica(c.analitica);
    else setAviso(true);
    return alAbrirPreferencias(() => {
      setAnalitica(leerConsentimiento()?.analitica ?? false);
      dialogo.current?.showModal();
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.cookies = aviso ? "pendiente" : "listo";
  }, [aviso]);

  const decidir = (a: boolean) => {
    guardarConsentimiento(a);
    setAnalitica(a);
    setAviso(false);
    dialogo.current?.close();
  };

  return (
    <>
      {aviso && (
        <section
          aria-label="Aviso de cookies"
          className="lp-capa fixed inset-x-3 bottom-3 z-[500] rounded-[var(--lp-radius-card)] border border-lp-rule bg-lp-paper p-5 font-sans text-lp-ink [box-shadow:var(--lp-shadow-float)] sm:left-auto sm:right-4 sm:max-w-md"
        >
          <h2 className="font-logo text-[17px] font-bold">Cookies</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-lp-muted">
            Usamos las necesarias para que el sitio funcione. Si aceptás, también analítica para saber qué páginas sirven.
            Más detalle en <Link href="/cookies" className="underline underline-offset-2 hover:text-lp-ink">cookies</Link>.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={boton} onClick={() => decidir(false)}>Rechazar</button>
            <button type="button" className={boton} onClick={() => decidir(true)}>Aceptar</button>
          </div>
          <button
            type="button"
            className="mt-2 inline-flex min-h-[40px] items-center text-[14px] font-semibold text-lp-muted underline underline-offset-2 hover:text-lp-ink"
            onClick={() => dialogo.current?.showModal()}
          >
            Configurar
          </button>
        </section>
      )}

      <dialog
        ref={dialogo}
        aria-labelledby="cookies-titulo"
        className="lp-capa w-[min(32rem,calc(100vw-2rem))] rounded-[var(--lp-radius-card)] border border-lp-rule bg-lp-paper p-0 font-sans text-lp-ink [box-shadow:var(--lp-shadow-float)] backdrop:bg-[var(--lp-scrim)]"
      >
        <form
          method="dialog"
          className="p-6"
          onSubmit={(e) => {
            e.preventDefault();
            decidir(analitica);
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <h2 id="cookies-titulo" className="font-logo text-[20px] font-bold">Preferencias de cookies</h2>
            <button
              type="button"
              aria-label="Cerrar"
              className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-lp-muted hover:bg-lp-paper2 hover:text-lp-ink"
              onClick={() => dialogo.current?.close()}
            >
              <X className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>

          <div className="mt-4 divide-y divide-lp-rule border-y border-lp-rule">
            <div className="flex items-start justify-between gap-4 py-4">
              <div>
                <p className="text-[15px] font-semibold">Necesarias</p>
                <p className="mt-1 text-[14px] leading-relaxed text-lp-muted">Tu sesión, tus preferencias y esta misma elección. Sin ellas el sitio no funciona.</p>
              </div>
              <span className="whitespace-nowrap pt-0.5 text-[13px] font-semibold text-lp-muted">Siempre activas</span>
            </div>
            <label className="flex cursor-pointer items-start justify-between gap-4 py-4">
              <span>
                <span className="block text-[15px] font-semibold">Analítica</span>
                <span className="mt-1 block text-[14px] leading-relaxed text-lp-muted">
                  Google Analytics: qué páginas se visitan y desde dónde, sin datos de pacientes.
                </span>
              </span>
              <input
                type="checkbox"
                name="analitica"
                checked={analitica}
                onChange={(e) => setAnalitica(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[var(--lp-accent-ink)]"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={boton} onClick={() => decidir(false)}>Rechazar todas</button>
            <button type="submit" className={boton}>Guardar</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Botón para reabrir las preferencias desde el contenido de una página (p. ej. /cookies). */
export function BotonConfigurarCookies({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={abrirPreferencias}
      className={`inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border border-lp-ink px-5 text-[15px] font-semibold text-lp-ink transition-colors duration-150 hover:bg-lp-ink hover:text-lp-onink ${className}`}
    >
      Configurar cookies
    </button>
  );
}
