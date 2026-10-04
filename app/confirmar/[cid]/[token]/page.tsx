"use client";
/* OJO: igual que /firmar, esta página NO usa <Reveal>/<Stagger>: si el
   IntersectionObserver no dispara, framer-motion deja el contenido en opacity:0 y el
   paciente no ve nada. */
/**
 * Confirmación de cita — página PÚBLICA (sin login, sin Shell). Paridad con la
 * «Confirmación de cita» de Dentalink: el paciente abre el link que le llegó por
 * WhatsApp o por correo y confirma o anula. Todo pasa por /api/citas/confirmar: el
 * navegador nunca toca Firestore y el `token` ES la credencial.
 */
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CalendarCheck2, CalendarX2, CheckCircle2, Loader2, ShieldAlert, Phone } from "lucide-react";
import { Logotipo } from "@/components/Marca";

type Cita = {
  clinica: string;
  telefono: string;
  zonaHoraria: string;
  profesional: string;
  sucursal: string;
  inicio: string;
  fin: string;
  paciente: string;
  estado: string;
  puedeResponder: boolean;
};

export default function ConfirmarCita() {
  const { cid, token } = useParams<{ cid: string; token: string }>();
  const v = useSearchParams().get("v") ?? "";
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cita, setCita] = useState<Cita | null>(null);
  const [enviando, setEnviando] = useState<"confirmar" | "anular" | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [resultado, setResultado] = useState<"confirmada" | "anulada" | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/citas/confirmar?cid=${encodeURIComponent(cid)}&token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (!res.ok || !data.ok) {
          setCita(null);
          if (res.status !== 404) setError(data.error || `HTTP ${res.status}`);
        } else {
          setCita(data as Cita);
        }
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [cid, token]);

  async function responder(accion: "confirmar" | "anular") {
    if (enviando) return;
    if (accion === "anular" && !window.confirm("¿Seguro que querés anular tu cita? Para volver a agendar vas a tener que comunicarte con la clínica.")) return;
    setEnviando(accion);
    setErrorEnvio(null);
    try {
      const res = await fetch("/api/citas/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cid, token, accion, v }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResultado(data.resultado === "anulada" ? "anulada" : "confirmada");
    } catch (e) {
      setErrorEnvio(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(null);
    }
  }

  const tz = cita?.zonaHoraria || "America/Asuncion";
  const fecha = cita ? new Date(cita.inicio).toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz }) : "";
  const hora = cita ? new Date(cita.inicio).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }) : "";

  return (
    <main className="min-h-dvh bg-clinic-bg">
      <header className="bg-navy-800 px-5 py-6 text-white">
        <div className="mx-auto max-w-lg">
          <Logotipo tono="blanco" className="mb-4 h-8 w-auto" />
          <h1 className="text-xl font-bold">Confirmación de cita</h1>
          {cita && <p className="mt-1 text-sm text-white/70">{cita.clinica}</p>}
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-4 px-5 py-6 text-[14px] text-clinic-text">
        {cargando && (
          <section className="rounded border border-clinic-border bg-white p-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-azure-500" />
            <p className="mt-3 text-clinic-muted">Cargando tu cita…</p>
          </section>
        )}

        {!cargando && error && (
          <section className="rounded border border-clinic-border bg-white p-8 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
            <h2 className="mt-3 text-[16px] font-bold">No se pudo cargar</h2>
            <p className="mx-auto mt-2 max-w-sm text-clinic-muted">{error}</p>
          </section>
        )}

        {!cargando && !error && !cita && (
          <section className="rounded border border-clinic-border bg-white p-8 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-clinic-muted" />
            <h2 className="mt-3 text-[16px] font-bold">Link no disponible</h2>
            <p className="mx-auto mt-2 max-w-sm text-clinic-muted">Este link ya no está disponible. Si necesitás algo de tu cita, comunicate con la clínica.</p>
          </section>
        )}

        {cita && resultado && (
          <section className="rounded border border-clinic-border bg-white p-8 text-center">
            {resultado === "confirmada"
              ? <CheckCircle2 className="mx-auto h-12 w-12 text-state-ok" />
              : <CalendarX2 className="mx-auto h-12 w-12 text-state-err" />}
            <h2 className="mt-3 text-[18px] font-bold">{resultado === "confirmada" ? "¡Listo! Tu cita está confirmada" : "Tu cita quedó anulada"}</h2>
            <p className="mx-auto mt-2 max-w-sm text-clinic-muted">
              {resultado === "confirmada"
                ? `Te esperamos el ${fecha} a las ${hora}. Ya podés cerrar esta página.`
                : "Avisamos a la clínica. Si querés otro horario, comunicate con ellos."}
            </p>
          </section>
        )}

        {cita && !resultado && (
          <>
            <section className="rounded border border-clinic-border bg-white p-5">
              {cita.paciente && <p className="mb-3">Hola {cita.paciente}, estos son los datos de tu cita:</p>}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Dato label="Fecha" valor={fecha} ancho />
                <Dato label="Hora" valor={hora} />
                {cita.profesional && <Dato label="Profesional" valor={cita.profesional} />}
                {cita.sucursal && <Dato label="Sucursal" valor={cita.sucursal} />}
                <Dato label="Estado" valor={cita.estado === "confirmada" ? "Confirmada" : cita.estado === "cancelada" ? "Anulada" : cita.estado === "pendiente" ? "Sin confirmar" : "Cerrada"} />
              </dl>
            </section>

            {cita.puedeResponder ? (
              <section className="space-y-3 rounded border border-clinic-border bg-white p-5">
                {errorEnvio && <p role="alert" className="rounded bg-state-errbg px-3 py-2 text-[13px] font-semibold text-state-err">{errorEnvio}</p>}
                <div className="grid gap-2 sm:grid-cols-2">
                  {cita.estado !== "confirmada" ? (
                    <button type="button" onClick={() => void responder("confirmar")} disabled={!!enviando}
                      className="inline-flex items-center justify-center gap-2 rounded bg-azure-600 px-4 py-3 font-bold text-white transition-colors hover:bg-azure-700 disabled:opacity-60">
                      {enviando === "confirmar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck2 className="h-4 w-4" />} Confirmar cita
                    </button>
                  ) : (
                    <div className="inline-flex items-center justify-center gap-2 rounded bg-state-okbg px-4 py-3 font-bold text-state-ok"><CheckCircle2 className="h-4 w-4" /> Ya está confirmada</div>
                  )}
                  <button type="button" onClick={() => void responder("anular")} disabled={!!enviando}
                    className="inline-flex items-center justify-center gap-2 rounded border border-state-err px-4 py-3 font-bold text-state-err transition-colors hover:bg-state-errbg disabled:opacity-60">
                    {enviando === "anular" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarX2 className="h-4 w-4" />} Anular cita
                  </button>
                </div>
                <p className="text-center text-[13px] text-clinic-muted">Para cambiar el horario, anulá la cita y comunicate con la clínica.</p>
              </section>
            ) : (
              <section className="rounded border border-clinic-border bg-white p-5 text-center text-clinic-muted">
                Esta cita ya no se puede confirmar ni anular desde acá.
              </section>
            )}

            {cita.telefono && (
              <a href={`tel:${cita.telefono.replace(/[^\d+]/g, "")}`} className="flex items-center justify-center gap-2 text-[13px] font-semibold text-azure-700 hover:underline">
                <Phone className="h-4 w-4" /> {cita.clinica}: {cita.telefono}
              </a>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Dato({ label, valor, ancho }: { label: string; valor: string; ancho?: boolean }) {
  return (
    <div className={ancho ? "col-span-2" : ""}>
      <dt className="text-[13px] font-semibold text-clinic-muted">{label}</dt>
      <dd className="font-semibold first-letter:uppercase">{valor}</dd>
    </div>
  );
}
