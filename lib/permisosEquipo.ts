/** Lógica pura de Configuración › Permisos del equipo: qué puede hacer cada rol en ESTA clínica, qué se guarda y qué
 *  arrastra cada cambio. La matriz de fábrica y `can()` están en `lib/rbac.ts`; esto es lo que usa la pantalla. */
import {
  ALL_PERMISSIONS, PERMISOS_SOLO_ADMIN, ROLES_CONFIGURABLES, permisoDeFabrica, permisoEfectivo,
  type Permission, type PermisosDeLaClinica, type RolConfigurable,
} from "./rbac";
import type { Role } from "./types";

/** Lo que cada permiso necesita para servir de algo. Dar «cobrar» sin «ver montos» dejaría una caja que no muestra
 *  cuánto cobra; sacar «ver la ficha» y dejar «escribir en la ficha» dejaría un botón sobre una pantalla vacía. */
export const REQUIERE: Partial<Record<Permission, Permission[]>> = {
  "agenda.create": ["agenda.view"],
  "agenda.edit": ["agenda.view"],
  "agenda.all": ["agenda.view"],
  "emr.write": ["emr.read"],
  "plans.create": ["plans.view"],
  "budgets.manage": ["money.view"],
  "payments.manage": ["money.view"],
  "billing.submit": ["money.view"],
  "billing.finalize": ["money.view"],
  "billing.reports": ["money.view"],
  "expenses.manage": ["money.view"],
};

/** Los permisos de un rol en esta clínica (fábrica + lo que se dio y se sacó), en el orden de la matriz. */
export function efectivosDe(rol: Role, permisos?: PermisosDeLaClinica): Permission[] {
  return ALL_PERMISSIONS.filter((p) => permisoEfectivo(rol, p, permisos));
}

/** La diferencia contra la fábrica: lo único que hace falta guardar de un rol. */
export function ajustesDesdeEfectivos(rol: RolConfigurable, efectivos: Iterable<Permission>): { dar: Permission[]; quitar: Permission[] } {
  const tiene = new Set(efectivos);
  const repartibles = ALL_PERMISSIONS.filter((p) => !PERMISOS_SOLO_ADMIN.includes(p));
  return {
    dar: repartibles.filter((p) => tiene.has(p) && !permisoDeFabrica(rol, p)),
    quitar: repartibles.filter((p) => !tiene.has(p) && permisoDeFabrica(rol, p)),
  };
}

/** Lo que va a `config.permisos`: SIEMPRE los cuatro roles con sus dos listas, aunque estén vacías. `setDoc(…, {merge:
 *  true})` mezcla los mapas y no borra una clave ausente: para que «volver a la fábrica» se guarde de verdad hay que
 *  escribir las listas vacías, no omitir el rol. */
export function permisosParaGuardar(efectivosPorRol: Record<RolConfigurable, Iterable<Permission>>): Record<RolConfigurable, { dar: Permission[]; quitar: Permission[] }> {
  const guardado = {} as Record<RolConfigurable, { dar: Permission[]; quitar: Permission[] }>;
  for (const rol of ROLES_CONFIGURABLES) guardado[rol] = ajustesDesdeEfectivos(rol, efectivosPorRol[rol]);
  return guardado;
}

export interface CambioDePermiso {
  efectivos: Set<Permission>;
  /** Lo que se movió además del permiso tocado, para avisarlo en pantalla. */
  tambien: { activados: Permission[]; sacados: Permission[] };
}

/** Da o saca un permiso y arrastra lo que depende de él (`REQUIERE`): al dar uno se dan los que necesita; al sacar
 *  uno se sacan los que lo necesitan. No modifica el conjunto que recibe. Los permisos solo del administrador no se mueven. */
export function cambiarPermiso(efectivos: ReadonlySet<Permission>, p: Permission, valor: boolean): CambioDePermiso {
  const siguiente = new Set(efectivos);
  const activados = new Set<Permission>();
  const sacados = new Set<Permission>();
  if (!PERMISOS_SOLO_ADMIN.includes(p)) {
    const pendientes: Permission[] = [p];
    while (pendientes.length) {
      const q = pendientes.pop()!;
      if (valor) {
        if (!siguiente.has(q)) { siguiente.add(q); if (q !== p) activados.add(q); }
        for (const necesita of REQUIERE[q] ?? []) if (!siguiente.has(necesita)) pendientes.push(necesita);
      } else {
        if (siguiente.has(q)) { siguiente.delete(q); if (q !== p) sacados.add(q); }
        for (const otro of ALL_PERMISSIONS) if (siguiente.has(otro) && REQUIERE[otro]?.includes(q)) pendientes.push(otro);
      }
    }
  }
  const enOrden = (s: Set<Permission>) => ALL_PERMISSIONS.filter((x) => s.has(x));
  return { efectivos: siguiente, tambien: { activados: enOrden(activados), sacados: enOrden(sacados) } };
}

