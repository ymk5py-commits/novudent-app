/** Respuestas comprobables del asistente de ayuda. No lee datos de pacientes ni llama a servicios externos. */
export type RespuestaAyuda = { texto: string; enlace?: { texto: string; href: string } };

const normalizar = (texto: string) => texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function responderAyuda(consulta: string): RespuestaAyuda {
  const t = normalizar(consulta);

  if (/error|fall[ao]|no funciona|no puedo|problema|soporte|humano|contacto|hablar con/.test(t)) {
    return { texto: "Contame qué intentaste hacer y qué pasó. Si necesitás que lo revise una persona, prepará el correo de abajo para el equipo de NOVUM. No incluyas datos de pacientes." };
  }
  if (/odontograma|pieza|diente|superficie/.test(t)) {
    return { texto: "El odontograma está dentro de la ficha de cada paciente. Abrí Pacientes, elegí la ficha y entrá en Odontograma. Lo que podés editar depende de tu rol.", enlace: { texto: "Ir a Pacientes", href: "/app/pacientes" } };
  }
  if (/agenda|cita|turno|reserva|calendario/.test(t)) {
    return { texto: "En Agenda podés ver las citas por día, semana o mes y crear un turno desde un espacio libre. Las opciones disponibles dependen de tu rol.", enlace: { texto: "Abrir Agenda", href: "/app/agenda" } };
  }
  if (/presupuesto|plan de tratamiento|cuotas/.test(t)) {
    return { texto: "Los presupuestos se preparan en la ficha del paciente. También podés revisar los presupuestos desde su sección del menú, según los permisos de tu cuenta.", enlace: { texto: "Ver Presupuestos", href: "/app/presupuestos" } };
  }
  if (/factura|facturacion/.test(t)) {
    return { texto: "La sección Facturación muestra los registros y sus estados. El envío y la finalización requieren permisos del rol correspondiente.", enlace: { texto: "Ver Facturación", href: "/app/facturacion" } };
  }
  if (/caja|cobro|pago|ingreso|egreso/.test(t)) {
    return { texto: "En Caja se registran movimientos y se revisa el cierre. El acceso a importes y cobros depende del rol asignado en la clínica.", enlace: { texto: "Abrir Caja", href: "/app/caja" } };
  }
  if (/paciente|ficha|historia clinica/.test(t)) {
    return { texto: "En Pacientes encontrás la ficha clínica y sus secciones. Usá la búsqueda de la barra superior para abrir una ficha por nombre; la información visible depende de tu rol.", enlace: { texto: "Ir a Pacientes", href: "/app/pacientes" } };
  }
  if (/tarea|pendiente/.test(t)) {
    return { texto: "Tus tareas están en la sección Tareas. Desde allí podés revisar lo pendiente y abrir cada trabajo.", enlace: { texto: "Abrir Tareas", href: "/app/tareas" } };
  }
  if (/precio|suscripcion|plan solo|plan clinica|plan cadena/.test(t)) {
    return { texto: "Los planes y precios de Novudent están publicados. Tu plan actual también se ve en la aplicación.", enlace: { texto: "Ver planes y precios", href: "/precios" } };
  }
  if (/clave|contrasena|inicio de sesion|iniciar sesion|acceso/.test(t)) {
    return { texto: "Si no podés entrar, revisá el correo y la contraseña de tu cuenta. Para un problema de acceso de tu clínica, prepará el correo de abajo para el equipo de NOVUM. No compartas tu contraseña." };
  }
  return { texto: "No tengo una respuesta verificada para eso. Podés preparar un correo con tu consulta para que el equipo de NOVUM te responda. No incluyas datos de pacientes." };
}
