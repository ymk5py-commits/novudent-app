"use client";
/* Hallmark · genre: editorial · macrostructure: Split Studio
 * theme: custom (tuned) · vibe: "clinical broadsheet, paraguayan software"
 * paper oklch(98.4% 0.003 260) · accent oklch(55.8% 0.089 212) · light / display-heavy / cool
 * type: Bricolage Grotesque (display) + Instrument Sans (body) + JetBrains Mono (data)
 * nav: N6 Newspaper masthead — knobs: issue-line=below, wordmark=2xl, rule=double
 * footer: Ft4 Dense colophon — knobs: family=mono, layout=log-style, includes=date+attribution
 * hero: H2 Split diptych — knobs: ratio=7/5, right=proof column (live product), divider=negative space
 * section heads: S2 Hanging · features: F3 Tabular spec sheet · proof: T4 Stat strip · CTA: C3 Typographic link
 * enrichment: none — el odontograma es el producto real, no una maqueta
 * motion: solo el subrayado que engrosa al hover (1)
 *   SIN revelado por scroll: causaba secciones invisibles en producción. Ver la
 *   nota abajo del import.
 * pre-emit critique: P5 H5 E4 S5 R4 V5
 */
import { useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { ShowcaseBoard, ToothGlyph, type ShowcaseToothRecord } from "./OdontogramShowcase";
import { FlagBadge } from "./ui";

/* SIN <Reveal>/<Stagger> en esta página, a propósito.
   framer-motion serializa su `opacity:0` inicial en el HTML del servidor y lo
   levanta recién cuando el IntersectionObserver avisa que entraste en cuadro.
   Si ese observer no dispara —lo vi fallar en un navegador Chromium, y el dueño
   lo reportó viendo secciones en blanco— el contenido no aparece NUNCA. Una
   animación linda no puede ser lo que decide si se ve la página o no.
   El panel las sigue usando; acá no valen el riesgo. */

/* Acá vivía un contador que subía de 0 al valor real al entrar en cuadro.
   Se fue por dos razones. La primera es un bug de verdad: dependía de
   `useInView`, y si el IntersectionObserver no dispara —scroll muy rápido,
   navegador que lo tiene trabado, o directamente sin JS— la franja se queda
   mostrando "0 piezas FDI con morfología real", que no es una animación a
   medias sino un dato FALSO en la cara del que evalúa comprar. La segunda es
   que la animación no aportaba nada: el número importa, no su llegada. Menos
   motion, cero riesgo de mentir. */

const DEMO_TEETH: Record<string, ShowcaseToothRecord> = {
  "16": { condition: "caries", surfaces: ["O"] },
  "24": { condition: "caries", surfaces: ["M"] },
  "11": { condition: "restaurado", surfaces: ["V"] },
  "26": { condition: "corona" },
  "36": { condition: "endodoncia" },
  "46": { condition: "implante" },
  "28": { condition: "ausente" },
};

/* Espécimen de piezas: glifos reales del odontograma, no iconos decorativos. */
const SPECIMEN_TEETH: { n: string; rec?: ShowcaseToothRecord }[] = [
  { n: "11" }, { n: "13", rec: { condition: "restaurado" } },
  { n: "16" }, { n: "21", rec: { condition: "caries", surfaces: ["O"] } },
  { n: "23" }, { n: "26", rec: { condition: "corona" } },
  { n: "14" }, { n: "17" }, { n: "12", rec: { condition: "endodoncia" } },
  { n: "24" }, { n: "27", rec: { condition: "implante" } }, { n: "15" },
];

/* Hoja de especificaciones (F3): cada fila es una capacidad con su dato duro.
   La columna `k` es el dato, no un adorno — es lo que un dueño de clínica
   compara contra lo que ya usa. */
const CAPACIDADES: { t: string; d: string; k: string }[] = [
  { t: "Agenda y confirmación", d: "Calendario 00–24 h, lista de espera y recordatorios por WhatsApp con plantilla propia. Clic en una franja vacía y la cita existe.", k: "24 h" },
  { t: "Odontograma por superficies", d: "Piezas FDI con morfología real. Caries en mesial, corona en la 26: dos clics, y queda auditado quién y cuándo.", k: "5 caras" },
  { t: "Presupuestos y cuotas", d: "Plan de tratamiento con convenios y descuento automático. Borrador → presentado → aceptado, con ejecución por pieza.", k: "4 estados" },
  { t: "Caja, gastos y morosidad", d: "Arqueo diario por medio de pago, control de gastos y cuentas por cobrar con recordatorio de deuda en un clic.", k: "5 medios" },
  { t: "Inventario y comisiones", d: "Bodega con alertas de reposición y cálculo del pago a cada odontólogo según su producción efectivamente cobrada.", k: "auto" },
  { t: "Ortodoncia y recetas", d: "Controles mensuales, recetas con plantillas listas para imprimir y radiografías guardadas dentro de la ficha.", k: "mensual" },
  { t: "Informes de gestión", d: "KPIs de 30 días, tasa de aceptación de presupuestos y descargas en Excel: pagos, gastos, comisiones, pacientes.", k: "8 reportes" },
  { t: "Roles y facturación", d: "Tres roles con permisos estrictos, anamnesis digital y máquina de estados con validación de códigos antes de cada envío.", k: "3 roles" },
];

const FAQ = [
  { q: "¿Necesito instalar algo?", a: "No. Novudent es 100 % web: entrás desde el navegador de la computadora, la tablet o el celular, con los datos en la nube." },
  { q: "¿El odontograma marca superficies?", a: "Sí. Cada pieza tiene su vista oclusal de cinco superficies (M·D·V·L·O). Marcás caries en mesial o una restauración en vestibular y queda pintado en el tablero, con autor y fecha." },
  { q: "¿Puedo traer mis datos de Dentalink?", a: "Sí. Exportás tus pacientes a Excel desde Dentalink, los pegás en Novudent y el sistema detecta las columnas solo: omite duplicados por CI y, si hay columna de deuda, la carga directo en cuentas por cobrar." },
  { q: "¿Quién crea los usuarios?", a: "Solo el administrador de la clínica, desde Configuración. Cada persona entra con su email y contraseña, con los permisos de su rol." },
  { q: "¿Puedo probarlo gratis?", a: "Sí. La demo está abierta con datos de ejemplo y sin tarjeta. Elegís un rol y la usás como si fuera tu clínica." },
];

export default function Landing() {
  const { session } = useStore();
  const appHref = session ? "/app" : "/login";
  const [demoTeeth, setDemoTeeth] = useState<Record<string, ShowcaseToothRecord>>(DEMO_TEETH);
  const hoy = new Date().toLocaleDateString("es-PY", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="bg-paper font-body text-clinic-text">
      {/* ===== N6 · MASTHEAD ===== */}
      <header className="ed-rule-double bg-paper">
        <div className="mx-auto max-w-6xl px-5">
          {/* fila de fecha/edición — la línea fina de un diario */}
          <div className="flex items-center justify-between gap-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-clinic-muted">
            <span className="hidden sm:block">Asunción, Paraguay</span>
            <span className="truncate">{hoy}</span>
            <a href="/login" className="ed-link ed-tap shrink-0 font-semibold text-clinic-text">Iniciar sesión</a>
          </div>
          {/* wordmark */}
          <div className="border-t border-clinic-border/70 py-4 text-center sm:py-5">
            <a href="/" className="ed-tap inline-block">
              <span className="font-display text-3xl font-extrabold tracking-[-0.02em] text-navy-800 sm:text-4xl">NOVUdent</span>
            </a>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.3em] text-clinic-muted">
              Software de gestión odontológica
            </p>
          </div>
          {/* fila de enlaces */}
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t border-clinic-border/70 py-2.5 text-sm">
            {[["#capacidades", "Capacidades"], ["#flujo", "Cómo se trabaja"], ["#precios", "Precios"], ["#faq", "Preguntas"]].map(([h, l]) => (
              <a key={h} href={h} className="ed-link ed-tap font-semibold text-clinic-muted hover:text-clinic-text">{l}</a>
            ))}
            <a href={appHref} className="ed-link ed-tap font-bold text-azure-600">
              {session ? "Ir al panel →" : "Probar la demo →"}
            </a>
          </nav>
        </div>
      </header>

      {/* ===== H2 · HERO DÍPTICO — afirmación izquierda, prueba derecha ===== */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:pt-16">
        <div className="grid items-start gap-x-10 gap-y-10 lg:grid-cols-12">
          <div
            className="lg:col-span-7"
          >
            <h1 className="max-w-[13ch] font-display font-extrabold leading-[0.94] tracking-[-0.035em] text-navy-800" style={{ fontSize: "var(--text-display)" }}>
              La clínica entera, en <span className="text-azure-600">una sola pantalla</span>.
            </h1>
            <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-clinic-muted">
              Agenda, odontograma por superficies, ficha clínica y facturación con
              estados. Hecho en Paraguay, para cómo se trabaja acá.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
              <a
                href={appHref}
                className="group inline-flex min-h-[44px] items-center gap-2 border border-navy-800 bg-navy-800 px-6 py-3 text-sm font-bold text-white transition-colors duration-200 hover:bg-navy-700"
              >
                {session ? "Ir al panel" : "Probar la demo gratis"}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </a>
              <p className="font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-clinic-muted">
                Sin tarjeta · sin instalación
                <br />
                Elegís el rol y entrás
              </p>
            </div>
          </div>

          {/* Lámina comparativa: la MISMA pieza 16 en cuatro estados. Son los
              glifos reales del odontograma, no ilustraciones — el tablero entero
              necesita 700 px y por eso vive a todo el ancho, más abajo. */}
          <figure
            className="ed-figure lg:col-span-5"
          >
            <figcaption className="border-b border-clinic-border px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-clinic-text">
              Pieza 16 · cuatro estados
            </figcaption>
            <div className="grid grid-cols-4">
              {([
                { rec: undefined, l: "Sana" },
                { rec: { condition: "caries" as const, surfaces: ["O" as const] }, l: "Caries" },
                { rec: { condition: "restaurado" as const, surfaces: ["O" as const] }, l: "Resina" },
                { rec: { condition: "corona" as const }, l: "Corona" },
              ]).map((s, i) => (
                /* Fondo entintado a propósito: el cuerpo del diente se dibuja con
                   relleno blanco y contorno azure-400 fino — sobre blanco puro el
                   estado "restaurado" se leía como un cuadradito suelto. */
                <div key={s.l} className={`flex min-w-0 flex-col items-center gap-2 bg-paper-2 py-6 ${i > 0 ? "border-l border-clinic-border" : ""}`}>
                  <span className="[&_svg]:h-16 [&_svg]:w-auto">
                    <ToothGlyph n="16" rec={s.rec} upper />
                  </span>
                  <span className="truncate px-1 font-mono text-[11px] uppercase tracking-[0.1em] text-clinic-muted">{s.l}</span>
                </div>
              ))}
            </div>
            <p className="border-t border-clinic-border px-4 py-2.5 text-[13px] leading-relaxed text-clinic-muted">
              Cinco superficies por pieza. Cada marca guarda autor y fecha.
            </p>
          </figure>
        </div>
      </section>

      {/* ===== EL PRODUCTO, A TODO EL ANCHO — no es una captura ===== */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div >
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5 border-b-2 border-clinic-text pb-3">
            <h2 className="font-display text-2xl font-extrabold tracking-[-0.025em] text-navy-800 sm:text-3xl">
              El odontograma de verdad, acá abajo
            </h2>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-azure-600">
              Tocá un diente — es interactivo
            </p>
          </div>
          {/* Sin marco propio: ShowcaseBoard ya trae el suyo. Envolverlo sería
              una tarjeta dentro de otra. */}
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
      </section>

      {/* ===== T4 · FRANJA DE CIFRAS ===== */}
      <section className="border-y border-clinic-border bg-navy-800">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-9 px-5 py-11 sm:grid-cols-4">
          {[
            { v: 32, l: "piezas FDI con morfología real" },
            { v: 5, l: "superficies marcables por pieza" },
            { v: 6, l: "estados de facturación auditados" },
            { v: 3, l: "roles con permisos estrictos" },
          ].map((x) => (
            <div key={x.l} className="border-l border-white/15 pl-4 sm:pl-5">
              <div className="font-display text-5xl font-extrabold tabular-nums tracking-tight text-white sm:text-6xl">
                {x.v}
              </div>
              <div className="mt-1.5 max-w-[17ch] text-[13px] leading-snug text-white/60">{x.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== ESPÉCIMEN DE PIEZAS ===== */}
      <section aria-hidden className="border-b border-clinic-border bg-paper-2 py-5">
        <div className="ed-specimen-mask overflow-hidden">
          <div className="ed-specimen flex w-max items-center gap-9 opacity-70">
            {[...SPECIMEN_TEETH, ...SPECIMEN_TEETH].map((t, i) => (
              <span key={i} className="flex items-center gap-9">
                <ToothGlyph n={t.n} rec={t.rec} upper />
                {i % 4 === 3 && (
                  <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-clinic-muted">FDI</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== F3 · CAPACIDADES COMO HOJA DE ESPECIFICACIONES ===== */}
      <section id="capacidades" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-20 sm:py-24">
        {/* S2 · encabezado colgado en el aire, sin filete ni etiqueta al margen */}
        <div >
          <h2 className="max-w-[16ch] font-display font-extrabold leading-[1.02] tracking-[-0.03em] text-navy-800" style={{ fontSize: "var(--text-h2)" }}>
            Ocho herramientas. Ningún módulo de relleno.
          </h2>
          <p className="mt-4 max-w-[58ch] leading-relaxed text-clinic-muted">
            Todo lo que sigue ya está construido y funcionando en la demo — no es un
            roadmap.
          </p>
        </div>

        <div className="mt-11 border-t border-clinic-border">
          {CAPACIDADES.map((c) => (
            <div
              key={c.t}
              className="group grid grid-cols-12 items-baseline gap-x-5 gap-y-1.5 border-b border-clinic-border py-6 transition-colors duration-200 hover:bg-paper-2"
            >
              <h3 className="col-span-9 font-display text-xl font-bold leading-tight tracking-[-0.015em] text-navy-800 sm:col-span-4 sm:text-[1.35rem]">
                {c.t}
              </h3>
              <span className="col-span-3 justify-self-end font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-azure-600 sm:order-last sm:col-span-2">
                {c.k}
              </span>
              <p className="col-span-12 text-[15px] leading-relaxed text-clinic-muted sm:col-span-6">
                {c.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== DÍPTICOS ALTERNADOS — cada afirmación con su prueba al lado ===== */}
      <section id="flujo" className="scroll-mt-8 border-y border-clinic-border bg-paper-2 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div >
            <h2 className="max-w-[18ch] font-display font-extrabold leading-[1.02] tracking-[-0.03em] text-navy-800" style={{ fontSize: "var(--text-h2)" }}>
              Un día en tu clínica, sin fricción.
            </h2>
          </div>

          <div className="mt-14 space-y-16">
            {/* — díptico 1: texto izquierda / prueba derecha — */}
            <div className="grid items-center gap-x-10 gap-y-7 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <h3 className="font-display font-bold leading-tight tracking-[-0.02em] text-navy-800" style={{ fontSize: "var(--text-h3)" }}>
                  La mañana arranca sola
                </h3>
                <p className="mt-3 max-w-[46ch] leading-relaxed text-clinic-muted">
                  La recepcionista abre la agenda: confirmados por WhatsApp en verde,
                  pendientes en ámbar. Un hueco a las 11:00 — clic, y la cita queda creada.
                </p>
              </div>
              <div className="ed-figure lg:col-span-7">
                <div className="flex items-center justify-between border-b border-clinic-border px-4 py-2.5">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-clinic-text">Agenda · hoy</span>
                  <span className="font-mono text-[11px] font-bold tabular-nums text-state-ok">92 % ocupación</span>
                </div>
                <div className="divide-y divide-clinic-border">
                  {[
                    ["09:00", "María González", "Resina pieza 16", "bg-state-ok"],
                    ["10:30", "Juan Ríos", "Primera consulta", "bg-state-warn"],
                    ["11:00", "Crear cita en este hueco", "", "bg-azure-500"],
                    ["11:45", "Camila Ortega", "Profilaxis", "bg-state-ok"],
                  ].map(([h, n, t, dot], idx) => (
                    <div key={idx} className={`flex items-center gap-3.5 px-4 py-3 ${t === "" ? "bg-azure-50/70" : ""}`}>
                      <span className="font-mono text-xs font-bold tabular-nums text-clinic-text">{h}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] font-bold ${t === "" ? "text-azure-700" : "text-clinic-text"}`}>{n}</span>
                        {t && <span className="block truncate text-[12px] text-clinic-muted">{t}</span>}
                      </span>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* — díptico 2: prueba izquierda / texto derecha (alterna) — */}
            <div className="grid items-center gap-x-10 gap-y-7 lg:grid-cols-12">
              <div className="order-1 lg:order-2 lg:col-span-5">
                <h3 className="font-display font-bold leading-tight tracking-[-0.02em] text-navy-800" style={{ fontSize: "var(--text-h3)" }}>
                  El hallazgo queda en la pieza
                </h3>
                <p className="mt-3 max-w-[46ch] leading-relaxed text-clinic-muted">
                  La doctora marca caries oclusal en la 16 sobre el diente mismo. Rojo es
                  pendiente, azul es resuelto. Quién, cuándo y en qué superficie: auditado.
                </p>
              </div>
              <div className="ed-figure order-2 lg:order-1 lg:col-span-7">
                <div className="flex flex-wrap items-end justify-center gap-x-8 gap-y-4 px-4 py-7">
                  {[{ n: "14" }, { n: "15" }, { n: "16", rec: { condition: "caries" as const, surfaces: ["O" as const], updatedAt: "", updatedBy: "" } }, { n: "17" }].map((t) => (
                    <div key={t.n} className="flex flex-col items-center gap-1">
                      <ToothGlyph n={t.n} rec={t.rec} upper />
                      <span className={`font-mono text-[11px] tabular-nums ${t.rec ? "font-bold text-state-err" : "text-clinic-muted"}`}>{t.n}</span>
                    </div>
                  ))}
                </div>
                <p className="border-t border-clinic-border px-4 py-2.5 text-center font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-state-err">
                  16 · caries oclusal — Dra. Benítez
                </p>
              </div>
            </div>

            {/* — díptico 3: texto izquierda / prueba derecha — */}
            <div className="grid items-center gap-x-10 gap-y-7 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <h3 className="font-display font-bold leading-tight tracking-[-0.02em] text-navy-800" style={{ fontSize: "var(--text-h3)" }}>
                  El cobro no se escapa
                </h3>
                <p className="mt-3 max-w-[46ch] leading-relaxed text-clinic-muted">
                  La asistente envía a cobro. El sistema valida los códigos, aplica la
                  retención y nada queda en el limbo: cada reclamo tiene estado e historial.
                </p>
              </div>
              <div className="ed-figure divide-y divide-clinic-border lg:col-span-7">
                {[
                  { flags: [] as string[], label: "Registro creado", sub: "Códigos CPT-DX · POS · MOD validados en vivo" },
                  { flags: ["MBILLED", "HOLD"], label: "Enviado a cobro", sub: "Retención automática del e-claim" },
                  { flags: ["FACTURADO", "ACH"], label: "Liberado y facturado", sub: "Pago automático activo" },
                ].map((s, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3.5">
                    <span className="font-mono text-xs font-bold tabular-nums text-azure-600">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold text-clinic-text">{s.label}</span>
                      <span className="block text-[12px] leading-snug text-clinic-muted">{s.sub}</span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {s.flags.length === 0
                        ? <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-clinic-muted">sin enviar</span>
                        : s.flags.map((f) => <FlagBadge key={f} flag={f as any} />)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PRECIOS ===== */}
      <section id="precios" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-20 sm:py-24">
        <div >
          <h2 className="font-display font-extrabold leading-[1.02] tracking-[-0.03em] text-navy-800" style={{ fontSize: "var(--text-h2)" }}>
            Precios claros, sin sorpresas.
          </h2>
        </div>

        {/* Tabla de planes: hairlines, no cards flotantes. */}
        <div className="mt-10 border-t-2 border-clinic-text">
          {[
            { name: "Solo", price: "$45", per: "USD / mes", blurb: "Odontólogo independiente: un sillón, odontograma, agenda y facturación.", cta: "Probar gratis" },
            { name: "Clínica", price: "$129", per: "USD / mes", blurb: "Hasta cinco sillones con todo Novudent adentro: financiamiento, formularios, consentimientos y soporte prioritario.", cta: "Probar gratis", featured: true },
            { name: "Cadena", price: "A medida", per: "", blurb: "Multi-sucursal: comisiones, laboratorio, integraciones propias y account manager.", cta: "Hablar con ventas" },
          ].map((p) => (
            <div
              key={p.name}
              className={`grid grid-cols-12 items-baseline gap-x-5 gap-y-2.5 border-b border-clinic-border py-7 ${p.featured ? "bg-azure-50/45" : ""}`}
            >
              <div className="col-span-12 sm:col-span-3">
                <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-navy-800">{p.name}</span>
                {p.featured && (
                  <span className="ml-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-azure-600">El más elegido</span>
                )}
              </div>
              <div className="col-span-6 sm:col-span-2">
                <span className="font-display text-2xl font-extrabold tabular-nums tracking-[-0.02em] text-navy-800">{p.price}</span>
                {p.per && <span className="ml-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-clinic-muted">{p.per}</span>}
              </div>
              <p className="col-span-12 text-[15px] leading-relaxed text-clinic-muted sm:col-span-5">{p.blurb}</p>
              <a
                href={appHref}
                className="ed-link ed-tap col-span-6 justify-self-end whitespace-nowrap text-sm font-bold text-azure-600 sm:col-span-2"
              >
                {p.cta} →
              </a>
            </div>
          ))}
        </div>
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-clinic-muted">
          Precios referenciales · sin contratos largos · migración de datos incluida
        </p>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="scroll-mt-8 border-t border-clinic-border bg-paper-2 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-5">
          <div >
            <h2 className="font-display font-extrabold leading-[1.02] tracking-[-0.03em] text-navy-800" style={{ fontSize: "var(--text-h2)" }}>
              Lo que todos preguntan.
            </h2>
          </div>
          <div className="mt-9 border-t border-clinic-border">
            {FAQ.map((f) => (
              <div key={f.q}>
                <details className="group border-b border-clinic-border">
                  <summary className="flex cursor-pointer list-none items-center gap-4 py-4 [&::-webkit-details-marker]:hidden">
                    <h3 className="flex-1 font-display text-lg font-bold leading-snug tracking-[-0.015em] text-navy-800">{f.q}</h3>
                    <span className="grid h-6 w-6 shrink-0 place-items-center border border-clinic-border">
                      <Plus className="h-3.5 w-3.5 text-clinic-muted transition-transform duration-200 group-open:rotate-45" />
                    </span>
                  </summary>
                  <p className="max-w-[62ch] pb-5 text-[15px] leading-relaxed text-clinic-muted">{f.a}</p>
                </details>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA FINAL — una sola acción ===== */}
      <section className="border-t border-clinic-border bg-navy-800">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <div >
            <h2 className="max-w-[15ch] font-display font-extrabold leading-[1.0] tracking-[-0.03em] text-white" style={{ fontSize: "var(--text-display-s)" }}>
              La demo está lista. Tu clínica también.
            </h2>
            <p className="mt-5 max-w-[52ch] leading-relaxed text-white/60">
              Entrás con un clic, elegís tu rol y recorrés la agenda, el odontograma y la
              facturación con datos de ejemplo.
            </p>
            <a
              href={appHref}
              className="group mt-8 inline-flex min-h-[44px] items-center gap-2 border border-white bg-white px-7 py-3 text-sm font-bold text-navy-800 transition-colors duration-200 hover:bg-azure-100"
            >
              {session ? "Ir al panel" : "Probar la demo gratis"}
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>
      </section>

      {/* ===== Ft4 · COLOFÓN ===== */}
      <footer className="border-t border-white/10 bg-navy-900 py-9">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
            <span className="font-display text-lg font-extrabold tracking-[-0.02em] text-white">NOVUdent</span>
            <a href="/login" className="ed-link ed-tap text-[13px] font-bold text-white/75 hover:text-white">Iniciar sesión →</a>
          </div>
          <p className="mt-4 max-w-[74ch] font-mono text-[11px] leading-relaxed text-white/45">
            Novudent — software de gestión para clínicas dentales. Un producto de{" "}
            <a href="https://novum-web-six.vercel.app" className="ed-link font-bold text-azure-300">NOVUM Holding</a>,
            Asunción, Paraguay. Odontograma con numeración FDI de dos dígitos. Datos
            alojados en Firebase. © {new Date().getFullYear()}, todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
