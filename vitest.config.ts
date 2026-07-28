import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Mismo alias que tsconfig.json, para poder testear las rutas de app/api/*
  // (que importan con "@/lib/…") además de los helpers de lib/.
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // Solo los unit tests de vitest (.test.ts). El test de reglas
    // (test/firestore-rules.test.mjs) usa node:test + el emulador de Firestore
    // y se corre aparte con `npm run test:rules`. Los qa-*.mjs son Playwright.
    //
    // components/odontogram-engine/ (motor vendorizado, React-Odontogram-Modul)
    // trae su propio suite de ~800 tests que asume un harness jsdom + testing-library
    // + @vitejs/plugin-react del upstream (que pelea con vitest 4/rolldown y agota
    // memoria con ~90 archivos jsdom en un fork). No los corremos en la CI de
    // Novudent: son de terceros y su correctitud ya la cubre el CI del upstream + la
    // verificación en navegador. El límite de integración que SÍ nos importa (el
    // puente de datos collectExportPayload/importStatus) se testea en
    // lib/odontogram-bridge.test.ts. Para correr el suite del motor manualmente,
    // ver components/odontogram-engine/NOTICE.md.
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "components/odontogram-engine/**"],
  },
});
