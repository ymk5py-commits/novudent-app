/**
 * Validación de ids que llegan de afuera (query string, body, params de ruta).
 *
 * Vivía copiado y pegado en `/api/reservas` y `/api/firmar`, y justamente las
 * rutas que NO tenían la copia (`/api/encuestas`, `/api/pago`) fueron por donde
 * se coló un path traversal: el id entraba crudo a la URL de Firestore y con un
 * `#` o un `..` se leía cualquier documento de cualquier clínica. Tenerlo en un
 * solo lugar es lo que evita que la próxima ruta nueva nazca sin el chequeo.
 *
 * `encodePath` en `firestore-rest.ts` ya corta la clase entera aunque acá se
 * escape algo; esto es la segunda barrera, y encima devuelve un 400 limpio en
 * vez de un 500 con el error de Firestore.
 */

/** Gramática de los ids que genera la app: `cl_aura`, `p_1699…`, uid de Firebase. */
export function isValidId(s: unknown): s is string {
  return typeof s === "string" && /^[a-zA-Z0-9_-]{2,64}$/.test(s);
}

/** Tokens url-safe de `newSignToken` (base64url, 192 bits) y afines. */
export function isValidToken(s: unknown): s is string {
  return typeof s === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(s);
}
