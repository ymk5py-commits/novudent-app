/**
 * GET /api/health — la comprobación del servidor propio (Coolify la usa para saber que el contenedor está vivo y el monitoreo
 * externo para avisar si el servidor cae). Es pública: este test fija que responde 200 sin cache y sin exponer nada de la
 * configuración ni de las clínicas. Con el backend de Supabase además tiene que contestar la base: si no, 503.
 */
import { afterEach, describe, it, expect, vi } from "vitest";

const ping = vi.fn();
vi.mock("@/lib/server/datos-supabase", () => ({ datosSupabase: { ping: () => ping() } }));
import { GET } from "./route";
import { reiniciarCacheDeSalud } from "@/lib/server/salud";

afterEach(() => { vi.unstubAllEnvs(); ping.mockReset(); vi.useRealTimers(); reiniciarCacheDeSalud(); });

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

  it("con el backend por defecto (firestore) no toca la base", async () => {
    await GET();
    expect(ping).not.toHaveBeenCalled();
  });

  it("con Supabase consulta la base y responde 200 si contesta", async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND", "supabase");
    ping.mockResolvedValue(undefined);
    const res = await GET();
    expect(ping).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("con Supabase responde 503 si la base no contesta, sin filtrar el motivo, y tampoco se cachea", async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND", "supabase");
    ping.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432 password=secreto"));
    const res = await GET();
    expect(res.status).toBe(503);
    const cuerpo = await res.json();
    expect(cuerpo).toEqual({ ok: false });
    expect(JSON.stringify(cuerpo)).not.toContain("secreto");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("no consulta la base en cada llamada (es pública y sin límite): el resultado vale unos segundos, también cuando falla", async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND", "supabase");
    vi.useFakeTimers();
    ping.mockResolvedValue(undefined);
    await GET(); await GET(); await GET();
    expect(ping).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6_000);
    await GET();
    expect(ping).toHaveBeenCalledTimes(2);
    ping.mockRejectedValue(new Error("caída"));
    vi.advanceTimersByTime(6_000);
    expect((await GET()).status).toBe(503);
    expect((await GET()).status).toBe(503);
    expect(ping).toHaveBeenCalledTimes(3);
  });
});
