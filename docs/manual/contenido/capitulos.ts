import type { CapituloId } from "./tipos";

/** Título e introducción de cada capítulo. Los procedimientos viven en los módulos de esta carpeta (ver `index.ts`). */
export const CAPITULOS_META: Record<CapituloId, { titulo: string; intro: string }> = {
  todos: {
    titulo: "Para todos",
    intro: "Esto lo hace cualquier persona del equipo, sea cual sea su rol: entrar al sistema, ubicarse en Inicio, buscar a un paciente y mirar las tareas y los avisos del día.",
  },
  receptionist: {
    titulo: "Recepcionista",
    intro: "La recepción es la cara de la clínica: da las citas, carga a los pacientes nuevos y deja listos sus documentos. Con este rol trabajás con la agenda de todos los profesionales y con los datos del paciente, sin ver plata.",
  },
  cashier: {
    titulo: "Recepción y caja",
    intro: "«Recepción y caja» hace todo lo que hace la recepción y además cobra: ingresa los pagos, abre y cierra la caja y arma los presupuestos. No ve los reportes del negocio.",
  },
  dentist: {
    titulo: "Dentista",
    intro: "El dentista atiende: mira su agenda, trabaja la ficha clínica de sus pacientes y arma sus planes de tratamiento. Con este rol no ves montos ni datos personales.",
  },
  assistant: {
    titulo: "Asistente de doctores",
    intro: "La asistente acompaña a los doctores que tenga asignados: ve su agenda, sus planes y la ficha de sus pacientes, pero solo para leer. No cobra ni ve montos.",
  },
  admin: {
    titulo: "Administrador",
    intro: "La administración tiene acceso a todo y es la única que configura la clínica: usuarios, arancel, plantillas y reportes. Además de lo de este capítulo, puede hacer todo lo de los otros roles.",
  },
};
