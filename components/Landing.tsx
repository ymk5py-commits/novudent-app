"use client";
/**
 * Landing Novudent — estructura de la referencia que eligió el dueño, con marca,
 * textos y visuales propios (no se copian textos, fotos ni logos de nadie).
 *
 *   portada (texto + visual en halo) → problemas → soluciones → cinco filas por etapa
 *   (Agendar · Atender · Cobrar · Volver · Controlar) → probá el odontograma → franja
 *   con datos del producto → precios → preguntas → formulario → pie
 *
 * Reglas que siguen valiendo:
 *   · Nada se esconde esperando una animación (framer-motion con opacity:0 dejó media
 *     página en blanco en un celular). Si una animación no corre, se ve igual.
 *   · Nada inventado: sin testimonios ni cifras de clientes que no existen. Lo que
 *     incluye cada función sale de lib/plan.ts y de los gates reales del panel; las
 *     tarjetas de muestra dicen «Ejemplo».
 *   · Sin mención pública a otros sistemas del rubro.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity, AlarmClock, Armchair, BarChart3, BellRing, Calculator, CalendarClock, CalendarDays, Check,
  ClipboardList, CreditCard, FileText, FlaskConical, Globe, ListChecks, Megaphone, MessageCircle,
  Package, PenLine, Plus, Receipt, ShieldCheck, Sparkles, SprayCan, Star, TrendingDown, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { CAPACIDADES } from "@/lib/capacidades";
import { FAQS } from "@/lib/faqs";
import { CONDICIONES, DOCUMENTO_CONFIGURACION, PLANES, PUESTA_EN_MARCHA, gs, type PlanPublicoId } from "@/lib/landing/precios";
import { linkWhatsApp } from "@/lib/site";
import { ShowcaseBoard, ToothGlyph, type ShowcaseToothRecord } from "./OdontogramShowcase";
import SolicitarAcceso from "./SolicitarAcceso";
import EscenaClinica from "./EscenaClinica";
import { BarraSeccion, BotonSecundario, FooterLanding, Marca, NavLanding, PildoraCTA } from "./landing/Chrome";
import { Ejemplo, TablaRoles, TarjetaAgenda, TarjetaFicha, TarjetaHoy, TarjetaPresupuesto, TarjetaVolver } from "./landing/Tarjetas";

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

/** Lleva el plan elegido al formulario (/acceso?plan=…); con sesión va al panel. */
const hrefDemo = (base: string, plan?: PlanPublicoId) =>
  plan && base.startsWith("/acceso") ? `/acceso?plan=${plan}` : base;

type Alcance = "todos" | "clinica" | "multi";
const ALCANCE: Record<Alcance, string> = { todos: "Todos los planes", clinica: "Clínica y Multi", multi: "Multi" };

/* ---------- piezas chicas ---------- */

