import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp } from "./rate-limit";

const pedido = (headers: Record<string, string>) => new Request("http://localhost/api/x", { headers });

afterEach(() => vi.unstubAllEnvs());

describe("clientIp sin IP_CLIENTE_HEADER (Vercel: la plataforma reescribe x-forwarded-for)", () => {
  it("toma el primer valor de x-forwarded-for", () => {
    expect(clientIp(pedido({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("cae en x-real-ip y después en 'unknown'", () => {
    expect(clientIp(pedido({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(pedido({}))).toBe("unknown");
  });

  it("ignora cf-connecting-ip: sin proxy de confianza cualquiera podría mandarlo", () => {
    expect(clientIp(pedido({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });
});

describe("clientIp con IP_CLIENTE_HEADER=cf-connecting-ip (servidor propio detrás de Cloudflare)", () => {
  it("confía solo en ese header, aunque x-forwarded-for traiga otra cosa", () => {
    vi.stubEnv("IP_CLIENTE_HEADER", "cf-connecting-ip");
    // Traefik reescribe x-forwarded-for con la IP del túnel y un cliente puede mandar el suyo falso.
    expect(clientIp(pedido({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "172.18.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(pedido({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "6.6.6.6, 172.18.0.1" }))).toBe("203.0.113.7");
  });

  it("sin el header, todos caen en un único balde 'sin-proxy' (no se puede falsear la IP)", () => {
    vi.stubEnv("IP_CLIENTE_HEADER", "cf-connecting-ip");
    expect(clientIp(pedido({ "x-forwarded-for": "6.6.6.6" }))).toBe("sin-proxy");
    expect(clientIp(pedido({}))).toBe("sin-proxy");
  });

  it("acepta el nombre del header en cualquier mayúscula y con espacios", () => {
    vi.stubEnv("IP_CLIENTE_HEADER", "  CF-Connecting-IP ");
    expect(clientIp(pedido({ "cf-connecting-ip": " 203.0.113.7 " }))).toBe("203.0.113.7");
  });

  it("una variable vacía equivale a no tenerla", () => {
    vi.stubEnv("IP_CLIENTE_HEADER", "   ");
    expect(clientIp(pedido({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });
});
