import type { Role, RolId } from "./types";

/* Matriz de permisos (sec. 2.2 del Documento Maestro), roles v3 del 27/9/2026:
 * - la recepción se separa de la caja: Recepcionista agenda y carga pacientes sin
 *   ver montos; «Recepción y caja» además cobra y hace el arqueo;
 * - Dentista y «Asistente de doctores» quedan con lo clínico: su agenda, sus planes
 *   (sin montos) y la ficha de sus pacientes, sin datos personales.
 * El alcance fino (qué agenda y qué pacientes ve cada uno) está en lib/alcance.ts. */
export type Permission =
  | "users.manage"
  | "practice.config"
  | "agenda.view"
  | "agenda.create"
  | "agenda.edit"
  | "agenda.all" // Ver y agendar en la agenda de TODOS los profesionales
  | "patients.personal" // Ver y editar datos personales: teléfono, correo, documento, convenio, origen
  | "emr.read"
  | "emr.write"
  | "plans.view" // Ver planes de tratamiento (con montos solo si además tiene money.view)
  | "plans.create" // Armar planes de tratamiento desde la ficha (sin montos si no tiene money.view)
  | "money.view" // Ver montos: precios, presupuestos, deudas, saldos y totales
  | "billing.submit" // Enviar a Cobro / gestionar pagos y seguimiento
  | "billing.finalize" // Finalizar facturas (Release from Hold)
  | "billing.reports" // Ver reportes financieros
  | "engagement.forms" // CRM, consentimientos y formularios del paciente
  | "tasks.use" // Tareas del equipo
  | "budgets.manage" // Presupuestos: crear/presentar/aceptar
  | "payments.manage" // Caja: pagos y arqueo
  | "expenses.manage" // Gastos de la clínica
  | "inventory.manage" // Inventario / bodega
  | "labs.manage"; // Órdenes de laboratorio (muestran costos)

/** Orden en que se listan los roles (tablas, selectores). */
export const ROLES: Role[] = ["admin", "cashier", "receptionist", "commercial", "dentist", "assistant"];

const MATRIX: Record<Permission, Role[]> = {
  "users.manage": ["admin"],
  "practice.config": ["admin"],
  // Todos ven la agenda; dentista y asistente, solo la suya o la de sus doctores y en
  // solo lectura: los cambios de horario los hace la recepción (revisión del 27/9/2026).
  "agenda.view": ROLES,
  "agenda.create": ["admin", "cashier", "receptionist", "commercial"],
  "agenda.edit": ["admin", "cashier", "receptionist", "commercial"],
  "agenda.all": ["admin", "cashier", "receptionist", "commercial"],
  "patients.personal": ["admin", "cashier", "receptionist", "commercial"],
  "emr.read": ["admin", "dentist", "assistant"], // asistente: solo lectura
  "emr.write": ["admin", "dentist"],
  // La recepcionista ve los tratamientos sin montos (revisión del 27/9/2026: «ir a
  // tratamientos sin montos» desde el listado de pacientes).
  "plans.view": ["admin", "cashier", "receptionist", "commercial", "dentist", "assistant"],
  "plans.create": ["admin", "dentist"],
  // La plata queda en administración y en la caja: ni la recepción ni lo clínico ven montos.
  // El comercial ve los montos: presenta presupuestos y los cierra con el paciente.
  "money.view": ["admin", "cashier", "commercial"],
  "billing.submit": ["admin", "cashier"],
  "billing.finalize": ["admin"],
  // Números del NEGOCIO (ingresos, producción, análisis, liquidaciones): solo el
  // dueño. La caja cobra y hace el arqueo (payments.manage) pero no ve la
  // facturación global ni cuánto gana cada profesional.
  "billing.reports": ["admin"],
  "engagement.forms": ["admin", "cashier", "receptionist", "commercial"],
  "tasks.use": ROLES,
  "budgets.manage": ["admin", "cashier", "commercial"],
  "payments.manage": ["admin", "cashier"],
  "expenses.manage": ["admin"],
  "inventory.manage": ["admin"],
  "labs.manage": ["admin"],
};

/** Todas las claves de la matriz, en el orden en que están escritas arriba. */
export const ALL_PERMISSIONS = Object.keys(MATRIX) as Permission[];

