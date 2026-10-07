import type { Locator, Page } from "@playwright/test";
import type { Captor, Procedimiento } from "./tipos";

/* Capítulo «Administrador», primera mitad: configuración y gente.
 * Va en el orden en que se pone en marcha una clínica (el mismo del documento de configuración de Novum: clínica y sucursales,
 * usuarios y roles, aranceles, convenios, consentimientos y documentos), y después lo que se ajusta con el tiempo. */

/* ───────────────────────────── Ayudas para sacar las capturas ───────────────────────────── */

/** Un nodo con esa clase exacta (no «gap-5» cuando se busca «p-5»). */
const conClase = (clase: string) => `contains(concat(' ', normalize-space(@class), ' '), ' ${clase} ')`;

/** La tarjeta de Configuración cuyo <h2> es `titulo`. */
const tarjeta = (page: Page, titulo: string): Locator =>
  page.getByRole("heading", { name: titulo, exact: true }).locator(`xpath=ancestor::div[${conClase("p-5")}][1]`);

/** La fila de la lista de «Usuarios del equipo» de esa persona (se la encuentra por el selector de su rol). */
const filaDe = (page: Page, nombre: string): Locator =>
  page.getByRole("combobox", { name: `Rol de ${nombre}` }).locator(`xpath=ancestor::div[${conClase("py-3")}][1]`);

/** Lleva `el` a la pantalla, debajo del menú fijo (a 175 px del borde de arriba: el captor pide que lo recortado, con su margen y el lugar
 *  de los números, quede por debajo de los 124 px del menú). Primero lo trae a la vista y espera a que termine la animación con la que
 *  aparece cada tarjeta (se mueve 18 px mientras tanto); recién entonces lo acomoda. */
async function colocar(page: Page, el: Locator, arriba = 175) {
  await el.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await el.first().evaluate((n, off) => window.scrollBy({ top: n.getBoundingClientRect().top - off, behavior: "instant" }), arriba);
  await page.waitForTimeout(250);
}

/** Espera a que la página deje de moverse (el menú lleva a un ancla y la pantalla se desplaza sola). */
async function esperarQuieto(page: Page) {
  let antes = -1;
  for (let i = 0; i < 40; i++) {
    const y = await page.evaluate(() => Math.round(window.scrollY));
    if (y === antes) return;
    antes = y;
    await page.waitForTimeout(120);
  }
}

/** Saca el mouse de en medio: si no, queda un globito de ayuda pegado sobre el último botón tocado. */
const sacarMouse = (page: Page) => page.mouse.move(6, 420);

/** Abre el menú «Administración» de arriba. */
async function abrirAdministracion(page: Page) {
  const boton = page.getByRole("banner").getByRole("button", { name: /^Administración/ });
  await boton.click();
  const panel = boton.locator("xpath=following-sibling::div[1]");
  await panel.waitFor();
  return { boton, panel };
}

/** Entra a una sección por el menú «Administración». Si se da `captura`, antes saca la foto del menú con esa opción marcada. */
async function irPorElMenu(c: Captor, opcion: string, captura?: string) {
  const { boton, panel } = await abrirAdministracion(c.page);
  const link = panel.getByRole("link", { name: opcion, exact: true });
  if (captura) await c.foto(captura, { resaltar: link, recorte: [boton, panel] });
  await link.click();
  await c.page.waitForTimeout(300);
  await esperarQuieto(c.page);
}

/** Un logotipo de ejemplo (inventado, fondo blanco) dibujado en el propio navegador: el repo no tiene imágenes de apoyo para el manual. */
async function logoDeEjemplo(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const cv = document.createElement("canvas");
    cv.width = 240;
    cv.height = 240;
    const x = cv.getContext("2d")!;
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, 240, 240);
    x.fillStyle = "#0E9F6E";
    x.beginPath();
    x.arc(120, 100, 70, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#ffffff";
    x.font = "bold 84px Arial, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText("D", 120, 104);
    x.fillStyle = "#051735";
    x.font = "bold 30px Arial, sans-serif";
    x.fillText("Demo Dental", 120, 208);
    return cv.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(b64, "base64");
}

/** El pie «Plataforma de soporte · ID de soporte» de la demo: si un menú o una captura de pantalla entera lo deja a medias, se esconde. */
const pieDeSoporte = (page: Page) => page.getByText("Plataforma de soporte").locator("xpath=..");

