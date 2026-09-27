import { test, expect, entrarDemo, USUARIOS_DEMO } from "./soporte";

/* Botón «Ayuda» (call center de Novum). La compilación de las pruebas no trae las
 * variables NEXT_PUBLIC_SOPORTE_* (Next.js las incrusta al compilar), así que el panel
 * tiene que decir con claridad que el canal todavía no está configurado, sin ningún
 * botón de WhatsApp o de correo que no lleve a ningún lado. Los canales configurados
 * los cubre lib/soporte.test.ts. */
test("la ayuda de Novum avisa que el canal todavía no está configurado", async ({ page, isMobile }) => {
  await entrarDemo(page, USUARIOS_DEMO.recepcionista);
  if (isMobile) {
    // En el celular el nombre no entra en la barra: la ayuda está en el menú, al lado del nombre.
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.locator("aside").getByRole("button", { name: "Ayuda" }).click();
  } else {
    await page.locator("header").getByRole("button", { name: "Ayuda" }).click();
  }
  const panel = page.getByRole("dialog", { name: "Ayuda de Novum" });
  await expect(panel).toContainText("El canal de soporte todavía no está configurado");
  await expect(panel.getByRole("link")).toHaveCount(0);
  await panel.getByRole("button", { name: "Cerrar" }).click();
  await expect(panel).toBeHidden();
});
