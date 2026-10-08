"use client";
/** «Permisos del equipo» (Administración › Configuración): qué puede ver y qué puede hacer cada rol en ESTA clínica, cómo se llama cada
 *  uno y qué roles propios tiene. Cada rol de fábrica viene con sus permisos (`lib/rbac.ts`); el administrador da o saca los que quiera y se
 *  guarda solo la diferencia en `config.permisos`. Un rol propio (`config.rolesPropios`) no trae nada de fábrica: puede lo que se tilde. El
 *  administrador siempre puede todo, y crear usuarios o configurar la clínica no se reparten.
 *  La lógica (qué arrastra cada cambio, qué se guarda, cómo se crea un rol) está en `lib/permisosEquipo.ts` y `lib/rolesPropios.ts`; las
 *  reglas de Firestore hacen cumplir los permisos marcados con candado (`firestore.rules`, `tienePermiso`). */
import { useMemo, useState } from "react";
import { Check, Eye, KeyRound, Lock, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  MAX_NOMBRE_DE_ROL, ROLE_LABEL, esRolDeFabrica, normalizarNombresDeRoles, normalizarPermisos, normalizarRolesPropios, permisoDeFabrica,
  rolDescripcion, rolLabel, rolesParaElegir, type Permission,
} from "@/lib/rbac";
import {
  GRUPOS_DE_PERMISOS, PERMISOS_EN_PALABRAS, QUE_BLOQUEA_EL_SISTEMA, TIPO_DE_PERMISO,
  ajustesDesdeEfectivos, cambiarPermiso, efectivosDe, permisosParaGuardar, type CambioDePermiso,
} from "@/lib/permisosEquipo";
import { MAX_ROLES_PROPIOS, crearRolPropio, errorDeNombreDeRol, nombresEnUso, personasConElRol, quitarRolPropio } from "@/lib/rolesPropios";
import type { RolId } from "@/lib/types";
import { Badge, Btn, Card, inputCls } from "@/components/ui";

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
  const config = db.clinics[0]?.config;
  const guardados = useMemo(() => normalizarPermisos(config?.permisos), [config?.permisos]);
  const propios = useMemo(() => normalizarRolesPropios(config?.rolesPropios), [config?.rolesPropios]);
  const nombresGuardados = useMemo(() => normalizarNombresDeRoles(config?.nombresDeRoles), [config?.nombresDeRoles]);
  const roles = rolesParaElegir(); // los de fábrica (con el nombre que tengan) y los propios
  const [elegido, setElegido] = useState<RolId>("cashier");
  const rol = roles.some((r) => r.id === elegido) ? elegido : "cashier"; // si se borró, vuelve al primero
  // Solo lo que se tocó: el resto sigue lo guardado, también si la base llega después de abrir la pantalla.
  const [borrador, setBorrador] = useState<Record<RolId, Set<Permission>>>({});
  const [nombres, setNombres] = useState<Record<RolId, string>>({});
  const [estado, setEstado] = useState<"" | "guardando" | "guardado" | "fallo">("");
  const [aviso, setAviso] = useState("");
  const [creando, setCreando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [plantilla, setPlantilla] = useState<RolId>("");
  const [errorNuevo, setErrorNuevo] = useState("");

  const deFabrica = esRolDeFabrica(rol);
  const esAdmin = rol === "admin";
  const guardadosDe = (r: RolId) => new Set(efectivosDe(r, guardados));
  const actualDe = (r: RolId) => borrador[r] ?? guardadosDe(r);
  const errorDeNombre = (r: RolId): string | null =>
    nombres[r] === undefined ? null : errorDeNombreDeRol(nombres[r], nombresEnUso(propios, nombresGuardados, r));
  const nombreCambiado = (r: RolId) => nombres[r] !== undefined && nombres[r].trim() !== rolLabel(r);
  const permisosCambiados = (r: RolId) => !!borrador[r] && !mismos(borrador[r]!, guardadosDe(r));
  const sinGuardar = roles.some((r) => r.id !== "admin" && permisosCambiados(r.id)) || roles.some((r) => nombreCambiado(r.id));
  const hayErrorDeNombre = roles.some((r) => nombreCambiado(r.id) && errorDeNombre(r.id) !== null);
  const cambiosDe = (r: RolId) => {
    const { dar, quitar } = ajustesDesdeEfectivos(r, actualDe(r));
    return dar.length + quitar.length;
  };

  const actual = actualDe(rol);
  const esDeFabrica = cambiosDe(rol) === 0;
  const personas = personasConElRol(db.users, rol);

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

  const descartar = () => { setBorrador({}); setNombres({}); setEstado(""); setAviso(""); };

  const guardar = async () => {
    setEstado("guardando");
    setAviso("");
    const porRol: Record<RolId, Permission[]> = {};
    for (const r of roles) if (r.id !== "admin") porRol[r.id] = [...actualDe(r.id)];
    // Los nombres: un rol de fábrica con su nombre de siempre se guarda como «» (la base mezcla campo por campo y no borra lo ausente).
    const nombresDeRoles = { ...(config?.nombresDeRoles ?? {}) };
    let rolesPropios = propios;
    for (const r of roles) {
      if (!nombreCambiado(r.id)) continue;
      const n = nombres[r.id].trim();
      if (r.deFabrica) nombresDeRoles[r.id as keyof typeof ROLE_LABEL] = n === ROLE_LABEL[r.id as keyof typeof ROLE_LABEL] ? "" : n;
      else rolesPropios = rolesPropios.map((x) => (x.id === r.id ? { ...x, nombre: n } : x));
    }
    // Se escriben todos los roles, con las listas vacías si no cambió nada: la base mezcla mapa por mapa y no borra lo ausente.
    const guardando = updateClinicConfig({ permisos: permisosParaGuardar(porRol), nombresDeRoles, rolesPropios });
    setBorrador({});
    setNombres({});
    // «Guardado» recién cuando el servidor lo aceptó: si lo rechaza sale el aviso rojo de abajo con el botón de reintentar.
    setEstado((await guardando) ? "guardado" : "fallo");
  };

  const abrirNuevo = () => { setCreando(true); setNuevoNombre(""); setPlantilla(""); setErrorNuevo(""); };

  const crear = async () => {
    const r = crearRolPropio({ nombre: nuevoNombre, plantilla: plantilla || undefined, rolesPropios: propios, nombresDeRoles: nombresGuardados, permisos: guardados });
    if (!r.ok) { setErrorNuevo(r.error); return; }
    setCreando(false);
    setElegido(r.rol.id);
    setEstado("");
    // Se guarda en el acto, como crear un usuario: los permisos del rol nuevo viajan con él.
    const guardando = updateClinicConfig({ rolesPropios: [...propios, r.rol], permisos: { ...(config?.permisos ?? {}), [r.rol.id]: r.ajustes } });
    setAviso(`Se creó el rol «${r.rol.nombre}». Elegí acá abajo qué puede hacer y asignaselo a una persona en Usuarios y profesionales.`);
    if (!(await guardando)) setEstado("fallo");
  };

  const eliminar = async () => {
    if (deFabrica || personas > 0) return;
    if (!confirm(`¿Eliminar el rol «${rolLabel(rol)}»? Se pierden sus permisos y no se puede deshacer.`)) return;
    const id = rol;
    setElegido("cashier");
    setBorrador((b) => { const { [id]: _quitado, ...resto } = b; return resto; });
    setNombres((n) => { const { [id]: _quitado, ...resto } = n; return resto; });
    setAviso("");
    // El rol se saca de la lista y sus permisos se dejan vacíos (la base no borra claves: queda una entrada neutra que nadie usa).
    const ok = await updateClinicConfig({ rolesPropios: quitarRolPropio(propios, id), permisos: { ...(config?.permisos ?? {}), [id]: { dar: [], quitar: [] } } });
    setEstado(ok ? "" : "fallo");
  };

  const nombreDelCampo = nombres[rol] ?? rolLabel(rol);
  const errorDelCampo = nombreCambiado(rol) ? errorDeNombre(rol) : null;

  return (
    <section aria-labelledby="permisos-titulo">
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><KeyRound aria-hidden className="h-4 w-4 text-azure-600" /><h2 id="permisos-titulo" className="font-bold text-clinic-text">Permisos del equipo</h2></div>
        <p className="mb-2 text-xs text-clinic-muted">
          Elegí un rol y marcá lo que puede <b>ver</b> y <b>hacer</b> en tu clínica. Lo que no cambies queda como viene de fábrica. Podés <b>cambiarle el nombre</b> a cada rol y <b>crear los tuyos</b> (por ejemplo «Coordinación de tratamientos»). El <b>Administrador</b> siempre puede todo, y crear usuarios o configurar la clínica no se reparten.
        </p>
        <p className="mb-4 text-xs text-clinic-muted">
          <b>Ver</b> es qué información aparece en pantalla; <b>hacer</b>, qué acciones puede ejecutar. Lo que tiene candado <Lock aria-hidden className="inline h-3 w-3 align-[-1px]" /> además lo bloquea el sistema por dentro; lo demás esconde pantallas y botones. Los cambios valen en el acto para todo el equipo, aunque tengan la sesión abierta.
        </p>

        <div role="group" aria-label="Rol" className="flex flex-wrap gap-2">
          {roles.map((r) => {
            const n = r.id === "admin" ? 0 : r.deFabrica ? cambiosDe(r.id) : 0;
            const elegida = r.id === rol;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={elegida}
                onClick={() => { setElegido(r.id); setAviso(""); }}
                className={`inline-flex min-h-[32px] items-center gap-1.5 rounded border px-3 py-1 text-[13px] font-semibold transition-colors ${elegida ? "border-azure-600 bg-azure-50 text-azure-700" : "border-clinic-border bg-white text-clinic-text hover:border-azure-300 hover:bg-azure-50"}`}
              >
                {r.nombre}
                {n > 0 && <span className="rounded-full bg-azure-600 px-1.5 text-[11px] font-bold leading-4 text-white" aria-label={`${n} cambio${n === 1 ? "" : "s"} respecto de fábrica`}>{n}</span>}
              </button>
            );
          })}
          <button
            type="button"
            onClick={abrirNuevo}
            disabled={propios.length >= MAX_ROLES_PROPIOS}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded border border-dashed border-azure-300 bg-white px-3 py-1 text-[13px] font-semibold text-azure-700 transition-colors hover:bg-azure-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus aria-hidden className="h-3.5 w-3.5" /> Nuevo rol
          </button>
        </div>

        {creando && (
          <div className="mt-3 rounded border border-azure-200 bg-azure-50/50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold text-clinic-text">Nombre del rol nuevo</span>
                <input
                  className={inputCls}
                  value={nuevoNombre}
                  maxLength={MAX_NOMBRE_DE_ROL}
                  onChange={(e) => { setNuevoNombre(e.target.value); setErrorNuevo(""); }}
                  placeholder="Ej.: Coordinación de tratamientos"
                  aria-invalid={!!errorNuevo}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold text-clinic-text">Empezar con los permisos de</span>
                <select className={inputCls} value={plantilla} onChange={(e) => setPlantilla(e.target.value)}>
                  <option value="">Ninguno: lo tildo yo</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </label>
            </div>
            <p className="mt-2 text-[11px] text-clinic-muted">Es una copia de lo que ese rol puede hoy: después el rol nuevo es independiente y lo ajustás como quieras.</p>
            {errorNuevo && <p role="alert" className="mt-2 text-xs font-semibold text-state-err">{errorNuevo}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn onClick={() => void crear()}><Plus aria-hidden className="h-3.5 w-3.5" /> Crear rol</Btn>
              <Btn variant="outline" onClick={() => setCreando(false)}>Cancelar</Btn>
            </div>
          </div>
        )}

        <label className="mt-4 block max-w-sm">
          <span className="mb-1 block text-[13px] font-semibold text-clinic-text">Nombre del rol</span>
          <input
            className={inputCls}
            value={nombreDelCampo}
            maxLength={MAX_NOMBRE_DE_ROL}
            onChange={(e) => { setNombres((n) => ({ ...n, [rol]: e.target.value })); setEstado(""); }}
            aria-invalid={!!errorDelCampo}
            aria-describedby="rol-nombre-error"
          />
        </label>
        {errorDelCampo && <p id="rol-nombre-error" role="alert" className="mt-1 text-xs font-semibold text-state-err">{errorDelCampo}</p>}
        {deFabrica && rolLabel(rol) !== ROLE_LABEL[rol as keyof typeof ROLE_LABEL] && !nombreCambiado(rol) && (
          <p className="mt-1 text-[11px] text-clinic-muted">De fábrica se llama «{ROLE_LABEL[rol as keyof typeof ROLE_LABEL]}».</p>
        )}
        {deFabrica && nombreDelCampo.trim() !== ROLE_LABEL[rol as keyof typeof ROLE_LABEL] && (
          <button type="button" className="mt-1 text-[11px] font-bold text-azure-700 hover:underline" onClick={() => setNombres((n) => ({ ...n, [rol]: ROLE_LABEL[rol as keyof typeof ROLE_LABEL] }))}>
            Volver al nombre de fábrica
          </button>
        )}
        <p className="mt-2 text-xs text-clinic-muted">
          {deFabrica
            ? <><b>De fábrica:</b> {rolDescripcion(rol)}</>
            : <><b>Rol propio:</b> no trae nada de fábrica; puede exactamente lo que tildes acá abajo.</>}
        </p>

        {esAdmin && (
          <p className="mt-4 rounded border border-clinic-border bg-clinic-bg px-3 py-2 text-xs text-clinic-muted">
            <Lock aria-hidden className="mr-1 inline h-3 w-3 align-[-1px]" />El Administrador siempre puede todo: no se le pueden sacar permisos. Acá solo se le puede cambiar el nombre.
          </p>
        )}

        {!esAdmin && GRUPOS_DE_PERMISOS.map((g) => {
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
                              {deFabrica && activo && !permisoDeFabrica(rol, p) && <Badge tone="ok">Agregado</Badge>}
                              {deFabrica && !activo && permisoDeFabrica(rol, p) && <Badge tone="warn">Quitado</Badge>}
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
          <Btn onClick={() => void guardar()} disabled={!sinGuardar || hayErrorDeNombre}><Save aria-hidden className="h-3.5 w-3.5" /> Guardar permisos</Btn>
          {sinGuardar && <Btn variant="outline" onClick={descartar}>Descartar cambios</Btn>}
          {deFabrica && !esAdmin && (
            <Btn variant="outline" onClick={volverAFabrica} disabled={esDeFabrica}><RotateCcw aria-hidden className="h-3.5 w-3.5" /> Volver {rolLabel(rol)} a como viene de fábrica</Btn>
          )}
          {estado === "guardando" && <span role="status" className="text-xs font-semibold text-clinic-muted">Guardando…</span>}
          {estado === "guardado" && !sinGuardar && (
            <span role="status" className="inline-flex items-center gap-1 text-xs font-semibold text-state-ok"><Check aria-hidden className="h-3.5 w-3.5" /> Guardado: ya rige para todo el equipo</span>
          )}
          {estado === "fallo" && (
            <span role="alert" className="text-xs font-semibold text-state-err">No se pudo guardar en el servidor. Mirá el aviso de abajo para reintentar.</span>
          )}
          {sinGuardar && <span role="status" className="text-xs font-semibold text-state-warn">Hay cambios sin guardar.</span>}
        </div>

        {!deFabrica && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-clinic-border pt-4">
            <Btn variant="danger" onClick={() => void eliminar()} disabled={personas > 0}><Trash2 aria-hidden className="h-3.5 w-3.5" /> Eliminar este rol</Btn>
            <span className="text-xs text-clinic-muted">
              {personas > 0
                ? `${personas === 1 ? "Lo tiene 1 persona" : `Lo tienen ${personas} personas`} (también las dadas de baja): pasá ${personas === 1 ? "a esa persona" : "a esas personas"} a otro rol en Usuarios y profesionales antes de eliminarlo.`
                : "Nadie lo tiene: se puede eliminar."}
            </span>
          </div>
        )}
      </Card>
    </section>
  );
}
