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
import { ArrowRight, Menu, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { abrirPreferencias } from "@/lib/consentimiento";
import { linkWhatsApp } from "@/lib/site";
import { RUTAS_LEGALES, RUTAS_PUBLICAS } from "@/lib/landing/rutas";
import { Logotipo } from "@/components/Marca";
import type { Tono } from "@/lib/marca";
import { SaltarAlContenido } from "@/components/SaltarAlContenido";

export { RUTAS_PUBLICAS, RUTAS_LEGALES } from "@/lib/landing/rutas";

/** Las cuatro que entran en la barra; "En acción" queda en el pie. */
const RUTAS_NAV = RUTAS_PUBLICAS.filter((r) => r.href !== "/en-accion");

/** Logotipo de la marca (NOVUdent + diente), el mismo del panel. */
export function Marca({ className = "h-8 w-auto", tono = "color" }: { className?: string; tono?: Tono }) {
  return <Logotipo tono={tono} className={className} />;
}

/** Etiqueta en mayúsculas, en el color de acción, arriba de cada título. */
export function BarraSeccion({ label, className = "" }: { label: string; className?: string }) {
  return <p className={`mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-lp-primary ${className}`}>{label}</p>;
}

const baseBoton = "lp-pulsable group inline-flex min-h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-[var(--lp-radius-btn)] px-5 text-[15px] font-semibold";

/** Botón principal. `dark` = turquesa de acción; `light` = blanco (sobre las franjas de color). */
export function PildoraCTA({ href, children, tone = "dark" }: { href: string; children: React.ReactNode; tone?: "dark" | "light" }) {
  return (
    <Link href={href} className={`${baseBoton} ${tone === "dark" ? "bg-lp-primary text-white hover:bg-lp-primaryhover" : "bg-white text-lp-primaryhover hover:bg-lp-primarywash"}`}>
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} aria-hidden />
    </Link>
  );
}

/** Botón secundario con borde. */
export function BotonSecundario({ href, children, tone = "dark" }: { href: string; children: React.ReactNode; tone?: "dark" | "light" }) {
  return (
    <Link
      href={href}
      className={`${baseBoton} border ${tone === "dark" ? "border-lp-primary text-lp-primary hover:bg-lp-primarywash" : "border-white/70 text-white hover:bg-white/10"}`}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} aria-hidden />
    </Link>
  );
}

/** Cifra grande con su regla debajo. */
export function Numeral({ n, className = "", tono = "papel" }: { n: string; className?: string; tono?: "papel" | "ink" }) {
  const ink = tono === "ink";
  return (
    <div className={className}>
      <div className={`lp-num font-lp text-[2.75rem] font-semibold leading-none tracking-[-0.02em] sm:text-[3.25rem] ${ink ? "text-white" : "text-lp-ink"}`}>{n}</div>
      <div className={`mt-3 h-[3px] w-10 rounded-full ${ink ? "bg-lp-accent" : "bg-lp-primary"}`} aria-hidden />
    </div>
  );
}

