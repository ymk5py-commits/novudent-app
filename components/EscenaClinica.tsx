/**
 * Escena clínica animada — "De la silla dental a la app".
 *
 * DOS PANELES CON UN SOLO RELOJ (14s, loop):
 *   · Izquierda: escena SVG del consultorio (line-art, identidad several.).
 *     El dentista atiende: el brazo trabaja, el faro pulsa y a los 30s% un
 *     destello marca el tratamiento listo.
 *   · Derecha: mockup de la app donde un cursor simulado repite el día:
 *     agenda el hueco (12%), marca la caries en la 16 (34%), la deja
 *     restaurada (47%) y manda el cobro (59%).
 *
 * La sincronía es por PORCENTAJE de una misma duración — no hay JS, ni
 * observers, ni estados: si el CSS no corre o hay prefers-reduced-motion,
 * cada pieza muestra su estado BASE, que es la foto del "después" (cita
 * confirmada, pieza restaurada, cobro facturado). El cursor y el velo de
 * corte son lo único que desaparece sin animación, y son decoración.
 *
 * El diente 16 del mockup son TRES ToothGlyph superpuestos (limpia / caries /
 * restaurado) que se cruzan con opacity: reutiliza el diente real del
 * odontograma en vez de inventar otro dibujo.
 */
import { ToothGlyph } from "./OdontogramShowcase";

/* ---------- escena SVG del consultorio ---------- */

