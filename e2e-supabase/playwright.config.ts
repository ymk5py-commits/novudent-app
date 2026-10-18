import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * E2E de Novudent con NEXT_PUBLIC_BACKEND=supabase contra un stack de Supabase DESCARTABLE (ver scripts/adaptadores/stack-descartable.sh).
 * A diferencia de `e2e/` (modo local, sin base), acá el navegador habla de verdad con GoTrue, PostgREST y Realtime, y las rutas `/api` con la clave de
 * servicio. Se corre con `npm run test:e2e:supabase`, que arma el build con las variables del stack (las `NEXT_PUBLIC_*` se hornean al compilar).
 */
const PORT = Number(process.env.E2E_SUPABASE_PORT ?? 3110);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // un solo stack compartido
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-PY",
    timezoneId: "America/Asuncion",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    cwd: path.resolve(__dirname, ".."),
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ...process.env as Record<string, string>, NEXT_PUBLIC_BACKEND: "supabase" },
  },
});
