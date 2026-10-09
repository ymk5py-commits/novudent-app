/** Manifiesto de colecciones de Novudent: la única lista de qué guarda la base.
 *
 *  Los nombres viven en `colecciones.json` (JSON a propósito: lo leen también los scripts de Node sin pasar por TypeScript, como
 *  `scripts/migracion/exportar-firestore.mjs`, y después lo va a leer el generador del esquema de Postgres). `colecciones.test.ts` lo ata a
 *  `firestore.rules` y a la semilla: si se suma una colección en un lado y no en el otro, falla. */
import datos from "./colecciones.json";

/** Subcolecciones de `clinics/{cid}/…` (en Postgres: una tabla por cada una). */
export const COLECCIONES_DE_CLINICA: readonly string[] = datos.porClinica;

/** Colecciones de primer nivel que se migran (`clinics` es el documento de cada clínica). */
export const COLECCIONES_RAIZ: readonly string[] = datos.raiz;

/** Colecciones de primer nivel que NO se migran (`serviceAccounts`: la lista de usuarios de servicio de Firebase, que en Supabase no existe). */
export const COLECCIONES_QUE_NO_SE_MIGRAN: readonly string[] = datos.noSeMigra;

/** Las que escribe solo el servidor (la ruta de reservas online): la tienda no las carga. */
export const COLECCIONES_SOLO_SERVIDOR: readonly string[] = datos.soloServidor;

/** Las que carga la tienda al abrir una clínica. */
export const COLECCIONES_DE_LA_TIENDA: readonly string[] = datos.porClinica.filter((n) => !datos.soloServidor.includes(n));
