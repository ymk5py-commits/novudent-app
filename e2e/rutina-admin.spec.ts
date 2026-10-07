import type { Locator, Page } from "@playwright/test";
import { test, expect, entrarDemo, leerDB, sinScrollHorizontal, USUARIOS_DEMO } from "./soporte";
import { tituloFecha } from "../lib/tareas";

/* «Rutina del administrador» en Inicio (pedido de Novum, 7-oct-2026): lo que el administrador revisa cada día, cada
   semana y a fin de mes, con el dato de la clínica a la vista y un casillero que tilda a mano. Se reinicia sola.

   Cada prueba arma su propio caso en el estado local de la demo (lo que la app usa con Firebase cortado), así que no
   depende del día en que corre. */

const titulo = (page: Page) => page.getByRole("heading", { name: "Rutina del administrador" });
const avance = (page: Page) => page.getByRole("progressbar", { name: "Avance de la rutina de hoy" });
const resumen = (page: Page) => page.getByRole("status").filter({ hasText: "Esta semana:" });
const dato = (page: Page, paso: string) => page.locator(`[data-rutina-dato="${paso}"]`);
const marcar = (page: Page, t: string) => page.getByRole("button", { name: `Marcar como hecho: ${t}` });
const desmarcar = (page: Page, t: string) => page.getByRole("button", { name: `Desmarcar: ${t}` });

const hoyDe = (page: Page) => page.evaluate(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});

/** Cambia el estado local de la demo y recarga. */
async function conDemo<A = null>(page: Page, cambiar: (db: any, hoy: string, arg: A) => void, arg?: A) {
  await page.evaluate(`(() => {
    const db = JSON.parse(localStorage.getItem("novudent.db.v4"));
    const d = new Date();
    const hoy = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    (${cambiar.toString()})(db, hoy, ${JSON.stringify(arg ?? null)});
    localStorage.setItem("novudent.db.v4", JSON.stringify(db));
  })()`);
  await page.reload();
  await expect(titulo(page)).toBeVisible();
}

/** Hace clic y espera su efecto, y si no pasó nada vuelve a intentar: justo al entrar la página todavía se mueve
 *  (la tarjeta sube con su animación) y el clic puede caer en el hueco de al lado. */
