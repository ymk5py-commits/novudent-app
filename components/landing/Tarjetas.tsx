"use client";
/** Tarjetas de ejemplo de la landing: fragmentos de la interfaz armados con datos de
 *  muestra. Cada una lleva la marca «Ejemplo»; la tabla de roles sale de la matriz real
 *  de permisos (lib/rbac.ts). */
import { Check } from "lucide-react";
import { permisoDeFabrica, ROLES, ROLE_LABEL, type Permission } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import { gs } from "@/lib/landing/precios";
import { ToothGlyph, type ShowcaseToothRecord } from "../OdontogramShowcase";

export function Ejemplo() {
  return (
    <span className="rounded-full border border-lp-rule px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-lp-muted">
      Ejemplo
    </span>
  );
}

type Alcance = "todos" | "clinica" | "multi";
const ALCANCE: Record<Alcance, string> = { todos: "Todos los planes", clinica: "Clínica y Multi", multi: "Multi" };


/* ---------- tarjetas de cada etapa ---------- */

export function TarjetaAgenda() {
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
        <span className="text-[17px] font-semibold text-lp-ink">Agenda · hoy</span>
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

export function TarjetaPresupuesto() {
  const items: [string, number][] = [["Resina · pieza 16", 250_000], ["Endodoncia · pieza 36", 900_000], ["Corona · pieza 26", 1_400_000]];
  const total = items.reduce((s, [, v]) => s + v, 0);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[17px] font-semibold text-lp-ink">Presupuesto · María González</span>
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

export function TarjetaVolver() {
  const filas: [string, string][] = [
    ["Camila Ortega", "Control de ortodoncia vencido hace 12 días"],
    ["Juan Ríos", "Presupuesto presentado, sin respuesta"],
    ["María González", "Cuota 2 de 3 pendiente"],
  ];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[17px] font-semibold text-lp-ink">Para recontactar</span>
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

/* La tabla sale de la matriz real de permisos DE FÁBRICA: si cambia lib/rbac.ts, cambia acá (la landing es pública: no muestra los ajustes de ninguna clínica). */
const FILAS_ROLES: [string, Permission][] = [
  ["Ver la agenda de todos los profesionales", "agenda.all"],
  ["Cargar y editar los datos del paciente", "patients.personal"],
  ["Escribir en la ficha clínica", "emr.write"],
  ["Cobrar y hacer el arqueo de caja", "payments.manage"],
  ["Ver ingresos y liquidaciones", "billing.reports"],
  ["Crear usuarios y configurar la clínica", "users.manage"],
];
/* Encabezados cortos: cinco columnas tienen que entrar en un celular de 320 px.
   En pantallas chicas van en vertical (como en una matriz de permisos) y desde
   `sm` en horizontal. El nombre completo va para lectores de pantalla y de tooltip. */
const ROL_CORTO: Record<Role, string> = {
  admin: "Admin",
  cashier: "Caja",
  receptionist: "Recepción",
  dentist: "Dentista",
  assistant: "Asistente",
};

export function TablaRoles() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[17px] font-semibold text-lp-ink">Quién puede qué</span>
      </div>
      <table className="w-full border-collapse text-left text-[14px]">
        <caption className="sr-only">Permisos por rol en Novudent</caption>
        <thead>
          <tr className="border-b border-lp-rule2">
            <th scope="col" className="py-2 pr-2 font-normal text-lp-muted"><span className="sr-only">Tarea</span></th>
            {ROLES.map((r) => (
              <th key={r} scope="col" title={ROLE_LABEL[r]} className="w-7 px-0 pb-2 pt-1 text-center align-bottom text-[12px] font-semibold text-lp-ink sm:w-auto sm:px-1 sm:py-2 sm:align-middle">
                <span aria-hidden="true" className="mx-auto inline-block whitespace-nowrap leading-none [writing-mode:vertical-rl] rotate-180 sm:rotate-0 sm:leading-tight sm:[writing-mode:horizontal-tb]">{ROL_CORTO[r]}</span>
                <span className="sr-only">{ROLE_LABEL[r]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FILAS_ROLES.map(([t, p]) => (
            <tr key={p} className="border-b border-lp-rule">
              <th scope="row" className="py-2.5 pr-2 text-[13px] font-normal leading-snug text-lp-ink sm:text-[14px]">{t}</th>
              {ROLES.map((r) => (
                <td key={r} className="px-0.5 py-2.5 text-center sm:px-1">
                  {permisoDeFabrica(r, p) ? (
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

export function TarjetaFicha() {
  const hallazgos: { n: string; rec: ShowcaseToothRecord; t: string; quien: string; pendiente: boolean; arriba: boolean }[] = [
    { n: "16", rec: { condition: "caries", surfaces: ["O"] }, t: "Caries oclusal (O)", quien: "Dra. Benítez · hoy 09:14", pendiente: true, arriba: true },
    { n: "26", rec: { condition: "corona" }, t: "Corona", quien: "Dra. Benítez · 03/07", pendiente: false, arriba: true },
    { n: "36", rec: { condition: "endodoncia" }, t: "Endodoncia", quien: "Dr. Martínez · 12/08", pendiente: false, arriba: false },
  ];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[17px] font-semibold text-lp-ink">Ficha · María González</span>
        <Ejemplo />
      </div>
      <p className="mb-4 inline-flex rounded-full bg-lp-alertwash px-3 py-1 text-[13px] font-semibold text-lp-alert">Alerta médica: alergia a la penicilina</p>
      <ul className="divide-y divide-lp-rule border-y border-lp-rule">
        {hallazgos.map((h) => (
          <li key={h.n} className="flex items-center gap-4 py-3">
            <span className="shrink-0 scale-90" aria-hidden><ToothGlyph n={h.n} rec={h.rec} upper={h.arriba} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-lp-ink">
                <span className="lp-num font-mono text-[13px]">{h.n}</span> · {h.t}
              </span>
              <span className="block text-[13px] text-lp-muted">{h.quien}</span>
            </span>
            <span className={`whitespace-nowrap text-[12px] font-semibold ${h.pendiente ? "text-lp-alert" : "text-lp-accentink"}`}>
              {h.pendiente ? "Pendiente" : "Realizado"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}


/** Resumen del día para la portada: agenda, caja y pendientes (datos de muestra). */
export function TarjetaHoy() {
  const filas: [string, string, string][] = [
    ["Agenda", "4 turnos · 3 confirmados", "Ver agenda"],
    ["Caja", `${gs(1_150_000)} cobrados`, "Arqueo"],
    ["Presupuestos", "2 esperando respuesta", "Avisar"],
  ];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[17px] font-semibold text-lp-ink">Hoy en tu clínica</span>
        <Ejemplo />
      </div>
      <ul className="space-y-2">
        {filas.map(([t, d, a]) => (
          <li key={t} className="flex items-center justify-between gap-3 rounded-[var(--lp-radius-input)] bg-lp-paper2 px-3.5 py-3">
            <span className="min-w-0">
              <span className="block text-[13px] text-lp-muted">{t}</span>
              <span className="lp-num block truncate text-[15px] font-semibold text-lp-ink">{d}</span>
            </span>
            <span className="whitespace-nowrap rounded-[6px] border border-lp-rule bg-white px-2.5 py-1 text-[12px] font-semibold text-lp-primary">{a}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