/* ===== Lo que la clínica reparte o saca (Configuración › Permisos del equipo) =====
 *
 * La matriz de arriba es la de FÁBRICA. Cada clínica guarda en `config.permisos` solo la DIFERENCIA por rol
 * (`dar`: lo que gana; `quitar`: lo que pierde) y `can()` la aplica encima. Así una clínica sin ajustes se
 * comporta igual que siempre, y si Novum cambia la matriz de fábrica, las clínicas siguen lo que no tocaron.
 *
 * Roles propios: la clínica también puede crear roles con el nombre que quiera (`config.rolesPropios`). Un rol propio NO
 * hereda nada de fábrica: lo que puede hacer es exactamente su lista `dar`. Por eso las reglas de Firestore los soportan
 * sin saber que existen (`tienePermiso` mira `dar` y listo). Los roles de fábrica también pueden llevar otro nombre
 * (`config.nombresDeRoles`), que solo cambia lo que se lee en pantalla.
 *
 * Qué NO se puede tocar: el administrador (siempre tiene todo) y los permisos de `PERMISOS_SOLO_ADMIN`
 * (crear usuarios y configurar la clínica: quien los reparte se los daría a sí mismo).
 *
 * Qué hace cumplir cada cosa: los permisos de ejecución con regla propia en `firestore.rules`
 * (payments.manage, engagement.forms, emr.write, expenses.manage, billing.reports) se bloquean en el servidor;
 * el resto cambia lo que se ve y los botones, pero Firestore sigue dejando leer a todo miembro de la clínica. */

/** Los roles de fábrica que la clínica puede configurar: todos menos el administrador. */
export type RolConfigurable = Exclude<Role, "admin">;
export const ROLES_CONFIGURABLES: RolConfigurable[] = ROLES.filter((r): r is RolConfigurable => r !== "admin");

/** Siguen siendo solo del administrador pase lo que pase con la configuración. */
export const PERMISOS_SOLO_ADMIN: Permission[] = ["users.manage", "practice.config"];

export interface AjustesDeRol {
  /** Permisos que el rol gana aunque la matriz de fábrica no se los dé. */
  dar?: Permission[];
  /** Permisos que el rol pierde aunque la matriz de fábrica se los dé. */
  quitar?: Permission[];
}

/** Lo que guarda la clínica en `config.permisos`: los ajustes de cada rol (de fábrica o propio), por id. */
export type PermisosDeLaClinica = Partial<Record<string, AjustesDeRol>>;

/** Un rol que creó la clínica. Su id es lo que se guarda en `User.role`. */
export interface RolPropio {
  id: string;
  nombre: string;
}

/** Cuánto puede medir el nombre de un rol (propio o de fábrica con otro nombre). */
export const MAX_NOMBRE_DE_ROL = 40;

/** ¿Es el id de un rol de fábrica? */
export function esRolDeFabrica(role: string): role is Role {
  return (ROLES as string[]).includes(role);
}

/** ¿Lo tiene este rol en la matriz de fábrica, sin mirar los ajustes de ninguna clínica? Un rol propio no tiene nada de fábrica. */
export function permisoDeFabrica(role: RolId, p: Permission): boolean {
  return esRolDeFabrica(role) && MATRIX[p].includes(role);
}

const ID_DE_ROL = /^[A-Za-z0-9_-]{1,40}$/;

/** ¿Sirve como id de un rol propio (o como clave de `config.permisos`)? Letras, números, «_» y «-»; nunca el del administrador ni un nombre
 *  que ya existe en todos los objetos de JavaScript («constructor», «__proto__», «toString»…). */
export function esIdDeRolValido(id: unknown): id is string {
  return typeof id === "string" && ID_DE_ROL.test(id) && id !== "admin" && id !== "prototype" && !(id in Object.prototype);
}

const tieneClave = (o: object | undefined, k: string): boolean => !!o && Object.prototype.hasOwnProperty.call(o, k);

/** Fábrica + ajustes. Si un permiso está en `dar` y en `quitar` gana `dar`: es la misma cuenta que hace
 *  `tienePermiso()` en firestore.rules, y las dos tienen que dar siempre lo mismo. Los ajustes tienen que venir ya limpios
 *  (`normalizarPermisos`). */
export function permisoEfectivo(role: RolId, p: Permission, permisos?: PermisosDeLaClinica): boolean {
  if (role === "admin") return true;
  if (PERMISOS_SOLO_ADMIN.includes(p)) return false;
  const ajustes = tieneClave(permisos, role) ? permisos?.[role] : undefined;
  if (ajustes?.dar?.includes(p)) return true;
  return permisoDeFabrica(role, p) && !ajustes?.quitar?.includes(p);
}

