"use client";
/** Formulario para pedir una demo — la única puerta de entrada comercial.
 *
 *  Manda a `/api/contacto`, que es pública pero escribe a UNA sola dirección
 *  fija (la del dueño), nunca a una que elija el visitante.
 *
 *  Valida en el navegador ANTES de enviar: /api/contacto acepta 5 pedidos por
 *  hora por IP, y antes cada envío vacío o con el email mal escrito gastaba un
 *  intento. Quien se equivocaba cinco veces quedaba una hora sin poder dejar sus
 *  datos. El servidor sigue validando igual: esto es para la persona, no la
 *  defensa.
 *
 *  Sin animación de entrada: si el formulario no se ve, no hay negocio. */
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { PLANES, type PlanPublicoId } from "@/lib/landing/precios";

type Estado = { fase: "listo" } | { fase: "enviando" } | { fase: "ok" } | { fase: "error"; msg: string };
type Errores = Partial<Record<"nombre" | "email", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validar(fd: FormData): Errores {
  const e: Errores = {};
  const nombre = String(fd.get("nombre") || "").trim();
  const email = String(fd.get("email") || "").trim();
  if (!nombre) e.nombre = "Escribí tu nombre y apellido.";
  if (!email) e.email = "Escribí tu email para poder responderte.";
  else if (!EMAIL.test(email)) e.email = "Revisá el email: parece que le falta algo (por ejemplo, nombre@clinica.com).";
  return e;
}

const campo =
  "block w-full min-h-[44px] rounded-[var(--lp-radius-input)] border border-lp-rule2 bg-lp-surface px-3.5 py-2.5 text-[16px] text-lp-ink " +
  "placeholder:text-lp-neutral transition-colors duration-150 hover:border-lp-muted " +
  "aria-[invalid=true]:border-lp-alert aria-[invalid=true]:bg-lp-alertwash";
const etiqueta = "mb-1.5 block text-[14px] font-semibold text-lp-ink";

