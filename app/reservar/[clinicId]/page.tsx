"use client";
/**
 * Reserva online — página PÚBLICA (sin login).
 *
 * El paciente elige fecha → profesional + horario → deja sus datos →
 * la cita entra a la agenda de la clínica como "pendiente" y, si la
 * clínica tiene Botika activo, le llega un WhatsApp para confirmar.
 *
 * Todo pasa por /api/reservas — el navegador nunca toca Firestore.
 *
 * Registro visual: el sistema editorial de la landing (components/Landing.tsx).
 * Acá manda el DEDO: la ve un paciente desde el celular, así que todo lo
 * tocable mide 44 px o más y el cuerpo va un punto más grande que en el panel.
 */
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";

type Step = "fecha" | "horario" | "datos" | "listo";

type Availability = {
  clinic: { name: string } | null;
  dentists: { id: string; name: string }[];
  slots: Record<string, string[]>;
  closed?: boolean;
  /** Anticipación mínima configurada por la clínica, en horas. La usamos solo
   *  para explicarle al paciente por qué no ve turnos; el filtro real lo hace
   *  el servidor. */
  minLeadHoras?: number;
};

/** Caja de texto editorial: esquinas rectas, filete de 1 px, 44 px de alto. */
const inputCls =
  "w-full min-h-[44px] border border-clinic-border bg-white px-3.5 py-2.5 text-[15px] text-clinic-text placeholder:text-clinic-muted/70 transition-colors focus:border-azure-600 focus:outline-none focus:ring-1 focus:ring-azure-600";

/** Rótulo de sección: la banda mono que corona cada marco. */
const capCls =
  "border-b border-clinic-border px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-clinic-text";

