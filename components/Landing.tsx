"use client";
/** Landing explicativa de Novudent (tema clínico claro, ultra profesional). */
import { useState, MouseEvent } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight, CalendarDays, Search, FileText, Receipt, ShieldCheck, Smile,
  Check, Plus, MessageCircle, Sparkles, ChevronRight,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { ToothRecord } from "@/lib/types";
import Odontogram from "./Odontogram";
import { FlagBadge } from "./ui";

const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
};

/* CTA principal (azure sólido con flecha) */
function Cta({ href, children, ghost = false }: { href: string; children: React.ReactNode; ghost?: boolean }) {
  return (
    <a
      href={href}
      className={`group inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold transition-all ${
        ghost
          ? "border border-clinic-border bg-white text-clinic-text hover:border-azure-300 hover:text-azure-700"
          : "bg-azure-600 text-white shadow-[0_8px_24px_-8px_rgba(46,131,245,0.6)] hover:-translate-y-0.5 hover:bg-azure-700"
      }`}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}

/* Tarjeta con spotlight que sigue el cursor (patrón 21st.dev, tema claro) */
function SpotCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [pos, setPos] = useState({ x: -500, y: -500 });
  return (
    <div
      onMouseMove={(e: MouseEvent<HTMLDivElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onMouseLeave={() => setPos({ x: -500, y: -500 })}
      className={`group relative overflow-hidden rounded-3xl border border-clinic-border bg-white shadow-card transition-all hover:-translate-y-1 hover:shadow-pop ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(280px circle at ${pos.x}px ${pos.y}px, rgba(46,131,245,0.08), transparent 70%)` }}
      />
      {children}
    </div>
  );
}

const FEATURES = [
  { icon: CalendarDays, t: "Agenda inteligente", d: "Calendario semanal + lista de tareas. Clic en una franja vacía y la cita queda creada. Recordatorios por WhatsApp." },
  { icon: Smile, t: "Odontograma interactivo", d: "32 piezas FDI con morfología real. Marcá caries, coronas, endodoncias e implantes en dos clics." },
  { icon: Search, t: "Patient Finder", d: "Buscador central con íconos de estado: formularios pendientes e historial por actualizar, a la vista." },
  { icon: FileText, t: "Formularios y consentimientos", d: "Anamnesis y consentimientos digitales. El flujo del lápiz: completás, fecha de finalización y listo." },
  { icon: Receipt, t: "Facturación con estados", d: "MBILLED, HOLD, MGRHOLD, FACTURADO, ACH. Validación CPT-DX, POS y modificadores antes de enviar." },
  { icon: ShieldCheck, t: "Roles y permisos (RBAC)", d: "Administrador, dentista y asistente: cada uno ve y toca exactamente lo que le corresponde." },
];

const MARQUEE = [
  "Odontograma FDI 32 piezas", "Recordatorios por WhatsApp", "Facturación por estados",
  "Validación CPT · DX · POS", "3 roles con permisos", "100% en la nube", "Datos en Firebase",
  "Agenda 00–24 h", "Consentimientos digitales",
];

const PLANS = [
  { name: "Solo", price: "$45", per: "/mes", blurb: "Para el odontólogo independiente.", features: ["1 sillón / profesional", "Odontograma + ficha", "Agenda y recordatorios", "Facturación básica"], featured: false },
  { name: "Clínica", price: "$129", per: "/mes", blurb: "Para clínicas en crecimiento.", features: ["Hasta 5 sillones", "Financiamiento y morosidad", "Formularios y consentimientos", "Soporte prioritario"], featured: true },
  { name: "Cadena", price: "A medida", per: "", blurb: "Multi-sucursal y a gran escala.", features: ["Sucursales ilimitadas", "Comisiones y laboratorio", "Integraciones a medida", "Account manager"], featured: false },
];

const FAQS = [
  { q: "¿Necesito instalar algo?", a: "No. Novudent es 100% web: funciona desde el navegador de tu computadora, tablet o celular, con tus datos seguros en la nube (Firebase)." },
  { q: "¿Tiene odontograma de verdad?", a: "Sí: 32 piezas en notación FDI con morfología dental real (incisivos, caninos, premolares y molares con raíces) y notación clínica clásica: caries, restauraciones, coronas, endodoncias, extracciones, ausentes e implantes." },
  { q: "¿Cómo maneja la facturación?", a: "Con una máquina de estados estricta: enviás a cobro (MBILLED), el sistema aplica la retención correcta (HOLD para e-claims, MGRHOLD para reclamos manuales) y liberás con un clic para facturar. Antes de enviar, valida los emparejamientos CPT-DX, POS-CPT y modificadores." },
  { q: "¿Mi equipo puede tener distintos permisos?", a: "Sí. Tres roles listos: Administrador (todo), Dentista (clínica e historial) y Asistente (agenda, formularios y facturación, con historial de solo lectura)." },
  { q: "¿Puedo probarlo gratis?", a: "Sí — la demo está abierta con datos de ejemplo: entrá, elegí un rol y usala como si fuera tu clínica. No pedimos tarjeta." },
];

/* mini-odontograma demo (estado local, no toca la base) */
const DEMO_TEETH: Record<string, ToothRecord> = {
  "16": { condition: "caries", note: "Oclusal", updatedAt: "", updatedBy: "Demo" },
  "11": { condition: "restaurado", updatedAt: "", updatedBy: "Demo" },
  "26": { condition: "corona", updatedAt: "", updatedBy: "Demo" },
  "36": { condition: "endodoncia", updatedAt: "", updatedBy: "Demo" },
  "46": { condition: "implante", updatedAt: "", updatedBy: "Demo" },
  "28": { condition: "ausente", updatedAt: "", updatedBy: "Demo" },
};

export default function Landing() {
  const { session } = useStore();
  const appHref = session ? "/app" : "/login";
  const [demoTeeth, setDemoTeeth] = useState<Record<string, ToothRecord>>(DEMO_TEETH);

  return (
    <div className="bg-clinic-bg text-clinic-text">
      {/* ===== NAV ===== */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-clinic-border/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-navy-800 font-logo text-sm text-azure-200">N</span>
            <span className="font-logo text-lg tracking-[0.16em] text-navy-800">NOVUdent</span>
          </a>
          <nav className="hidden items-center gap-1 text-sm font-semibold text-clinic-muted md:flex">
            {[["#funciones", "Funciones"], ["#odontograma", "Odontograma"], ["#facturacion", "Facturación"], ["#precios", "Precios"], ["#faq", "FAQ"]].map(([h, l]) => (
              <a key={h} href={h} className="rounded-lg px-3 py-2 transition-colors hover:bg-clinic-bg hover:text-clinic-text">{l}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a href="/login" className="hidden rounded-xl px-3.5 py-2 text-sm font-bold text-clinic-text transition-colors hover:bg-clinic-bg sm:block">
              Iniciar sesión
            </a>
            <a href={appHref} className="rounded-xl bg-azure-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-azure-700">
              {session ? "Ir al panel" : "Probar demo"}
            </a>
          </div>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden pt-32 pb-16 sm:pt-40 sm:pb-24">
        <div className="lp-grid absolute inset-0" />
        <div
          className="absolute inset-x-0 top-0 h-[480px]"
          style={{ background: "radial-gradient(800px 420px at 50% -8%, rgba(46,131,245,0.14), transparent 65%)" }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-azure-200 bg-azure-50 px-3.5 py-1.5 text-xs font-bold text-azure-700">
              <Sparkles className="h-3.5 w-3.5" /> Software de gestión dental · Hecho para Paraguay
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-navy-800 sm:text-5xl lg:text-[3.4rem]">
              Tu clínica dental,
              <br />
              <span className="text-azure-600">bajo control.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-clinic-muted">
              Agenda, odontograma, ficha clínica y facturación con estados — todo en una sola
              plataforma en la nube. Menos planillas, menos no-shows, más sillón ocupado.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Cta href={appHref}>{session ? "Ir al panel" : "Probar la demo gratis"}</Cta>
              <Cta href="#funciones" ghost>Ver funciones</Cta>
            </div>
            <p className="mt-4 text-xs font-semibold text-clinic-muted">
              Sin tarjeta · Datos de ejemplo incluidos · Elegí tu rol y entrá
            </p>
          </motion.div>

          {/* Mockup del producto */}
          <motion.div
            initial={{ opacity: 0, y: 30, rotate: 1.5 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-azure-500/10 blur-3xl" />
            <div className="relative rounded-3xl border border-clinic-border bg-white p-5 shadow-pop">
              <span className="border-beam-light rounded-3xl" />
              {/* mini agenda */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-extrabold text-navy-800">Agenda · hoy</span>
                <span className="rounded-full bg-state-okbg px-2 py-0.5 font-mono text-[10px] font-bold text-state-ok">92% OCUPACIÓN</span>
              </div>
              {[["09:00", "María González", "Resina pieza 16", "bg-state-ok"], ["10:30", "Juan Ríos", "Primera consulta", "bg-state-warn"], ["11:15", "Camila Ortega", "Profilaxis", "bg-state-ok"]].map(([h, n, t, dot]) => (
                <div key={h as string} className="mb-2 flex items-center gap-3 rounded-xl border border-clinic-border px-3 py-2">
                  <span className="font-mono text-xs font-bold text-clinic-text">{h}</span>
                  <span className="flex-1">
                    <span className="block text-xs font-bold text-clinic-text">{n}</span>
                    <span className="block text-[10px] text-clinic-muted">{t}</span>
                  </span>
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                </div>
              ))}
              {/* flags de facturación */}
              <div className="mt-3 flex items-center justify-between rounded-xl bg-clinic-bg px-3 py-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-clinic-muted">Facturación</span>
                <span className="flex gap-1"><FlagBadge flag="MBILLED" /><FlagBadge flag="HOLD" /></span>
              </div>
              {/* WhatsApp */}
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-state-okbg/60 px-3 py-2.5">
                <MessageCircle className="h-3.5 w-3.5 text-state-ok" />
                <span className="text-[11px] font-semibold text-clinic-text">Recordatorio enviado por WhatsApp a +595 981 …</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== MARQUEE ===== */}
      <section className="border-y border-clinic-border bg-white py-5">
        <div className="lp-marquee-mask overflow-hidden">
          <div className="lp-marquee flex w-max gap-3">
            {[...MARQUEE, ...MARQUEE].map((t, i) => (
              <span key={i} className="whitespace-nowrap rounded-full border border-clinic-border bg-clinic-bg px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FUNCIONES (bento) ===== */}
      <section id="funciones" className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <motion.div {...reveal} className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-navy-800 sm:text-4xl">
            Todo lo que tu consultorio usa <span className="text-azure-600">todos los días</span>
          </h2>
          <p className="mt-3 text-clinic-muted">Sin módulos de relleno: las seis herramientas que mueven una clínica dental, pulidas.</p>
        </motion.div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div key={f.t} {...reveal} transition={{ ...reveal.transition, delay: i * 0.05 }}>
              <SpotCard className="h-full p-6">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-azure-50 text-azure-600">
                  <f.icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-lg font-extrabold text-navy-800">{f.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-clinic-muted">{f.d}</p>
              </SpotCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== ODONTOGRAMA DEMO ===== */}
      <section id="odontograma" className="border-y border-clinic-border bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <motion.div {...reveal} className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-azure-200 bg-azure-50 px-3.5 py-1.5 text-xs font-bold text-azure-700">
              <Smile className="h-3.5 w-3.5" /> Probalo ahora mismo
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-navy-800 sm:text-4xl">
              El odontograma que tu equipo va a <span className="text-azure-600">querer usar</span>
            </h2>
            <p className="mt-3 text-clinic-muted">
              32 piezas FDI con morfología real y notación clínica clásica.
              <b className="text-clinic-text"> Hacé clic en cualquier pieza</b> — así de simple es en el día a día.
            </p>
          </motion.div>
          <motion.div {...reveal} className="mx-auto mt-10 max-w-4xl">
            <Odontogram
              value={demoTeeth}
              editable
              authorName="Demo"
              onChange={(tooth, rec) =>
                setDemoTeeth((prev) => {
                  const next = { ...prev };
                  if (rec) next[tooth] = rec; else delete next[tooth];
                  return next;
                })
              }
            />
          </motion.div>
        </div>
      </section>

      {/* ===== FACTURACIÓN ===== */}
      <section id="facturacion" className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div {...reveal}>
            <h2 className="text-3xl font-extrabold tracking-tight text-navy-800 sm:text-4xl">
              Facturación que <span className="text-azure-600">no comete errores</span>
            </h2>
            <p className="mt-4 leading-relaxed text-clinic-muted">
              Cada reclamo sigue una máquina de estados estricta: nada se envía sin validar los
              emparejamientos <b className="text-clinic-text">CPT-DX, POS-CPT y Modificador-CPT</b>.
              Las retenciones se asignan solas y todo queda auditado.
            </p>
            <ul className="mt-6 space-y-2.5">
              {["Enviar a cobro aplica MBILLED automáticamente", "E-claim → HOLD · reclamo manual → MGRHOLD", "Release from Hold completa el proceso (FACTURADO)", "ACH para pagos automáticos", "Historial completo de cada transición"].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm font-semibold text-clinic-text">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-state-okbg text-state-ok"><Check className="h-3 w-3" strokeWidth={3} /></span>
                  {t}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div {...reveal} className="rounded-3xl border border-clinic-border bg-white p-6 shadow-card">
            <div className="text-xs font-bold uppercase tracking-wide text-clinic-muted">Ciclo de un reclamo</div>
            <div className="mt-4 space-y-3">
              {[
                { flags: [] as string[], label: "Registro creado", sub: "Validación de códigos en vivo" },
                { flags: ["MBILLED"], label: "Enviado a cobro", sub: "Entra a la cola de facturación" },
                { flags: ["MBILLED", "HOLD"], label: "Retención automática", sub: "Reclamo electrónico en revisión" },
                { flags: ["FACTURADO", "ACH"], label: "Liberado y facturado", sub: "Pago automático activo" },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-3 rounded-2xl border border-clinic-border px-4 py-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-azure-50 font-mono text-xs font-bold text-azure-700">{i + 1}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-bold text-clinic-text">{s.label}</span>
                    <span className="block text-[11px] text-clinic-muted">{s.sub}</span>
                  </span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {s.flags.length === 0
                      ? <span className="rounded-full bg-clinic-bg px-2 py-0.5 font-mono text-[10px] font-bold text-clinic-muted">SIN ENVIAR</span>
                      : s.flags.map((f) => <FlagBadge key={f} flag={f as any} />)}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== PRECIOS ===== */}
      <section id="precios" className="border-y border-clinic-border bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <motion.div {...reveal} className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-navy-800 sm:text-4xl">
              Precios claros, <span className="text-azure-600">sin sorpresas</span>
            </h2>
            <p className="mt-3 text-clinic-muted">Empezá con la demo gratis. Escalá cuando tu clínica lo pida.</p>
          </motion.div>
          <div className="mx-auto mt-12 grid max-w-4xl items-stretch gap-5 md:grid-cols-3">
            {PLANS.map((p, i) => (
              <motion.div
                key={p.name}
                {...reveal}
                transition={{ ...reveal.transition, delay: i * 0.06 }}
                className={`relative flex flex-col rounded-3xl border p-6 ${
                  p.featured ? "border-azure-300 bg-azure-50/50 shadow-pop md:-translate-y-2" : "border-clinic-border bg-white shadow-card"
                }`}
              >
                {p.featured && <span className="border-beam-light rounded-3xl" />}
                {p.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-azure-600 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
                    Más elegido
                  </span>
                )}
                <h3 className="text-lg font-extrabold text-navy-800">{p.name}</h3>
                <p className="mt-1 min-h-[36px] text-xs text-clinic-muted">{p.blurb}</p>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-3xl font-extrabold text-navy-800">{p.price}</span>
                  <span className="mb-1 text-xs text-clinic-muted">{p.per && `USD ${p.per}`}</span>
                </div>
                <ul className="mt-5 flex-1 space-y-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-clinic-text">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-azure-600" strokeWidth={2.5} /> {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={appHref}
                  className={`mt-6 grid place-items-center rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors ${
                    p.featured ? "bg-azure-600 text-white hover:bg-azure-700" : "border border-clinic-border text-clinic-text hover:border-azure-300 hover:text-azure-700"
                  }`}
                >
                  {p.price === "A medida" ? "Hablar con ventas" : "Probar gratis"}
                </a>
              </motion.div>
            ))}
          </div>
          <p className="mt-7 text-center font-mono text-[10px] font-bold uppercase tracking-wide text-clinic-muted">
            Precios referenciales · Sin contratos largos · Migración de datos incluida
          </p>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="mx-auto max-w-3xl px-5 py-20 sm:py-28">
        <motion.h2 {...reveal} className="text-center text-3xl font-extrabold tracking-tight text-navy-800 sm:text-4xl">
          Preguntas frecuentes
        </motion.h2>
        <div className="mt-10 space-y-3">
          {FAQS.map((f) => (
            <motion.details key={f.q} {...reveal} className="group rounded-2xl border border-clinic-border bg-white shadow-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                <h3 className="text-sm font-extrabold text-navy-800 sm:text-base">{f.q}</h3>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-clinic-bg">
                  <Plus className="h-3.5 w-3.5 text-clinic-muted transition-transform duration-300 group-open:rotate-45" />
                </span>
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-clinic-muted">{f.a}</p>
            </motion.details>
          ))}
        </div>
      </section>

      {/* ===== CTA FINAL ===== */}
      <section className="px-5 pb-20">
        <motion.div
          {...reveal}
          className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-navy-800 px-6 py-14 text-center sm:py-16"
        >
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(600px 300px at 50% 0%, rgba(46,131,245,0.35), transparent 70%)" }}
          />
          <div className="relative">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              La demo está lista. <span className="text-azure-200">Tu clínica también.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/70">
              Entrá con un clic, elegí tu rol y recorré la agenda, el odontograma y la facturación con datos reales de ejemplo.
            </p>
            <div className="mt-7 flex justify-center">
              <a
                href={appHref}
                className="group inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-sm font-extrabold text-navy-800 transition-all hover:-translate-y-0.5 hover:shadow-pop"
              >
                {session ? "Ir al panel" : "Probar la demo gratis"}
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-clinic-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-navy-800 font-logo text-xs text-azure-200">N</span>
            <span className="font-logo tracking-[0.16em] text-navy-800">NOVUdent</span>
          </div>
          <p className="text-xs text-clinic-muted">
            © {new Date().getFullYear()} Novudent · un producto de{" "}
            <a href="https://novum-web-six.vercel.app" className="font-bold text-azure-600 hover:underline">NOVUM Holding</a> · Asunción, Paraguay
          </p>
          <a href="/login" className="text-xs font-bold text-clinic-text hover:text-azure-700">Iniciar sesión →</a>
        </div>
      </footer>
    </div>
  );
}