const CLAVES_DE_PERMISO = new Set<string>(ALL_PERMISSIONS);

function listaDePermisos(x: unknown): Permission[] {
  if (!Array.isArray(x)) return [];
  const vistos = new Set<unknown>(x);
  return ALL_PERMISSIONS.filter((p) => vistos.has(p) && CLAVES_DE_PERMISO.has(p) && !PERMISOS_SOLO_ADMIN.includes(p));
}

/** Los de fábrica primero (en su orden) y detrás los propios, por orden alfabético: así dos configuraciones iguales se escriben igual. */
const ordenDeRol = (id: string): number => {
  const i = ROLES_CONFIGURABLES.indexOf(id as RolConfigurable);
  return i === -1 ? ROLES_CONFIGURABLES.length : i;
};

/** Limpia lo que llega de Firestore (que se puede editar a mano o venir de una versión vieja): se queda con
 *  ids de rol válidos y permisos que existen y se pueden repartir, sin repetidos y en el orden de la matriz.
 *  `undefined` = la clínica no ajustó nada. */
export function normalizarPermisos(raw: unknown): PermisosDeLaClinica | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const limpio: PermisosDeLaClinica = {};
  const ids = Object.keys(raw).filter(esIdDeRolValido).sort((a, b) => ordenDeRol(a) - ordenDeRol(b) || a.localeCompare(b));
  for (const rol of ids) {
    const ajustes = (raw as Record<string, unknown>)[rol];
    if (!ajustes || typeof ajustes !== "object") continue;
    const dar = listaDePermisos((ajustes as { dar?: unknown }).dar);
    const quitar = listaDePermisos((ajustes as { quitar?: unknown }).quitar);
    if (dar.length || quitar.length) limpio[rol] = { dar, quitar };
  }
  return Object.keys(limpio).length ? limpio : undefined;
}

/** ¿Dos configuraciones dicen lo mismo? Las compara ya limpias, así que el orden, los repetidos y las listas
 *  vacías no cuentan. El store lo usa para no volver a pintar cuando el eco de una escritura propia trae lo mismo. */
export function mismosPermisos(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizarPermisos(a) ?? null) === JSON.stringify(normalizarPermisos(b) ?? null);
}

const nombreLimpio = (x: unknown): string => (typeof x === "string" ? x.trim() : "");

/** Limpia `config.rolesPropios`: ids válidos y que no chocan con los de fábrica, sin repetidos, con nombre. */
export function normalizarRolesPropios(raw: unknown): RolPropio[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  const limpio: RolPropio[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const { id, nombre } = r as { id?: unknown; nombre?: unknown };
    const n = nombreLimpio(nombre);
    if (!esIdDeRolValido(id) || esRolDeFabrica(id) || vistos.has(id) || !n || n.length > MAX_NOMBRE_DE_ROL) continue;
    vistos.add(id);
    limpio.push({ id, nombre: n });
  }
  return limpio;
}

/** Los otros nombres que la clínica les puso a los roles de fábrica. */
export type NombresDeRoles = Partial<Record<Role, string>>;

/** Limpia `config.nombresDeRoles`: solo roles de fábrica, con un nombre que se pueda leer. */
export function normalizarNombresDeRoles(raw: unknown): NombresDeRoles {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const limpio: NombresDeRoles = {};
  for (const rol of ROLES) {
    const n = nombreLimpio((raw as Record<string, unknown>)[rol]);
    if (n && n.length <= MAX_NOMBRE_DE_ROL) limpio[rol] = n;
  }
  return limpio;
}

/** ¿Cambió algo de los roles (permisos, roles propios o nombres) entre dos versiones de `clinic.config`? Compara ya limpio: el orden, los
 *  repetidos, los espacios y las listas vacías no cuentan, y el resto de la configuración tampoco. El store lo usa para no pisar nada cuando
 *  el eco de una escritura propia trae lo mismo. */
export function mismaConfiguracionDeRoles(a: unknown, b: unknown): boolean {
  const clave = (c: unknown): string => {
    const x = c && typeof c === "object" && !Array.isArray(c) ? (c as { permisos?: unknown; rolesPropios?: unknown; nombresDeRoles?: unknown }) : {};
    return JSON.stringify([normalizarPermisos(x.permisos) ?? null, normalizarRolesPropios(x.rolesPropios), normalizarNombresDeRoles(x.nombresDeRoles)]);
  };
  return clave(a) === clave(b);
}

