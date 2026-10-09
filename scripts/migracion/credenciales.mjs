/** De dónde sale la credencial con la que se lee Firestore para exportar. Tres modos (`--credencial`):
 *
 *  - `firebase-cli` (el de siempre): la sesión del CLI de Firebase de esta máquina (`firebase login`). Es la cuenta dueña del proyecto, así que
 *    lee TODO, incluidos los mensajes directos del chat (que las reglas no dejan leer ni al usuario de servicio). Usa el propio CLI para
 *    renovar el token, sin guardar nada ni pedir claves.
 *  - `servicio`: el usuario de servicio que ya usa el servidor (`FIREBASE_WEB_API_KEY`, `SERVICE_USER_EMAIL`, `SERVICE_USER_PASSWORD`). Lee lo
 *    que las reglas le permiten (todo menos `directMessages`): sirve para medir, no para migrar.
 *  - `entorno`: un token ya generado en `GOOGLE_OAUTH_ACCESS_TOKEN` (por ejemplo, el de `gcloud auth print-access-token`, o «owner» contra
 *    el emulador).
 *
 *  Nunca imprime el token. */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

export const MODOS = ["firebase-cli", "servicio", "entorno"];

/** Carga `lib/auth` del firebase-tools instalado (el que corre `firebase` en esta máquina). */
export function cargarAuthDelCli() {
  let binario;
  try {
    binario = realpathSync(execFileSync("which", ["firebase"], { encoding: "utf8" }).trim());
  } catch {
    throw new Error("No encuentro el CLI de Firebase en esta máquina. Instalalo (npm i -g firebase-tools) e iniciá sesión con: firebase login");
  }
  const corte = binario.indexOf("/firebase-tools");
  if (corte < 0) throw new Error(`No pude ubicar el paquete firebase-tools desde ${binario}.`);
  return createRequire(import.meta.url)(`${binario.slice(0, corte + "/firebase-tools".length)}/lib/auth`);
}

/** @returns {Promise<{ token: string, cuenta: string }>} */
export async function tokenDeFirebaseCli({ cargarAuth = cargarAuthDelCli } = {}) {
  const auth = cargarAuth();
  const cuenta = auth.getGlobalDefaultAccount?.();
  const renovar = cuenta?.tokens?.refresh_token;
  if (!renovar) throw new Error("El CLI de Firebase no tiene una sesión iniciada. Corré: firebase login");
  const nuevo = await auth.getAccessToken(renovar, ["https://www.googleapis.com/auth/cloud-platform"]);
  if (!nuevo?.access_token) throw new Error("El CLI de Firebase no pudo renovar la sesión. Corré: firebase login --reauth");
  return { token: nuevo.access_token, cuenta: cuenta.user?.email ?? "(sin email)" };
}

export async function tokenDeServicio(env, pedir = fetch) {
  const faltan = ["FIREBASE_WEB_API_KEY", "SERVICE_USER_EMAIL", "SERVICE_USER_PASSWORD"].filter((k) => !env[k]);
  if (faltan.length) throw new Error(`Faltan variables para el usuario de servicio: ${faltan.join(", ")}`);
  const res = await pedir(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.SERVICE_USER_EMAIL, password: env.SERVICE_USER_PASSWORD, returnSecureToken: true }),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok || !datos.idToken) throw new Error(`No se pudo iniciar sesión con el usuario de servicio (${datos?.error?.message ?? res.status}).`);
  return { token: datos.idToken, cuenta: env.SERVICE_USER_EMAIL };
}

export function tokenDeEntorno(env) {
  if (!env.GOOGLE_OAUTH_ACCESS_TOKEN) throw new Error("Falta la variable GOOGLE_OAUTH_ACCESS_TOKEN.");
  return { token: env.GOOGLE_OAUTH_ACCESS_TOKEN, cuenta: "(token de la variable de entorno)" };
}

/** @param {{ modo?: string, env?: Record<string, string | undefined>, fetch?: typeof fetch, cargarAuth?: () => any }} opciones */
export async function resolverToken({ modo = "firebase-cli", env = process.env, fetch: pedir = fetch, cargarAuth } = {}) {
  if (modo === "firebase-cli") return tokenDeFirebaseCli({ cargarAuth });
  if (modo === "servicio") return tokenDeServicio(env, pedir);
  if (modo === "entorno") return tokenDeEntorno(env);
  throw new Error(`Credencial desconocida: «${modo}». Opciones: ${MODOS.join(", ")}.`);
}
