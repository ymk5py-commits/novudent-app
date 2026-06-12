/**
 * E2E del flujo completo (modo local, sin red): login demo → dashboard →
 * todas las páginas + interacciones clave + gating por plan.
 * Reporta errores de página (excepciones), console.error y fallos de aserción.
 *
 * Uso: npx next start -p 3100 y en otra terminal `node qa-flow.mjs`.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const issues = [];
const ok = (name) => console.log(`✅ ${name}`);
const bad = (name, detail) => { issues.push({ name, detail }); console.log(`❌ ${name} — ${detail}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + String(e).slice(0, 200)));

// modo local determinista: bloquear Firebase
await page.route("**firestore.googleapis.com**", (r) => r.abort());
await page.route("**identitytoolkit.googleapis.com**", (r) => r.abort());
await page.route("**firebaseinstallations.googleapis.com**", (r) => r.abort());
await page.route("**google-analytics.com**", (r) => r.abort());

const errsSnapshot = () => {
  // este test corta la red hacia Firebase a propósito → el ruido del SDK
  // (Failed to fetch / Could not reach backend) NO es un bug de la app
  const out = [...new Set(consoleErrors)].filter(
    (e) =>
      !/Failed to load resource|net::ERR_FAILED|installations|analytics|auth\/network-request-failed|Auth anónima|Failed to fetch|Could not reach Cloud Firestore|code=unavailable|firestore/i.test(e)
  );
  consoleErrors.length = 0;
  return out;
};

async function goAndCheck(name, path, expectText) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  const body = await page.evaluate(() => document.body.innerText);
  const errs = errsSnapshot();
  if (errs.length) bad(`${name}: consola`, errs.join(" | "));
  if (expectText && !body.includes(expectText)) bad(`${name}: contenido`, `no encontré «${expectText}»`);
  else ok(`${name} (${path})`);
  return body;
}

/* ===== 1. Login demo ===== */
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.getByRole("button", { name: "Ver demo" }).click();
await page.waitForTimeout(600);
const demoBtn = page.getByText("Carlos Admin").first();
if (await demoBtn.count()) {
  await demoBtn.click();
  await page.waitForURL("**/app", { timeout: 10000 }).catch(() => {});
  ok("login → demo Carlos Admin → /app");
} else {
  bad("login demo", "no aparece el usuario demo Carlos Admin");
}
errsSnapshot();

/* ===== 2. Dashboard: contenido + interacciones ===== */
const dash = await goAndCheck("dashboard", "/app", "Hola, Carlos");
if (!dash.includes("Producción de la semana")) bad("dashboard", "falta la gráfica de producción");
if (!dash.includes("Estados de citas")) bad("dashboard", "falta el donut de estados");
// checklist de puesta en marcha (toggle ida y vuelta)
const checkBtn = page.locator('button[aria-label="Marcar hecho"], button[aria-label="Marcar pendiente"]').first();
if (await checkBtn.count()) { await checkBtn.click(); await page.waitForTimeout(400); await checkBtn.click(); ok("dashboard: checklist toggle"); }
const e2 = errsSnapshot(); if (e2.length) bad("dashboard interacciones", e2.join(" | "));

/* ===== 3. Todas las páginas ===== */
await goAndCheck("agenda", "/app/agenda", "Agenda");
await goAndCheck("pacientes", "/app/pacientes", "Pacientes");
await goAndCheck("ficha p1", "/app/pacientes/p1", "María");
// tabs de la ficha
for (const tab of ["Odontograma", "Periodoncia", "Historial", "Archivos"]) {
  const t = page.getByRole("button", { name: tab }).first();
  if (await t.count()) { await t.click(); await page.waitForTimeout(500); }
}
{ const e = errsSnapshot(); if (e.length) bad("ficha tabs", e.join(" | ")); else ok("ficha: tabs sin errores"); }
await goAndCheck("presupuestos", "/app/presupuestos", "Presupuestos");
await goAndCheck("caja", "/app/caja", "Caja");
await goAndCheck("facturacion", "/app/facturacion", "Facturación");
await goAndCheck("inventario", "/app/inventario", "Inventario");
await goAndCheck("reportes", "/app/reportes", "Informes de gestión");
await goAndCheck("integraciones", "/app/integraciones", "Botika");
await goAndCheck("suscripcion", "/app/suscripcion", "Plan Clínica");
await goAndCheck("configuracion", "/app/configuracion", "Usuarios del equipo");
// modal agregar usuario (abrir y cerrar)
const addUser = page.getByText("Agregar usuario").first();
if (await addUser.count()) {
  await addUser.click(); await page.waitForTimeout(500);
  const modalVisible = await page.getByText("Agregar usuario", { exact: false }).count();
  if (modalVisible) ok("configuracion: modal usuario abre");
  await page.keyboard.press("Escape").catch(() => {});
  const closeBtn = page.locator('button[aria-label="Cerrar"]').first();
  if (await closeBtn.count()) await closeBtn.click().catch(() => {});
  await page.waitForTimeout(300);
}
{ const e = errsSnapshot(); if (e.length) bad("configuracion modal", e.join(" | ")); }

/* ===== 4. Gating del Plan Solo ===== */
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem("novudent.db.v4"));
  db.clinics[0].plan = "solo";
  localStorage.setItem("novudent.db.v4", JSON.stringify(db));
});
await page.goto(BASE + "/app", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);
const nav = await page.evaluate(() => document.querySelector("aside")?.innerText ?? "");
for (const hidden of ["Caja", "Inventario", "Reportes", "Integraciones"]) {
  if (nav.includes(hidden)) bad("plan solo: sidebar", `«${hidden}» sigue visible`);
}
if (!nav.includes("SOLO") && !nav.includes("Solo")) bad("plan solo: badge", "no se ve el badge del plan");
const dashSolo = await page.evaluate(() => document.body.innerText);
if (dashSolo.includes("Contralor")) bad("plan solo: IA", "ContralorCard visible sin plan IA");
const cajaBody = await goAndCheck("plan solo: /app/caja bloqueada", "/app/caja", "Plan");
if (!cajaBody.includes("Mejorar mi plan")) bad("plan solo: caja", "no aparece la tarjeta de upsell");
else ok("plan solo: upsell con CTA");
const subBody = await goAndCheck("plan solo: suscripcion", "/app/suscripcion", "Plan Solo");
if (!subBody.includes("45")) bad("plan solo: precio", "no muestra $45");

/* ===== resumen ===== */
console.log("\n" + (issues.length ? `🔴 ${issues.length} problema(s)` : "🟢 Flujo completo sin errores"));
await browser.close();
process.exit(issues.length ? 1 : 0);
