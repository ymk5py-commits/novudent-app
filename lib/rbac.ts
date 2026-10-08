import type { Role } from "./types";

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
export const ROLES: Role[] = ["admin", "cashier", "receptionist", "dentist", "assistant"];

const MATRIX: Record<Permission, Role[]> = {
  "users.manage": ["admin"],
  "practice.config": ["admin"],
  // Todos ven la agenda; dentista y asistente, solo la suya o la de sus doctores y en
  // solo lectura: los cambios de horario los hace la recepción (revisión del 27/9/2026).
  "agenda.view": ROLES,
  "agenda.create": ["admin", "cashier", "receptionist"],
  "agenda.edit": ["admin", "cashier", "receptionist"],
  "agenda.all": ["admin", "cashier", "receptionist"],
  "patients.personal": ["admin", "cashier", "receptionist"],
  "emr.read": ["admin", "dentist", "assistant"], // asistente: solo lectura
  "emr.write": ["admin", "dentist"],
  // La recepcionista ve los tratamientos sin montos (revisión del 27/9/2026: «ir a
  // tratamientos sin montos» desde el listado de pacientes).
  "plans.view": ["admin", "cashier", "receptionist", "dentist", "assistant"],
  "plans.create": ["admin", "dentist"],
  // La plata queda en administración y en la caja: ni la recepción ni lo clínico ven montos.
  "money.view": ["admin", "cashier"],
  "billing.submit": ["admin", "cashier"],
  "billing.finalize": ["admin"],
  // Números del NEGOCIO (ingresos, producción, análisis, liquidaciones): solo el
  // dueño. La caja cobra y hace el arqueo (payments.manage) pero no ve la
  // facturación global ni cuánto gana cada profesional.
  "billing.reports": ["admin"],
  "engagement.forms": ["admin", "cashier", "receptionist"],
  "tasks.use": ROLES,
  "budgets.manage": ["admin", "cashier"],
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
 * Qué NO se puede tocar: el administrador (siempre tiene todo) y los permisos de `PERMISOS_SOLO_ADMIN`
 * (crear usuarios y configurar la clínica: quien los reparte se los daría a sí mismo).
 *
 * Qué hace cumplir cada cosa: los permisos de ejecución con regla propia en `firestore.rules`
 * (payments.manage, engagement.forms, emr.write, expenses.manage, billing.reports) se bloquean en el servidor;
 * el resto cambia lo que se ve y los botones, pero Firestore sigue dejando leer a todo miembro de la clínica. */

/** Los roles que la clínica puede configurar: todos menos el administrador. */
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

/** Lo que guarda la clínica en `config.permisos`: los ajustes de cada rol. */
export type PermisosDeLaClinica = Partial<Record<RolConfigurable, AjustesDeRol>>;

/** ¿Lo tiene este rol en la matriz de fábrica, sin mirar los ajustes de ninguna clínica? */
export function permisoDeFabrica(role: Role, p: Permission): boolean {
  return MATRIX[p].includes(role);
}

/** Fábrica + ajustes. Si un permiso está en `dar` y en `quitar` gana `dar`: es la misma cuenta que hace
 *  `tienePermiso()` en firestore.rules, y las dos tienen que dar siempre lo mismo. */
export function permisoEfectivo(role: Role, p: Permission, permisos?: PermisosDeLaClinica): boolean {
  if (role === "admin") return true;
  if (PERMISOS_SOLO_ADMIN.includes(p)) return false;
  const ajustes = permisos?.[role];
  if (ajustes?.dar?.includes(p)) return true;
  return permisoDeFabrica(role, p) && !ajustes?.quitar?.includes(p);
}

const CLAVES_DE_PERMISO = new Set<string>(ALL_PERMISSIONS);

function listaDePermisos(x: unknown): Permission[] {
  if (!Array.isArray(x)) return [];
  const vistos = new Set<unknown>(x);
  return ALL_PERMISSIONS.filter((p) => vistos.has(p) && CLAVES_DE_PERMISO.has(p) && !PERMISOS_SOLO_ADMIN.includes(p));
}

/** Limpia lo que llega de Firestore (que se puede editar a mano o venir de una versión vieja): se queda con
 *  roles configurables y permisos que existen y se pueden repartir, sin repetidos y en el orden de la matriz.
 *  `undefined` = la clínica no ajustó nada. */
export function normalizarPermisos(raw: unknown): PermisosDeLaClinica | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const limpio: PermisosDeLaClinica = {};
  for (const rol of ROLES_CONFIGURABLES) {
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

/* Los ajustes de la clínica cargada. Los pone el store cada vez que cambia `config.permisos`, así las 100
 * llamadas a `can(role, p)` repartidas por las pantallas los respetan sin tocar ninguna. Es estado de módulo y
 * solo vive en el navegador: las rutas del servidor NO lo usan, le pasan los ajustes de la clínica a `can()`. */
let permisosActivos: PermisosDeLaClinica | undefined;

export function aplicarPermisosDeLaClinica(raw: unknown): void {
  permisosActivos = normalizarPermisos(raw);
}

/** ¿Puede este rol? Sin tercer argumento usa los ajustes aplicados con `aplicarPermisosDeLaClinica`; con él,
 *  esos (las rutas del servidor leen `config.permisos` de la clínica y se los pasan). */
export function can(role: Role, p: Permission, permisos?: PermisosDeLaClinica): boolean {
  return permisoEfectivo(role, p, permisos ?? permisosActivos);
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  cashier: "Recepción y caja",
  receptionist: "Recepcionista",
  dentist: "Dentista",
  assistant: "Asistente de doctores",
};

/** Una línea por rol para el selector de Usuarios y el inicio. */
export const ROLE_DESCRIPCION: Record<Role, string> = {
  admin: "Acceso completo, incluida la configuración de la clínica.",
  cashier: "Agenda de todos, datos del paciente, cobros y arqueo de caja. No ve reportes del negocio.",
  receptionist: "Agenda de todos, datos del paciente para cargarlos o editarlos y sus tratamientos sin montos. De la ficha clínica solo ve los documentos (Historia Clínica y consentimientos).",
  dentist: "Su agenda (solo lectura), sus planes de tratamiento y la ficha clínica de sus pacientes. No ve montos ni datos personales.",
  assistant: "La agenda, los planes y la ficha de los doctores que tenga asignados, en solo lectura. No ve montos ni datos personales.",
};
