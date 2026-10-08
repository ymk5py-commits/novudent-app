"use client";
/** «Permisos del equipo» (Administración › Configuración): qué puede ver y qué puede hacer cada rol en ESTA clínica. Cada rol viene con
 *  los permisos de fábrica (`lib/rbac.ts`); el administrador da o saca los que quiera y se guarda solo la diferencia en
 *  `config.permisos`. El administrador siempre puede todo, y crear usuarios o configurar la clínica no se reparten.
 *  La lógica (qué arrastra cada cambio, qué se guarda) está en `lib/permisosEquipo.ts`; las reglas de Firestore hacen cumplir
 *  los permisos marcados con candado (`firestore.rules`, `tienePermiso`). */
import { useMemo, useState } from "react";
import { Check, Eye, KeyRound, Lock, Pencil, RotateCcw, Save } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  ROLE_DESCRIPCION, ROLE_LABEL, ROLES_CONFIGURABLES, normalizarPermisos, permisoDeFabrica,
  type Permission, type RolConfigurable,
} from "@/lib/rbac";
import {
  GRUPOS_DE_PERMISOS, PERMISOS_EN_PALABRAS, QUE_BLOQUEA_EL_SISTEMA, TIPO_DE_PERMISO,
  ajustesDesdeEfectivos, cambiarPermiso, efectivosDe, permisosParaGuardar, type CambioDePermiso,
} from "@/lib/permisosEquipo";
import { Badge, Btn, Card } from "@/components/ui";

const mismos = (a: ReadonlySet<Permission>, b: ReadonlySet<Permission>) => a.size === b.size && [...a].every((p) => b.has(p));
const entre = (ps: Permission[]) => ps.map((p) => `«${PERMISOS_EN_PALABRAS[p]}»`).join(", ");

/** Lo que se movió además del permiso que tocó el administrador, dicho en una frase. */
function avisoDeArrastre(p: Permission, valor: boolean, { activados, sacados }: CambioDePermiso["tambien"]): string {
  if (valor && activados.length) return `Se dio también ${entre(activados)}: hace falta para «${PERMISOS_EN_PALABRAS[p]}».`;
  if (!valor && sacados.length) return `Se sacó también ${entre(sacados)}: dependía de «${PERMISOS_EN_PALABRAS[p]}».`;
  return "";
}

