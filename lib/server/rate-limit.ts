/**
 * Rate limiting ligero para las rutas /api/*.
 *
 * Implementación in-memory (ventana deslizante por clave). En Vercel serverless
 * el estado es POR INSTANCIA de lambda (no global), así que NO es un límite
 * duro a escala — pero frena ráfagas de un mismo atacante contra una instancia
 * caliente, que es el grueso del abuso (p. ej. martillar /api/ia/* para quemar
 * la cuota de Gemini). Para un límite global y persistente, cambiar el backend
 * por Upstash/Vercel KV (misma firma `rateLimit`).
 *
 * Uso:
 *   const rl = rateLimit(`ia:${uid}`, { limit: 20, windowMs: 60_000 });
 *   if (!rl.ok) return tooMany(rl.retryAfterSec);
 */

interface Bucket {
  hits: number[];
  windowMs: number; // ventana propia de esta clave (el sweep expira con la SUYA)
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
  now: number = Date.now()
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
