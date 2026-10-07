/** Qué procedimientos recorre la corrida de capturas. Por defecto, todos. Con `MANUAL_SOLO=recepcion,caja` solo los de esos
 *  módulos de `contenido/` (el nombre del archivo, sin `.ts`): cada persona que escribe un capítulo saca y revisa SUS capturas
 *  sin depender de que el resto esté terminado. */
import { CAPITULOS } from "./index";
import { CAPITULOS_META } from "./capitulos";
import type { Capitulo, CapituloId, Procedimiento } from "./tipos";

export function cargarCapitulos(): { capitulos: Capitulo[]; parcial: boolean } {
  const solo = (process.env.MANUAL_SOLO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (solo.length === 0) return { capitulos: CAPITULOS, parcial: false };
  const procedimientos: Procedimiento[] = solo.flatMap((nombre) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const modulo = require(`./${nombre}`) as { procedimientos?: Procedimiento[] };
    if (!Array.isArray(modulo.procedimientos)) throw new Error(`contenido/${nombre}.ts no exporta \`procedimientos\``);
    return modulo.procedimientos;
  });
  const ids = [...new Set(procedimientos.map((p) => p.capitulo))] as CapituloId[];
  return { capitulos: ids.map((id) => ({ id, ...CAPITULOS_META[id], procedimientos: procedimientos.filter((p) => p.capitulo === id) })), parcial: true };
}
