import { test, expect, entrarDemo, sinScrollHorizontal } from "./soporte";

/** Todas las pantallas de la app, con lo mínimo que tiene que aparecer en cada una. */
const PANTALLAS: [string, RegExp | null][] = [
  ["/app", /Hola, Carlos/], ["/app/agenda", /Agenda/], ["/app/pacientes", /Pacientes/], ["/app/pacientes/p1", /María González/],
  ["/app/presupuestos", /Presupuestos/], ["/app/caja", /Cajas/], ["/app/facturacion", /Facturación/], ["/app/inventario", /Inventario/],
  ["/app/reportes", /Informes de gestión/], ["/app/integraciones", /Botika/], ["/app/suscripcion", /Plan Clínica/],
  ["/app/configuracion", /Usuarios del equipo/], ["/app/gastos", null], ["/app/liquidaciones", null], ["/app/laboratorios", null],
  ["/app/tareas", null], ["/app/crm", null], ["/app/encuestas", null], ["/app/esterilizacion", null], ["/app/ambiental", null],
  ["/app/box", null], ["/app/chat", null], ["/app/videos", null],
];

test.describe("Pantallas de la app (demo, administrador)", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page); });

  for (const [ruta, texto] of PANTALLAS) {
    test(`${ruta} carga sin errores`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page).toHaveURL(new RegExp(`${ruta}$`));
      await expect(page.getByText(/Application error|Unhandled Runtime Error|Algo salió mal/i)).toHaveCount(0);
      await expect(page.locator("h1").first()).toBeVisible();
      if (texto) await expect(page.locator("main").getByText(texto).first()).toBeVisible(); // el menú lateral repite los nombres
      await sinScrollHorizontal(page); // en el celular también
    });
  }
});
