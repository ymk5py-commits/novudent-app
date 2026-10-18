/** El backend de la app: lo que usan la tienda y las pantallas para hablar con la base y la sesión.
 *
 *  `NEXT_PUBLIC_BACKEND` elige cuál (se fija al compilar): `firestore` (el valor por defecto) o `supabase` (el servidor propio, ver
 *  docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md). Las rutas `/api` eligen la base con la misma variable
 *  (`lib/server/backend.ts`), así la app entera habla con una sola. */
import "../analitica"; // Analytics (gtag.js) solo con consentimiento: no depende de ninguna base, pero tiene que arrancar con la app
import { backendFirestore } from "./firestore";
import { backendSupabase } from "./supabase";
import type { BackendDeDatos } from "./tipos";

export function elegirBackend(nombre: string | undefined): BackendDeDatos {
  const n = (nombre ?? "").trim().toLowerCase();
  if (n === "" || n === "firestore") return backendFirestore;
  if (n === "supabase") return backendSupabase;
  throw new Error(`NEXT_PUBLIC_BACKEND desconocido: «${nombre}». Valores válidos: firestore, supabase.`);
}

/** El backend elegido. (No se llama `backend` porque la tienda ya expone `backend` como el estado de la conexión: «connecting» | «firebase» | «local».) */
export const backendDeDatos: BackendDeDatos = elegirBackend(process.env.NEXT_PUBLIC_BACKEND);
