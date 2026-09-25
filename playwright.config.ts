import { defineConfig, devices } from "@playwright/test";

/**
 * E2E de Novudent contra la app COMPILADA (`next build` + `next start`), igual que en producción.
 *
 * Modo local: cada prueba corta la red hacia Firebase (e2e/soporte.ts), así la app trabaja con
 * su fallback de localStorage y la demo sembrada. Es determinista, no necesita credenciales y
 * nunca toca la base de producción ni su cuota.
 *
 *   npm run build && npm run test:e2e            # todo, escritorio + celular
 *   npx playwright test --project=escritorio      # uno solo
 *   npx playwright test --grep @visual            # solo las capturas
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-PY",
    timezoneId: "America/Asuncion",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "celular", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
