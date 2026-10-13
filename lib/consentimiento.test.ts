import { describe, it, expect } from "vitest";
import { rutaConAnalitica } from "./consentimiento";
import { PAGINAS_PUBLICAS } from "./seo";

/* Google Analytics manda la URL entera de cada página que mide. En el panel esa URL lleva ids de pacientes
 * (`/app/pacientes/<id>/planes`) y en los enlaces que recibe un paciente lleva su credencial (`/confirmar/<cid>/<token>`,
 * `/firmar/<token>`, `/videoconsulta/<token>`): ninguna de esas puede llegar a Google, aunque la persona haya aceptado la
 * analítica. Se mide solo el sitio público, con una lista cerrada. */
describe("rutaConAnalitica", () => {
  it("mide todas las páginas públicas del sitio (las mismas del sitemap)", () => {
    for (const p of PAGINAS_PUBLICAS) expect(rutaConAnalitica(p.ruta), p.ruta).toBe(true);
  });

  it("ignora la barra final, la query y el ancla", () => {
    expect(rutaConAnalitica("/precios/")).toBe(true);
    expect(rutaConAnalitica("/precios?utm_source=ig")).toBe(true);
    expect(rutaConAnalitica("/precios#planes")).toBe(true);
  });

  it("nunca mide el panel, el login ni el superadmin", () => {
    for (const r of ["/app", "/app/", "/app/agenda", "/app/pacientes/Xk3Jq9ZbL0aTn5RvWm2d/planes", "/login", "/login?demo=1", "/superadmin"]) {
      expect(rutaConAnalitica(r), r).toBe(false);
    }
  });

  it("nunca mide los enlaces que llevan una credencial o datos de una clínica", () => {
    for (const r of ["/confirmar/cl_demo/tok_abc123", "/firmar/tok_abc123", "/pagar/cl_demo", "/reservar/cl_demo", "/encuestas/cl_demo/tok", "/videoconsulta/tok_abc"]) {
      expect(rutaConAnalitica(r), r).toBe(false);
    }
  });

  it("una ruta que no está en la lista no se mide (lista cerrada: lo nuevo arranca sin analítica)", () => {
    expect(rutaConAnalitica("/precios-viejos")).toBe(false);
    expect(rutaConAnalitica("/preciosx")).toBe(false);
    expect(rutaConAnalitica("")).toBe(false);
  });
});
