/**
 * Pruebas del esquema que NO necesitan Postgres (corren con `npx vitest run`):
 *  - supabase/migrations es exactamente lo que genera scripts/supabase/generar-esquema.mjs;
 *  - los roles de fábrica escritos en las funciones de permisos (`tienePermiso(cid, 'permiso', array[roles])`) son los de la matriz de
 *    lib/rbac.ts, igual que hoy lo ata `lib/permisosEquipo.test.ts` con firestore.rules.
 * Las pruebas contra un Postgres real están en test/rls/*.test.mjs (scripts/supabase/probar-rls.sh).
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROLES, permisoDeFabrica, type Permission } from "@/lib/rbac";
import { PERMISOS_QUE_EXIGE_EL_SERVIDOR } from "@/lib/permisosEquipo";

const raiz = new URL("../../", import.meta.url);
const carpeta = new URL("supabase/migrations/", raiz);
const migraciones = readdirSync(carpeta).filter((f) => f.endsWith(".sql")).sort();
const leer = (f: string) => readFileSync(new URL(f, carpeta), "utf8");

describe("las migraciones están al día", () => {
  it("coinciden con lo que genera el generador a partir de lib/backend/colecciones.json", () => {
    // sale con 1 (y execFileSync lanza) si hay un archivo que falta, que sobra o que difiere
    const salida = execFileSync("node", ["scripts/supabase/generar-esquema.mjs", "--verificar"], { cwd: new URL(".", raiz).pathname, encoding: "utf8" });
    expect(salida).toContain("Migraciones al día");
  });

  it("se aplican en orden alfabético: tablas, funciones de datos, funciones de permisos…", () => {
    expect(migraciones[0]).toMatch(/_tablas\.sql$/);
    expect(migraciones[1]).toMatch(/_funciones_datos\.sql$/);
    expect(migraciones[2]).toMatch(/_rls_funciones\.sql$/);
    expect(migraciones).toEqual([...migraciones].sort());
  });

  it("ninguna migración trae secretos ni contraseñas", () => {
    for (const f of migraciones) expect(leer(f), f).not.toMatch(/password\s+'|eyJ[A-Za-z0-9_-]{20,}|service_role_key/i);
  });
});

describe("las funciones de permisos y la matriz de fábrica dicen lo mismo", () => {
  // Cada `tienePermiso(cid, 'permiso', array['rol', …])` de las funciones lleva escritos los roles de fábrica de ese permiso: si alguien
  // cambia la matriz de lib/rbac.ts y no las funciones (o al revés), el cliente muestra un botón que el servidor rechaza.
  const sql = migraciones.map(leer).join("\n");
  const usos = [...sql.matchAll(/"tienePermiso"\(cid, '([a-z]+\.[a-z]+)', array\[([^\]]*)\]\)/g)].map((m) => ({
    permiso: m[1] as Permission,
    roles: m[2].split(",").map((r) => r.trim().replace(/'/g, "")).filter(Boolean),
  }));

  it("hay exactamente un atajo por cada permiso que el sistema hace cumplir en el servidor", () => {
    expect(usos.map((u) => u.permiso).sort()).toEqual([...PERMISOS_QUE_EXIGE_EL_SERVIDOR].sort());
  });

  it("la lista de roles de fábrica de cada atajo es la de la matriz, en el mismo orden", () => {
    for (const { permiso, roles } of usos) expect(roles, permiso).toEqual(ROLES.filter((r) => permisoDeFabrica(r, permiso)));
  });

  it("todo rol que nombran existe en la matriz", () => {
    for (const { roles } of usos) for (const r of roles) expect(ROLES as string[]).toContain(r);
  });
});
