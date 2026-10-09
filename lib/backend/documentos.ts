/** Operaciones puras sobre documentos JSON, las mismas para cualquier backend. */
import type { Doc } from "./tipos";

/** Copia sin `undefined` (Firestore no los acepta; en JSON no existen). */
export const limpiar = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const esMapa = (v: unknown): v is Doc => typeof v === "object" && v !== null && !Array.isArray(v);

/** Fusión como la de Firestore con `{ merge: true }`: los mapas se mezclan en profundidad; los arreglos y los valores simples (incluido
 *  `null`) del parche REEMPLAZAN; lo que el parche no menciona se conserva. No modifica ninguno de los dos. */
export function mezclarProfundo(base: Doc, parche: Doc): Doc {
  const salida: Doc = { ...base };
  for (const [clave, valor] of Object.entries(parche)) {
    if (valor === undefined) continue;
    const actual = salida[clave];
    salida[clave] = esMapa(valor) && esMapa(actual) ? mezclarProfundo(actual, valor) : valor;
  }
  return salida;
}