export interface GrupoDePermisos {
  id: string;
  titulo: string;
  permisos: Permission[];
}

/** Cómo se ordenan en pantalla. El último grupo son los permisos que no se reparten. */
export const GRUPOS_DE_PERMISOS: GrupoDePermisos[] = [
  { id: "agenda-y-pacientes", titulo: "Agenda y pacientes", permisos: ["agenda.view", "agenda.create", "agenda.edit", "agenda.all", "patients.personal", "engagement.forms", "tasks.use"] },
  { id: "ficha-clinica", titulo: "Ficha clínica", permisos: ["emr.read", "emr.write", "plans.view", "plans.create"] },
  { id: "dinero", titulo: "Dinero", permisos: ["money.view", "budgets.manage", "payments.manage", "billing.submit", "billing.finalize", "billing.reports", "expenses.manage"] },
  { id: "gestion", titulo: "Gestión", permisos: ["inventory.manage", "labs.manage"] },
  { id: "solo-administrador", titulo: "Solo el administrador", permisos: PERMISOS_SOLO_ADMIN },
];

/** «Ver» = qué información aparece en pantalla; «hacer» = qué acciones puede ejecutar (las dos mitades del pedido de Camila:
 *  «dar y sacar permisos de acceso a información o ejecución»). Solo ordena y etiqueta la pantalla; no cambia ningún permiso. */
export const TIPO_DE_PERMISO: Record<Permission, "ver" | "hacer"> = {
  "agenda.view": "ver",
  "agenda.create": "hacer",
  "agenda.edit": "hacer",
  "agenda.all": "ver",
  "patients.personal": "ver",
  "engagement.forms": "hacer",
  "tasks.use": "hacer",
  "emr.read": "ver",
  "emr.write": "hacer",
  "plans.view": "ver",
  "plans.create": "hacer",
  "money.view": "ver",
  "budgets.manage": "hacer",
  "payments.manage": "hacer",
  "billing.submit": "hacer",
  "billing.finalize": "hacer",
  "billing.reports": "ver",
  "expenses.manage": "hacer",
  "inventory.manage": "hacer",
  "labs.manage": "hacer",
  "practice.config": "hacer",
  "users.manage": "hacer",
};

/** Los permisos con regla propia en `firestore.rules`: aunque alguien lo intente por fuera de la pantalla, el sistema no lo
 *  deja. Los demás cambian lo que se ve y los botones, pero la lectura de los datos sigue abierta a todo el equipo de la
 *  clínica. Un test ata esta lista a `tienePermiso()` de las reglas. */
export const QUE_BLOQUEA_EL_SISTEMA: Partial<Record<Permission, string>> = {
  "payments.manage": "los cobros, los documentos fiscales y la caja",
  "engagement.forms": "las firmas y los documentos clínicos",
  "emr.write": "la ficha clínica, las radiografías y los documentos clínicos",
  "expenses.manage": "los gastos",
  "billing.reports": "las liquidaciones",
};

export const PERMISOS_QUE_EXIGE_EL_SERVIDOR = Object.keys(QUE_BLOQUEA_EL_SISTEMA) as Permission[];

/** Cada permiso en palabras de todos los días: la pantalla, el apéndice «Qué puede hacer cada rol» del manual y la hoja
 *  «Tu rol» de cada capítulo (docs/manual/permisos.ts lo reexporta). Sumar un permiso sin explicarlo rompe `npm test`. */
export const PERMISOS_EN_PALABRAS: Record<Permission, string> = {
  "agenda.view": "Ver la agenda",
  "agenda.create": "Dar citas",
  "agenda.edit": "Cambiar, confirmar y anular citas",
  "agenda.all": "Ver y agendar con todos los profesionales",
  "patients.personal": "Ver y editar los datos personales del paciente (teléfono, correo, CI)",
  "emr.read": "Leer la ficha clínica",
  "emr.write": "Escribir en la ficha clínica (evoluciones, odontograma, recetas)",
  "plans.view": "Ver los planes de tratamiento",
  "plans.create": "Armar planes de tratamiento",
  "money.view": "Ver montos: precios, presupuestos, deudas y saldos",
  "budgets.manage": "Presentar y aceptar presupuestos",
  "payments.manage": "Cobrar y hacer el arqueo de caja",
  "billing.submit": "Gestionar los cobros y su seguimiento",
  "billing.finalize": "Finalizar las facturas retenidas",
  "billing.reports": "Ver los reportes y los números del negocio",
  "engagement.forms": "Documentos clínicos, consentimientos y CRM",
  "tasks.use": "Usar las tareas del equipo",
  "expenses.manage": "Cargar los gastos de la clínica",
  "inventory.manage": "Manejar el inventario",
  "labs.manage": "Manejar las órdenes de laboratorio",
  "practice.config": "Configurar la clínica (datos, sucursales, arancel, plantillas)",
  "users.manage": "Crear usuarios y cambiar sus roles",
};
