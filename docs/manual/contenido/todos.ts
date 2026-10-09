import type { Procedimiento } from "./tipos";

export const procedimientos: Procedimiento[] = [
  {
    id: "entrar-al-sistema",
    capitulo: "todos",
    titulo: "Entrar al sistema y salir",
    roles: ["receptionist", "cashier", "commercial", "dentist", "assistant", "admin"],
    paraQue: "Al empezar la jornada, y al terminarla o cuando le prestás la computadora a otra persona.",
    antes: ["Tener tu usuario y tu contraseña: te los da la administración de tu clínica."],
    pasos: [
      { texto: "Abrí Novudent en el navegador, con la dirección que te dio tu clínica." },
      { texto: "Escribí tu **correo** y tu **contraseña**, y tocá «Entrar».", captura: "formulario" },
      { texto: "Si no te acordás de la contraseña, tocá «¿Olvidaste tu contraseña?» en la misma pantalla: te mandamos un correo para que elijas otra.", captura: "olvido" },
      { texto: "Para salir, tocá tu nombre (arriba a la derecha) y elegí «Cerrar sesión».", captura: "salir" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Cada persona tiene su propio usuario. No compartas el tuyo: todo lo que se hace queda registrado con el nombre de quien entró." },
      { tipo: "tip", texto: "Si usás una computadora compartida, cerrá siempre la sesión al terminar." },
      { tipo: "revisar", texto: "Confirmar qué dirección de acceso se le entrega al cliente (hoy hay una de Vercel y otra propia de Novum)." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await page.goto("/login");
      await page.getByLabel("Email").fill("laura@tuclinica.com");
      await page.getByLabel("Contraseña", { exact: true }).fill("miclave123");
      await c.foto("formulario", {
        resaltar: [page.getByLabel("Email"), page.getByLabel("Contraseña", { exact: true }), page.getByRole("button", { name: "Entrar" })],
        recorte: page.getByRole("heading", { name: "Bienvenido de nuevo" }).locator("xpath=ancestor::div[2]"),
      });
      await c.foto("olvido", { resaltar: page.getByRole("button", { name: "¿Olvidaste tu contraseña?" }), recorte: page.getByRole("heading", { name: "Bienvenido de nuevo" }).locator("xpath=ancestor::div[2]") });

      await c.entrar("receptionist", "/app");
      await page.getByRole("button", { name: /^Menú de / }).click();
      await c.foto("salir", { resaltar: page.getByRole("menuitem", { name: "Cerrar sesión" }), recorte: [page.getByRole("button", { name: /^Menú de / }), page.getByRole("menu", { name: "Menú del usuario" })] });
    },
  },
  {
    id: "conocer-inicio",
    capitulo: "todos",
    titulo: "Conocer la pantalla de Inicio",
    roles: ["receptionist", "cashier", "commercial", "dentist", "assistant", "admin"],
    paraQue: "Es lo primero que ves al entrar. Te dice cómo viene el día y te lleva rápido a lo importante.",
    pasos: [
      { texto: "Al entrar llegás a **Inicio**. Arriba están el saludo y cuántas citas tenés hoy.", captura: "inicio" },
      { texto: "Las tarjetas de colores resumen el día: tocá una y vas directo a lo que cuenta (por ejemplo, **Documentos pendientes** abre la lista de pacientes que tienen algo por completar).", captura: "tarjetas" },
      { texto: "Más abajo está **Mi agenda**, con lo que te toca a vos: tus tareas y la rutina del día. Mirá [[usar-mi-agenda]]." },
      { texto: "El menú de arriba te lleva a cada sección. Solo aparece lo que podés usar con tu rol.", captura: "menu" },
    ],
    avisos: [
      { tipo: "tip", texto: "Tocá el logotipo de Novudent, arriba a la izquierda, para volver a Inicio desde cualquier pantalla." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("receptionist", "/app");
      await c.foto("inicio", { recorte: page.getByRole("heading", { name: /^Hola,/ }).locator("xpath=ancestor::div[contains(@class,'dashboard-hero')]") });
      await c.foto("tarjetas", { resaltar: [page.getByRole("link", { name: /Citas de hoy/ }), page.getByRole("link", { name: /Documentos pendientes/ })], recorte: [page.getByRole("link", { name: /Citas de hoy/ }), page.getByRole("link", { name: /Documentos pendientes/ })] });
      await c.foto("menu", { resaltar: page.getByRole("navigation").first(), recorte: page.getByRole("navigation").first() });
    },
  },
  {
    id: "cambiar-tu-contrasena",
    capitulo: "todos",
    titulo: "Cambiar tu contraseña",
    roles: ["receptionist", "cashier", "commercial", "dentist", "assistant", "admin"],
    paraQue: "Cuando la administración te dio una contraseña provisoria, o cuando querés cambiar la que tenés.",
    pasos: [
      { texto: "Tocá tu nombre (arriba a la derecha) y elegí «Mi perfil».", captura: "menu" },
      { texto: "En **Cambiar contraseña**, escribí la contraseña nueva y repetila.", captura: "campos" },
      { texto: "Tocá «Guardar contraseña». Cuando aparece el aviso verde, la contraseña nueva ya rige." },
    ],
    avisos: [
      { tipo: "ojo", texto: "La contraseña tiene que tener al menos 6 caracteres, y las dos tienen que ser iguales." },
      { tipo: "tip", texto: "Si te olvidaste la contraseña y no podés entrar, usá «¿Olvidaste tu contraseña?» en la pantalla de ingreso: ver [[entrar-al-sistema]]." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("receptionist", "/app");
      await page.getByRole("button", { name: /^Menú de / }).click();
      await c.foto("menu", { resaltar: page.getByRole("menuitem", { name: "Mi perfil" }), recorte: [page.getByRole("button", { name: /^Menú de / }), page.getByRole("menu", { name: "Menú del usuario" })] });
      await page.getByRole("menuitem", { name: "Mi perfil" }).click();
      const modal = page.getByRole("dialog", { name: "Mi perfil" });
      await modal.getByLabel("Contraseña nueva").fill("clavenueva1");
      await modal.getByLabel("Repetí la contraseña").fill("clavenueva1");
      await c.foto("campos", { resaltar: [modal.getByLabel("Contraseña nueva"), modal.getByLabel("Repetí la contraseña"), modal.getByRole("button", { name: "Guardar contraseña" })], recorte: modal, margen: 4 });
    },
  },
  {
    id: "usar-mi-agenda",
    capitulo: "todos",
    titulo: "Usar Mi agenda",
    roles: ["receptionist", "cashier", "commercial", "dentist", "assistant", "admin"],
    paraQue: "Para ordenar tu día y tu semana: lo que anotaste vos y lo que el sistema te recuerda, con una barra que muestra cuánto llevás hecho.",
    pasos: [
      { texto: "En **Inicio**, bajá hasta **Mi agenda**. «Hoy» muestra el día y «Semana», de lunes a domingo; la barra de arriba cuenta cuántas tareas llevás hechas.", captura: "tarjeta" },
      { texto: "Para anotar algo, escribilo en **Agregar una tarea…**, elegí el día y tocá «Agregar».", captura: "agregar" },
      { texto: "Cuando la hagas, tocá el cuadradito de la izquierda: la tarea pasa a **Hechas** y la barra sube. Si te equivocaste, tocalo de nuevo y vuelve a pendientes.", captura: "tildar" },
      { texto: "Las filas con una flecha → (como «Completar los documentos clínicos pendientes») son la **rutina del día**: se calculan solas y se tachan solas cuando lo resolvés. Tocalas para ir directo a donde se arregla.", captura: "rutina" },
      { texto: "«Con paciente…» anota una tarea de un paciente y te deja elegir que **se tache sola** cuando el paciente agende una cita, acepte el presupuesto o pague.", captura: "con-paciente" },
      { texto: "En «Semana» todo queda ordenado por día, y lo que no hiciste a tiempo aparece como **Atrasada**.", captura: "semana" },
      { texto: "«Todas» junta lo que te falta de **cualquier fecha**: primero lo atrasado y después cada día, sin lo que ya hiciste (en lugar de la barra dice cuántas pendientes tenés). Muestra las primeras 10; si hay más, «Ver todas en Tareas» te lleva a la lista completa.", captura: "todas" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Una tarea que le asignás a otra persona deja de ser tuya: ya no la ves en tu agenda, sino en la de ella." },
      { tipo: "tip", texto: "Para borrar una tarea tuya, pasá el mouse sobre la fila y tocá el tachito. Pide confirmación." },
      { tipo: "tip", texto: "Si tildás una tarea en «Todas», sale de la lista (ya no está pendiente): la ves entre las «Hechas» de «Hoy»." },
      { tipo: "tip", texto: "El administrador tiene además, justo arriba, la **Rutina del administrador** (lo que revisa cada día, cada semana y a fin de mes): mirá [[usar-la-rutina-del-administrador]]." },
      { tipo: "tip", texto: "En las clínicas con el plan Clínica hay además «Dictar la semana» (por voz o escribiendo) y «Resumen semanal»: la IA arma las tareas y vos las revisás antes de guardarlas." },
      { tipo: "revisar", texto: "Confirmar si la rutina del día alcanza o falta algún punto (hoy: citas de mañana, reservas online, documentos pendientes, caja y stock)." },
    ],
    capturar: async (c) => {
      const { page } = c;
      const tarjeta = page.getByRole("heading", { name: "Mi agenda" }).locator("xpath=ancestor::div[contains(@class,'p-5')][1]");
      await c.entrar("receptionist", "/app");
      await page.getByRole("heading", { name: "Mi agenda" }).scrollIntoViewIfNeeded();
      await c.foto("tarjeta", { recorte: tarjeta, resaltar: [page.getByRole("tab", { name: "Hoy" }), page.getByRole("progressbar", { name: "Avance de la agenda" })] });

      await page.getByLabel("Nueva tarea").fill("Llamar al laboratorio por la prótesis");
      await c.foto("agregar", { recorte: tarjeta, resaltar: [page.getByLabel("Nueva tarea"), page.getByLabel("Día de la tarea"), page.getByRole("button", { name: "Agregar", exact: true })] });
      await page.getByRole("button", { name: "Agregar", exact: true }).click();
      await c.expect(page.getByText("Llamar al laboratorio por la prótesis")).toBeVisible();
      await c.foto("tildar", { recorte: tarjeta, resaltar: page.getByRole("button", { name: "Marcar como hecha: Llamar al laboratorio por la prótesis" }) });

      await c.foto("rutina", { recorte: tarjeta, resaltar: page.getByRole("link", { name: "Completar los documentos clínicos pendientes", exact: true }) });

      await page.getByRole("button", { name: "Con paciente…" }).click();
      const modal = page.getByRole("dialog", { name: "Nueva tarea personalizada" });
      await modal.getByLabel("Buscar paciente").fill("Juan");
      await modal.getByRole("button", { name: "Juan Ríos" }).click();
      await modal.getByLabel("Detalle *").fill("Avisarle que su saldo está pendiente");
      await modal.getByLabel("Se tacha sola cuando el paciente…").selectOption({ label: "Registre un pago" });
      await c.foto("con-paciente", { alto: 900, margen: 4, resaltar: modal.getByLabel("Se tacha sola cuando el paciente…"), recorte: modal });
      await page.getByRole("dialog").last().getByRole("button", { name: "Cerrar" }).click(); // las ventanas no se cierran con Escape

      await page.getByRole("tab", { name: "Semana" }).click();
      await c.foto("semana", { recorte: tarjeta, resaltar: page.getByRole("tab", { name: "Semana" }) });

      await page.getByRole("tab", { name: "Todas", exact: true }).click();
      await c.foto("todas", { recorte: tarjeta, resaltar: page.getByRole("tab", { name: "Todas", exact: true }) });
    },
  },
  {
    id: "buscar-un-paciente",
    capitulo: "todos",
    titulo: "Buscar a un paciente",
    roles: ["receptionist", "cashier", "commercial", "dentist", "assistant", "admin"],
    paraQue: "Para abrir la ficha de un paciente en pocos segundos, estés donde estés.",
    pasos: [
      { texto: "Escribí el nombre (o la CI) en el buscador de arriba, **Buscar paciente…**. Aparecen hasta seis coincidencias.", captura: "buscador" },
      { texto: "Tocá el nombre del paciente: se abre su ficha." },
      { texto: "Para ver toda la lista, entrá a **Pacientes**. Ahí también podés buscar por nombre, CI o teléfono.", captura: "lista" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Con los roles clínicos (dentista y asistente de doctores) solo aparecen los pacientes de sus doctores, y se busca por nombre: la CI y el teléfono son datos personales que ese rol no ve." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("receptionist", "/app");
      const buscador = page.getByPlaceholder("Buscar paciente…");
      await buscador.fill("mar");
      await c.expect(page.getByRole("link", { name: /María González/ })).toBeVisible();
      const resultados = page.getByRole("link", { name: /María González/ }).locator("xpath=..");
      await c.foto("buscador", { resaltar: [buscador, page.getByRole("link", { name: /María González/ })], recorte: [buscador, resultados], ocultar: page.getByRole("navigation") }); // sin la fila del menú de atrás («Pacie…» asomando al costado del resultado)
      await c.ir("/app/pacientes");
      const lista = page.getByPlaceholder("Buscar por nombre, CI o teléfono…");
      await lista.fill("mar");
      await c.foto("lista", { resaltar: lista, pantalla: true, alto: 560 });
    },
  },
  {
    id: "ver-los-pendientes",
    capitulo: "todos",
    titulo: "Ver los pendientes de la campana",
    roles: ["receptionist", "cashier", "commercial", "admin"],
    paraQue: "Para saber de un vistazo qué pacientes tienen documentos clínicos sin completar (y, si ves montos, qué cobros están retenidos).",
    pasos: [
      { texto: "Mirá la campana de arriba: el número rojo es la cantidad de pacientes con algo pendiente.", captura: "campana" },
      { texto: "Tocala: se abre la lista con **cada paciente y qué le falta**.", captura: "panel" },
      { texto: "Tocá un paciente y vas directo a su ficha, en la pestaña de documentos, para completarlo. «Ver todos…» abre la lista de pacientes ya filtrada." },
    ],
    avisos: [
      { tipo: "tip", texto: "Cuando completás un documento, el paciente sale de la lista y el número baja." },
      { tipo: "ojo", texto: "Los roles clínicos (dentista y asistente) no gestionan documentos ni ven cobros, así que su campana dice «Sin pendientes»." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("receptionist", "/app");
      const campana = page.getByRole("button", { name: /^Ver pendientes/ });
      await c.foto("campana", { resaltar: campana, recorte: page.getByRole("banner") });
      await campana.click();
      const panel = page.getByRole("menu", { name: "Pendientes" });
      await c.expect(panel).toBeVisible();
      await c.foto("panel", { resaltar: panel.getByRole("menuitem").first(), recorte: [campana, panel] });
    },
  },
  {
    id: "trabajar-las-tareas",
    capitulo: "todos",
    titulo: "Trabajar las tareas pendientes",
    roles: ["receptionist", "cashier", "commercial", "dentist", "assistant", "admin"],
    paraQue: "Para no dejar nada colgado: llamar para confirmar una cita, volver a contactar a un paciente, resolver lo que el sistema detecta.",
    pasos: [
      { texto: "Entrá a **Tareas** (menú de arriba). Se abre en «Todas las pendientes»: todo lo que falta, de cualquier fecha, de la más vieja a la más nueva. Son las que arma el sistema solo (por ejemplo, una cita sin confirmar) y las que anotó el equipo. Cada fila dice su fecha: en rojo las que ya vencieron, y con la marca «Postergada» las que dejaste para más adelante con «Volver a contactar en…».", captura: "bandeja" },
      { texto: "Para trabajar un día puntual, tocá «Tareas del día»: ahí cambiás de día con «Anterior», «Siguiente» o el calendario. En «Tareas atrasadas» queda lo que no se hizo a tiempo.", captura: "fechas" },
      { texto: "Tocá una tarea para ver el detalle y los datos del paciente.", captura: "detalle" },
      { texto: "Cuando la resuelvas, tocá «Finalizar» y elegí: «El paciente dice OK», «Volver a contactar en…» (la tarea vuelve en la fecha que elijas) o «Cerrar el caso».", captura: "finalizar" },
      { texto: "Para pasársela a otra persona, usá el botón **Responsable** de la fila. «Nueva tarea personalizada» crea una propia, con paciente o sin él." },
    ],
    avisos: [
      { tipo: "ojo", texto: "Cada rol ve solo las tareas que le corresponden: las de cobranza y cheques, únicamente quienes ven montos; las de presupuestos, quienes los gestionan." },
      { tipo: "tip", texto: "Las tareas que te asignan aparecen también en [[usar-mi-agenda]], en Inicio. Desde ahí, el enlace de una tarea te abre «Tareas del día» en la fecha de esa tarea, con la tarea elegida." },
      { tipo: "tip", texto: "«Filtrar por» (tipo de tarea y responsable) vale para las tres listas, y el número de cada pestaña cuenta lo que se ve con el filtro puesto." },
      { tipo: "tip", texto: "En el celular las tres listas se ven con nombre corto: «Todas», «Del día» y «Atrasadas»." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("receptionist", "/app/tareas");
      const todas = page.getByRole("tab", { name: /^Todas las pendientes/ });
      const tareasDelDia = page.getByRole("tab", { name: "Tareas del día" });
      const nuevaTarea = page.getByRole("button", { name: /Nueva tarea personalizada/ });
      // El título entra entero en la foto (si no, queda cortado por la mitad arriba) y las primeras filas, con su fecha.
      const filas = page.getByRole("list", { name: "Todas las pendientes" }).getByRole("listitem");
      await c.expect(filas.first()).toBeVisible();
      const ultima = filas.nth(Math.min(await filas.count(), 4) - 1);
      await c.foto("bandeja", { resaltar: [todas, nuevaTarea], recorte: [page.getByRole("heading", { name: "Tareas pendientes", level: 1 }), ultima], margen: 10 });
      await tareasDelDia.click();
      await c.foto("fechas", { resaltar: [tareasDelDia, page.getByRole("button", { name: "Anterior" }), page.getByLabel("Fecha", { exact: true }), page.getByRole("button", { name: "Siguiente" }), page.getByRole("tab", { name: /Tareas atrasadas/ })], recorte: page.getByRole("heading", { name: /^Tareas - / }).locator("xpath=ancestor::div[3]"), alto: 640 });
      const fila = page.getByRole("button", { name: /Cita — Camila Ortega/ });
      await fila.click();
      await c.foto("detalle", { alto: 900, resaltar: fila });
      const finalizar = page.getByRole("button", { name: /^Finalizar/ });
      await finalizar.click();
      await c.foto("finalizar", { resaltar: finalizar, recorte: [finalizar, page.getByRole("menu")], alto: 900, margen: 4 });
    },
  },
  {
    id: "usar-el-chat",
    capitulo: "todos",
    titulo: "Escribirle al equipo por el chat",
    roles: ["receptionist", "cashier", "commercial", "dentist", "assistant", "admin"],
    paraQue: "Para hablar con tus compañeros sin salir del sistema: avisar que llegó un paciente, pedir algo, coordinar.",
    pasos: [
      { texto: "Entrá a **Chat**. A la izquierda están el canal **Equipo** (lo lee toda la clínica) y los mensajes directos con cada persona.", captura: "lista" },
      { texto: "Elegí con quién querés hablar, escribí abajo y mandalo con el botón de enviar o con **Enter** (con Mayús + Enter hacés un renglón nuevo).", captura: "escribir" },
      { texto: "El número rojo junto a «Chat», en el menú, te avisa cuando tenés mensajes sin leer." },
    ],
    avisos: [
      { tipo: "ojo", texto: "El chat es interno: lo ve solo el equipo de tu clínica. No es un canal para hablar con los pacientes." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("receptionist", "/app/chat");
      await c.foto("lista", { resaltar: page.getByRole("button", { name: /Equipo/ }).first(), pantalla: true });
      const campo = page.getByPlaceholder(/^Escribí un mensaje/);
      await campo.fill("Llegó el paciente de las 10:30, lo paso a sala de espera.");
      await c.foto("escribir", { resaltar: [campo, page.getByRole("button", { name: /Enviar/ })], pantalla: true });
    },
  },
  {
    id: "pedir-ayuda",
    capitulo: "todos",
    titulo: "Pedir ayuda a Novum",
    roles: ["receptionist", "cashier", "commercial", "dentist", "assistant", "admin"],
    paraQue: "Cuando algo no se entiende, no sale como esperabas o necesitás saber cómo se hace.",
    pasos: [
      { texto: "Tocá **Ayuda**, arriba, o el botón azul redondo de abajo a la derecha. Está en todas las pantallas.", captura: "boton" },
      { texto: "Se abre un panel para escribirle al equipo de Novum por **WhatsApp** o por **correo**. El mensaje ya sale con el nombre de tu clínica y el tuyo." },
      { texto: "Si te piden datos de tu cuenta, decí el **ID de soporte**: lo ves en tu menú (tocando tu nombre) y al pie de cada pantalla." },
    ],
    avisos: [
      { tipo: "revisar", texto: "Hoy el panel avisa «El canal de soporte todavía no está configurado»: faltan cargar el WhatsApp, el correo y el horario de Novum (variables NEXT_PUBLIC_SOPORTE_*). Hay que cargarlos antes de entregarle el manual a un cliente." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("receptionist", "/app");
      await c.foto("boton", { conAyuda: true, pantalla: true, resaltar: [page.getByRole("button", { name: "Ayuda", exact: true }), page.getByRole("button", { name: "Ayuda de Novum", exact: true }).last()] });
    },
  },
];
