/** Contrato de la capa de datos de Novudent.
 *
 *  La tienda (`lib/store.tsx`) y las pantallas hablan con estas interfaces y no con Firebase: así se puede cambiar la base (Firestore hoy,
 *  Supabase después, ver docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md) sin tocarlas. Dos mitades:
 *  - `SesionDeBackend`: quién está adentro (login, token, recuperar contraseña);
 *  - `DatosDeBackend`: leer, guardar y escuchar los documentos de una clínica.
 *  Cada implementación tiene que pasar `contrato-de-datos.ts` (mismas pruebas para todas). */

/** Un documento tal como lo guarda la base: un objeto JSON (las fechas son texto ISO). */
export type Doc = Record<string, unknown>;

/** Qué parte de `directMessages` le toca a quien lee. La decide la tienda según el rol (ver `filtroDeDirectos` en carga.ts) y el backend la
 *  ejecuta: un directo es de sus dos participantes y del admin. */
export type FiltroDeDirectos = "todos" | "ninguno" | { participante: string };

export interface LecturaDeClinica {
  /** El documento `clinics/{cid}`. */
  clinica: Doc;
  /** `subscriptions/{cid}`; `null` si la clínica es anterior al cobro. */
  suscripcion: Doc | null;
  /** Una lista por cada colección de la tienda (`COLECCIONES_DE_LA_TIENDA`); `[]` si no hay documentos o si el rol no puede leerla. */
  colecciones: Record<string, Doc[]>;
}

export interface OpcionesDeLectura {
  /** Decide el filtro de `directMessages` con el padrón ya leído y el id del usuario de esta sesión (`null` si no hay sesión). */
  directos(usuarios: Doc[], usuarioId: string | null): FiltroDeDirectos;
}

export type OperacionDeLote =
  | { tipo: "guardar"; col: string; id: string; data: unknown }
  /** Reemplaza el documento `clinics/{cid}` entero. */
  | { tipo: "guardarClinica"; data: unknown }
  /** Fusiona en `clinics/{cid}` (mapas en profundidad, arreglos reemplazados). */
  | { tipo: "mezclarClinica"; data: unknown };

export type Desuscribir = () => void;
export type AlFallar = (error: unknown) => void;

export interface OpcionesDeEscucha {
  /** Campo por el que se ordena de menor a mayor. */
  ordenarPor?: string;
  /** Solo los documentos cuyo `participants` incluye este id (chat directo). */
  participante?: string;
}

export interface DatosDeBackend {
  readonly tipo: "firestore" | "supabase" | "memoria";

  /** Lee la clínica y todas sus colecciones. `null` si la clínica no existe. Una colección que el rol no puede leer da `[]` (no rompe la carga). */
  leerClinica(cid: string, opciones: OpcionesDeLectura): Promise<LecturaDeClinica | null>;
  /** A qué clínica pertenece un usuario (enrutamiento del login multi-clínica); `null` si no figura. Rechaza si no se pudo leer. */
  clinicaDelUsuario(uid: string): Promise<string | null>;

  /** Crea o REEMPLAZA el documento entero (lo que falte en `data` desaparece). Los `undefined` se descartan. */
  guardar(cid: string, col: string, id: string, data: unknown): Promise<void>;
  /** Borra el documento; si no existe no falla. */
  quitar(cid: string, col: string, id: string): Promise<void>;
  /** Cambia UN campo sin tocar el resto; `undefined` lo borra. Rechaza (`code: "not-found"`) si el documento no existe. */
  fijarCampo(cid: string, col: string, id: string, campo: string, valor: unknown): Promise<void>;
  /** Fusiona en `clinics/{cid}`: los mapas se mezclan en profundidad, los arreglos y valores simples se reemplazan, lo demás se conserva. */
  mezclarClinica(cid: string, data: unknown): Promise<void>;
  /** Aplica varias operaciones juntas (todas o ninguna). */
  lote(cid: string, ops: OperacionDeLote[]): Promise<void>;

  escucharSuscripcion(cid: string, alCambiar: (suscripcion: Doc | null) => void, alFallar?: AlFallar): Desuscribir;
  escucharClinica(cid: string, alCambiar: (clinica: Doc | null) => void, alFallar?: AlFallar): Desuscribir;
  escucharColeccion(cid: string, col: string, alCambiar: (docs: Doc[]) => void, opciones?: OpcionesDeEscucha, alFallar?: AlFallar): Desuscribir;
}

export interface SesionDeBackend {
  /** Espera a que se termine de restaurar la sesión guardada (sin esto, una carga en frío ve «sin sesión» aunque la haya). No rechaza. */
  esperarSesion(): Promise<void>;
  /** Entra con email y contraseña; devuelve el id del usuario. Rechaza con `code` de Firebase Auth (`auth/invalid-credential`…): el
   *  adaptador de Supabase los traduce a esos mismos códigos, que son los que entiende `friendlyAuthError` en el login. */
  iniciarSesion(email: string, clave: string): Promise<string>;
  /** Abre la sesión anónima de la demo si no hay ninguna. Devuelve `true` si hay sesión. */
  iniciarSesionDeDemo(): Promise<boolean>;
  cerrarSesion(): Promise<void>;
  /** Id del usuario con sesión, o `null`. Espera a que se restaure la sesión guardada. */
  usuarioActual(): Promise<string | null>;
  /** Credencial para las rutas `/api/*` (`Authorization: Bearer …`); `null` si no hay sesión. */
  token(): Promise<string | null>;
  /** Manda el correo de «olvidé mi contraseña». */
  enviarRecuperacion(email: string): Promise<void>;
}

export type BackendDeDatos = DatosDeBackend & SesionDeBackend;
