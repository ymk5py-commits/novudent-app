import type { DB } from "./types";

/** El caché del modo local (localStorage, ver `loadLocal` de lib/store.tsx) puede ser de antes de que existiera una colección: se completa
 *  con una lista vacía para que las pantallas que la recorren no se rompan. Al sumar una colección nueva, sumala acá también. */
export function completarCache(guardada: DB): DB {
  return {
    ...guardada,
    directMessages: guardada.directMessages ?? [],
    clinicalDocs: guardada.clinicalDocs ?? [],
    routineChecks: guardada.routineChecks ?? [],
    agendaBlocks: guardada.agendaBlocks ?? [],
  };
}
