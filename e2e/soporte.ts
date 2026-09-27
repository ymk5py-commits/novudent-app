import { test as base, expect, type Page } from "@playwright/test";

/** Firebase, Analytics y afines: se cortan en TODAS las pruebas para que la app use su fallback
 *  local (localStorage + demo sembrada). Ninguna prueba escribe en la base real ni gasta cuota. */
const BLOQUEADOS = [
  "firestore.googleapis.com", "identitytoolkit.googleapis.com", "securetoken.googleapis.com",
  "firebaseinstallations.googleapis.com", "firebase.googleapis.com", "google-analytics.com", "googletagmanager.com",
];

/** Ruido esperable por cortar Firebase a propósito: no son errores de la app. */
const RUIDO = /Failed to load resource|net::ERR_FAILED|installations|analytics|auth\/network-request-failed|Auth anónima|Failed to fetch|Could not reach Cloud Firestore|code=unavailable|firestore/i;

type Soporte = { erroresConsola: string[]; consentimiento: "rechazado" | "aceptado" | "sin-decidir" };

export const test = base.extend<Soporte>({
  /* Por defecto la persona ya eligió (rechazó la analítica): el aviso de cookies no tapa nada.
     Las pruebas del aviso usan `test.use({ consentimiento: "sin-decidir" })`. */
  consentimiento: ["rechazado", { option: true }],
  page: async ({ page, consentimiento }, use) => {
    for (const d of BLOQUEADOS) await page.route(`**${d}**`, (r) => r.abort());
    if (consentimiento !== "sin-decidir") {
      await page.addInitScript((analitica) => {
        localStorage.setItem("novudent.consentimiento.v1", JSON.stringify({ version: 1, analitica, fecha: new Date().toISOString() }));
      }, consentimiento === "aceptado");
    }
    await use(page);
  },
  /* Automático: toda prueba falla si la página tiró una excepción o un console.error real. */
  erroresConsola: [
    async ({ page }, use) => {
      const errores: string[] = [];
      page.on("console", (m) => { if (m.type() === "error" && !RUIDO.test(m.text())) errores.push(m.text().slice(0, 300)); });
      page.on("pageerror", (e) => errores.push(`EXCEPCIÓN: ${String(e).slice(0, 300)}`));
      await use(errores);
      expect(errores, "errores en la consola del navegador").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export const USUARIOS_DEMO = {
  admin: "Carlos Admin",
  dentista: "Dra. Sofía Benítez",
  asistente: "Paola Asistente",
  recepcionista: "Laura Recepción",
  caja: "Marta Caja",
} as const;

/** Entra a la demo como un usuario. `/login?demo=1` es la puerta que dejaron para ventas. */
export async function entrarDemo(page: Page, usuario: string = USUARIOS_DEMO.admin) {
  await page.goto("/login?demo=1");
  await page.getByRole("button", { name: "Ver demo" }).click();
  await page.getByRole("button", { name: new RegExp(usuario) }).click();
  await page.waitForURL("**/app");
}

/** Cierra la sesión. En el celular el botón vive en el menú lateral. */
export async function cerrarSesion(page: Page) {
  const abrir = page.getByRole("button", { name: "Abrir menú" });
  if (await abrir.isVisible()) await abrir.click();
  await page.getByRole("button", { name: "Cerrar sesión" }).filter({ visible: true }).first().click();
}

/** Ninguna página tiene que obligar a scrollear de costado (sobre todo en el celular). */
export async function sinScrollHorizontal(page: Page) {
  const { doc, vista } = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vista: innerWidth }));
  expect(doc, `el documento mide ${doc}px y la ventana ${vista}px`).toBeLessThanOrEqual(vista);
}

/** El estado local de la demo (lo que la app guarda cuando Firebase no responde). */
export const leerDB = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("novudent.db.v4") || "null"));
