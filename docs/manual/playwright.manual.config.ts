import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

/**
 * Configuración de las corridas del manual (capturas y PDF). Igual que el E2E: contra la app COMPILADA, con Firebase cortado y la
 * demo sembrada, para que las capturas sean repetibles y no toquen la demo del equipo.
 *
 *   npm run build && npm run manual:capturas && npm run manual:pdf
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.manual\.ts$/,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: Number(process.env.MANUAL_WORKERS ?? 4),
  reporter: [["list"]],
  // Una carpeta por parte: varias personas pueden correr capturas a la vez sin borrarse las pruebas fallidas entre sí.
  outputDir: resolve(__dirname, "salida/.resultados", (process.env.MANUAL_SOLO ?? "todo").replace(/[^a-z0-9-]+/gi, "_")),
  use: { baseURL: `http://localhost:${PORT}`, locale: "es-PY", timezoneId: "America/Asuncion" },
  projects: [{ name: "manual", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1.5 } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    cwd: resolve(__dirname, "../.."),
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
