/** Operaciones puras sobre documentos JSON, las mismas para cualquier backend. */
import type { Doc } from "./tipos";

/** Copia sin `undefined` (Firestore no los acepta; en JSON no existen). */
export const limpiar = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const esMapa = (v: unknown): v is Doc => typeof v === "object" && v !== null && !Array.isArray(v);

/** Fusión como la de Firestore con `{ merge: true }`: los mapas se mezclan en profundidad; los arreglos y los valores simples (incluido
 *  `null`) del parche REEMPLAZAN; lo que el parche no menciona se conserva. Un mapa vacío en el parche REEMPLAZA el mapa (Firestore lo trata
 *  como «dejá este campo vacío»). No modifica ninguno de los dos. */
export function mezclarProfundo(base: Doc, parche: Doc): Doc {
  const salida: Doc = { ...base };
  for (const [clave, valor] of Object.entries(parche)) {
    if (valor === undefined) continue;
    const actual = salida[clave];
    // Un mapa vacío en el parche reemplaza el campo (Firestore lo trata así).
    // Un mapa con claves se mezcla en profundidad si el actual también es mapa.
    const esMapaVacio = esMapa(valor) && Object.keys(valor).length === 0;
    salida[clave] = esMapa(valor) && esMapa(actual) && !esMapaVacio ? mezclarProfundo(actual, valor) : valor;
  }
  return salida;
}
