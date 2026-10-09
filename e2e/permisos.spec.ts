import type { Page } from "@playwright/test";
import { test, expect, entrarDemo, leerDB, sinScrollHorizontal, USUARIOS_DEMO } from "./soporte";

/* Pedido de Camila (7-oct-2026): «para sacar y dar permisos de acceso a información o ejecución». Configuración › Permisos del
   equipo: el administrador elige un rol y da o saca lo que puede ver y hacer; se guarda solo la diferencia contra la fábrica
   (`config.permisos`) y rige en el acto. Acá se prueba de punta a punta lo que se ve: la pantalla, lo que se guarda y cómo queda
   la app para la persona de ese rol. Que Firestore lo haga cumplir lo prueba `npm run test:rules`. */

const permisos = (page: Page) => page.getByRole("region", { name: "Permisos del equipo" });
const casilla = (page: Page, texto: string) => permisos(page).getByRole("checkbox", { name: texto, exact: true });
const rol = (page: Page, nombre: string) => permisos(page).getByRole("group", { name: "Rol" }).getByRole("button", { name: new RegExp(`^${nombre}`) });

const COBRAR = "Cobrar y hacer el arqueo de caja";
const MONTOS = "Ver montos: precios, presupuestos, deudas y saldos";
const ESCRIBIR_FICHA = "Escribir en la ficha clínica (evoluciones, odontograma, recetas)";
const LEER_FICHA = "Leer la ficha clínica";

async function irAPermisos(page: Page) {
  await page.goto("/app/configuracion");
  await expect(permisos(page)).toBeVisible();
}

/** Cambia de persona SIN cerrar sesión: cerrarla borra la base local (con Firebase la configuración vive en el servidor y no se
 *  pierde), y acá lo que el administrador guardó tiene que seguir ahí cuando entra otra persona. */
