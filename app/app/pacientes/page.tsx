"use client";
/** Sección Pacientes (paridad Dentalink, revisión de Novum del 27/9/2026): pestañas
 *  Pacientes · [Habilitados/Deshabilitados] · Análisis · Análisis de estudios específicos
 *  · Configuración. La lista muestra código interno, CI o RUC, nombre, apellido,
 *  tratamientos y deudas, con un menú ⋮ cuyas opciones dependen del rol. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, MoreVertical, UserRound, Layers, Stethoscope, Receipt, Wallet, UserX, UserCheck } from "lucide-react";
import { useStore, fullName } from "@/lib/store";
import { patientBalance } from "@/lib/budgets";
import { codigosFaltantes } from "@/lib/camposPaciente";
import type { Patient } from "@/lib/types";
import { Card, Btn, Badge, Empty } from "@/components/ui";
import { Desplegable, ItemMenu } from "@/components/Desplegable";
import { Reveal } from "@/components/motion";
import { AnalisisConversion } from "@/components/AnalisisConversion";
import { AnalisisEstudios } from "@/components/AnalisisEstudios";
import { ConfiguracionCampos } from "@/components/ConfiguracionCampos";
import { useAlcance } from "@/lib/useAlcance";

export default function PatientsPage() {
  const { db, session, upsertPatient } = useStore();
  const alcance = useAlcance();
  const router = useRouter();
  const verMontos = alcance.puede("money.view");
  const verPersonales = alcance.puede("patients.personal");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"lista" | "analisis" | "estudios" | "configuracion">("lista");
  const [estado, setEstado] = useState<"habilitados" | "deshabilitados" | "todos">("habilitados");

  // Código interno: los pacientes cargados antes de que existiera lo reciben la primera vez
  // que alguien de la recepción abre el listado (determinista: dos pantallas asignan lo mismo).
  useEffect(() => {
    if (!verPersonales) return;
    for (const { id, code } of codigosFaltantes(db.patients)) {
      const p = db.patients.find((x) => x.id === id);
      if (p) upsertPatient({ ...p, code });
    }
  }, [verPersonales, db.patients, upsertPatient]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const propios = db.patients.filter((p) => alcance.vePaciente(p.id))
      .filter((p) => estado === "todos" || (estado === "deshabilitados" ? p.disabled : !p.disabled));
    const xs = !t
      ? propios
      : propios.filter((p) => fullName(p).toLowerCase().includes(t) || String(p.code ?? "") === t
        || (verPersonales && (p.document.includes(t) || p.phone.includes(t) || (p.ruc ?? "").includes(t))));
    return [...xs].sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }, [db.patients, q, alcance, verPersonales, estado]);

  const TABS = ([
    { k: "lista", label: "Pacientes" },
    // Análisis muestra cobros y presupuestos (números del negocio, igual que en Reportes).
    ...(alcance.puede("billing.reports") ? [{ k: "analisis", label: "Análisis" }] : []),
    { k: "estudios", label: "Análisis de estudios específicos" },
    { k: "configuracion", label: "Configuración" },
  ] as const) as readonly { k: "lista" | "analisis" | "estudios" | "configuracion"; label: string }[];

  return (
    <div className="space-y-5">
      <Reveal y={0} className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-clinic-text">Pacientes</h1>
        {verPersonales && <Btn onClick={() => router.push("/app/pacientes/nuevo")}><Plus className="h-4 w-4" /> Nuevo paciente</Btn>}
      </Reveal>

      <Reveal delay={0.05} className="flex flex-wrap gap-1 rounded-2xl border border-clinic-border bg-white p-1">
        {TABS.map((t, i) => (
          <span key={t.k} className="contents">
            <button
              onClick={() => setTab(t.k)}
              className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${tab === t.k ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}
            >
              {t.label}
            </button>
            {/* Entre «Pacientes» y «Análisis», el filtro de habilitados/deshabilitados. */}
            {i === 0 && (
              <select
                aria-label="Mostrar pacientes"
                value={estado}
                onChange={(e) => { setEstado(e.target.value as typeof estado); setTab("lista"); }}
                className="rounded-xl border-0 bg-transparent px-2 py-2 text-sm font-bold text-clinic-muted hover:bg-clinic-bg focus:ring-2 focus:ring-azure-200"
              >
                <option value="habilitados">Habilitados</option>
                <option value="deshabilitados">Deshabilitados</option>
                <option value="todos">Todos</option>
              </select>
            )}
          </span>
        ))}
      </Reveal>

      {tab === "analisis" && alcance.puede("billing.reports") && <Reveal><AnalisisConversion /></Reveal>}
      {tab === "estudios" && <Reveal><AnalisisEstudios /></Reveal>}
      {tab === "configuracion" && <Reveal><ConfiguracionCampos /></Reveal>}

      {tab === "lista" && (
        <Reveal className="space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={verPersonales ? "Buscar por nombre, CI o teléfono…" : "Buscar por nombre…"}
              className="w-full rounded-xl border border-clinic-border bg-white py-2.5 pl-9 pr-3 text-sm focus:border-azure-600"
            />
          </div>

          {list.length === 0 ? (
            <Empty
              title={alcance.sinDoctores ? "Todavía no tenés doctores asignados" : "Sin resultados"}
              desc={alcance.sinDoctores ? "Pedile al administrador que te asigne en Configuración → Usuarios." : verPersonales ? "Probá con otro nombre o número de documento." : "Probá con otro nombre."}
            />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                    <th className="px-4 py-3">Código</th>
                    {verPersonales && <th className="px-2 py-3">CI o RUC</th>}
                    <th className="px-2 py-3">Nombre</th>
                    <th className="px-2 py-3">Apellido</th>
                    <th className="px-2 py-3">Tratamientos</th>
                    {verMontos && <th className="px-2 py-3">Deudas</th>}
                    <th className="px-2 py-3"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-clinic-border">
                  {list.map((p) => {
                    const trats = db.budgets.filter((b) => b.patientId === p.id).length;
                    const debt = verMontos && patientBalance(p.id, db.budgets, db.payments) > 0;
                    return (
                      <tr key={p.id} className={`hover:bg-clinic-bg/60 ${p.disabled ? "opacity-60" : ""}`}>
                        <td className="px-4 py-2.5 font-mono text-xs text-clinic-muted">{p.code ?? "—"}</td>
                        {verPersonales && <td className="px-2 py-2.5 font-mono text-xs text-clinic-text">{p.document || p.ruc || "—"}</td>}
                        <td className="px-2 py-2.5">
                          {/* aria-label con el nombre completo: el apellido vive en otra celda. */}
                          <a href={`/app/pacientes/${p.id}`} aria-label={`Abrir la ficha de ${fullName(p)}`} className="font-semibold text-clinic-text hover:text-azure-700">{p.firstName}</a>
                          {p.disabled && <Badge tone="muted">Deshabilitado</Badge>}
                        </td>
                        <td className="px-2 py-2.5 text-clinic-text">{p.lastName}</td>
                        <td className="px-2 py-2.5 text-clinic-muted">{trats}</td>
                        {verMontos && <td className="px-2 py-2.5">{debt ? <Badge tone="err">Con deuda</Badge> : <span className="text-clinic-muted">No tiene</span>}</td>}
                        <td className="px-2 py-2.5 text-right">
                          <AccionesPaciente
                            paciente={p}
                            onDeshabilitar={verPersonales ? () => {
                              const accion = p.disabled ? "habilitar" : "deshabilitar";
                              if (window.confirm(`¿Seguro que querés ${accion} a ${fullName(p)}?`)) upsertPatient({ ...p, disabled: !p.disabled || undefined });
                            } : undefined}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </Reveal>
      )}

    </div>
  );
}

/** Menú ⋮ de cada paciente. Las opciones dependen del rol: la recepción entra a los
 *  datos personales y a los tratamientos (sin montos) y puede deshabilitarlo; los pagos
 *  y la recaudación son de quien maneja plata; lo clínico entra a la ficha. */
function AccionesPaciente({ paciente, onDeshabilitar }: { paciente: Patient; onDeshabilitar?: () => void }) {
  const alcance = useAlcance();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const ir = (tab: string) => { window.location.href = `/app/pacientes/${paciente.id}?tab=${tab}`; };
  return (
    <>
      <button ref={ref} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Acciones de ${fullName(paciente)}`} onClick={() => setOpen((o) => !o)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-clinic-bg">
        <MoreVertical className="h-4 w-4 text-clinic-muted" />
      </button>
      <Desplegable ancla={ref} abierto={open} onCerrar={() => setOpen(false)} ancho={220} alinear="derecha" etiqueta={`Acciones de ${fullName(paciente)}`}>
        {alcance.puede("patients.personal") && <ItemMenu onClick={() => ir("datos")}><UserRound className="h-3.5 w-3.5" /> Ir a datos personales</ItemMenu>}
        {alcance.puede("plans.view") && <ItemMenu onClick={() => ir("planes")}><Layers className="h-3.5 w-3.5" /> Ir a tratamientos</ItemMenu>}
        {alcance.puede("emr.read") && <ItemMenu onClick={() => ir("resumen")}><Stethoscope className="h-3.5 w-3.5" /> Ir a la ficha clínica</ItemMenu>}
        {alcance.puede("money.view") && <ItemMenu onClick={() => ir("facturacion")}><Receipt className="h-3.5 w-3.5" /> Ir a pagos recibidos</ItemMenu>}
        {alcance.puede("payments.manage") && <ItemMenu onClick={() => ir("recibir-pago")}><Wallet className="h-3.5 w-3.5" /> Ir a recaudación</ItemMenu>}
        {onDeshabilitar && (
          <>
            <div className="my-1 border-t border-clinic-border" />
            <ItemMenu peligro={!paciente.disabled} onClick={() => { setOpen(false); onDeshabilitar(); }}>
              {paciente.disabled ? <><UserCheck className="h-3.5 w-3.5" /> Habilitar paciente</> : <><UserX className="h-3.5 w-3.5" /> Deshabilitar paciente</>}
            </ItemMenu>
          </>
        )}
      </Desplegable>
    </>
  );
}
