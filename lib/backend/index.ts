/** El backend de la app: lo que usan la tienda y las pantallas para hablar con la base y la sesión.
 *
 *  `NEXT_PUBLIC_BACKEND` elige cuál (se fija al compilar). Por defecto `firestore`. `supabase` todavía no existe: lo trae el adaptador de la
 *  parte P3 del plan del servidor propio (docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md). */
import { backendFirestore } from "./firestore";
import type { BackendDeDatos } from "./tipos";

export function elegirBackend(nombre: string | undefined): BackendDeDatos {
  const n = (nombre ?? "").trim().toLowerCase();
  if (n === "" || n === "firestore") return backendFirestore;
  if (n === "supabase") throw new Error("NEXT_PUBLIC_BACKEND=supabase todavía no está disponible: falta el adaptador de Supabase (parte P3 del plan del servidor propio).");
  throw new Error(`NEXT_PUBLIC_BACKEND desconocido: «${nombre}». Valores válidos: firestore.`);
}

/** El backend elegido. (No se llama `backend` porque la tienda ya expone `backend` como el estado de la conexión: «connecting» | «firebase» | «local».) */
export const backendDeDatos: BackendDeDatos = elegirBackend(process.env.NEXT_PUBLIC_BACKEND);
