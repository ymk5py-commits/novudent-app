import type { Locator } from "@playwright/test";
import { test, expect, entrarDemo } from "./soporte";

/* Pedido de Camila (8-oct-2026): «también este interruptor está mal». En Configuración › Negociación de presupuestos la bolita
   del interruptor «Botika» tenía `position: absolute` sin `left`: el navegador la centraba dentro del botón y, encendido, se salía
   de la pista por la derecha (apagado quedaba a medio camino en vez de a la izquierda). */

const caja = async (l: Locator) => {
  const b = await l.boundingBox();
  if (!b) throw new Error("el elemento no tiene caja en pantalla");
  return b;
};

/** Cuánto sobra a cada lado de la bolita dentro de la pista (negativo = se sale). Se mide después de la animación. */
async function holguras(interruptor: Locator) {
  const pista = await caja(interruptor);
  const bolita = await caja(interruptor.locator("span").first());
  return {
    izquierda: bolita.x - pista.x,
    derecha: pista.x + pista.width - (bolita.x + bolita.width),
    arriba: bolita.y - pista.y,
    abajo: pista.y + pista.height - (bolita.y + bolita.height),
  };
}

test("el interruptor de «Negociación de presupuestos» lleva la bolita dentro de la pista: a la izquierda apagado, a la derecha encendido", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/configuracion");
  const tarjeta = page.getByRole("heading", { name: "Negociación de presupuestos", level: 2 }).locator("xpath=ancestor::*[contains(@class,'p-5')][1]");
  const interruptor = tarjeta.getByRole("switch");
  await expect(interruptor).toBeVisible();

  // Se prueban los dos estados, venga como venga la demo: se mira cómo está y se da vuelta.
  for (let i = 0; i < 2; i++) {
    const encendido = (await interruptor.getAttribute("aria-checked")) === "true";
    await expect.poll(async () => {
      const h = await holguras(interruptor);
      // Dentro de la pista por los cuatro lados (medio píxel de tolerancia por el redondeo)…
      if (Math.min(h.izquierda, h.derecha, h.arriba, h.abajo) < -0.5) return `se sale de la pista: ${JSON.stringify(h)}`;
      // …y pegada al lado que corresponde (menos de 5 px del borde), no flotando en el medio.
      const pegada = encendido ? h.derecha : h.izquierda;
      return pegada <= 5 ? "ok" : `${encendido ? "encendido" : "apagado"} y no está pegada a su lado: ${JSON.stringify(h)}`;
    }, { message: `bolita con el interruptor ${encendido ? "encendido" : "apagado"}` }).toBe("ok");
    await interruptor.click();
    await expect(interruptor).toHaveAttribute("aria-checked", encendido ? "false" : "true");
  }
});