async function clicHasta(boton: Locator, efecto: Locator) {
  await expect(async () => {
    await boton.click({ timeout: 4_000 });
    await expect(efecto).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
}

const hechasYFaltan = async (page: Page): Promise<[number, number]> => {
  const m = (await resumen(page).innerText()).match(/(\d+) hechas?\D+(\d+) faltan?/);
  if (!m) throw new Error("no encuentro «Esta semana: N hechas · M faltan»");
  return [Number(m[1]), Number(m[2])];
};

test.describe("Rutina del administrador", () => {
  test("el administrador la ve, con los pasos de todos los días y el de la semana", async ({ page }) => {
    await entrarDemo(page);
    await expect(titulo(page)).toBeVisible();
    const todos = page.getByRole("region", { name: "Todos los días" });
    for (const t of ["Controlar cómo cerró la caja", "Revisar lo cobrado del día", "Seguir a los pacientes que deben", "Seguir a los que deben implantes", "Mirar los reclamos en retención", "Controlar los cheques"]) {
      await expect(todos.getByRole("link", { name: t, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("region", { name: "De la semana" }).getByRole("link", { name: "Revisar el desempeño de la semana" })).toBeVisible();
    await expect(avance(page)).toHaveAttribute("aria-valuenow", "0");
  });

  for (const [rol, usuario] of Object.entries({ dentista: USUARIOS_DEMO.dentista, asistente: USUARIOS_DEMO.asistente, recepcionista: USUARIOS_DEMO.recepcionista, caja: USUARIOS_DEMO.caja })) {
    test(`no la ve ${rol}: es del administrador`, async ({ page }) => {
      await entrarDemo(page, usuario);
      await expect(page.getByRole("heading", { name: "Mi agenda" })).toBeVisible();
      await expect(titulo(page)).toHaveCount(0);
    });
  }

  test("tildar un paso lo guarda y lo cuenta; destildarlo lo borra", async ({ page }) => {
    await entrarDemo(page);
    const hoy = await hoyDe(page);
    const [h0, f0] = await hechasYFaltan(page);

    await clicHasta(marcar(page, "Revisar lo cobrado del día"), desmarcar(page, "Revisar lo cobrado del día"));
    await expect(desmarcar(page, "Revisar lo cobrado del día")).toHaveAttribute("aria-pressed", "true");
    await expect(avance(page)).toHaveAttribute("aria-valuenow", "1");
    expect(await hechasYFaltan(page)).toEqual([h0 + 1, f0 - 1]);
    const guardado = (await leerDB(page)).routineChecks;
    expect(guardado).toEqual([expect.objectContaining({ id: `cobrado__${hoy}`, paso: "cobrado", periodo: hoy, hechoPor: "u1", hechoPorNombre: "Carlos Admin" })]);
    await expect(page.getByText(/Lo controló Carlos Admin a las \d\d:\d\d/)).toBeVisible();

    // Sobrevive a recargar.
    await page.reload();
    await expect(desmarcar(page, "Revisar lo cobrado del día")).toBeVisible();
    expect(await hechasYFaltan(page)).toEqual([h0 + 1, f0 - 1]);

    await clicHasta(desmarcar(page, "Revisar lo cobrado del día"), marcar(page, "Revisar lo cobrado del día"));
    expect((await leerDB(page)).routineChecks).toEqual([]);
    expect(await hechasYFaltan(page)).toEqual([h0, f0]);
  });

  test("lo tildado ayer no cuenta hoy: cada día se reinicia", async ({ page }) => {
    await entrarDemo(page);
    await conDemo(page, (db, hoy) => {
      const d = new Date(`${hoy}T12:00:00`); d.setDate(d.getDate() - 1);
      const ayer = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      db.routineChecks = [{ id: `caja__${ayer}`, paso: "caja", periodo: ayer, hechoPor: "u1", hechoPorNombre: "Carlos Admin", hechoEn: d.toISOString() }];
    });
    await expect(marcar(page, "Controlar cómo cerró la caja")).toBeVisible();
    await expect(avance(page)).toHaveAttribute("aria-valuenow", "0");
  });

  test("cada paso muestra el dato de la clínica", async ({ page }) => {
    await entrarDemo(page);
    await conDemo(page, (db, hoy) => {
      const ahora = new Date().toISOString();
      db.cashSessions = [{ id: "e2e_cs", clinicId: "cl_demo", userId: "u3", userName: "Marta Caja", openedAt: ahora, openingBalance: 100000, status: "abierta" }];
      db.billing = [{ id: "e2e_b1", clinicId: "cl_demo", patientId: "p1", flags: ["HOLD"] }, { id: "e2e_b2", clinicId: "cl_demo", patientId: "p2", flags: ["MGRHOLD"] }];
      db.payments = [
        { id: "e2e_pay1", clinicId: "cl_demo", patientId: "p1", date: ahora, amount: 250000, method: "efectivo", concept: "Control", receivedBy: "u3" },
        { id: "e2e_pay2", clinicId: "cl_demo", patientId: "p2", date: ahora, amount: 400000, method: "cheque", concept: "Cuota", receivedBy: "u3", check: { number: "1", bank: "Itaú", cashDate: hoy } },
      ];
      db.expenses = [];
    });
    await expect(dato(page, "caja")).toContainText(/Abierta por Marta Caja desde las \d\d:\d\d/);
    await expect(dato(page, "cobrado")).toContainText(/650\.000.* en 2 pagos/);
    await expect(dato(page, "retenciones")).toContainText("2 reclamos en retención");
    await expect(dato(page, "cheques")).toContainText(/1 cheque listo para cobrar \(.*400\.000.*\)/);
  });

  test("«Ver la semana» muestra qué se hizo cada día y deja tildar lo de hoy", async ({ page }) => {
    await entrarDemo(page);
    const hoy = await hoyDe(page);
    await page.getByRole("button", { name: "Ver la semana" }).click();
    const semana = page.getByRole("region", { name: "La semana de la rutina" });
    await expect(semana).toBeVisible();
    await expect(semana.getByRole("row")).toHaveCount(1 + 6); // encabezado + los seis pasos de todos los días

    const celdaDeHoy = semana.getByRole("button", { name: `Marcar como hecho: Controlar cómo cerró la caja, ${tituloFecha(hoy, hoy)}` });
    const [h0, f0] = await hechasYFaltan(page);
    await clicHasta(celdaDeHoy, semana.getByRole("button", { name: `Desmarcar: Controlar cómo cerró la caja, ${tituloFecha(hoy, hoy)}` }));
    expect(await hechasYFaltan(page)).toEqual([h0 + 1, f0 - 1]);
    // El mismo casillero, visto en la lista de hoy.
    await expect(desmarcar(page, "Controlar cómo cerró la caja").first()).toHaveAttribute("aria-pressed", "true");
    expect((await leerDB(page)).routineChecks.map((c: any) => c.id)).toEqual([`caja__${hoy}`]);
  });

  test("«Puesta en marcha»: lo que ya está cargado se marca solo y la rutina avisa lo que falta", async ({ page }) => {
    await entrarDemo(page);
    // La demo ya tiene equipo y prestaciones cargados: con los pasos sin tildar, solo falta el recorrido.
    await conDemo(page, (db) => { db.onboarding = { usersCreated: false, servicesDefined: false, tourDone: false }; });
    await expect(page.getByRole("link", { name: /Puesta en marcha: falta 1 paso/ })).toBeVisible();
    const tarjeta = page.locator("#puesta-en-marcha");
    await expect(tarjeta).toContainText("1 paso(s) pendiente(s)");
    await expect(tarjeta.getByText("se marcó solo")).toHaveCount(2);
    await expect(tarjeta.getByRole("button", { name: "Hecho: ya está cargado" })).toHaveCount(2);

    // Una clínica recién creada: un solo usuario y sin prestaciones. Falta todo.
    await conDemo(page, (db) => { db.onboarding = { usersCreated: false, servicesDefined: false, tourDone: false }; db.users = db.users.slice(0, 1); db.procedures = []; });
    await expect(page.getByRole("link", { name: /Puesta en marcha: faltan 3 pasos/ })).toBeVisible();
    await expect(page.locator("#puesta-en-marcha").getByText("se marcó solo")).toHaveCount(0);

    // Lo marcado a mano sigue valiendo.
    await clicHasta(page.locator("#puesta-en-marcha").getByRole("button", { name: "Marcar hecho" }).first(), page.getByRole("link", { name: /Puesta en marcha: faltan 2 pasos/ }));
  });

  test("a fin de mes se suman liquidar y cargar los gastos", async ({ page }) => {
    await entrarDemo(page);
    // El navegador de la prueba corre en el día real: se adelanta el reloj al 28 con el reloj de Playwright.
    await page.clock.install({ time: new Date("2026-10-28T12:00:00-03:00") });
    await page.reload();
    await expect(titulo(page)).toBeVisible();
    const mes = page.getByRole("region", { name: "Fin de mes" });
    await expect(mes.getByRole("link", { name: "Liquidar a los profesionales" })).toBeVisible();
    await expect(mes.getByRole("link", { name: "Cargar los gastos del mes" })).toBeVisible();
    await clicHasta(marcar(page, "Cargar los gastos del mes"), desmarcar(page, "Cargar los gastos del mes"));
    expect((await leerDB(page)).routineChecks.map((c: any) => c.id)).toEqual(["gastos__2026-10"]);
  });

  test("no obliga a scrollear de costado, ni con la semana abierta", async ({ page }) => {
    await entrarDemo(page);
    await page.getByRole("button", { name: "Ver la semana" }).click();
    await expect(page.getByRole("region", { name: "La semana de la rutina" })).toBeVisible();
    await sinScrollHorizontal(page);
  });
});
