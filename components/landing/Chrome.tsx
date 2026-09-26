"use client";
/**
 * Chrome público compartido — nav, footer y piezas del sistema visual.
 *
 * Vive separado de Landing.tsx para que las páginas de sección (/precios,
 * /capacidades, /odontograma, /como-se-trabaja, /en-accion, /acceso y las
 * legales) usen el MISMO nav y footer que la home: es lo que sostiene el
 * internal linking que Google premia. Todas las rutas del nav son REALES (sin
 * anclas #): cada sección es una página indexable con su propia metadata.
 *
 * Colores y medidas salen de los tokens `--lp-*` (app/globals.css, expuestos
 * como `lp-*` en Tailwind). Nada de hex sueltos acá.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { abrirPreferencias } from "@/lib/consentimiento";
import { linkWhatsApp } from "@/lib/site";
import { RUTAS_LEGALES, RUTAS_PUBLICAS } from "@/lib/landing/rutas";

export { RUTAS_PUBLICAS, RUTAS_LEGALES } from "@/lib/landing/rutas";

/** Las cuatro que entran en la píldora del nav; "En acción" queda en el pie. */
const RUTAS_NAV = RUTAS_PUBLICAS.filter((r) => r.href !== "/en-accion");

/** Logotipo con el punto de acento. */
export function Marca({ className = "", dot = "text-lp-accentink" }: { className?: string; dot?: string }) {
  return (
    <span className={`font-logo font-light tracking-[0.14em] ${className}`}>
      NOVUdent<span className={dot}>.</span>
    </span>
  );
}

/** Cabecera de sección: etiqueta en mono + regla fina. */
export function BarraSeccion({ label }: { label: string }) {
  return (
    <div className="mb-10 flex items-center gap-4">
      <span className="whitespace-nowrap font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-lp-muted">{label}</span>
      <span className="h-px flex-1 bg-lp-rule" aria-hidden />
    </div>
  );
}

/** Botón-enlace principal. `dark` sobre papel, `light` sobre tinta. */
export function PildoraCTA({ href, children, tone = "dark" }: { href: string; children: React.ReactNode; tone?: "dark" | "light" }) {
  const oscuro = tone === "dark";
  return (
    <Link
      href={href}
      className={`group inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full px-5 text-[15px] font-semibold transition-colors duration-200 ${
        oscuro ? "bg-lp-ink text-lp-onink hover:bg-lp-ink2" : "bg-lp-paper text-lp-ink hover:bg-lp-paper3"
      }`}
    >
      {children}
      <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.75} aria-hidden />
    </Link>
  );
}

/** Cifra grande con su regla debajo. */
export function Numeral({ n, className = "" }: { n: string; className?: string }) {
  return (
    <div className={className}>
      <div className="lp-num font-logo text-[3rem] font-bold leading-none tracking-[-0.02em] text-lp-ink sm:text-[3.5rem]">{n}</div>
      <div className="mt-3 h-px w-12 bg-lp-ink" aria-hidden />
    </div>
  );
}

