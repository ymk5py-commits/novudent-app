"use client";
/**
 * Reserva online — página PÚBLICA (sin login).
 *
 * El paciente elige fecha → profesional + horario → deja sus datos →
 * la cita entra a la agenda de la clínica como "pendiente" y, si la
 * clínica tiene Botika activo, le llega un WhatsApp para confirmar.
 *
 * Todo pasa por /api/reservas — el navegador nunca toca Firestore.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, User, CheckCircle2,
  Loader2, Stethoscope, MessageCircle,
} from "lucide-react";
import { Reveal } from "@/components/motion";

type Step = "fecha" | "horario" | "datos" | "listo";

type Availability = {
  clinic: { name: string } | null;
  dentists: { id: string; name: string }[];
  slots: Record<string, string[]>;
  closed?: boolean;
};

const inputCls =
  "w-full rounded-xl border border-clinic-border bg-white px-3.5 py-2.5 text-sm text-clinic-text transition focus:border-azure-600 focus:ring-2 focus:ring-azure-100";

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

  return (
    <main className="min-h-dvh bg-clinic-bg">
      {/* Header público */}
      <header className="bg-navy-800 px-5 py-6 text-white">
        <Reveal y={0} className="mx-auto max-w-xl">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-azure-200">
            Reserva online
          </p>
          <h1 className="mt-1 text-2xl font-extrabold">
            {avail?.clinic?.name || "Reservá tu cita"}
          </h1>
          <p className="mt-1 text-sm text-white/65">
            Elegí día y horario — te confirmamos por WhatsApp.
          </p>
        </Reveal>
      </header>

      <div className="mx-auto max-w-xl space-y-4 px-5 py-6">
        {/* Pasos */}
        <ol className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
          {(["fecha", "horario", "datos"] as Step[]).map((s, i) => (
            <li
              key={s}
              className={`flex items-center gap-1.5 ${step === s ? "text-azure-700" : ""} ${
                (step === "listo" || (["fecha", "horario", "datos"].indexOf(step) > i)) ? "text-state-ok" : ""
              }`}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] shadow-sm">
                {i + 1}
              </span>
              {s === "fecha" ? "Fecha" : s === "horario" ? "Horario" : "Tus datos"}
              {i < 2 && <ChevronRight className="h-3 w-3 text-clinic-border" />}
            </li>
          ))}
        </ol>

        {error && (
          <p className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold text-state-err">
            {error}
          </p>
        )}

        {/* ===== Paso 1: fecha ===== */}
        {step === "fecha" && (
          <Reveal>
          <section className="rounded-3xl bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-extrabold text-clinic-text">
                <CalendarDays className="h-4 w-4 text-azure-600" /> ¿Qué día te queda bien?
              </h2>
              <div className="flex gap-1">
                <button
                  onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
                  disabled={weekOffset === 0}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-clinic-border text-clinic-muted disabled:opacity-40"
                  aria-label="Días anteriores"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setWeekOffset((w) => Math.min(3, w + 1))}
                  disabled={weekOffset >= 3}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-clinic-border text-clinic-muted disabled:opacity-40"
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
                    className={`rounded-xl border px-2 py-3 text-center text-sm font-bold capitalize transition ${
                      date === v
                        ? "border-azure-500 bg-azure-50 text-azure-700"
                        : "border-clinic-border bg-white text-clinic-text hover:border-azure-300"
                    }`}
                  >
                    {fmtDay(d)}
                  </button>
                );
              })}
            </div>
            {loading && (
              <p className="mt-3 flex items-center gap-2 text-xs text-clinic-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando horarios…
              </p>
            )}
          </section>
          </Reveal>
        )}

        {/* ===== Paso 2: profesional + horario ===== */}
        {step === "horario" && avail && (
          <Reveal>
          <section className="space-y-4">
            {avail.dentists.length === 0 && (
              <p className="rounded-xl bg-state-warnbg px-3.5 py-2.5 text-xs font-semibold text-state-warn">
                No hay profesionales disponibles ese día. Probá con otra fecha.
              </p>
            )}
            {avail.dentists.map((d) => (
              <div key={d.id} className="rounded-3xl bg-white p-5 shadow-card">
                <h3 className="flex items-center gap-2 font-extrabold text-clinic-text">
                  <Stethoscope className="h-4 w-4 text-azure-600" /> {d.name}
                </h3>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(avail.slots[d.id] || []).slice(0, 18).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setDentistId(d.id);
                        setTime(t);
                        setStep("datos");
                      }}
                      className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-bold transition ${
                        dentistId === d.id && time === t
                          ? "border-azure-500 bg-azure-600 text-white"
                          : "border-clinic-border text-clinic-text hover:border-azure-400 hover:bg-azure-50"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                  {(avail.slots[d.id] || []).length === 0 && (
                    <span className="text-xs text-clinic-muted">Sin horarios libres este día.</span>
                  )}
                </div>
              </div>
            ))}
            <button
              onClick={() => setStep("fecha")}
              className="inline-flex items-center gap-1 text-xs font-bold text-azure-700 hover:underline"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Cambiar fecha
            </button>
          </section>
          </Reveal>
        )}

        {/* ===== Paso 3: datos ===== */}
        {step === "datos" && (
          <Reveal>
          <section className="rounded-3xl bg-white p-5 shadow-card">
            <p className="mb-4 flex items-center gap-2 rounded-xl bg-azure-50 px-3.5 py-2.5 text-xs font-semibold text-azure-700">
              <Clock className="h-4 w-4" />
              {new Date(`${date}T00:00:00`).toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" })} · {time} hs · {dentistName}
            </p>
            <form className="space-y-3" onSubmit={submit}>
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
              <div className="flex items-center justify-between gap-3 pt-1">
                <button type="button" onClick={() => setStep("horario")}
                  className="inline-flex items-center gap-1 text-xs font-bold text-azure-700 hover:underline">
                  <ChevronLeft className="h-3.5 w-3.5" /> Cambiar horario
                </button>
                <button type="submit" disabled={booking}
                  className="btn-shine inline-flex items-center gap-2 rounded-xl bg-azure-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-azure-700 disabled:opacity-60">
                  {booking ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
                  Confirmar reserva
                </button>
              </div>
            </form>
          </section>
          </Reveal>
        )}

        {/* ===== Listo ===== */}
        {step === "listo" && (
          <Reveal>
          <section className="rounded-3xl bg-white p-8 text-center shadow-card">
            <CheckCircle2 className="mx-auto h-12 w-12 text-state-ok" />
            <h2 className="mt-3 text-xl font-extrabold text-clinic-text">¡Reserva recibida!</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-clinic-muted">
              {new Date(`${date}T00:00:00`).toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" })} a las {time} hs con {dentistName}.
            </p>
            {result?.botikaQueued ? (
              <p className="mx-auto mt-3 flex max-w-sm items-center justify-center gap-2 rounded-xl bg-azure-50 px-3.5 py-2.5 text-xs font-semibold text-azure-700">
                <MessageCircle className="h-4 w-4" />
                En breve te llega un WhatsApp para confirmar tu asistencia.
              </p>
            ) : (
              <p className="mt-3 text-xs text-clinic-muted">
                La clínica revisará tu reserva y te contactará para confirmar.
              </p>
            )}
          </section>
          </Reveal>
        )}
      </div>
    </main>
  );
}
