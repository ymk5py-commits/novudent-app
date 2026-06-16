import type { PerioToothRecord } from "./types";

/**
 * Orden de los 6 sitios = pd[0..5] del PerioEditor.
 *
 * Tomado directamente de `components/Periodontogram.tsx` línea 19:
 *   const SITES = ["MV", "V", "DV", "ML", "L", "DL"]
 * donde la tabla los renderiza en ese orden para cada pieza.
 *
 *   pd[0] = MV  (mesio-vestibular)
 *   pd[1] = V   (vestibular central)
 *   pd[2] = DV  (disto-vestibular)
 *   pd[3] = ML  (mesio-lingual / mesio-palatino)
 *   pd[4] = L   (lingual / palatino central)
 *   pd[5] = DL  (disto-lingual / disto-palatino)
 */
export const SITE_ORDER = ["MV", "V", "DV", "ML", "L", "DL"] as const;

/** Conjunto de piezas FDI permanentes válidas (11-18, 21-28, 31-38, 41-48). */
const FDI = new Set<string>();
for (const q of [10, 20, 30, 40]) for (let i = 1; i <= 8; i++) FDI.add(String(q + i));

/** Devuelve true si `t` es un número de pieza FDI permanente válido. */
export function isValidFdi(t: string): boolean {
  return FDI.has(String(t).trim());
}

type Result =
  | { ok: true; tooth: string; record: PerioToothRecord }
  | { ok: false; error: string };

/**
 * Convierte un valor crudo de pd en number|null.
 * Devuelve NaN (sentinel) si el valor es un número fuera de rango (1-15).
 * null/undefined → null (sitio no medido).
 */
function validPd(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 15) return NaN as number;
  return n;
}

/**
 * Valida el JSON que devuelve Gemini para un dictado periodontal.
 * Si es válido devuelve { ok: true, tooth, record }; si no, { ok: false, error }.
 */
export function validatePerioVoice(raw: any): Result {
  // 1. Pieza FDI
  const tooth = String(raw?.tooth ?? "").trim();
  if (!isValidFdi(tooth)) return { ok: false, error: `Pieza inválida: ${tooth || "(vacía)"}` };

  // 2. pd — array de 6 valores (number|null)
  if (!Array.isArray(raw?.pd) || raw.pd.length !== 6)
    return { ok: false, error: "pd debe tener 6 valores" };

  const pd: (number | null)[] = [];
  for (const v of raw.pd) {
    const n = validPd(v);
    if (Number.isNaN(n as number)) return { ok: false, error: "profundidad fuera de rango (1-15)" };
    pd.push(n);
  }

  // 3. bop — opcional; si falta se normaliza a 6 falsos
  let bop: boolean[];
  if (raw?.bop === undefined || raw?.bop === null) {
    bop = [false, false, false, false, false, false];
  } else if (Array.isArray(raw.bop) && raw.bop.length === 6) {
    bop = raw.bop.map((x: unknown) => x === true);
  } else {
    return { ok: false, error: "bop debe tener 6 valores" };
  }

  // 4. mobility — opcional; si presente debe ser 0|1|2|3
  let mobility: PerioToothRecord["mobility"];
  if (raw?.mobility !== undefined && raw?.mobility !== null) {
    const m = Number(raw.mobility);
    if (![0, 1, 2, 3].includes(m)) return { ok: false, error: "movilidad debe ser 0-3" };
    mobility = m as 0 | 1 | 2 | 3;
  }

  return {
    ok: true,
    tooth,
    record: { pd, bop, ...(mobility !== undefined ? { mobility } : {}) },
  };
}
