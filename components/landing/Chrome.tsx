"use client";
/**
 * Chrome público compartido — nav, footer y piezas del sistema visual.
 *
 * Vive separado de Landing.tsx para que las páginas de sección (/precios,
 * /capacidades, /odontograma, /como-se-trabaja, /en-accion, /acceso) usen el
 * MISMO nav y footer que la home: es lo que sostiene el internal linking que
 * Google premia. Todas las rutas del nav son REALES (sin anclas #): cada
 * sección es una página indexable con su propia metadata.
 */
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useStore } from "@/lib/store";

/** Rutas públicas del sitio — la fuente única para nav, footer, cross-links
 *  y sitemap. Agregar acá = aparecer en todos lados. */
export const RUTAS_PUBLICAS = [
  { href: "/odontograma", label: "Odontograma" },
  { href: "/capacidades", label: "Capacidades" },
  { href: "/como-se-trabaja", label: "Cómo se trabaja" },
  { href: "/en-accion", label: "En acción" },
  { href: "/precios", label: "Precios" },
] as const;

/** Logotipo con el punto en menta — la firma de la referencia. */
export function Marca({ className = "", dot = "text-sv-mint" }: { className?: string; dot?: string }) {
  return (
    <span className={`font-logo font-light tracking-[0.14em] ${className}`}>
      NOVUdent<span className={dot}>.</span>
    </span>
  );
}

/** Cabecera de sección: etiqueta · claim · marca, con la línea fina abajo. */
export function BarraSeccion({ label }: { label: string }) {
  return (
    <div className="mb-12 pb-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-logo text-sm font-medium uppercase tracking-[0.2em] text-sv-muted">{label}</span>
        <span className="hidden font-logo text-sm font-light tracking-wide text-sv-muted md:block">
          Agenda · Ficha clínica · Facturación
        </span>
        <Marca className="text-sm text-sv-muted" dot="text-sv-mintInk" />
      </div>
      <div className="sv-draw mt-3 h-px w-full bg-sv-line" />
    </div>
  );
}

/** Píldora CTA de la referencia, con barrido de brillo. */
export function PildoraCTA({ href, children, tone = "dark" }: { href: string; children: React.ReactNode; tone?: "dark" | "light" }) {
  const oscuro = tone === "dark";
  return (
    <Link
      href={href}
      className={`btn-shine group inline-flex items-center gap-3 rounded-full py-2 pl-6 pr-2 text-[15px] font-medium transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-12px_rgba(47,227,174,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sv-mintInk ${
        oscuro ? "bg-sv-ink text-white" : "bg-white text-sv-ink"
      }`}
    >
      {children}
      <span className="grid h-9 w-9 place-items-center rounded-full bg-sv-mint text-sv-ink">
        <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.75} />
      </span>
    </Link>
  );
}

/** Numeral gigante ultra-fino con la regla menta debajo (se dibuja al entrar). */
export function Numeral({ n, className = "" }: { n: string; className?: string }) {
  return (
    <div className={className}>
      <div className="font-logo text-[4.5rem] font-extralight leading-none tracking-tight text-sv-ink sm:text-[5.5rem]">{n}</div>
      <div className="sv-draw sv-rule mt-3 w-14" />
    </div>
  );
}