/** Chip flotante de los visuales: un dato de la interfaz, con su ícono. */
function Chip({ icon: Icono, children, className = "" }: { icon: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 whitespace-nowrap rounded-[12px] border border-lp-rule bg-white px-3.5 py-2.5 text-[13px] font-medium text-lp-ink [box-shadow:var(--lp-shadow-float)] ${className}`}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-lp-primarywash text-lp-primary">
        <Icono className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
      {children}
    </div>
  );
}

/** Visual de las filas: tarjeta del producto sobre un halo, con chips alrededor. */
function Visual({ children, chips = [], invertido = false }: { children: React.ReactNode; chips?: React.ReactNode[]; invertido?: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-[560px] py-6 sm:py-10">
      <div aria-hidden className={`lp-halo absolute top-1/2 aspect-square w-[88%] -translate-y-1/2 rounded-full ${invertido ? "left-0" : "right-0"}`} />
      <div className="lp-flota relative z-10 rounded-[var(--lp-radius-card)] border border-lp-rule bg-white p-5 [box-shadow:var(--lp-shadow-lift)] sm:p-6">
        {children}
      </div>
      {chips.map((c, i) => (
        <div key={i} className={`lp-flota lp-flota-lenta absolute z-20 hidden sm:block ${i === 0 ? (invertido ? "-right-4 top-0" : "-left-6 top-0") : invertido ? "-left-6 bottom-2" : "-right-4 bottom-2"}`}>
          {c}
        </div>
      ))}
    </div>
  );
}

/* ---------- las cinco etapas ---------- */

type Funcion = { t: string; icon: LucideIcon; plan: Alcance };

export const ETAPAS: {
  id: string;
  n: string;
  nombre: string;
  bajada: string;
  titulo: string;
  texto: string;
  funciones: Funcion[];
  tarjeta: () => React.ReactNode;
  chips: React.ReactNode[];
}[] = [
  {
    id: "agendar", n: "01", nombre: "Agendar", bajada: "Atendé a más pacientes",
    titulo: "Agendá, confirmá y llená los huecos de tu semana",
    texto: "La agenda de cada profesional en una pantalla, con reservas online que el paciente hace solo y una lista de espera para no perder un turno libre.",
    funciones: [
      { t: "Agenda por profesional", icon: CalendarDays, plan: "todos" },
      { t: "Reservas online", icon: Globe, plan: "todos" },
      { t: "Lista de espera", icon: ListChecks, plan: "todos" },
      { t: "Confirmación por WhatsApp", icon: MessageCircle, plan: "clinica" },
      { t: "Box y sillones", icon: Armchair, plan: "clinica" },
      { t: "Tareas del equipo", icon: ClipboardList, plan: "todos" },
    ],
    tarjeta: TarjetaAgenda,
    chips: [
      <Chip key="a" icon={Globe}>Reserva online · 13:30</Chip>,
      <Chip key="b" icon={MessageCircle}>Confirmada por WhatsApp</Chip>,
    ],
  },
  {
    id: "atender", n: "02", nombre: "Atender", bajada: "Una atención de primer nivel",
    titulo: "Registrá todo el proceso clínico, pieza por pieza",
    texto: "Ficha clínica con alertas médicas a la vista y odontograma FDI con cinco superficies por pieza. Cada marca guarda quién la hizo y cuándo.",
    funciones: [
      { t: "Ficha clínica y anamnesis", icon: ClipboardList, plan: "todos" },
      { t: "Odontograma por superficies", icon: Activity, plan: "todos" },
      { t: "Ortodoncia y recetas", icon: FileText, plan: "todos" },
      { t: "Esterilización", icon: SprayCan, plan: "todos" },
      { t: "Consentimientos con firma", icon: PenLine, plan: "clinica" },
      { t: "IA: radiografías y notas por voz", icon: Sparkles, plan: "clinica" },
    ],
    tarjeta: TarjetaFicha,
    chips: [<Chip key="a" icon={PenLine}>Consentimiento firmado</Chip>, <Chip key="b" icon={Sparkles}>Nota por voz transcripta</Chip>],
  },
  {
    id: "cobrar", n: "03", nombre: "Cobrar", bajada: "Concretá más tratamientos",
    titulo: "Presupuestos claros y cobros en cuotas, sin planillas",
    texto: "El paciente acepta el presupuesto por pieza, elige cómo pagar y la caja cierra cada día con su arqueo. Cada cobro tiene su estado y su historial.",
    funciones: [
      { t: "Presupuestos por pieza", icon: Receipt, plan: "todos" },
      { t: "Convenios y descuentos", icon: Users, plan: "todos" },
      { t: "Cobro en cuotas", icon: CreditCard, plan: "clinica" },
      { t: "Caja diaria y arqueo", icon: Wallet, plan: "clinica" },
      { t: "Cuentas por cobrar", icon: AlarmClock, plan: "clinica" },
      { t: "Liquidación a profesionales", icon: Calculator, plan: "clinica" },
    ],
    tarjeta: TarjetaPresupuesto,
    chips: [<Chip key="a" icon={Check}>Presupuesto aceptado</Chip>, <Chip key="b" icon={CreditCard}>Cuota 1 de 3 pagada</Chip>],
  },
  {
    id: "volver", n: "04", nombre: "Volver", bajada: "Fidelizá y hacé que vuelvan",
    titulo: "Pacientes que vuelven a la silla",
    texto: "Controles con fecha, encuestas después de la atención y recordatorios en un clic. En Multi, un embudo para recuperar a los que no volvieron.",
    funciones: [
      { t: "Encuestas y NPS", icon: Star, plan: "todos" },
      { t: "Controles de ortodoncia", icon: CalendarClock, plan: "todos" },
      { t: "Recordatorio de deuda", icon: BellRing, plan: "clinica" },
      { t: "CRM de pacientes", icon: Users, plan: "multi" },
      { t: "Campañas", icon: Megaphone, plan: "multi" },
    ],
    tarjeta: TarjetaVolver,
    chips: [<Chip key="a" icon={Star}>Encuesta respondida</Chip>, <Chip key="b" icon={BellRing}>Recordatorio enviado</Chip>],
  },
  {
    id: "controlar", n: "05", nombre: "Controlar", bajada: "Ordená la operación",
    titulo: "Sabé qué pasa en cada área de tu clínica",
    texto: "Cinco roles, cada uno con lo suyo: la caja cobra sin ver los números del negocio, la recepción agenda sin ver montos y el profesional trabaja la ficha de sus pacientes sin tocar la plata.",
    funciones: [
      { t: "Roles y permisos", icon: ShieldCheck, plan: "todos" },
      { t: "Control de gastos", icon: TrendingDown, plan: "todos" },
      { t: "Inventario", icon: Package, plan: "clinica" },
      { t: "Laboratorios", icon: FlaskConical, plan: "clinica" },
      { t: "Informes y Excel", icon: BarChart3, plan: "clinica" },
      { t: "Reportes por sucursal", icon: BarChart3, plan: "multi" },
    ],
    tarjeta: TablaRoles,
    chips: [<Chip key="a" icon={ShieldCheck}>Permisos por rol</Chip>],
  },
];

/** Grilla de funciones de una etapa: ícono + nombre, y el plan cuando no es de todos. */
function Funciones({ items }: { items: Funcion[] }) {
  return (
    <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 min-[420px]:grid-cols-2">
      {items.map((f) => (
        <li key={f.t} className="flex items-start gap-2.5 text-[14px] text-lp-ink">
          <f.icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-lp-primary" strokeWidth={1.75} aria-hidden />
          <span>
            {f.t}
            {f.plan !== "todos" && <span className="ml-1.5 whitespace-nowrap text-[12px] font-medium text-lp-muted">· {ALCANCE[f.plan]}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ==================================================================
   SECCIONES EXPORTADAS — la home las compone y cada página de sección
   reutiliza la suya con una intro única (SEO: sin duplicar H1 ni copy).
   ================================================================== */

/** El odontograma interactivo real. */
export function SeccionOdontograma() {
  const [demoTeeth, setDemoTeeth] = useState<Record<string, ShowcaseToothRecord>>(DEMO_TEETH);
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-[var(--lp-radius-card)] border border-lp-rule bg-white p-3 [box-shadow:var(--lp-shadow-lift)] sm:p-6">
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
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-lp-muted">
        <span className="rounded-full bg-lp-primarywash px-2.5 py-0.5 text-[12px] font-semibold text-lp-primaryhover">Interactivo</span>
        Odontograma real de Novudent: tocá cualquier pieza y marcá una superficie.
      </figcaption>
    </figure>
  );
}

/** Las ocho capacidades, en lista. */
export function SeccionCapacidades() {
  return (
    <ol className="divide-y divide-lp-rule border-y border-lp-rule">
      {CAPACIDADES.map((c) => (
        <li key={c.n} className="grid gap-x-6 gap-y-1 py-6 sm:grid-cols-12">
          <span className="text-[14px] font-semibold text-lp-primary sm:col-span-1">{c.n}</span>
          <h3 className="text-[19px] font-semibold leading-snug text-lp-ink sm:col-span-4">{c.t}</h3>
          <p className="text-[15px] leading-relaxed text-lp-muted sm:col-span-7">{c.d}</p>
        </li>
      ))}
    </ol>
  );
}

/** Las cinco etapas en filas alternadas: texto + funciones + botones, y el visual al lado. */
export function SeccionFlujo({ ctaHref = "/acceso" }: { ctaHref?: string }) {
  return (
    <div className="space-y-20 sm:space-y-28">
      {ETAPAS.map((e, i) => {
        const par = i % 2 === 1;
        return (
          <article key={e.id} id={`etapa-${e.id}`} className="scroll-mt-28" aria-labelledby={`titulo-${e.id}`}>
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className={par ? "lg:order-2" : ""}>
                <BarraSeccion label={e.bajada} />
                <h3 id={`titulo-${e.id}`} className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-lp-ink">
                  {e.titulo}
                </h3>
                <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-lp-muted">{e.texto}</p>
                <Funciones items={e.funciones} />
                <div className="mt-8 flex flex-wrap gap-3">
                  <PildoraCTA href={ctaHref}>Pedir una demo</PildoraCTA>
                  <BotonSecundario href="/precios">Ver planes</BotonSecundario>
                </div>
              </div>
              <div className={`min-w-0 ${par ? "lg:order-1" : ""}`}>
                <Visual chips={e.chips} invertido={par}>
                  <e.tarjeta />
                </Visual>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** La escena clínica animada (consultorio → app). */
export function SeccionAccion() {
  return <EscenaClinica />;
}

/** Planes y precios en guaraníes. `ctaHref` lo inyecta quien compone (home vs página). */
export function SeccionPrecios({ ctaHref = "/acceso" }: { ctaHref?: string }) {
  const [anual, setAnual] = useState(false);
  const quieto = useReducedMotion();
  return (
    <div>
      <div className="flex flex-col items-center gap-3 text-center">
        <fieldset>
          <legend className="sr-only">Forma de pago</legend>
          <div className="inline-flex rounded-[10px] border border-lp-rule bg-lp-paper2 p-1">
            {[
              { v: false, t: "Mensual" },
              { v: true, t: "Anual" },
            ].map((o) => (
              <label key={o.t} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="periodo"
                  className="peer absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
                  checked={anual === o.v}
                  onChange={() => setAnual(o.v)}
                />
                {anual === o.v && (
                  <motion.span
                    layoutId="periodo-pildora"
                    aria-hidden
                    className="absolute inset-0 rounded-[8px] bg-white [box-shadow:var(--lp-shadow-whisper)]"
                    transition={quieto ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.35 }}
                  />
                )}
                <span className="relative z-10 block min-h-[40px] whitespace-nowrap rounded-[8px] px-5 py-2 text-[14px] font-semibold text-lp-muted transition-colors duration-200 peer-checked:text-lp-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--lp-focus)]">
                  {o.t}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-[14px] text-lp-muted">
          Pagando el año, <b className="font-semibold text-lp-primaryhover">{CONDICIONES.mesesGratisAnual} meses sin cargo</b>.
        </p>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {PLANES.map((p) => (
          <article
            key={p.id}
            aria-labelledby={`plan-${p.id}`}
            className={`relative flex flex-col rounded-[var(--lp-radius-card)] bg-white p-6 sm:p-7 ${
              p.recomendado ? "border-2 border-lp-primary [box-shadow:var(--lp-shadow-lift)]" : "border border-lp-rule"
            }`}
          >
            {p.recomendado && (
              <span className="absolute -top-3 left-6 whitespace-nowrap rounded-full bg-lp-primary px-3 py-1 text-[12px] font-semibold text-white">
                Recomendado
              </span>
            )}
            <h3 id={`plan-${p.id}`} className="text-[20px] font-semibold text-lp-ink">Plan {p.nombre}</h3>
            <p className="mt-1 text-[14px] text-lp-muted">{p.para} · {p.profesionales}</p>

            <div className="mt-6">
              <span key={`${p.id}-${anual}`} className="lp-num lp-cambio text-[clamp(1.9rem,3vw,2.3rem)] font-semibold leading-none tracking-[-0.02em] text-lp-ink">
                {gs(anual ? p.anualGs : p.mensualGs)}
              </span>
              <span className="ml-1.5 text-[14px] text-lp-muted">{anual ? "/ año" : "/ mes"}</span>
            </div>
            <p className="lp-num mt-2 text-[13px] text-lp-muted">
              {anual ? `Equivale a ${gs(Math.round(p.anualGs / 12))} por mes` : `Pagando el año: ${gs(p.anualGs)}`}
            </p>

            <Link
              href={hrefDemo(ctaHref, p.id)}
              className={`lp-pulsable mt-6 inline-flex min-h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-[var(--lp-radius-btn)] px-5 text-[15px] font-semibold ${
                p.recomendado ? "bg-lp-primary text-white hover:bg-lp-primaryhover" : "border border-lp-primary text-lp-primary hover:bg-lp-primarywash"
              }`}
            >
              Pedir una demo
              <span className="sr-only"> del Plan {p.nombre}</span>
            </Link>

            <ul className="mt-7 flex-1 space-y-2.5 border-t border-lp-rule pt-6">
              {p.incluye.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[14px] text-lp-ink">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-lp-primary" strokeWidth={2.25} aria-hidden /> {f}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <dl className="mt-10 grid gap-4 rounded-[var(--lp-radius-card)] bg-lp-paper2 p-6 text-[14px] sm:grid-cols-3 sm:p-7">
        <div>
          <dt className="font-semibold text-lp-ink">Puesta en marcha</dt>
          <dd className="lp-num mt-1 text-lp-muted">{gs(CONDICIONES.setupGs)}, pago único: configuración con su documento, migración de tus datos y capacitación del equipo, en una semana.</dd>
        </div>
        <div>
          <dt className="font-semibold text-lp-ink">Profesional adicional</dt>
          <dd className="lp-num mt-1 text-lp-muted">{gs(CONDICIONES.profesionalExtraGs)} por mes, por encima del límite del plan.</dd>
        </div>
        <div>
          <dt className="font-semibold text-lp-ink">Pago anual</dt>
          <dd className="mt-1 text-lp-muted">{CONDICIONES.mesesGratisAnual} meses sin cargo frente al pago mensual (en Multi, un poco más).</dd>
        </div>
      </dl>
    </div>
  );
}

/** Tabla completa de qué incluye cada plan, armada con las funciones de las cinco etapas. */
export function TablaPlanes() {
  const tiene = (plan: PlanPublicoId, a: Alcance) => a === "todos" || (a === "clinica" && plan !== "solo") || (a === "multi" && plan === "multi");
  return (
    <div className="overflow-x-auto rounded-[var(--lp-radius-card)] border border-lp-rule bg-white">
      <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
        <caption className="sr-only">Qué incluye cada plan</caption>
        <thead>
          <tr className="border-b border-lp-rule">
            <th scope="col" className="px-5 py-4 font-semibold text-lp-ink">Funciones</th>
            {PLANES.map((p) => (
              <th key={p.id} scope="col" className={`px-3 py-4 text-center font-semibold ${p.recomendado ? "text-lp-primary" : "text-lp-ink"}`}>
                {p.nombre}
                <span className="block text-[12px] font-normal text-lp-muted">{p.profesionales}</span>
              </th>
            ))}
          </tr>
        </thead>
        {ETAPAS.map((e) => (
          <tbody key={e.id}>
            <tr className="bg-lp-paper2">
              <th scope="colgroup" colSpan={4} className="px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-lp-primary">
                {e.n} · {e.nombre}
              </th>
            </tr>
            {e.funciones.map((f) => (
              <tr key={f.t} className="border-b border-lp-rule last:border-0">
                <th scope="row" className="px-5 py-3 font-normal text-lp-ink">{f.t}</th>
                {PLANES.map((p) => (
                  <td key={p.id} className="px-3 py-3 text-center">
                    {tiene(p.id, f.plan) ? (
                      <Check className="mx-auto h-4 w-4 text-lp-primary" strokeWidth={2.5} aria-label="Incluido" />
                    ) : (
                      <span className="text-lp-neutral" aria-label="No incluido">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** La semana de puesta en marcha: el cronograma día por día, los pasos y el documento de
 *  configuración que se entrega al terminar el día 2. Los datos viven en lib/landing/precios.ts
 *  (los mismos de la presentación en PDF). */
export function SeccionPuestaEnMarcha() {
  const colores = ["bg-lp-primary text-white", "bg-lp-primarywash text-lp-primaryhover", "bg-lp-ink text-white"];
  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-5">
        <BarraSeccion label="Puesta en marcha" />
        <h2 id="titulo-puesta" className="text-[clamp(1.9rem,3.8vw,2.6rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-lp-ink">
          Tu clínica funcionando en una semana
        </h2>
        <p className="mt-4 max-w-md text-[16px] leading-relaxed text-lp-muted">
          No arrancamos a cargar datos a ciegas: primero relevamos cómo trabaja tu equipo, para que el sistema quede armado a tu medida desde el primer día.
        </p>
        <div className="mt-7 inline-flex items-center gap-4 rounded-[var(--lp-radius-card)] bg-lp-primarywash px-5 py-4">
          <span className="whitespace-nowrap text-[2.25rem] font-semibold leading-none tracking-[-0.02em] text-lp-primary">1 semana</span>
          <span className="text-[14px] leading-snug text-lp-ink">
            {CONDICIONES.diasPuestaEnMarcha} días hábiles:<br />del relevamiento a la capacitación
          </span>
        </div>
      </div>

      <div className="min-w-0 lg:col-span-7">
        {/* Cronograma de la semana: desde 640 px. En el celular alcanza con la lista de pasos. */}
        <div className="mb-8 hidden sm:block" aria-hidden>
          <div className="grid grid-cols-5 gap-1.5 border-b border-lp-rule pb-2 text-center text-[12px] font-semibold text-lp-muted">
            {Array.from({ length: CONDICIONES.diasPuestaEnMarcha }, (_, i) => <span key={i}>Día {i + 1}</span>)}
          </div>
          <div className="mt-2.5 grid grid-cols-5 gap-1.5">
            {PUESTA_EN_MARCHA.map((paso, i) => (
              <div
                key={paso.titulo}
                style={{ gridColumn: `${paso.desde} / ${paso.hasta + 1}` }}
                className={`rounded-[8px] px-2 py-2.5 text-center text-[12px] font-semibold leading-tight ${colores[i]}`}
              >
                {paso.titulo}
              </div>
            ))}
          </div>
        </div>
        <ol className="space-y-5">
          {PUESTA_EN_MARCHA.map((paso) => (
            <li key={paso.titulo} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-4">
              <span className="whitespace-nowrap rounded-full bg-lp-primary py-1.5 text-center text-[13px] font-semibold text-white">{paso.dias}</span>
              <div>
                <h3 className="text-[17px] font-semibold text-lp-ink">{paso.titulo}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-lp-muted">
                  {paso.texto}
                  {paso.desde === 1 && (
                    <> Al terminar te entregamos el <b className="font-semibold text-lp-ink">documento de configuración</b>.</>
                  )}
                </p>
              </div>
            </li>
          ))}
          <li className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-4">
            <span className="whitespace-nowrap rounded-full bg-lp-primarywash py-1.5 text-center text-[13px] font-semibold text-lp-primaryhover">Después</span>
            <div>
              <h3 className="text-[17px] font-semibold text-lp-ink">Salida en vivo y soporte</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-lp-muted">Empezás a usarlo con tu equipo, con soporte para las dudas del arranque y las mejoras que vayan surgiendo.</p>
            </div>
          </li>
        </ol>

        <div className="mt-7 grid grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-[var(--lp-radius-card)] border-2 border-lp-primary bg-white p-5 sm:p-6">
          <span className="grid h-12 w-12 place-items-center rounded-[10px] bg-lp-primarywash text-lp-primary">
            <FileText className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-lp-primary">Entregable · fin del día 2</p>
            <h3 className="mt-1 text-[18px] font-semibold text-lp-ink">Documento de configuración de tu clínica</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-lp-muted">Queda por escrito cómo quedó armado el sistema, para consultarlo cuando quieras.</p>
            <ul className="mt-3 grid gap-x-6 gap-y-1.5 min-[420px]:grid-cols-2">
              {DOCUMENTO_CONFIGURACION.map((d) => (
                <li key={d} className="flex items-start gap-2 text-[14px] text-lp-ink">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-lp-primary" strokeWidth={2.25} aria-hidden /> {d}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Preguntas frecuentes — el contenido vive en lib/faqs.ts (lo comparte el JSON-LD de la home). */
export function SeccionFaq() {
  return (
    <div className="divide-y divide-lp-rule rounded-[var(--lp-radius-card)] border border-lp-rule bg-white px-5 sm:px-7">
      {FAQS.map((f) => (
        <details key={f.q} className="lp-faq group">
          <summary className="flex min-h-[60px] cursor-pointer list-none items-center gap-4 py-4 [&::-webkit-details-marker]:hidden">
            <h3 className="flex-1 text-[17px] font-semibold text-lp-ink">{f.q}</h3>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lp-primarywash text-lp-primary transition-transform duration-200 group-open:rotate-45">
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
          </summary>
          <p className="max-w-3xl pb-5 text-[15px] leading-relaxed text-lp-muted">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

/** Cierre con formulario sobre la franja de color (home). En /acceso el formulario es la página entera. */
export function SeccionCierre() {
  const { session } = useStore();
  return (
    <section id="demo" className="lp-franja scroll-mt-20" aria-labelledby="titulo-demo">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-lp-accent">Pedir una demo</p>
          <h2 id="titulo-demo" className="text-[clamp(2rem,4vw,2.75rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-white">
            Completá el formulario y te mostramos Novudent con tu clínica en mente.
          </h2>
          {session ? (
            <div className="mt-8"><PildoraCTA href="/app" tone="light">Ir al panel</PildoraCTA></div>
          ) : (
            <ul className="mt-8 space-y-3">
              {["Te respondemos en menos de 24 h hábiles", "Tu clínica funcionando en una semana", "Migramos tus datos y capacitamos a tu equipo", "Te entregamos el documento de configuración"].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-[16px] text-white">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-lp-accent" strokeWidth={2.5} aria-hidden /> {t}
                </li>
              ))}
            </ul>
          )}
        </div>
        {!session && (
          <div className="min-w-0 lg:col-span-7">
            <SolicitarAcceso />
          </div>
        )}
      </div>
    </section>
  );
}

/** Barra fija del celular: aparece cuando el botón de la portada salió de pantalla.
 *  Mejora progresiva: si el observer no corre, no aparece y la portada ya tiene su botón. */
function BarraMovil({ vigilar, href, texto }: { vigilar: React.RefObject<HTMLElement | null>; href: string; texto: string }) {
  const [visible, setVisible] = useState(false);
  const wa = linkWhatsApp();
  useEffect(() => {
    const el = vigilar.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [vigilar]);
  if (!visible) return null;
  return (
    <div className="lp-barra-movil fixed inset-x-0 bottom-0 z-[200] border-t border-lp-rule bg-[var(--lp-paper-glass)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md md:hidden">
      <div className="flex gap-2">
        <Link href={href} className="lp-pulsable flex min-h-[48px] flex-1 items-center justify-center whitespace-nowrap rounded-[var(--lp-radius-btn)] bg-lp-primary px-4 text-[16px] font-semibold text-white">
          {texto}
        </Link>
        {wa && (
          <a href={wa} rel="noopener" className="flex min-h-[48px] items-center justify-center whitespace-nowrap rounded-[var(--lp-radius-btn)] border border-lp-primary px-4 text-[15px] font-semibold text-lp-primary">
            WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

/** Visual de la portada: el resumen del día sobre un halo, con datos que flotan alrededor. */
function VisualPortada() {
  return (
    <div className="relative mx-auto w-full max-w-[540px] py-8">
      <div aria-hidden className="lp-halo absolute left-1/2 top-1/2 aspect-square w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <div className="lp-flota relative z-10 mx-auto w-[88%] rounded-[var(--lp-radius-card)] border border-lp-rule bg-white p-5 [box-shadow:var(--lp-shadow-stage)] sm:p-6">
        <TarjetaHoy />
      </div>
      <div className="lp-flota lp-flota-lenta absolute -left-2 top-2 z-20 hidden sm:block">
        <Chip icon={Globe}>Reserva online · 13:30 · 30 min</Chip>
      </div>
      <div className="lp-flota lp-flota-lenta absolute -right-2 bottom-4 z-20 hidden w-52 rounded-[12px] border border-lp-rule bg-white p-3.5 [box-shadow:var(--lp-shadow-float)] sm:block">
        <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-lp-muted">
          Pieza 16 <Ejemplo />
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span className="scale-90" aria-hidden><ToothGlyph n="16" rec={{ condition: "caries", surfaces: ["O"] }} upper /></span>
          <span className="text-[13px] font-medium leading-snug text-lp-ink">Caries oclusal<span className="block text-[12px] font-normal text-lp-alert">Pendiente</span></span>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
   HOME — compone todas las secciones. La portada es exclusiva de acá.
   ================================================================== */

export default function Landing() {
  const { session } = useStore();
  const ctaHref = session ? "/app" : "/acceso";
  const ctaTexto = session ? "Ir al panel" : "Pedir una demo";
  const acciones = useRef<HTMLDivElement>(null);

  return (
    <div className="lp-root pb-24 font-lp text-[16px] leading-relaxed md:pb-0">
      <NavLanding />

      <main>
        {/* ===== PORTADA ===== */}
        <section className="pb-14 pt-24 sm:pb-20 sm:pt-32">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-12">
            <div className="lp-entrada">
              <BarraSeccion label="Software dental" />
              <Link
                href="/capacidades"
                className="mb-6 inline-flex max-w-full items-center gap-2 rounded-full border border-lp-rule bg-lp-paper2 py-1 pl-1 pr-3 text-[13px] text-lp-muted transition-colors hover:border-lp-primary hover:text-lp-ink"
              >
                <span className="rounded-full bg-lp-ink px-2 py-0.5 text-[11px] font-semibold text-white">Nuevo</span>
                <span className="truncate">IA clínica: radiografías y notas por voz</span>
              </Link>
              <h1 className="text-[clamp(2.3rem,5.2vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.025em] text-lp-ink">
                La clínica entera, en una sola pantalla.
              </h1>
              <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-lp-muted">
                Novudent reúne la <b className="font-semibold text-lp-ink">agenda</b>, la <b className="font-semibold text-lp-ink">ficha clínica con odontograma</b>, los{" "}
                <b className="font-semibold text-lp-ink">presupuestos y cobros en cuotas</b> y los permisos de todo tu equipo. Hecho en Paraguay, con precios en guaraníes.
              </p>
              <div ref={acciones} className="mt-8 flex flex-wrap items-center gap-3">
                <PildoraCTA href={ctaHref}>{ctaTexto}</PildoraCTA>
                <BotonSecundario href="/precios">Ver planes</BotonSecundario>
              </div>
            </div>
            <div className="lp-entrada min-w-0" style={{ ["--i" as string]: 3 }}>
              <VisualPortada />
            </div>
          </div>
        </section>

        {/* ===== PROBLEMAS ===== */}
        <section className="px-4 sm:px-6" aria-labelledby="titulo-problemas">
          <div className="lp-manchas mx-auto max-w-6xl rounded-[24px] px-6 py-12 sm:px-12 sm:py-14">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <h2 id="titulo-problemas" className="max-w-2xl text-[clamp(1.6rem,3vw,2.1rem)] font-semibold leading-[1.2] tracking-[-0.015em] text-lp-ink">
                Tener una clínica no es solo atender: también es agenda, cobros, stock y equipo.
              </h2>
              <PildoraCTA href={ctaHref}>{ctaTexto}</PildoraCTA>
            </div>
            <div className="mt-10 grid gap-8 border-t border-lp-primarysoft pt-8 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: CalendarDays, t: "Huecos en la agenda y pacientes que no confirman." },
                { icon: FileText, t: "Fichas en papel o repartidas en planillas." },
                { icon: CreditCard, t: "Cobros en cuotas que nadie sabe seguir." },
                { icon: BarChart3, t: "No saber cuánto produce cada profesional." },
              ].map((x) => (
                <div key={x.t}>
                  <x.icon className="h-7 w-7 text-lp-primary" strokeWidth={1.5} aria-hidden />
                  <p className="mt-4 text-[16px] leading-snug text-lp-ink">{x.t}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== SOLUCIONES ===== */}
        <section className="py-20 sm:py-28" aria-labelledby="titulo-soluciones">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 id="titulo-soluciones" className="mx-auto max-w-3xl text-center text-[clamp(1.9rem,3.8vw,2.6rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-lp-ink">
              Un sistema para cada etapa de tus pacientes y cada área de tu clínica
            </h2>
            <div className="mt-14 grid items-center gap-12 lg:grid-cols-2">
              <Visual chips={[<Chip key="a" icon={MessageCircle}>Recordatorio por WhatsApp</Chip>, <Chip key="b" icon={Globe}>Reserva desde el celular</Chip>]}>
                <TarjetaPresupuesto />
              </Visual>
              <ul className="divide-y divide-lp-rule border-y border-lp-rule">
                {[
                  { icon: ClipboardList, t: "Soluciones clínicas", d: "Ficha, odontograma por superficies, ortodoncia, recetas y consentimientos.", a: "atender" },
                  { icon: Wallet, t: "Cobros y financiamiento", d: "Presupuestos por pieza, cuotas, caja diaria y cuentas por cobrar.", a: "cobrar" },
                  { icon: Sparkles, t: "Inteligencia artificial", d: "Análisis de radiografías y notas clínicas dictadas por voz.", a: "atender" },
                  { icon: ShieldCheck, t: "Administración", d: "Roles y permisos, inventario, laboratorios, gastos e informes.", a: "controlar" },
                ].map((s) => (
                  <li key={s.t}>
                    <a href={`#etapa-${s.a}`} className="group flex gap-4 py-5">
                      <s.icon className="mt-0.5 h-6 w-6 shrink-0 text-lp-primary" strokeWidth={1.5} aria-hidden />
                      <span>
                        <span className="block text-[18px] font-semibold text-lp-ink group-hover:text-lp-primary">{s.t}</span>
                        <span className="mt-1 block text-[14px] leading-relaxed text-lp-muted">{s.d}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ===== CINCO ETAPAS ===== */}
        <section className="pb-20 sm:pb-28" aria-label="Qué hace Novudent en cada etapa">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SeccionFlujo ctaHref={ctaHref} />
          </div>
        </section>

        {/* ===== PROBÁ EL ODONTOGRAMA ===== */}
        <section className="bg-lp-paper2 py-20 sm:py-24" aria-labelledby="titulo-probalo">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <BarraSeccion label="Probalo acá mismo" />
              <h2 id="titulo-probalo" className="text-[clamp(1.9rem,3.8vw,2.6rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-lp-ink">
                El odontograma de Novudent, en tu navegador
              </h2>
              <p className="mt-4 text-[16px] text-lp-muted">32 piezas FDI y cinco superficies por pieza. Tocá una y marcá lo que encontraste.</p>
            </div>
            <SeccionOdontograma />
          </div>
        </section>

        {/* ===== FRANJA CON DATOS DEL PRODUCTO ===== */}
        <section className="lp-franja" aria-labelledby="titulo-franja">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-2">
            <div>
              <h2 id="titulo-franja" className="text-[clamp(2rem,4vw,2.75rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-white">
                Novudent es el software dental hecho en Paraguay, para cómo trabajan las clínicas acá.
              </h2>
              <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-lp-oninkmuted">
                Precios en guaraníes, WhatsApp para confirmar turnos y todo en la nube: entrás desde la computadora, la tablet o el celular.
              </p>
            </div>
            <ul className="divide-y divide-white/20 border-y border-white/20">
              {[
                { v: "32", t: "piezas FDI con morfología real", icon: Activity },
                { v: "5", t: "superficies marcables por pieza", icon: ClipboardList },
                { v: "3", t: "roles con permisos estrictos", icon: ShieldCheck },
                { v: "100%", t: "web: sin nada para instalar", icon: Globe },
              ].map((x) => (
                <li key={x.t} className="flex items-center gap-5 py-4">
                  <x.icon className="h-6 w-6 shrink-0 text-white/80" strokeWidth={1.5} aria-hidden />
                  <span className="lp-num w-24 shrink-0 text-[2.25rem] font-semibold leading-none text-white">{x.v}</span>
                  <span className="text-[15px] text-lp-oninkmuted">{x.t}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ===== PUESTA EN MARCHA ===== */}
        <section id="puesta-en-marcha" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="titulo-puesta">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SeccionPuestaEnMarcha />
          </div>
        </section>

        {/* ===== PRECIOS ===== */}
        <section id="precios" className="scroll-mt-20 border-t border-lp-rule bg-lp-paper2 py-20 sm:py-28" aria-labelledby="titulo-precios">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <BarraSeccion label="Planes" />
              <h2 id="titulo-precios" className="text-[clamp(1.9rem,3.8vw,2.6rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-lp-ink">
                Precios en guaraníes, según el tamaño de tu clínica
              </h2>
            </div>
            <SeccionPrecios ctaHref={ctaHref} />
            <p className="mt-6 text-center">
              <Link href="/precios" className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-lp-primary underline-offset-4 hover:underline">Ver todo lo que incluye cada plan</Link>
            </p>
          </div>
        </section>

        {/* ===== PREGUNTAS ===== */}
        <section className="py-20 sm:py-24" aria-labelledby="titulo-faq">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 id="titulo-faq" className="mb-8 text-center text-[clamp(1.9rem,3.8vw,2.6rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-lp-ink">
              Preguntas frecuentes
            </h2>
            <SeccionFaq />
          </div>
        </section>

        <SeccionCierre />
      </main>
      <FooterLanding />
      <BarraMovil vigilar={acciones} href={ctaHref} texto={ctaTexto} />
    </div>
  );
}

/* Marca se reexporta por si algún módulo la traía de acá. */
export { Marca };
