/** Analytics con gtag.js directo (sin el SDK de Firebase): mismas reglas de antes. Nada se carga sin consentimiento; solo se mide el sitio público
 *  (Google recibe la URL entera de cada página) y fuera de él queda prendida `ga-disable-<id>`, la bandera oficial para no enviar nada. */
import { describe, expect, it } from "vitest";
import { conectarAnalitica, ID_DE_MEDICION } from "./analitica";

const BANDERA = `ga-disable-${ID_DE_MEDICION}`;

function entorno(ruta: string, consentida: boolean) {
  const scripts: string[] = [];
  let oyente: ((c: { analitica: boolean }) => void) | null = null;
  const ventana: Record<string, any> = {
    location: { pathname: ruta, href: `https://novudent.test${ruta}` },
    history: { pushState() {}, replaceState() {} },
    listeners: {} as Record<string, () => void>,
    addEventListener(tipo: string, fn: () => void) { this.listeners[tipo] = fn; },
  };
  const documento = {
    createElement: () => ({} as Record<string, any>),
    head: { appendChild: (s: Record<string, any>) => { scripts.push(String(s.src)); } },
  };
  const consentimiento = {
    leerConsentimiento: () => (consentida ? { analitica: true } : null) as never,
    alCambiarConsentimiento: (fn: (c: { analitica: boolean }) => void) => { oyente = fn; return () => {}; },
    rutaConAnalitica: (r: string) => r === "/" || r === "/precios",
  };
  conectarAnalitica({ ventana: ventana as never, documento: documento as never, consentimiento: consentimiento as never });
  return { ventana, scripts, consentir: () => oyente!({ analitica: true }), revocar: () => oyente!({ analitica: false }) };
}

describe("conectarAnalitica", () => {
  it("sin consentimiento no se carga nada, ni en el sitio público ni en el panel", () => {
    for (const ruta of ["/", "/precios", "/app"]) {
      const e = entorno(ruta, false);
      expect(e.scripts, ruta).toEqual([]);
      expect(e.ventana.dataLayer, ruta).toBeUndefined();
    }
  });

  it("sin consentimiento la bandera de Google queda prendida en cualquier página", () => {
    for (const ruta of ["/", "/precios", "/app"]) expect(entorno(ruta, false).ventana[BANDERA], ruta).toBe(true);
  });

  it("revocar el consentimiento con Analytics ya cargado apaga la medición (la bandera vuelve a prenderse)", () => {
    const e = entorno("/precios", true);
    expect(e.ventana[BANDERA]).toBe(false);
    e.revocar();
    expect(e.ventana[BANDERA]).toBe(true);
    e.consentir();
    expect(e.ventana[BANDERA]).toBe(false);
  });

  it("con consentimiento, en una página pública: baja la bandera y carga gtag.js con el ID de medición", () => {
    const e = entorno("/precios", true);
    expect(e.ventana[BANDERA]).toBe(false);
    expect(e.scripts).toHaveLength(1);
    expect(e.scripts[0]).toBe(`https://www.googletagmanager.com/gtag/js?id=${ID_DE_MEDICION}`);
    const capa = e.ventana.dataLayer as unknown[][];
    expect(Array.from(capa[0] as ArrayLike<unknown>)[0]).toBe("js");
    expect(Array.from(capa[1] as ArrayLike<unknown>)).toEqual(["config", ID_DE_MEDICION]);
  });

  it("con consentimiento pero en el panel o en un enlace del paciente: la bandera queda prendida y no se carga nada", () => {
    for (const ruta of ["/app/pacientes/p_1/planes", "/confirmar/cl_demo/token-secreto", "/firmar/abc"]) {
      const e = entorno(ruta, true);
      expect(e.ventana[BANDERA], ruta).toBe(true);
      expect(e.scripts, ruta).toEqual([]);
    }
  });

  it("al pasar del panel al sitio público sin recargar, se prende y se apaga según la página; se carga una sola vez", () => {
    const e = entorno("/app", true);
    expect(e.scripts).toEqual([]);
    e.ventana.history.pushState(null, "", "/precios");
    expect(e.ventana[BANDERA]).toBe(false);
    expect(e.scripts).toHaveLength(1);
    e.ventana.history.replaceState(null, "", "/app/pacientes/p_9");
    expect(e.ventana[BANDERA]).toBe(true);
    e.ventana.history.pushState(null, "", "/");
    expect(e.scripts).toHaveLength(1); // ya estaba cargado
    e.ventana.location.pathname = "/app";
    e.ventana.listeners.popstate();
    expect(e.ventana[BANDERA]).toBe(true);
  });

  it("si la persona acepta después, empieza a medir ahí mismo", () => {
    const e = entorno("/", false);
    expect(e.scripts).toEqual([]);
    e.consentir();
    expect(e.scripts).toHaveLength(1);
    expect(e.ventana[BANDERA]).toBe(false);
  });
});
