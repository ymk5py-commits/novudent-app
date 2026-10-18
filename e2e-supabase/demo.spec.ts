import { test, expect, sembrarDemoSiFalta } from "./soporte";
import { escribirDoc, rest, stack } from "../lib/server/stack-de-prueba";

/* La demo pública: sin cuenta, con la sesión ANÓNIMA de GoTrue (rol authenticated sin ficha en ninguna clínica). Se lee y se escribe `cl_demo`, y nada más. */

test.beforeAll(async () => { await sembrarDemoSiFalta(); });

test("«Ver demo» entra con una sesión anónima, muestra los usuarios de ejemplo y deja escribir en cl_demo", async ({ page }) => {
  await page.goto("/login?demo=1");
  await page.getByRole("button", { name: "Ver demo" }).click();
  await page.getByRole("button", { name: /Carlos Admin/ }).click();
  await page.waitForURL("**/app");

  // La sesión de GoTrue es anónima (el `is_anonymous` del token): ninguna cuenta real.
  const claims = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /novudent-auth/.test(x));
    const token = k ? JSON.parse(localStorage.getItem(k)!).access_token : null;
    return token ? JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) : null;
  });
  expect(claims).toMatchObject({ role: "authenticated", is_anonymous: true });

  // Escribe en la demo (alta de un paciente) y queda en cl_demo.
  const ci = String(7_000_000 + Math.floor(Math.random() * 999_999));
  await page.goto("/app/pacientes/nuevo");
  const m = page.locator("main");
  await m.getByLabel("Nombre legal *").fill("Visitante");
  await m.getByLabel("Apellidos *").fill("De Demo");
  await m.getByLabel("Cédula / DNI *").fill(ci);
  await m.getByLabel("Fecha de nacimiento *").fill("1990-05-05");
  await m.getByLabel("Sexo *").selectOption("F");
  await m.getByLabel("Género *").selectOption("F");
  await m.getByLabel("Teléfono móvil *").fill("+595 981 111 111");
  await m.getByLabel("Email *").fill("visitante@correo.com");
  await m.getByRole("button", { name: "Crear paciente" }).click();
  await page.waitForURL(/\/app\/pacientes\/p_/);
  await expect.poll(async () => (await rest("patients", "GET", { select: "id", clinic_id: "eq.cl_demo", "data->>document": `eq.${ci}` })).length).toBe(1);
  await rest("patients", "DELETE", { clinic_id: "eq.cl_demo", "data->>document": `eq.${ci}` });
});

test("la sesión anónima de la demo no lee ni un dato de una clínica real (RLS)", async ({ page, mundo }) => {
  await escribirDoc("patients", "p_secreto", { id: "p_secreto", firstName: "Dato", lastName: "Sensible", document: "999", phone: "0981 999 999" }, mundo.clinica.cid);
  await page.goto("/login?demo=1");
  await page.getByRole("button", { name: "Ver demo" }).click();
  await page.getByRole("button", { name: /Carlos Admin/ }).click();
  await page.waitForURL("**/app");
  // Quien está en la demo no recibe datos de otra clínica aunque pida su id.
  const respuesta = await page.evaluate(async ({ url, anon, cid }) => {
    const k = Object.keys(localStorage).find((x) => /novudent-auth/.test(x))!;
    const token = JSON.parse(localStorage.getItem(k)!).access_token;
    const r = await fetch(`${url}/rest/v1/patients?select=id&clinic_id=eq.${cid}`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    return { status: r.status, filas: await r.json() };
  }, { url: stack().url, anon: stack().anon, cid: mundo.clinica.cid });
  expect(respuesta.filas).toEqual([]);
  // …ni escribirle: un alta con su sesión en la clínica ajena se rechaza.
  const escritura = await page.evaluate(async ({ url, anon, cid }) => {
    const k = Object.keys(localStorage).find((x) => /novudent-auth/.test(x))!;
    const token = JSON.parse(localStorage.getItem(k)!).access_token;
    const r = await fetch(`${url}/rest/v1/rpc/guardar`, { method: "POST", headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ tabla: "patients", clinic_id: cid, id: "p_intruso", data: { id: "p_intruso" } }) });
    return r.status;
  }, { url: stack().url, anon: stack().anon, cid: mundo.clinica.cid });
  expect(escritura).toBeGreaterThanOrEqual(400);
  expect(await rest("patients", "GET", { select: "id", id: "eq.p_intruso" })).toEqual([]);
});
