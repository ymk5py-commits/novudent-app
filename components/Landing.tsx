"use client";
/**
 * Landing Novudent — el recorrido de una clínica en cinco etapas.
 *
 * Estructura (para no improvisarla en cada sección):
 *
 *   hero partido → índice 01–05 → "¿Cómo es tu clínica?" (Solo / Clínica / Multi)
 *   → Agendar · Atender · Cobrar · Volver · Controlar → cifras del producto
 *   → precios en guaraníes → preguntas → pedir una demo → pie
 *
 *   · Papel claro con tinta navy. El acento menta es chico a propósito: la versión
 *     oscura (`lp-accentink`) para texto sobre claro, la brillante solo sobre navy.
 *   · Jost 700 para titulares, Open Sans para el cuerpo, JetBrains Mono para
 *     ordinales y datos. Titulares siempre rectos, nunca en itálica.
 *   · Una sola entrada animada, en el hero. Después el contenido simplemente está.
 *
 * DOS REGLAS HEREDADAS, que siguen valiendo:
 *
 * 1. Nada se esconde esperando una animación. framer-motion servía el HTML con
 *    `opacity:0` y, cuando el IntersectionObserver no disparaba, media página
 *    quedaba en blanco en el celular. Si una animación no corre, se ve igual.
 * 2. Nada inventado. Las cifras son del producto (piezas, superficies, roles);
 *    lo que cada etapa incluye sale del gating real de `lib/plan.ts` y la tabla
 *    de permisos se arma desde `lib/rbac.ts`. Las tarjetas de ejemplo dicen
 *    "Ejemplo".
 *
 * SEO / ARQUITECTURA: cada sección grande está EXPORTADA y tiene su página
 * (/odontograma, /como-se-trabaja, /en-accion, /precios) con metadata propia.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { can, ROLE_LABEL, type Permission } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import { CAPACIDADES } from "@/lib/capacidades";
import { FAQS } from "@/lib/faqs";
import { CONDICIONES, PLANES, gs, type PlanPublicoId } from "@/lib/landing/precios";
import { linkWhatsApp } from "@/lib/site";
import { ShowcaseBoard, type ShowcaseToothRecord } from "./OdontogramShowcase";
import SolicitarAcceso from "./SolicitarAcceso";
import EscenaClinica from "./EscenaClinica";
import { BarraSeccion, FooterLanding, Marca, NavLanding, Numeral, PildoraCTA } from "./landing/Chrome";

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

/* ---------- piezas chicas ---------- */

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-lp-muted">{children}</span>;
}

function Ejemplo() {
  return (
    <span className="rounded-full border border-lp-rule px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-lp-muted">
      Ejemplo
    </span>
  );
}

type Alcance = "todos" | "clinica" | "multi";
const ALCANCE: Record<Alcance, string> = { todos: "Todos los planes", clinica: "Clínica y Multi", multi: "Multi" };