/** Barra de navegación pública — fija arriba, igual en todas las páginas. */
export function NavLanding() {
  const { session } = useStore();
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [bajo, setBajo] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const cta = session ? { href: "/app", label: "Ir al panel" } : { href: "/acceso", label: "Pedir una demo" };

  useEffect(() => {
    const alBajar = () => setBajo(window.scrollY > 8);
    alBajar();
    window.addEventListener("scroll", alBajar, { passive: true });
    return () => window.removeEventListener("scroll", alBajar);
  }, []);

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

  useEffect(() => setAbierto(false), [ruta]);

  return (
    <>
    <SaltarAlContenido />
    <header
      className={`fixed inset-x-0 top-0 z-[200] bg-[var(--lp-paper-glass)] backdrop-blur-md transition-[box-shadow,border-color] duration-200 ${
        bajo ? "border-b border-lp-rule [box-shadow:var(--lp-shadow-whisper)]" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6 lg:h-[72px]">
        <Link href="/" className="mr-auto flex min-h-[44px] items-center lg:mr-8" aria-label="Novudent, inicio">
          <Marca className="h-8 w-auto" />
        </Link>

        <nav className="mr-auto hidden items-center gap-1 lg:flex" aria-label="Secciones">
          {RUTAS_NAV.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              aria-current={ruta === r.href ? "page" : undefined}
              className="whitespace-nowrap rounded-[var(--lp-radius-btn)] px-3 py-2.5 text-[15px] font-medium text-lp-muted transition-colors duration-150 hover:text-lp-ink aria-[current=page]:text-lp-primary"
            >
              {r.label}
            </Link>
          ))}
        </nav>

        <Link href="/login" className="lp-pulsable hidden min-h-[44px] items-center whitespace-nowrap rounded-[var(--lp-radius-btn)] border border-lp-primary px-4 text-[15px] font-semibold text-lp-primary hover:bg-lp-primarywash md:inline-flex">
          Ingresar
        </Link>
        <Link href={cta.href} className="lp-pulsable hidden min-h-[44px] items-center whitespace-nowrap rounded-[var(--lp-radius-btn)] bg-lp-primary px-4 text-[15px] font-semibold text-white hover:bg-lp-primaryhover min-[400px]:inline-flex">
          {cta.label}
        </Link>

        <button
          ref={boton}
          type="button"
          className="grid h-11 w-11 place-items-center rounded-[var(--lp-radius-btn)] text-lp-ink transition-colors hover:bg-lp-paper2 lg:hidden"
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
          <button type="button" aria-label="Cerrar menú" tabIndex={-1} className="fixed inset-0 top-16 -z-10 bg-[var(--lp-scrim)] lg:hidden" onClick={() => setAbierto(false)} />
          <div ref={panel} id="menu-publico" className="lp-entrada border-t border-lp-rule bg-white px-4 pb-4 pt-2 [box-shadow:var(--lp-shadow-float)] lg:hidden">
            <nav aria-label="Secciones" className="flex flex-col">
              {RUTAS_PUBLICAS.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  aria-current={ruta === r.href ? "page" : undefined}
                  className="flex min-h-[48px] items-center border-b border-lp-rule px-1 text-[17px] font-medium text-lp-ink aria-[current=page]:text-lp-primary"
                >
                  {r.label}
                </Link>
              ))}
            </nav>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href="/login" className="flex min-h-[48px] items-center justify-center rounded-[var(--lp-radius-btn)] border border-lp-primary text-[16px] font-semibold text-lp-primary">Ingresar</Link>
              <Link href={cta.href} className="flex min-h-[48px] items-center justify-center rounded-[var(--lp-radius-btn)] bg-lp-primary text-[16px] font-semibold text-white">{cta.label}</Link>
            </div>
          </div>
        </>
      )}
    </header>
    </>
  );
}

const enlacePie = "inline-flex min-h-[36px] items-center whitespace-nowrap text-[14px] text-lp-muted transition-colors duration-150 hover:text-lp-primary";

/** Pie público compartido, en columnas. */
export function FooterLanding() {
  const wa = linkWhatsApp();
  return (
    <footer className="border-t border-lp-rule bg-lp-paper2">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-4">
            <Marca className="h-10 w-auto" />
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-lp-muted">
              Software de gestión para clínicas dentales. Hecho en Asunción, Paraguay.
            </p>
            <p className="mt-2 text-[14px] text-lp-muted">
              Un producto de <a href="https://novum-web-six.vercel.app" rel="noopener" className="font-medium text-lp-ink hover:text-lp-primary">NOVUM Holding</a>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 md:col-span-8">
            <div>
              <h2 className="mb-3 text-[14px] font-semibold text-lp-ink">Producto</h2>
              <ul className="space-y-0.5">
                {RUTAS_PUBLICAS.map((r) => <li key={r.href}><Link href={r.href} className={enlacePie}>{r.label}</Link></li>)}
              </ul>
            </div>
            <div>
              <h2 className="mb-3 text-[14px] font-semibold text-lp-ink">Empezar</h2>
              <ul className="space-y-0.5">
                <li><Link href="/acceso" className={enlacePie}>Pedir una demo</Link></li>
                <li><Link href="/login" className={enlacePie}>Ingresar</Link></li>
                {wa && <li><a href={wa} className={enlacePie} rel="noopener">WhatsApp de ventas</a></li>}
              </ul>
            </div>
            <div>
              <h2 className="mb-3 text-[14px] font-semibold text-lp-ink">Legal</h2>
              <ul className="space-y-0.5">
                {RUTAS_LEGALES.map((r) => <li key={r.href}><Link href={r.href} className={enlacePie}>{r.label}</Link></li>)}
                <li><button type="button" onClick={abrirPreferencias} className={enlacePie}>Configurar cookies</button></li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-12 border-t border-lp-rule pt-6 text-[13px] text-lp-muted">
          © {new Date().getFullYear()} Novudent · NOVUM Holding. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}

/** Estructura común de las páginas de sección: barra + cabecera + contenido +
 *  cross-links (internal linking) + franja de cierre + pie. */
export function PaginaSeccion({
  activa,
  etiqueta,
  titulo,
  intro,
  children,
  ancho = false,
}: {
  activa: string;
  etiqueta: string;
  titulo: React.ReactNode;
  intro: string;
  children: React.ReactNode;
  /** true: el contenido maneja sus propios anchos y fondos (secciones a lo ancho). */
  ancho?: boolean;
}) {
  const { session } = useStore();
  const otras = RUTAS_PUBLICAS.filter((r) => r.href !== activa);
  return (
    <div className="lp-root min-h-dvh font-lp text-[16px] leading-relaxed">
      <NavLanding />
      <section className="lp-manchas pb-14 pt-28 sm:pb-20 sm:pt-36">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <nav aria-label="Ruta" className="mb-5 flex items-center gap-2 text-[13px] font-medium text-lp-muted">
            <Link href="/" className="transition-colors hover:text-lp-primary">Inicio</Link>
            <span aria-hidden>/</span>
            <span className="text-lp-ink">{etiqueta}</span>
          </nav>
          <BarraSeccion label={etiqueta} />
          <h1 className="max-w-4xl text-[clamp(2.1rem,4.6vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-lp-ink">
            {titulo}
          </h1>
          <p className="mt-5 max-w-2xl text-[18px] leading-relaxed text-lp-muted">{intro}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PildoraCTA href={session ? "/app" : "/acceso"}>{session ? "Ir al panel" : "Pedir una demo"}</PildoraCTA>
            {activa !== "/precios" && <BotonSecundario href="/precios">Ver planes</BotonSecundario>}
          </div>
        </div>
      </section>

      <main id="contenido" tabIndex={-1} className={`focus:outline-none ${ancho ? "" : "mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20"}`}>
        {children}

        <div className={ancho ? "mx-auto max-w-6xl px-4 pb-4 pt-14 sm:px-6" : "mt-16"}>
          <div className="border-t border-lp-rule pt-8">
            <h2 className="text-[15px] font-semibold text-lp-ink">Seguí mirando</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {otras.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="lp-pulsable group inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-[var(--lp-radius-btn)] border border-lp-rule bg-white px-4 text-[15px] font-medium text-lp-ink hover:border-lp-primary hover:text-lp-primary"
                >
                  {r.label}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>

      <section className="lp-franja">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-16">
          <div>
            <h2 className="text-[clamp(1.6rem,3.2vw,2.25rem)] font-semibold leading-tight tracking-[-0.01em] text-white">
              ¿Lo vemos con los datos de tu clínica?
            </h2>
            <p className="mt-2 max-w-md text-[16px] text-lp-oninkmuted">
              Te mostramos Novudent funcionando y migramos lo que ya tenés. Te respondemos en menos de 24 h hábiles.
            </p>
          </div>
          <PildoraCTA href={session ? "/app" : "/acceso"} tone="light">{session ? "Ir al panel" : "Pedir una demo"}</PildoraCTA>
        </div>
      </section>
      <FooterLanding />
    </div>
  );
}