export const procedimientos: Procedimiento[] = [
  /* ─────────────────────────────── 1. Datos de la clínica y logotipo ─────────────────────────────── */
  {
    id: "cargar-los-datos-de-la-clinica",
    capitulo: "admin",
    titulo: "Cargar los datos de la clínica y el logotipo",
    roles: ["admin"],
    paraQue: "Al poner en marcha la clínica, y cada vez que cambia el logotipo o se abre una sede: dejás lista la moneda, el logotipo que sale en los impresos y las sucursales.",
    antes: ["El logotipo en un archivo de imagen (JPG o PNG) con fondo blanco."],
    pasos: [
      { texto: "Entrá a **Administración** (menú de arriba) y elegí «Configuración general».", captura: "menu" },
      { texto: "Mirá la tarjeta **Clínica**: muestra el nombre, la dirección y el teléfono. Si hace falta, elegí la **Moneda** en la que se muestran los montos.", captura: "clinica" },
      { texto: "Más abajo, en **Logotipo**, tocá «Subir logo» y elegí el archivo. El logotipo aparece en la tarjeta, en la cabecera de la app (junto al nombre de la clínica) y en los presupuestos impresos.", captura: "logo" },
      { texto: "En **Sucursales**, tocá «Agregar sucursal». Escribí el **Nombre**, la **Dirección** y el **Teléfono**, y tocá «Guardar».", captura: "sucursal" },
      { texto: "Revisá la lista: la sucursal nueva ya está. El lápiz la edita y el tachito la elimina (la sede principal no se puede eliminar).", captura: "sucursales" },
      { texto: "Para dejar a cada persona en su sede, elegila en su fila de **Usuarios del equipo**: ver [[crear-un-usuario]]." },
    ],
    avisos: [
      { tipo: "ojo", texto: "El nombre, la dirección y el teléfono de la clínica se ven en la tarjeta **Clínica** pero no se pueden cambiar desde acá: los carga Novum al dar de alta la clínica. Si cambian, pedile el cambio a Novum." },
      { tipo: "ojo", texto: "Si el logotipo tiene fondo transparente, se guarda con fondo negro. Usá una imagen con fondo blanco; el sistema la achica solo a un máximo de 400 píxeles." },
      { tipo: "ojo", texto: "Cambiar la moneda cambia cómo se muestran todos los montos (presupuestos, pagos, caja, reportes), pero no convierte los importes que ya están cargados." },
      { tipo: "revisar", texto: "Confirmar con Novum si la clínica debería poder editar sola su nombre, su dirección y su teléfono: hoy no hay un botón para hacerlo." },
    ],
    capturar: async (c) => {
      const { page } = c;
      page.on("dialog", (d) => void d.accept());
      await c.entrar("admin", "/app");
      await irPorElMenu(c, "Configuración general", "menu");

      const clinica = tarjeta(page, "Clínica");
      await colocar(page, clinica);
      await c.foto("clinica", { recorte: clinica, margen: 4, resaltar: clinica.getByRole("combobox") });

      // El logotipo es un archivo de ejemplo dibujado al momento (ver logoDeEjemplo).
      const logoCard = tarjeta(page, "Logotipo");
      // A 140 px la tarjeta de arriba (la de importar pacientes, que nombra a otro sistema) queda tapada por el menú fijo.
      await colocar(page, logoCard, 140);
      await logoCard.locator("input[type=file]").setInputFiles({ name: "logo-demo-dental.png", mimeType: "image/png", buffer: await logoDeEjemplo(page) });
      const vistaPrevia = logoCard.getByRole("img", { name: "Logo de la clínica" });
      await c.expect(vistaPrevia).toBeVisible();
      await sacarMouse(page);
      // Con la pantalla entera se ve también el logotipo en la cabecera, junto al nombre de la clínica.
      await c.foto("logo", { pantalla: true, resaltar: [logoCard.locator("label", { hasText: "Subir logo" }), vistaPrevia] });

      const sucursales = tarjeta(page, "Sucursales");
      await colocar(page, sucursales);
      await sucursales.getByRole("button", { name: "Agregar sucursal" }).click();
      const modal = page.getByRole("dialog", { name: "Nueva sucursal" });
      await modal.getByLabel("Nombre").fill("Sucursal Luque");
      await modal.getByLabel("Dirección").fill("Ruta 2, km 14, Luque");
      await modal.getByLabel("Teléfono").fill("+595 21 555 020");
      await c.foto("sucursal", { recorte: modal, margen: 4, resaltar: [modal.getByLabel("Nombre"), modal.getByLabel("Dirección"), modal.getByLabel("Teléfono")] });
      await modal.getByRole("button", { name: "Guardar" }).click();
      const fila = sucursales.locator(`div.py-3`, { hasText: "Sucursal Luque" });
      await c.expect(fila).toBeVisible();
      await colocar(page, sucursales);
      await sacarMouse(page);
      await c.foto("sucursales", { recorte: sucursales, margen: 4, resaltar: fila });

      // El lápiz edita y el tachito elimina (con pregunta): se comprueba sobre la sucursal nueva.
      await fila.getByRole("button", { name: "Editar" }).click();
      await c.expect(page.getByRole("dialog", { name: "Editar sucursal" })).toBeVisible();
      await page.keyboard.press("Escape");
      await fila.getByRole("button", { name: "Eliminar" }).click();
      await c.expect(fila).toHaveCount(0);
    },
  },

  /* ─────────────────────────────── 2. Crear un usuario ─────────────────────────────── */
  {
    id: "crear-un-usuario",
    capitulo: "admin",
    titulo: "Crear un usuario del equipo",
    roles: ["admin"],
    paraQue: "Cuando entra una persona nueva al equipo. Cada una tiene su propio usuario y su rol, que define qué ve y qué puede hacer.",
    antes: ["El nombre completo, el correo y el rol de la persona."],
    pasos: [
      { texto: "Entrá a **Administración** (menú de arriba) y elegí «Usuarios y profesionales».", captura: "menu" },
      { texto: "En **Usuarios del equipo**, tocá «Agregar usuario».", captura: "boton" },
      { texto: "Escribí el **Nombre completo**, el **Email** y una **Contraseña provisional** de al menos 6 caracteres. El **Teléfono (WhatsApp)** es opcional.", captura: "formulario" },
      { texto: "Elegí el **Rol**: Administrador, Recepción y caja, Recepcionista, Dentista o Asistente de doctores. Debajo del desplegable se lee qué puede hacer la persona con ese rol.", captura: "rol" },
      { texto: "Tocá «Crear usuario». Pasale a la persona su correo y su contraseña provisional: la primera vez que entre, el sistema le pide elegir una propia ([[cambiar-tu-contrasena]])." },
      { texto: "Si es un dentista, completá en su fila la **Especialidad** y el **%** de comisión (alimenta el cálculo del pago en Reportes). Si es una asistente, asignale sus doctores: [[asignar-doctores-a-una-asistente]].", captura: "dentista" },
    ],
    avisos: [
      { tipo: "ojo", texto: "El plan limita los usuarios. El **Plan Solo** admite hasta 3 usuarios activos y 1 profesional; el **Plan Clínica**, hasta 12 y 4; el **Plan Multi**, sin tope de usuarios y hasta 10 profesionales. Si te pasás, el sistema avisa y no crea la cuenta. Un usuario dado de baja no cuenta." },
      { tipo: "ojo", texto: "El correo no se puede repetir en la clínica, ni siquiera con un usuario dado de baja: en ese caso reactivá al que ya existe ([[dar-de-baja-a-un-usuario]])." },
      { tipo: "ojo", texto: "No hay un selector de color: el sistema le da a cada persona el color de su rol, así que dos dentistas nuevos quedan con el mismo color en la agenda." },
      { tipo: "tip", texto: "Pasá el mouse por el número que está junto al título **Usuarios del equipo**: dice cuántos usuarios y cuántos profesionales incluye tu plan. Qué puede hacer cada rol está en el apéndice **Qué puede hacer cada rol**, al final del manual." },
      { tipo: "revisar", texto: "En la demo el botón «Crear usuario» está apagado y un cuadro azul avisa que el alta de cuentas solo funciona en una clínica con conexión: por eso las capturas llegan hasta el formulario completo. Que la cuenta se cree, que el sistema pida cambiar la contraseña y los topes del plan salen de leer el código; hay que probarlos en una clínica real." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app");
      await irPorElMenu(c, "Usuarios y profesionales", "menu");

      const usuarios = tarjeta(page, "Usuarios del equipo");
      await colocar(page, usuarios);
      const agregar = usuarios.getByRole("button", { name: "Agregar usuario" });
      await c.foto("boton", { recorte: usuarios, margen: 4, resaltar: agregar });

      await agregar.click();
      const modal = page.getByRole("dialog", { name: "Agregar usuario" });
      await modal.getByLabel("Nombre completo").fill("Rosa Benegas");
      await modal.getByLabel("Email").fill("rosa.benegas@tuclinica.com");
      await modal.getByLabel("Contraseña provisional").fill("Clinica2026");
      await modal.locator("select").selectOption({ label: "Dentista" });
      await c.foto("formulario", {
        recorte: modal,
        margen: 4,
        resaltar: [modal.getByLabel("Nombre completo"), modal.getByLabel("Email"), modal.getByLabel("Contraseña provisional")],
      });
      const rol = modal.locator("select");
      await c.foto("rol", { recorte: [rol.locator("xpath=ancestor::label[1]"), modal.getByRole("button", { name: "Crear usuario" })], margen: 10, resaltar: rol });
      await page.keyboard.press("Escape");

      // El alta real necesita una clínica conectada: para la fila de un dentista se muestra la de la Dra. Sofía.
      const sofia = filaDe(page, "Dra. Sofía Benítez");
      await colocar(page, sofia);
      await c.foto("dentista", { recorte: sofia, margen: 2, resaltar: [sofia.getByPlaceholder("Especialidad"), sofia.getByTitle(/% de comisión/)] });
    },
  },

  /* ─────────────────────────────── 3. Doctores de una asistente ─────────────────────────────── */
  {
    id: "asignar-doctores-a-una-asistente",
    capitulo: "admin",
    titulo: "Asignar los doctores de una asistente",
    roles: ["admin"],
    verComo: ["assistant"], // el último paso muestra la pantalla de la asistente («así la ve ella»)
    paraQue: "Cuando entra una asistente nueva o cambia con qué doctores trabaja. La asistente solo ve la agenda, los planes y los pacientes de los doctores que tiene asignados.",
    antes: ["La asistente ya tiene su usuario con el rol «Asistente de doctores»: [[crear-un-usuario]]."],
    pasos: [
      { texto: "Entrá a **Administración** y elegí «Usuarios y profesionales»." },
      { texto: "Buscá la fila de la asistente. Al lado de **Asiste a:** están los dentistas de la clínica; los que tienen el borde azul son sus doctores.", captura: "fila" },
      { texto: "Tocá el nombre de cada doctor al que asiste: queda marcado en azul. Para sacarlo, tocalo de nuevo.", captura: "marcar" },
      { texto: "No hace falta guardar: el cambio rige al instante. Desde ese momento la asistente ve solo la agenda, los planes y los pacientes de esos doctores." },
      { texto: "Si una asistente queda sin ningún doctor, su fila muestra «Sin doctores».", captura: "sin-doctores" },
      { texto: "Así la ve ella: en **Pacientes** y en **Agenda** dice «Todavía no tenés doctores asignados».", captura: "ve" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Una asistente sin doctores no ve nada. Si una asistente nueva dice que «no ve pacientes ni agenda», casi siempre falta este paso." },
      { tipo: "ojo", texto: "Solo se ofrecen los dentistas activos: si das de baja a un doctor, deja de aparecer en la lista." },
      { tipo: "tip", texto: "Si cambiás a alguien al rol «Asistente de doctores» desde su fila, la lista **Asiste a:** aparece vacía: asignale los doctores enseguida." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app");
      await irPorElMenu(c, "Usuarios y profesionales");

      const usuarios = tarjeta(page, "Usuarios del equipo");
      await colocar(page, usuarios);
      const paola = filaDe(page, "Paola Asistente");
      const doctores = page.getByRole("group", { name: "Doctores a los que asiste Paola Asistente" });
      const sofia = doctores.getByRole("button", { name: "Dra. Sofía Benítez" });
      const diego = doctores.getByRole("button", { name: "Dr. Diego Martínez" });
      await c.foto("fila", { recorte: paola, margen: 2, resaltar: doctores });

      await diego.click();
      await c.expect(diego).toHaveAttribute("aria-pressed", "true");
      await sacarMouse(page);
      await c.foto("marcar", { recorte: paola, margen: 2, resaltar: [sofia, diego] });

      await sofia.click();
      await diego.click();
      await c.expect(doctores.getByText("Sin doctores")).toBeVisible();
      await sacarMouse(page);
      await c.foto("sin-doctores", { recorte: paola, margen: 2, resaltar: doctores.getByText("Sin doctores") });

      // Se pasa a la asistente SIN cerrar sesión (cerrar sesión borra el estado local de la demo y se perdería el cambio).
      await c.entrar("assistant", "/app/pacientes");
      const aviso = page.getByText("Todavía no tenés doctores asignados");
      await c.expect(aviso).toBeVisible();
      await c.foto("ve", { pantalla: true, alto: 560, resaltar: aviso, ocultar: pieDeSoporte(page) });
    },
  },

  /* ─────────────────────────────── 4. Cargar el arancel ─────────────────────────────── */
  {
    id: "cargar-el-arancel",
    capitulo: "admin",
    titulo: "Cargar el arancel de precios",
    roles: ["admin"],
    paraQue: "Para tener cargada la lista de prestaciones con su precio. De ahí salen los precios de los planes de tratamiento y de los presupuestos.",
    pasos: [
      { texto: "Entrá a **Administración** y elegí «Arancel de precios».", captura: "menu" },
      { texto: "En **Servicios y aranceles** ves cada prestación con su código, su descripción y su precio. Para sumar una, tocá «Agregar servicio».", captura: "tabla" },
      { texto: "Escribí el **Código**, la **Descripción** y el **Arancel (Gs)**, y tocá «Crear servicio».", captura: "modal" },
      { texto: "La prestación nueva queda al final de la lista.", captura: "fila" },
      { texto: "Para corregir un precio o una descripción, tocá el lápiz de su fila, cambiá lo que haga falta y tocá «Guardar». El código no se puede cambiar.", captura: "editar" },
      { texto: "Para sacar una prestación, tocá el tachito de su fila y aceptá la pregunta." },
      { texto: "Desde ese momento, al armar un plan de tratamiento o un presupuesto la prestación aparece en la lista con su precio: [[armar-un-plan-de-tratamiento]]." },
    ],
    avisos: [
      { tipo: "ojo", texto: "Cambiar un precio no cambia los planes ya armados: cada plan guarda el precio del momento en que se agregó la prestación. Al eliminar una prestación pasa lo mismo: los planes que la usan no se tocan, solo deja de ofrecerse para los nuevos." },
      { tipo: "ojo", texto: "Si escribís un código que ya existe, el servicio nuevo reemplaza al anterior en lugar de sumarse." },
      { tipo: "tip", texto: "Los reportes agrupan las prestaciones por categoría a partir del código. Cargalas con los códigos de la nomenclatura CDT (D0…, D1…, D2…) y quedan bien agrupadas; se guardan en mayúsculas." },
    ],
    capturar: async (c) => {
      const { page } = c;
      page.on("dialog", (d) => void d.accept());
      await c.entrar("admin", "/app");
      await irPorElMenu(c, "Arancel de precios", "menu");

      const arancel = tarjeta(page, "Servicios y aranceles");
      await colocar(page, arancel);
      const agregar = arancel.getByRole("button", { name: "Agregar servicio" });
      await c.foto("tabla", { recorte: arancel, margen: 4, resaltar: agregar });

      await agregar.click();
      const modal = page.getByRole("dialog", { name: "Agregar servicio" });
      await modal.getByLabel("Código (CPT/CDT)").fill("D1206");
      await modal.getByLabel("Descripción").fill("Aplicación tópica de flúor");
      await modal.getByLabel("Arancel (Gs)").fill("180000");
      await c.foto("modal", {
        recorte: modal,
        margen: 4,
        resaltar: [modal.getByLabel("Código (CPT/CDT)"), modal.getByLabel("Descripción"), modal.getByLabel("Arancel (Gs)"), modal.getByRole("button", { name: "Crear servicio" })],
      });
      await modal.getByRole("button", { name: "Crear servicio" }).click();

      const nueva = arancel.getByRole("row", { name: /D1206/ });
      const anterior = arancel.getByRole("row", { name: /D8080/ });
      await c.expect(nueva).toBeVisible();
      await colocar(page, anterior);
      await c.foto("fila", { recorte: [anterior, nueva], margen: 6, resaltar: nueva });

      // Se corrige el precio de la profilaxis (D1110).
      const profilaxis = arancel.getByRole("row", { name: /D1110/ });
      await profilaxis.getByRole("button", { name: "Editar servicio" }).click();
      const edicion = page.getByRole("dialog", { name: "Editar servicio" });
      await edicion.getByLabel("Arancel (Gs)").fill("270000");
      await c.foto("editar", { recorte: edicion, margen: 4, resaltar: [edicion.getByLabel("Arancel (Gs)"), edicion.getByRole("button", { name: "Guardar" })] });
      await edicion.getByRole("button", { name: "Guardar" }).click();
      await c.expect(arancel.getByRole("row", { name: /D1110/ })).toContainText("270.000");

      // El tachito saca la prestación (con pregunta).
      await nueva.getByRole("button", { name: "Eliminar servicio" }).click();
      await c.expect(nueva).toHaveCount(0);

      // El precio nuevo es el que ofrece el presupuesto.
      await c.ir("/app/presupuestos");
      await page.getByRole("button", { name: "Nuevo presupuesto" }).click();
      const presupuesto = page.getByRole("dialog", { name: "Nuevo presupuesto" });
      await presupuesto.getByRole("button", { name: "Agregar", exact: true }).click();
      await presupuesto.locator("select").nth(3).selectOption({ label: "D1110 — Profilaxis (adulto)" });
      await c.expect(presupuesto.getByLabel("Precio")).toHaveValue("270000");
    },
  },

  /* ─────────────────────────────── 5. Convenios ─────────────────────────────── */
  {
    id: "cargar-los-convenios",
    capitulo: "admin",
    titulo: "Cargar los convenios",
    roles: ["admin"],
    paraQue: "Cuando la clínica tiene un acuerdo con una empresa o una aseguradora que da un descuento a sus afiliados. El descuento se aplica solo al armar un presupuesto.",
    pasos: [
      { texto: "Entrá a **Administración** y elegí «Convenios».", captura: "menu" },
      { texto: "En **Gestión de convenios** ves los que ya están cargados, cada uno con su descuento. Para sumar uno, escribí el **nombre** y el **porcentaje**; el RUC y el teléfono son opcionales.", captura: "formulario" },
      { texto: "Tocá «Agregar convenio»: aparece junto a los demás.", captura: "agregado" },
      { texto: "Para cambiar el porcentaje de uno que ya está, agregalo de nuevo con el mismo nombre: reemplaza al anterior. Para sacarlo, tocá el tachito de su etiqueta." },
      { texto: "Así se usa: al armar un presupuesto, elegís el convenio en **Convenio** y el descuento se completa solo ([[presentar-y-aceptar-un-presupuesto]]).", captura: "presupuesto" },
    ],
    avisos: [
      { tipo: "ojo", texto: "El porcentaje tiene que estar entre 0 y 100, pero el campo no frena un número mayor: revisalo antes de tocar «Agregar convenio»." },
      { tipo: "ojo", texto: "El tachito saca el convenio al instante, sin pedir confirmación. Los presupuestos que ya lo usaban conservan su descuento." },
      { tipo: "tip", texto: "Los nombres de los convenios también se ofrecen como sugerencia en el campo **Convenio** al cargar un paciente nuevo." },
      { tipo: "revisar", texto: "El convenio es solo un porcentaje de descuento sobre el total del presupuesto: no hay lista de precios propia ni topes por prestación. Confirmar con las clínicas si alcanza." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app");
      await irPorElMenu(c, "Convenios", "menu");

      const convenios = tarjeta(page, "Gestión de convenios");
      await colocar(page, convenios);
      const nombre = convenios.getByPlaceholder("Nombre (ej: IPS)");
      const porcentaje = convenios.locator("input[type=number]");
      await nombre.fill("Cooperativa del Sur");
      await porcentaje.fill("8");
      await c.foto("formulario", { recorte: convenios, margen: 4, resaltar: [nombre, porcentaje] });

      await convenios.getByRole("button", { name: "Agregar convenio" }).click();
      const etiqueta = convenios.locator("span", { hasText: "Cooperativa del Sur" }).first();
      await c.expect(etiqueta).toBeVisible();
      await sacarMouse(page);
      await c.foto("agregado", { recorte: convenios, margen: 4, resaltar: etiqueta });

      // Cambiar un porcentaje = agregar el convenio de nuevo con el mismo nombre; el tachito lo saca (sin pregunta).
      await nombre.fill("IPS");
      await porcentaje.fill("12");
      await convenios.getByRole("button", { name: "Agregar convenio" }).click();
      await c.expect(convenios.locator("span", { hasText: /^IPS/ })).toHaveCount(1);
      await c.expect(convenios.locator("span", { hasText: /^IPS/ })).toContainText("12%");
      await convenios.getByRole("button", { name: "Quitar OSDE PY" }).click();
      await c.expect(convenios.getByText("OSDE PY")).toHaveCount(0);

      // Dónde se usa: el presupuesto nuevo ofrece el convenio y completa el descuento.
      await c.ir("/app/presupuestos");
      await page.getByRole("button", { name: "Nuevo presupuesto" }).click();
      const modal = page.getByRole("dialog", { name: "Nuevo presupuesto" });
      await modal.getByLabel("Convenio").selectOption({ label: "Cooperativa del Sur (8%)" });
      await c.expect(modal.getByLabel("Descuento %")).toHaveValue("8");
      await c.foto("presupuesto", { recorte: modal, margen: 0, resaltar: [modal.getByLabel("Convenio"), modal.getByLabel("Descuento %")] });
    },
  },

  /* ─────────────────────────────── 6. Plantillas de documentos y consentimientos ─────────────────────────────── */
  {
    id: "editar-las-plantillas-de-documentos",
    capitulo: "admin",
    titulo: "Editar las plantillas de documentos y consentimientos",
    roles: ["admin"],
    paraQue: "Para dejar a punto los textos que la clínica usa con sus pacientes: la Historia Clínica, las indicaciones para después de un tratamiento y los consentimientos.",
    pasos: [
      { texto: "Entrá a **Administración** y elegí «Documentos clínicos».", captura: "menu" },
      { texto: "En **Documentos clínicos** ves las plantillas: la Historia Clínica y los textos de indicaciones. «Por revisar» marca los textos de Novudent que todavía no revisó un odontólogo.", captura: "lista" },
      { texto: "Para cambiar una plantilla, tocá «Editar», modificá el texto y tocá «Guardar cambios». En los textos podés usar {paciente}, {documento}, {fecha}, {profesional} y {clinica}: se completan al crear el documento.", captura: "editor" },
      { texto: "«Duplicar» arma una copia para adaptarla. «Desactivar» la saca de las que se ofrecen al crear un documento (con «Activar» vuelve). «Eliminar» la borra." },
      { texto: "Cuando un odontólogo revisó un texto «Por revisar», tocá «Marcar como revisada»: se va la etiqueta y los documentos nuevos dejan de salir como borrador." },
      { texto: "Para una plantilla propia, tocá «Nueva plantilla de documento». Escribí el **Nombre de la plantilla**, elegí el **Tipo** —«Formulario» (con secciones y campos) o «Texto de indicaciones»— y tocá «Crear plantilla».", captura: "nueva" },
      { texto: "Tocá «Guardar plantillas». Hasta que lo hacés, nada de lo anterior queda guardado.", captura: "guardar" },
      { texto: "Los consentimientos están más abajo, en **Plantillas de consentimiento**: editá el **Título** y el **Cuerpo del consentimiento** y tocá «Guardar plantillas». «Nueva plantilla» suma otro.", captura: "consentimientos" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Editar una plantilla no cambia los documentos ni los consentimientos que ya se hicieron: cada uno guarda su propia copia del texto." },
      { tipo: "ojo", texto: "Si salís de la pantalla sin tocar «Guardar plantillas», se pierden los cambios." },
      { tipo: "ojo", texto: "El atajo «Documentos y consentimientos» del menú abre esta pantalla pero no baja hasta **Plantillas de consentimiento**: bajá a mano." },
      { tipo: "tip", texto: "Las plantillas se usan desde la ficha del paciente: [[completar-la-historia-clinica]] y [[pedir-un-consentimiento]]." },
      { tipo: "error", texto: "Después de tocar «Guardar plantillas», la barra «Descartar / Guardar plantillas» no se va y no aparece el cartel «Plantillas guardadas», aunque los cambios ya quedaron guardados: la barra recién desaparece al recargar la pantalla. Tendría que irse al guardar." },
      { tipo: "revisar", texto: "Los tres textos de indicaciones que trae Novudent son borradores generales: un odontólogo de la clínica tiene que revisarlos antes de marcarlos como revisados y dárselos a un paciente." },
      { tipo: "revisar", texto: "Los dos consentimientos de ejemplo son textos tipo: confirmar con el asesor legal de cada clínica antes de usarlos." },
    ],
    capturar: async (c) => {
      const { page } = c;
      page.on("dialog", (d) => void d.accept());
      await c.entrar("admin", "/app");
      await irPorElMenu(c, "Documentos clínicos", "menu");

      const docs = tarjeta(page, "Documentos clínicos");
      const fila = (nombre: string) => docs.getByRole("row", { name: new RegExp(nombre) });
      const exodoncia = fila("Cuidados postoperatorios de exodoncia");
      await colocar(page, docs);
      await c.foto("lista", { recorte: docs, margen: 4, resaltar: exodoncia.getByText("Por revisar") });

      await exodoncia.getByRole("button", { name: "Editar" }).click();
      const editor = page.getByRole("dialog", { name: /^Editar plantilla/ });
      const texto = editor.locator("textarea");
      await texto.fill(`${await texto.inputValue()}\n\nCualquier duda, llamá a {clinica}.`);
      await c.foto("editor", { recorte: editor, margen: 0, resaltar: [texto, editor.getByRole("button", { name: "Guardar cambios" })] });
      await editor.getByRole("button", { name: "Guardar cambios" }).click();

      // Se marca como revisada la plantilla editada y se crea una propia (duplicar, desactivar, activar y eliminar se prueban más abajo).
      await exodoncia.getByRole("button", { name: "Marcar como revisada" }).click();
      await c.expect(exodoncia.getByText("Por revisar")).toHaveCount(0);

      await docs.getByRole("button", { name: "Nueva plantilla de documento" }).click();
      const nueva = page.getByRole("dialog", { name: "Nueva plantilla de documento" });
      const tipo = nueva.locator("select");
      await tipo.selectOption({ label: "Texto de indicaciones" });
      await nueva.getByLabel("Nombre de la plantilla").fill("Aviso después de la consulta");
      await nueva.locator("textarea").fill("Estimado/a {paciente}: gracias por visitar {clinica}. Si tenés molestias después del tratamiento, comunicate con nosotros.");
      await c.foto("nueva", { recorte: nueva, margen: 0, resaltar: [nueva.getByLabel("Nombre de la plantilla"), tipo, nueva.getByRole("button", { name: "Crear plantilla" })] });
      await nueva.getByRole("button", { name: "Crear plantilla" }).click();

      const propia = fila("Aviso después de la consulta");
      await c.expect(propia).toBeVisible();
      const guardar = docs.getByRole("button", { name: "Guardar plantillas" });
      await colocar(page, docs);
      await sacarMouse(page);
      await c.foto("guardar", { recorte: [fila("Higiene y cepillado en adultos"), guardar], margen: 4, resaltar: guardar });
      await guardar.click();
      // Se comprueba en el estado local que quedó guardada (la barra de «Guardar plantillas» no se va sola hasta recargar: ver el aviso del procedimiento).
      await c.expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("novudent.db.v4") || "{}").clinics?.[0]?.config?.plantillasDocumento?.length)).toBe(5);

      // Duplicar, desactivar, activar y eliminar: se comprueba sobre la plantilla propia (queda sin guardar).
      await fila("Aviso después de la consulta").getByRole("button", { name: "Duplicar" }).click();
      const copia = fila("Aviso después de la consulta \\(copia\\)");
      await c.expect(copia).toBeVisible();
      await copia.getByRole("button", { name: "Desactivar" }).click();
      await c.expect(copia).toContainText("Inactiva");
      await copia.getByRole("button", { name: "Activar", exact: true }).click();
      await c.expect(copia).toContainText("Activa");
      await copia.getByRole("button", { name: "Eliminar" }).click();
      await c.expect(copia).toHaveCount(0);

      const consentimientos = tarjeta(page, "Plantillas de consentimiento");
      await colocar(page, consentimientos);
      const titulo = consentimientos.getByLabel("Título").first();
      await titulo.fill("Consentimiento informado general (2026)");
      await colocar(page, consentimientos);
      await sacarMouse(page);
      await c.foto("consentimientos", { recorte: consentimientos, alto: 1000, margen: 4, resaltar: [titulo, consentimientos.getByRole("button", { name: "Guardar plantillas" })] });
      await consentimientos.getByRole("button", { name: "Guardar plantillas" }).click();
      await c.expect(consentimientos.getByRole("button", { name: "Guardar plantillas" })).toHaveCount(0);
    },
  },

  /* ─────────────────────────────── 7. Campos del paciente ─────────────────────────────── */
  {
    id: "configurar-los-campos-del-paciente",
    capitulo: "admin",
    titulo: "Elegir qué campos se piden del paciente",
    roles: ["admin"],
    paraQue: "Para decidir qué datos se piden al cargar un paciente, al dar una cita y en la reserva online, y cuáles son obligatorios.",
    pasos: [
      { texto: "Entrá a **Pacientes** (menú de arriba) y tocá la pestaña **Configuración**.", captura: "pestana" },
      { texto: "La tabla cruza cada **campo** con tres lugares: **Nuevo paciente**, **Al agendar** y **Agenda online**. En cada lugar hay dos casillas: **Presente** (se pide) y **Requerido** (es obligatorio).", captura: "tabla" },
      { texto: "Tildá o destildá las casillas que quieras cambiar. Si hacés obligatorio un campo, queda también presente; si lo sacás de la lista, deja de ser obligatorio.", captura: "tilde" },
      { texto: "Tocá «Guardar». Mientras no lo hagas, arriba dice «Hay cambios sin guardar».", captura: "guardar" },
      { texto: "Probalo: en **Pacientes**, «Nuevo paciente», el campo ahora lleva un asterisco (*) y el sistema no deja crear al paciente hasta completarlo ([[cargar-un-paciente-nuevo]]).", captura: "nuevo" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Las casillas grises no se tocan: son datos que siempre se piden. Nombre y apellidos, siempre; en la agenda online, además, la cédula y el teléfono móvil, porque la reserva busca al paciente por su CI y le confirma por WhatsApp ([[atender-una-reserva-online]])." },
      { tipo: "ojo", texto: "Sacar un campo del formulario no borra el dato de los pacientes que ya lo tienen: solo deja de pedirse." },
      { tipo: "ojo", texto: "Si el paciente es menor de edad, al cargar su fecha de nacimiento se piden los datos del responsable y son obligatorios, aunque los hayas sacado de la lista." },
      { tipo: "tip", texto: "Solo el administrador puede cambiar esta tabla: los demás roles la ven con las casillas bloqueadas." },
      { tipo: "tip", texto: "De fábrica el **Email** es obligatorio en los tres lugares (desde el 7/10/2026): los avisos al paciente (confirmación de cita, comprobantes, documentos) salen por correo. Si la clínica atiende a pacientes sin correo, acá se puede soltar la casilla **Requerido** del email." },
      { tipo: "revisar", texto: "Lo que se pide de fábrica (nombre, apellidos, CI, fecha de nacimiento, sexo, género, teléfono móvil y email como obligatorios) salió de la revisión de Novum del 27/9/2026 y del pedido del 7/10/2026 (email). Confirmar que sigue siendo lo que se quiere ofrecer a las clínicas nuevas, y si el email tiene que ser un campo que la clínica no pueda soltar." },
      { tipo: "error", texto: "El atajo «Campos del paciente» del menú Administración no lleva a esta tabla: abre Configuración general. Por eso el paso 1 entra por **Pacientes**." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app/pacientes");
      await page.getByRole("button", { name: "Configuración", exact: true }).click();
      await c.expect(page.getByRole("heading", { name: "Configuración de campos del paciente" })).toBeVisible();
      await page.waitForTimeout(900);
      await c.foto("pestana", { pantalla: true, alto: 560, resaltar: page.getByRole("button", { name: "Configuración", exact: true }) });

      const tabla = page.getByRole("table", { name: "Campos del paciente por contexto" });
      await c.foto("tabla", { recorte: [page.getByRole("heading", { name: "Configuración de campos del paciente" }), tabla.locator("tbody tr").nth(7)], margen: 4, resaltar: [tabla.getByRole("columnheader", { name: "Nuevo paciente" }), tabla.getByRole("columnheader", { name: "Al agendar" }), tabla.getByRole("columnheader", { name: "Agenda online" })] });

      // El ejemplo es «Barrio»: el email ya viene obligatorio de fábrica y no serviría para mostrar el cambio.
      const requeridoBarrio = page.getByLabel("Barrio: requerido en Nuevo paciente");
      await requeridoBarrio.check();
      await c.expect(page.getByLabel("Barrio: presente en Nuevo paciente")).toBeChecked();
      await c.foto("tilde", { recorte: [page.getByRole("heading", { name: "Configuración de campos del paciente" }), requeridoBarrio.locator("xpath=ancestor::tr[1]")], margen: 4, resaltar: [page.getByLabel("Barrio: presente en Nuevo paciente"), requeridoBarrio] });

      const guardar = page.getByRole("button", { name: "Guardar" });
      await c.foto("guardar", { recorte: [page.getByRole("heading", { name: "Configuración de campos del paciente" }), page.getByRole("status")], margen: 4, resaltar: guardar });
      await guardar.click();
      await c.expect(guardar).toBeDisabled();

      await c.ir("/app/pacientes/nuevo");
      const barrio = page.getByLabel("Barrio *");
      await c.expect(barrio).toBeVisible();
      // El campo es obligatorio: el navegador no deja crear al paciente hasta completarlo (no se ve en la captura: es un globito del navegador).
      await c.expect(barrio).toHaveAttribute("required", "");
      await page.getByRole("button", { name: "Crear paciente" }).click();
      await c.expect(page).toHaveURL(/\/app\/pacientes\/nuevo/);
      await c.foto("nuevo", { recorte: [page.getByText("Contacto y domicilio", { exact: true }), page.getByLabel("Teléfono móvil *").locator("xpath=ancestor::label[1]"), barrio.locator("xpath=ancestor::label[1]")], margen: 4, resaltar: barrio });
    },
  },

  /* ─────────────────────────────── 8. Estados de cita ─────────────────────────────── */
  {
    id: "configurar-los-estados-de-cita",
    capitulo: "admin",
    titulo: "Configurar los estados de cita",
    roles: ["admin"],
    paraQue: "Para que la recepción marque cada cita con los estados que usa la clínica, cada uno con su color. Se pueden renombrar los de fábrica y crear estados propios.",
    pasos: [
      { texto: "Entrá a **Administración** y elegí «Estados de cita».", captura: "menu" },
      { texto: "La tabla muestra cada estado con su color, su **Comportamiento**, si tiene **Anulación** (libera el cupo en la agenda) y su **Tipo**: «Reservado» (de fábrica), «Uso interno» o «Estado propio». Para renombrar o recolorear uno, cambiá su nombre o su color y guardá (paso 5).", captura: "tabla" },
      { texto: "Para crear uno propio, escribí su nombre en la última fila, elegí el **color** y el **comportamiento**: el estado de fábrica con el que el resto del sistema lo va a tratar.", captura: "nuevo" },
      { texto: "Tocá «Crear nuevo estado»: queda en la tabla como «Estado propio».", captura: "creado" },
      { texto: "Tocá «Guardar estados». Hasta que lo hacés, nada rige.", captura: "guardado" },
      { texto: "Desde ese momento el estado nuevo aparece en el menú **Estado de la cita** de la **Agenda** ([[cambiar-el-estado-de-una-cita]]).", captura: "agenda" },
    ],
    avisos: [
      { tipo: "ojo", texto: "«Anulación: Sí» quiere decir que el estado libera el horario en la agenda. Lo decide el comportamiento: solo los que se comportan como «Anulado» lo liberan." },
      { tipo: "ojo", texto: "Solo los estados propios se pueden borrar (tachito). Los de fábrica se renombran y se recolorean; los de uso interno —los que deja el sistema, como «Confirmado por WhatsApp»— además se pueden desactivar. Las citas que tenían un estado borrado o desactivado se muestran con el estado de fábrica equivalente." },
      { tipo: "ojo", texto: "El menú de estados de la agenda es largo y no tiene scroll: en una pantalla chica los últimos —los propios van al final— quedan cortados. Si te pasa, achicá el zoom del navegador (Ctrl y la tecla −)." },
      { tipo: "tip", texto: "«Restablecer configuración original» vuelve a los estados de fábrica y borra los propios (pide confirmación)." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app");
      await irPorElMenu(c, "Estados de cita", "menu");

      const estados = tarjeta(page, "Estados de cita");
      await colocar(page, estados);
      const aviso = estados.locator("div.border-state-infobg");
      await c.foto("tabla", { recorte: [aviso, estados.locator("tbody tr").nth(6)], margen: 4, resaltar: [estados.getByRole("columnheader", { name: "Anulación" }), estados.getByRole("columnheader", { name: "Tipo" })] });

      const nombre = estados.getByLabel("Nombre del nuevo estado");
      const color = estados.getByLabel("Color del nuevo estado");
      const comportamiento = estados.getByLabel("Comportamiento del nuevo estado");
      const crear = estados.getByRole("button", { name: "Crear nuevo estado" });
      const guardar = estados.getByRole("button", { name: "Guardar estados" });
      await nombre.fill("Confirmado por familiar");
      await color.fill("#0d9488");
      await comportamiento.selectOption({ label: "Confirmado" });
      await colocar(page, nombre);
      const anterior = estados.getByLabel("Nombre del estado Cambio de fecha").locator("xpath=ancestor::tr[1]");
      await c.foto("nuevo", { recorte: [anterior, guardar], margen: 4, resaltar: [nombre, color, comportamiento, crear] });

      await crear.click();
      const creado = estados.getByLabel("Nombre del estado Confirmado por familiar").locator("xpath=ancestor::tr[1]");
      await c.expect(creado).toBeVisible();
      await sacarMouse(page);
      await c.foto("creado", { recorte: [anterior, guardar], margen: 4, resaltar: [creado.getByText("Estado propio"), guardar] });

      await guardar.click();
      await c.expect(estados.getByText("Estados guardados")).toBeVisible();
      await sacarMouse(page);
      await c.foto("guardado", { recorte: [anterior, guardar], margen: 4, resaltar: estados.getByText("Estados guardados") });

      // El menú de estados mide más que la ventana: se agranda la ventana para mostrarlo entero (en pantalla chica se corta, ver el aviso).
      await page.setViewportSize({ width: 1280, height: 1150 });
      await c.ir("/app/agenda");
      const estadoDeCita = page.getByRole("button", { name: /^No confirmado/ }).first();
      await estadoDeCita.click();
      const menu = page.getByRole("menu", { name: "Estado de la cita" });
      const nuevo = menu.getByRole("menuitem", { name: "Confirmado por familiar" });
      await c.expect(nuevo).toBeVisible();
      await c.foto("agenda", { recorte: [estadoDeCita, menu], resaltar: nuevo });
      await page.setViewportSize({ width: 1280, height: 760 });
    },
  },

  /* ─────────────────────────────── 9. Importar pacientes ─────────────────────────────── */
  {
    id: "importar-pacientes-de-otro-sistema",
    capitulo: "admin",
    titulo: "Importar los pacientes de otro sistema",
    roles: ["admin"],
    paraQue: "Al empezar, para traer a Novudent los pacientes que la clínica tiene en otro sistema o en una planilla. También sirve cuando llega una lista nueva.",
    antes: ["Un archivo con los pacientes (CSV, o los datos copiados de Excel) con una primera fila de encabezados: Nombre, Apellido, CI… Como mínimo, el nombre y el apellido de cada paciente."],
    pasos: [
      { texto: "Entrá a **Administración** y elegí «Configuración general». Bajá hasta la tarjeta que tiene el botón «Iniciar migración» y tocalo.", captura: "boton" },
      { texto: "Subí el archivo con «Subir .csv», o pegá en el cuadro los datos copiados de Excel (Ctrl+A, Ctrl+C y Ctrl+V).", captura: "datos" },
      { texto: "Dejá tildado «La primera fila son los encabezados» y tocá «Continuar»." },
      { texto: "Revisá las columnas: Novudent reconoce cada dato por el nombre del encabezado. Si alguna quedó mal, corregila en su desplegable. **Nombre** y **Apellido** son obligatorios.", captura: "columnas" },
      { texto: "Tocá «Vista previa». Arriba ves cuántos pacientes son nuevos, cuántos están duplicados (misma CI) y cuántos tienen deuda.", captura: "vista-previa" },
      { texto: "Tocá «Importar»: el botón dice cuántos pacientes nuevos entran, por ejemplo «Importar 2 pacientes». Los duplicados se omiten, los nuevos quedan en **Pacientes** y las deudas, en **Cuentas por cobrar**.", captura: "listo" },
    ],
    avisos: [
      { tipo: "ojo", texto: "No hay botón para deshacer. Probá primero con un archivo chico (tres o cuatro filas) y recién después cargá todo." },
      { tipo: "ojo", texto: "Los duplicados se detectan por la cédula (CI) contra los pacientes que ya están cargados. Si un mismo paciente aparece dos veces dentro del archivo, se importan las dos filas: limpiá el archivo antes." },
      { tipo: "ojo", texto: "Si el archivo trae una columna de deuda, por cada paciente con saldo se arma un presupuesto de saldo migrado ya aceptado, que aparece en **Cuentas por cobrar** ([[cobrar-a-quien-debe]])." },
      { tipo: "ojo", texto: "Los pacientes importados no traen la Historia Clínica pendiente (los que se cargan a mano sí): pedila desde su ficha, en Documentos clínicos ([[completar-la-historia-clinica]])." },
      { tipo: "tip", texto: "El archivo tiene datos personales de tus pacientes: borralo de la computadora cuando termines." },
      { tipo: "revisar", texto: "Se probó con un archivo armado a mano, no con exportaciones reales de otros sistemas. Si ninguna columna se reconoce por el encabezado, la pantalla toma las primeras cinco en este orden: nombre, apellido, CI, teléfono y correo." },
      { tipo: "revisar", texto: "La pantalla y sus textos nombran al sistema de origen (el título del cuadro, la ayuda del primer paso y el nombre del presupuesto de saldo). Conviene un nombre neutro, como «Importar pacientes»; en las capturas de este manual esos textos están recortados." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app");
      await irPorElMenu(c, "Configuración general");

      // Solo se muestra el botón: el título y el texto de la tarjeta nombran al sistema de origen.
      const iniciar = page.getByRole("button", { name: "Iniciar migración" });
      await colocar(page, iniciar);
      await c.foto("boton", { recorte: iniciar, margen: 6, resaltar: iniciar, ocultar: page.getByText(/Dentalink/) });
      await iniciar.click();

      // Archivo de ejemplo armado a mano, con datos inventados: dos pacientes nuevos (uno con deuda) y uno que ya está en la clínica (misma CI).
      const csv = [
        "Nombre;Apellidos;CI;Teléfono;Email;Deuda",
        "Rosa;Benegas;4.512.330;0981 200 301;rosa.benegas@ejemplo.com;0",
        "Hugo;Acuña;3.998.121;0971 200 302;;350000",
        "María;González;3.456.789;0981 111 111;maria@mail.com;0",
      ].join("\n");
      const modal = page.getByRole("dialog");
      await modal.locator("input[type=file]").setInputFiles({ name: "pacientes.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
      await c.expect(modal.locator("textarea")).toHaveValue(/Rosa;Benegas/);
      const subir = modal.getByRole("button", { name: "Subir .csv" });
      const continuar = modal.getByRole("button", { name: "Continuar" });
      // Se recorta desde «Subir .csv»: más arriba están el título y la ayuda, que nombran al sistema de origen.
      await c.foto("datos", { recorte: [subir, continuar], margen: 8, resaltar: subir });
      await continuar.click();

      // Con un solo recuadro (sin números) el recorte no se estira hacia arriba y el título del cuadro, que nombra al sistema de origen, queda afuera.
      const pasos = modal.locator("div.font-semibold").first();
      const vistaPrevia = modal.getByRole("button", { name: "Vista previa" });
      await c.expect(vistaPrevia).toBeVisible();
      await c.foto("columnas", { recorte: [pasos, vistaPrevia], margen: 0, resaltar: modal.locator("div.grid") });
      await vistaPrevia.click();

      const importar = modal.getByRole("button", { name: /^Importar/ });
      await c.expect(importar).toBeVisible();
      await c.foto("vista-previa", { recorte: [pasos, importar], margen: 0, resaltar: modal.locator("div.flex-wrap.gap-2").first() });
      await importar.click();

      const listo = modal.getByRole("heading", { name: "¡Migración completada!" });
      await c.expect(listo).toBeVisible();
      await c.foto("listo", { recorte: [modal.locator("svg.h-12"), modal.getByRole("button", { name: "Ver cuentas por cobrar" })], margen: 14, resaltar: listo });
    },
  },

  /* ─────────────────────────────── 10. Plazos de las tareas automáticas ─────────────────────────────── */
  {
    id: "ajustar-los-plazos-de-las-tareas",
    capitulo: "admin",
    titulo: "Ajustar los plazos de las tareas automáticas",
    roles: ["admin"],
    paraQue: "Para decidir cuánto tiempo después de un hecho —una cita que se perdió, un presupuesto presentado, un tratamiento terminado, un saldo pendiente— aparece la tarea automática en la bandeja.",
    pasos: [
      { texto: "Entrá a **Tareas** (menú de arriba) y tocá el engranaje que está arriba a la izquierda, junto al título: se abre **Configuración de plazos**.", captura: "pestana" },
      { texto: "Hay una tarjeta por cada tipo de tarea: **cita**, **captura**, **control** y **cobranza**. Cada una explica cuándo se genera." },
      { texto: "En la tarjeta que quieras cambiar, elegí el plazo: «Inmediato», «1 día», «1 semana», «1 mes», «1 año» u «otro» (y escribí cuántos días). Es el tiempo que pasa desde el hecho hasta que aparece la tarea.", captura: "plazo" },
      { texto: "Tocá «Guardar». Mientras no lo hagas, arriba dice que hay cambios no guardados.", captura: "guardado" },
      { texto: "El cambio vale enseguida: la bandeja de **Tareas** se recalcula sola con el plazo nuevo ([[trabajar-las-tareas]])." },
    ],
    avisos: [
      { tipo: "tip", texto: "De fábrica: cita, inmediato; captura, 3 días; control, 180 días (seis meses); cobranza, 7 días." },
      { tipo: "ojo", texto: "«1 mes» y «1 año» cuentan 30 y 365 días, no meses del calendario. El máximo de «otro» es 3.650 días (diez años)." },
      { tipo: "ojo", texto: "Hay dos tareas automáticas que no tienen plazo: la de **cita sin confirmar** (el mismo día, para las citas pendientes de los próximos 2 días) y la de **cheque** (en la fecha de cobro de cada cheque)." },
      { tipo: "tip", texto: "El mismo ajuste está también en **Administración** › «Configuración general», sección «Plazos de tareas automáticas». Solo el administrador lo ve." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app/tareas");
      await page.getByRole("tab", { name: "Configuración de plazos" }).click();
      const plazos = page.getByRole("heading", { name: "Configuración de plazos", level: 2 });
      await c.expect(plazos).toBeVisible();
      await page.waitForTimeout(900);
      await c.foto("pestana", { pantalla: true, alto: 640, resaltar: page.getByRole("tab", { name: "Configuración de plazos" }) });

      const tarjetaPlazos = plazos.locator(`xpath=ancestor::div[${conClase("p-4")}][1]`);
      const cobranza = page.getByRole("radiogroup", { name: "Plazo de la tarea de cobranza" });
      const unMes = cobranza.getByRole("radio", { name: "1 mes" });
      await unMes.click();
      const alerta = tarjetaPlazos.getByRole("alert");
      await c.expect(alerta).toContainText("hay cambios no guardados");
      await colocar(page, tarjetaPlazos);
      await sacarMouse(page);
      await c.foto("plazo", { recorte: tarjetaPlazos, alto: 900, margen: 4, resaltar: unMes });

      const guardar = tarjetaPlazos.getByRole("button", { name: "Guardar" });
      await guardar.click();
      await c.expect(tarjetaPlazos.getByText("Guardado")).toBeVisible();
      await sacarMouse(page);
      await c.foto("guardado", { recorte: tarjetaPlazos, alto: 900, margen: 4, resaltar: tarjetaPlazos.getByText("Guardado") });
    },
  },

  /* ─────────────────────────────── 11. Dar de baja a un usuario ─────────────────────────────── */
  {
    id: "dar-de-baja-a-un-usuario",
    capitulo: "admin",
    titulo: "Dar de baja a un usuario",
    roles: ["admin"],
    paraQue: "Cuando una persona deja la clínica o no tiene que entrar más. Pierde el acceso al instante, pero no se borra nada de lo que hizo.",
    pasos: [
      { texto: "Entrá a **Administración** y elegí «Usuarios y profesionales»." },
      { texto: "En la fila de la persona, tocá el botón con el círculo tachado, el último de la fila.", captura: "baja" },
      { texto: "El sistema pregunta si querés dar de baja a esa persona. Aceptá." },
      { texto: "La fila queda en gris con la etiqueta **Inactivo**, y el número de usuarios activos baja en uno.", captura: "inactivo" },
      { texto: "Para devolverle el acceso, tocá el botón verde de encendido de la misma fila y aceptá la pregunta.", captura: "reactivar" },
    ],
    avisos: [
      { tipo: "tip", texto: "Lo que hizo la persona queda como estaba: sus citas, evoluciones, cobros y documentos siguen en el sistema con su nombre. Un doctor dado de baja sigue figurando en las citas que ya tenía, pero ya no se ofrece para citas, planes ni documentos nuevos." },
      { tipo: "ojo", texto: "No se puede dar de baja a uno mismo (tu fila no tiene el botón) ni al último administrador activo: la clínica se quedaría sin quien la configure." },
      { tipo: "tip", texto: "Un usuario dado de baja deja de contar para el tope de usuarios del plan: sirve para hacer lugar a otra persona." },
      { tipo: "revisar", texto: "En la demo no hay cuentas de acceso reales, así que no se pudo comprobar que la persona dada de baja ya no pueda entrar. El aviso del sistema dice que pierde el acceso de inmediato y las reglas de la base de datos lo exigen: probarlo en una clínica real." },
    ],
    capturar: async (c) => {
      const { page } = c;
      page.on("dialog", (d) => void d.accept());
      await c.entrar("admin", "/app");
      await irPorElMenu(c, "Usuarios y profesionales");

      const usuarios = tarjeta(page, "Usuarios del equipo");
      await colocar(page, usuarios);
      const laura = filaDe(page, "Laura Recepción");
      const baja = laura.getByRole("button", { name: /Dar de baja/ });
      await c.foto("baja", { recorte: laura, margen: 2, resaltar: baja });

      await baja.click();
      await c.expect(laura.getByText("Inactivo")).toBeVisible();
      await sacarMouse(page);
      const contador = usuarios.getByRole("heading", { name: "Usuarios del equipo" }).locator("xpath=following-sibling::span[1]");
      await c.foto("inactivo", { recorte: [contador, laura], resaltar: [contador, laura.getByText("Inactivo")] });

      const reactivar = laura.getByRole("button", { name: "Reactivar acceso" });
      await c.foto("reactivar", { recorte: laura, margen: 2, resaltar: reactivar });
    },
  },

  /* ─────────────────────────────── 12. Fusionar dos fichas ─────────────────────────────── */
  {
    id: "fusionar-dos-fichas",
    capitulo: "admin",
    titulo: "Fusionar dos fichas de un mismo paciente",
    roles: ["admin"],
    paraQue: "Cuando un mismo paciente quedó cargado dos veces, por ejemplo con la cédula mal escrita. Se junta todo en una sola ficha.",
    antes: ["Saber cuál de las dos fichas es la buena: esa es la que se mantiene."],
    pasos: [
      { texto: "Entrá a **Administración** y elegí «Fusión de fichas».", captura: "menu" },
      { texto: "En **Mantener esta ficha**, elegí la ficha buena (la más completa). Es la que queda. Fijate en la cédula: dos personas distintas pueden tener el mismo nombre." },
      { texto: "En **Fusionar y eliminar**, elegí la ficha duplicada. Esa es la que desaparece.", captura: "fichas" },
      { texto: "Tocá «Fusionar fichas» y aceptá la pregunta.", captura: "boton" },
      { texto: "La ficha duplicada deja de existir. Sus citas, presupuestos, pagos, evoluciones, consentimientos, radiografías y documentos pasan a la ficha que mantuviste.", captura: "resultado" },
    ],
    avisos: [
      { tipo: "ojo", texto: "No se puede deshacer. Revisá dos veces las dos fichas antes de aceptar." },
      { tipo: "ojo", texto: "El primer desplegable viene con la primera ficha de la lista ya elegida: cambiala siempre por la que querés mantener." },
      { tipo: "ojo", texto: "No pasan a la ficha que se mantiene: los datos personales de la duplicada (teléfono, correo, convenio, foto), sus alertas médicas de la cabecera, las recetas, el tratamiento de ortodoncia, la lista de espera, las tareas ni los mensajes automáticos de WhatsApp. Antes de fusionar, pasá a mano lo que haga falta." },
      { tipo: "ojo", texto: "Si las dos fichas tenían la Historia Clínica pendiente, la que queda va a tener dos: anulá la que sobre desde Documentos clínicos ([[completar-la-historia-clinica]])." },
      { tipo: "error", texto: "La fusión pierde las recetas y el tratamiento de ortodoncia de la ficha duplicada y deja sueltas su lista de espera, sus tareas y sus mensajes automáticos (en la lista de espera aparece una fila sin nombre). Tendrían que pasar a la ficha que se mantiene." },
    ],
    capturar: async (c) => {
      const { page } = c;
      page.on("dialog", (d) => void d.accept());
      await c.entrar("admin", "/app/pacientes/nuevo");

      // La demo no trae fichas duplicadas: se carga una, con la cédula mal escrita, recorriendo el formulario de «Nuevo paciente».
      const principal = page.locator("main");
      await principal.getByLabel("Nombre legal *").fill("María");
      await principal.getByLabel("Apellidos *").fill("Gonzalez");
      await principal.getByLabel("Cédula / DNI *").fill("3.456.798");
      await principal.getByLabel("Fecha de nacimiento *").fill("1985-03-14");
      await principal.getByLabel("Sexo *").selectOption("F");
      await principal.getByLabel("Género *").selectOption("F");
      await principal.getByLabel("Teléfono móvil *").fill("0981 111 112");
      await principal.getByLabel("Email *").fill("maria.gonzalez@example.com");
      await principal.getByRole("button", { name: "Crear paciente" }).click();
      await page.waitForURL(/\/app\/pacientes\/p_/);
      await c.ir("/app");

      await irPorElMenu(c, "Fusión de fichas", "menu");
      const fusion = tarjeta(page, "Fusión de fichas");
      await colocar(page, fusion);
      const mantener = fusion.getByLabel("Mantener esta ficha");
      const duplicada = fusion.getByLabel("Fusionar y eliminar");
      await mantener.selectOption({ label: "María González · 3.456.789" });
      await duplicada.selectOption({ label: "María Gonzalez · 3.456.798" });
      await c.foto("fichas", { recorte: fusion, margen: 4, resaltar: [mantener, duplicada] });

      const fusionar = fusion.getByRole("button", { name: "Fusionar fichas" });
      await c.foto("boton", { recorte: fusion, margen: 4, resaltar: fusionar });
      await fusionar.click();
      await c.expect(duplicada).toHaveValue("");

      await c.ir("/app/pacientes");
      const buscador = page.getByPlaceholder("Buscar por nombre, CI o teléfono…");
      await buscador.fill("gonz");
      const quedo = page.getByRole("link", { name: "Abrir la ficha de María González" }).locator("xpath=ancestor::tr[1]");
      await c.expect(quedo).toBeVisible();
      await c.expect(page.getByRole("link", { name: "Abrir la ficha de María Gonzalez" })).toHaveCount(0);
      await c.foto("resultado", { recorte: [buscador, quedo], margen: 12, resaltar: quedo });
    },
  },

  /* ─────────────────────────────── 13. Plan y suscripción ─────────────────────────────── */
  {
    id: "ver-el-plan-y-la-suscripcion",
    capitulo: "admin",
    titulo: "Ver tu plan y tu suscripción",
    roles: ["admin"],
    paraQue: "Para saber qué plan tiene la clínica, qué incluye cada plan y si la suscripción está al día.",
    pasos: [
      { texto: "Entrá a **Administración** y elegí «Suscripción».", captura: "menu" },
      { texto: "Arriba ves el plan de la clínica y su estado: **Al día**, **Prueba gratis**, **Pago pendiente**, **Cancelada** o **Vencida** (las cuentas anteriores al cobro dicen «Cuenta anterior al cobro» y siguen activas). Si corresponde, también hasta cuándo está pago.", captura: "estado" },
      { texto: "Más abajo, **Planes Novudent** compara los tres planes. Con «Mensual» y «Anual» ves el precio de cada uno; el de la clínica dice «Tu plan».", captura: "planes" },
      { texto: "Para pasar a otro plan, tocá «Solicitar Plan…» en su tarjeta: se abre el formulario de contacto de Novum. Los precios publicados no cambian solos una suscripción que ya existe: el cambio lo confirma Novum." },
      { texto: "Si la suscripción tiene un pago pendiente o venció, aparece un aviso rojo arriba de todas las pantallas, con el botón «Regularizar pago».", captura: "vencida" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Con la suscripción vencida o con el pago pendiente, el sistema avisa que el equipo puede consultar y exportar los datos pero no editar hasta que se regularice el pago." },
      { tipo: "tip", texto: "Los topes por plan: el **Plan Solo**, 1 profesional y hasta 3 usuarios activos; el **Plan Clínica**, hasta 4 profesionales y 12 usuarios; el **Plan Multi**, hasta 10 profesionales y sin tope de usuarios. Un profesional adicional se pide a Novum." },
      { tipo: "tip", texto: "Cuando la clínica tiene un cobro asociado, arriba a la derecha aparece «Gestionar pago y facturas»." },
      { tipo: "revisar", texto: "La demo no tiene cobro: muestra «Cuenta anterior al cobro» y no trae el aviso de vencimiento. La última captura se armó cargando a mano una suscripción vencida en la demo. Que el sistema deje de guardar con la suscripción vencida salió de leer las reglas de la base de datos; ninguna pantalla bloquea los botones, así que hay que probarlo en una clínica real." },
      { tipo: "revisar", texto: "La oferta pública pone «Varios boxes y sucursales» y «Reportes por profesional y sucursal» en Multi, pero el sistema ya activa los boxes y los reportes en Clínica. Confirmar cuál de las dos descripciones es la correcta." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app");
      await irPorElMenu(c, "Suscripción", "menu");

      const estado = page.getByRole("heading", { level: 2, name: /^Plan (Solo|Clínica|Multi)$/ }).locator(`xpath=ancestor::div[${conClase("p-6")}][1]`);
      await c.expect(estado).toBeVisible();
      await colocar(page, estado, 150);
      await c.foto("estado", { recorte: estado, margen: 4, resaltar: estado.locator("span", { hasText: /^(Al día|Prueba gratis|Pago pendiente|Cancelada|Vencida|Cuenta anterior al cobro)$/ }) });

      const planes = page.getByRole("heading", { level: 2, name: "Planes Novudent" });
      const ultimoPlan = page.getByRole("heading", { level: 3, name: "Plan Multi" }).locator(`xpath=ancestor::div[${conClase("p-6")}][1]`);
      await colocar(page, planes, 150);
      await c.foto("planes", { recorte: [planes, ultimoPlan], alto: 1000, margen: 4, resaltar: [page.getByRole("button", { name: "Anual" }), page.getByText("Tu plan", { exact: true })] });
      await page.getByRole("button", { name: "Anual" }).click();
      await c.expect(page.getByText("/ año").first()).toBeVisible();
      await page.getByRole("button", { name: "Mensual" }).click();

      // «Solicitar Plan…» lleva al formulario de contacto de Novum.
      await page.getByRole("link", { name: /^Solicitar Plan Solo/ }).click();
      await page.waitForURL(/\/acceso/);
      await c.expect(page.getByRole("heading", { level: 1, name: "Empecemos con tu clínica." })).toBeVisible();

      // La demo no tiene cobro. Para mostrar el aviso de vencimiento se carga en el estado local una suscripción con el pago pendiente
      // (es lo que escribiría el servidor de cobro); el aviso y la pantalla son los reales.
      await page.evaluate(() => {
        const clave = "novudent.db.v4";
        const db = JSON.parse(localStorage.getItem(clave) || "null");
        db.subscription = { clinicId: "cl_demo", plan: "clinica", status: "past_due", currentPeriodEndMs: Date.now() - 5 * 86_400_000, updatedAt: new Date().toISOString() };
        localStorage.setItem(clave, JSON.stringify(db));
      });
      await c.ir("/app/suscripcion");
      const banner = page.getByRole("status").filter({ hasText: "No pudimos procesar tu último pago" });
      await c.expect(banner).toBeVisible();
      const estadoVencido = page.getByRole("heading", { level: 2, name: "Plan Clínica" }).locator(`xpath=ancestor::div[${conClase("p-6")}][1]`);
      await c.foto("vencida", { recorte: [banner, estadoVencido], margen: 4, resaltar: [banner.getByRole("link", { name: "Regularizar pago" }), estadoVencido.getByText("Pago pendiente")] });
    },
  },

  /* ─────────────────────────────── 14. Difusión al equipo ─────────────────────────────── */
  {
    id: "mandar-una-difusion-al-equipo",
    capitulo: "admin",
    titulo: "Mandar un mensaje a todo el equipo",
    roles: ["admin"],
    verComo: ["dentist"], // el último paso muestra cómo le llega el aviso a una dentista («así lo ve ella»)
    paraQue: "Para avisarle lo mismo a todo el equipo a la vez: un cambio de horario, un feriado, una norma nueva. Vos ves quién lo leyó.",
    pasos: [
      { texto: "Entrá a **Chat** (menú de arriba) y, en la lista de la izquierda, tocá «Difusión general».", captura: "lista" },
      { texto: "Escribí el aviso en el cuadro. Debajo dice a cuántas personas les va a llegar; tocá ese texto para ver los nombres.", captura: "escribir" },
      { texto: "Tocá «Enviar a todos». Aparece «Listo: le llegó a…» con la cantidad de personas.", captura: "enviado" },
      { texto: "Abajo, en **Difusiones enviadas**, ves a quién le llegó y quién ya lo leyó (queda en verde, con «leída»)." },
      { texto: "Así lo ve cada persona del equipo (acá, la Dra. Sofía): le llega en su conversación con vos, marcado «Difusión». Nadie ve a quién más se lo mandaste.", captura: "recibido" },
    ],
    avisos: [
      { tipo: "ojo", texto: "Solo el administrador puede mandar una difusión. Le llega a las personas activas del equipo; los usuarios dados de baja no la reciben." },
      { tipo: "ojo", texto: "Una difusión no se puede editar ni borrar después de enviada: leela antes. Cada mensaje admite hasta 2.000 caracteres." },
      { tipo: "tip", texto: "Si querés que todos lo vean juntos y puedan contestar, escribilo en el canal **Equipo** ([[usar-el-chat]]): la difusión llega a cada uno por separado." },
    ],
    capturar: async (c) => {
      const { page } = c;
      await c.entrar("admin", "/app");
      const chat = page.getByRole("banner").getByRole("link", { name: /^Chat/ });
      await chat.click();
      const difusion = page.getByRole("button", { name: /^Difusión general/ });
      await c.expect(difusion).toBeVisible();
      await c.foto("lista", { pantalla: true, resaltar: [chat, difusion] });

      await difusion.click();
      const panel = page.getByRole("region", { name: "Difusión general" });
      const mensaje = panel.getByLabel("Mensaje de la difusión");
      await mensaje.fill("Mañana cerramos a las 16:00 por mantenimiento del consultorio.");
      const destinatarios = panel.locator("summary");
      await destinatarios.click();
      const enviar = panel.getByRole("button", { name: "Enviar a todos" });
      // El recorte arranca en la cabecera del panel (la fila con el título «Difusión general»): así no queda un ícono cortado por la mitad.
      const cabecera = panel.locator("div.border-b").first();
      await c.foto("escribir", { recorte: [cabecera, panel.locator("details"), enviar], margen: 0, resaltar: [mensaje, destinatarios, enviar] });

      await enviar.click();
      const listo = panel.getByRole("status").filter({ hasText: "Listo" });
      await c.expect(listo).toBeVisible();
      await sacarMouse(page);
      const primera = panel.getByRole("heading", { name: "Difusiones enviadas" }).locator("xpath=following-sibling::ul[1]/li[1]");
      await c.foto("enviado", { recorte: [listo, primera], margen: 0, resaltar: [listo, primera] });

      // Cada persona lo recibe en su conversación con el administrador, marcado «Difusión» (se pasa a la Dra. Sofía sin cerrar sesión).
      await c.entrar("dentist", "/app/chat");
      await page.getByRole("button", { name: /^Carlos Admin/ }).click();
      const hilo = page.getByRole("region", { name: "Conversación con Carlos Admin" });
      const recibido = hilo.getByRole("listitem").filter({ hasText: "Mañana cerramos a las 16:00 por mantenimiento del consultorio." }).locator("div.rounded-2xl");
      await c.expect(recibido).toBeVisible();
      await c.expect(recibido.getByText("Difusión", { exact: true })).toBeVisible();
      await c.foto("recibido", { recorte: hilo, resaltar: recibido });
    },
  },
];
