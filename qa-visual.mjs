/**
 * QA visual de novudent-app: recorre todas las páginas en desktop y
 * mobile, saca screenshots y reporta overflow horizontal (con los
 * elementos culpables), errores de consola y fallos de carga.
 *
 * Uso: npm run dev (puerto 3100) y en otra terminal `node qa-visual.mjs`.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3100";
const OUT = "/tmp/novudent-qa";
mkdirSync(OUT, { recursive: true });

const SESSION = JSON.stringify({
  userId: "u1",
  clinicId: "cl_demo",
  role: "admin",
  name: "Carlos Admin",
});

const PAGES = [
  ["dashboard", "/app"],
  ["agenda", "/app/agenda"],
  ["pacientes", "/app/pacientes"],
  ["paciente-ficha", "/app/pacientes/p1"],
  ["presupuestos", "/app/presupuestos"],
  ["caja", "/app/caja"],
  ["facturacion", "/app/facturacion"],
  ["inventario", "/app/inventario"],
  ["reportes", "/app/reportes"],
  ["integraciones", "/app/integraciones"],
  ["suscripcion", "/app/suscripcion"],
  ["configuracion", "/app/configuracion"],
  ["reservar-publica", "/reservar/cl_demo"],
  ["login", "/login"],
  ["superadmin", "/superadmin"],
];

const VIEWPORTS = [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
];

const browser = await chromium.launch();
const report = [];

for (const [vpName, viewport] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 140));
  });

  await page.addInitScript(
    ([k, v]) => localStorage.setItem(k, v),
    ["novudent.session.v1", SESSION]
  );

  for (const [name, path] of PAGES) {
    consoleErrors.length = 0;
    try {
      await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2500);
      const metrics = await page.evaluate(() => {
        const w = window.innerWidth;
        const offenders = [];
        if (document.scrollingElement.scrollWidth > w + 2) {
          for (const el of document.querySelectorAll("body *")) {
            const r = el.getBoundingClientRect();
            if (r.width > w + 4 && offenders.length < 4) {
              const raw = el.className;
              const cls = String(raw && raw.baseVal !== undefined ? raw.baseVal : raw).slice(0, 70);
              offenders.push(el.tagName.toLowerCase() + "." + cls + " (" + Math.round(r.width) + "px)");
            }
          }
        }
        return {
          scrollW: document.scrollingElement.scrollWidth,
          innerW: w,
          offenders,
        };
      });
      const overflowX = metrics.scrollW > metrics.innerW + 2;
      await page.screenshot({ path: `${OUT}/${vpName}-${name}.png`, fullPage: false });
      report.push({
        page: name,
        vp: vpName,
        overflowX,
        scroll: overflowX ? `${metrics.scrollW}>${metrics.innerW}` : "",
        offenders: metrics.offenders,
        errors: [...new Set(consoleErrors)].slice(0, 2),
      });
    } catch (e) {
      report.push({ page: name, vp: vpName, FAILED: String(e).slice(0, 110) });
    }
  }
  await ctx.close();
}
await browser.close();

for (const r of report) {
  const flag = r.FAILED ? "💥" : r.overflowX ? "↔️ OVERFLOW" : r.errors?.length ? "⚠️" : "✅";
  let line = `${flag} [${r.vp}] ${r.page}`;
  if (r.scroll) line += ` (${r.scroll})`;
  if (r.FAILED) line += ` FAIL: ${r.FAILED}`;
  if (r.errors?.length) line += ` errores: ${r.errors.join(" | ")}`;
  console.log(line);
  if (r.offenders?.length) console.log(`    culpables: ${r.offenders.join("  ||  ")}`);
}
console.log(`\nScreenshots en ${OUT}/`);