function EscenaConsultorio() {
  return (
    <svg viewBox="0 0 560 420" className="h-auto w-full" aria-hidden>
      {/* piso */}
      <line x1="24" y1="356" x2="536" y2="356" className="stroke-sv-line" strokeWidth="2" strokeLinecap="round" />

      {/* signos + flotando (ritmo propio, desacoplado del loop maestro) */}
      {[
        { x: 428, y: 96, t: "7s", d: "0s", s: 1 },
        { x: 486, y: 190, t: "8.5s", d: "1.4s", s: 0.75 },
        { x: 402, y: 268, t: "6.2s", d: "0.7s", s: 0.6 },
      ].map((p, i) => (
        <g key={i} className="esc-plus" style={{ ["--plus-t" as string]: p.t, ["--plus-d" as string]: p.d }} transform={`translate(${p.x} ${p.y}) scale(${p.s})`}>
          <line x1="-9" y1="0" x2="9" y2="0" className="stroke-sv-mint" strokeWidth="3" strokeLinecap="round" />
          <line x1="0" y1="-9" x2="0" y2="9" className="stroke-sv-mint" strokeWidth="3" strokeLinecap="round" />
        </g>
      ))}

      {/* faro dental: brazo + cabeza + cono de luz */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1="300" y1="34" x2="300" y2="52" className="stroke-slate-300" strokeWidth="3" />
        <path d="M300 52 C 268 62, 240 74, 228 96" className="stroke-slate-300" strokeWidth="3" />
        <rect x="210" y="94" width="36" height="16" rx="8" transform="rotate(28 228 102)" className="fill-white stroke-slate-300" strokeWidth="2.5" />
        {/* cono de luz hacia la boca del paciente */}
        <polygon points="216,116 148,204 196,214" className="esc-luz fill-sv-mint" stroke="none" />
      </g>

      {/* sillón dental */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="272" cy="352" rx="54" ry="7" className="fill-sv-paper2 stroke-sv-line" strokeWidth="2" />
        <line x1="272" y1="348" x2="272" y2="318" className="stroke-slate-300" strokeWidth="8" />
        {/* asiento */}
        <path d="M238 318 L348 314" className="stroke-sv-ink" strokeWidth="15" />
        {/* respaldo reclinado */}
        <path d="M242 316 L156 234" className="stroke-sv-ink" strokeWidth="15" />
        {/* reposacabezas */}
        <circle cx="146" cy="224" r="11" className="fill-white stroke-sv-ink" strokeWidth="4" />
      </g>

      {/* paciente */}
      <g strokeLinecap="round" strokeLinejoin="round">
        {/* cuerpo sobre el respaldo */}
        <path d="M158 232 L292 300" className="stroke-slate-300" strokeWidth="34" fill="none" />
        {/* manta menta sobre el cuerpo */}
        <path d="M176 242 L282 296" className="stroke-sv-mint/35" strokeWidth="8" fill="none" />
        {/* piernas */}
        <path d="M292 300 L338 310 L330 344" className="stroke-slate-300" strokeWidth="20" fill="none" />
        {/* cabeza */}
        <circle cx="140" cy="212" r="16" className="fill-white stroke-sv-ink" strokeWidth="3.5" />
        {/* boca abierta */}
        <path d="M152 216 q5 4 10 1" className="stroke-sv-ink" strokeWidth="2.5" fill="none" />
        {/* pelo */}
        <path d="M128 204 q6 -12 20 -8" className="stroke-sv-ink" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>

      {/* destello de tratamiento listo (30% del loop) */}
      <g className="esc-sparkle">
        <line x1="158" y1="200" x2="158" y2="224" className="stroke-sv-mint" strokeWidth="3.5" strokeLinecap="round" />
        <line x1="146" y1="212" x2="170" y2="212" className="stroke-sv-mint" strokeWidth="3.5" strokeLinecap="round" />
      </g>

      {/* dentista */}
      <g strokeLinecap="round" strokeLinejoin="round">
        {/* piernas */}
        <path d="M70 238 L60 348" className="stroke-sv-ink" strokeWidth="10" fill="none" />
        <path d="M70 238 L88 348" className="stroke-sv-ink" strokeWidth="10" fill="none" />
        {/* torso */}
        <path d="M74 164 L70 240" className="stroke-slate-300" strokeWidth="24" fill="none" />
        {/* cabeza + gorro + barbijo */}
        <circle cx="76" cy="146" r="14" className="fill-white stroke-sv-ink" strokeWidth="3.5" />
        <path d="M63 139 q13 -11 26 0" className="stroke-sv-mintInk" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M66 152 q10 8 20 0" className="fill-sv-mint/25 stroke-sv-mintInk" strokeWidth="2" />
        {/* brazo de apoyo (succión, quieto) */}
        <path d="M78 176 L102 198 L114 212" className="stroke-slate-300" strokeWidth="8" fill="none" />
        {/* brazo de trabajo (grupo animado) */}
        <g className="esc-brazo">
          <path d="M74 172 L106 190 L138 205" className="stroke-sv-ink" strokeWidth="8" fill="none" />
          {/* instrumento: espejo */}
          <line x1="138" y1="205" x2="154" y2="212" className="stroke-sv-ink" strokeWidth="4" />
          <circle cx="158" cy="214" r="5" className="fill-sv-mint stroke-sv-ink" strokeWidth="2.5" />
        </g>
      </g>
    </svg>
  );
}

/* ---------- mockup de la app ---------- */

function FilaAgenda({ hora, nombre, nota, dot }: { hora: string; nombre: string; nota: string; dot: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-sv-paper2 px-4 py-2.5">
      <span className="text-[12.5px] font-medium tabular-nums text-sv-ink">{hora}</span>
      <span className="flex-1">
        <span className="block text-[13px] font-medium leading-tight text-sv-ink">{nombre}</span>
        {nota && <span className="block text-[12px] font-light leading-tight text-sv-muted">{nota}</span>}
      </span>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
    </div>
  );
}

function MockupApp() {
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-sv-line bg-white p-5 shadow-card sm:p-6">
      {/* velo de corte del loop */}
      <div className="esc-veil absolute inset-0 z-20 bg-white" />

      {/* encabezado */}
      <div className="flex items-center justify-between border-b border-sv-line/70 pb-3">
        <span className="font-logo text-[15px] font-light tracking-[0.14em] text-sv-ink">
          NOVUdent<span className="text-sv-mintInk">.</span>
        </span>
        <span className="text-[10.5px] uppercase tracking-[0.18em] text-sv-muted">Agenda · hoy</span>
      </div>

      {/* agenda */}
      <div className="mt-4 space-y-2">
        <FilaAgenda hora="09:00" nombre="María González" nota="Resina pieza 16" dot="bg-sv-mintInk" />
        <FilaAgenda hora="10:30" nombre="Juan Ríos" nota="Primera consulta" dot="bg-amber-500" />
        {/* el hueco que se convierte en cita: dos capas cruzadas por opacity */}
        <div className="relative">
          <div className="esc-cita-hueco flex items-center gap-3 rounded-xl border border-dashed border-sv-mintInk/40 bg-sv-mint/10 px-4 py-2.5">
            <span className="text-[12.5px] font-medium tabular-nums text-sv-mintInk">11:00</span>
            <span className="text-[13px] font-medium text-sv-mintInk">+ Crear cita en este hueco</span>
          </div>
          <div className="esc-cita absolute inset-0 flex items-center gap-3 rounded-xl bg-sv-ink px-4 py-2.5">
            <span className="text-[12.5px] font-medium tabular-nums text-sv-mint">11:00</span>
            <span className="flex-1">
              <span className="block text-[13px] font-medium leading-tight text-white">Camila Ortega</span>
              <span className="block text-[12px] font-light leading-tight text-white/60">Confirmada por WhatsApp</span>
            </span>
            <span className="h-2 w-2 rounded-full bg-sv-mint" />
          </div>
        </div>
      </div>

      {/* odontograma mini — la pieza 16 es la protagonista */}
      <div className="mt-5 rounded-xl bg-sv-paper2 px-4 pb-3 pt-4">
        <div className="flex items-end justify-center gap-4 sm:gap-5">
          {[
            { n: "14", rec: undefined, layers: false },
            { n: "15", rec: undefined, layers: false },
            { n: "16", layers: true },
            { n: "17", rec: undefined, layers: false },
          ].map((t) => (
            <div key={t.n} className="flex flex-col items-center gap-1">
              <div className="relative h-14 w-8 sm:h-16 sm:w-9">
                {t.layers ? (
                  <>
                    <span className="esc-t-clean absolute inset-0"><ToothGlyph n="16" upper /></span>
                    <span className="esc-t-caries absolute inset-0"><ToothGlyph n="16" rec={{ condition: "caries", surfaces: ["O"] }} upper /></span>
                    <span className="esc-t-rest absolute inset-0"><ToothGlyph n="16" rec={{ condition: "restaurado" }} upper /></span>
                  </>
                ) : (
                  <ToothGlyph n={t.n} rec={t.rec} upper />
                )}
              </div>
              <span className={`text-[11.5px] tabular-nums ${t.layers ? "font-medium text-sv-mintInk" : "font-light text-sv-muted"}`}>{t.n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* cobro */}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-sv-paper2 px-4 py-3">
        <span className="flex items-center gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white font-logo text-[12px] font-light text-sv-mintInk">3</span>
          <span>
            <span className="block text-[13px] font-medium leading-tight text-sv-ink">Envío a cobro · Resina 16</span>
            <span className="block text-[12px] font-light leading-tight text-sv-muted">CPT-DX validado en vivo</span>
          </span>
        </span>
        <span className="relative h-6 w-24 shrink-0">
          <span className="esc-badge-hold absolute inset-0 grid place-items-center rounded-full bg-white px-2.5 text-[10.5px] font-medium uppercase tracking-wide text-amber-600 ring-1 ring-amber-200">Hold</span>
          <span className="esc-badge-ok absolute inset-0 grid place-items-center rounded-full bg-sv-mint px-2.5 text-[10.5px] font-medium uppercase tracking-wide text-sv-ink">Facturado</span>
        </span>
      </div>

      {/* cursor simulado */}
      <div className="esc-cursor absolute left-0 top-0 z-10 h-5 w-5" aria-hidden>
        <span className="absolute inset-0 rounded-full bg-sv-mint/30" />
        <span className="absolute inset-[5px] rounded-full bg-sv-mint ring-2 ring-white" />
      </div>
    </div>
  );
}

/* ---------- bloque completo ---------- */

export default function EscenaClinica() {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-6">
      {/* escena */}
      <div className="lg:col-span-5">
        <div className="rounded-[1.5rem] border border-sv-line bg-white p-5 shadow-card sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10.5px] uppercase tracking-[0.18em] text-sv-muted">En el consultorio</span>
            <span className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.18em] text-sv-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-sv-mint" /> tratamiento en curso
            </span>
          </div>
          <EscenaConsultorio />
        </div>
      </div>

      {/* conector (desktop: horizontal · móvil: vertical) */}
      <div className="flex items-center justify-center lg:col-span-1" aria-hidden>
        <div className="flex rotate-90 gap-1 text-sv-mintInk lg:rotate-0">
          {[0, 1, 2].map((i) => (
            <svg key={i} viewBox="0 0 12 16" className="esc-chev h-4 w-3">
              <path d="M3 2 L9 8 L3 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ))}
        </div>
      </div>

      {/* app */}
      <div className="lg:col-span-6">
        <MockupApp />
      </div>
    </div>
  );
}
