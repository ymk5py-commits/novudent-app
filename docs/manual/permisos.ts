/** Los permisos de `lib/rbac.ts` en palabras de todos los días. Sirven para el apéndice «Qué puede hacer cada rol» y para la
 *  hoja «Tu rol» de cada capítulo, que se arman llamando a `can()`: si cambia la matriz, el manual cambia solo.
 *
 *  `montar.test.ts` exige que acá esté TODA clave de `Permission`: sumar un permiso sin explicarlo rompe `npm test`. */
import type { Permission } from "../../lib/rbac";

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