export function PermisosDelEquipo() {
  const { db, updateClinicConfig } = useStore();
  const guardados = useMemo(() => normalizarPermisos(db.clinics[0]?.config?.permisos), [db.clinics]);
  const [rol, setRol] = useState<RolConfigurable>("cashier");
  // Solo los roles que se tocaron: el resto sigue lo guardado, también si la base llega después de abrir la pantalla.
  const [borrador, setBorrador] = useState<Partial<Record<RolConfigurable, Set<Permission>>>>({});
  const [estado, setEstado] = useState<"" | "guardando" | "guardado" | "fallo">("");
  const [aviso, setAviso] = useState("");

  const guardadosDe = (r: RolConfigurable) => new Set(efectivosDe(r, guardados));
  const actualDe = (r: RolConfigurable) => borrador[r] ?? guardadosDe(r);
  const sinGuardar = ROLES_CONFIGURABLES.some((r) => borrador[r] && !mismos(borrador[r]!, guardadosDe(r)));
  const cambiosDe = (r: RolConfigurable) => {
    const { dar, quitar } = ajustesDesdeEfectivos(r, actualDe(r));
    return dar.length + quitar.length;
  };

  const actual = actualDe(rol);
  const esDeFabrica = cambiosDe(rol) === 0;

  const cambiar = (p: Permission, valor: boolean) => {
    const { efectivos, tambien } = cambiarPermiso(actual, p, valor);
    setBorrador((b) => ({ ...b, [rol]: efectivos }));
    setEstado("");
    setAviso(avisoDeArrastre(p, valor, tambien));
  };

  const volverAFabrica = () => {
    setBorrador((b) => ({ ...b, [rol]: new Set(efectivosDe(rol)) }));
    setEstado("");
    setAviso("");
  };

  const descartar = () => { setBorrador({}); setEstado(""); setAviso(""); };

  const guardar = async () => {
    setEstado("guardando");
    setAviso("");
    const porRol = {} as Record<RolConfigurable, Permission[]>;
    for (const r of ROLES_CONFIGURABLES) porRol[r] = [...actualDe(r)];
    // Se escriben los cuatro roles, con las listas vacías si no cambió nada: la base mezcla mapa por mapa y no borra lo ausente.
    const guardando = updateClinicConfig({ permisos: permisosParaGuardar(porRol) });
    setBorrador({});
    // «Guardado» recién cuando el servidor lo aceptó: si lo rechaza sale el aviso rojo de abajo con el botón de reintentar.
    setEstado((await guardando) ? "guardado" : "fallo");
  };

  return (
    <section aria-labelledby="permisos-titulo">
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><KeyRound aria-hidden className="h-4 w-4 text-azure-600" /><h2 id="permisos-titulo" className="font-bold text-clinic-text">Permisos del equipo</h2></div>
        <p className="mb-2 text-xs text-clinic-muted">
          Elegí un rol y marcá lo que puede <b>ver</b> y <b>hacer</b> en tu clínica. Lo que no cambies queda como viene de fábrica. El <b>Administrador</b> siempre puede todo, y crear usuarios o configurar la clínica no se reparten.
        </p>
        <p className="mb-4 text-xs text-clinic-muted">
          <b>Ver</b> es qué información aparece en pantalla; <b>hacer</b>, qué acciones puede ejecutar. Lo que tiene candado <Lock aria-hidden className="inline h-3 w-3 align-[-1px]" /> además lo bloquea el sistema por dentro; lo demás esconde pantallas y botones. Los cambios valen en el acto para todo el equipo, aunque tengan la sesión abierta.
        </p>

        <div role="group" aria-label="Rol" className="flex flex-wrap gap-2">
          {ROLES_CONFIGURABLES.map((r) => {
            const n = cambiosDe(r);
            const elegido = r === rol;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={elegido}
                onClick={() => { setRol(r); setAviso(""); }}
                className={`inline-flex min-h-[32px] items-center gap-1.5 rounded border px-3 py-1 text-[13px] font-semibold transition-colors ${elegido ? "border-azure-600 bg-azure-50 text-azure-700" : "border-clinic-border bg-white text-clinic-text hover:border-azure-300 hover:bg-azure-50"}`}
              >
                {ROLE_LABEL[r]}
                {n > 0 && <span className="rounded-full bg-azure-600 px-1.5 text-[11px] font-bold leading-4 text-white" aria-label={`${n} cambio${n === 1 ? "" : "s"} respecto de fábrica`}>{n}</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-clinic-muted"><b>De fábrica:</b> {ROLE_DESCRIPCION[rol]}</p>

        {GRUPOS_DE_PERMISOS.map((g) => {
          const soloAdmin = g.id === "solo-administrador";
          return (
            <fieldset key={g.id} className="mt-4 min-w-0 border-0 p-0">
              <legend className="mb-1 text-[12px] font-bold uppercase tracking-wide text-clinic-muted">{g.titulo}</legend>
              <ul className="divide-y divide-clinic-border rounded border border-clinic-border">
                {g.permisos.map((p) => {
                  const id = `permiso-${rol}-${p}`;
                  const activo = actual.has(p);
                  const bloquea = QUE_BLOQUEA_EL_SISTEMA[p];
                  return (
                    // Celular: la casilla y el texto arriba y las etiquetas debajo del texto; desde 768 px, todo en una línea.
                    <li key={p} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 px-3 py-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                      {soloAdmin
                        ? <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-clinic-muted md:mt-0" />
                        : <input id={id} type="checkbox" checked={activo} onChange={(e) => cambiar(p, e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-azure-600 md:mt-0" />}
                      <label htmlFor={soloAdmin ? undefined : id} className="text-[13px] text-clinic-text">{PERMISOS_EN_PALABRAS[p]}</label>
                      <span className="col-start-2 flex flex-wrap items-center gap-1.5 md:col-start-3">
                        {soloAdmin
                          ? <Badge tone="muted">Solo el administrador</Badge>
                          : (
                            <>
                              <Badge tone="muted">
                                {TIPO_DE_PERMISO[p] === "ver" ? <Eye aria-hidden className="mr-1 h-3 w-3" /> : <Pencil aria-hidden className="mr-1 h-3 w-3" />}
                                {TIPO_DE_PERMISO[p] === "ver" ? "Ver" : "Hacer"}
                              </Badge>
                              {bloquea && <Badge tone="info" tip={`El sistema bloquea ${bloquea}`}><Lock aria-hidden className="mr-1 h-3 w-3" />Lo bloquea el sistema</Badge>}
                              {activo && !permisoDeFabrica(rol, p) && <Badge tone="ok">Agregado</Badge>}
                              {!activo && permisoDeFabrica(rol, p) && <Badge tone="warn">Quitado</Badge>}
                            </>
                          )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}

        {aviso && <p role="status" className="mt-3 rounded bg-state-infobg px-3 py-2 text-xs font-semibold text-state-info">{aviso}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Btn onClick={() => void guardar()} disabled={!sinGuardar}><Save aria-hidden className="h-3.5 w-3.5" /> Guardar permisos</Btn>
          {sinGuardar && <Btn variant="outline" onClick={descartar}>Descartar cambios</Btn>}
          <Btn variant="outline" onClick={volverAFabrica} disabled={esDeFabrica}><RotateCcw aria-hidden className="h-3.5 w-3.5" /> Volver {ROLE_LABEL[rol]} a como viene de fábrica</Btn>
          {estado === "guardando" && <span role="status" className="text-xs font-semibold text-clinic-muted">Guardando…</span>}
          {estado === "guardado" && !sinGuardar && (
            <span role="status" className="inline-flex items-center gap-1 text-xs font-semibold text-state-ok"><Check aria-hidden className="h-3.5 w-3.5" /> Guardado: ya rige para todo el equipo</span>
          )}
          {estado === "fallo" && (
            <span role="alert" className="text-xs font-semibold text-state-err">No se pudo guardar en el servidor. Mirá el aviso de abajo para reintentar.</span>
          )}
          {sinGuardar && <span role="status" className="text-xs font-semibold text-state-warn">Hay cambios sin guardar.</span>}
        </div>
      </Card>
    </section>
  );
}
