import { test, expect } from "./soporte";

/* Las páginas que abren los pacientes desde un link (reservar, firmar, pagar, encuestas,
   videoconsulta). Con un token inválido o sin servidor configurado, tienen que explicar qué pasa,
   nunca romperse. */
const PAGINAS = ["/reservar/cl_demo", "/firmar/cl_demo/token-invalido", "/pagar/cl_demo", "/encuestas/cl_demo/no-existe", "/videoconsulta/cl_demo/no-existe"];

for (const ruta of PAGINAS) {
  test(`${ruta} no se rompe`, async ({ page }) => {
    const r = await page.goto(ruta);
    expect(r?.status(), "la página tiene que responder").toBeLessThan(500);
    await expect(page.getByText(/Application error|Unhandled Runtime Error/i)).toHaveCount(0);
    await expect(page.locator("body")).not.toBeEmpty();
  });
}
