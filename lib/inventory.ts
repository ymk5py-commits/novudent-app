import type { StockItem } from "./types";

export type StockLevel = "critico" | "bajo" | "ok" | "exceso";

/** Semáforo de stock de 3 niveles (mínimo / óptimo / máximo).
 *  crítico ≤ mínimo · bajo óptimo · OK · sobre-stock > máximo. */
export function stockLevel(s: Pick<StockItem, "stock" | "minStock" | "optimalStock" | "maxStock">): StockLevel {
  if (s.stock <= s.minStock) return "critico";
  if (s.maxStock != null && s.stock > s.maxStock) return "exceso";
  if (s.optimalStock != null && s.stock < s.optimalStock) return "bajo";
  return "ok";
}
