/** Los nombres del esquema de Postgres que usan el adaptador de cliente (`supabase.ts`) y la implementación del servidor
 *  (`lib/server/datos-supabase.ts`). El esquema lo define la fase B (supabase/**); si cambia un nombre, se cambia SOLO acá.
 *
 *  Una tabla por colección, con el mismo nombre que en Firestore (entre comillas en SQL, por eso hay mayúsculas):
 *  - las subcolecciones de `clinics/{cid}/…` (manifiesto `colecciones.json`) tienen `(clinic_id, id, data jsonb, updated_at)`;
 *  - `clinics` y las colecciones raíz tienen `(id, data jsonb, updated_at)`.
 *  `directory` y `serviceAccounts` NO existen: el enrutamiento uid → clínica sale de `users.data->>'authUid'` (RPC `mi_directorio` para
 *  quien tiene sesión; búsqueda directa con la clave de servicio en el servidor). */
import { COLECCIONES_DE_CLINICA } from "./colecciones";

/** Tablas sin `clinic_id`: el documento de la clínica y las colecciones de primer nivel que se migran (menos `directory`, que no existe). */
export const TABLAS_RAIZ: readonly string[] = ["clinics", "subscriptions", "webhookEvents", "leads", "checkoutTokens"];

/** Tablas con `clinic_id`: una por subcolección. */
export const TABLAS_DE_CLINICA: readonly string[] = COLECCIONES_DE_CLINICA;

export const esTablaDeClinica = (nombre: string): boolean => TABLAS_DE_CLINICA.includes(nombre);
export const esTablaRaiz = (nombre: string): boolean => TABLAS_RAIZ.includes(nombre);

/** Funciones de Postgres (fase B, `supabase/migrations/*_funciones_datos.sql` y `*_rls_funciones.sql`) que llama el adaptador, por PostgREST
 *  (`POST /rest/v1/rpc/<nombre>`). Corren con los permisos de quien llama (RLS y reglas por campo se aplican igual que con un insert directo). */
export const RPC = {
  guardar: "guardar",
  quitar: "quitar",
  fijarCampo: "fijar_campo",
  mezclarClinica: "mezclar_clinica",
  lote: "lote",
  /** La clínica real de la sesión y el id de MI documento de usuario: `(clinic_id, user_id)`, o ninguna fila si no tiene clínica (nunca la demo ni una cuenta dada de
   *  baja). Reemplaza al `directory` de Firestore y a `currentUserId()`. */
  miDirectorio: "mi_directorio",
} as const;
