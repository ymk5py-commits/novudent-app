/**
 * Rate limiting para las rutas /api/*.
 *
 * DOS BACKENDS, MISMA FIRMA (async):
 *
 * 1) DISTRIBUIDO — si están UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *    (env en Vercel), el contador vive en Redis y comparte cuota entre TODAS
 *    las instancias de lambda. Ventana deslizante vía sorted set (pipeline
 *    REST de Upstash, sin SDK nuevo). Es el límite duro que la variante
 *    in-memory no puede dar.
 *
 * 2) IN-MEMORY (fallback) — ventana deslizante por clave en el proceso. En
 *    Vercel serverless el estado es POR INSTANCIA de lambda (no global), así
 *    que frena ráfagas contra una instancia caliente pero no es límite global.
 *    Sigue siendo el default cuando no hay Redis configurado.
 *
 * Si Redis falla (red, cuota), se hace FAIL-OPEN: se deja pasar y se loguea.
 * Disponibilidad > rigidez: es mitigación de abuso, no control de acceso.
 *
 * Uso:
 *   const rl = await rateLimit(`ia:${uid}`, { limit: 20, windowMs: 60_000 });
 *   if (!rl.ok) return tooMany(rl.retryAfterSec);
 */

interface Bucket {
  hits: number[];
  windowMs: number; // ventana propia de esta clave (el sweep expira con la SUYA)
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;
let lastRedisWarn = 0;

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

/** Ventana deslizante en Upstash: sorted set con timestamps como scores.
 *  Pipeline [limpieza, conteo] → si hay lugar, segundo pipeline [alta, TTL].
 *  Dos viajes ida/vuelta al permitir, uno al bloquear. La carrera entre
 *  conteo y alta puede pasarse por un pelo bajo concurrencia extrema: aceptable
 *  para frenar abuso (no es un control de acceso). */
async function upstashRate(
  cfg: { url: string; token: string },
  key: string,
  opts: { limit: number; windowMs: number },
  now: number
): Promise<RateResult> {
  const cutoff = now - opts.windowMs;
  const auth = { Authorization: `Bearer ${cfg.token}` };

  const pipe = async (cmds: unknown[][]): Promise<any[]> => {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify(cmds.map((cmd) => ({ cmd }))),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const rows = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    const err = rows.find((r) => r.error);
    if (err) throw new Error(`upstash cmd: ${err.error}`);
    return rows.map((r) => r.result);
  };

  // Limpieza + conteo de la ventana vigente.
  const [, countRaw] = await pipe([
    ["zremrangebyscore", key, "0", String(cutoff)],
    ["zcard", key],
  ]);
  const count = Number(countRaw ?? 0);

  if (count >= opts.limit) {
    return {
      ok: false,
      remaining: 0,
      // Sin leer el miembro más viejo (un viaje más): acotamos con la ventana.
      retryAfterSec: Math.max(1, Math.ceil(opts.windowMs / 1000)),
    };
  }

  await pipe([
    ["zadd", key, { score: now, member: `${now}-${Math.random().toString(36).slice(2, 8)}` }],
    ["pexpire", key, String(opts.windowMs)],
  ]);
  return { ok: true, remaining: Math.max(0, opts.limit - count - 1), retryAfterSec: 0 };
}

function memoryRate(
  key: string,
  opts: { limit: number; windowMs: number },
  now: number
): RateResult {
  const { limit, windowMs } = opts;

  // Limpieza perezosa de claves viejas (evita crecer sin límite). Cada clave se
  // expira con SU PROPIA ventana, no la del request que disparó el barrido —
  // así una ruta de ventana corta no borra prematuramente buckets de otra larga.
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) {
      if (!b.hits.length || now - b.hits[b.hits.length - 1] > b.windowMs) buckets.delete(k);
    }
    lastSweep = now;
  }

  const b = buckets.get(key) ?? { hits: [], windowMs };
  b.windowMs = windowMs;
  // Descartar timestamps fuera de la ventana.
  const cutoff = now - windowMs;
  b.hits = b.hits.filter((t) => t > cutoff);

  if (b.hits.length >= limit) {
    buckets.set(key, b);
    const oldest = b.hits[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSec };
  }

  b.hits.push(now);
  buckets.set(key, b);
  return { ok: true, remaining: limit - b.hits.length, retryAfterSec: 0 };
}

/** Límite por clave. Async porque puede ir a Redis. Fail-open ante fallos. */
export async function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
  now: number = Date.now()
): Promise<RateResult> {
  const cfg = redisConfig();
  if (!cfg) return memoryRate(key, opts, now);
  try {
    return await upstashRate(cfg, `rl:${key}`, opts, now);
  } catch (e) {
    // Warn como mucho una vez por minuto: no inundar los logs de Vercel.
    if (now - lastRedisWarn > 60_000) {
      console.warn("[rate-limit] Redis caído — fail-open:", e instanceof Error ? e.message : e);
      lastRedisWarn = now;
    }
    return memoryRate(key, opts, now);
  }
}

/** IP del cliente desde los headers de Vercel/proxy (best-effort). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/** Respuesta 429 estándar con Retry-After. */
export function tooManyRequests(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({ ok: false, error: "Demasiadas solicitudes. Esperá un momento e intentá de nuevo." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    }
  );
}
