import type { Budget } from "./types";

export function defaultNegociacionConfig() {
  return {
    diasGatillo: 5,
    maxIntentos: 2,
    financiacion: { maxCuotas: 3, sinInteres: true, anticipoMinPct: 0 },
  };
}

/** ¿El presupuesto está "presentado" hace ≥ diasGatillo y SIN negociación cerrada/terminal? */
export function isBudgetStale(b: Budget, diasGatillo: number, now: Date): boolean {
  if (b.status !== "presentado") return false;
  const st = b.negociacion?.status;
  if (st === "sin_respuesta" || st === "rechazado" || st === "listo_para_cerrar") return false;
  const created = new Date(b.createdAt).getTime();
  const ageDays = (now.getTime() - created) / (24 * 3600 * 1000);
  return ageDays >= diasGatillo;
}

/** ¿Quedan intentos? */
export function canRetry(b: Budget, maxIntentos: number): boolean {
  const intentos = b.negociacion?.intentos ?? 0;
  return intentos < maxIntentos;
}