function Incluye({ items }: { items: { t: string; plan: Alcance }[] }) {
  return (
    <ul className="mt-6 divide-y divide-lp-rule border-y border-lp-rule">
      {items.map((it) => (
        <li key={it.t} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-3">
          <span className="flex items-start gap-2.5 text-[15px] text-lp-ink">
            <Check className="mt-1 h-4 w-4 shrink-0 text-lp-accentink" strokeWidth={2} aria-hidden />
            {it.t}
          </span>
          <span className={`whitespace-nowrap font-mono text-[12px] ${it.plan === "todos" ? "text-lp-muted" : "font-medium text-lp-ink"}`}>
            {ALCANCE[it.plan]}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- tarjetas de cada etapa ---------- */

function TarjetaAgenda() {
  const filas: [string, string, string, "ok" | "pendiente" | "libre"][] = [
    ["09:00", "María González", "Resina · pieza 16", "ok"],
    ["10:30", "Juan Ríos", "Primera consulta", "pendiente"],
    ["11:00", "Hueco libre", "Tocá para crear la cita", "libre"],
    ["11:45", "Camila Ortega", "Control de ortodoncia", "ok"],
  ];
  const estado = { ok: "Confirmada", pendiente: "Sin confirmar", libre: "" };
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="font-logo text-[18px] font-bold text-lp-ink">Agenda · hoy</span>
        <Ejemplo />
      </div>
      <ul className="space-y-2">
        {filas.map(([h, n, t, e]) => (
          <li
            key={h}
            className={`flex items-center gap-3 rounded-[var(--lp-radius-input)] px-3.5 py-3 ${
              e === "libre" ? "border border-dashed border-lp-rule2" : "bg-lp-paper2"
            }`}
          >
            <span className="lp-num w-12 shrink-0 font-mono text-[13px] font-medium text-lp-ink">{h}</span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[14px] font-semibold ${e === "libre" ? "text-lp-accentink" : "text-lp-ink"}`}>{n}</span>
              <span className="block truncate text-[13px] text-lp-muted">{t}</span>
            </span>
            {e !== "libre" && (
              <span className={`hidden whitespace-nowrap text-[12px] sm:inline ${e === "ok" ? "text-lp-accentink" : "text-lp-muted"}`}>
                {estado[e]}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TarjetaPresupuesto() {
  const items: [string, number][] = [["Resina · pieza 16", 250_000], ["Endodoncia · pieza 36", 900_000], ["Corona · pieza 26", 1_400_000]];
  const total = items.reduce((s, [, v]) => s + v, 0);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="font-logo text-[18px] font-bold text-lp-ink">Presupuesto · María González</span>
        <Ejemplo />
      </div>
      <ul className="divide-y divide-lp-rule border-y border-lp-rule">
        {items.map(([t, v]) => (
          <li key={t} className="flex items-baseline justify-between gap-4 py-2.5 text-[14px]">
            <span className="text-lp-ink">{t}</span>
            <span className="lp-num whitespace-nowrap font-mono text-[13px] text-lp-ink">{gs(v)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between gap-4">
        <span className="text-[14px] font-semibold text-lp-ink">Total</span>
        <span className="lp-num whitespace-nowrap font-mono text-[14px] font-medium text-lp-ink">{gs(total)}</span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {["Cuota 1", "Cuota 2", "Cuota 3"].map((c, i) => (
          <div key={c} className={`rounded-[var(--lp-radius-input)] px-3 py-2.5 ${i === 0 ? "bg-lp-accentwash" : "bg-lp-paper2"}`}>
            <span className="block text-[12px] text-lp-muted">{c}</span>
            <span className={`block text-[13px] font-semibold ${i === 0 ? "text-lp-accentink" : "text-lp-ink"}`}>{i === 0 ? "Pagada" : "Pendiente"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TarjetaVolver() {
  const filas: [string, string][] = [
    ["Camila Ortega", "Control de ortodoncia vencido hace 12 días"],
    ["Juan Ríos", "Presupuesto presentado, sin respuesta"],
    ["María González", "Cuota 2 de 3 pendiente"],
  ];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="font-logo text-[18px] font-bold text-lp-ink">Para recontactar</span>
        <Ejemplo />
      </div>
      <ul className="space-y-2">
        {filas.map(([n, m]) => (
          <li key={n} className="flex items-center justify-between gap-3 rounded-[var(--lp-radius-input)] bg-lp-paper2 px-3.5 py-3">
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-lp-ink">{n}</span>
              <span className="block text-[13px] text-lp-muted">{m}</span>
            </span>
            <span className="whitespace-nowrap rounded-full border border-lp-rule2 bg-lp-paper px-3 py-1 text-[12px] font-semibold text-lp-ink">Avisar</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* La tabla sale de la matriz real de permisos: si cambia lib/rbac.ts, cambia acá. */
const FILAS_ROLES: [string, Permission][] = [
  ["Ver y dar turnos", "agenda.create"],
  ["Escribir en la ficha clínica", "emr.write"],
  ["Cobrar y hacer el arqueo de caja", "payments.manage"],
  ["Ver ingresos y liquidaciones", "billing.reports"],
  ["Crear usuarios y configurar la clínica", "users.manage"],
];
const ROLES: Role[] = ["admin", "dentist", "assistant"];

function TablaRoles() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="font-logo text-[18px] font-bold text-lp-ink">Quién puede qué</span>
      </div>
      <table className="w-full border-collapse text-left text-[14px]">
        <caption className="sr-only">Permisos por rol en Novudent</caption>
        <thead>
          <tr className="border-b border-lp-rule2">
            <th scope="col" className="py-2 pr-2 font-normal text-lp-muted"><span className="sr-only">Tarea</span></th>
            {ROLES.map((r) => (
              <th key={r} scope="col" className="px-1 py-2 text-center text-[12px] font-semibold text-lp-ink sm:text-[13px]">{ROLE_LABEL[r]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FILAS_ROLES.map(([t, p]) => (
            <tr key={p} className="border-b border-lp-rule">
              <th scope="row" className="py-2.5 pr-2 font-normal text-lp-ink">{t}</th>
              {ROLES.map((r) => (
                <td key={r} className="px-1 py-2.5 text-center">
                  {can(r, p) ? (
                    <Check className="mx-auto h-4 w-4 text-lp-accentink" strokeWidth={2.25} aria-label="Sí" />
                  ) : (
                    <span className="text-lp-neutral" aria-label="No">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
    <figure className="m-0">
      {/* Sin barra de navegador falsa: el odontograma es real y se sostiene solo. */}
      <div className="overflow-hidden rounded-[var(--lp-radius-card)] border border-lp-rule bg-lp-surface p-3 [box-shadow:var(--lp-shadow-whisper)] sm:p-6">
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
        <span className="rounded-full bg-lp-ink px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-lp-accent">Interactivo</span>
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
          <span className="font-mono text-[13px] font-medium text-lp-accentink sm:col-span-1">{c.n}</span>
          <h3 className="font-logo text-[20px] font-bold leading-snug text-lp-ink sm:col-span-4">{c.t}</h3>
          <p className="text-[15px] leading-relaxed text-lp-muted sm:col-span-7">{c.d}</p>
        </li>
      ))}
    </ol>
  );
}

export const ETAPAS: {
  id: string;
  n: string;
  nombre: string;
  titulo: string;
  texto: string;
  incluye: { t: string; plan: Alcance }[];
  tarjeta?: () => React.ReactNode;
}[] = [
  {
    id: "agendar", n: "01", nombre: "Agendar",
    titulo: "Turnos que no se pierden",
    texto: "Agenda semanal por profesional, lista de espera para llenar los huecos y reservas online que el paciente hace solo, desde un enlace.",
    incluye: [
      { t: "Agenda semanal y lista de espera", plan: "todos" },
      { t: "Reservas online para pacientes", plan: "todos" },
      { t: "Confirmación de citas por WhatsApp", plan: "clinica" },
    ],
    tarjeta: TarjetaAgenda,
  },
  {
    id: "atender", n: "02", nombre: "Atender",
    titulo: "El hallazgo, en la pieza y en la superficie",
    texto: "Ficha clínica y odontograma FDI de 32 piezas con cinco superficies cada una. Cada marca guarda quién la hizo y cuándo. El tablero de abajo es el real: probalo.",
    incluye: [
      { t: "Ficha clínica y odontograma por superficies", plan: "todos" },
      { t: "Consentimientos con firma electrónica", plan: "clinica" },
      { t: "IA clínica: radiografías y notas por voz", plan: "clinica" },
    ],
  },
  {
    id: "cobrar", n: "03", nombre: "Cobrar",
    titulo: "Del presupuesto al cobro, sin planillas",
    texto: "Presupuestos por pieza que el paciente acepta, cobro en cuotas y caja diaria con arqueo. Cada cobro tiene un estado y un historial: nada queda en el limbo.",
    incluye: [
      { t: "Presupuestos y plan de tratamiento", plan: "todos" },
      { t: "Caja diaria, cuotas y cuentas por cobrar", plan: "clinica" },
      { t: "Liquidación a cada profesional", plan: "clinica" },
    ],
    tarjeta: TarjetaPresupuesto,
  },
  {
    id: "volver", n: "04", nombre: "Volver",
    titulo: "Pacientes que vuelven a la silla",
    texto: "Controles de ortodoncia con fecha, recordatorio de deuda en un clic y, en Multi, un embudo de pacientes para recuperar a los que no volvieron.",
    incluye: [
      { t: "Ortodoncia con controles mensuales", plan: "todos" },
      { t: "Recordatorio de deuda en un clic", plan: "clinica" },
      { t: "CRM de pacientes y campañas", plan: "multi" },
    ],
    tarjeta: TarjetaVolver,
  },
  {
    id: "controlar", n: "05", nombre: "Controlar",
    titulo: "Cada rol ve lo que le toca",
    texto: "Tres roles con permisos estrictos: la recepción cobra pero no ve cuánto factura la clínica, y el profesional escribe la ficha sin manejar la caja. Los números del negocio son del dueño.",
    incluye: [
      { t: "Roles y permisos por usuario", plan: "todos" },
      { t: "Informes de gestión y exportación a Excel", plan: "clinica" },
      { t: "Reportes por profesional y por sucursal", plan: "multi" },
    ],
    tarjeta: TablaRoles,
  },
];

/** El recorrido completo: agendar → atender → cobrar → volver → controlar. */
export function SeccionFlujo() {
  return (
    <div className="space-y-20 sm:space-y-28">
      {ETAPAS.map((e) => (
        <article key={e.id} id={`etapa-${e.id}`} className="scroll-mt-28" aria-labelledby={`titulo-${e.id}`}>
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[13px] font-medium text-lp-accentink">{e.n}</span>
                <Etiqueta>{e.nombre}</Etiqueta>
              </div>
              <h3 id={`titulo-${e.id}`} className="mt-4 font-logo text-[clamp(1.75rem,3.6vw,2.5rem)] font-bold leading-[1.1] tracking-[-0.02em] text-lp-ink">
                {e.titulo}
              </h3>
              <p className="mt-4 max-w-md text-[16px] leading-relaxed text-lp-muted">{e.texto}</p>
              <Incluye items={e.incluye} />
            </div>
            {e.tarjeta && (
              <div className="min-w-0 lg:col-span-7">
                <div className="rounded-[var(--lp-radius-card)] border border-lp-rule bg-lp-paper p-5 [box-shadow:var(--lp-shadow-whisper)] sm:p-7">
                  <e.tarjeta />
                </div>
              </div>
            )}
          </div>
          {!e.tarjeta && (
            <div className="mt-10">
              <SeccionOdontograma />
            </div>
          )}
        </article>
      ))}
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
  return (
    <div>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-md text-[16px] leading-relaxed text-lp-muted">
          Un precio por clínica, según cuántos profesionales atienden. Pagando el año, {CONDICIONES.mesesGratisAnual} meses quedan sin cargo.
        </p>
        <fieldset className="shrink-0">
          <legend className="sr-only">Forma de pago</legend>
          <div className="inline-flex rounded-full border border-lp-rule bg-lp-paper p-1">
            {[
              { v: false, t: "Mensual" },
              { v: true, t: "Anual" },
            ].map((o) => (
              <label key={o.t} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="periodo"
                  className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  checked={anual === o.v}
                  onChange={() => setAnual(o.v)}
                />
                <span className="block min-h-[40px] whitespace-nowrap rounded-full px-4 py-2 text-[14px] font-semibold text-lp-muted transition-colors duration-150 peer-checked:bg-lp-ink peer-checked:text-lp-onink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--lp-focus)]">
                  {o.t}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {PLANES.map((p) => (
          <article
            key={p.id}
            aria-labelledby={`plan-${p.id}`}
            className={`flex flex-col rounded-[var(--lp-radius-card)] border bg-lp-paper p-6 sm:p-7 ${
              p.recomendado ? "border-lp-ink [box-shadow:var(--lp-shadow-float)]" : "border-lp-rule"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 id={`plan-${p.id}`} className="font-logo text-[22px] font-bold text-lp-ink">Plan {p.nombre}</h3>
              {p.recomendado && (
                <span className="whitespace-nowrap rounded-full bg-lp-ink px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-lp-accent">
                  Recomendado
                </span>
              )}
            </div>
            <p className="mt-1 text-[14px] text-lp-muted">{p.para} · {p.profesionales}</p>

            <div className="mt-6">
              <span className="lp-num font-logo text-[clamp(1.9rem,3vw,2.3rem)] font-bold leading-none tracking-[-0.02em] text-lp-ink">
                {gs(anual ? p.anualGs : p.mensualGs)}
              </span>
              <span className="ml-1.5 text-[14px] text-lp-muted">{anual ? "/ año" : "/ mes"}</span>
            </div>
            <p className="lp-num mt-2 text-[13px] text-lp-muted">
              {anual ? `Equivale a ${gs(Math.round(p.anualGs / 12))} por mes` : `Pagando el año: ${gs(p.anualGs)}`}
            </p>

            <ul className="mt-6 flex-1 space-y-2.5">
              {p.incluye.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[15px] text-lp-ink">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-lp-accentink" strokeWidth={2} aria-hidden /> {f}
                </li>
              ))}
            </ul>

            <Link
              href={hrefDemo(ctaHref, p.id)}
              className={`mt-7 inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-[15px] font-semibold transition-colors duration-150 ${
                p.recomendado ? "bg-lp-ink text-lp-onink hover:bg-lp-ink2" : "border border-lp-rule2 text-lp-ink hover:bg-lp-paper2"
              }`}
            >
              Pedir una demo
              <span className="sr-only"> del Plan {p.nombre}</span>
            </Link>
          </article>
        ))}
      </div>

      <dl className="mt-8 grid gap-x-8 gap-y-4 border-t border-lp-rule pt-6 text-[14px] sm:grid-cols-3">
        <div>
          <dt className="font-semibold text-lp-ink">Puesta en marcha</dt>
          <dd className="lp-num mt-1 text-lp-muted">{gs(CONDICIONES.setupGs)}, pago único: configuración, migración de tus datos y capacitación del equipo.</dd>
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

/** Preguntas frecuentes — el contenido vive en lib/faqs.ts (lo comparte el
 *  JSON-LD FAQPage de la home). */
export function SeccionFaq() {
  return (
    <div className="divide-y divide-lp-rule border-y border-lp-rule">
      {FAQS.map((f) => (
        <details key={f.q} className="lp-faq group">
          <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-4 py-4 [&::-webkit-details-marker]:hidden">
            <h3 className="flex-1 font-logo text-[18px] font-bold text-lp-ink">{f.q}</h3>
            <Plus className="h-5 w-5 shrink-0 text-lp-muted transition-transform duration-200 group-open:rotate-45" strokeWidth={1.75} aria-hidden />
          </summary>
          <p className="max-w-3xl pb-5 text-[15px] leading-relaxed text-lp-muted">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

/** Cierre con formulario (home). En /acceso el formulario es la página entera. */
export function SeccionCierre() {
  const { session } = useStore();
  return (
    <section id="demo" className="scroll-mt-24 border-t border-lp-rule bg-lp-paper2" aria-labelledby="titulo-demo">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <BarraSeccion label="Pedir una demo" />
          <h2 id="titulo-demo" className="font-logo text-[clamp(2rem,4.4vw,3rem)] font-bold leading-[1.05] tracking-[-0.02em] text-lp-ink">
            Veamos tu clínica funcionando en Novudent.
          </h2>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-lp-muted">
            Te mostramos el sistema, resolvemos tus dudas y migramos lo que ya tenés: otro sistema, planillas o papel.
          </p>
          {session ? (
            <div className="mt-8"><PildoraCTA href="/app">Ir al panel</PildoraCTA></div>
          ) : (
            <ul className="mt-8 space-y-3">
              {["Te respondemos en menos de 24 h hábiles", "Migración de tus datos en la puesta en marcha", "Capacitación para todo el equipo"].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-[15px] text-lp-ink">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-lp-accentink" strokeWidth={2} aria-hidden /> {t}
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

/** Barra fija del celular: aparece cuando el botón del hero salió de pantalla.
 *  Mejora progresiva: si el observer no corre, no aparece y el hero ya tiene su botón. */
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
        <Link href={href} className="flex min-h-[48px] flex-1 items-center justify-center whitespace-nowrap rounded-full bg-lp-ink px-4 text-[16px] font-semibold text-lp-onink">
          {texto}
        </Link>
        {wa && (
          <a href={wa} rel="noopener" className="flex min-h-[48px] items-center justify-center whitespace-nowrap rounded-full border border-lp-rule2 px-4 text-[15px] font-semibold text-lp-ink">
            WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

/* ==================================================================
   HOME — compone todas las secciones. El hero es exclusivo de acá.
   ================================================================== */

export default function Landing() {
  const { session } = useStore();
  const ctaHref = session ? "/app" : "/acceso";
  const ctaTexto = session ? "Ir al panel" : "Pedir una demo";
  const acciones = useRef<HTMLDivElement>(null);

  return (
    <div className="lp-root pb-24 font-sans text-[16px] leading-relaxed md:pb-0">
      <NavLanding />

      <main>
      {/* ===== HERO partido: titular a la izquierda, bajada y acción a la derecha ===== */}
      <section className="pb-12 pt-32 sm:pb-16 sm:pt-44">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-12 lg:items-end lg:gap-12">
          <h1 className="lp-entrada font-logo text-[clamp(2.6rem,6.6vw,5.25rem)] font-bold leading-[1] tracking-[-0.035em] text-lp-ink lg:col-span-7">
            La clínica entera, en una sola pantalla.
          </h1>
          <div className="lp-entrada lg:col-span-5" style={{ ["--i" as string]: 2 }}>
            <p className="text-[18px] leading-relaxed text-lp-muted">
              Agenda, ficha clínica con odontograma por superficies, cobros y permisos para todo el equipo.
              Software de gestión para clínicas dentales, hecho en Paraguay.
            </p>
            <div ref={acciones} className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <PildoraCTA href={ctaHref}>{ctaTexto}</PildoraCTA>
              <Link href="/precios" className="inline-flex min-h-[44px] items-center whitespace-nowrap text-[15px] font-semibold text-lp-ink underline decoration-lp-rule2 underline-offset-4 transition-colors hover:decoration-lp-ink">
                Ver precios
              </Link>
            </div>
          </div>
        </div>

        {/* índice del recorrido */}
        <nav aria-label="El recorrido" className="lp-entrada mx-auto mt-14 hidden max-w-6xl px-4 sm:block sm:px-6" style={{ ["--i" as string]: 4 }}>
          <ol className="grid grid-cols-5 border-t border-lp-ink">
            {ETAPAS.map((e) => (
              <li key={e.id}>
                <a href={`#etapa-${e.id}`} className="group block pr-3 pt-3 transition-colors">
                  <span className="block font-mono text-[12px] font-medium text-lp-accentink">{e.n}</span>
                  <span className="mt-1 block whitespace-nowrap text-[15px] font-semibold text-lp-ink group-hover:underline group-hover:underline-offset-4">{e.nombre}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </section>

      {/* ===== SEGMENTACIÓN ===== */}
      <section className="border-t border-lp-rule bg-lp-paper2 py-16 sm:py-20" aria-labelledby="titulo-clinica">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 id="titulo-clinica" className="font-logo text-[clamp(1.75rem,3.6vw,2.5rem)] font-bold leading-tight tracking-[-0.02em] text-lp-ink">
            ¿Cómo es tu clínica?
          </h2>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {[
              { id: "solo" as const, t: "Atiendo solo", d: "Consultorio con un profesional." },
              { id: "clinica" as const, t: "Somos un equipo", d: "Hasta 4 profesionales, con recepción." },
              { id: "multi" as const, t: "Varias sillas o sedes", d: "Hasta 10 profesionales, una o más sucursales." },
            ].map((s) => {
              const p = PLANES.find((x) => x.id === s.id)!;
              return (
                <Link
                  key={s.id}
                  href={hrefDemo(ctaHref, s.id)}
                  className="group flex flex-col rounded-[var(--lp-radius-card)] border border-lp-rule bg-lp-paper p-6 transition-colors duration-150 hover:border-lp-rule2"
                >
                  <Etiqueta>Plan {p.nombre}</Etiqueta>
                  <span className="mt-3 font-logo text-[20px] font-bold text-lp-ink">{s.t}</span>
                  <span className="mt-1 text-[15px] text-lp-muted">{s.d}</span>
                  <span className="mt-6 flex items-center justify-between gap-3 border-t border-lp-rule pt-4">
                    <span className="lp-num text-[14px] text-lp-ink">
                      Desde <b className="font-semibold">{gs(p.mensualGs)}</b> / mes
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-lp-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.75} aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== EL RECORRIDO ===== */}
      <section className="py-20 sm:py-28" aria-labelledby="titulo-recorrido">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <BarraSeccion label="El recorrido" />
          <h2 id="titulo-recorrido" className="mb-14 max-w-3xl font-logo text-[clamp(2rem,4.4vw,3rem)] font-bold leading-[1.05] tracking-[-0.02em] text-lp-ink sm:mb-20">
            Un paciente, de la agenda al control.
          </h2>
          <SeccionFlujo />
        </div>
      </section>

      {/* ===== CIFRAS DEL PRODUCTO ===== */}
      <section className="border-y border-lp-rule py-14 sm:py-16" aria-label="Novudent en números">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 sm:grid-cols-4 sm:px-6">
          {[
            { v: "32", l: "piezas FDI con morfología real" },
            { v: "5", l: "superficies marcables por pieza" },
            { v: "3", l: "roles con permisos estrictos" },
            { v: "0", l: "programas para instalar: es web" },
          ].map((x) => (
            <div key={x.l}>
              <Numeral n={x.v} />
              <p className="mt-3 max-w-[12rem] text-[15px] leading-snug text-lp-muted">{x.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== PRECIOS ===== */}
      <section id="precios" className="scroll-mt-24 py-20 sm:py-28" aria-labelledby="titulo-precios">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <BarraSeccion label="Precios" />
          <h2 id="titulo-precios" className="mb-8 font-logo text-[clamp(2rem,4.4vw,3rem)] font-bold leading-[1.05] tracking-[-0.02em] text-lp-ink">
            Precios en guaraníes, sin sorpresas.
          </h2>
          <SeccionPrecios ctaHref={ctaHref} />
        </div>
      </section>

      {/* ===== PREGUNTAS ===== */}
      <section className="border-t border-lp-rule py-20 sm:py-24" aria-labelledby="titulo-faq">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h2 id="titulo-faq" className="font-logo text-[clamp(2rem,4.4vw,3rem)] font-bold leading-[1.05] tracking-[-0.02em] text-lp-ink">
              Preguntas frecuentes
            </h2>
          </div>
          <div className="lg:col-span-8">
            <SeccionFaq />
          </div>
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