/** Nav público — idéntico en la home y en las páginas de sección. */
export function NavLanding() {
  const { session } = useStore();
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-sv-ink/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-baseline gap-2.5">
          <Marca className="text-xl text-white" />
          <span className="hidden text-[11px] uppercase tracking-[0.3em] text-white/35 sm:block">by NOVUM</span>
        </Link>
        <nav className="hidden items-center gap-1 text-[15px] font-light text-white/60 md:flex" aria-label="Secciones">
          {RUTAS_PUBLICAS.map((r) => (
            <Link key={r.href} href={r.href} className="rounded-full px-3.5 py-2 transition-colors hover:bg-white/10 hover:text-white">
              {r.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {/* py-2.5: el mínimo táctil en móvil es 44px */}
          <Link href="/login" className="hidden rounded-full px-4 py-2.5 text-[15px] font-light text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:block">Iniciar sesión</Link>
          <Link href={session ? "/app" : "/acceso"} className="rounded-full bg-sv-mint px-5 py-2.5 text-[15px] font-medium text-sv-ink transition-transform hover:-translate-y-0.5">
            {session ? "Ir al panel" : "Solicitar acceso"}
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Footer público compartido. */
export function FooterLanding() {
  return (
    <footer className="bg-sv-ink">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-white/10 px-5 py-9 sm:flex-row">
        <Marca className="text-lg text-white" />
        <p className="text-[13px] font-light text-white/40">
          © {new Date().getFullYear()} Novudent · un producto de{" "}
          <a href="https://novum-web-six.vercel.app" className="text-sv-mint hover:underline">NOVUM Holding</a> · Asunción, Paraguay
        </p>
        <Link href="/login" className="text-[13px] font-light text-white/60 transition-colors hover:text-white">Iniciar sesión →</Link>
      </div>
    </footer>
  );
}

/** Estructura común de las páginas de sección: nav + banda de apertura con el
 *  H1 único + contenido + cross-links (internal linking) + CTA + footer. */
export function PaginaSeccion({
  activa,
  etiqueta,
  titulo,
  intro,
  children,
}: {
  activa: string;
  etiqueta: string;
  titulo: React.ReactNode;
  intro: string;
  children: React.ReactNode;
}) {
  const { session } = useStore();
  const otras = RUTAS_PUBLICAS.filter((r) => r.href !== activa);
  return (
    <div className="bg-sv-paper font-logo text-[17px] font-normal leading-relaxed text-sv-ink">
      <NavLanding />
      <section className="sv-mesh sv-grain relative overflow-hidden pb-16 pt-28 sm:pb-20 sm:pt-36">
        <div className="relative z-10 mx-auto max-w-6xl px-5">
          <nav aria-label="Ruta" className="mb-6 flex items-center gap-2 text-[12px] font-light uppercase tracking-[0.18em] text-white/45">
            <Link href="/" className="transition-colors hover:text-white">Inicio</Link>
            <span aria-hidden>/</span>
            <span className="text-sv-mint">{etiqueta}</span>
          </nav>
          <h1 className="max-w-4xl font-logo text-[2.75rem] font-extralight leading-[1.02] tracking-[-0.02em] text-white sm:text-[4.25rem]">
            {titulo}
          </h1>
          <p className="mt-6 max-w-2xl text-lg font-light leading-relaxed text-white/65">{intro}</p>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        {children}

        {/* cross-links: cada página de sección empuja a las demás */}
        <div className="mt-16 border-t border-sv-line pt-8">
          <p className="text-[12px] uppercase tracking-[0.2em] text-sv-muted">Seguí mirando</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {otras.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="group inline-flex items-center gap-2 rounded-full border border-sv-line bg-white px-5 py-2.5 text-[14px] font-medium text-sv-ink transition-colors hover:border-sv-ink hover:bg-sv-ink hover:text-white"
              >
                {r.label}
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.75} />
              </Link>
            ))}
          </div>
        </div>

        {/* cierre de conversión */}
        <div className="sv-mesh sv-grain relative mt-16 overflow-hidden rounded-[1.5rem] p-8 sm:p-10">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
            <div>
              <h2 className="font-logo text-[1.9rem] font-extralight leading-tight text-white sm:text-[2.4rem]">
                ¿Lo querés en <span className="text-sv-mint">tu clínica</span>?
              </h2>
              <p className="mt-2 max-w-md text-[15px] font-light text-white/65">
                Te lo mostramos funcionando con tus datos y migramos lo que ya tenés. Respuesta en menos de 24 h hábiles.
              </p>
            </div>
            <PildoraCTA href={session ? "/app" : "/acceso"} tone="light">
              {session ? "Ir al panel" : "Solicitar acceso"}
            </PildoraCTA>
          </div>
        </div>
      </main>
      <FooterLanding />
    </div>
  );
}
