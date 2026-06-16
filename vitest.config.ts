import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Solo los unit tests de vitest (.test.ts). El test de reglas
    // (test/firestore-rules.test.mjs) usa node:test + el emulador de Firestore
    // y se corre aparte con `npm run test:rules`. Los qa-*.mjs son Playwright.
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
