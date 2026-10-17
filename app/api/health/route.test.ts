/**
 * GET /api/health — la comprobación del servidor propio (Coolify la usa para saber que el contenedor está vivo y el monitoreo
 * externo para avisar si el servidor cae). Es pública: este test fija que responde 200 sin tocar la base, sin cache y sin
 * exponer nada de la configuración ni de las clínicas.
 */
import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("responde 200 con { ok: true } y nada más", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("no se cachea (ni en el navegador ni en Cloudflare)", async () => {
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
