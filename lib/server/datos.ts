/**
 * La capa de datos del SERVIDOR (route handlers): lo que antes era `firestore-rest.ts` pasa a ser una interfaz con dos implementaciones.
 *
 *  - `datos-firestore.ts`: Firestore REST con el «usuario de servicio» (el código de siempre, `firestore-rest.ts`).
 *  - `datos-supabase.ts`: PostgREST con la clave `service_role` de Supabase (se salta RLS; el navegador nunca la tiene).
 *
 * Las rutas importan las funciones de ACÁ (mismos nombres y firmas de siempre) y no saben qué base hay detrás: la elige `NEXT_PUBLIC_BACKEND`
 * (ver `backend.ts`), la misma variable que usa el navegador. Una sola decisión por pedido, tomada al llamar (no al importar), así las
 * pruebas pueden cambiar la variable.
 *
 * Los paths son los de Firestore (`clinics/{cid}/patients/{id}`, `subscriptions/{cid}`…); la implementación de Supabase los traduce a tablas.
 * `directory/{uid}` (uid de login → clínica) no existe en Postgres: se deriva de `users.authUid` (ver `directorio.ts`).
 */
import { backendDelServidor } from "./backend";
import { datosFirestore } from "./datos-firestore";
import { datosSupabase } from "./datos-supabase";

export type Fila = { id: string; data: Record<string, unknown> };

export interface DatosDeServidor {
  readonly tipo: "firestore" | "supabase";
  /** ¿Tiene lo necesario para hablar con la base? (las credenciales del servidor). Las rutas responden 503 si no. */
  estaConfigurado(): boolean;
  /** Una consulta mínima: rechaza si la base no contesta. La usa `/api/health`. Solo la implementa Supabase (Firestore no se vigila). */
  ping?(): Promise<void>;
  /** Un documento, o `null` si no existe. */
  getDocument(path: string): Promise<Record<string, unknown> | null>;
  /** Hasta `limit` documentos de una subcolección, de menor a mayor id. OJO: son los MÁS VIEJOS; para buscar usá `queryWhere` / `queryRange` / `queryIn`. */
  listCollection(parentPath: string, collectionId: string, limit?: number): Promise<Fila[]>;
  /** `field == value` (un campo de primer nivel). El filtro corre en la base. */
  queryWhere(parentPath: string, collectionId: string, field: string, value: unknown, limit?: number): Promise<Fila[]>;
  /** `desde <= field < hasta` sobre un campo de texto. */
  queryRange(parentPath: string, collectionId: string, field: string, desde: string, hasta: string, limit?: number): Promise<Fila[]>;
  /** `field IN valores` (hasta 30). */
  queryIn(parentPath: string, collectionId: string, field: string, valores: unknown[], limit?: number): Promise<Fila[]>;
  /** Crea o REEMPLAZA el documento entero. */
  setDocument(path: string, value: Record<string, unknown>): Promise<void>;
  /** Cambia SOLO esos campos (el resto queda igual). Si el documento no existe lo crea con ellos, como el PATCH de Firestore. */
  patchFields(path: string, fields: Record<string, unknown>): Promise<void>;
  /** Crea el documento solo si no existe. `true` si lo creó, `false` si ya estaba. Es el candado atómico de los turnos, del webhook y del alta de usuarios. */
  createIfAbsent(path: string, value: Record<string, unknown>): Promise<boolean>;
}

const elegida = (): DatosDeServidor => (backendDelServidor() === "supabase" ? datosSupabase : datosFirestore);

export const getDocument: DatosDeServidor["getDocument"] = (...a) => elegida().getDocument(...a);
export const listCollection: DatosDeServidor["listCollection"] = (...a) => elegida().listCollection(...a);
export const queryWhere: DatosDeServidor["queryWhere"] = (...a) => elegida().queryWhere(...a);
export const queryRange: DatosDeServidor["queryRange"] = (...a) => elegida().queryRange(...a);
export const queryIn: DatosDeServidor["queryIn"] = (...a) => elegida().queryIn(...a);
export const setDocument: DatosDeServidor["setDocument"] = (...a) => elegida().setDocument(...a);
export const patchFields: DatosDeServidor["patchFields"] = (...a) => elegida().patchFields(...a);
export const createIfAbsent: DatosDeServidor["createIfAbsent"] = (...a) => elegida().createIfAbsent(...a);

/** Nombre histórico (las rutas lo importan así desde que solo existía Firestore): vale para la base que esté elegida. */
export const isServerFirestoreConfigured = (): boolean => elegida().estaConfigurado();
