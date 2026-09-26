/**
 * Plantilla de las páginas legales (/privacidad, /terminos, /cookies).
 *
 * ⚠️ Los textos de esas páginas son un BORRADOR inicial escrito sin asesoría
 * legal: hay que hacerlos revisar por un abogado antes de darlos por finales.
 */
import Link from "next/link";
import { NavLanding, FooterLanding } from "./Chrome";
import { RUTAS_LEGALES } from "@/lib/landing/rutas";
import { CONTACTO_LEGAL } from "@/lib/site";

export const ACTUALIZADO = "26 de septiembre de 2026";

/** A dónde escribir por temas de datos: el correo legal si está cargado, si no el formulario. */
export function Contacto() {
  return CONTACTO_LEGAL ? (
    <a href={`mailto:${CONTACTO_LEGAL}`}>{CONTACTO_LEGAL}</a>
  ) : (
    <Link href="/acceso">el formulario de contacto</Link>
  );
}

export default function PaginaLegal({ ruta, titulo, children }: { ruta: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="lp-root min-h-dvh font-lp text-[16px] leading-relaxed">
      <NavLanding />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-32 sm:px-6 sm:pt-40">
        <div className="grid gap-10 lg:grid-cols-12">
          <nav aria-label="Páginas legales" className="lg:col-span-3">
            <ul className="flex flex-wrap gap-2 lg:sticky lg:top-28 lg:flex-col lg:gap-0.5">
              {RUTAS_LEGALES.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    aria-current={r.href === ruta ? "page" : undefined}
                    className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border border-lp-rule px-4 text-[15px] text-lp-muted hover:text-lp-ink aria-[current=page]:border-lp-ink aria-[current=page]:font-semibold aria-[current=page]:text-lp-ink lg:rounded-none lg:border-0 lg:border-l-2 lg:border-transparent lg:px-4 lg:aria-[current=page]:border-lp-ink"
                  >
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <article className="lp-legal max-w-3xl lg:col-span-9">
            <h1 className="text-[clamp(2.25rem,5vw,3.25rem)] font-bold leading-[1.05] tracking-[-0.02em] text-lp-ink">{titulo}</h1>
            <p className="mt-3 text-[13px] font-medium text-lp-muted">Última actualización: {ACTUALIZADO}</p>
            {children}
          </article>
        </div>
      </main>
      <FooterLanding />
    </div>
  );
}