export default function SolicitarAcceso({ id = "acceso" }: { id?: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "listo" });
  const [errores, setErrores] = useState<Errores>({});
  const [plan, setPlan] = useState<PlanPublicoId | "">("");
  const form = useRef<HTMLFormElement>(null);

  /* /acceso?plan=clinica llega desde los botones de precios y de "¿Cómo es tu clínica?". */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("plan");
    if (p && PLANES.some((x) => x.id === p)) setPlan(p as PlanPublicoId);
  }, []);

  if (estado.fase === "ok") {
    return (
      <div id={id} role="status" className="scroll-mt-24 rounded-[var(--lp-radius-card)] border border-lp-rule bg-lp-paper p-8 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-lp-accentwash text-lp-accentink">
          <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </span>
        <h3 className="mt-4 text-[24px] font-bold text-lp-ink">Recibimos tu pedido</h3>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-lp-muted">
          Te escribimos dentro de las próximas 24 horas hábiles para coordinar la demo.
        </p>
      </div>
    );
  }

  const enviando = estado.fase === "enviando";
  const limpiarError = (k: keyof Errores) => errores[k] && setErrores((prev) => ({ ...prev, [k]: undefined }));

  return (
    <form
      ref={form}
      id={id}
      noValidate
      aria-labelledby={`${id}-titulo`}
      className="relative scroll-mt-24 rounded-[var(--lp-radius-card)] border border-lp-rule bg-lp-paper p-6 [box-shadow:var(--lp-shadow-whisper)] sm:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        if (enviando) return;
        const fd = new FormData(e.currentTarget);
        const errs = validar(fd);
        setErrores(errs);
        const primero = (["nombre", "email"] as const).find((k) => errs[k]);
        if (primero) {
          e.currentTarget.querySelector<HTMLElement>(`[name="${primero}"]`)?.focus();
          return;
        }
        setEstado({ fase: "enviando" });
        try {
          const r = await fetch("/api/contacto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(fd)),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || !d.ok) throw new Error(d.error || "No pudimos enviar tu pedido.");
          setEstado({ fase: "ok" });
        } catch (err) {
          setEstado({ fase: "error", msg: err instanceof Error ? err.message : "No pudimos enviar tu pedido." });
        }
      }}
    >
      <h3 id={`${id}-titulo`} className="text-[24px] font-bold text-lp-ink sm:text-[28px]">Pedí tu demo</h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-lp-muted">
        Dejanos tus datos y te mostramos Novudent funcionando. Los campos con * son obligatorios.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-nombre`} className={etiqueta}>Nombre y apellido *</label>
          <input
            id={`${id}-nombre`} name="nombre" required autoComplete="name" className={campo} placeholder="Dra. María González"
            aria-invalid={!!errores.nombre} aria-describedby={errores.nombre ? `${id}-nombre-error` : undefined}
            onInput={() => limpiarError("nombre")}
          />
          {errores.nombre && <p id={`${id}-nombre-error`} className="mt-1.5 text-[13px] font-semibold text-lp-alert">{errores.nombre}</p>}
        </div>
        <div>
          <label htmlFor={`${id}-clinica`} className={etiqueta}>Clínica</label>
          <input id={`${id}-clinica`} name="clinica" autoComplete="organization" className={campo} placeholder="Consultorio Céntrico" />
        </div>
        <div>
          <label htmlFor={`${id}-email`} className={etiqueta}>Email *</label>
          <input
            id={`${id}-email`} name="email" type="email" inputMode="email" required autoComplete="email" className={campo} placeholder="vos@tuclinica.com"
            aria-invalid={!!errores.email} aria-describedby={errores.email ? `${id}-email-error` : undefined}
            onInput={() => limpiarError("email")}
          />
          {errores.email && <p id={`${id}-email-error`} className="mt-1.5 text-[13px] font-semibold text-lp-alert">{errores.email}</p>}
        </div>
        <div>
          <label htmlFor={`${id}-telefono`} className={etiqueta}>WhatsApp</label>
          <input id={`${id}-telefono`} name="telefono" type="tel" inputMode="tel" autoComplete="tel" className={campo} placeholder="+595 9xx xxx xxx" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-plan`} className={etiqueta}>Plan que te interesa</label>
          <select id={`${id}-plan`} name="plan" className={campo} value={plan} onChange={(e) => setPlan(e.target.value as PlanPublicoId | "")}>
            <option value="">Todavía no sé</option>
            {PLANES.map((p) => (
              <option key={p.id} value={p.id}>Plan {p.nombre} · {p.profesionales.toLowerCase()}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-mensaje`} className={etiqueta}>¿Qué usás hoy? (opcional)</label>
          <textarea id={`${id}-mensaje`} name="mensaje" rows={3} className={campo} placeholder="Otro sistema, planillas, papel…" />
        </div>
      </div>

      {/* Trampa para bots: fuera de pantalla y fuera del tab order, no oculta con
          display:none — hay bots que ignoran los campos ocultos justamente. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>No completar<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {estado.fase === "error" && (
        <p role="alert" className="mt-5 rounded-[var(--lp-radius-input)] bg-lp-alertwash px-4 py-3 text-[14px] font-semibold text-lp-alert">
          {estado.msg}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        aria-busy={enviando}
        className="lp-pulsable group mt-6 inline-flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-[var(--lp-radius-btn)] bg-lp-primary px-6 text-[16px] font-semibold text-white hover:bg-lp-primaryhover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {enviando ? "Enviando…" : "Pedir la demo"}
        {!enviando && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />}
      </button>
      <p className="mt-3 text-[13px] leading-relaxed text-lp-muted">
        Te respondemos en menos de 24 horas hábiles. Usamos tus datos solo para contactarte:{" "}
        <a href="/privacidad" className="underline underline-offset-2 hover:text-lp-ink">política de privacidad</a>.
      </p>
    </form>
  );
}
