import type { Locator, Page } from "@playwright/test";
import { test, expect, entrarDemo, cerrarSesion, leerDB, USUARIOS_DEMO } from "./soporte";

/* Chat interno: directos de persona a persona y la difusión general del admin.
 *
 * Corre en modo local (Firebase cortado): la demo entera vive en el localStorage de
 * UN navegador, así que «otra persona» es la misma base con otra sesión. Esto prueba
 * lo que muestra la PANTALLA. Que los datos ni siquiera le lleguen a quien no
 * corresponde lo prueban las reglas (test/firestore-rules.test.mjs, MENSAJES DIRECTOS). */

type Directo = { id: string; fromId: string; toId: string; participants: string[]; text: string; difusionId?: string };

const lista = (page: Page) => page.getByRole("navigation", { name: "Conversaciones" });
const conversacionCon = (page: Page, nombre: string) => page.getByRole("region", { name: `Conversación con ${nombre}` });
const directos = async (page: Page): Promise<Directo[]> => (await leerDB(page)).directMessages;
/** El ítem de la lista cuyo título es `nombre`. Anclado al comienzo: la vista previa de
 *  otra conversación puede nombrar a la misma persona («Carlos Admin: Recordatorio…»). */
const item = (page: Page, nombre: string) =>
  lista(page).getByRole("button", { name: new RegExp(`^${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });

/** En el celular la lista y la conversación son dos pantallas: vuelve a la lista si hace falta. */
async function aLaLista(page: Page) {
  const volver = page.getByRole("button", { name: "Volver" });
  if (await volver.isVisible()) await volver.click();
}

/** Abre una conversación de la lista. */
async function abrir(page: Page, nombre: string) {
  await aLaLista(page);
  await item(page, nombre).click();
}

async function mandar(conv: Locator, texto: string) {
  await conv.getByRole("textbox").fill(texto);
  await conv.getByRole("button", { name: "Enviar" }).click();
  await expect(conv.getByRole("log")).toContainText(texto);
}

/** Otra persona entra a la MISMA demo. Cerrar sesión borra a propósito el caché del
 *  navegador (tiene datos de pacientes): se repone la base como la dejó la sesión
 *  anterior —con Firestore quedaría en el servidor— y se entra con otro usuario. */
async function entrarComo(page: Page, usuario: string) {
  const db = await leerDB(page);
  await cerrarSesion(page);
  await page.waitForURL("**/login**");
  await page.evaluate((d) => localStorage.setItem("novudent.db.v4", JSON.stringify(d)), db);
  await entrarDemo(page, usuario);
  await page.goto("/app/chat");
  await expect(lista(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await entrarDemo(page); // Carlos Admin
  await page.goto("/app/chat");
});

test("elegir a una persona y mandarle un directo", async ({ page }) => {
  await abrir(page, USUARIOS_DEMO.dentista);
  const conv = conversacionCon(page, USUARIOS_DEMO.dentista);
  await expect(conv.getByRole("textbox", { name: `Mensaje para ${USUARIOS_DEMO.dentista}` })).toBeVisible();
  const texto = `Directo de prueba ${Date.now()}`;
  await mandar(conv, texto);
  // Queda guardado como un directo del admin (u1) a la dentista (u2), sin marca de difusión.
  await expect.poll(async () => (await directos(page)).find((m) => m.text === texto))
    .toMatchObject({ fromId: "u1", toId: "u2", participants: ["u1", "u2"] });
  expect((await directos(page)).find((m) => m.text === texto)?.difusionId).toBeUndefined();
});

test("un directo lo ve la destinataria y nadie más", async ({ page }) => {
  await abrir(page, USUARIOS_DEMO.dentista);
  const texto = `Solo para Sofía ${Date.now()}`;
  await mandar(conversacionCon(page, USUARIOS_DEMO.dentista), texto);

  // Paola, otra persona de la clínica, no lo ve en ningún lado: ni en la lista ni en sus conversaciones.
  await entrarComo(page, USUARIOS_DEMO.asistente);
  await expect(page.locator("main")).not.toContainText(texto);
  for (const nombre of [USUARIOS_DEMO.admin, USUARIOS_DEMO.dentista]) {
    await abrir(page, nombre);
    const conv = conversacionCon(page, nombre);
    await expect(conv).toBeVisible();
    await expect(conv).not.toContainText(texto);
  }

  // Sofía sí: le aparece sin leer en su conversación con Carlos, y al abrirla queda leído.
  await entrarComo(page, USUARIOS_DEMO.dentista);
  const conCarlos = item(page, USUARIOS_DEMO.admin);
  await expect(conCarlos).toContainText("1 mensaje sin leer");
  await conCarlos.click();
  await expect(conversacionCon(page, USUARIOS_DEMO.admin).getByRole("log")).toContainText(texto);
  await aLaLista(page);
  await expect(conCarlos).not.toContainText("sin leer");
  await expect.poll(async () => (await directos(page)).find((m) => m.text === texto)).toHaveProperty("readAt");
});

test("la difusión del admin le llega a cada uno, marcada, sin que vea a quién más", async ({ page }) => {
  await abrir(page, "Difusión general");
  const panel = page.getByRole("region", { name: "Difusión general" });
  const texto = `Difusión de prueba ${Date.now()}`;
  await panel.getByRole("textbox", { name: "Mensaje de la difusión" }).fill(texto);
  await panel.getByRole("button", { name: "Enviar a todos" }).click();
  await expect(panel.getByRole("status")).toContainText("le llegó a 6 personas");

  // El admin sí ve a quién le llegó.
  const destinatarios = [USUARIOS_DEMO.dentista, USUARIOS_DEMO.asistente, USUARIOS_DEMO.recepcionista, USUARIOS_DEMO.caja, USUARIOS_DEMO.comercial, "Dr. Diego Martínez"];
  const enviada = panel.getByRole("listitem").filter({ hasText: texto });
  for (const nombre of destinatarios) await expect(enviada.getByRole("list", { name: "Destinatarios" })).toContainText(nombre);

  // En los datos es un fan-out: una copia por persona, cada una solo con el admin y esa persona.
  const copias = (await directos(page)).filter((m) => m.text === texto);
  expect(copias.map((c) => c.toId).sort()).toEqual(["u2", "u3", "u4", "u5", "u6", "u7"]);
  expect(new Set(copias.map((c) => c.difusionId)).size).toBe(1);
  for (const c of copias) expect(c.participants).toEqual(["u1", c.toId]);

  // Paola la recibe en su conversación con el admin, marcada como difusión…
  await entrarComo(page, USUARIOS_DEMO.asistente);
  await expect(item(page, "Difusión general")).toHaveCount(0); // ella no puede mandar una
  await abrir(page, USUARIOS_DEMO.admin);
  const conv = conversacionCon(page, USUARIOS_DEMO.admin);
  await expect(conv.getByRole("listitem").filter({ hasText: texto })).toContainText("Difusión");
  // …y nada en la conversación dice a quién más le llegó.
  for (const otro of destinatarios.filter((n) => n !== USUARIOS_DEMO.asistente)) await expect(conv).not.toContainText(otro);
  await expect(conv).not.toContainText("Le llegó a");
});
