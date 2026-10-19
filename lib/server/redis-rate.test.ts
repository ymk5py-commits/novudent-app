import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { redisRate } from "./redis-rate";

const url = process.env.NOVUDENT_TEST_REDIS_URL;
describe.skipIf(!url)("Redis propio: cuota compartida real", () => {
  it("admite exactamente 10 de 100 pedidos concurrentes", async () => {
    const key = `test:${randomUUID()}`;
    const resultados = await Promise.all(Array.from({ length: 100 }, () => redisRate(url!, key, { limit: 10, windowMs: 5000 })));
    expect(resultados.filter((r) => r.ok)).toHaveLength(10);
    expect(resultados.filter((r) => !r.ok).every((r) => r.retryAfterSec > 0)).toBe(true);
  });
  it("mantiene separadas dos identidades y libera la cuota al vencer", async () => {
    const key = `test:${randomUUID()}`;
    const opts = { limit: 1, windowMs: 100 };
    expect((await redisRate(url!, key, opts)).ok).toBe(true);
    expect((await redisRate(url!, key, opts)).ok).toBe(false);
    expect((await redisRate(url!, `${key}:otra`, opts)).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await redisRate(url!, key, opts)).ok).toBe(true);
  });
});
