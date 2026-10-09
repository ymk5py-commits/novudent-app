import { describe, it, expect } from "vitest";
// El mismo motor de rutas con que Next evalúa `redirects()` (no trae tipos: se lo declara acá).
const { pathToRegexp } = (await import("next/dist/compiled/path-to-regexp" as string)) as { pathToRegexp: (ruta: string, claves: unknown[], opciones: object) => RegExp };

/* Un solo dominio (frente E, 8-oct-2026): las páginas que se abren por novudent-app.vercel.app van al dominio propio con una redirección
   permanente, para que buscadores y personas consoliden todo en novudent.novumholding.lat. La API NO se redirige: hay integraciones que la
   llaman directo y un POST redirigido se pierde. */

type Regla = { source: string; destination: string; permanent: boolean; has?: { type: string; value: string }[] };

async function reglas(): Promise<Regla[]> {
  const config = (await import(/* @vite-ignore */ new URL("../next.config.mjs", import.meta.url).href)).default;
  return config.redirects();
}

describe("next.config — un solo dominio", () => {
  it("las páginas de novudent-app.vercel.app van al dominio propio con una redirección permanente", async () => {
    const regla = (await reglas()).find((r) => r.has?.some((h) => h.type === "host" && h.value === "novudent-app.vercel.app"));
    expect(regla, "falta la redirección del host de Vercel").toBeDefined();
    expect(regla!.permanent).toBe(true);
    expect(regla!.destination).toBe("https://novudent.novumholding.lat/:path");
  });

  it("toma la raíz y las páginas, pero no la API", async () => {
    const regla = (await reglas()).find((r) => r.has?.some((h) => h.value === "novudent-app.vercel.app"))!;
    const re = pathToRegexp(regla.source, [], {});
    for (const ruta of ["/", "/precios", "/app/configuracion/permisos", "/login", "/apiarios"]) expect(re.test(ruta), ruta).toBe(true);
    for (const ruta of ["/api/reservas", "/api/ia/agenda-resumen", "/api"]) expect(re.test(ruta), ruta).toBe(false);
  });

  it("no hay otras redirecciones de dominio (las URLs de preview de Vercel no se tocan)", async () => {
    const deHost = (await reglas()).filter((r) => r.has?.some((h) => h.type === "host"));
    expect(deHost.map((r) => r.has!.find((h) => h.type === "host")!.value)).toEqual(["novudent-app.vercel.app"]);
  });
});