async function entrarComo(page: Page, nombre: string) {
  const db = await leerDB(page);
  const u = db.users.find((x: { name: string }) => x.name === nombre);
  expect(u, `${nombre} existe en la demo`).toBeTruthy();
  await page.evaluate(
    ([clave, sesion]) => localStorage.setItem(clave as string, JSON.stringify(sesion)),
    ["novudent.session.v1", { userId: u.id, clinicId: u.clinicId, role: u.role, name: u.name }] as const,
  );
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

const denegado = (page: Page) => page.getByRole("heading", { name: "Acceso denegado", level: 1 });

async function ver(page: Page, quien: string, ruta: string) {
  await entrarComo(page, quien);
  await page.goto(ruta);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

test.describe("Configuración › Permisos del equipo", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page); await irAPermisos(page); });

  test("cada rol arranca con lo de fábrica y crear usuarios o configurar la clínica no se reparten", async ({ page }) => {
    await rol(page, "Dentista").click();
    await expect(casilla(page, ESCRIBIR_FICHA)).toBeChecked();
    await expect(casilla(page, COBRAR)).not.toBeChecked();
    // Los permisos del dueño se muestran con candado y sin casilla: no hay cómo darlos.
    await expect(permisos(page).getByText("Crear usuarios y cambiar sus roles")).toBeVisible();
    await expect(permisos(page).getByRole("checkbox", { name: /Crear usuarios/ })).toHaveCount(0);
    await expect(permisos(page).getByRole("checkbox", { name: /Configurar la clínica/ })).toHaveCount(0);
    // El administrador está para cambiarle el nombre, pero no tiene permisos que marcar.
    await rol(page, "Administrador").click();
    await expect(permisos(page).getByRole("checkbox")).toHaveCount(0);
    await expect(permisos(page).getByText("El Administrador siempre puede todo: no se le pueden sacar permisos.")).toBeVisible();
    await rol(page, "Dentista").click();
    await expect(permisos(page).getByRole("button", { name: "Guardar permisos" })).toBeDisabled();
    await expect(permisos(page).getByText("Hay cambios sin guardar.")).toHaveCount(0);
  });

  test("las acciones que el sistema bloquea por dentro tienen candado, y cada permiso dice si es de ver o de hacer", async ({ page }) => {
    await rol(page, "Dentista").click();
    const filaCobrar = casilla(page, COBRAR).locator("xpath=ancestor::li[1]");
    await expect(filaCobrar.getByText("Hacer", { exact: true })).toBeVisible();
    await expect(filaCobrar.getByText("Lo bloquea el sistema")).toBeVisible();
    const filaMontos = casilla(page, MONTOS).locator("xpath=ancestor::li[1]");
    await expect(filaMontos.getByText("Ver", { exact: true })).toBeVisible();
    await expect(filaMontos.getByText("Lo bloquea el sistema")).toHaveCount(0);
  });

  test("dar un permiso: se marca como agregado, se guarda solo la diferencia y la persona lo tiene", async ({ page }) => {
    // Antes: la dentista no ve los montos, así que Facturación le dice «Acceso denegado».
    await ver(page, USUARIOS_DEMO.dentista, "/app/facturacion");
    await expect(denegado(page)).toBeVisible();

    await entrarComo(page, USUARIOS_DEMO.admin);
    await irAPermisos(page);
    await rol(page, "Dentista").click();
    await casilla(page, MONTOS).check();
    await expect(casilla(page, MONTOS).locator("xpath=ancestor::li[1]").getByText("Agregado", { exact: true })).toBeVisible();
    await expect(permisos(page).getByText("Hay cambios sin guardar.")).toBeVisible();
    await expect(rol(page, "Dentista")).toContainText("1");
    await permisos(page).getByRole("button", { name: "Guardar permisos" }).click();
    await expect(permisos(page).getByText(/Guardado: ya rige/)).toBeVisible();

    // Se guardan los cuatro roles, con las dos listas, y solo la diferencia contra la fábrica.
    const guardado = (await leerDB(page)).clinics[0].config.permisos;
    expect(guardado.dentist).toEqual({ dar: ["money.view"], quitar: [] });
    for (const r of ["cashier", "receptionist", "commercial", "assistant"]) expect(guardado[r]).toEqual({ dar: [], quitar: [] });
    expect(Object.keys(guardado).sort()).toEqual(["assistant", "cashier", "commercial", "dentist", "receptionist"]);

    // Después: la dentista entra a Facturación.
    await ver(page, USUARIOS_DEMO.dentista, "/app/facturacion");
    await expect(denegado(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Facturación", level: 1 })).toBeVisible();
  });

  test("sacar un permiso: la caja deja de cobrar y lo que no se tocó sigue igual", async ({ page }) => {
    await ver(page, USUARIOS_DEMO.caja, "/app/caja");
    await expect(denegado(page)).toHaveCount(0);

    await entrarComo(page, USUARIOS_DEMO.admin);
    await irAPermisos(page);
    await rol(page, "Recepción y caja").click();
    await casilla(page, COBRAR).uncheck();
    await expect(casilla(page, COBRAR).locator("xpath=ancestor::li[1]").getByText("Quitado", { exact: true })).toBeVisible();
    await permisos(page).getByRole("button", { name: "Guardar permisos" }).click();
    await expect(permisos(page).getByText(/Guardado: ya rige/)).toBeVisible();
    expect((await leerDB(page)).clinics[0].config.permisos.cashier).toEqual({ dar: [], quitar: ["payments.manage"] });

    await ver(page, USUARIOS_DEMO.caja, "/app/caja");
    await expect(denegado(page)).toBeVisible();
    // Sigue viendo montos (no se lo sacamos): Facturación abre.
    await ver(page, USUARIOS_DEMO.caja, "/app/facturacion");
    await expect(denegado(page)).toHaveCount(0);
  });

  test("dar «cobrar» da también «ver montos», y sacar «ver montos» saca «cobrar»: se avisa", async ({ page }) => {
    await rol(page, "Recepcionista").click();
    await casilla(page, COBRAR).check();
    await expect(casilla(page, MONTOS)).toBeChecked();
    await expect(permisos(page).getByRole("status").filter({ hasText: "Se dio también" })).toContainText(MONTOS);

    await casilla(page, MONTOS).uncheck();
    await expect(casilla(page, COBRAR)).not.toBeChecked();
    await expect(permisos(page).getByRole("status").filter({ hasText: "Se sacó también" })).toContainText(COBRAR);
  });

  test("sacar «leer la ficha» saca también «escribir en la ficha»", async ({ page }) => {
    await rol(page, "Dentista").click();
    await casilla(page, LEER_FICHA).uncheck();
    await expect(casilla(page, ESCRIBIR_FICHA)).not.toBeChecked();
  });

  test("descartar vuelve a lo guardado, y «volver a fábrica» deshace lo repartido", async ({ page }) => {
    await rol(page, "Dentista").click();
    await casilla(page, MONTOS).check();
    await permisos(page).getByRole("button", { name: "Descartar cambios" }).click();
    await expect(casilla(page, MONTOS)).not.toBeChecked();
    await expect(permisos(page).getByText("Hay cambios sin guardar.")).toHaveCount(0);

    // Dar, guardar y volver a la fábrica: el rol vuelve a no tener el permiso.
    await casilla(page, MONTOS).check();
    await permisos(page).getByRole("button", { name: "Guardar permisos" }).click();
    await expect(permisos(page).getByText(/Guardado: ya rige/)).toBeVisible();
    const volver = permisos(page).getByRole("button", { name: /Volver Dentista a como viene de fábrica/ });
    await expect(volver).toBeEnabled();
    await volver.click();
    await expect(casilla(page, MONTOS)).not.toBeChecked();
    await permisos(page).getByRole("button", { name: "Guardar permisos" }).click();
    await expect(permisos(page).getByText(/Guardado: ya rige/)).toBeVisible();
    expect((await leerDB(page)).clinics[0].config.permisos.dentist).toEqual({ dar: [], quitar: [] });
    await expect(volver).toBeDisabled();

    await ver(page, USUARIOS_DEMO.dentista, "/app/facturacion");
    await expect(denegado(page)).toBeVisible();
  });

  test("lo guardado sigue ahí al recargar", async ({ page }) => {
    await rol(page, "Asistente de doctores").click();
    await casilla(page, ESCRIBIR_FICHA).check();
    await permisos(page).getByRole("button", { name: "Guardar permisos" }).click();
    await expect(permisos(page).getByText(/Guardado: ya rige/)).toBeVisible();

    await page.reload();
    await expect(permisos(page)).toBeVisible();
    await rol(page, "Asistente de doctores").click();
    await expect(casilla(page, ESCRIBIR_FICHA)).toBeChecked();
    await expect(rol(page, "Asistente de doctores")).toContainText("1");
  });

  test("lo que se escribió a mano en la base no rompe la app ni da permisos del dueño", async ({ page }) => {
    // Alguien edita Firestore: un rol que no es un mapa, listas que no son listas y permisos que solo tiene el administrador.
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
      db.clinics[0].config.permisos = {
        cashier: "basura",
        dentist: { dar: ["practice.config", "users.manage", "inventada"], quitar: 3 },
        assistant: { dar: "emr.write" },
      };
      localStorage.setItem("novudent.db.v4", JSON.stringify(db));
    });
    await ver(page, USUARIOS_DEMO.dentista, "/app/configuracion");
    await expect(denegado(page)).toBeVisible();
    await ver(page, USUARIOS_DEMO.caja, "/app/caja");
    await expect(denegado(page)).toHaveCount(0);
    // El administrador abre la pantalla y ve todo de fábrica.
    await entrarComo(page, USUARIOS_DEMO.admin);
    await irAPermisos(page);
    await rol(page, "Dentista").click();
    await expect(casilla(page, ESCRIBIR_FICHA)).toBeChecked();
    await expect(permisos(page).getByRole("button", { name: "Guardar permisos" })).toBeDisabled();
  });

  test("la pantalla no obliga a scrollear de costado", async ({ page }) => {
    await permisos(page).scrollIntoViewIfNeeded();
    await sinScrollHorizontal(page);
    await rol(page, "Recepción y caja").click();
    await sinScrollHorizontal(page);
  });
});

