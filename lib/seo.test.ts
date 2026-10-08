import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PAGINAS_PUBLICAS, jsonLdMigas, verificacionDeBuscadores } from "./seo";
import { esFecha, fechaLocal } from "./tareas";
import sitemap from "../app/sitemap";
import robots from "../app/robots";

const raiz = fileURLToPath(new URL("..", import.meta.url));

describe("PAGINAS_PUBLICAS — lo que se indexa", () => {
  it("cada página existe, sin repetirse, y con su fecha de último cambio (que no es del futuro)", () => {
    const rutas = PAGINAS_PUBLICAS.map((p) => p.ruta);
    expect(new Set(rutas).size).toBe(rutas.length);
    for (const p of PAGINAS_PUBLICAS) {
      const archivo = p.ruta === "/" ? "app/page.tsx" : `app${p.ruta}/page.tsx`;
      expect(existsSync(`${raiz}${archivo}`), archivo).toBe(true);
      expect(esFecha(p.actualizado), `${p.ruta}: ${p.actualizado}`).toBe(true);
      expect(p.actualizado <= fechaLocal(), `${p.ruta} tiene una fecha del futuro`).toBe(true);
    }
  });

  it("ninguna página pública es del panel ni de las que van por link (esas no se indexan)", () => {
    const privadas = ["/app", "/login", "/superadmin", "/reservar", "/firmar", "/confirmar", "/pagar", "/encuestas", "/videoconsulta", "/api"];
    for (const p of PAGINAS_PUBLICAS) expect(privadas.some((x) => p.ruta === x || p.ruta.startsWith(`${x}/`)), p.ruta).toBe(false);
  });

  it("robots.txt no bloquea ninguna página pública y sí todo lo privado", () => {
    const r = robots();
    const reglas = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    const disallow = ([] as string[]).concat(reglas.disallow ?? []);
    for (const p of PAGINAS_PUBLICAS) expect(disallow.some((d) => p.ruta.startsWith(d.replace(/\/$/, "")) && p.ruta !== "/"), p.ruta).toBe(false);
    for (const privada of ["/app", "/login", "/firmar/", "/pagar/"]) expect(disallow).toContain(privada);
  });
});

describe("sitemap — las páginas públicas con la fecha en que cambiaron", () => {
  it("lista todas, con su fecha (no la del día del deploy) y en el dominio propio", () => {
    const s = sitemap();
    expect(s.map((x) => new URL(x.url).pathname)).toEqual(PAGINAS_PUBLICAS.map((p) => p.ruta));
    for (const [i, x] of s.entries()) {
      expect(x.url.startsWith("https://novudent.novumholding.lat")).toBe(true);
      expect(String(x.lastModified)).toBe(PAGINAS_PUBLICAS[i].actualizado);
    }
  });
});

describe("jsonLdMigas — la miga de pan de una página interna para los buscadores", () => {
  it("Inicio › la página, con URLs absolutas", () => {
    expect(jsonLdMigas("Precios", "/precios", "https://x.test")).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: "https://x.test/" },
        { "@type": "ListItem", position: 2, name: "Precios", item: "https://x.test/precios" },
      ],
    });
  });
});

describe("verificacionDeBuscadores — Search Console y Bing, por variable de entorno", () => {
  it("sin variables no emite nada", () => {
    expect(verificacionDeBuscadores({})).toBeUndefined();
    expect(verificacionDeBuscadores({ GOOGLE_SITE_VERIFICATION: "  " })).toBeUndefined();
  });
  it("con los tokens arma la verificación de Google y la de Bing", () => {
    expect(verificacionDeBuscadores({ GOOGLE_SITE_VERIFICATION: " abc " })).toEqual({ google: "abc" });
    expect(verificacionDeBuscadores({ GOOGLE_SITE_VERIFICATION: "abc", BING_SITE_VERIFICATION: "XYZ" })).toEqual({ google: "abc", other: { "msvalidate.01": "XYZ" } });
  });
});
