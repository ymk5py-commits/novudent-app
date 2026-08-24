import type { Metadata } from "next";
import { PaginaSeccion } from "@/components/landing/Chrome";
import { SeccionAccion } from "@/components/Landing";

export const metadata: Metadata = {
  title: "El producto en acción — consultorio y app en un loop",
  description:
    "Una animación con el producto real: la cita se agenda, el dentista atiende, el hallazgo se marca en la pieza 16 y el cobro pasa a facturado. Catorce segundos del día completo de una consulta en Novudent.",
  alternates: { canonical: "/en-accion" },
};

export default function EnAccionPage() {
  return (
    <PaginaSeccion
      activa="/en-accion"
      etiqueta="En acción"
      titulo={<>Mirá Novudent <span className="text-sv-mint">trabajando solo</span>.</>}
      intro="El día completo de una consulta, en un loop de catorce segundos: la cita se agenda, el hallazgo se marca en la pieza, el cobro se factura. No hay maquillaje — el tablero es el odontograma real del sistema."
    >
      <SeccionAccion />

      {/* Versión video del loop — para compartir, presentar o descargar.
          preload="none": no baja un byte hasta que el visitante le da play. */}
      <div className="mx-auto mt-14 max-w-4xl">
        <figure className="m-0 overflow-hidden rounded-[1.5rem] border border-sv-line bg-white shadow-card">
          <video
            controls
            preload="none"
            poster="/videos/novudent-en-accion.jpg"
            className="block h-auto w-full"
            aria-label="Video: el día de una consulta en Novudent, de la silla dental a la app"
          >
            <source src="/videos/novudent-en-accion.webm" type="video/webm" />
            <source src="/videos/novudent-en-accion.mp4" type="video/mp4" />
          </video>
          <figcaption className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-[14px] font-light text-sv-muted">
            <span>
              <b className="font-medium text-sv-ink">Versión video</b> — 15 s, para compartir o presentar.
            </span>
            <a
              href="/videos/novudent-en-accion.mp4"
              download="novudent-en-accion.mp4"
              className="inline-flex items-center gap-1.5 rounded-full border border-sv-line px-4 py-2 text-[13px] font-medium text-sv-ink transition-colors hover:border-sv-ink hover:bg-sv-ink hover:text-white"
            >
              Descargar MP4
            </a>
          </figcaption>
        </figure>
      </div>
    </PaginaSeccion>
  );
}