test.describe("Configuración › Comercial, nombres y roles propios", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page); await irAPermisos(page); });

  const guardar = (page: Page) => permisos(page).getByRole("button", { name: "Guardar permisos" });
  const nombreDelRol = (page: Page) => permisos(page).getByLabel("Nombre del rol", { exact: true });
  const rolDeLaPersona = (page: Page, nombre: string) => page.getByRole("combobox", { name: `Rol de ${nombre}` });
  const roles = async (page: Page) => (await leerDB(page)).clinics[0].config;

  test("Comercial viene como un rol más, con lo suyo de fábrica", async ({ page }) => {
    await rol(page, "Comercial").click();
    for (const t of ["Dar citas", "Presentar y aceptar presupuestos", "Documentos clínicos, consentimientos y CRM", MONTOS]) await expect(casilla(page, t), t).toBeChecked();
    for (const t of [COBRAR, LEER_FICHA, ESCRIBIR_FICHA]) await expect(casilla(page, t), t).not.toBeChecked();
  });

  test("otro nombre para un rol de fábrica: se ve en Usuarios y vale solo para esta clínica; se puede volver al de fábrica", async ({ page }) => {
    await rol(page, "Dentista").click();
    await nombreDelRol(page).fill("Odontólogo");
    await expect(permisos(page).getByText("Hay cambios sin guardar.")).toBeVisible();
    await guardar(page).click();
    await expect(permisos(page).getByText(/Guardado: ya rige/)).toBeVisible();
    expect((await roles(page)).nombresDeRoles.dentist).toBe("Odontólogo");
    await expect(rol(page, "Odontólogo")).toBeVisible();
    await expect(rol(page, "Dentista")).toHaveCount(0);
    await expect(rolDeLaPersona(page, USUARIOS_DEMO.dentista).locator("option:checked")).toHaveText("Odontólogo");
    await expect(permisos(page).getByText("De fábrica se llama «Dentista».")).toBeVisible();

    await permisos(page).getByRole("button", { name: "Volver al nombre de fábrica" }).click();
    await expect(nombreDelRol(page)).toHaveValue("Dentista");
    await guardar(page).click();
    await expect(permisos(page).getByText(/Guardado: ya rige/)).toBeVisible();
    expect((await roles(page)).nombresDeRoles.dentist).toBe("");
    await expect(rolDeLaPersona(page, USUARIOS_DEMO.dentista).locator("option:checked")).toHaveText("Dentista");
  });

  test("un nombre repetido o vacío se explica y no se deja guardar", async ({ page }) => {
    await rol(page, "Dentista").click();
    await nombreDelRol(page).fill("recepcionista");
    await expect(permisos(page).getByRole("alert").filter({ hasText: "Ya hay un rol con ese nombre." })).toBeVisible();
    await expect(guardar(page)).toBeDisabled();
    await nombreDelRol(page).fill("   ");
    await expect(permisos(page).getByRole("alert").filter({ hasText: "Escribí el nombre del rol." })).toBeVisible();
    await expect(guardar(page)).toBeDisabled();
    await nombreDelRol(page).fill("Dentista");
    await expect(permisos(page).getByRole("alert")).toHaveCount(0);
  });

  test("el administrador también se puede llamar de otra forma", async ({ page }) => {
    await rol(page, "Administrador").click();
    await nombreDelRol(page).fill("Dueño de la clínica");
    await guardar(page).click();
    await expect(permisos(page).getByText(/Guardado: ya rige/)).toBeVisible();
    expect((await roles(page)).nombresDeRoles.admin).toBe("Dueño de la clínica");
    await expect(rol(page, "Dueño de la clínica")).toBeVisible();
  });

  test("crear un rol propio con la copia de otro, ajustarlo, asignarlo a una persona y que la persona pueda lo que se le dio", async ({ page }) => {
    await permisos(page).getByRole("button", { name: "Nuevo rol" }).click();
    await permisos(page).getByLabel("Nombre del rol nuevo").fill("Coordinación de tratamientos");
    await permisos(page).getByLabel("Empezar con los permisos de").selectOption({ label: "Comercial" });
    await permisos(page).getByRole("button", { name: "Crear rol" }).click();

    await expect(rol(page, "Coordinación de tratamientos")).toHaveAttribute("aria-pressed", "true");
    await expect(casilla(page, "Presentar y aceptar presupuestos")).toBeChecked();
    await expect(casilla(page, COBRAR)).not.toBeChecked();
    // un rol propio no tiene «de fábrica»: no se marca nada como agregado o quitado
    await expect(permisos(page).getByText("Agregado", { exact: true })).toHaveCount(0);
    await expect(permisos(page).getByRole("button", { name: /a como viene de fábrica/ })).toHaveCount(0);
    const config = await roles(page);
    const nuevo = config.rolesPropios[0];
    expect(nuevo).toMatchObject({ nombre: "Coordinación de tratamientos" });
    expect(nuevo.id).toMatch(/^rp_[a-z0-9]{8}$/);
    expect(config.permisos[nuevo.id].dar).toContain("budgets.manage");
    expect(config.permisos[nuevo.id].quitar).toEqual([]);

    // se ajusta: ya no da citas
    await casilla(page, "Dar citas").uncheck();
    await guardar(page).click();
    await expect(permisos(page).getByText(/Guardado: ya rige/)).toBeVisible();
    expect((await roles(page)).permisos[nuevo.id].dar).not.toContain("agenda.create");

    // se le asigna a Laura (recepcionista: de fábrica no ve montos) y ahora los ve, pero no cobra
    await rolDeLaPersona(page, "Laura Recepción").selectOption({ label: "Coordinación de tratamientos" });
    await expect.poll(async () => (await leerDB(page)).users.find((u: { name: string }) => u.name === "Laura Recepción")?.role).toBe(nuevo.id);
    await entrarComo(page, "Laura Recepción");
    await page.goto("/app/facturacion");
    await expect(denegado(page)).toHaveCount(0);
    await page.goto("/app/caja");
    await expect(denegado(page)).toBeVisible();
  });

  test("un rol propio con gente no se puede eliminar; cuando nadie lo tiene, sí", async ({ page }) => {
    await permisos(page).getByRole("button", { name: "Nuevo rol" }).click();
    await permisos(page).getByLabel("Nombre del rol nuevo").fill("Marketing");
    await permisos(page).getByRole("button", { name: "Crear rol" }).click();
    await expect(rol(page, "Marketing")).toHaveAttribute("aria-pressed", "true");
    // sin plantilla arranca sin permisos
    await expect(permisos(page).getByRole("checkbox", { checked: true })).toHaveCount(0);

    await rolDeLaPersona(page, "Laura Recepción").selectOption({ label: "Marketing" });
    await rol(page, "Marketing").click();
    await expect(permisos(page).getByText(/Lo tiene 1 persona/)).toBeVisible();
    await expect(permisos(page).getByRole("button", { name: "Eliminar este rol" })).toBeDisabled();

    await rolDeLaPersona(page, "Laura Recepción").selectOption({ label: "Recepcionista" });
    await rol(page, "Marketing").click();
    await expect(permisos(page).getByText("Nadie lo tiene: se puede eliminar.")).toBeVisible();
    page.once("dialog", (d) => void d.accept());
    await permisos(page).getByRole("button", { name: "Eliminar este rol" }).click();
    await expect(rol(page, "Marketing")).toHaveCount(0);
    expect((await roles(page)).rolesPropios).toEqual([]);
  });

  test("el nombre de un rol propio también se cambia y se ve en Usuarios", async ({ page }) => {
    await permisos(page).getByRole("button", { name: "Nuevo rol" }).click();
    await permisos(page).getByLabel("Nombre del rol nuevo").fill("Marketing");
    await permisos(page).getByRole("button", { name: "Crear rol" }).click();
    await nombreDelRol(page).fill("Marketing digital");
    await guardar(page).click();
    await expect(permisos(page).getByText(/Guardado: ya rige/)).toBeVisible();
    await expect(rol(page, "Marketing digital")).toBeVisible();
    expect((await roles(page)).rolesPropios[0].nombre).toBe("Marketing digital");
    await expect(rolDeLaPersona(page, "Laura Recepción").locator("option", { hasText: "Marketing digital" })).toHaveCount(1);
  });

  test("la pantalla con roles propios no obliga a scrollear de costado", async ({ page }) => {
    await permisos(page).getByRole("button", { name: "Nuevo rol" }).click();
    await permisos(page).getByLabel("Nombre del rol nuevo").fill("Un nombre de rol bastante largo para el celular");
    await sinScrollHorizontal(page);
    await permisos(page).getByRole("button", { name: "Crear rol" }).click();
    await sinScrollHorizontal(page);
  });
});

test.describe("Permisos del equipo — quién la ve", () => {
  for (const [rolDemo, nombre] of [["recepción", USUARIOS_DEMO.recepcionista], ["dentista", USUARIOS_DEMO.dentista], ["asistente", USUARIOS_DEMO.asistente], ["caja", USUARIOS_DEMO.caja]] as const) {
    test(`${rolDemo}: no entra a la pantalla de permisos`, async ({ page }) => {
      await entrarDemo(page, nombre);
      await page.goto("/app/configuracion");
      await expect(denegado(page)).toBeVisible();
      await expect(permisos(page)).toHaveCount(0);
    });
  }
});

test.describe("Permisos del equipo — menú", () => {
  test.skip(({ isMobile }) => isMobile, "el menú de escritorio; el cajón del celular usa la misma lista");

  test("el administrador la encuentra en Administración y lleva a la tarjeta", async ({ page }) => {
    await entrarDemo(page);
    const barra = page.getByRole("banner").getByRole("navigation");
    await barra.getByRole("button", { name: "Administración", exact: true }).click();
    await barra.getByRole("link", { name: "Permisos del equipo", exact: true }).click();
    await page.waitForURL("**/app/configuracion/permisos");
    await expect(permisos(page)).toBeInViewport();
  });
});