/** Nav público — píldora flotante, igual en la home y en las páginas de sección. */
export function NavLanding() {
  const { session } = useStore();
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const cta = session ? { href: "/app", label: "Ir al panel" } : { href: "/acceso", label: "Pedir una demo" };

  useEffect(() => {
    if (!abierto) return;
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  // Cambiar de página cierra el menú.
  useEffect(() => setAbierto(false), [ruta]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-3 z-[200] flex justify-center px-4">
      <div className="pointer-events-auto flex w-full items-center gap-1 rounded-full border border-lp-rule bg-[var(--lp-paper-glass)] py-1.5 pl-5 pr-1.5 backdrop-blur-md [box-shadow:var(--lp-shadow-float)] md:w-auto">
        <Link href="/" className="mr-auto flex min-h-[44px] items-center md:mr-4" aria-label="Novudent, inicio">
          <Marca className="text-lg text-lp-ink" />
        </Link>

        <nav className="hidden items-center md:flex" aria-label="Secciones">
          {RUTAS_NAV.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              aria-current={ruta === r.href ? "page" : undefined}
              className="whitespace-nowrap rounded-full px-3 py-2.5 text-[15px] text-lp-muted transition-colors duration-150 hover:text-lp-ink aria-[current=page]:font-semibold aria-[current=page]:text-lp-ink"
            >
              {r.label}
            </Link>
          ))}
          <span className="mx-2 h-5 w-px bg-lp-rule" aria-hidden />
          <Link href="/login" className="whitespace-nowrap rounded-full px-3 py-2.5 text-[15px] text-lp-muted transition-colors duration-150 hover:text-lp-ink">
            Ingresar
          </Link>
        </nav>

        <Link
          href={cta.href}
          className="hidden min-h-[44px] items-center whitespace-nowrap rounded-full bg-lp-ink px-4 text-[15px] font-semibold text-lp-onink transition-colors duration-150 hover:bg-lp-ink2 min-[400px]:inline-flex"
        >
          {cta.label}
        </Link>

        <button
          ref={boton}
          type="button"
          className="grid h-11 w-11 place-items-center rounded-full text-lp-ink transition-colors hover:bg-lp-paper3 md:hidden"
          aria-expanded={abierto}
          aria-controls="menu-publico"
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setAbierto((v) => !v)}
        >
          {abierto ? <X className="h-5 w-5" strokeWidth={1.75} /> : <Menu className="h-5 w-5" strokeWidth={1.75} />}
        </button>
      </div>

      {abierto && (
        <>
          <button
            type="button"
            aria-label="Cerrar menú"
            tabIndex={-1}
            className="pointer-events-auto fixed inset-0 -z-10 bg-[var(--lp-scrim)] md:hidden"
            onClick={() => setAbierto(false)}
          />
          <div
            ref={panel}
            id="menu-publico"
            className="lp-entrada pointer-events-auto absolute inset-x-4 top-[4.5rem] rounded-[var(--lp-radius-card)] border border-lp-rule bg-lp-paper p-2 [box-shadow:var(--lp-shadow-float)] md:hidden"
          >
            <nav aria-label="Secciones" className="flex flex-col">
              {RUTAS_PUBLICAS.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  aria-current={ruta === r.href ? "page" : undefined}
                  className="flex min-h-[48px] items-center rounded-[var(--lp-radius-input)] px-4 text-[17px] text-lp-ink hover:bg-lp-paper2 aria-[current=page]:font-semibold"
                >
                  {r.label}
                </Link>
              ))}
              <Link href="/login" className="flex min-h-[48px] items-center rounded-[var(--lp-radius-input)] px-4 text-[17px] text-lp-muted hover:bg-lp-paper2">
                Ingresar
              </Link>
            </nav>
            <Link
              href={cta.href}
              className="mt-2 flex min-h-[48px] items-center justify-center rounded-full bg-lp-ink px-4 text-[16px] font-semibold text-lp-onink"
            >
              {cta.label}
            </Link>
          </div>
        </>
      )}
    </header>
  );
}

const enlacePie = "inline-flex min-h-[36px] items-center whitespace-nowrap text-[15px] text-lp-muted transition-colors duration-150 hover:text-lp-ink";

