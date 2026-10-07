import { describe, it, expect } from "vitest";
import { normalizarLinkDePago } from "./pagoOnline";

describe("normalizarLinkDePago — el link de la pasarela que pega la clínica", () => {
  it("vacío es válido: es la forma de sacar el link", () => {
    expect(normalizarLinkDePago("")).toEqual({ ok: true, url: "" });
    expect(normalizarLinkDePago("   ")).toEqual({ ok: true, url: "" });
  });
  it("un https completo se deja como está (sin espacios alrededor)", () => {
    expect(normalizarLinkDePago("  https://link.mercadopago.com.py/aura  ")).toEqual({ ok: true, url: "https://link.mercadopago.com.py/aura" });
  });
  it("sin https:// se lo agrega: sin eso la página de pago del paciente lo ignora", () => {
    expect(normalizarLinkDePago("link.mercadopago.com.py/aura")).toEqual({ ok: true, url: "https://link.mercadopago.com.py/aura" });
    expect(normalizarLinkDePago("www.pagopar.com/pagar/123")).toEqual({ ok: true, url: "https://www.pagopar.com/pagar/123" });
  });
  it("http:// no sirve: tiene que ser https", () => {
    const r = normalizarLinkDePago("http://pasarela.com/pagar");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/https/);
  });
  it("un texto que no es un link da un error que explica qué pegar", () => {
    for (const malo of ["pagar con tarjeta", "hola", "https://", "https://sin punto", "ftp://pasarela.com/x"]) {
      const r = normalizarLinkDePago(malo);
      expect(r.ok, malo).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
  });
  it("conserva los parámetros y el fragmento del link", () => {
    expect(normalizarLinkDePago("https://pasarela.com/pagar?id=1&m=gs#cuota")).toEqual({ ok: true, url: "https://pasarela.com/pagar?id=1&m=gs#cuota" });
  });
});
