/**
 * Las cuentas de LOGIN (email + contraseña) desde el servidor: crearlas, y cambiar la contraseña de quien llama. Dos implementaciones,
 * como `datos.ts`: Firebase Auth (Identity Toolkit) y GoTrue (Supabase Auth). Las eligen `NEXT_PUBLIC_BACKEND`.
 *
 * Errores: los que el usuario tiene que ver (contraseña débil, email inválido, cuenta ya usada, sesión vencida) llegan como `AuthError` con
 * el mensaje y el estado HTTP; cualquier otro fallo es un `Error` común (las rutas responden con un mensaje genérico).
 */
import { backendDelServidor } from "./backend";
import { cuentasFirebase } from "./cuentas-firebase";
import { cuentasSupabase } from "./cuentas-supabase";

export interface CuentasDeServidor {
  estaConfigurado(): boolean;
  /** Crea la cuenta de login y devuelve su uid. Si el email ya existe con ESA contraseña (un alta que se cortó a mitad), recupera la existente. */
  crearOCuentaRecuperar(email: string, password: string): Promise<string>;
  /** Cambia la contraseña de la persona dueña de `token` (el mismo Bearer con el que llamó a la ruta). */
  cambiarClave(token: string, nuevaClave: string): Promise<void>;
}

const elegida = (): CuentasDeServidor => (backendDelServidor() === "supabase" ? cuentasSupabase : cuentasFirebase);

export const cuentasEstaConfigurado = (): boolean => elegida().estaConfigurado();
export const crearOCuentaRecuperar: CuentasDeServidor["crearOCuentaRecuperar"] = (...a) => elegida().crearOCuentaRecuperar(...a);
export const cambiarClave: CuentasDeServidor["cambiarClave"] = (...a) => elegida().cambiarClave(...a);