/** Footer público compartido — la marca en grande arriba, los enlaces debajo. */
export function FooterLanding() {
  const wa = linkWhatsApp();
  return (
    <footer className="border-t border-lp-rule bg-lp-paper2">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-6">
        <div className="flex flex-col gap-5 border-b border-lp-rule pb-10 md:flex-row md:items-end md:justify-between">
          <Marca className="text-[clamp(2.5rem,9vw,5.5rem)] leading-none text-lp-ink" />
          <p className="max-w-xs text-[15px] leading-relaxed text-lp-muted md:text-right">
            Software de gestión para clínicas dentales. Hecho en Paraguay.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-10 py-10 md:grid-cols-4">
          <div>
            <h2 className="mb-3 text-[13px] font-semibold text-lp-ink">Producto</h2>
            <ul className="space-y-0.5">
              {RUTAS_PUBLICAS.map((r) => (
                <li key={r.href}><Link href={r.href} className={enlacePie}>{r.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-3 text-[13px] font-semibold text-lp-ink">Empezar</h2>
            <ul className="space-y-0.5">
              <li><Link href="/acceso" className={enlacePie}>Pedir una demo</Link></li>
              <li><Link href="/login" className={enlacePie}>Ingresar</Link></li>
              {wa && <li><a href={wa} className={enlacePie} rel="noopener">WhatsApp de ventas</a></li>}
            </ul>
          </div>
          <div>
            <h2 className="mb-3 text-[13px] font-semibold text-lp-ink">Legal</h2>
            <ul className="space-y-0.5">
              {RUTAS_LEGALES.map((r) => (
                <li key={r.href}><Link href={r.href} className={enlacePie}>{r.label}</Link></li>
              ))}
              <li>
                <button type="button" onClick={abrirPreferencias} className={enlacePie}>
                  Configurar cookies
                </button>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="mb-3 text-[13px] font-semibold text-lp-ink">Empresa</h2>
            <ul className="space-y-0.5">
              <li><a href="https://novum-web-six.vercel.app" className={enlacePie} rel="noopener">NOVUM Holding</a></li>
              <li><span className={enlacePie}>Asunción, Paraguay</span></li>
            </ul>
          </div>
        </div>

        <p className="border-t border-lp-rule pt-6 text-[13px] text-lp-muted">
          © {new Date().getFullYear()} Novudent · un producto de NOVUM Holding
        </p>
      </div>
    </footer>
  );
}

/** Estructura común de las páginas de sección: nav + apertura con el H1 único +
 *  contenido + cross-links (internal linking) + cierre + footer. */
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
    <div className="lp-root min-h-dvh font-sans text-[16px] leading-relaxed">
      <NavLanding />
      <section className="border-b border-lp-rule pb-14 pt-32 sm:pb-16 sm:pt-40">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <nav aria-label="Ruta" className="mb-6 flex items-center gap-2 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-lp-muted">
            <Link href="/" className="transition-colors hover:text-lp-ink">Inicio</Link>
            <span aria-hidden>/</span>
            <span className="text-lp-ink">{etiqueta}</span>
          </nav>
          <h1 className="max-w-4xl font-logo text-[clamp(2.25rem,5.2vw,3.75rem)] font-bold leading-[1.05] tracking-[-0.02em] text-lp-ink">
            {titulo}
          </h1>
          <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-lp-muted">{intro}</p>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        {children}

        {/* cross-links: cada página de sección empuja a las demás */}
        <div className="mt-16 border-t border-lp-rule pt-8">
          <h2 className="text-[15px] font-semibold text-lp-ink">Seguí mirando</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {otras.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="group inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full border border-lp-rule bg-lp-paper px-4 text-[15px] text-lp-ink transition-colors duration-150 hover:border-lp-rule2 hover:bg-lp-paper2"
              >
                {r.label}
                <ArrowUpRight className="h-3.5 w-3.5 text-lp-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.75} aria-hidden />
              </Link>
            ))}
          </div>
        </div>

        {/* cierre de conversión */}
        <div className="mt-16 flex flex-col gap-6 rounded-[var(--lp-radius-card)] bg-lp-ink p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div>
            <h2 className="font-logo text-[clamp(1.6rem,3.4vw,2.2rem)] font-bold leading-tight tracking-[-0.01em] text-lp-onink">
              ¿Lo vemos con los datos de tu clínica?
            </h2>
            <p className="mt-2 max-w-md text-[15px] text-lp-oninkmuted">
              Te mostramos Novudent funcionando y migramos lo que ya tenés. Te respondemos en menos de 24 h hábiles.
            </p>
          </div>
          <PildoraCTA href={session ? "/app" : "/acceso"} tone="light">
            {session ? "Ir al panel" : "Pedir una demo"}
          </PildoraCTA>
        </div>
      </main>
      <FooterLanding />
    </div>
  );
}
