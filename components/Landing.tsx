"use client";
/**
 * Landing Novudent — identidad tomada de la propuesta de several. (el PDF que
 * eligió Carlos). El sistema, para no improvisarlo en cada sección:
 *
 *   · Fondo de página GRIS CÁLIDO (`sv-paper`), nunca blanco. Es lo que hace que
 *     las tarjetas blancas floten; sobre blanco el diseño entero se aplana.
 *   · Navy profundo para el hero y el cierre, con blooms difusos y grano.
 *   · Un solo acento: verde menta. Brillante sobre navy; su versión oscura
 *     (`sv-mintInk`) cuando el texto va sobre claro — el menta puro sobre blanco
 *     no llega a 4.5:1 y no se usa para texto chico en ningún lado.
 *   · Una sola tipografía (Jost) en varios pesos: 200 para el display grande,
 *     400 para cuerpo. La referencia hace exactamente eso.
 *   · Numerales gigantes ultra-finos con regla menta debajo.
 *   · Cabecera de sección: etiqueta izquierda · claim centro · marca derecha,
 *     con una línea fina abajo.
 *
 * SEO / ARQUITECTURA: cada sección grande está EXPORTADA como componente y
 * tiene su propia página (/odontograma, /capacidades, /como-se-trabaja,
 * /en-accion, /precios, /acceso) con metadata propia. La home las compone
 * todas; las páginas de sección las reutilizan con su intro única. El nav ya
 * no usa anclas #: son rutas reales, indexables, con canonical propio.
 *
 * DOS COSAS SACADAS A PROPÓSITO, y no hay que reponerlas:
 *
 * 1. El revelado por scroll (<Reveal>/<Stagger>). framer-motion sirve el HTML
 *    con `opacity:0` y lo levanta recién cuando el IntersectionObserver avisa.
 *    Si ese observer no dispara —pasa— las secciones NO APARECEN NUNCA. Carlos
 *    lo vio en su celular: media página en blanco. Una animación de entrada no
 *    puede ser lo que decide si se ve el contenido.
 * 2. El contador que subía de 0. Mismo origen: si no disparaba, la franja se
 *    quedaba mostrando "0 piezas FDI con morfología real" — un dato FALSO en la
 *    cara de quien está evaluando comprar. El número importa, no su llegada.
 *
 * La capa de motion actual (sv-rise/sv-drift/sv-view/sv-draw, ver globals.css)
 * respeta ese contrato: TODO es CSS puro o progressive enhancement con fallback
 * estático — si una animación no corre, el contenido se ve igual.
 */
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
/* Trazo unificado en 1.75 en toda la landing: el 2 por defecto de lucide pesaba
   demasiado al lado de un display en Jost 200 — los iconos gritaban más que los
   titulares. Mismo grosor en todos, un solo set, nada de emojis. */
