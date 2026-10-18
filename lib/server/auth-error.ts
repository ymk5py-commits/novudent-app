/** El error de autenticación de las rutas `/api` y el usuario que sale de verificar un token. Vive aparte de `auth.ts` para que las
 *  verificaciones de cada backend (`auth-supabase.ts`, …) lo usen sin importarse en círculo. Las rutas siguen importándolo de `./auth`. */
export interface VerifiedUser {
  /** El uid de LOGIN (GoTrue: el `sub` del token; Firebase: el `localId`). Es lo que guarda `User.authUid`; el id del documento de usuario
   *  puede ser otro (los usuarios migrados): ver `directorioDe()` en `lib/server/directorio.ts`. */
  uid: string;
  email?: string;
  isAnonymous: boolean;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
