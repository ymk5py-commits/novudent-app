import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Las pruebas que necesitan un stack de Supabase de verdad (`*.supabase.test.ts`): `npm run test:supabase`. `npm test` no las corre.
 *  Variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET. El stack descartable lo
 *  levanta `scripts/adaptadores/stack-descartable.sh` (en el servidor, con un túnel a 127.0.0.1) y `scripts/adaptadores/correr.sh` las carga. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["**/*.supabase.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    hookTimeout: 60_000,
    testTimeout: 30_000,
    fileParallelism: false, // un solo stack compartido: un archivo a la vez
  },
});
