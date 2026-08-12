"use client";
/**
 * Landing Novudent — editorial, asimétrica, con el producto vivo en el hero.
 * Reglas aplicadas (impeccable): sin grillas de cards idénticas, sin hero de
 * plantilla, color comprometido (bandas navy), tipografía display propia (Jost),
 * y la identidad dental (glifos de dientes) como elemento gráfico de marca.
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
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, ArrowUpRight, Check, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { ShowcaseBoard, ToothGlyph, type ShowcaseToothRecord } from "./OdontogramShowcase";
import SolicitarAcceso from "./SolicitarAcceso";
import { FlagBadge } from "./ui";

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

const CAPACIDADES = [
  { n: "01", t: "Agenda + confirmación de citas", d: "Calendario semanal 00–24 h, lista de espera y recordatorios por WhatsApp con plantilla propia. Clic en una franja vacía y la cita existe." },
  { n: "02", t: "Odontograma por superficies", d: "32 piezas FDI con morfología real. Caries en mesial, corona en la 26: dos clics, queda auditado quién y cuándo." },
  { n: "03", t: "Presupuestos y cobro en cuotas", d: "Plan de tratamiento con convenios y descuento automático. Borrador → presentado → aceptado, ejecución por pieza e impresión en PDF." },
  { n: "04", t: "Caja, gastos y morosidad", d: "Arqueo diario por método de pago, control de gastos y cuentas por cobrar con recordatorio de deuda en un clic." },
  { n: "05", t: "Inventario y comisiones", d: "Bodega virtual con alertas de reposición, y cálculo automático del pago a cada odontólogo según su producción cobrada." },
  { n: "06", t: "Ortodoncia, recetas y archivos", d: "Módulo de ortodoncia con controles mensuales, recetas con plantillas listas para imprimir y radiografías en la ficha." },
  { n: "07", t: "Informes de gestión", d: "KPIs de 30 días, tasa de aceptación de presupuestos y reportes descargables en Excel: pagos, gastos, comisiones, pacientes." },
  { n: "08", t: "Roles, formularios y facturación", d: "RBAC de 3 roles, anamnesis digital con flujo del lápiz y máquina de estados MBILLED → HOLD → FACTURADO con validaciones CPT." },
];

export default function Landing() {
  const { session } = useStore();
  /* La demo abierta se retiró: Novudent se vende con acceso solicitado. Quien ya
     tiene sesión conserva el atajo al panel; el resto va al formulario. */
  const appHref = session ? "/app" : "#acceso";
  const [demoTeeth, setDemoTeeth] = useState<Record<string, ShowcaseToothRecord>>(DEMO_TEETH);

  return (
    <div className="bg-white text-clinic-text">
      {/* ===== NAV ===== */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-clinic-border/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex items-baseline gap-2">
            <span className="font-logo text-xl tracking-[0.18em] text-navy-800">NOVUdent</span>
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.3em] text-clinic-muted sm:block">by NOVUM</span>
          </a>
          <nav className="hidden items-center gap-1 text-sm font-semibold text-clinic-muted md:flex">
            {[["#odontograma", "Odontograma"], ["#capacidades", "Capacidades"], ["#flujo", "Cómo se trabaja"], ["#precios", "Precios"]].map(([h, l]) => (
              <a key={h} href={h} className="rounded-lg px-3 py-2 transition-colors hover:bg-clinic-bg hover:text-clinic-text">{l}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a href="/login" className="hidden rounded-xl px-3.5 py-2 text-sm font-bold text-clinic-text transition-colors hover:bg-clinic-bg sm:block">Iniciar sesión</a>
            <a href={appHref} className="btn-shine rounded-xl bg-navy-800 px-4 py-2 text-sm font-bold text-white transition hover:-translate-y-0.5">
              {session ? "Ir al panel" : "Solicitar acceso"}
            </a>
          </div>
        </div>
      </header>

      {/* ===== HERO: el producto vivo ===== */}
      <section className="relative overflow-hidden pt-28 sm:pt-32">
        <div className="lp-grid absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5">
          <div>
            <div className="flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-clinic-muted">
              <span className="h-px w-10 bg-azure-500" />
              Software odontológico · Paraguay
            </div>
            <h1 className="mt-5 max-w-4xl font-logo text-[2.6rem] font-medium leading-[1.04] tracking-tight text-navy-800 sm:text-6xl lg:text-[4.2rem]">
              La clínica entera,
              <br />
              en <span className="text-azure-600">una sola pantalla</span>.
            </h1>
            <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
              <p className="max-w-md text-lg leading-relaxed text-clinic-muted">
                Agenda, odontograma por superficies, ficha clínica y facturación con
                estados. Esto que ves abajo <b className="text-clinic-text">es el producto real</b> — tocalo.
              </p>
              <div className="flex items-center gap-4">
                <a href={appHref} className="btn-shine group inline-flex items-center gap-2 rounded-2xl bg-azure-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(46,131,245,0.6)] transition hover:-translate-y-0.5 hover:bg-azure-700">
                  {session ? "Ir al panel" : "Solicitar acceso"}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
                <span className="hidden font-mono text-[11px] uppercase tracking-wide text-clinic-muted lg:block">Respondemos en<br />menos de 24 h</span>
              </div>
            </div>
          </div>

          {/* ventana de producto con odontograma VIVO */}
          <div id="odontograma" className="relative mt-12 scroll-mt-24">
            <div className="absolute -inset-x-8 -bottom-10 top-1/3 -z-10 rounded-[3rem] bg-azure-500/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-t-3xl border border-b-0 border-clinic-border bg-white shadow-pop">
              <span className="border-beam-light rounded-t-3xl" />
              {/* barra de navegador */}
              <div className="flex items-center gap-3 border-b border-clinic-border bg-clinic-bg/60 px-4 py-2.5">
                <span className="flex gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-full bg-red-300" /><i className="h-2.5 w-2.5 rounded-full bg-amber-300" /><i className="h-2.5 w-2.5 rounded-full bg-green-300" />
                </span>
                <span className="flex-1 truncate rounded-lg bg-white px-3 py-1 font-mono text-[11px] text-clinic-muted ring-1 ring-clinic-border">
                  novudent.app / pacientes / maría-gonzález / odontograma
                </span>
                <span className="hidden rounded-full bg-state-okbg px-2 py-0.5 font-mono text-[11px] font-bold uppercase text-state-ok sm:block">interactivo</span>
              </div>
              <div className="p-4 sm:p-6">
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
            </div>
          </div>
        </div>

        {/* banda navy de números, pegada a la ventana */}
        <div className="bg-navy-800">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-5 py-12 sm:grid-cols-4 sm:py-14">
            {[
              { v: 32, s: "", l: "piezas FDI con morfología real" },
              { v: 5, s: "", l: "superficies marcables por pieza" },
              { v: 6, s: "", l: "estados de facturación auditados" },
              { v: 3, s: "", l: "roles con permisos estrictos" },
            ].map((x) => (
              <div key={x.l} className="border-l border-white/10 pl-5">
                <div className="font-logo text-5xl text-white sm:text-6xl">{x.v}{x.s}</div>
                <div className="mt-1.5 max-w-[160px] text-xs leading-relaxed text-white/55">{x.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== MARQUEE DE DIENTES (firma visual) ===== */}
      <section aria-hidden className="border-b border-clinic-border bg-white py-6">
        <div className="lp-marquee-mask overflow-hidden">
          <div className="lp-marquee flex w-max items-center gap-8 opacity-80">
            {[...MARQUEE_TEETH, ...MARQUEE_TEETH].map((t, i) => (
              <span key={i} className="flex items-center gap-8">
                <ToothGlyph n={t.n} rec={t.rec} upper />
                {i % 3 === 2 && <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-clinic-muted">novudent</span>}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CAPACIDADES (índice editorial, sin cards) ===== */}
      <section id="capacidades" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-28">
              <div className="flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-clinic-muted">
                <span className="h-px w-10 bg-azure-500" /> Capacidades
              </div>
              <h2 className="mt-4 font-logo text-4xl leading-tight text-navy-800 sm:text-5xl">
                Sin módulos
                <br />de relleno.
              </h2>
              <p className="mt-5 max-w-xs text-sm leading-relaxed text-clinic-muted">
                Las ocho herramientas que mueven una clínica dental, pulidas hasta el detalle.
                Nada más — y nada menos.
              </p>
              <div className="mt-8 flex items-baseline gap-3">
                <span className="font-logo text-6xl text-navy-800">08</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-clinic-muted">herramientas<br />de trabajo</span>
              </div>
            </div>
          </div>
          <div className="lg:col-span-8">
            <div className="border-t border-clinic-border">
              {CAPACIDADES.map((c) => (
                <div
                  key={c.n}
                  className="group relative grid grid-cols-12 items-baseline gap-x-4 gap-y-2 border-b border-clinic-border py-7"
                >
                  <span className="pointer-events-none absolute inset-x-[-12px] inset-y-0 rounded-2xl bg-gradient-to-r from-azure-50 via-azure-50/40 to-transparent opacity-0 transition-opacity duration-400 group-hover:opacity-100" />
                  <div className="relative col-span-2 sm:col-span-1">
                    <span className="font-mono text-xs font-bold text-azure-600">{c.n}</span>
                  </div>
                  <div className="relative col-span-10 sm:col-span-5">
                    <h3 className="font-logo text-2xl leading-tight text-navy-800 transition-transform duration-300 group-hover:translate-x-1 sm:text-[1.7rem]">
                      {c.t}
                    </h3>
                  </div>
                  <div className="relative col-span-12 text-sm leading-relaxed text-clinic-muted sm:col-span-5">
                    {c.d}
                  </div>
                  <div className="relative col-span-1 hidden justify-end self-center sm:flex">
                    <ArrowUpRight className="h-4 w-4 text-clinic-border transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-azure-600" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== CÓMO SE TRABAJA (showcase zigzag) ===== */}
      <section id="flujo" className="scroll-mt-20 border-y border-clinic-border bg-clinic-bg py-20 sm:py-28">
        <div className="mx-auto max-w-6xl space-y-20 px-5">
          <div >
            <div className="flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-clinic-muted">
              <span className="h-px w-10 bg-azure-500" /> Cómo se trabaja
            </div>
            <h2 className="mt-4 max-w-2xl font-logo text-4xl leading-tight text-navy-800 sm:text-5xl">
              Un día en tu clínica, <span className="text-azure-600">sin fricción</span>.
            </h2>
          </div>

          {/* 01 agenda */}
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <span className="font-logo text-7xl text-clinic-border">01</span>
              <h3 className="-mt-4 font-logo text-3xl text-navy-800">La mañana arranca sola</h3>
              <p className="mt-3 max-w-md leading-relaxed text-clinic-muted">
                La recepcionista abre la agenda: los turnos confirmados por WhatsApp en verde,
                los pendientes en ámbar. Un hueco a las 11:00 — clic, y la cita queda creada.
              </p>
            </div>
            <div className="lg:col-span-7">
              <div className="rounded-3xl border border-clinic-border bg-white p-5 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-extrabold text-navy-800">Agenda · hoy</span>
                  <span className="rounded-full bg-state-okbg px-2 py-0.5 font-mono text-[11px] font-bold text-state-ok">92% OCUPACIÓN</span>
                </div>
                {[["09:00", "María González", "Resina pieza 16", "bg-state-ok"], ["10:30", "Juan Ríos", "Primera consulta", "bg-state-warn"], ["11:00", "+ Crear cita en este hueco", "", "bg-azure-500"], ["11:45", "Camila Ortega", "Profilaxis", "bg-state-ok"]].map(([h, n, t, dot], idx) => (
                  <div key={idx} className={`mb-2 flex items-center gap-3 rounded-xl border px-3 py-2.5 ${t === "" ? "border-dashed border-azure-300 bg-azure-50/60" : "border-clinic-border"}`}>
                    <span className="font-mono text-xs font-bold text-clinic-text">{h}</span>
                    <span className="flex-1">
                      <span className={`block text-xs font-bold ${t === "" ? "text-azure-700" : "text-clinic-text"}`}>{n}</span>
                      {t && <span className="block text-[11px] text-clinic-muted">{t}</span>}
                    </span>
                    <span className={`h-2 w-2 rounded-full ${dot}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 02 ficha + odontograma (invertido) */}
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="order-1 lg:order-2 lg:col-span-5">
              <span className="font-logo text-7xl text-clinic-border">02</span>
              <h3 className="-mt-4 font-logo text-3xl text-navy-800">El hallazgo queda en la pieza</h3>
              <p className="mt-3 max-w-md leading-relaxed text-clinic-muted">
                La doctora marca caries oclusal en la 16 directamente sobre el diente.
                Rojo = pendiente, azul = resuelto. Quién, cuándo y en qué superficie: auditado.
              </p>
            </div>
            <div className="order-2 lg:order-1 lg:col-span-7">
              <div className="rounded-3xl border border-clinic-border bg-white p-6 shadow-card">
                <div className="flex items-center justify-center gap-7">
                  {[{ n: "14" }, { n: "15" }, { n: "16", rec: { condition: "caries" as const, surfaces: ["O" as const], updatedAt: "", updatedBy: "" } }, { n: "17" }].map((t) => (
                    <div key={t.n} className="flex flex-col items-center gap-1">
                      <ToothGlyph n={t.n} rec={t.rec} upper />
                      <span className={`font-mono text-[11px] ${t.rec ? "font-bold text-red-600" : "text-clinic-muted"}`}>{t.n}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-center font-mono text-[11px] font-bold text-red-600">
                  16 · CARIES OCLUSAL (O) — registrado por Dra. Benítez
                </p>
              </div>
            </div>
          </div>

          {/* 03 facturación */}
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <span className="font-logo text-7xl text-clinic-border">03</span>
              <h3 className="-mt-4 font-logo text-3xl text-navy-800">El cobro no se escapa</h3>
              <p className="mt-3 max-w-md leading-relaxed text-clinic-muted">
                La asistente envía a cobro. El sistema valida los códigos, aplica la retención
                correcta y nada queda en el limbo: cada reclamo tiene un estado y un historial.
              </p>
            </div>
            <div className="lg:col-span-7">
              <div className="rounded-3xl border border-clinic-border bg-white p-5 shadow-card">
                {[
                  { flags: [] as string[], label: "Registro creado", sub: "Códigos CPT-DX · POS · MOD validados en vivo" },
                  { flags: ["MBILLED", "HOLD"], label: "Enviado a cobro", sub: "Retención automática del e-claim" },
                  { flags: ["FACTURADO", "ACH"], label: "Liberado y facturado", sub: "Pago automático activo" },
                ].map((s, i) => (
                  <div key={i} className="mb-2 flex items-center gap-3 rounded-2xl border border-clinic-border px-4 py-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-azure-50 font-mono text-xs font-bold text-azure-700">{i + 1}</span>
                    <span className="flex-1">
                      <span className="block text-sm font-bold text-clinic-text">{s.label}</span>
                      <span className="block text-[11px] text-clinic-muted">{s.sub}</span>
                    </span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {s.flags.length === 0
                        ? <span className="rounded-full bg-clinic-bg px-2 py-0.5 font-mono text-[11px] font-bold text-clinic-muted">SIN ENVIAR</span>
                        : s.flags.map((f) => <FlagBadge key={f} flag={f as any} />)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PRECIOS (panel asimétrico) ===== */}
      <section id="precios" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:py-28">
        <div >
          <div className="flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-clinic-muted">
            <span className="h-px w-10 bg-azure-500" /> Precios
          </div>
          <h2 className="mt-4 font-logo text-4xl leading-tight text-navy-800 sm:text-5xl">
            Claros. <span className="text-azure-600">Sin sorpresas.</span>
          </h2>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-12">
          {/* plan principal */}
          <div className="relative overflow-hidden rounded-[2rem] bg-navy-800 p-8 text-white lg:col-span-7 sm:p-10">
            <span className="border-beam-light rounded-[2rem]" />
            <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-azure-500/20 blur-3xl" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-azure-200">Plan Clínica · el más elegido</span>
              </div>
              <div className="mt-5 flex items-end gap-2">
                <span className="font-logo text-6xl">$129</span>
                <span className="mb-2 text-sm text-white/50">USD / mes</span>
              </div>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/65">
                Para clínicas en crecimiento: hasta 5 sillones con todo Novudent adentro.
              </p>
              <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
                {["Hasta 5 sillones / profesionales", "Odontograma por superficies", "Financiamiento y morosidad", "Formularios y consentimientos", "Facturación con estados", "Soporte prioritario"].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/85">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-azure-300" strokeWidth={2.5} /> {f}
                  </li>
                ))}
              </ul>
              <a href={appHref} className="btn-shine mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-extrabold text-navy-800 transition hover:-translate-y-0.5">
                Solicitar acceso <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* planes secundarios apilados */}
          <div className="grid gap-5 lg:col-span-5">
            {[
              { name: "Solo", price: "$45", per: "USD / mes", blurb: "Odontólogo independiente: 1 sillón, odontograma, agenda y facturación básica." },
              { name: "Cadena", price: "A medida", per: "", blurb: "Multi-sucursal: comisiones, laboratorio, integraciones propias y account manager." },
            ].map((p) => (
              <div key={p.name} className="h-full">
                <div className="flex h-full flex-col justify-between rounded-[2rem] border border-clinic-border bg-white p-7 shadow-card transition hover:-translate-y-1 hover:shadow-pop">
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-clinic-muted">Plan {p.name}</span>
                      <span className="font-logo text-3xl text-navy-800">{p.price}<span className="ml-1 text-xs font-sans text-clinic-muted">{p.per}</span></span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-clinic-muted">{p.blurb}</p>
                  </div>
                  <a href={appHref} className="group mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-azure-600 hover:text-azure-700">
                    {p.price === "A medida" ? "Hablar con ventas" : "Solicitar acceso"}
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-6 font-mono text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
          Precios referenciales · Sin contratos largos · Migración de datos incluida
        </p>
      </section>

      {/* ===== FAQ ===== */}
      <section className="border-t border-clinic-border bg-clinic-bg py-20 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-clinic-muted">
              <span className="h-px w-10 bg-azure-500" /> FAQ
            </div>
            <h2 className="mt-4 font-logo text-4xl leading-tight text-navy-800">Lo que todos preguntan.</h2>
          </div>
          <div className="space-y-3 lg:col-span-8">
            {[
              { q: "¿Necesito instalar algo?", a: "No. Novudent es 100% web: navegador de computadora, tablet o celular, con tus datos seguros en la nube (Firebase)." },
              { q: "¿El odontograma marca superficies?", a: "Sí: cada pieza tiene su vista oclusal de 5 superficies (M·D·V·L·O). Marcás caries en mesial o una restauración en vestibular y queda pintado en el tablero, con autor y fecha." },
              { q: "¿Cómo evita errores de facturación?", a: "Con una máquina de estados estricta y validación de emparejamientos CPT-DX, POS-CPT y modificadores antes de cada envío. Las retenciones (HOLD/MGRHOLD) se asignan solas." },
              { q: "¿Quién crea los usuarios?", a: "Solo el administrador de la clínica, desde Configuración. Cada usuario entra con su email y contraseña, con los permisos de su rol." },
              { q: "¿Cómo empiezo?", a: "Pedís tu acceso desde el formulario de acá abajo. Te contactamos dentro de las 24 horas hábiles, te mostramos el sistema funcionando y te abrimos la cuenta con 30 días de prueba. Migramos tus datos sin costo." },
            ].map((f, i) => (
              <div key={f.q}>
                <details className="group rounded-2xl border border-clinic-border bg-white shadow-card">
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <span className="font-mono text-xs font-bold text-azure-600">{String(i + 1).padStart(2, "0")}</span>
                    <h3 className="flex-1 text-sm font-extrabold text-navy-800 sm:text-base">{f.q}</h3>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-clinic-bg">
                      <Plus className="h-3.5 w-3.5 text-clinic-muted transition-transform duration-300 group-open:rotate-45" />
                    </span>
                  </summary>
                  <p className="px-5 pb-5 pl-[3.25rem] text-sm leading-relaxed text-clinic-muted">{f.a}</p>
                </details>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA FINAL ===== */}
      <section className="bg-navy-800">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:py-20 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <h2 className="font-logo text-4xl leading-tight text-white sm:text-5xl">
              Tu clínica,
              <br /><span className="text-azure-200">funcionando en Novudent.</span>
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60">
              Te mostramos el sistema con los datos de tu clínica y migramos lo que
              ya tenés — venga de Dentalink, de planillas o de papel.
            </p>
            {session ? (
              <a href="/app" className="btn-shine group mt-7 inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-sm font-extrabold text-navy-800 transition hover:-translate-y-0.5">
                Ir al panel
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            ) : (
              <ul className="mt-7 space-y-2.5">
                {["Migración de tus datos incluida", "Capacitación del equipo", "Respuesta en menos de 24 h hábiles"].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm text-white/85">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-azure-300" strokeWidth={2.5} /> {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* Con sesión abierta va el diente 3D (three.js): cerámica con luz de
              contra azure girando despacio sobre el navy. Mejora progresiva
              pura — si WebGL falla devuelve null y la sección queda completa.
              Sin sesión manda el formulario: acá es donde se vende. */}
          {session ? (
            <div className="hidden lg:col-span-4 lg:block">
              <Tooth3D className="h-72 w-full" />
            </div>
          ) : (
            <div className="lg:col-span-4">
              <SolicitarAcceso />
            </div>
          )}
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-white/10 bg-navy-900">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
          <span className="font-logo tracking-[0.16em] text-white">NOVUdent</span>
          <p className="text-xs text-white/45">
            © {new Date().getFullYear()} Novudent · un producto de{" "}
            <a href="https://novum-web-six.vercel.app" className="font-bold text-azure-300 hover:underline">NOVUM Holding</a> · Asunción, Paraguay
          </p>
          <a href="/login" className="text-xs font-bold text-white/70 hover:text-white">Iniciar sesión →</a>
        </div>
      </footer>
    </div>
  );
}
