import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Las pruebas que necesitan el emulador de Firestore (`*.emulador.test.ts`): `npm run test:backend`. `npm test` no las corre. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["**/*.emulador.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    hookTimeout: 60_000,
    testTimeout: 30_000,
    fileParallelism: false, // un solo emulador: un archivo a la vez
  },
});
