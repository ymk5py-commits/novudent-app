import { createHash, randomUUID } from "node:crypto";
import { createClient } from "redis";
import type { RateResult } from "./rate-limit";

// Una sola operación atómica: dos réplicas nunca admiten el mismo último cupo.
// El reloj de Redis evita diferencias de hora entre servidores.
const VENTANA = `
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
local count = redis.call('ZCARD', KEYS[1])
if count >= limit then
  local first = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, 0, math.max(1, math.ceil((tonumber(first[2]) + window - now) / 1000))}
end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], window)
return {1, limit - count - 1, 0}
`;

type Cliente = ReturnType<typeof createClient>;
let cliente: Cliente | undefined;
let conexion: Promise<Cliente> | undefined;
let urlActual: string | undefined;

export async function redisRate(
  url: string,
  key: string,
  opts: { limit: number; windowMs: number },
): Promise<RateResult> {
  if (url !== urlActual || !cliente?.isOpen) {
    if (cliente?.isOpen) cliente.destroy();
    urlActual = url;
    cliente = createClient({
      url,
      disableOfflineQueue: true,
      socket: { connectTimeout: 1000, reconnectStrategy: false },
    });
    // El llamador emite un aviso genérico; nunca registrar URL ni credenciales.
    cliente.on("error", () => {});
    const nuevo = cliente;
    conexion = nuevo.connect().then(() => nuevo);
  }
  const activo = await conexion!;
  const resultado = await activo.withCommandOptions({
    abortSignal: AbortSignal.timeout(1500),
  }).eval(VENTANA, {
    keys: [`novudent:rl:${createHash("sha256").update(key).digest("hex")}`],
    arguments: [String(opts.windowMs), String(opts.limit), randomUUID()],
  });
  if (!Array.isArray(resultado) || resultado.length !== 3) throw new Error("Respuesta Redis inválida");
  const [ok, remaining, retryAfterSec] = resultado.map(Number);
  if (![ok, remaining, retryAfterSec].every(Number.isFinite)) throw new Error("Respuesta Redis inválida");
  return { ok: ok === 1, remaining, retryAfterSec };
}
