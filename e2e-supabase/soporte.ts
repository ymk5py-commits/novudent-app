import { test as base, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { armarClinica, limpiar, stack, sufijo, type ClinicaArmada } from "../lib/server/stack-de-prueba";
import { cargarDB } from "../lib/backend/carga";
import { crearDatosSupabase } from "../lib/backend/supabase";

/** La demo (`cl_demo`) tiene que existir: la app la carga al abrir cualquier página sin sesión, y sin ella cae a «modo local» y el ingreso no encuentra la clínica.
 *  En producción la deja sembrada la migración; acá la siembra la primera prueba (lo mismo que hace `cargarDB`). */
export async function sembrarDemoSiFalta() {
  const s = stack();
  const admin = createClient(s.url, s.servicio, { auth: { persistSession: false, autoRefreshToken: false } });
  await cargarDB(crearDatosSupabase(admin, async () => null), "cl_demo");
}

/** Analytics y fuentes externas: fuera. (Firebase no se pide: con Supabase la app no lo usa; si lo pidiera, la prueba lo veríamos en `pedidosAFirebase`.) */
const BLOQUEADOS = ["google-analytics.com", "googletagmanager.com", "fonts.googleapis.com", "fonts.gstatic.com"];
const FIREBASE = /firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firebaseinstallations\.googleapis\.com|firebase\.googleapis\.com/;

type Fixtures = { erroresConsola: string[]; pedidosAFirebase: string[] };
type Mundo = { clinica: ClinicaArmada };

export const test = base.extend<Fixtures, { mundo: Mundo }>({
  /* Una clínica con equipo, armada con la clave de servicio, para todo el archivo. Los ids de documento NO son los uid de login (usuarios migrados). */
  mundo: [async ({}, use) => {
    await sembrarDemoSiFalta();
    const clinica = await armarClinica({
      plan: "clinica",
      personas: [
        { clave: "admin", id: "u_admin_migrado", role: "admin", name: "Ana Admin" },
        { clave: "recep", id: "u_recep_migrada", role: "receptionist", name: "Rita Recepción" },
        { clave: "dr", id: "u_dr_migrado", role: "dentist", name: "Dr. Diego Dentista" },
      ],
    });
    await use({ clinica });
    await limpiar({ clinicas: [clinica.cid], cuentas: Object.values(clinica.personas).map((p) => p.uid) });
  }, { scope: "worker" }],

  page: async ({ page }, use) => {
    // El stack local no pasa por Cloudflare: representa un cliente distinto por prueba para que sus límites no se acumulen entre casos.
    await page.context().setExtraHTTPHeaders({ "cf-connecting-ip": `2001:db8::${sufijo().slice(0, 4)}` });
    for (const d of BLOQUEADOS) await page.route(`**${d}**`, (r) => r.abort());
    await page.addInitScript(() => {
      try { localStorage.setItem("novudent.consentimiento.v1", JSON.stringify({ version: 1, analitica: false, fecha: new Date().toISOString() })); } catch { /* marco sin almacenamiento */ }
    });
    await use(page);
  },

  pedidosAFirebase: [async ({ page }, use) => {
    const pedidos: string[] = [];
    page.on("request", (r) => { if (FIREBASE.test(r.url())) pedidos.push(r.url()); });
    await use(pedidos);
    expect(pedidos, "con NEXT_PUBLIC_BACKEND=supabase la app no le pide nada a Firebase").toEqual([]);
  }, { auto: true }],

  erroresConsola: [async ({ page }, use) => {
    const errores: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_/i.test(m.text())) errores.push(m.text().slice(0, 300)); });
    page.on("pageerror", (e) => errores.push(`EXCEPCIÓN: ${String(e).slice(0, 300)}`));
    await use(errores);
    expect(errores, "errores en la consola del navegador").toEqual([]);
  }, { auto: true }],
});
export { expect };

/** Entra por la pantalla de ingreso con email y contraseña. */
export async function ingresar(page: Page, email: string, clave: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(clave);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/app");
}

/** La sesión que guarda la tienda en este navegador (`{ userId, clinicId, role, name }`). */
export const sesionGuardada = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("novudent.session.v1") || "null"));