function fmtDay(d: Date) {
  return d.toLocaleDateString("es-PY", { weekday: "short", day: "numeric", month: "short" });
}
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ReservaOnline() {
  const { clinicId } = useParams<{ clinicId: string }>();
  const [step, setStep] = useState<Step>("fecha");
  const [date, setDate] = useState<string | null>(null);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dentistId, setDentistId] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [form, setForm] = useState({ nombre: "", apellido: "", ci: "", telefono: "", motivo: "" });
  const [booking, setBooking] = useState(false);
  const [result, setResult] = useState<{ botikaQueued: boolean } | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  // Próximos 30 días hábiles (sin domingos), paginados de a 7.
  const days = useMemo(() => {
    const out: Date[] = [];
    const d = new Date();
    for (let i = 1; out.length < 30 && i <= 45; i++) {
      const day = new Date(d);
      day.setDate(d.getDate() + i);
      if (day.getDay() !== 0) out.push(day);
    }
    return out;
  }, []);
  const visibleDays = days.slice(weekOffset * 7, weekOffset * 7 + 7);

  async function pickDate(d: string) {
    setDate(d);
    setDentistId(null);
    setTime(null);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservas?clinicId=${clinicId}&date=${d}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAvail(data);
      setStep("horario");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !dentistId || !time || booking) return;
    setBooking(true);
    setError(null);
    try {
      const res = await fetch("/api/reservas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId, dentistId, date, time, ...form }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult({ botikaQueued: !!data.botikaQueued });
      setStep("listo");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBooking(false);
    }
  }

  const dentistName = avail?.dentists.find((x) => x.id === dentistId)?.name;
  const fechaLarga = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" })
    : "";

  return (
    <main className="min-h-dvh bg-paper font-body text-clinic-text">
      {/* ===== Masthead ===== */}
      <header className="ed-rule-double bg-paper">
        <div className="mx-auto max-w-xl px-5">
          <div className="flex items-center justify-between gap-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-clinic-muted">
            <span>Reserva online</span>
            <span className="shrink-0">Novudent</span>
          </div>
          <div className="border-t border-clinic-border/70 py-5">
            <h1 className="font-display text-[1.9rem] font-extrabold leading-[1.03] tracking-[-0.03em] text-navy-800 sm:text-4xl">
              {avail?.clinic?.name || "Reservá tu cita"}
            </h1>
            <p className="mt-2 max-w-[44ch] leading-relaxed text-clinic-muted">
              Elegí día y horario — te confirmamos por WhatsApp.
            </p>
          </div>
        </div>
      </header>

      {/* Sin <Reveal> a propósito: envolvía TODO el cuerpo, y framer-motion serializa
          el `opacity:0` inicial en el HTML del servidor. Si el IntersectionObserver
          no dispara, el paciente ve la página de reservas VACÍA. Además el
          contenido está sobre el pliegue: no hay nada que revelar. */}
      <div className="mx-auto max-w-xl px-5 py-6">
        {/* ===== Pasos: tres celdas con filete, la actual entintada ===== */}
        <ol className="grid grid-cols-3 border-y border-clinic-border font-mono text-[11px] uppercase tracking-[0.14em]">
          {(["fecha", "horario", "datos"] as Step[]).map((s, i) => {
            const hecho = step === "listo" || ["fecha", "horario", "datos"].indexOf(step) > i;
            const actual = step === s;
            return (
              <li
                key={s}
                className={`flex min-h-[42px] items-center gap-2 px-3 py-2.5 ${i > 0 ? "border-l border-clinic-border" : ""} ${
                  actual ? "bg-paper-2 font-bold text-clinic-text" : hecho ? "text-state-ok" : "text-clinic-muted"
                }`}
              >
                <span className={`tabular-nums ${actual ? "font-bold text-azure-600" : ""}`}>
                  {hecho ? "✓" : `0${i + 1}`}
                </span>
                <span className="truncate">{s === "fecha" ? "Fecha" : s === "horario" ? "Horario" : "Tus datos"}</span>
              </li>
            );
          })}
        </ol>

        {error && (
          <p className="mt-4 border-l-2 border-state-err bg-state-errbg px-3.5 py-2.5 text-[13px] font-semibold leading-relaxed text-state-err">
            {error}
          </p>
        )}

        {/* ===== Paso 1: fecha ===== */}
        {step === "fecha" && (
          <section className="ed-figure mt-4">
            <div className={capCls}>Paso 01 · Fecha</div>
            <div className="p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2 className="font-display text-xl font-bold leading-tight tracking-[-0.02em] text-navy-800">
                  ¿Qué día te queda bien?
                </h2>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
                    disabled={weekOffset === 0}
                    className="grid h-11 w-11 place-items-center border border-clinic-border text-clinic-muted transition-colors hover:bg-paper-2 disabled:opacity-40 disabled:hover:bg-transparent"
                    aria-label="Días anteriores"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setWeekOffset((w) => Math.min(3, w + 1))}
                    disabled={weekOffset >= 3}
                    className="grid h-11 w-11 place-items-center border border-clinic-border text-clinic-muted transition-colors hover:bg-paper-2 disabled:opacity-40 disabled:hover:bg-transparent"
                    aria-label="Días siguientes"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {visibleDays.map((d) => {
                  const v = iso(d);
                  return (
                    <button
                      key={v}
                      onClick={() => void pickDate(v)}
                      disabled={loading}
                      className={`min-h-[56px] border px-2 py-3 text-center text-sm font-bold capitalize transition-colors duration-200 ${
                        date === v
                          ? "border-azure-600 bg-azure-50 text-azure-700"
                          : "border-clinic-border bg-white text-clinic-text hover:bg-paper-2"
                      }`}
                    >
                      {fmtDay(d)}
                    </button>
                  );
                })}
              </div>
              {loading && (
                <p className="mt-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-clinic-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando horarios…
                </p>
              )}
            </div>
          </section>
        )}

        {/* ===== Paso 2: profesional + horario ===== */}
        {step === "horario" && avail && (
          <section className="mt-4 space-y-4">
            {avail.dentists.length === 0 && (
              <p className="border-l-2 border-state-warn bg-state-warnbg px-3.5 py-2.5 text-[13px] font-semibold leading-relaxed text-state-warn">
                No hay profesionales disponibles ese día. Probá con otra fecha.
              </p>
            )}
            {/* Un solo marco: los profesionales se separan con filete, no con
                tarjetas sueltas que repetirían el rótulo del paso. */}
            {avail.dentists.length > 0 && (
              <div className="ed-figure">
                <div className={capCls}>Paso 02 · Horario</div>
                <div className="divide-y divide-clinic-border">
                  {avail.dentists.map((d) => (
                    <div key={d.id} className="p-4 sm:p-5">
                      <h2 className="font-display text-xl font-bold leading-tight tracking-[-0.02em] text-navy-800">
                        {d.name}
                      </h2>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(avail.slots[d.id] || []).slice(0, 18).map((t) => (
                          <button
                            key={t}
                            onClick={() => {
                              setDentistId(d.id);
                              setTime(t);
                              setStep("datos");
                            }}
                            className={`inline-flex min-h-[44px] min-w-[68px] items-center justify-center border px-3 font-mono text-[13px] font-bold tabular-nums transition-colors duration-200 ${
                              dentistId === d.id && time === t
                                ? "border-azure-600 bg-azure-600 text-white"
                                : "border-clinic-border bg-white text-clinic-text hover:bg-paper-2"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                        {(avail.slots[d.id] || []).length === 0 && (
                          <span className="text-[13px] leading-relaxed text-clinic-muted">
                            {avail.minLeadHoras && avail.minLeadHoras > 0
                              ? `Sin horarios disponibles. Los turnos se reservan con al menos ${avail.minLeadHoras} h de anticipación.`
                              : "Sin horarios libres este día."}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => setStep("fecha")}
              className="ed-link ed-tap inline-flex items-center gap-1.5 text-sm font-bold text-azure-600"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Cambiar fecha
            </button>
          </section>
        )}

        {/* ===== Paso 3: datos ===== */}
        {step === "datos" && (
          <section className="ed-figure mt-4">
            <div className={capCls}>Paso 03 · Tus datos</div>
            <div className="p-4 sm:p-5">
              {/* La cita elegida, en el renglón de datos duros */}
              <p className="border-b border-clinic-border pb-4 font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-clinic-text">
                <span className="text-azure-600">{fechaLarga}</span>
                <br />
                {time} hs · {dentistName}
              </p>
              <form className="mt-4 space-y-3" onSubmit={submit}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input required className={inputCls} placeholder="Nombre" value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })} maxLength={60} />
                  <input required className={inputCls} placeholder="Apellido" value={form.apellido}
                    onChange={(e) => setForm({ ...form, apellido: e.target.value })} maxLength={60} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input required className={inputCls} placeholder="Cédula (CI)" inputMode="numeric" value={form.ci}
                    onChange={(e) => setForm({ ...form, ci: e.target.value })} maxLength={15} />
                  <input required className={inputCls} placeholder="WhatsApp (09xx xxx xxx)" inputMode="tel" value={form.telefono}
                    onChange={(e) => setForm({ ...form, telefono: e.target.value })} maxLength={25} />
                </div>
                <input className={inputCls} placeholder="Motivo (opcional): limpieza, dolor, consulta…" value={form.motivo}
                  onChange={(e) => setForm({ ...form, motivo: e.target.value })} maxLength={140} />
                <button type="submit" disabled={booking}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 border border-navy-800 bg-navy-800 px-6 py-3 text-sm font-bold text-white transition-colors duration-200 hover:bg-navy-700 disabled:cursor-not-allowed disabled:border-clinic-border disabled:bg-clinic-border disabled:text-clinic-muted">
                  {booking && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirmar reserva
                </button>
                <div className="pt-1">
                  <button type="button" onClick={() => setStep("horario")}
                    className="ed-link ed-tap inline-flex items-center gap-1.5 text-sm font-bold text-azure-600">
                    <ChevronLeft className="h-3.5 w-3.5" /> Cambiar horario
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {/* ===== Listo ===== */}
        {step === "listo" && (
          <section className="ed-figure mt-4">
            <div className={capCls}>Reserva registrada</div>
            <div className="p-6 sm:p-8">
              <CheckCircle2 className="h-9 w-9 text-state-ok" />
              <h2 className="mt-4 font-display text-2xl font-extrabold leading-tight tracking-[-0.025em] text-navy-800">
                ¡Reserva recibida!
              </h2>
              <p className="mt-2 max-w-[42ch] leading-relaxed text-clinic-muted">
                {fechaLarga} a las {time} hs con {dentistName}.
              </p>
              {result?.botikaQueued ? (
                <p className="mt-5 border-t border-clinic-border pt-4 font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-clinic-text">
                  En breve te llega un WhatsApp para confirmar tu asistencia.
                </p>
              ) : (
                <p className="mt-5 border-t border-clinic-border pt-4 font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-clinic-muted">
                  La clínica revisará tu reserva y te contactará para confirmar.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