import { ArrowUpRight, Check, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { ShowcaseBoard, ToothGlyph, type ShowcaseToothRecord } from "./OdontogramShowcase";
import SolicitarAcceso from "./SolicitarAcceso";
import EscenaClinica from "./EscenaClinica";
import { FlagBadge } from "./ui";
import {
  BarraSeccion,
  FooterLanding,
  Marca,
  NavLanding,
  Numeral,
  PildoraCTA,
} from "./landing/Chrome";

/* three.js pesa ~150 kB gz: chunk aparte, solo cliente. Mientras carga no se
   muestra nada (es decoración) — la sección jamás espera por él. */
const Tooth3D = dynamic(() => import("./Tooth3D"), { ssr: false, loading: () => null });

/* demo del odontograma (estado local) */
const DEMO_TEETH: Record<string, ShowcaseToothRecord> = {
  "16": { condition: "caries", surfaces: ["O"] },
  "24": { condition: "caries", surfaces: ["M"] },
  "11": { condition: "restaurado", surfaces: ["V"] },
  "26": { condition: "corona" },
  "36": { condition: "endodoncia" },
  "46": { condition: "implante" },
  "28": { condition: "ausente" },
};

/* dientes para el marquee de marca */
const MARQUEE_TEETH: { n: string; rec?: ShowcaseToothRecord }[] = [
  { n: "11" }, { n: "13", rec: { condition: "restaurado" } },
  { n: "16" }, { n: "21", rec: { condition: "caries", surfaces: ["O"] } },
  { n: "23" }, { n: "26", rec: { condition: "corona" } },
  { n: "14" }, { n: "17" }, { n: "12", rec: { condition: "endodoncia" } },
  { n: "24" }, { n: "27", rec: { condition: "implante" } }, { n: "15" },
];

/* Las ocho capacidades viven en lib/capacidades.ts (módulo plano: las comparte
   la home y la página /capacidades — ver el motivo en ese archivo). */
import { CAPACIDADES } from "@/lib/capacidades";

/* ---------- piezas locales del hero ---------- */

/** Discos flotantes del hero — el motivo de la portada de la referencia
 *  (lentes translúcidas en curva sobre el navy), hecho en CSS puro.
 *
 *  Se construye en vez de bajar una foto a propósito: no tenemos fotografía
 *  propia de clínicas, y meter stock inventado sería vender algo que no existe.
 *  Esto pesa cero, escala a cualquier ancho y no puede quedar pixelado.
 *  `aria-hidden` porque es puramente decorativo. */
function DiscosFlotantes() {
  /* posición X/Y en %, tamaño en rem y giro: la curva se define acá y no en el
      JSX, así se puede afinar sin tocar el markup. `t`/`d` = duración y delay
      de la deriva propia de cada disco (sv-drift en globals.css). */
  const discos = [
    { x: 3, y: 14, s: 15, r: -20, o: 0.55, t: 13, d: 0 },
    { x: 15, y: 44, s: 9, r: -13, o: 0.4, t: 10, d: 1.2 },
    { x: 28, y: 68, s: 6.5, r: -5, o: 0.34, t: 8.5, d: 0.6 },
    { x: 45, y: 78, s: 7.5, r: 5, o: 0.36, t: 11, d: 2 },
    { x: 63, y: 66, s: 11, r: 13, o: 0.42, t: 9.5, d: 0.3 },
    { x: 80, y: 42, s: 17, r: 20, o: 0.5, t: 12.5, d: 1.6 },
    { x: 95, y: 15, s: 21, r: 26, o: 0.55, t: 14, d: 0.9 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <DiscosParallax>
        {discos.map((d, i) => (
          <span
            key={i}
            className="sv-drift absolute rounded-[50%]"
            style={{
              left: `${d.x}%`,
              top: `${d.y}%`,
              /* clamp y no rem fijo: en 375px un disco de 21rem medía 336px y se
                 comía la pantalla entera. Así escalan con el viewport y en móvil
                 quedan de fondo, que es su lugar. */
              width: `clamp(${(d.s * 0.38).toFixed(2)}rem, ${(d.s * 1.9).toFixed(1)}vw, ${d.s}rem)`,
              height: `clamp(${(d.s * 0.59).toFixed(2)}rem, ${(d.s * 2.95).toFixed(1)}vw, ${d.s * 1.55}rem)`,
              opacity: d.o,
              transform: `translate(-50%,-50%) rotate(${d.r}deg)`,
              ["--drift-t" as string]: `${d.t}s`,
              ["--drift-d" as string]: `${d.d}s`,
              /* Aro nítido + relleno casi vacío = lente, no mancha. El relleno con
                 dos paradas apenas visibles evita el "globo" plano; el brillo vive
                 en el borde, como en la referencia. */
              border: "1px solid rgba(160,220,255,0.38)",
              background:
                "linear-gradient(145deg, rgba(47,227,174,0.07) 0%, rgba(64,92,240,0.05) 55%, rgba(255,255,255,0) 100%)",
              boxShadow: "inset 0 0 28px rgba(120,190,255,0.10)",
            }}
          />
        ))}
      </DiscosParallax>
    </div>
  );
}

/** Parallax de puntero sobre los discos — capa aparte para no pelear con la
 *  transform propia de cada aro (el contenedor es el que se mueve).
 *  Mejora progresiva pura: solo punteros finos (mouse), sin reduced-motion,
 *  desplazamiento mínimo (±9px) y rAF-throttle. Si algo falla, no se nota. */
function DiscosParallax({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window.matchMedia !== "function") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const nx = e.clientX / window.innerWidth - 0.5; // -0.5..0.5
        const ny = e.clientY / window.innerHeight - 0.5;
        el.style.transform = `translate(${(-nx * 18).toFixed(1)}px, ${(-ny * 12).toFixed(1)}px)`;
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div ref={ref} className="absolute inset-0 transition-transform duration-300 ease-out will-change-transform">
      {children}
    </div>
  );
}

/* ==================================================================
   SECCIONES EXPORTADAS — la home las compone y cada página de sección
   reutiliza la suya con una intro única (SEO: sin duplicar H1 ni copy).
   ================================================================== */

/** Ventana de producto: el odontograma interactivo real. */
export function SeccionOdontograma() {
  const [demoTeeth, setDemoTeeth] = useState<Record<string, ShowcaseToothRecord>>(DEMO_TEETH);
  return (
    <div className="mx-auto max-w-6xl px-5">
      {/* Sin barra de navegador falsa (puntitos semáforo + píldora de URL):
          es de los tells más reconocibles de página generada, y la referencia
          no la usa en ninguna página. El odontograma es real y se sostiene
          solo; el epígrafe dice de qué se trata mejor que una URL de mentira.
          El beam menta orbitando el marco señala EL punto de la página: acá
          se toca el producto (se apaga con reduced-motion). */}
      <figure className="relative m-0">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-white p-4 shadow-[0_32px_80px_-32px_rgba(10,18,64,0.55)] sm:p-7">
          {/* beam menta orbitando el marco de la tarjeta (no del figure: el
              epígrafe va fuera). overflow-hidden lo recorta al radio. */}
          <div className="border-beam-mint absolute inset-0 z-10 rounded-[1.75rem]" aria-hidden />
          <ShowcaseBoard
            value={demoTeeth}
            editable
            onChange={(tooth, rec) =>
              setDemoTeeth((prev) => {
                const next = { ...prev };
                if (rec) next[tooth] = rec; else delete next[tooth];
                return next;
              })
            }
          />
        </div>
        <figcaption className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[14px] font-light text-sv-muted">
          <span className="rounded-full bg-sv-ink px-3 py-0.5 text-[12px] font-medium uppercase tracking-wider text-sv-mint">Interactivo</span>
          Odontograma real de Novudent — hacé clic en cualquier pieza y marcá una superficie.
        </figcaption>
      </figure>
    </div>
  );
}

/** Las ocho capacidades, con la columna sticky a la izquierda. */
export function SeccionCapacidades() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      <div className="grid gap-14 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <h2 className="font-logo text-[2.75rem] font-extralight leading-[1.05] tracking-tight text-sv-ink sm:text-[3.5rem]">
              Sin módulos
              <br />de relleno.
            </h2>
            <p className="mt-6 max-w-xs text-[15px] font-light leading-relaxed text-sv-muted">
              Las ocho herramientas que mueven una clínica dental, pulidas hasta el detalle.
              Nada más — y nada menos.
            </p>
            <Numeral n="08" className="mt-10" />
            <p className="mt-3 text-[13px] uppercase tracking-[0.2em] text-sv-muted">herramientas de trabajo</p>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="overflow-hidden rounded-[1.5rem] bg-white">
            {CAPACIDADES.map((c, i) => (
              <div
                key={c.n}
                className={`lp-row group grid grid-cols-12 items-baseline gap-x-5 gap-y-2 px-6 py-7 transition-colors duration-300 hover:bg-sv-paper2 sm:px-8 ${
                  i > 0 ? "border-t border-sv-line/70" : ""
                }`}
              >
                <div className="col-span-2 sm:col-span-1">
                  <span className="font-logo text-lg font-extralight text-sv-mintInk">{c.n}</span>
                  <span className="lp-num-rule mt-1 hidden sm:block" />
                </div>
                <div className="col-span-10 sm:col-span-5">
                  <h3 className="font-logo text-[1.4rem] font-light leading-snug text-sv-ink transition-transform duration-300 ease-out group-hover:translate-x-1.5">
                    {c.t}
                  </h3>
                </div>
                <div className="col-span-12 text-[15px] font-light leading-relaxed text-sv-muted transition-colors duration-300 group-hover:text-sv-ink/80 sm:col-span-6">
                  {c.d}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const PASOS_FLUJO = [
  {
    n: "01", tag: "AGENDA", t: "La mañana arranca sola",
    d: "La recepcionista abre la agenda: los turnos confirmados por WhatsApp en verde, los pendientes en ámbar. Un hueco a las 11:00 — clic, y la cita queda creada.",
    card: (
      <>
        <div className="mb-4 flex items-center justify-between">
          <span className="font-logo text-lg font-light text-sv-ink">Agenda · hoy</span>
          <span className="rounded-full bg-sv-mint px-3 py-0.5 text-[11px] font-medium uppercase tracking-wider text-sv-ink">92% ocupación</span>
        </div>
        {[["09:00", "María González", "Resina pieza 16", "bg-sv-mintInk"], ["10:30", "Juan Ríos", "Primera consulta", "bg-amber-500"], ["11:00", "+ Crear cita en este hueco", "", "bg-sv-mint"], ["11:45", "Camila Ortega", "Profilaxis", "bg-sv-mintInk"]].map(([h, n, t, dot], idx) => (
          <div key={idx} className={`mb-2 flex items-center gap-3 rounded-xl px-4 py-3 ${t === "" ? "border border-dashed border-sv-mintInk/40 bg-sv-mint/10" : "bg-sv-paper2"}`}>
            <span className="text-[13px] font-medium tabular-nums text-sv-ink">{h}</span>
            <span className="flex-1">
              <span className={`block text-[14px] ${t === "" ? "font-medium text-sv-mintInk" : "font-medium text-sv-ink"}`}>{n}</span>
              {t && <span className="block text-[13px] font-light text-sv-muted">{t}</span>}
            </span>
            <span className={`h-2 w-2 rounded-full ${dot}`} />
          </div>
        ))}
      </>
    ),
  },
  {
    n: "02", tag: "FICHA CLÍNICA", t: "El hallazgo queda en la pieza",
    d: "La doctora marca caries oclusal en la 16 directamente sobre el diente. Rojo = pendiente, azul = resuelto. Quién, cuándo y en qué superficie: auditado.",
    card: (
      <>
        <div className="flex items-center justify-center gap-7 py-2">
          {[{ n: "14" }, { n: "15" }, { n: "16", rec: { condition: "caries" as const, surfaces: ["O" as const], updatedAt: "", updatedBy: "" } }, { n: "17" }].map((t) => (
            <div key={t.n} className="flex flex-col items-center gap-1.5">
              <ToothGlyph n={t.n} rec={t.rec} upper />
              <span className={`text-[12px] tabular-nums ${t.rec ? "font-medium text-red-600" : "font-light text-sv-muted"}`}>{t.n}</span>
            </div>
          ))}
        </div>
        <p className="mt-5 rounded-xl bg-sv-paper2 px-4 py-2.5 text-center text-[13px] font-light text-sv-muted">
          <b className="font-medium text-sv-ink">16 · Caries oclusal (O)</b> — registrado por Dra. Benítez
        </p>
      </>
    ),
  },
  {
    n: "03", tag: "FACTURACIÓN", t: "El cobro no se escapa",
    d: "La asistente envía a cobro. El sistema valida los códigos, aplica la retención correcta y nada queda en el limbo: cada reclamo tiene un estado y un historial.",
    card: (
      <>
        {[
          { flags: [] as string[], label: "Registro creado", sub: "Códigos CPT-DX · POS · MOD validados en vivo" },
          { flags: ["MBILLED", "HOLD"], label: "Enviado a cobro", sub: "Retención automática del e-claim" },
          { flags: ["FACTURADO", "ACH"], label: "Liberado y facturado", sub: "Pago automático activo" },
        ].map((s, i) => (
          <div key={i} className="mb-2 flex items-center gap-4 rounded-xl bg-sv-paper2 px-4 py-3.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white font-logo text-[13px] font-light text-sv-mintInk">{i + 1}</span>
            <span className="flex-1">
              <span className="block text-[14px] font-medium text-sv-ink">{s.label}</span>
              <span className="block text-[13px] font-light text-sv-muted">{s.sub}</span>
            </span>
            <span className="flex flex-wrap justify-end gap-1">
              {s.flags.length === 0
                ? <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-sv-muted">Sin enviar</span>
                : s.flags.map((f) => <FlagBadge key={f} flag={f as any} />)}
            </span>
          </div>
        ))}
      </>
    ),
  },
];

/** Los tres momentos del día en la clínica (agenda → ficha → cobro). */
export function SeccionFlujo() {
  return (
    <div className="mx-auto max-w-6xl space-y-24 px-5">
      {PASOS_FLUJO.map((paso) => (
        <div key={paso.n} className="sv-view grid items-start gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            {/* pestaña navy de la referencia */}
            <div className="inline-flex items-center gap-3 rounded-xl bg-sv-ink py-2.5 pl-2.5 pr-5">
              <span className="rounded-md bg-sv-mint px-2 py-0.5 font-logo text-[13px] font-medium text-sv-ink">{paso.n}</span>
              <span className="text-[13px] uppercase tracking-[0.18em] text-white/80">{paso.tag}</span>
            </div>
            <h3 className="mt-7 font-logo text-[2.25rem] font-extralight leading-[1.08] tracking-tight text-sv-ink sm:text-[2.75rem]">{paso.t}</h3>
            <p className="mt-5 max-w-md text-[15px] font-light leading-relaxed text-sv-muted">{paso.d}</p>
          </div>
          <div className="lg:col-span-7">
            <div className="card-3d rounded-[1.5rem] bg-white p-6 sm:p-7">{paso.card}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** La escena clínica animada (consultorio → app). */
export function SeccionAccion() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      <EscenaClinica />
    </div>
  );
}

/** Planes y precios. `ctaHref` lo inyecta quien compone (home vs página). */
export function SeccionPrecios({ ctaHref = "/acceso" }: { ctaHref?: string }) {
  return (
    <div className="mx-auto max-w-6xl px-5">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 className="font-logo text-[2.75rem] font-extralight leading-[1.05] tracking-tight text-sv-ink sm:text-[3.5rem]">
            Precio y
            <br />formas de pago
          </h2>
          <p className="mt-6 max-w-xs text-[15px] font-light leading-relaxed text-sv-muted">
            Sin contratos largos. Migración de tus datos incluida, vengas de
            Dentalink, de planillas o de papel.
          </p>
        </div>

        <div className="lg:col-span-8">
          {/* plan destacado */}
          <div className="sv-mesh sv-grain relative overflow-hidden rounded-[1.5rem] p-8 sm:p-10">
            <div className="relative z-10">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="text-[13px] uppercase tracking-[0.2em] text-sv-mint">Plan Clínica · el más elegido</span>
                  <div className="mt-4 flex items-end gap-2.5">
                    <span className="font-logo text-[4rem] font-extralight leading-none text-white">$129</span>
                    <span className="mb-2 text-[15px] font-light text-white/50">USD / mes</span>
                  </div>
                </div>
                <PildoraCTA href={ctaHref} tone="light">Solicitar acceso</PildoraCTA>
              </div>
              <p className="mt-5 max-w-md text-[15px] font-light leading-relaxed text-white/65">
                Para clínicas en crecimiento: hasta 5 sillones con todo Novudent adentro.
              </p>
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {["Hasta 5 sillones / profesionales", "Odontograma por superficies", "Financiamiento y morosidad", "Formularios y consentimientos", "Facturación con estados", "Soporte prioritario"].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[15px] font-light text-white/85">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-sv-mint" strokeWidth={1.75} /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* barras de plan — el patrón "nombre · timing · precio" de la referencia */}
          <div className="mt-5 grid gap-4">
            {[
              { name: "Plan Solo", meta: "1 sillón · odontograma, agenda y facturación básica", price: "$45", per: "USD / mes", cta: "Solicitar acceso" },
              { name: "Plan Cadena", meta: "Multi-sucursal · comisiones, laboratorio y account manager", price: "A medida", per: "", cta: "Hablar con ventas" },
            ].map((p) => (
              <div key={p.name} className="flex flex-wrap items-center justify-between gap-4 rounded-[1.25rem] bg-white px-7 py-6">
                <div className="min-w-[12rem] flex-1">
                  <span className="font-logo text-xl font-light text-sv-ink">{p.name}</span>
                  <p className="mt-1 text-[14px] font-light text-sv-muted">{p.meta}</p>
                </div>
                <span className="font-logo text-2xl font-light text-sv-mintInk">
                  {p.price}
                  {p.per && <span className="ml-1.5 text-[13px] font-light text-sv-muted">{p.per}</span>}
                </span>
                <Link href={ctaHref} className="group inline-flex items-center gap-1.5 rounded-full border border-sv-line px-5 py-2.5 text-[14px] font-medium text-sv-ink transition-colors hover:border-sv-ink hover:bg-sv-ink hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sv-mintInk">
                  {p.cta}
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.75} />
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[13px] font-light uppercase tracking-[0.14em] text-sv-muted">
            Precios referenciales · Sin contratos largos · Migración de datos incluida
          </p>
        </div>
      </div>
    </div>
  );
}

/** Preguntas frecuentes — el contenido vive en lib/faqs.ts (módulo plano, lo
 *  comparte la sección visible y el JSON-LD FAQPage de la home). */
import { FAQS } from "@/lib/faqs";

export function SeccionFaq() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 className="font-logo text-[2.75rem] font-extralight leading-[1.05] tracking-tight text-sv-ink sm:text-[3.5rem]">
            Lo que todos
            <br />preguntan.
          </h2>
        </div>
        <div className="lg:col-span-8">
          <div className="overflow-hidden rounded-[1.5rem] bg-white">
            {FAQS.map((f, i) => (
              <details key={f.q} className={`lp-faq group ${i > 0 ? "border-t border-sv-line/70" : ""}`}>
                <summary className="flex cursor-pointer list-none items-center gap-5 px-6 py-5 transition-colors hover:bg-sv-paper2 sm:px-8 [&::-webkit-details-marker]:hidden">
                  <span className="font-logo text-[15px] font-extralight text-sv-mintInk">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="flex-1 font-logo text-[1.15rem] font-light text-sv-ink">{f.q}</h3>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sv-paper2 transition-colors group-open:bg-sv-mint">
                    <Plus className="h-4 w-4 text-sv-ink transition-transform duration-300 group-open:rotate-45" strokeWidth={1.75} />
                  </span>
                </summary>
                <p className="lp-faq-a px-6 pb-6 pl-[3.6rem] text-[15px] font-light leading-relaxed text-sv-muted sm:px-8 sm:pl-[4.4rem]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Cierre con formulario (home). En /acceso el formulario es la página entera. */
export function SeccionCierre() {
  const { session } = useStore();
  return (
    <section className="sv-mesh sv-grain relative overflow-hidden">
      {/* marca fantasma de fondo — el recurso de la contratapa de la referencia.
          sv-ghost le da una contra-parallax sutil al scrollear (solo con
          soporte nativo; sin él queda centrada, como siempre). */}
      <span aria-hidden className="sv-ghost pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-logo text-[26vw] font-extralight leading-none tracking-tight text-white/[0.045]">
        NOVUdent
      </span>
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:py-28 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h2 className="font-logo text-[2.75rem] font-extralight leading-[1.05] tracking-tight text-white sm:text-[4rem]">
            Tu clínica,
            <br /><span className="text-sv-mint">funcionando en Novudent.</span>
          </h2>
          <p className="mt-6 max-w-md text-[15px] font-light leading-relaxed text-white/60">
            Te mostramos el sistema con los datos de tu clínica y migramos lo que
            ya tenés — venga de Dentalink, de planillas o de papel.
          </p>
          {session ? (
            <div className="mt-8"><PildoraCTA href="/app" tone="light">Ir al panel</PildoraCTA></div>
          ) : (
            <ul className="mt-8 space-y-3">
              {["Migración de tus datos incluida", "Capacitación del equipo", "Respuesta en menos de 24 h hábiles"].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-[15px] font-light text-white/85">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-sv-mint" strokeWidth={1.75} /> {t}
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* Con sesión abierta va el diente 3D (three.js): mejora progresiva pura
            — si WebGL falla devuelve null y la sección queda completa. Sin
            sesión manda el formulario: acá es donde se vende. */}
        {session ? (
          <div className="hidden lg:col-span-5 lg:block">
            <Tooth3D className="h-72 w-full" />
          </div>
        ) : (
          <div className="lg:col-span-5">
            <SolicitarAcceso />
          </div>
        )}
      </div>
    </section>
  );
}

/* ==================================================================
   HOME — compone todas las secciones. El hero es exclusivo de acá.
   ================================================================== */

export default function Landing() {
  const { session } = useStore();
  /* El CTA manda a la página de acceso real (ruta indexable), no a un ancla. */
  const ctaAcceso = session ? "/app" : "/acceso";

  return (
    <div className="bg-sv-paper font-logo text-[17px] font-normal leading-relaxed text-sv-ink">
      <NavLanding />

      {/* ===== HERO: navy profundo, display ultra-fino ===== */}
      <section className="sv-mesh sv-grain relative overflow-hidden pt-28 sm:pt-36">
        <DiscosFlotantes />
        <div className="relative z-10 mx-auto max-w-6xl px-5 pb-40 sm:pb-52">
          {/* píldoras de contexto, arriba a la derecha como en la referencia.
              Coreografía de carga: cada pieza entra con su delay (sv-fade +
              animationDelay inline). CSS puro: si la animación no corre, todo
              queda visible en su lugar. */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="sv-fade rounded-full border border-white/25 px-4 py-1.5 text-[13px] font-light text-white/75" style={{ animationDelay: "0.15s" }}>
              Software odontológico · Paraguay
            </span>
            <span className="sv-fade rounded-full border border-white/25 px-4 py-1.5 text-[13px] font-light text-white/75" style={{ animationDelay: "0.3s" }}>
              Respondemos en menos de 24 h
            </span>
          </div>

          {/* Titular por líneas con máscara: cada línea sube desde abajo de su
              propio overflow-hidden, escalonado — el gesto de entrada de la
              referencia, hecho sin JS. */}
          <h1 className="mt-16 max-w-5xl font-logo text-[3rem] font-extralight leading-[0.98] tracking-[-0.02em] text-white sm:mt-24 sm:text-[5rem] lg:text-[6.5rem]">
            <span className="sv-mask-line" style={{ animationDelay: "0.1s" }}><span>La clínica entera,</span></span>
            <span className="sv-mask-line" style={{ animationDelay: "0.28s" }}><span>
              en <span className="text-sv-mint">una sola pantalla</span>.
            </span></span>
          </h1>

          <div className="mt-10 flex flex-wrap items-end justify-between gap-8">
            <p className="sv-fade max-w-lg text-lg font-light leading-relaxed text-white/65" style={{ animationDelay: "0.55s" }}>
              Agenda, odontograma por superficies, ficha clínica y facturación con
              estados. Esto que ves abajo <b className="font-medium text-white">es el producto real</b> — tocalo.
            </p>
            <div className="sv-fade" style={{ animationDelay: "0.7s" }}>
              <PildoraCTA href={ctaAcceso}>{session ? "Ir al panel" : "Solicitar acceso"}</PildoraCTA>
            </div>
          </div>
        </div>
      </section>

      {/* ===== VENTANA DE PRODUCTO: monta sobre el navy ===== */}
      <section id="odontograma" className="relative z-20 -mt-32 scroll-mt-24 sm:-mt-40">
        <SeccionOdontograma />
      </section>

      {/* ===== CIFRAS: numerales gigantes con regla menta ===== */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <div className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-4">
          {[
            { v: "32", l: "piezas FDI con morfología real" },
            { v: "05", l: "superficies marcables por pieza" },
            { v: "06", l: "estados de facturación auditados" },
            { v: "03", l: "roles con permisos estrictos" },
          ].map((x) => (
            <div key={x.l} className="sv-view">
              <Numeral n={x.v} />
              <p className="mt-4 max-w-[170px] text-[15px] font-light leading-snug text-sv-muted">{x.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== MARQUEE DE DIENTES (firma visual) ===== */}
      <section aria-hidden className="border-y border-sv-line bg-sv-paper2 py-7">
        <div className="lp-marquee-mask overflow-hidden">
          <div className="lp-marquee flex w-max items-center gap-8 opacity-70">
            {[...MARQUEE_TEETH, ...MARQUEE_TEETH].map((t, i) => (
              <span key={i} className="flex items-center gap-8">
                <ToothGlyph n={t.n} rec={t.rec} upper />
                {i % 3 === 2 && <span className="text-[11px] uppercase tracking-[0.3em] text-sv-ink/25">novudent</span>}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CAPACIDADES ===== */}
      <section id="capacidades" className="scroll-mt-20 py-20 sm:py-28">
        <BarraSeccion label="Capacidades" />
        <SeccionCapacidades />
      </section>

      {/* ===== CÓMO SE TRABAJA — patrón de la referencia: pestaña + contador ===== */}
      <section id="flujo" className="scroll-mt-20 border-t border-sv-line bg-sv-paper2 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <BarraSeccion label="Cómo se trabaja" />
          <h2 className="mb-16 max-w-3xl font-logo text-[2.75rem] font-extralight leading-[1.05] tracking-tight text-sv-ink sm:text-[3.5rem]">
            Un día en tu clínica, <span className="text-sv-mintInk">sin fricción</span>.
          </h2>
        </div>
        <SeccionFlujo />
      </section>

      {/* ===== EL PRODUCTO EN ACCIÓN: escena + app con un solo reloj ===== */}
      <section id="accion" className="scroll-mt-20 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <BarraSeccion label="El producto en acción" />
          <div className="mb-12 grid gap-6 lg:grid-cols-12 lg:items-end">
            <h2 className="font-logo text-[2.75rem] font-extralight leading-[1.05] tracking-tight text-sv-ink sm:text-[3.5rem] lg:col-span-7">
              De la silla dental
              <br />a la app, <span className="text-sv-mintInk">solo</span>.
            </h2>
            <p className="text-[15px] font-light leading-relaxed text-sv-muted lg:col-span-5">
              El día completo de una consulta, en un loop de catorce segundos: la
              cita se agenda, el hallazgo se marca en la pieza, el cobro se
              factura. Miralo las veces que quieras — es el producto real.
            </p>
          </div>
        </div>
        <SeccionAccion />
      </section>

      {/* ===== PRECIOS ===== */}
      <section id="precios" className="scroll-mt-20 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <BarraSeccion label="Precios" />
        </div>
        <SeccionPrecios ctaHref={ctaAcceso} />
      </section>

      {/* ===== FAQ ===== */}
      <section className="border-t border-sv-line bg-sv-paper2 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-5">
          <BarraSeccion label="Preguntas" />
          <SeccionFaq />
        </div>
      </section>

      {/* ===== CIERRE ===== */}
      <SeccionCierre />

      <FooterLanding />
    </div>
  );
}

/* Marca se reexporta por si algún módulo la traía de acá. */
export { Marca };
