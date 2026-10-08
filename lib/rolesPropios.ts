/** Roles propios de la clínica (Administración › Permisos del equipo): crear uno con el nombre que quiera, validar los nombres y sacarlo.
 *  Un rol propio NO hereda nada de fábrica: lo que puede hacer es su lista `dar` (`config.permisos[id]`). Al crearlo se puede arrancar
 *  con una COPIA de lo que hoy puede otro rol; desde ahí es independiente (si Novum cambia la fábrica, el rol propio no se mueve). */
import { MAX_NOMBRE_DE_ROL, ROLES, ROLE_LABEL, type NombresDeRoles, type PermisosDeLaClinica, type Permission, type RolPropio } from "./rbac";
import { efectivosDe } from "./permisosEquipo";
import type { RolId } from "./types";

/** Cuántos roles propios puede tener una clínica. */
export const MAX_ROLES_PROPIOS = 20;

const LETRAS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Un id nuevo para un rol propio: «rp_» y 8 letras o números. Si el azar propone uno que ya hay, se vuelve a intentar. */
export function idDeRolNuevo(existentes: Iterable<string>, azar: () => number = Math.random): string {
  const usados = new Set(existentes);
  for (;;) {
    let id = "rp_";
    for (let i = 0; i < 8; i++) id += LETRAS[Math.min(LETRAS.length - 1, Math.floor(azar() * LETRAS.length))];
    if (!usados.has(id)) return id;
    azar = Math.random; // un azar fijo no puede encerrarnos en un bucle
  }
}

/** Los nombres que hoy usan los roles de la clínica (con el otro nombre de los de fábrica). `salvo` deja afuera uno, para renombrarlo sin chocar consigo mismo. */
export function nombresEnUso(rolesPropios: RolPropio[], nombresDeRoles: NombresDeRoles = {}, salvo?: RolId): string[] {
  return [
    ...ROLES.filter((r) => r !== salvo).map((r) => nombresDeRoles[r] ?? ROLE_LABEL[r]),
    ...rolesPropios.filter((r) => r.id !== salvo).map((r) => r.nombre),
  ];
}

const comparable = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** `null` si el nombre sirve; si no, qué hay que corregir. `otros` son los nombres que ya usan los demás roles. */
export function errorDeNombreDeRol(nombre: string, otros: Iterable<string>): string | null {
  const n = nombre.trim();
  if (!n) return "Escribí el nombre del rol.";
  if (n.length > MAX_NOMBRE_DE_ROL) return `El nombre puede tener hasta ${MAX_NOMBRE_DE_ROL} letras.`;
  const buscado = comparable(n);
  for (const otro of otros) if (comparable(otro) === buscado) return "Ya hay un rol con ese nombre.";
  return null;
}

/** Cuántas personas tienen este rol, también las dadas de baja: si se borra el rol, quedarían con uno que ya no existe. */
export function personasConElRol(users: { role: string }[], rolId: RolId): number {
  return users.filter((u) => u.role === rolId).length;
}

export type ResultadoDeCrearRol =
  | { ok: true; rol: RolPropio; ajustes: { dar: Permission[]; quitar: Permission[] } }
  | { ok: false; error: string };

/** Arma un rol propio nuevo. `plantilla` es el rol del que se copia lo que PUEDE hoy en esta clínica (no lo de fábrica); sin plantilla arranca
 *  sin permisos. Lo que no se reparte (crear usuarios, configurar la clínica) no se copia nunca. */
export function crearRolPropio(args: {
  nombre: string;
  plantilla?: RolId;
  rolesPropios: RolPropio[];
  nombresDeRoles?: NombresDeRoles;
  permisos?: PermisosDeLaClinica;
  azar?: () => number;
}): ResultadoDeCrearRol {
  if (args.rolesPropios.length >= MAX_ROLES_PROPIOS) return { ok: false, error: `Llegaste al máximo de ${MAX_ROLES_PROPIOS} roles propios.` };
  const error = errorDeNombreDeRol(args.nombre, nombresEnUso(args.rolesPropios, args.nombresDeRoles));
  if (error) return { ok: false, error };
  const id = idDeRolNuevo([...ROLES, ...args.rolesPropios.map((r) => r.id)], args.azar);
  const dar = args.plantilla ? efectivosDe(args.plantilla, args.permisos).filter((p) => p !== "users.manage" && p !== "practice.config") : [];
  return { ok: true, rol: { id, nombre: args.nombre.trim() }, ajustes: { dar, quitar: [] } };
}

/** La lista de roles propios sin el que se borra. */
export function quitarRolPropio(rolesPropios: RolPropio[], id: RolId): RolPropio[] {
  return rolesPropios.filter((r) => r.id !== id);
}