/* Los ajustes de la clínica cargada. Los pone el store cada vez que cambian, así las ~100 llamadas a `can(role, p)` y
 * las etiquetas de rol repartidas por las pantallas los respetan sin tocar ninguna. Es estado de módulo y solo vive en el
 * navegador: las rutas del servidor NO lo usan, le pasan los ajustes de la clínica a `can()`. */
let permisosActivos: PermisosDeLaClinica | undefined;
let rolesPropiosActivos: RolPropio[] = [];
let nombresActivos: NombresDeRoles = {};

/** Aplica solo los permisos (los tests y las rutas de servidor que arman los suyos). */
export function aplicarPermisosDeLaClinica(raw: unknown): void {
  permisosActivos = normalizarPermisos(raw);
}

/** Aplica lo que la clínica configuró de sus roles: permisos, roles propios y nombres. Recibe `clinic.config` tal cual (o `undefined`). */
export function aplicarRolesDeLaClinica(config: unknown): void {
  const c = config && typeof config === "object" && !Array.isArray(config)
    ? (config as { permisos?: unknown; rolesPropios?: unknown; nombresDeRoles?: unknown })
    : undefined;
  permisosActivos = normalizarPermisos(c?.permisos);
  rolesPropiosActivos = normalizarRolesPropios(c?.rolesPropios);
  nombresActivos = normalizarNombresDeRoles(c?.nombresDeRoles);
}

/** ¿Puede este rol? Sin tercer argumento usa los ajustes aplicados con `aplicarRolesDeLaClinica`; con él,
 *  esos (las rutas del servidor leen `config.permisos` de la clínica y se los pasan). */
export function can(role: RolId, p: Permission, permisos?: PermisosDeLaClinica): boolean {
  return permisoEfectivo(role, p, permisos ?? permisosActivos);
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  cashier: "Recepción y caja",
  receptionist: "Recepcionista",
  commercial: "Comercial",
  dentist: "Dentista",
  assistant: "Asistente de doctores",
};

/** Una línea por rol para el selector de Usuarios y el inicio. */
export const ROLE_DESCRIPCION: Record<Role, string> = {
  admin: "Acceso completo, incluida la configuración de la clínica.",
  cashier: "Agenda de todos, datos del paciente, cobros y arqueo de caja. No ve reportes del negocio.",
  receptionist: "Agenda de todos, datos del paciente para cargarlos o editarlos y sus tratamientos sin montos. De la ficha clínica solo ve los documentos (Historia Clínica y consentimientos).",
  commercial: "Agenda de todos, datos del paciente, presupuestos con sus montos y el seguimiento comercial (CRM). No cobra ni entra a la ficha clínica ni ve los reportes del negocio.",
  dentist: "Su agenda (solo lectura), sus planes de tratamiento y la ficha clínica de sus pacientes. No ve montos ni datos personales.",
  assistant: "La agenda, los planes y la ficha de los doctores que tenga asignados, en solo lectura. No ve montos ni datos personales.",
};

/** ¿Es un rol propio de la clínica cargada? */
export function esRolPropio(role: RolId): boolean {
  return rolesPropiosActivos.some((r) => r.id === role);
}

/** Cómo se llama este rol en ESTA clínica: el nombre del rol propio, el de fábrica (con el otro nombre que le hayan puesto) o «Rol sin nombre». */
export function rolLabel(role: RolId): string {
  const propio = rolesPropiosActivos.find((r) => r.id === role);
  if (propio) return propio.nombre;
  if (esRolDeFabrica(role)) return nombresActivos[role] ?? ROLE_LABEL[role];
  return "Rol sin nombre";
}

/** Una línea sobre lo que hace este rol, para los selectores y el inicio. */
export function rolDescripcion(role: RolId): string {
  if (esRolPropio(role)) return "Rol propio de tu clínica: lo que puede ver y hacer se elige en Administración › Permisos del equipo.";
  return esRolDeFabrica(role) ? ROLE_DESCRIPCION[role] : "";
}

/** Los roles que se pueden asignar a una persona de esta clínica: los de fábrica en su orden y detrás los propios. */
export function rolesParaElegir(): { id: RolId; nombre: string; deFabrica: boolean }[] {
  return [
    ...ROLES.map((id) => ({ id: id as RolId, nombre: rolLabel(id), deFabrica: true })),
    ...rolesPropiosActivos.map((r) => ({ id: r.id, nombre: r.nombre, deFabrica: false })),
  ];
}
